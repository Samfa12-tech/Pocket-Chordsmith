export const CHORDSMITH_HUMANIZE_TIMING_SECONDS = 0.018;
export const CHORDSMITH_HUMANIZE_PEAK_BASE = 0.88;
export const CHORDSMITH_HUMANIZE_PEAK_RANGE = 0.2;
export const CHORDSMITH_HUMANIZE_VELOCITY_BASE = 0.9;
export const CHORDSMITH_HUMANIZE_VELOCITY_RANGE = 0.18;

export function chordsmithFeatureSeed(step, seed = 0) {
  const x = Math.sin((Number(step) || 0) * 12.9898 + (Number(seed) || 0) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function chordsmithHumanizeOffset(step, seed = 0, enabled = false) {
  if (!enabled) return 0;
  return (chordsmithFeatureSeed(step, seed) - 0.5) * CHORDSMITH_HUMANIZE_TIMING_SECONDS;
}

export function chordsmithHumanizePeak(base, step, seed = 0, enabled = false) {
  const value = Number(base) || 0;
  if (!enabled) return value;
  return value * (CHORDSMITH_HUMANIZE_PEAK_BASE + chordsmithFeatureSeed(step, seed + 99) * CHORDSMITH_HUMANIZE_PEAK_RANGE);
}

export function chordsmithHumanizeVelocity(base, step, seed = 0, enabled = false) {
  const value = Number(base) || 0;
  const scaled = enabled
    ? value * (CHORDSMITH_HUMANIZE_VELOCITY_BASE + chordsmithFeatureSeed(step, seed + 199) * CHORDSMITH_HUMANIZE_VELOCITY_RANGE)
    : value;
  return Math.max(1, Math.min(127, Math.round(scaled)));
}
