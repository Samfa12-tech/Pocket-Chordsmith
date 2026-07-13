export function safeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
