import type { PocketDawProject } from "../daw/schema";
import { effectiveMeterAtBar, timelineBarAtSeconds, timelineSecondsAtBar } from "../daw/timeline";

export interface MetronomeClick {
  beatIndex: number;
  bar: number;
  beat: number;
  timeSeconds: number;
  accented: boolean;
}

export interface MetronomeSchedule {
  clicks: MetronomeClick[];
  scheduledBeatIndex: number | null;
}

export function metronomeSettings(project: PocketDawProject) {
  return project.project.metronome || { enabled: false, countInBars: 1, volume: 0.55 };
}

export function secondsPerBeat(project: PocketDawProject): number {
  return 60 / Math.max(1, project.project.bpm || 120);
}

export function secondsPerBar(project: PocketDawProject): number {
  return secondsPerBeat(project) * Math.max(1, project.project.timeSig || 4);
}

export function countInSeconds(project: PocketDawProject): number {
  const settings = metronomeSettings(project);
  const bars = Math.max(0, Math.round(settings.countInBars || 0));
  return timelineSecondsAtBar(project, 1 + bars);
}

export function buildMetronomeClicks(project: PocketDawProject, startSeconds: number, durationSeconds: number): MetronomeClick[] {
  const start = Math.max(0, startSeconds);
  const end = Math.max(start, start + Math.max(0, durationSeconds));
  const clicks: MetronomeClick[] = [];
  const startBar = Math.max(1, Math.floor(timelineBarAtSeconds(project, start)) - 1);
  const endBar = Math.max(startBar, Math.ceil(timelineBarAtSeconds(project, end)) + 1);
  let beatIndex = cumulativeBeatCountBeforeBar(project, startBar);
  for (let bar = startBar; bar <= endBar; bar += 1) {
    const meter = effectiveMeterAtBar(project, bar);
    const beatsPerBar = Math.max(1, Math.round(meter.numerator));
    for (let beat = 1; beat <= beatsPerBar; beat += 1) {
      const timeSeconds = timelineSecondsAtBar(project, bar + (beat - 1) / beatsPerBar);
      if (timeSeconds >= start - 0.000001 && timeSeconds < end - 0.000001) {
        clicks.push({
          beatIndex,
          bar,
          beat,
          timeSeconds,
          accented: beat === 1
        });
      }
      beatIndex += 1;
    }
  }
  return clicks;
}

export function buildTransportMetronomeSchedule(
  project: PocketDawProject,
  transportSeconds: number,
  scheduledBeatIndex: number | null,
  horizonSeconds = 0.16,
  lateGraceSeconds = 0.025
): MetronomeSchedule {
  const currentSeconds = Math.max(0, transportSeconds);
  const currentBeat = beatIndexAtSeconds(project, currentSeconds);
  let lastScheduled = scheduledBeatIndex;

  if (lastScheduled !== null && (currentBeat < lastScheduled - 1 || currentBeat > lastScheduled + 8)) {
    lastScheduled = null;
  }

  const clicks = buildMetronomeClicks(
    project,
    Math.max(0, currentSeconds - lateGraceSeconds),
    horizonSeconds + lateGraceSeconds
  )
    .filter((click) => click.timeSeconds >= currentSeconds - lateGraceSeconds);
  const bounded = clicks
    .filter((click) => lastScheduled === null || click.beatIndex > lastScheduled)
    .filter((click) => click.timeSeconds <= currentSeconds + horizonSeconds);

  if (bounded.length) {
    lastScheduled = bounded[bounded.length - 1].beatIndex;
  }

  return { clicks: bounded, scheduledBeatIndex: lastScheduled };
}

function beatIndexAtSeconds(project: PocketDawProject, seconds: number): number {
  const barFloat = Math.max(1, timelineBarAtSeconds(project, Math.max(0, seconds)));
  const bar = Math.max(1, Math.floor(barFloat));
  const meter = effectiveMeterAtBar(project, bar);
  const beatsPerBar = Math.max(1, Math.round(meter.numerator));
  const beatInBar = Math.max(0, Math.floor((barFloat - bar) * beatsPerBar + 0.000001));
  return cumulativeBeatCountBeforeBar(project, bar) + Math.min(beatsPerBar - 1, beatInBar);
}

function cumulativeBeatCountBeforeBar(project: PocketDawProject, bar: number): number {
  const target = Math.max(1, Math.floor(Number.isFinite(bar) ? bar : 1));
  let beats = 0;
  for (let current = 1; current < target; current += 1) {
    beats += Math.max(1, Math.round(effectiveMeterAtBar(project, current).numerator));
  }
  return beats;
}
