import { SECTION_IDS, type SectionId } from "../compatibility/pcsSanitizer";
import { configureFaithfulMidiChordsmithStructure } from "./chordsmithEditor";
import { writeChordOverlayEvents, type ChordOverlayWrite } from "./chordOverlays";
import { deleteClip } from "./clips";
import {
  midiConversionSourceLabel,
  midiNoteMatchesConversionSource,
  type MidiConversionSourceFilter
} from "./midiConversionFilter";
import { midiDataFromClip, type MidiClipData } from "./midiClips";
import { writeMelodyOverlayEvents, type MelodyOverlayWrite } from "./melodyOverlays";
import type { ParsedMidiNote } from "./midiParser";
import type { Clip, JsonObject, PocketDawProject } from "./schema";

export type MidiChordsmithConversionIntent = "faithful-transcription" | "arrange-sketch";
export type MidiConversionFidelity =
  | "lossless within supported model"
  | "quantized but structurally faithful"
  | "simplified"
  | "creative arrangement";
export type MidiConversionRole = "melody" | "chords" | "bass" | "drums" | "guitar";
export type MidiRoleConfidence = "high" | "medium" | "low";

export interface MidiRoleAssignment {
  filter: MidiConversionSourceFilter;
  confidence: MidiRoleConfidence;
  label: string;
  reason: string;
}

export interface MidiRoleAssignments {
  melody: MidiRoleAssignment | null;
  chords: MidiRoleAssignment | null;
  bass: MidiRoleAssignment | null;
  drums: MidiRoleAssignment | null;
  guitar: MidiRoleAssignment | null;
}

export interface MidiSectionPackingPlan {
  sectionBars: Partial<Record<SectionId, number>>;
  songSequence: SectionId[];
  sourceBars: number;
  destinationBars: number;
  paddingBars: number;
  heuristicSubstitutions: number;
  supported?: false;
  reason?: string;
}

export interface MidiResolutionChoice {
  resolution: number;
  exact: boolean;
  maximumErrorTicks: number;
}

export interface MidiFaithfulRolePreview {
  assignment: MidiRoleAssignment | null;
  sourceNoteAttacks: number;
  destinationEvents: number;
  filteredNotes: number;
  mergedNotes: number;
  outOfRangeNotes: number;
}

export interface MidiFaithfulConversionPreview {
  intent: "faithful-transcription";
  clipId: string;
  sourceFileName: string;
  sourcePpq: number;
  tempoBpm: number;
  timeSignature: string;
  key: { key: string; scale: "major" | "minor"; source: "midi-key-signature" | "project" };
  sourceBars: number;
  destinationBars: number;
  resolution: number;
  resolutionExact: boolean;
  maximumQuantizationErrorTicks: number;
  assignments: MidiRoleAssignments;
  roles: Record<MidiConversionRole, MidiFaithfulRolePreview>;
  sectionPacking: MidiSectionPackingPlan;
  generated: { bass: number; drums: number; guitar: number; harmony: number };
  chordCompatibility: "daw-exact-pcs1-simplified" | "none";
  rawReferenceAction: "keep" | "remove";
  fidelity: MidiConversionFidelity;
  applyAllowed: boolean;
  warnings: string[];
}

export interface MidiFaithfulConversionReport {
  intent: "faithful-transcription";
  fidelity: MidiConversionFidelity;
  sourceBars: number;
  destinationBars: number;
  resolution: number;
  sectionBars: Partial<Record<SectionId, number>>;
  songSequence: SectionId[];
  melodyWritten: number;
  chordEventsWritten: number;
  chordNotesWritten: number;
  generated: { bass: number; drums: number; guitar: number; harmony: number };
  rawMidiReferenceKept: boolean;
  pcs1Compatibility: "simplified" | "not-applicable";
  assignments: MidiRoleAssignments | null;
  roles: Record<MidiConversionRole, MidiFaithfulRolePreview> | null;
  warnings: string[];
}

export interface MidiFaithfulConversionOptions {
  assignments?: Partial<MidiRoleAssignments>;
  keepRawReference?: boolean;
  melodyTrackIndex?: number;
}

export interface MidiFaithfulConversionResult {
  project: PocketDawProject;
  applied: boolean;
  report: MidiFaithfulConversionReport;
}

export function packMidiBarsIntoSections(sourceBars: number): MidiSectionPackingPlan {
  const bars = Math.max(1, Math.ceil(Number(sourceBars) || 1));
  if (bars > SECTION_IDS.length * 16) {
    return {
      sectionBars: {},
      songSequence: [],
      sourceBars: bars,
      destinationBars: 0,
      paddingBars: 0,
      heuristicSubstitutions: 0,
      supported: false,
      reason: `Faithful Chordsmith packing supports at most ${SECTION_IDS.length * 16} bars. Keep raw MIDI, split the source, or use arrange mode.`
    };
  }
  const sectionBars: Partial<Record<SectionId, number>> = {};
  const songSequence: SectionId[] = [];
  let remaining = bars;
  for (const sectionId of SECTION_IDS) {
    if (remaining <= 0) break;
    const length = Math.min(16, remaining);
    sectionBars[sectionId] = length;
    songSequence.push(sectionId);
    remaining -= length;
  }
  return {
    sectionBars,
    songSequence,
    sourceBars: bars,
    destinationBars: bars,
    paddingBars: 0,
    heuristicSubstitutions: 0
  };
}

export function chooseMidiConversionResolution(onsets: number[], durations: number[], ppq: number): MidiResolutionChoice {
  const safePpq = Math.max(1, Math.round(Number(ppq) || 480));
  const values = [...onsets, ...durations].filter((value) => Number.isFinite(value)).map((value) => Math.max(0, Number(value)));
  for (const resolution of [1, 2, 4, 8, 16]) {
    const ticksPerStep = safePpq / resolution;
    if (values.every((value) => Math.abs(value / ticksPerStep - Math.round(value / ticksPerStep)) < 1e-7)) {
      return { resolution, exact: true, maximumErrorTicks: 0 };
    }
  }
  const resolution = 16;
  const ticksPerStep = safePpq / resolution;
  const maximumErrorTicks = values.reduce((max, value) => Math.max(max, Math.abs(value - Math.round(value / ticksPerStep) * ticksPerStep)), 0);
  return { resolution, exact: false, maximumErrorTicks: round(maximumErrorTicks, 6) };
}

export function inferMidiRoleAssignments(data: MidiClipData, metadata: JsonObject | undefined = data.metadata): MidiRoleAssignments {
  const summaries = trackSummaries(metadata);
  const used = new Set<number>();
  const named = (role: MidiConversionRole, pattern: RegExp): MidiRoleAssignment | null => {
    const match = summaries.find((summary) => !used.has(summary.trackIndex) && pattern.test(summary.name));
    if (!match) return null;
    used.add(match.trackIndex);
    return sourceTrackAssignment(match.trackIndex, match.name, "high", `Track name identifies the ${role} role.`);
  };
  const melody = named("melody", /\b(vocal|melody|lead|voice)\b/i);
  const chords = named("chords", /\b(chord|harmony|harmonic|comp)\b/i);
  const bass = named("bass", /\b(bass|low end)\b/i);
  let drums = named("drums", /\b(drum|percussion|kit)\b/i);
  const guitar = named("guitar", /\b(guitar|riff)\b/i);
  if (!drums && data.notes.some((note) => note.channel === 9)) {
    drums = { filter: { mode: "channel", value: 9 }, confidence: "high", label: "Channel 10", reason: "General MIDI channel 10 identifies drums." };
  }

  return {
    melody: melody || inferMelodyAssignment(data, summaries, used),
    chords: chords || inferChordAssignment(data, summaries, used),
    bass,
    drums,
    guitar
  };
}

export function manualMidiRoleAssignment(role: MidiConversionRole, filter: MidiConversionSourceFilter): MidiRoleAssignment {
  return {
    filter,
    confidence: "high",
    label: midiConversionSourceLabel(filter),
    reason: `The user explicitly assigned this source to ${role}.`
  };
}

export function createMidiFaithfulConversionPreview(
  project: PocketDawProject,
  clipId: string,
  options: MidiFaithfulConversionOptions = {}
): MidiFaithfulConversionPreview | null {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip || clip.type !== "midi") return null;
  const data = midiDataFromClip(clip);
  const assignments = { ...inferMidiRoleAssignments(data), ...(options.assignments || {}) } as MidiRoleAssignments;
  const timeSig = sourceTimeSignature(data.metadata, project.project.timeSig);
  const key = sourceKeySignature(data.metadata, project.project.key, project.project.scale);
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleEndTick = sourceStartTick + Math.max(1, Math.round(clip.barLength * timeSig * data.ppq));
  const sourceBars = Math.max(1, Math.ceil((visibleEndTick - sourceStartTick) / Math.max(1, timeSig * data.ppq) - 1e-9));
  const packing = packMidiBarsIntoSections(sourceBars);
  const selectedNotes = uniqueAssignedNotes(data.notes, assignments).filter((note) => note.startTick >= sourceStartTick && note.startTick < visibleEndTick);
  const resolution = chooseMidiConversionResolution(
    selectedNotes.map((note) => note.startTick - sourceStartTick),
    selectedNotes.map((note) => note.durationTicks),
    data.ppq
  );
  const rolePreviews = rolePreviewMap(data.notes, assignments, sourceStartTick, visibleEndTick);
  const warnings: string[] = [];
  const timingWarnings = faithfulTimingWarnings(data.metadata);
  const storageWarnings = faithfulStorageWarnings(data.notes, assignments, clip, sourceStartTick, visibleEndTick, data.ppq / resolution.resolution);
  const unsupportedAssignedRoles = (["bass", "drums", "guitar"] as const)
    .filter((role) => rolePreviews[role].sourceNoteAttacks > 0);
  if (packing.supported === false && packing.reason) warnings.push(packing.reason);
  if (!resolution.exact) warnings.push(`Timing requires quantization up to ${resolution.maximumErrorTicks} ticks at resolution ${resolution.resolution}.`);
  warnings.push(...timingWarnings, ...storageWarnings);
  if (rolePreviews.chords.destinationEvents) warnings.push("Exact chord overlays remain in Pocket DAW. A schema-16 PCS1 progression copy would be simplified and must be labeled as such.");
  unsupportedAssignedRoles.forEach((role) => {
    warnings.push(`Exact faithful ${role} lane writing is not available yet. Set ${role} to None or keep the raw MIDI reference; this conversion will not silently approximate it.`);
  });
  if (options.keepRawReference === false) warnings.push("Raw MIDI timeline reference will be removed after a successful transcription; source media remains preserved.");
  if (!assignments.melody && !assignments.chords) warnings.push("No melody or chord source could be assigned with confidence. Choose sources before applying.");
  const structurallySupported = packing.supported !== false
    && (!!assignments.melody || !!assignments.chords)
    && unsupportedAssignedRoles.length === 0
    && timingWarnings.length === 0
    && storageWarnings.length === 0;
  const fidelity: MidiConversionFidelity = !structurallySupported
    ? "simplified"
    : resolution.exact
      ? "lossless within supported model"
      : "quantized but structurally faithful";
  return {
    intent: "faithful-transcription",
    clipId,
    sourceFileName: data.sourceName || clip.name,
    sourcePpq: data.ppq,
    tempoBpm: sourceTempo(data.metadata, project.project.bpm),
    timeSignature: `${timeSig}/4`,
    key,
    sourceBars,
    destinationBars: packing.destinationBars,
    resolution: resolution.resolution,
    resolutionExact: resolution.exact,
    maximumQuantizationErrorTicks: resolution.maximumErrorTicks,
    assignments,
    roles: rolePreviews,
    sectionPacking: packing,
    generated: { bass: 0, drums: 0, guitar: 0, harmony: 0 },
    chordCompatibility: rolePreviews.chords.destinationEvents ? "daw-exact-pcs1-simplified" : "none",
    rawReferenceAction: options.keepRawReference === false ? "remove" : "keep",
    fidelity,
    applyAllowed: structurallySupported,
    warnings
  };
}

export function createMidiFaithfulConversionPreviews(project: PocketDawProject): MidiFaithfulConversionPreview[] {
  return project.timeline.clips
    .filter((clip) => clip.type === "midi")
    .map((clip) => createMidiFaithfulConversionPreview(project, clip.id))
    .filter((preview): preview is MidiFaithfulConversionPreview => !!preview);
}

export function convertMidiClipFaithfully(
  project: PocketDawProject,
  clipId: string,
  options: MidiFaithfulConversionOptions = {}
): MidiFaithfulConversionResult {
  const preview = createMidiFaithfulConversionPreview(project, clipId, options);
  const emptyReport = reportFromPreview(preview, true);
  if (!preview || !preview.applyAllowed || preview.sectionPacking.supported === false) {
    return { project, applied: false, report: emptyReport };
  }
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi")!;
  const data = midiDataFromClip(clip);
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const timeSig = sourceTimeSignature(data.metadata, project.project.timeSig);
  const visibleEndTick = sourceStartTick + Math.max(1, Math.round(clip.barLength * timeSig * data.ppq));
  const ticksPerStep = data.ppq / preview.resolution;
  let next = configureFaithfulMidiChordsmithStructure(project, {
    sectionBars: preview.sectionPacking.sectionBars,
    songSequence: preview.sectionPacking.songSequence,
    resolution: preview.resolution,
    bpm: preview.tempoBpm,
    timeSig,
    key: preview.key.key,
    scale: preview.key.scale
  });

  const melodyNotes = notesForAssignment(data.notes, preview.assignments.melody)
    .filter((note) => note.channel !== 9 && note.startTick >= sourceStartTick && note.startTick < visibleEndTick);
  const melodyWrites: MelodyOverlayWrite[] = [];
  const melodyTrackIndex = Math.max(0, Math.round(options.melodyTrackIndex || 0));
  melodyNotes.forEach((note) => {
    const location = sectionLocation(note.startTick - sourceStartTick, ticksPerStep, preview.sectionPacking, preview.resolution, sourceTimeSignature(data.metadata, project.project.timeSig));
    if (!location) return;
    melodyWrites.push({
      sectionId: location.sectionId,
      trackIndex: melodyTrackIndex,
      step: location.step,
      midi: transformedPitch(note, clip.transforms.transpose, clip.transforms.octave),
      velocity: transformedVelocity(note.velocity, clip.transforms.gain),
      durationSteps: Math.max(1, Math.round(Math.min(note.durationTicks, visibleEndTick - note.startTick) / ticksPerStep)),
      sourceClipId: clip.id,
      sourceNoteId: note.id
    });
  });
  if (melodyWrites.length) next = writeMelodyOverlayEvents(next, melodyWrites);

  const chordGroups = groupChordNotes(notesForAssignment(data.notes, preview.assignments.chords)
    .filter((note) => note.channel !== 9 && note.startTick >= sourceStartTick && note.startTick < visibleEndTick));
  const chordWrites: ChordOverlayWrite[] = [];
  chordGroups.forEach((notes) => {
    if (new Set(notes.map((note) => note.pitch)).size < 2) return;
    const location = sectionLocation(notes[0].startTick - sourceStartTick, ticksPerStep, preview.sectionPacking, preview.resolution, sourceTimeSignature(data.metadata, project.project.timeSig));
    if (!location) return;
    chordWrites.push({
      sectionId: location.sectionId,
      step: location.step,
      midiNotes: notes.map((note) => transformedPitch(note, clip.transforms.transpose, clip.transforms.octave)),
      velocity: Math.max(...notes.map((note) => transformedVelocity(note.velocity, clip.transforms.gain))),
      durationSteps: Math.max(...notes.map((note) => Math.max(1, Math.round(Math.min(note.durationTicks, visibleEndTick - note.startTick) / ticksPerStep)))),
      sourceClipId: clip.id,
      sourceNoteIds: notes.map((note) => note.id)
    });
  });
  if (chordWrites.length) next = writeChordOverlayEvents(next, chordWrites);

  const keepRawReference = options.keepRawReference !== false;
  if (!keepRawReference) next = deleteClip(next, clipId);
  const report: MidiFaithfulConversionReport = {
    ...reportFromPreview(preview, keepRawReference),
    melodyWritten: melodyWrites.length,
    chordEventsWritten: chordWrites.length,
    chordNotesWritten: chordWrites.reduce((sum, write) => sum + new Set(write.midiNotes).size, 0)
  };
  next.importHistory.push({
    id: `conversion_${String(next.importHistory.length + 1).padStart(3, "0")}`,
    sourceRefId: clip.sourceRefId || next.sourceRefs[0]?.id || "midi-source",
    importedAt: new Date().toISOString(),
    importKind: "midi-conversion",
    message: `Faithfully transcribed ${report.sourceBars} MIDI bars into ${report.songSequence.join("-")}: ${report.melodyWritten} melody attacks and ${report.chordEventsWritten} exact chord overlays.`,
    conversion: report as unknown as JsonObject
  });
  return { project: next, applied: true, report };
}

function rolePreviewMap(notes: ParsedMidiNote[], assignments: MidiRoleAssignments, startTick: number, endTick: number): Record<MidiConversionRole, MidiFaithfulRolePreview> {
  const make = (role: MidiConversionRole): MidiFaithfulRolePreview => {
    const assignment = assignments[role];
    const assigned = notesForAssignment(notes, assignment);
    const visible = assigned.filter((note) => note.startTick >= startTick && note.startTick < endTick);
    const outOfRangeNotes = assigned.length - visible.length;
    if (role === "chords") {
      const groups = groupChordNotes(visible).filter((group) => new Set(group.map((note) => note.pitch)).size >= 2);
      return {
        assignment,
        sourceNoteAttacks: visible.length,
        destinationEvents: groups.length,
        filteredNotes: notes.length - assigned.length,
        mergedNotes: groups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
        outOfRangeNotes
      };
    }
    const destinationEvents = role === "melody" ? visible.length : 0;
    return {
      assignment,
      sourceNoteAttacks: visible.length,
      destinationEvents,
      filteredNotes: notes.length - assigned.length,
      mergedNotes: 0,
      outOfRangeNotes
    };
  };
  return { melody: make("melody"), chords: make("chords"), bass: make("bass"), drums: make("drums"), guitar: make("guitar") };
}

function reportFromPreview(preview: MidiFaithfulConversionPreview | null, keepRawReference: boolean): MidiFaithfulConversionReport {
  return {
    intent: "faithful-transcription",
    fidelity: preview?.fidelity || "simplified",
    sourceBars: preview?.sourceBars || 0,
    destinationBars: preview?.destinationBars || 0,
    resolution: preview?.resolution || 4,
    sectionBars: preview?.sectionPacking.sectionBars || {},
    songSequence: preview?.sectionPacking.songSequence || [],
    melodyWritten: 0,
    chordEventsWritten: 0,
    chordNotesWritten: 0,
    generated: { bass: 0, drums: 0, guitar: 0, harmony: 0 },
    rawMidiReferenceKept: keepRawReference,
    pcs1Compatibility: preview?.roles.chords.destinationEvents ? "simplified" : "not-applicable",
    assignments: preview?.assignments || null,
    roles: preview?.roles || null,
    warnings: preview?.warnings || ["No eligible MIDI clip was selected."]
  };
}

function notesForAssignment(notes: ParsedMidiNote[], assignment: MidiRoleAssignment | null): ParsedMidiNote[] {
  if (!assignment) return [];
  return notes.filter((note) => midiNoteMatchesConversionSource(note, assignment.filter));
}

function uniqueAssignedNotes(notes: ParsedMidiNote[], assignments: MidiRoleAssignments): ParsedMidiNote[] {
  const ids = new Set<string>();
  const out: ParsedMidiNote[] = [];
  (Object.keys(assignments) as MidiConversionRole[]).forEach((role) => {
    notesForAssignment(notes, assignments[role]).forEach((note) => {
      if (ids.has(note.id)) return;
      ids.add(note.id);
      out.push(note);
    });
  });
  return out;
}

function groupChordNotes(notes: ParsedMidiNote[]): ParsedMidiNote[][] {
  const groups = new Map<number, ParsedMidiNote[]>();
  notes.forEach((note) => groups.set(note.startTick, [...(groups.get(note.startTick) || []), note]));
  return Array.from(groups.entries()).sort(([a], [b]) => a - b).map(([, group]) => group.sort((a, b) => a.pitch - b.pitch || a.id.localeCompare(b.id)));
}

function faithfulTimingWarnings(metadata: JsonObject | undefined): string[] {
  const warnings: string[] = [];
  const tempos = objectEvents(metadata?.tempoEvents);
  const distinctTempos = new Set(tempos.map((event) => round(Number(event.bpm), 3)).filter(Number.isFinite));
  if (distinctTempos.size > 1) {
    warnings.push("Faithful Chordsmith transcription cannot preserve a changing MIDI tempo map yet. Adopt the tempo lane or keep raw MIDI.");
  }
  const meters = objectEvents(metadata?.timeSignatureEvents);
  const signatures = new Set(meters.map((event) => `${Number(event.numerator)}/${Number(event.denominator)}`));
  if (meters.some((event) => Number(event.denominator) !== 4)) {
    warnings.push("Faithful Chordsmith transcription currently supports only /4 MIDI meters; the denominator would otherwise be lost.");
  }
  if (signatures.size > 1) {
    warnings.push("Faithful Chordsmith transcription cannot preserve a changing MIDI meter map yet. Adopt the meter lane or keep raw MIDI.");
  }
  return warnings;
}

function faithfulStorageWarnings(
  notes: ParsedMidiNote[],
  assignments: MidiRoleAssignments,
  clip: Clip,
  sourceStartTick: number,
  visibleEndTick: number,
  ticksPerStep: number
): string[] {
  const warnings: string[] = [];
  const inWindow = (note: ParsedMidiNote) => note.channel !== 9 && note.startTick >= sourceStartTick && note.startTick < visibleEndTick;
  const melody = notesForAssignment(notes, assignments.melody).filter(inWindow);
  const melodyKeys = new Set<string>();
  let melodyCollisions = 0;
  let melodyDurationCaps = 0;
  melody.forEach((note) => {
    const key = `${Math.round((note.startTick - sourceStartTick) / ticksPerStep)}:${transformedPitch(note, clip.transforms.transpose, clip.transforms.octave)}`;
    if (melodyKeys.has(key)) melodyCollisions += 1;
    else melodyKeys.add(key);
    if (Math.round(Math.min(note.durationTicks, visibleEndTick - note.startTick) / ticksPerStep) > 256) melodyDurationCaps += 1;
  });
  if (melodyCollisions) warnings.push(`${melodyCollisions} melody attack${melodyCollisions === 1 ? "" : "s"} would collide at the selected overlay resolution.`);
  if (melodyDurationCaps) warnings.push(`${melodyDurationCaps} melody duration${melodyDurationCaps === 1 ? "" : "s"} exceed the exact overlay limit.`);

  const chordGroups = groupChordNotes(notesForAssignment(notes, assignments.chords).filter(inWindow));
  let singletonAttacks = 0;
  let duplicatePitches = 0;
  let unequalDurations = 0;
  let unequalVelocities = 0;
  let chordDurationCaps = 0;
  let chordCollisions = 0;
  const chordKeys = new Set<string>();
  chordGroups.forEach((group) => {
    const pitches = group.map((note) => transformedPitch(note, clip.transforms.transpose, clip.transforms.octave));
    const uniquePitches = new Set(pitches);
    duplicatePitches += pitches.length - uniquePitches.size;
    if (uniquePitches.size < 2) singletonAttacks += group.length;
    if (new Set(group.map((note) => note.durationTicks)).size > 1) unequalDurations += group.length;
    if (new Set(group.map((note) => note.velocity)).size > 1) unequalVelocities += group.length;
    if (Math.max(...group.map((note) => Math.round(Math.min(note.durationTicks, visibleEndTick - note.startTick) / ticksPerStep))) > 256) chordDurationCaps += group.length;
    const key = `${Math.round((group[0].startTick - sourceStartTick) / ticksPerStep)}:${Array.from(uniquePitches).sort((a, b) => a - b).join(".")}`;
    if (chordKeys.has(key)) chordCollisions += group.length;
    else chordKeys.add(key);
  });
  if (singletonAttacks) warnings.push(`${singletonAttacks} assigned chord attack${singletonAttacks === 1 ? " is" : "s are"} not polyphonic and cannot be stored as exact chord overlays.`);
  if (duplicatePitches) warnings.push(`${duplicatePitches} duplicate chord pitch${duplicatePitches === 1 ? "" : "es"} would be deduplicated.`);
  if (unequalDurations) warnings.push(`${unequalDurations} chord notes use per-note durations that the group overlay cannot represent exactly.`);
  if (unequalVelocities) warnings.push(`${unequalVelocities} chord notes use per-note velocities that the group overlay cannot represent exactly.`);
  if (chordDurationCaps) warnings.push(`${chordDurationCaps} chord-note durations exceed the exact overlay limit.`);
  if (chordCollisions) warnings.push(`${chordCollisions} chord notes would collide after timing resolution is applied.`);
  return warnings;
}

function objectEvents(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((event): event is Record<string, unknown> => !!event && typeof event === "object" && !Array.isArray(event))
    : [];
}

function sectionLocation(sourceTick: number, ticksPerStep: number, packing: MidiSectionPackingPlan, resolution: number, timeSig: number): { sectionId: SectionId; step: number } | null {
  const globalStep = Math.round(sourceTick / Math.max(1e-9, ticksPerStep));
  let firstStep = 0;
  for (const sectionId of packing.songSequence) {
    const sectionSteps = (packing.sectionBars[sectionId] || 1) * timeSig * resolution;
    if (globalStep >= firstStep && globalStep < firstStep + sectionSteps) return { sectionId, step: globalStep - firstStep };
    firstStep += sectionSteps;
  }
  return null;
}

function sourceTrackAssignment(trackIndex: number, name: string, confidence: MidiRoleConfidence, reason: string): MidiRoleAssignment {
  const filter: MidiConversionSourceFilter = { mode: "source-track", value: trackIndex };
  return { filter, confidence, label: name ? `Track ${trackIndex + 1}: ${name}` : midiConversionSourceLabel(filter), reason };
}

function inferMelodyAssignment(data: MidiClipData, summaries: Array<{ trackIndex: number; name: string }>, used: Set<number>): MidiRoleAssignment | null {
  const candidates = trackStats(data.notes).filter((stat) => !used.has(stat.trackIndex) && stat.channel9Count === 0);
  const best = candidates.sort((a, b) => b.averagePitch - a.averagePitch || a.simultaneousStarts - b.simultaneousStarts)[0];
  if (!best) return null;
  used.add(best.trackIndex);
  const name = summaries.find((summary) => summary.trackIndex === best.trackIndex)?.name || "";
  return sourceTrackAssignment(best.trackIndex, name, "medium", "Highest predominantly single-note source was inferred as melody.");
}

function inferChordAssignment(data: MidiClipData, summaries: Array<{ trackIndex: number; name: string }>, used: Set<number>): MidiRoleAssignment | null {
  const candidates = trackStats(data.notes).filter((stat) => !used.has(stat.trackIndex) && stat.channel9Count === 0 && stat.simultaneousStarts > 0);
  const best = candidates.sort((a, b) => b.simultaneousStarts - a.simultaneousStarts || a.averagePitch - b.averagePitch)[0];
  if (!best) return null;
  used.add(best.trackIndex);
  const name = summaries.find((summary) => summary.trackIndex === best.trackIndex)?.name || "";
  return sourceTrackAssignment(best.trackIndex, name, "medium", "Polyphonic onset groups were inferred as chords.");
}

function trackStats(notes: ParsedMidiNote[]) {
  const grouped = new Map<number, ParsedMidiNote[]>();
  notes.forEach((note) => {
    if (note.trackIndex === undefined) return;
    grouped.set(note.trackIndex, [...(grouped.get(note.trackIndex) || []), note]);
  });
  return Array.from(grouped.entries()).map(([trackIndex, trackNotes]) => {
    const starts = new Map<number, number>();
    trackNotes.forEach((note) => starts.set(note.startTick, (starts.get(note.startTick) || 0) + 1));
    return {
      trackIndex,
      averagePitch: trackNotes.reduce((sum, note) => sum + note.pitch, 0) / Math.max(1, trackNotes.length),
      simultaneousStarts: Array.from(starts.values()).filter((count) => count > 1).length,
      channel9Count: trackNotes.filter((note) => note.channel === 9).length
    };
  });
}

function trackSummaries(metadata: JsonObject | undefined): Array<{ trackIndex: number; name: string }> {
  const raw = Array.isArray(metadata?.trackSummaries) ? metadata.trackSummaries : [];
  return raw.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const trackIndex = Number(source.trackIndex);
    if (!Number.isFinite(trackIndex)) return null;
    return { trackIndex: Math.max(0, Math.round(trackIndex)), name: typeof source.name === "string" ? source.name.trim() : "" };
  }).filter((value): value is { trackIndex: number; name: string } => !!value);
}

function sourceTimeSignature(metadata: JsonObject | undefined, fallback: number): number {
  const events = Array.isArray(metadata?.timeSignatureEvents) ? metadata.timeSignatureEvents : [];
  const first = events.find((event) => !!event && typeof event === "object" && !Array.isArray(event)) as Record<string, unknown> | undefined;
  const value = Number(first?.numerator ?? metadata?.timeSig ?? fallback);
  return [3, 4, 5, 6, 7].includes(Math.round(value)) ? Math.round(value) : 4;
}

function sourceTempo(metadata: JsonObject | undefined, fallback: number): number {
  const events = Array.isArray(metadata?.tempoEvents) ? metadata.tempoEvents : [];
  const first = events.find((event) => !!event && typeof event === "object" && !Array.isArray(event)) as Record<string, unknown> | undefined;
  const value = Number(first?.bpm ?? metadata?.tempoBpm ?? fallback);
  return Math.max(1, round(Number.isFinite(value) ? value : fallback, 3));
}

function sourceKeySignature(metadata: JsonObject | undefined, fallbackKey: string, fallbackScale: string): MidiFaithfulConversionPreview["key"] {
  const events = Array.isArray(metadata?.keySignatures) ? metadata.keySignatures : [];
  const first = events.find((event) => !!event && typeof event === "object" && !Array.isArray(event)) as Record<string, unknown> | undefined;
  if (!first) return { key: fallbackKey, scale: fallbackScale === "major" ? "major" : "minor", source: "project" };
  const sharpsFlats = Math.max(-7, Math.min(7, Math.round(Number(first.sharpsFlats) || 0)));
  const minor = first.minor === true;
  const majorKeys = ["B", "F#", "C#", "G#", "D#", "A#", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const minorKeys = ["G#", "D#", "A#", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
  return {
    key: (minor ? minorKeys : majorKeys)[sharpsFlats + 7],
    scale: minor ? "minor" : "major",
    source: "midi-key-signature"
  };
}

function transformedPitch(note: ParsedMidiNote, transpose: number, octave: number): number {
  return Math.max(0, Math.min(127, Math.round(note.pitch + (transpose || 0) + (octave || 0) * 12)));
}

function transformedVelocity(velocity: number, gain: number): number {
  return Math.max(0.05, Math.min(1, (velocity / 127) * (gain ?? 1)));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
