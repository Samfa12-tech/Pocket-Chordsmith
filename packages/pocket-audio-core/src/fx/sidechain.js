export const CHORDSMITH_SIDECHAIN_ATTACK_SECONDS = 0.012;
export const CHORDSMITH_SIDECHAIN_RELEASE_SECONDS = 0.22;
export const CHORDSMITH_SIDECHAIN_DEPTH = 0.72;
export const CHORDSMITH_SIDECHAIN_FLOOR = 0.18;

export function chordsmithSidechainDuckGain(amount = 0.45, base = 1) {
  const safe = Math.max(0, Math.min(1, Number(amount) || 0));
  const safeBase = Math.max(0.0001, Number(base) || 1);
  return Math.max(CHORDSMITH_SIDECHAIN_FLOOR, safeBase * (1 - safe * CHORDSMITH_SIDECHAIN_DEPTH));
}

export function sidechainDuckCurve({ amount = 0.45, start = 0, duration = CHORDSMITH_SIDECHAIN_RELEASE_SECONDS } = {}) {
  const attack = Math.min(CHORDSMITH_SIDECHAIN_ATTACK_SECONDS, Math.max(0.001, duration));
  const end = Math.max(start + attack, start + duration);
  return [
    { time: start, gain: 1 },
    { time: start + attack, gain: chordsmithSidechainDuckGain(amount, 1) },
    { time: end, gain: 1 }
  ];
}

export function sidechainDuckGainAt({ amount = 0.45, triggerTime = 0, time = 0 } = {}) {
  const elapsed = Number(time) - Number(triggerTime);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > CHORDSMITH_SIDECHAIN_RELEASE_SECONDS) return 1;
  const duck = chordsmithSidechainDuckGain(amount, 1);
  if (elapsed <= CHORDSMITH_SIDECHAIN_ATTACK_SECONDS) {
    return 1 + (duck - 1) * (elapsed / CHORDSMITH_SIDECHAIN_ATTACK_SECONDS);
  }
  const releaseProgress = (elapsed - CHORDSMITH_SIDECHAIN_ATTACK_SECONDS) / (CHORDSMITH_SIDECHAIN_RELEASE_SECONDS - CHORDSMITH_SIDECHAIN_ATTACK_SECONDS);
  return duck * Math.pow(1 / duck, Math.max(0, Math.min(1, releaseProgress)));
}
