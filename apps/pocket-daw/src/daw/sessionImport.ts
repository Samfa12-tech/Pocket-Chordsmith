import { MAX_DAW_TEMPO_BPM, MIN_DAW_TEMPO_BPM, ensureProjectAutomationLane, setAutomationLanePoints } from "./automation";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "./audioClips";
import { cloneProject, createMediaOnlyPocketDawProject } from "./dawProject";
import { importMidiFileToProjectWithPlacement } from "./midiClips";
import { parseStandardMidiFile, type ParsedMidiFile, type ParsedMidiNote } from "./midiParser";
import { updateMediaPoolItem } from "./mediaPool";
import type { JsonObject, PocketDawProject } from "./schema";

export type SessionSourceFormat = "stems" | "midi" | "ableton-live" | "dawproject" | "aaf" | "unknown";

export interface SessionImportAudioAsset {
  name: string;
  role?: string;
  uri: string;
  mimeType?: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes?: number;
  checksum?: string;
  pcmChecksum?: string;
  sourceFormat: SessionSourceFormat;
  sourcePath?: string;
  sourceEntry?: string;
  metadata?: JsonObject;
}

export interface SessionImportMidiAsset {
  name: string;
  role?: string;
  uri?: string;
  bytes: ArrayBuffer | Uint8Array | number[];
  sizeBytes?: number;
  checksum?: string;
  sourceFormat: SessionSourceFormat;
  sourcePath?: string;
  sourceEntry?: string;
  metadata?: JsonObject;
}

export interface SessionImportBeatNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  channel?: number;
}

export interface SessionImportNoteTrack {
  name: string;
  role?: string;
  notes: SessionImportBeatNote[];
  sourceFormat: SessionSourceFormat;
  sourcePath?: string;
  sourceEntry?: string;
  ppq?: number;
  metadata?: JsonObject;
}

export interface SessionImportBundle {
  title: string;
  sourcePaths: string[];
  formats: SessionSourceFormat[];
  audioAssets: SessionImportAudioAsset[];
  midiAssets: SessionImportMidiAsset[];
  noteTracks: SessionImportNoteTrack[];
  fixedTempoBpm?: number;
  warnings?: string[];
  checksum?: string;
  importedAt?: string;
}

export interface SessionImportBinding<T> {
  mediaPoolItemId: string;
  trackId: string;
  clipId: string;
  asset: T;
}

export interface SessionImportReport {
  title: string;
  formats: SessionSourceFormat[];
  audioTrackCount: number;
  midiTrackCount: number;
  tempoEventCount: number;
  tempoSource: string | null;
  duplicateAudioCount: number;
  discardedMidiCount: number;
  warnings: string[];
}

export interface BuildSessionImportResult {
  project: PocketDawProject;
  audioBindings: Array<SessionImportBinding<SessionImportAudioAsset>>;
  midiBindings: Array<SessionImportBinding<SessionImportMidiAsset | SessionImportNoteTrack>>;
  report: SessionImportReport;
}

export interface SessionImportHydrationFailure {
  mediaPoolItemId: string;
  assetName: string;
  message: string;
}

interface ParsedMidiCandidate {
  asset: SessionImportMidiAsset | SessionImportNoteTrack;
  parsed: ParsedMidiFile;
  role: string;
  priority: number;
  label: string;
}

interface TempoCandidate {
  label: string;
  ppq: number;
  priority: number;
  hasNotes: boolean;
  sourceEventCount: number;
  events: Array<{ tick: number; bpm: number }>;
}

interface MidiSelection {
  selected: ParsedMidiCandidate[];
  tempoCandidates: ParsedMidiCandidate[];
  discardedCount: number;
}

const ROLE_ORDER = ["bass", "drums", "guitar", "other", "synth", "vocal"] as const;
const ROLE_COLOURS: Record<string, string> = {
  bass: "#55d98a",
  drums: "#5bb8ff",
  guitar: "#c984ff",
  other: "#ff5ee8",
  synth: "#ff736a",
  vocal: "#ff9a4a"
};

export function buildSessionImportProject(bundle: SessionImportBundle): BuildSessionImportResult {
  const importedAt = bundle.importedAt || new Date().toISOString();
  const warnings = dedupeStrings(bundle.warnings || []);
  const formats = uniqueFormats(bundle.formats);
  if (formats.some((format) => format === "ableton-live" || format === "dawproject")) {
    warnings.push("Ableton Live and DAWproject audio is treated as consolidated zero-origin stems; clip offsets, fades, loops, mixer settings, plug-ins and automation are not reconstructed.");
  }
  const audioSelection = selectAudioAssets(bundle.audioAssets, warnings);
  const midiSelection = selectMidiCandidates(bundle, warnings);
  const tempo = selectTempoCandidate(midiSelection.tempoCandidates, warnings, bundle.fixedTempoBpm);
  let project = createMediaOnlyPocketDawProject(bundle.title);

  if (tempo?.events.length) {
    const ensured = ensureProjectAutomationLane(project, "tempo");
    const effectiveTempoEvents = collapseUnchangedTempoEvents(dedupeTempoEvents(tempo.events));
    const points = effectiveTempoEvents.map((event) => ({
      bar: roundSix(1 + event.tick / (Math.max(1, tempo.ppq) * 4)),
      value: clamp(event.bpm, MIN_DAW_TEMPO_BPM, MAX_DAW_TEMPO_BPM),
      curve: "hold" as const
    }));
    const initialBpm = points[0]?.value || 120;
    if (points.some((point, index) => point.value !== effectiveTempoEvents[index]?.bpm)) {
      warnings.push(`Tempo values outside ${MIN_DAW_TEMPO_BPM}-${MAX_DAW_TEMPO_BPM} BPM were clamped to Pocket DAW's project-tempo range.`);
    }
    project = setAutomationLanePoints(ensured.project, ensured.laneId, points);
    project.project.bpm = initialBpm;
  } else if (isPositiveFinite(bundle.fixedTempoBpm)) {
    project.project.bpm = clamp(Number(bundle.fixedTempoBpm), MIN_DAW_TEMPO_BPM, MAX_DAW_TEMPO_BPM);
  }

  const audioBindings: Array<SessionImportBinding<SessionImportAudioAsset>> = [];
  const audioRoleCounts = countRoles(audioSelection.assets, (asset) => sessionRole(asset.role, asset.name));
  const audioRoleIndexes = new Map<string, number>();
  for (const asset of audioSelection.assets) {
    const role = sessionRole(asset.role, asset.name);
    const trackLabel = importedTrackLabel(role, asset.name, audioRoleCounts, audioRoleIndexes);
    const added = addImportedAudioMedia(project, {
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType || "audio/wav",
      durationSeconds: positiveNumber(asset.durationSeconds, 0),
      sampleRate: positiveInteger(asset.sampleRate, project.project.sampleRate),
      channels: positiveInteger(asset.channels, 2),
      sizeBytes: positiveInteger(asset.sizeBytes, 0) || undefined,
      metadata: sessionMediaMetadata(asset, role, importedAt)
    });
    project = updateMediaPoolItem(added.project, added.item.id, {
      checksum: asset.pcmChecksum || asset.checksum,
      metadata: sessionMediaMetadata(asset, role, importedAt)
    });
    const placed = placeAudioClipOnTimeline(project, added.item.id, 1);
    project = placed.project;
    const track = project.tracks.find((item) => item.id === placed.trackId);
    const clip = project.timeline.clips.find((item) => item.id === placed.clipId);
    if (track) {
      track.name = trackLabel;
      track.volume = 0.82;
      track.colour = ROLE_COLOURS[role] || track.colour;
      track.metadata = {
        ...(track.metadata || {}),
        sessionImportRole: role,
        sessionImportFormat: asset.sourceFormat,
        sessionImportAudibleDefault: true
      };
    }
    if (clip) {
      clip.name = `${trackLabel} stem`;
      clip.color = ROLE_COLOURS[role] || clip.color;
      clip.metadata = {
        ...(clip.metadata || {}),
        sessionImportRole: role,
        sessionImportFormat: asset.sourceFormat,
        sourcePcmChecksum: asset.pcmChecksum || null
      };
    }
    audioBindings.push({ mediaPoolItemId: added.item.id, trackId: placed.trackId, clipId: placed.clipId, asset });
  }

  const midiBindings: Array<SessionImportBinding<SessionImportMidiAsset | SessionImportNoteTrack>> = [];
  const midiRoleCounts = countRoles(midiSelection.selected, (candidate) => candidate.role);
  const midiRoleIndexes = new Map<string, number>();
  for (const candidate of midiSelection.selected) {
    const trackLabel = importedTrackLabel(candidate.role, candidate.label, midiRoleCounts, midiRoleIndexes);
    const imported = importMidiFileToProjectWithPlacement(project, candidate.parsed, `${roleLabel(candidate.role)} MIDI`, {
      uri: "uri" in candidate.asset ? candidate.asset.uri : undefined,
      sizeBytes: "sizeBytes" in candidate.asset ? candidate.asset.sizeBytes : undefined,
      placementMode: "single-clip",
      reuseExistingMidiTrack: false
    });
    project = updateMediaPoolItem(imported.project, imported.item.id, {
      checksum: "checksum" in candidate.asset ? candidate.asset.checksum : undefined,
      metadata: {
        sessionImportRole: candidate.role,
        sessionImportFormat: candidate.asset.sourceFormat,
        sessionImportReferenceMuted: true,
        sessionImportSourcePath: candidate.asset.sourcePath || "",
        sessionImportSourceEntry: candidate.asset.sourceEntry || ""
      }
    });
    const track = project.tracks.find((item) => item.id === imported.primaryTrackId);
    const clip = project.timeline.clips.find((item) => item.id === imported.primaryClipId);
    if (track) {
      track.name = `${trackLabel} MIDI (reference)`;
      track.mute = true;
      track.colour = ROLE_COLOURS[candidate.role] || track.colour;
      track.metadata = {
        ...(track.metadata || {}),
        sessionImportRole: candidate.role,
        sessionImportFormat: candidate.asset.sourceFormat,
        sessionImportReferenceMuted: true
      };
    }
    if (clip) {
      clip.name = `${trackLabel} MIDI`;
      clip.color = ROLE_COLOURS[candidate.role] || clip.color;
      clip.metadata = {
        ...(clip.metadata || {}),
        sessionImportRole: candidate.role,
        sessionImportFormat: candidate.asset.sourceFormat,
        sessionImportReferenceMuted: true
      };
    }
    midiBindings.push({
      mediaPoolItemId: imported.item.id,
      trackId: imported.primaryTrackId || "",
      clipId: imported.primaryClipId || "",
      asset: candidate.asset
    });
  }

  appendAlignmentWarnings(project, audioSelection.assets, midiSelection.selected, tempo, warnings);
  project.timeline.markers = [{
    id: "marker_session_import",
    bar: 1,
    name: "Imported Session",
    color: "#61d9ff",
    markerType: "section"
  }];
  project.timeline.loop = { enabled: false, startBar: 1, endBar: Math.max(2, project.timeline.bars + 1) };
  project.project.meterMap = [];
  const sourceRefId = "src_daw_session_001";
  const report: SessionImportReport = {
    title: project.project.title,
    formats,
    audioTrackCount: audioBindings.length,
    midiTrackCount: midiBindings.length,
    tempoEventCount: tempo?.sourceEventCount || 0,
    tempoSource: tempo?.label || (isPositiveFinite(bundle.fixedTempoBpm) ? "session fixed tempo" : null),
    duplicateAudioCount: audioSelection.duplicateCount,
    discardedMidiCount: midiSelection.discardedCount,
    warnings: dedupeStrings(warnings)
  };
  project.sourceRefs = [{
    id: sourceRefId,
    sourceType: "daw-session",
    importedAt,
    title: project.project.title,
    checksum: bundle.checksum,
    original: {
      sourcePaths: bundle.sourcePaths,
      formats,
      audioAssetCount: bundle.audioAssets.length,
      midiAssetCount: bundle.midiAssets.length,
      noteTrackCount: bundle.noteTracks.length
    },
    normalized: reportAsJson(report),
    notes: report.warnings
  }];
  project.timeline.clips.forEach((clip) => {
    clip.sourceRefId = sourceRefId;
  });
  project.importHistory = [{
    id: "import_daw_session_001",
    sourceRefId,
    importedAt,
    importKind: "daw-session",
    message: `Imported ${report.audioTrackCount} audio stem${report.audioTrackCount === 1 ? "" : "s"} and ${report.midiTrackCount} muted editable MIDI reference track${report.midiTrackCount === 1 ? "" : "s"}.`,
    conversion: reportAsJson(report)
  }];

  return { project, audioBindings, midiBindings, report };
}

export function recordSessionImportHydrationFailures(
  project: PocketDawProject,
  failures: SessionImportHydrationFailure[]
): PocketDawProject {
  if (!failures.length) return project;
  const next = cloneProject(project);
  const warnings = failures.map((failure) => `${failure.assetName}: ${failure.message}`);
  for (const failure of failures) {
    const item = next.mediaPool.find((entry) => entry.id === failure.mediaPoolItemId);
    if (!item) continue;
    item.metadata = {
      ...(item.metadata || {}),
      missing: true,
      unresolved: true,
      missingReason: failure.message,
      sessionImportHydrationFailed: true
    };
  }
  next.sourceRefs.forEach((sourceRef) => {
    if (sourceRef.sourceType !== "daw-session") return;
    sourceRef.notes = dedupeStrings([...(sourceRef.notes || []), ...warnings]);
    sourceRef.normalized = {
      ...asJsonObject(sourceRef.normalized),
      hydrationWarnings: warnings,
      partialAudioLoad: true
    };
  });
  next.importHistory.forEach((entry) => {
    if (entry.importKind !== "daw-session") return;
    entry.conversion = {
      ...(entry.conversion || {}),
      hydrationWarnings: warnings,
      partialAudioLoad: true
    };
  });
  return next;
}

function selectAudioAssets(assets: SessionImportAudioAsset[], warnings: string[]): { assets: SessionImportAudioAsset[]; duplicateCount: number } {
  const sorted = assets.slice().sort((a, b) => audioPriority(a.sourceFormat) - audioPriority(b.sourceFormat) || roleIndex(sessionRole(a.role, a.name)) - roleIndex(sessionRole(b.role, b.name)) || a.name.localeCompare(b.name));
  const selected = new Map<string, SessionImportAudioAsset>();
  let duplicateCount = 0;
  for (const asset of sorted) {
    if (!asset.uri || !isPositiveFinite(asset.durationSeconds) || !isPositiveFinite(asset.sampleRate) || !isPositiveFinite(asset.channels)) {
      warnings.push(`Skipped invalid audio asset ${asset.name || "(unnamed)"}.`);
      continue;
    }
    const role = sessionRole(asset.role, asset.name);
    const contentKey = asset.pcmChecksum || asset.checksum;
    const key = contentKey ? `content:${contentKey.toLowerCase()}` : `asset:${role}:${asset.uri.toLowerCase()}`;
    if (selected.has(key)) {
      duplicateCount += 1;
      continue;
    }
    selected.set(key, asset);
  }
  return {
    assets: [...selected.values()].sort((a, b) => roleIndex(sessionRole(a.role, a.name)) - roleIndex(sessionRole(b.role, b.name)) || a.name.localeCompare(b.name)),
    duplicateCount
  };
}

function selectMidiCandidates(bundle: SessionImportBundle, warnings: string[]): MidiSelection {
  const parsed: ParsedMidiCandidate[] = [];
  const tempoCandidates: ParsedMidiCandidate[] = [];
  for (const asset of bundle.midiAssets) {
    try {
      const midi = parseStandardMidiFile(toUint8Array(asset.bytes));
      const role = sessionRole(asset.role, asset.name);
      const candidate = { asset, parsed: midi, role, priority: midiPriority(asset.sourceFormat, true), label: asset.name };
      tempoCandidates.push(candidate);
      if (!midi.notes.length) {
        warnings.push(`${asset.name} contains no MIDI notes; Pocket DAW kept any valid tempo or meter metadata but did not create an editable reference track.`);
        continue;
      }
      parsed.push(candidate);
    } catch (error) {
      warnings.push(`Could not parse ${asset.name}: ${error instanceof Error ? error.message : "invalid MIDI"}`);
    }
  }
  for (const track of bundle.noteTracks) {
    if (!track.notes.length) continue;
    const role = sessionRole(track.role, track.name);
    const candidate = {
      asset: track,
      parsed: parsedMidiFromBeatTrack(track),
      role,
      priority: midiPriority(track.sourceFormat, false),
      label: track.name
    };
    parsed.push(candidate);
    tempoCandidates.push(candidate);
  }
  parsed.sort((a, b) => a.priority - b.priority || roleIndex(a.role) - roleIndex(b.role) || a.label.localeCompare(b.label));
  const selected: ParsedMidiCandidate[] = [];
  const exactRepresentations = new Set<string>();
  const logicalRepresentations = new Map<string, ParsedMidiCandidate>();
  let discardedCount = 0;
  for (const candidate of parsed) {
    const digest = noteDigest(candidate.parsed);
    const exactKey = `${candidate.role}:${digest}`;
    if (exactRepresentations.has(exactKey)) {
      discardedCount += 1;
      continue;
    }
    const logicalKey = `${candidate.role}:${sourceIdentity(candidate.label)}`;
    const existing = logicalRepresentations.get(logicalKey);
    if (existing) {
      discardedCount += 1;
      if (noteDigest(existing.parsed) !== digest) {
        warnings.push(`Conflicting representations of ${existing.label} were found; Pocket DAW preferred the highest-priority session source.`);
      }
      continue;
    }
    exactRepresentations.add(exactKey);
    logicalRepresentations.set(logicalKey, candidate);
    selected.push(candidate);
  }
  return {
    selected: selected.sort((a, b) => roleIndex(a.role) - roleIndex(b.role) || a.label.localeCompare(b.label)),
    tempoCandidates,
    discardedCount
  };
}

function selectTempoCandidate(candidates: ParsedMidiCandidate[], warnings: string[], fixedTempoBpm?: number): TempoCandidate | null {
  const tempos = candidates.map((candidate) => {
    const events = dedupeTempoEvents(tempoEvents(candidate.parsed));
    return {
      label: candidate.label,
      ppq: candidate.parsed.ppq,
      priority: candidate.priority,
      hasNotes: candidate.parsed.notes.length > 0,
      sourceEventCount: events.length,
      events
    };
  }).filter((candidate) => candidate.events.length > 0)
    .sort((a, b) => Number(b.hasNotes) - Number(a.hasNotes) || b.sourceEventCount - a.sourceEventCount || a.priority - b.priority || a.label.localeCompare(b.label));
  if (!tempos.length) return null;
  const selected = tempos[0]!;
  const selectedDigest = tempoDigest(selected);
  const conflicting = tempos.some((candidate) => tempoDigest(candidate) !== selectedDigest);
  if (conflicting) warnings.push(`Imported MIDI files contain conflicting tempo maps; Pocket DAW used ${selected.label}, the most complete map.`);
  if (selected.events[0]!.tick > 0) {
    selected.events.unshift({ tick: 0, bpm: clamp(Number(fixedTempoBpm) || 120, MIN_DAW_TEMPO_BPM, MAX_DAW_TEMPO_BPM) });
    warnings.push(`${selected.label}'s first tempo event occurs after the song starts; Pocket DAW used ${selected.events[0]!.bpm} BPM before that event.`);
  }
  return selected;
}

function tempoEvents(parsed: ParsedMidiFile): Array<{ tick: number; bpm: number }> {
  const raw = parsed.metadata?.tempoEvents;
  if (!Array.isArray(raw)) return [];
  return raw.map((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    const item = event as JsonObject;
    const tick = Number(item.tick);
    const bpm = Number(item.bpm);
    return Number.isFinite(tick) && tick >= 0 && Number.isFinite(bpm) && bpm > 0 ? { tick: Math.round(tick), bpm: roundSix(bpm) } : null;
  }).filter((event): event is { tick: number; bpm: number } => !!event)
    .sort((a, b) => a.tick - b.tick || a.bpm - b.bpm);
}

function dedupeTempoEvents(events: Array<{ tick: number; bpm: number }>): Array<{ tick: number; bpm: number }> {
  const byTick = new Map<number, { tick: number; bpm: number }>();
  events.forEach((event) => byTick.set(event.tick, event));
  return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

function collapseUnchangedTempoEvents(events: Array<{ tick: number; bpm: number }>): Array<{ tick: number; bpm: number }> {
  return events.filter((event, index) => index === 0 || event.bpm !== events[index - 1]?.bpm);
}

function parsedMidiFromBeatTrack(track: SessionImportNoteTrack): ParsedMidiFile {
  const ppq = positiveInteger(track.ppq, 960);
  const notes: ParsedMidiNote[] = track.notes.map((note, index) => ({
    id: `note_${index + 1}`,
    pitch: clamp(Math.round(Number(note.pitch) || 0), 0, 127),
    startTick: Math.max(0, Math.round(positiveNumber(note.startBeat, 0) * ppq)),
    durationTicks: Math.max(1, Math.round(positiveNumber(note.durationBeats, 0) * ppq)),
    velocity: clamp(Math.round(Number(note.velocity) || 1), 1, 127),
    channel: clamp(Math.round(Number(note.channel) || 0), 0, 15),
    trackIndex: 0
  })).sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.durationTicks - b.durationTicks);
  return {
    format: 1,
    ppq,
    tempoBpm: undefined,
    timeSig: 4,
    trackNames: [track.name],
    notes,
    controllers: [],
    programChanges: [],
    pitchBends: [],
    aftertouch: [],
    metadata: {
      ppq,
      source: `${track.sourceFormat}-session-notes`,
      noteCount: notes.length,
      ...(track.metadata || {})
    }
  };
}

function appendAlignmentWarnings(
  project: PocketDawProject,
  audio: SessionImportAudioAsset[],
  midi: ParsedMidiCandidate[],
  tempo: TempoCandidate | null,
  warnings: string[]
) {
  const meterEvents = midi.flatMap((candidate) => Array.isArray(candidate.parsed.metadata?.timeSignatureEvents) ? candidate.parsed.metadata.timeSignatureEvents : []);
  const hasNonFourFour = meterEvents.some((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) return false;
    return Number((event as JsonObject).numerator) !== 4 || Number((event as JsonObject).denominator) !== 4;
  });
  if (hasNonFourFour) warnings.push("Imported MIDI meter metadata is inconsistent with the session; Pocket DAW kept the project in 4/4 and preserved the original meter events as MIDI metadata.");
  if (tempo || !audio.length || !midi.length) return;
  const audioSeconds = Math.max(...audio.map((asset) => positiveNumber(asset.durationSeconds, 0)));
  const noteBeats = Math.max(...midi.map((candidate) => candidate.parsed.notes.reduce((max, note) => Math.max(max, (note.startTick + note.durationTicks) / candidate.parsed.ppq), 0)));
  const midiSeconds = noteBeats * 60 / Math.max(1, project.project.bpm);
  if (Math.abs(midiSeconds - audioSeconds) > 2) {
    warnings.push(`Session note timing at ${roundSix(project.project.bpm)} BPM differs from the audio duration by ${roundSix(Math.abs(midiSeconds - audioSeconds))} seconds. MIDI is muted by default; import the companion tempo-map MIDI files with this session for exact audio alignment.`);
  }
}

function sessionMediaMetadata(asset: SessionImportAudioAsset, role: string, importedAt: string): JsonObject {
  return {
    external: true,
    mediaRefKind: "external",
    originalUri: asset.uri,
    unresolved: false,
    missing: false,
    waveformPeaks: [],
    importMode: "native-session",
    sessionImportRole: role,
    sessionImportFormat: asset.sourceFormat,
    sessionImportSourcePath: asset.sourcePath || "",
    sessionImportSourceEntry: asset.sourceEntry || "",
    sessionImportPcmChecksum: asset.pcmChecksum || "",
    sessionImportChecksum: asset.checksum || "",
    sessionImportedAt: importedAt,
    ...(asset.metadata || {})
  };
}

function reportAsJson(report: SessionImportReport): JsonObject {
  return {
    title: report.title,
    formats: report.formats,
    audioTrackCount: report.audioTrackCount,
    midiTrackCount: report.midiTrackCount,
    tempoEventCount: report.tempoEventCount,
    tempoSource: report.tempoSource,
    duplicateAudioCount: report.duplicateAudioCount,
    discardedMidiCount: report.discardedMidiCount,
    warnings: report.warnings
  };
}

function sessionRole(explicit: string | undefined, name: string): string {
  const value = `${explicit || ""} ${name || ""}`.toLowerCase();
  if (/\bdrums?\b/.test(value)) return "drums";
  if (/\bbass\b/.test(value)) return "bass";
  if (/\bguitars?\b/.test(value)) return "guitar";
  if (/\b(vocals?|voice)\b/.test(value)) return "vocal";
  if (/\b(synths?|keys?|keyboard)\b/.test(value)) return "synth";
  if (/\bother\b/.test(value)) return "other";
  const cleaned = (explicit || name || "media").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return cleaned || "media";
}

function roleLabel(role: string): string {
  return role.split(/[-_\s]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`).join(" ") || "Media";
}

function sourceIdentity(name: string): string {
  return name.replace(/\\/g, "/").split("/").pop()!.replace(/\.(wav|aif|aiff|flac|mid|midi)$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "media";
}

function countRoles<T>(items: T[], role: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = role(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function importedTrackLabel(role: string, sourceName: string, counts: Map<string, number>, indexes: Map<string, number>): string {
  const base = roleLabel(role);
  const total = counts.get(role) || 1;
  if (total <= 1) return base;
  const index = (indexes.get(role) || 0) + 1;
  indexes.set(role, index);
  const source = roleLabel(sourceIdentity(sourceName));
  return source.toLowerCase() === base.toLowerCase() ? `${base} ${index}` : `${base} ${index} — ${source}`;
}

function roleIndex(role: string): number {
  const index = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
  return index >= 0 ? index : ROLE_ORDER.length;
}

function audioPriority(format: SessionSourceFormat): number {
  if (format === "stems") return 0;
  if (format === "dawproject") return 1;
  if (format === "ableton-live") return 2;
  if (format === "aaf") return 3;
  return 4;
}

function midiPriority(format: SessionSourceFormat, rawMidi: boolean): number {
  if (rawMidi && format === "midi") return 0;
  if (rawMidi) return 1;
  if (format === "dawproject") return 2;
  if (format === "ableton-live") return 3;
  if (format === "aaf") return 4;
  return 5;
}

function noteDigest(parsed: ParsedMidiFile): string {
  return parsed.notes.map((note) => `${note.startTick}:${note.durationTicks}:${note.pitch}:${note.velocity}:${note.channel || 0}`).join("|");
}

function tempoDigest(candidate: TempoCandidate): string {
  return `${candidate.ppq}|${candidate.events.map((event) => `${event.tick}:${event.bpm}`).join("|")}`;
}

function uniqueFormats(formats: SessionSourceFormat[]): SessionSourceFormat[] {
  return [...new Set(formats)].sort((a, b) => formatPriority(a) - formatPriority(b) || a.localeCompare(b));
}

function formatPriority(format: SessionSourceFormat): number {
  return ["stems", "midi", "ableton-live", "dawproject", "aaf", "unknown"].indexOf(format);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function toUint8Array(bytes: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes);
}

function isPositiveFinite(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function roundSix(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
