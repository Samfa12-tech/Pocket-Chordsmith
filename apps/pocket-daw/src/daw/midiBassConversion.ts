import { bassSectionStepLimit, writeBassOverlayEvents, type BassOverlayWrite } from "./bassOverlays";
import { midiNoteMatchesConversionSource, type MidiConversionSourceFilter } from "./midiConversionFilter";
import { midiDataFromClip } from "./midiClips";
import type { PocketDawProject } from "./schema";

export interface MidiBassConversionResult {
  project: PocketDawProject;
  written: number;
  skipped: number;
  merged: number;
  sectionId: string;
  pitches: number[];
}

export function convertMidiClipToBassOverlays(project: PocketDawProject, clipId: string, sectionId = "A", filter?: MidiConversionSourceFilter): MidiBassConversionResult {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  const totalSteps = bassSectionStepLimit(project, sectionId);
  if (!clip || clip.type !== "midi" || totalSteps <= 0) {
    return { project, written: 0, skipped: 0, merged: 0, sectionId, pitches: [] };
  }
  const data = midiDataFromClip(clip);
  const ticksPerStep = Math.max(1, data.ppq / Math.max(1, project.project.resolution));
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
  const sourceEndTick = sourceStartTick + visibleTicks;
  const writes = new Map<string, BassOverlayWrite>();
  let skipped = 0;
  let merged = 0;

  data.notes.forEach((note) => {
    if (!midiNoteMatchesConversionSource(note, filter)) {
      skipped += 1;
      return;
    }
    if (note.channel === 9 || note.pitch > 60) {
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
    const key = `${sectionId}:${step}`;
    const durationSteps = Math.max(1, Math.round(note.durationTicks / ticksPerStep));
    const velocity = Math.max(0.05, Math.min(1, (note.velocity / 127) * (clip.transforms.gain ?? 1)));
    const existing = writes.get(key);
    if (existing) {
      merged += 1;
      if (midi < existing.midi || velocity > existing.velocity + 0.15) {
        writes.set(key, {
          sectionId,
          step,
          midi,
          velocity,
          durationSteps,
          sourceClipId: clip.id,
          sourceNoteId: note.id
        });
      } else {
        existing.velocity = Math.max(existing.velocity, velocity);
        existing.durationSteps = Math.max(existing.durationSteps || 1, durationSteps);
      }
    } else {
      writes.set(key, {
        sectionId,
        step,
        midi,
        velocity,
        durationSteps,
        sourceClipId: clip.id,
        sourceNoteId: note.id
      });
    }
  });

  const projectWithWrites = writes.size ? writeBassOverlayEvents(project, Array.from(writes.values())) : project;
  return {
    project: projectWithWrites,
    written: writes.size,
    skipped,
    merged,
    sectionId,
    pitches: Array.from(new Set(Array.from(writes.values()).map((write) => write.midi))).sort((a, b) => a - b)
  };
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
}
