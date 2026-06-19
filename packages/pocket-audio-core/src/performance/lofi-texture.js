import { chordsmithFeatureSeed } from "./humanize.js";

export const CHORDSMITH_LOFI_TEXTURE_LIVE = Object.freeze({
  hissSeconds: 0.22,
  hissAttackSeconds: 0.018,
  hissReleaseSeconds: 0.2,
  hissGain: 0.0055,
  hissHighpassHz: 520,
  hissLowpassBaseHz: 3600,
  hissLowpassAgeHz: 1800,
  crackleThreshold: 0.7,
  crackleSeconds: 0.026,
  crackleGain: 0.018,
  crackleDecaySeconds: 0.024,
  crackleStopSeconds: 0.028,
  crackleBandpassBaseHz: 1550,
  crackleBandpassRangeHz: 1300,
  crackleBandpassQ: 0.95
});

export const CHORDSMITH_LOFI_TEXTURE_OFFLINE = Object.freeze({
  hissGain: 0.014,
  crackleWindowSeconds: 0.09,
  crackleMinWindowSamples: 900,
  crackleThreshold: 0.22,
  crackleLocalSamples: 760,
  crackleGain: 0.07,
  crackleDecaySamples: 130,
  highpassHz: 420,
  lowpassBaseHz: 3800,
  lowpassAgeHz: 2000,
  warmthGainBase: 0.42,
  warmthGainRange: 0.22,
  bitcrushBaseSteps: 28,
  bitcrushRangeSteps: 18
});

export function chordsmithLofiTextureLiveHissLowpass(age = 0) {
  return CHORDSMITH_LOFI_TEXTURE_LIVE.hissLowpassBaseHz - clamp01(age) * CHORDSMITH_LOFI_TEXTURE_LIVE.hissLowpassAgeHz;
}

export function chordsmithLofiTextureLiveCrackleShouldTrigger(step, crackle = 0) {
  return chordsmithFeatureSeed(step, 43) < clamp01(crackle) * CHORDSMITH_LOFI_TEXTURE_LIVE.crackleThreshold;
}

export function chordsmithLofiTextureLiveCrackleFrequency(step) {
  return CHORDSMITH_LOFI_TEXTURE_LIVE.crackleBandpassBaseHz +
    chordsmithFeatureSeed(step, 44) * CHORDSMITH_LOFI_TEXTURE_LIVE.crackleBandpassRangeHz;
}

export function chordsmithLofiTextureOfflineCrackleWindow(sampleRate) {
  return Math.max(
    CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleMinWindowSamples,
    Math.floor((Number(sampleRate) || 0) * CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleWindowSeconds)
  );
}

export function chordsmithStableNoiseSample(index, seed = 0) {
  const x = Math.sin(((Number(index) || 0) + 1) * 12.9898 + ((Number(seed) || 0) + 1) * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * @param {number} index
 * @param {Record<string, unknown>} texture
 * @param {number} crackleWindow
 */
export function chordsmithLofiTextureOfflineSample(index, texture = {}, crackleWindow = CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleMinWindowSamples) {
  const hiss = clamp01(texture.tapeHiss);
  const crackle = clamp01(texture.vinylCrackle);
  const bit = clamp01(texture.bitCrush);
  const base = chordsmithStableNoiseSample(index, 91) * hiss * CHORDSMITH_LOFI_TEXTURE_OFFLINE.hissGain;
  const tick = Math.floor(index / Math.max(1, crackleWindow));
  const tickSeed = chordsmithFeatureSeed(tick, 92);
  const local = index % Math.max(1, crackleWindow);
  const crack = tickSeed < crackle * CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleThreshold &&
    local < CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleLocalSamples
    ? chordsmithStableNoiseSample(index, 93) * crackle * CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleGain *
      Math.exp(-local / CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleDecaySamples)
    : 0;
  const combined = base + crack;
  if (bit <= 0.01) return combined;
  const steps = CHORDSMITH_LOFI_TEXTURE_OFFLINE.bitcrushBaseSteps -
    bit * CHORDSMITH_LOFI_TEXTURE_OFFLINE.bitcrushRangeSteps;
  return Math.round(combined * steps) / steps;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
