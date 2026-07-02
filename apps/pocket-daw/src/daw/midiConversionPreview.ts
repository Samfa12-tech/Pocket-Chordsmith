import { convertMidiClipToBassOverlays } from "./midiBassConversion";
import { convertMidiClipToChordOverlays } from "./midiChordConversion";
import { convertMidiClipToDrumBranchOverlays } from "./midiDrumConversion";
import { convertMidiClipToMelodyOverlays } from "./midiMelodyConversion";
import { midiDataFromClip } from "./midiClips";
import type { Clip, PocketDawProject } from "./schema";

export interface MidiChordsmithConversionPreview {
  clipId: string;
  clipName: string;
  sectionId: string;
  melodyTrackIndex: number;
  rawMidiClip: "preserved";
  sourceNoteCount: number;
  visibleNoteCount: number;
  outOfRangeNoteCount: number;
  preservedControllerCount: number;
  preservedProgramChangeCount: number;
  preservedPitchBendCount: number;
  preservedAftertouchCount: number;
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
  melodyTrackIndex = 0
): MidiChordsmithConversionPreview | null {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  if (!clip || clip.type !== "midi") return null;
  const midi = midiDataFromClip(clip);
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * midi.ppq));
  const sourceEndTick = sourceStartTick + visibleTicks;
  const visibleNoteCount = midi.notes.filter((note) => note.startTick >= sourceStartTick && note.startTick < sourceEndTick).length;
  const drums = convertMidiClipToDrumBranchOverlays(project, clipId, sectionId);
  const bass = convertMidiClipToBassOverlays(project, clipId, sectionId);
  const chords = convertMidiClipToChordOverlays(project, clipId, sectionId);
  const melody = convertMidiClipToMelodyOverlays(project, clipId, sectionId, melodyTrackIndex);
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
    sourceNoteCount: midi.notes.length,
    visibleNoteCount,
    outOfRangeNoteCount: Math.max(0, midi.notes.length - visibleNoteCount),
    preservedControllerCount: midi.controllers.length,
    preservedProgramChangeCount: midi.programChanges.length,
    preservedPitchBendCount: midi.pitchBends.length,
    preservedAftertouchCount: midi.aftertouch.length,
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
