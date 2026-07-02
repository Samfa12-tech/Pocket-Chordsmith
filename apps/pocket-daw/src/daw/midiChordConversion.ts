import { chordSectionStepLimit, writeChordOverlayEvents, type ChordOverlayWrite } from "./chordOverlays";
import { midiNoteMatchesConversionSource, type MidiConversionSourceFilter } from "./midiConversionFilter";
import { midiDataFromClip } from "./midiClips";
import type { PocketDawProject } from "./schema";

export interface MidiChordConversionResult {
  project: PocketDawProject;
  written: number;
  skipped: number;
  merged: number;
  sectionId: string;
  chords: number[][];
}

interface PendingChord {
  step: number;
  midiNotes: number[];
  velocity: number;
  durationSteps: number;
  sourceNoteIds: string[];
}

export function convertMidiClipToChordOverlays(project: PocketDawProject, clipId: string, sectionId = "A", filter?: MidiConversionSourceFilter): MidiChordConversionResult {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  const totalSteps = chordSectionStepLimit(project, sectionId);
  if (!clip || clip.type !== "midi" || totalSteps <= 0) {
    return { project, written: 0, skipped: 0, merged: 0, sectionId, chords: [] };
  }
  const data = midiDataFromClip(clip);
  const ticksPerStep = Math.max(1, data.ppq / Math.max(1, project.project.resolution));
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
  const sourceEndTick = sourceStartTick + visibleTicks;
  const groups = new Map<string, PendingChord>();
  let skipped = 0;
  let merged = 0;

  data.notes.forEach((note) => {
    if (!midiNoteMatchesConversionSource(note, filter)) {
      skipped += 1;
      return;
    }
    if (note.channel === 9) {
      skipped += 1;
      return;
    }
    if (note.startTick < sourceStartTick || note.startTick >= sourceEndTick) {
      skipped += 1;
      return;
    }
    const step = Math.round((note.startTick - sourceStartTick) / ticksPerStep);
    if (step < 0 || step >= totalSteps) {
      skipped += 1;
      return;
    }
    const key = `${sectionId}:${step}`;
    const midi = clampMidi(note.pitch + (clip.transforms.transpose || 0) + (clip.transforms.octave || 0) * 12);
    const velocity = Math.max(0.05, Math.min(1, (note.velocity / 127) * (clip.transforms.gain ?? 1)));
    const durationSteps = Math.max(1, Math.round(note.durationTicks / ticksPerStep));
    const existing = groups.get(key);
    if (existing) {
      merged += 1;
      existing.midiNotes.push(midi);
      existing.velocity = Math.max(existing.velocity, velocity);
      existing.durationSteps = Math.max(existing.durationSteps, durationSteps);
      existing.sourceNoteIds.push(note.id);
    } else {
      groups.set(key, {
        step,
        midiNotes: [midi],
        velocity,
        durationSteps,
        sourceNoteIds: [note.id]
      });
    }
  });

  const writes: ChordOverlayWrite[] = Array.from(groups.values())
    .filter((group) => {
      const keep = new Set(group.midiNotes).size >= 2;
      if (!keep) skipped += group.midiNotes.length;
      return keep;
    })
    .map((group) => ({
      sectionId,
      step: group.step,
      midiNotes: group.midiNotes,
      velocity: group.velocity,
      durationSteps: group.durationSteps,
      sourceClipId: clip.id,
      sourceNoteIds: group.sourceNoteIds
    }));

  const projectWithWrites = writes.length ? writeChordOverlayEvents(project, writes) : project;
  return {
    project: projectWithWrites,
    written: writes.length,
    skipped,
    merged,
    sectionId,
    chords: writes.map((write) => Array.from(new Set(write.midiNotes)).sort((a, b) => a - b))
  };
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
}
