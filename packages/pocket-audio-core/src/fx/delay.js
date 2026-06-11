export function delaySettings(amount = 0) {
  const safe = Math.max(0, Math.min(1, Number(amount) || 0));
  return { delayTime: 0.12 + safe * 0.34, feedback: 0.08 + safe * 0.58, wet: safe * 0.55 };
}
