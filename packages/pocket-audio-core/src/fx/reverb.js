export function reverbSettings(amount = 0) {
  const safe = Math.max(0, Math.min(1, Number(amount) || 0));
  return { wet: safe * 0.62 };
}
