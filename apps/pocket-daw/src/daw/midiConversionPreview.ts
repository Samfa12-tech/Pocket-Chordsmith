import { convertMidiClipToBassOverlays } from "./midiBassConversion";
import { convertMidiClipToChordOverlays } from "./midiChordConversion";
import {
  DEFAULT_MIDI_CONVERSION_SOURCE_FILTER,
  midiConversionSourceLabel,
  midiConversionSourceOptions,
  midiNoteMatchesConversionSource,
  normalizeMidiConversionSourceFilter,
  type MidiConversionSourceFilter,
  type MidiConversionSourceOption
} from "./midiConversionFilter";
import { convertMidiClipToDrumBranchOverlays } from "./midiDrumConversion";
import { convertMidiClipToMelodyOverlays } from "./midiMelodyConversion";
import { createMidiTempoMapSummary, midiDataFromClip } from "./midiClips";
import type { Clip, JsonObject, PocketDawProject } from "./schema";

export interface MidiChordsmithConversionPreview {
  clipId: string;
  clipName: string;
  sectionId: string;
  melodyTrackIndex: number;
  rawMidiClip: "preserved";
  timing: {
    bpm: number;
    timeSignature: string;
    tempoEventCount: number;
    timeSignatureEventCount: number;
    hasTempoChanges: boolean;
    hasMeterChanges: boolean;
  };
  key: {
    key: string;
    scale: "major" | "minor";
    source: "midi-key-signature" | "pitch-inference" | "project";
  };
  structure: {
    sourceBars: number;
    suggestedSectionBars: number;
    suggestedSectionCount: number;
  };
  sourceNoteCount: number;
  visibleNoteCount: number;
  outOfRangeNoteCount: number;
  preservedControllerCount: number;
  preservedProgramChangeCount: number;
  preservedPitchBendCount: number;
  preservedAftertouchCount: number;
  sourceFilter: MidiConversionSourceFilter;
  sourceFilterLabel: string;
  sourceOptions: MidiConversionSourceOption[];
  filteredOutNoteCount: number;
  mappings: {
    drums: {
      written: number;
      skipped: number;
      merged: number;
      lanes: Record<string, number>;
    };
    bass: {
      written: number;
      skipped: number;
      merged: number;
      pitches: number[];
    };
    chords: {
      written: number;
      skipped: number;
      merged: number;
      chords: number[][];
    };
    melody: {
      written: number;
      skipped: number;
      merged: number;
      pitches: number[];
    };
  };
  roleHints: Array<{
    role: "drums" | "bass" | "chords" | "melody" | "reference";
    source: string;
    reason: string;
  }>;
  totals: {
    written: number;
    skippedByTargets: number;
    mergedByTargets: number;
  };
  warnings: string[];
}

export function createMidiChordsmithConversionPreview(
  project: PocketDawProject,
  clipId: string,
  sectionId = "A",
  melodyTrackIndex = 0,
  sourceFilter: MidiConversionSourceFilter = DEFAULT_MIDI_CONVERSION_SOURCE_FILTER
): MidiChordsmithConversionPreview | null {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip || clip.type !== "midi") return null;
  const midi = midiDataFromClip(clip);
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * midi.ppq));
  const sourceEndTick = sourceStartTick + visibleTicks;
  const normalizedSourceFilter = normalizeMidiConversionSourceFilter(sourceFilter.mode, sourceFilter.value);
  const sourceFilteredNoteCount = midi.notes.filter((note) => midiNoteMatchesConversionSource(note, normalizedSourceFilter)).length;
  const visibleNoteCount = midi.notes.filter((note) => midiNoteMatchesConversionSource(note, normalizedSourceFilter) && note.startTick >= sourceStartTick && note.startTick < sourceEndTick).length;
  const metadata = combinedMidiMetadata(project, clip, midi.metadata);
  const tempoSummary = createMidiTempoMapSummary(metadata, { fallbackBpm: project.project.bpm, fallbackTimeSig: project.project.timeSig });
  const timing = midiConversionTimingPreview(project, metadata, tempoSummary);
  const key = midiConversionKeyPreview(project, metadata, midi.notes);
  const structure = midiConversionStructurePreview(project, midi.ppq, sourceStartTick, sourceEndTick);
  const drums = convertMidiClipToDrumBranchOverlays(project, clipId, sectionId, normalizedSourceFilter);
  const bass = convertMidiClipToBassOverlays(project, clipId, sectionId, normalizedSourceFilter);
  const chords = convertMidiClipToChordOverlays(project, clipId, sectionId, normalizedSourceFilter);
  const melody = convertMidiClipToMelodyOverlays(project, clipId, sectionId, melodyTrackIndex, normalizedSourceFilter);
  const written = drums.written + bass.written + chords.written + melody.written;
  const skippedByTargets = drums.skipped + bass.skipped + chords.skipped + melody.skipped;
  const mergedByTargets = drums.merged + bass.merged + chords.merged + melody.merged;
  const warnings = midiConversionPreviewWarnings(clip, visibleNoteCount, written, {
    controllers: midi.controllers.length,
    programChanges: midi.programChanges.length,
    pitchBends: midi.pitchBends.length,
    aftertouch: midi.aftertouch.length
  });

  return {
    clipId: clip.id,
    clipName: clip.name,
    sectionId,
    melodyTrackIndex: Math.max(0, Math.round(Number(melodyTrackIndex) || 0)),
    rawMidiClip: "preserved",
    timing,
    key,
    structure,
    sourceNoteCount: midi.notes.length,
    visibleNoteCount,
    outOfRangeNoteCount: Math.max(0, sourceFilteredNoteCount - visibleNoteCount),
    preservedControllerCount: midi.controllers.length,
    preservedProgramChangeCount: midi.programChanges.length,
    preservedPitchBendCount: midi.pitchBends.length,
    preservedAftertouchCount: midi.aftertouch.length,
    sourceFilter: normalizedSourceFilter,
    sourceFilterLabel: midiConversionSourceLabel(normalizedSourceFilter),
    sourceOptions: midiConversionSourceOptions(midi.notes, metadata),
    filteredOutNoteCount: Math.max(0, midi.notes.length - sourceFilteredNoteCount),
    mappings: {
      drums: {
        written: drums.written,
        skipped: drums.skipped,
        merged: drums.merged,
        lanes: drums.lanes
      },
      bass: {
        written: bass.written,
        skipped: bass.skipped,
        merged: bass.merged,
        pitches: bass.pitches
      },
      chords: {
        written: chords.written,
        skipped: chords.skipped,
        merged: chords.merged,
        chords: chords.chords
      },
      melody: {
        written: melody.written,
        skipped: melody.skipped,
        merged: melody.merged,
        pitches: melody.pitches
      }
    },
    totals: {
      written,
      skippedByTargets,
      mergedByTargets
    },
    roleHints: midiConversionRoleHints(metadata, midi.programChanges),
    warnings
  };
}

export function createMidiChordsmithConversionPreviews(project: PocketDawProject): MidiChordsmithConversionPreview[] {
  return project.timeline.clips
    .filter((clip): clip is Clip & { type: "midi" } => clip.type === "midi")
    .map((clip) => createMidiChordsmithConversionPreview(project, clip.id))
    .filter((preview): preview is MidiChordsmithConversionPreview => !!preview);
}

function midiConversionPreviewWarnings(
  clip: Clip,
  visibleNoteCount: number,
  written: number,
  preserved: { controllers: number; programChanges: number; pitchBends: number; aftertouch: number }
): string[] {
  const warnings: string[] = [];
  if (!visibleNoteCount) warnings.push("No visible MIDI notes are inside this clip range.");
  if (visibleNoteCount && !written) warnings.push("No notes match the current Chordsmith mapping heuristics.");
  if (clip.muted) warnings.push("The raw MIDI clip is muted; conversion can still read it and will preserve it.");
  const expressive = preserved.controllers + preserved.programChanges + preserved.pitchBends + preserved.aftertouch;
  if (expressive) warnings.push(`${expressive} MIDI controller/program/bend/aftertouch event${expressive === 1 ? "" : "s"} will be preserved on the raw MIDI clip, not converted into Chordsmith overlays.`);
  return warnings;
}

function combinedMidiMetadata(project: PocketDawProject, clip: Clip, clipMetadata: JsonObject | undefined): JsonObject {
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null : null;
  return {
    ...(media?.metadata || {}),
    ...(clipMetadata || {})
  };
}

function midiConversionTimingPreview(
  project: PocketDawProject,
  metadata: JsonObject,
  summary: ReturnType<typeof createMidiTempoMapSummary>
): MidiChordsmithConversionPreview["timing"] {
  const firstTempo = summary?.tempoEvents[0]?.bpm;
  const firstMeter = summary?.timeSignatureEvents[0];
  const bpm = clampNumber(firstTempo ?? metadata.tempoBpm, project.project.bpm, 40, 240);
  const numerator = clampNumber(firstMeter?.numerator ?? metadata.timeSig, project.project.timeSig, 1, 32);
  const denominator = clampNumber(firstMeter?.denominator, 4, 1, 32);
  return {
    bpm,
    timeSignature: `${numerator}/${denominator}`,
    tempoEventCount: summary?.tempoEvents.length || 0,
    timeSignatureEventCount: summary?.timeSignatureEvents.length || 0,
    hasTempoChanges: summary?.hasTempoChanges || false,
    hasMeterChanges: summary?.hasMeterChanges || false
  };
}

function midiConversionStructurePreview(project: PocketDawProject, ppq: number, sourceStartTick: number, sourceEndTick: number): MidiChordsmithConversionPreview["structure"] {
  const ticksPerBar = Math.max(1, ppq * Math.max(1, project.project.timeSig));
  const sourceBars = Math.max(1, Math.ceil(Math.max(0, sourceEndTick - sourceStartTick) / ticksPerBar));
  const suggestedSectionBars = Math.min(8, Math.max(1, sourceBars >= 8 ? 4 : sourceBars));
  return {
    sourceBars,
    suggestedSectionBars,
    suggestedSectionCount: Math.max(1, Math.ceil(sourceBars / suggestedSectionBars))
  };
}

function midiConversionKeyPreview(project: PocketDawProject, metadata: JsonObject, notes: Array<{ pitch: number; channel?: number }>): MidiChordsmithConversionPreview["key"] {
  const signature = firstKeySignature(metadata);
  if (signature) {
    return {
      key: keyNameFromSignature(signature.sharpsFlats, signature.minor),
      scale: signature.minor ? "minor" : "major",
      source: "midi-key-signature"
    };
  }
  const inferred = inferKeyFromNotes(notes);
  if (inferred) {
    return {
      ...inferred,
      source: "pitch-inference"
    };
  }
  return {
    key: project.project.key || "C",
    scale: project.project.scale === "major" ? "major" : "minor",
    source: "project"
  };
}

function midiConversionRoleHints(metadata: JsonObject, programChanges: Array<{ program: number; channel?: number; trackIndex?: number }>): MidiChordsmithConversionPreview["roleHints"] {
  const hints = new Map<string, MidiChordsmithConversionPreview["roleHints"][number]>();
  const summaries = Array.isArray(metadata.trackSummaries) ? metadata.trackSummaries : [];
  summaries.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const summary = item as Record<string, unknown>;
    const name = typeof summary.name === "string" && summary.name.trim() ? summary.name.trim() : `Track ${Number(summary.trackIndex ?? 0) + 1}`;
    const role = roleFromText(name);
    if (role) hints.set(`${role}:${name}`, { role, source: name, reason: "track name" });
  });
  programChanges.forEach((program) => {
    const role = roleFromProgram(program.program);
    const source = `Ch ${Number(program.channel ?? 0) + 1} program ${program.program}`;
    if (role) hints.set(`${role}:${source}`, { role, source, reason: "General MIDI program" });
  });
  if (!hints.size) hints.set("reference:raw-midi", { role: "reference", source: "Raw MIDI", reason: "no role-specific track or program hint" });
  return Array.from(hints.values()).slice(0, 8);
}

function firstKeySignature(metadata: JsonObject): { sharpsFlats: number; minor: boolean } | null {
  const signatures = Array.isArray(metadata.keySignatures) ? metadata.keySignatures : [];
  for (const item of signatures) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const sharpsFlats = Number(raw.sharpsFlats);
    if (Number.isFinite(sharpsFlats)) return { sharpsFlats: Math.max(-7, Math.min(7, Math.round(sharpsFlats))), minor: raw.minor === true };
  }
  return null;
}

function keyNameFromSignature(sharpsFlats: number, minor: boolean): string {
  const major = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const minorKeys = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
  return (minor ? minorKeys : major)[sharpsFlats + 7] || (minor ? "A" : "C");
}

function inferKeyFromNotes(notes: Array<{ pitch: number; channel?: number }>): { key: string; scale: "major" | "minor" } | null {
  const musical = notes.filter((note) => note.channel !== 9);
  if (!musical.length) return null;
  const histogram = new Array<number>(12).fill(0);
  musical.forEach((note) => {
    const pitchClass = ((Math.round(note.pitch) % 12) + 12) % 12;
    histogram[pitchClass] += 1;
  });
  const major = [0, 2, 4, 5, 7, 9, 11];
  const minor = [0, 2, 3, 5, 7, 8, 10];
  let best = { score: Number.NEGATIVE_INFINITY, root: 0, scale: "major" as "major" | "minor" };
  for (let root = 0; root < 12; root += 1) {
    const majorScore = scaleScore(histogram, root, major);
    if (majorScore > best.score) best = { score: majorScore, root, scale: "major" };
    const minorScore = scaleScore(histogram, root, minor);
    if (minorScore > best.score) best = { score: minorScore, root, scale: "minor" };
  }
  return { key: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][best.root], scale: best.scale };
}

function scaleScore(histogram: number[], root: number, intervals: number[]): number {
  const scale = new Set(intervals.map((interval) => (root + interval) % 12));
  return histogram.reduce((score, count, pitchClass) => score + count * (scale.has(pitchClass) ? 1 : -0.4), 0);
}

function roleFromText(value: string): MidiChordsmithConversionPreview["roleHints"][number]["role"] | null {
  const text = value.toLowerCase();
  if (text.includes("drum") || text.includes("perc")) return "drums";
  if (text.includes("bass")) return "bass";
  if (text.includes("chord") || text.includes("pad") || text.includes("keys") || text.includes("piano") || text.includes("guitar")) return "chords";
  if (text.includes("lead") || text.includes("melody") || text.includes("riff") || text.includes("solo")) return "melody";
  return null;
}

function roleFromProgram(program: number): MidiChordsmithConversionPreview["roleHints"][number]["role"] | null {
  if (program >= 32 && program <= 39) return "bass";
  if ((program >= 0 && program <= 7) || (program >= 16 && program <= 23) || (program >= 24 && program <= 31) || (program >= 88 && program <= 95)) return "chords";
  if ((program >= 40 && program <= 87) || (program >= 104 && program <= 111)) return "melody";
  return null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(numeric) ? numeric : fallback)));
}
