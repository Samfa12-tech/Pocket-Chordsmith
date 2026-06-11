export function beatDurationSeconds(bpm) {
  return 60 / Math.max(1, Number(bpm) || 96);
}

export function stepDurationSeconds({ bpm = 96, resolution = 4, swing = 0 }, step = 0) {
  const base = beatDurationSeconds(bpm) / Math.max(1, resolution);
  if (swing > 0 && resolution >= 2 && resolution !== 3) {
    return step % 2 === 1 ? base + base * swing : base - base * swing;
  }
  return base;
}

export function buildStepTimeline({ stepCount, startTime = 0, bpm = 96, resolution = 4, swing = 0 }) {
  const times = [];
  let cursor = startTime;
  for (let step = 0; step < stepCount; step += 1) {
    times.push(cursor);
    cursor += stepDurationSeconds({ bpm, resolution, swing }, step);
  }
  return { times, duration: cursor - startTime };
}

export function stepsPerBar(project) {
  return Math.max(1, (project?.meta?.timeSig || 4) * (project?.meta?.resolution || 4));
}
