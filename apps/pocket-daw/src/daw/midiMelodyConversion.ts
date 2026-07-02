import { midiNoteMatchesConversionSource, type MidiConversionSourceFilter } from "./midiConversionFilter";
import { midiDataFromClip } from "./midiClips";
import { sectionStepLimit, writeMelodyOverlayEvents, type MelodyOverlayWrite } from "./melodyOverlays";
import type { PocketDawProject } from "./schema";

export interface MidiMelodyConversionResult {
  project: PocketDawProject;
  written: number;
  skipped: number;
  merged: number;
  sectionId: string;
  trackIndex: number;
  pitches: number[];
}

export function convertMidiClipToMelodyOverlays(project: PocketDawProject, clipId: string, sectionId = "A", trackIndex = 0, filter?: MidiConversionSourceFilter): MidiMelodyConversionResult {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  const totalSteps = sectionStepLimit(project, sectionId);
  const safeTrackIndex = Math.max(0, Math.round(Number(trackIndex)));
  if (!clip || clip.type !== "midi" || totalSteps <= 0) {
    return { project, written: 0, skipped: 0, merged: 0, sectionId, trackIndex: safeTrackIndex, pitches: [] };
  }
  const data = midiDataFromClip(clip);
  const ticksPerStep = Math.max(1, data.ppq / Math.max(1, project.project.resolution));
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
  const sourceEndTick = sourceStartTick + visibleTicks;
  const writes = new Map<string, MelodyOverlayWrite>();
  const pitches = new Set<number>();
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
    const midi = clampMidi(note.pitch + (clip.transforms.transpose || 0) + (clip.transforms.octave || 0) * 12);
    const key = `${sectionId}:${safeTrackIndex}:${step}:${midi}`;
    const durationSteps = Math.max(1, Math.round(note.durationTicks / ticksPerStep));
    const velocity = Math.max(0.05, Math.min(1, (note.velocity / 127) * (clip.transforms.gain ?? 1)));
    const existing = writes.get(key);
    if (existing) {
      merged += 1;
      existing.velocity = Math.max(existing.velocity, velocity);
      existing.durationSteps = Math.max(existing.durationSteps || 1, durationSteps);
    } else {
      writes.set(key, {
        sectionId,
        trackIndex: safeTrackIndex,
        step,
        midi,
        velocity,
        durationSteps,
        sourceClipId: clip.id,
        sourceNoteId: note.id
      });
      pitches.add(midi);
    }
  });

  const projectWithWrites = writes.size ? writeMelodyOverlayEvents(project, Array.from(writes.values())) : project;
  return {
    project: projectWithWrites,
    written: writes.size,
    skipped,
    merged,
    sectionId,
    trackIndex: safeTrackIndex,
    pitches: Array.from(pitches).sort((a, b) => a - b)
  };
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
}
