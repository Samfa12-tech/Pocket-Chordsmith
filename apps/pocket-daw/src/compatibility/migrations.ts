import { createDefaultExportProfiles } from "../daw/exportProfiles";
import { createDefaultAudioDeviceSettings, ensureStarterChordsmithSource } from "../daw/dawProject";
import { createDefaultFxState, ensureProjectFx } from "../daw/fx";
import { createDefaultTracks } from "../daw/tracks";
import {
  POCKET_DAW_APP,
  POCKET_DAW_SCHEMA_VERSION,
  POCKET_DAW_VERSION,
  type PocketDawProject
} from "../daw/schema";

const TRACK_TYPES = ["generated", "midi", "audio", "bus", "return", "master"] as const;
const TRACK_ROLES = ["arrangement", "drums", "bass", "chords", "melody", "guitar", "fx-return", "master", "bus", "media", "automation"] as const;
const CLIP_TYPES = ["generated-section", "generated-pattern", "midi", "audio", "automation", "marker"] as const;
const MEDIA_KINDS = ["audio", "midi", "render", "image", "unknown"] as const;
const MARKER_TYPES = ["section", "cue", "loop", "export", "game-state"] as const;
const AUTOMATION_UNITS = ["linear", "db", "hz", "percent", "boolean"] as const;
const AUTOMATION_CURVES = ["linear", "hold", "ease-in", "ease-out"] as const;

export function migratePocketDawProject(raw: unknown): PocketDawProject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Pocket DAW project data must be a JSON object.");
  }
  const source = raw as Partial<PocketDawProject> & Record<string, unknown>;
  if (source.app !== POCKET_DAW_APP) {
    throw new Error("That JSON file is not a Pocket DAW project.");
  }
  const tracks = Array.isArray(source.tracks) && source.tracks.length ? source.tracks : createDefaultTracks();
  const migrated: PocketDawProject = {
    ...source,
    app: POCKET_DAW_APP,
    schemaVersion: Number(source.schemaVersion || 1),
    dawVersion: String(source.dawVersion || POCKET_DAW_VERSION),
    sourceRefs: Array.isArray(source.sourceRefs) ? source.sourceRefs : [],
    project: {
      ...(isRecord(source.project) ? source.project : {}),
      id: String(source.project?.id || "project_001"),
      title: String(source.project?.title || "Imported Chordsmith Song"),
      bpm: clampNumber(source.project?.bpm, 40, 240, 118),
      key: String(source.project?.key || "C"),
      scale: String(source.project?.scale || "major"),
      timeSig: clampNumber(source.project?.timeSig, 2, 7, 4),
      swing: clampNumber(source.project?.swing, 0, 0.35, 0),
      resolution: clampNumber(source.project?.resolution, 1, 16, 4),
      sampleRate: clampNumber(source.project?.sampleRate, 22050, 96000, 44100),
      ppq: clampNumber(source.project?.ppq, 96, 1920, 480)
    },
    timeline: {
      ...(isRecord(source.timeline) ? source.timeline : {}),
      bars: clampNumber(source.timeline?.bars, 1, 4096, 32),
      cursor: source.timeline?.cursor || { bar: 1, beat: 1, tick: 0 },
      loop: source.timeline?.loop || { enabled: false, startBar: 1, endBar: 9 },
      markers: Array.isArray(source.timeline?.markers) ? source.timeline.markers : [],
      clips: Array.isArray(source.timeline?.clips) ? source.timeline.clips : []
    },
    tracks,
    automation: source.automation || { lanes: [] },
    routing: source.routing || { masterTrackId: "master", buses: [], returns: [] },
    mediaPool: Array.isArray(source.mediaPool) ? source.mediaPool : [],
    renderCache: Array.isArray(source.renderCache) ? source.renderCache : [],
    fx: source.fx && Array.isArray(source.fx.chains) ? source.fx : createDefaultFxState(tracks),
    audioDeviceSettings: {
      ...createDefaultAudioDeviceSettings(),
      ...(source.audioDeviceSettings && typeof source.audioDeviceSettings === "object" ? source.audioDeviceSettings : {})
    },
    mixer: source.mixer || { masterLimiter: true, meterMode: "peak" },
    exportProfiles: mergeExportProfiles(Array.isArray(source.exportProfiles) ? source.exportProfiles : []),
    importHistory: Array.isArray(source.importHistory) ? source.importHistory : []
  };
  migrated.schemaVersion = POCKET_DAW_SCHEMA_VERSION;
  return ensureProjectFx(ensureStarterChordsmithSource(normalizeLoadedProject(migrated)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeLoadedProject(project: PocketDawProject): PocketDawProject {
  const next = JSON.parse(JSON.stringify(project)) as PocketDawProject;
  const defaultTracks = createDefaultTracks();
  const trackIdMap = new Map<string, string>();
  const mediaIdMap = new Map<string, string>();
  const clipIdMap = new Map<string, string>();
  const laneIdMap = new Map<string, string>();
  const usedTrackIds = new Set<string>();
  const usedMediaIds = new Set<string>();
  const usedClipIds = new Set<string>();
  const usedLaneIds = new Set<string>();

  next.tracks = (Array.isArray(next.tracks) && next.tracks.length ? next.tracks : defaultTracks).map((track, index) => {
    const fallback = defaultTracks[index] || defaultTracks[0];
    const originalId = String(track?.id || fallback.id || `track_${index + 1}`);
    const id = uniqueSafeId(originalId, `track_${index + 1}`, usedTrackIds);
    trackIdMap.set(originalId, id);
    return {
      ...fallback,
      ...(isRecord(track) ? track : {}),
      id,
      name: safeText(track?.name, fallback.name || id),
      trackType: safeEnum(track?.trackType, TRACK_TYPES, fallback.trackType),
      role: safeEnum(track?.role, TRACK_ROLES, fallback.role),
      volume: clampNumber(track?.volume, 0, 1.2, fallback.volume ?? 1),
      pan: clampNumber(track?.pan, -1, 1, fallback.pan ?? 0),
      mute: track?.mute === true,
      solo: track?.solo === true,
      armed: track?.armed === true,
      colour: safeColour(track?.colour, fallback.colour || "#40d8ff"),
      routing: normalizeTrackRouting(track?.routing, trackIdMap),
      automationLaneIds: Array.isArray(track?.automationLaneIds) ? track.automationLaneIds.map(String).filter(Boolean) : [],
      active: track?.active === false ? false : true,
      metadata: isRecord(track?.metadata) ? track.metadata : undefined
    };
  });

  const trackIds = new Set(next.tracks.map((track) => track.id));
  const fallbackTrackId = next.tracks.find((track) => track.role !== "master")?.id || next.tracks[0]?.id || "drums";

  next.mediaPool = (Array.isArray(next.mediaPool) ? next.mediaPool : []).map((item, index) => {
    const originalId = String(item?.id || `media_${index + 1}`);
    const id = uniqueSafeId(originalId, `media_${index + 1}`, usedMediaIds);
    mediaIdMap.set(originalId, id);
    return {
      ...(isRecord(item) ? item : {}),
      id,
      kind: safeEnum(item?.kind, MEDIA_KINDS, "unknown"),
      name: safeText(item?.name, `Media ${index + 1}`),
      uri: item?.uri === undefined ? undefined : safeText(item.uri, ""),
      mimeType: item?.mimeType === undefined ? undefined : safeText(item.mimeType, ""),
      durationSeconds: optionalClampNumber(item?.durationSeconds, 0, 60 * 60),
      sampleRate: optionalClampNumber(item?.sampleRate, 8000, 192000),
      channels: optionalClampNumber(item?.channels, 1, 32),
      sizeBytes: optionalClampNumber(item?.sizeBytes, 0, Number.MAX_SAFE_INTEGER),
      checksum: item?.checksum === undefined ? undefined : safeText(item.checksum, ""),
      metadata: isRecord(item?.metadata) ? item.metadata : undefined
    };
  });

  next.timeline = {
    ...next.timeline,
    bars: clampNumber(next.timeline?.bars, 1, 4096, 32),
    cursor: normalizePosition(next.timeline?.cursor),
    loop: {
      enabled: next.timeline?.loop?.enabled === true,
      startBar: clampNumber(next.timeline?.loop?.startBar, 1, 4096, 1),
      endBar: clampNumber(next.timeline?.loop?.endBar, 2, 4097, 9)
    },
    markers: (Array.isArray(next.timeline?.markers) ? next.timeline.markers : []).map((marker, index) => ({
      ...(isRecord(marker) ? marker : {}),
      id: uniqueSafeId(marker?.id, `marker_${index + 1}`, new Set()),
      bar: clampNumber(marker?.bar, 1, 4096, 1),
      name: safeText(marker?.name, `Marker ${index + 1}`),
      color: safeColour(marker?.color, "#40d8ff"),
      markerType: safeEnum(marker?.markerType, MARKER_TYPES, "cue")
    })),
    clips: (Array.isArray(next.timeline?.clips) ? next.timeline.clips : []).map((clip, index) => {
      const originalId = String(clip?.id || `clip_${index + 1}`);
      const id = uniqueSafeId(originalId, `clip_${index + 1}`, usedClipIds);
      clipIdMap.set(originalId, id);
      const trackId = mappedId(trackIdMap, clip?.trackId, fallbackTrackId);
      return {
        ...(isRecord(clip) ? clip : {}),
        id,
        type: safeEnum(clip?.type, CLIP_TYPES, "generated-section"),
        trackId: trackIds.has(trackId) ? trackId : fallbackTrackId,
        sourceRefId: clip?.sourceRefId === undefined ? undefined : safeText(clip.sourceRefId, ""),
        sectionId: clip?.sectionId === undefined ? undefined : safeText(clip.sectionId, ""),
        startBar: clampNumber(clip?.startBar, 1, 4096, 1),
        barLength: clampNumber(clip?.barLength, 0.125, 4096, 1),
        name: safeText(clip?.name, `Clip ${index + 1}`),
        muted: clip?.muted === true,
        color: safeColour(clip?.color, "#40d8ff"),
        linked: clip?.linked !== false,
        transforms: normalizeClipTransforms(clip?.transforms),
        lane: optionalClampNumber(clip?.lane, 0, 128),
        noteEventIds: Array.isArray(clip?.noteEventIds) ? clip.noteEventIds.map((id) => safeText(id, "")).filter(Boolean) : undefined,
        mediaPoolItemId: clip?.mediaPoolItemId === undefined ? undefined : mappedId(mediaIdMap, clip.mediaPoolItemId, safeText(clip.mediaPoolItemId, "")),
        automationLaneId: clip?.automationLaneId === undefined ? undefined : safeText(clip.automationLaneId, ""),
        metadata: isRecord(clip?.metadata) ? clip.metadata : undefined
      };
    })
  };
  if (next.timeline.loop.endBar <= next.timeline.loop.startBar) next.timeline.loop.endBar = next.timeline.loop.startBar + 1;
  next.timeline.bars = Math.max(next.timeline.bars, Math.ceil(next.timeline.clips.reduce((end, clip) => Math.max(end, clip.startBar + clip.barLength - 1), 1)));

  next.automation = {
    lanes: (Array.isArray(next.automation?.lanes) ? next.automation.lanes : []).map((lane, index) => {
      const originalId = String(lane?.id || `automation_${index + 1}`);
      const id = uniqueSafeId(originalId, `automation_${index + 1}`, usedLaneIds);
      laneIdMap.set(originalId, id);
      const trackId = lane?.trackId === undefined ? undefined : mappedId(trackIdMap, lane.trackId, safeText(lane.trackId, ""));
      return {
        ...(isRecord(lane) ? lane : {}),
        id,
        trackId: trackId && trackIds.has(trackId) ? trackId : undefined,
        targetPath: safeText(lane?.targetPath, "track.volume"),
        unit: safeEnum(lane?.unit, AUTOMATION_UNITS, "linear"),
        min: optionalClampNumber(lane?.min, -120, 120),
        max: optionalClampNumber(lane?.max, -120, 120),
        points: (Array.isArray(lane?.points) ? lane.points : []).map((point) => ({
          bar: clampNumber(point?.bar, 1, 4096, 1),
          beat: optionalClampNumber(point?.beat, 1, 16),
          tick: optionalClampNumber(point?.tick, 0, 1920),
          value: clampNumber(point?.value, -120, 120, 0),
          curve: safeEnum(point?.curve, AUTOMATION_CURVES, "linear")
        })),
        enabled: lane?.enabled !== false
      };
    })
  };
  next.tracks.forEach((track) => {
    track.automationLaneIds = track.automationLaneIds.map((id) => mappedId(laneIdMap, id, "")).filter(Boolean);
  });
  next.timeline.clips.forEach((clip) => {
    if (clip.automationLaneId) clip.automationLaneId = mappedId(laneIdMap, clip.automationLaneId, clip.automationLaneId);
  });

  next.routing = normalizeRouting(next.routing, trackIdMap, trackIds);
  next.renderCache = (Array.isArray(next.renderCache) ? next.renderCache : []).map((item, index) => ({
    ...(isRecord(item) ? item : {}),
    id: uniqueSafeId(item?.id, `render_cache_${index + 1}`, new Set()),
    sourceClipId: item?.sourceClipId === undefined ? undefined : mappedId(clipIdMap, item.sourceClipId, safeText(item.sourceClipId, "")),
    mediaPoolItemId: item?.mediaPoolItemId === undefined ? undefined : mappedId(mediaIdMap, item.mediaPoolItemId, safeText(item.mediaPoolItemId, "")),
    createdAt: safeText(item?.createdAt, new Date(0).toISOString()),
    invalidated: item?.invalidated === true,
    metadata: isRecord(item?.metadata) ? item.metadata : undefined
  }));
  next.importHistory = Array.isArray(next.importHistory) ? next.importHistory : [];
  return next;
}

function normalizePosition(value: unknown) {
  const source = isRecord(value) ? value : {};
  return {
    bar: clampNumber(source.bar, 1, 4096, 1),
    beat: clampNumber(source.beat, 1, 16, 1),
    tick: clampNumber(source.tick, 0, 1920, 0)
  };
}

function normalizeClipTransforms(value: unknown) {
  const source = isRecord(value) ? value : {};
  return {
    transpose: clampNumber(source.transpose, -48, 48, 0),
    octave: clampNumber(source.octave, -4, 4, 0),
    gain: clampNumber(source.gain, 0, 4, 1),
    stemMutes: isRecord(source.stemMutes)
      ? Object.fromEntries(Object.entries(source.stemMutes).map(([key, enabled]) => [safeId(key, "stem"), enabled === true]))
      : {},
    variationId: source.variationId === undefined ? undefined : safeText(source.variationId, ""),
    freezeRenderId: source.freezeRenderId === undefined ? undefined : safeText(source.freezeRenderId, ""),
    convertToMidiHint: source.convertToMidiHint === true
  };
}

function normalizeTrackRouting(value: unknown, trackIdMap: Map<string, string>) {
  const source = isRecord(value) ? value : {};
  return {
    inputIds: Array.isArray(source.inputIds) ? source.inputIds.map((id) => safeText(id, "")).filter(Boolean) : [],
    outputId: source.outputId === null || source.outputId === undefined ? null : mappedId(trackIdMap, source.outputId, safeText(source.outputId, "")),
    sendIds: Array.isArray(source.sendIds) ? source.sendIds.map((id) => mappedId(trackIdMap, id, safeText(id, ""))).filter(Boolean) : [],
    busId: source.busId === null || source.busId === undefined ? null : mappedId(trackIdMap, source.busId, safeText(source.busId, ""))
  };
}

function normalizeRouting(value: unknown, trackIdMap: Map<string, string>, trackIds: Set<string>) {
  const source = isRecord(value) ? value : {};
  const masterTrackId = mappedId(trackIdMap, source.masterTrackId, "master");
  return {
    masterTrackId: trackIds.has(masterTrackId) ? masterTrackId : "master",
    buses: Array.isArray(source.buses) ? source.buses.map((bus, index) => ({
      id: safeId((bus as Record<string, unknown>)?.id, `bus_${index + 1}`),
      name: safeText((bus as Record<string, unknown>)?.name, `Bus ${index + 1}`),
      trackIds: Array.isArray((bus as Record<string, unknown>)?.trackIds)
        ? ((bus as Record<string, unknown>).trackIds as unknown[]).map((id) => mappedId(trackIdMap, id, "")).filter((id) => trackIds.has(id))
        : [],
      outputId: mappedId(trackIdMap, (bus as Record<string, unknown>)?.outputId, "master")
    })) : [],
    returns: Array.isArray(source.returns) ? source.returns.map((entry, index) => ({
      id: safeId((entry as Record<string, unknown>)?.id, `return_${index + 1}`),
      name: safeText((entry as Record<string, unknown>)?.name, `Return ${index + 1}`),
      outputId: mappedId(trackIdMap, (entry as Record<string, unknown>)?.outputId, "master"),
      effectChainIds: Array.isArray((entry as Record<string, unknown>)?.effectChainIds)
        ? ((entry as Record<string, unknown>).effectChainIds as unknown[]).map((id) => safeText(id, "")).filter(Boolean)
        : undefined
    })) : []
  };
}

function uniqueSafeId(value: unknown, fallback: string, used: Set<string>): string {
  const base = safeId(value, fallback);
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function safeId(value: unknown, fallback: string): string {
  const safe = String(value || "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return safe || fallback;
}

function mappedId(map: Map<string, string>, value: unknown, fallback: string): string {
  const key = String(value || "");
  return map.get(key) || fallback;
}

function safeText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  return text.slice(0, 2000) || fallback;
}

function safeColour(value: unknown, fallback: string): string {
  const colour = String(value || "").trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(colour)) return colour;
  return fallback;
}

function optionalClampNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return clampNumber(value, min, max, min);
}

function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeExportProfiles(existing: PocketDawProject["exportProfiles"]) {
  const defaults = createDefaultExportProfiles();
  const byId = new Map(defaults.map((profile) => [profile.id, profile]));
  existing.forEach((profile) => byId.set(profile.id, { ...byId.get(profile.id), ...profile }));
  return Array.from(byId.values());
}
