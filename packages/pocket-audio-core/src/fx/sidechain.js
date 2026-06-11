export function sidechainDuckCurve({ amount = 0.45, start = 0, duration = 0.18 } = {}) {
  const safe = Math.max(0, Math.min(1, Number(amount) || 0));
  return [
    { time: start, gain: Math.max(0.08, 1 - safe * 0.75) },
    { time: start + duration, gain: 1 }
  ];
}
