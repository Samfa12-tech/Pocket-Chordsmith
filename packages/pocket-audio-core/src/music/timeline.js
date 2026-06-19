export function beatDurationSeconds(input = 96) {
  if (typeof input === "object" && input !== null && Number.isFinite(Number(input.secondsPerBeat))) {
    return Math.max(0.0001, Number(input.secondsPerBeat));
  }
  const bpm = typeof input === "object" && input !== null ? input.bpm : input;
  return 60 / Math.max(1, Number(bpm) || 96);
}

export function stepDurationSeconds({ bpm = 96, secondsPerBeat = undefined, resolution = 4, swing = 0 } = {}, step = 0) {
  const base = beatDurationSeconds({ bpm, secondsPerBeat }) / Math.max(1, resolution);
  if (swing > 0 && resolution >= 2 && resolution !== 3) {
    return step % 2 === 1 ? base + base * swing : base - base * swing;
  }
  return base;
}

export function buildStepTimeline({ stepCount, startTime = 0, bpm = 96, secondsPerBeat = undefined, resolution = 4, swing = 0 }) {
  const times = [];
  let cursor = startTime;
  for (let step = 0; step < stepCount; step += 1) {
    times.push(cursor);
    cursor += stepDurationSeconds({ bpm, secondsPerBeat, resolution, swing }, step);
  }
  return { times, duration: cursor - startTime };
}

export function spanDurationSeconds(options = {}, startStep = 0, span = 1) {
  let duration = 0;
  for (let offset = 0; offset < span; offset += 1) {
    duration += stepDurationSeconds(options, startStep + offset);
  }
  return duration;
}

export function tripletTimesForSpan(startTime, spanDuration) {
  return [startTime, startTime + spanDuration / 3, startTime + spanDuration * 2 / 3];
}

export function stepsPerBar(project) {
  return Math.max(1, (project?.meta?.timeSig || 4) * (project?.meta?.resolution || 4));
}
