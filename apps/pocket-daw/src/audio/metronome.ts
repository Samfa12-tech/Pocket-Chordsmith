import type { PocketDawProject } from "../daw/schema";

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
  return Math.max(0, Math.round(settings.countInBars || 0)) * secondsPerBar(project);
}

export function buildMetronomeClicks(project: PocketDawProject, startSeconds: number, durationSeconds: number): MetronomeClick[] {
  const beatSeconds = secondsPerBeat(project);
  const timeSig = Math.max(1, Math.round(project.project.timeSig || 4));
  const startBeat = Math.floor(Math.max(0, startSeconds) / beatSeconds);
  const endBeat = Math.ceil(Math.max(0, startSeconds + durationSeconds) / beatSeconds);
  const clicks: MetronomeClick[] = [];
  for (let beatIndex = startBeat; beatIndex < endBeat; beatIndex += 1) {
    const barIndex = Math.floor(beatIndex / timeSig);
    const beatInBar = beatIndex % timeSig;
    clicks.push({
      beatIndex,
      bar: barIndex + 1,
      beat: beatInBar + 1,
      timeSeconds: beatIndex * beatSeconds,
      accented: beatInBar === 0
    });
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
  const beatSeconds = secondsPerBeat(project);
  const currentSeconds = Math.max(0, transportSeconds);
  const currentBeat = Math.floor(currentSeconds / beatSeconds);
  let lastScheduled = scheduledBeatIndex;

  if (lastScheduled !== null && (currentBeat < lastScheduled - 1 || currentBeat > lastScheduled + 8)) {
    lastScheduled = null;
  }

  let beatIndex = Math.max(currentBeat, (lastScheduled ?? -1) + 1);
  while (beatIndex * beatSeconds < currentSeconds - lateGraceSeconds) beatIndex += 1;

  const clicks = buildMetronomeClicks(project, beatIndex * beatSeconds, horizonSeconds)
    .filter((click) => click.timeSeconds >= currentSeconds - lateGraceSeconds);
  const bounded = clicks.filter((click) => click.timeSeconds <= currentSeconds + horizonSeconds);

  if (bounded.length) {
    lastScheduled = bounded[bounded.length - 1].beatIndex;
  }

  return { clicks: bounded, scheduledBeatIndex: lastScheduled };
}
