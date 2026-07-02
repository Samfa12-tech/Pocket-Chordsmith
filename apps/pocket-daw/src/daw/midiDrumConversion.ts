import { totalEditorSteps, getPrimaryChordsmithSource } from "./chordsmithEditor";
import { writeDrumBranchStepLevels, type DrumBranchStepWrite, type DrumLaneId } from "./drumLanes";
import { midiNoteMatchesConversionSource, type MidiConversionSourceFilter } from "./midiConversionFilter";
import { midiDataFromClip } from "./midiClips";
import type { PocketDawProject } from "./schema";

export interface MidiDrumConversionResult {
  project: PocketDawProject;
  written: number;
  skipped: number;
  merged: number;
  sectionId: string;
  lanes: Record<string, number>;
}

export function convertMidiClipToDrumBranchOverlays(project: PocketDawProject, clipId: string, sectionId = "A", filter?: MidiConversionSourceFilter): MidiDrumConversionResult {
  const clip = project.timeline.clips.find((item) => item.id === clipId && item.type === "midi");
  const pcs = getPrimaryChordsmithSource(project);
  const section = pcs?.sections[sectionId as keyof typeof pcs.sections];
  if (!clip || clip.type !== "midi" || !pcs || !section) {
    return { project, written: 0, skipped: 0, merged: 0, sectionId, lanes: {} };
  }
  const data = midiDataFromClip(clip);
  const totalSteps = totalEditorSteps(pcs, section);
  const ticksPerStep = Math.max(1, data.ppq / Math.max(1, pcs.resolution));
  const sourceStartTick = Math.max(0, Math.round(Number(clip.metadata?.sourceStartTick || 0)));
  const visibleTicks = Math.max(0, Math.round(clip.barLength * project.project.timeSig * data.ppq));
  const sourceEndTick = sourceStartTick + visibleTicks;
  const writes = new Map<string, DrumBranchStepWrite>();
  const lanes: Record<string, number> = {};
  let skipped = 0;
  let merged = 0;

  data.notes.forEach((note) => {
    if (!midiNoteMatchesConversionSource(note, filter)) {
      skipped += 1;
      return;
    }
    if (note.channel !== 9) {
      skipped += 1;
      return;
    }
    const target = midiDrumTarget(note.pitch, note.velocity);
    if (!target) {
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
    const key = `${sectionId}:${target.laneId}:${step}`;
    const existing = writes.get(key);
    if (existing) {
      merged += 1;
      existing.level = Math.max(existing.level, target.level);
    } else {
      writes.set(key, { sectionId, laneId: target.laneId, step, level: target.level });
    }
    lanes[target.laneId] = (lanes[target.laneId] || 0) + 1;
  });

  const projectWithWrites = writes.size ? writeDrumBranchStepLevels(project, Array.from(writes.values())) : project;
  return {
    project: projectWithWrites,
    written: writes.size,
    skipped,
    merged,
    sectionId,
    lanes
  };
}

function midiDrumTarget(note: number, velocity: number): { laneId: DrumLaneId; level: number } | null {
  const accent = velocity >= 100 ? 2 : 1;
  if (note === 35 || note === 36) return { laneId: "kick", level: accent };
  if (note === 37 || note === 38 || note === 40) return { laneId: "snare", level: accent };
  if (note === 39) return { laneId: "clap", level: accent };
  if (note === 42 || note === 44 || note === 54) return { laneId: "hat", level: accent };
  if (note === 46) return { laneId: "openhat", level: Math.max(2, accent) };
  if (note === 41 || note === 43 || note === 45) return { laneId: "tomlow", level: accent };
  if (note === 47 || note === 48) return { laneId: "tommid", level: accent };
  if (note === 50) return { laneId: "tomhi", level: accent };
  if (note === 49 || note === 52 || note === 55 || note === 57) return { laneId: "crash", level: accent };
  if (note === 51 || note === 53 || note === 59) return { laneId: "ride", level: accent };
  return null;
}
