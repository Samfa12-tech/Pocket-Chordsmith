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
  return ensureProjectFx(ensureStarterChordsmithSource(migrated));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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
