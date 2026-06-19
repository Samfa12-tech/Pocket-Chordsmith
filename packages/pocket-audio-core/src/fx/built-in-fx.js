import { POCKET_PRO_EQ_DEFAULT_PARAMETERS, POCKET_PRO_EQ_TYPE } from "./pro-eq.js";

export const POCKET_BUILT_IN_FX = Object.freeze([
  Object.freeze({ type: "utility-gain", name: "Utility Gain", defaultParameters: Object.freeze({ gain: 1 }) }),
  Object.freeze({ type: "high-pass", name: "High Pass", defaultParameters: Object.freeze({ frequency: 80, q: 0.7 }) }),
  Object.freeze({ type: "low-pass", name: "Low Pass", defaultParameters: Object.freeze({ frequency: 12000, q: 0.7 }) }),
  Object.freeze({ type: "three-band-eq", name: "3-Band EQ", defaultParameters: Object.freeze({ lowGain: 0, midGain: 0, highGain: 0, midFrequency: 1200 }) }),
  Object.freeze({ type: POCKET_PRO_EQ_TYPE, name: "Pocket Pro EQ", defaultParameters: POCKET_PRO_EQ_DEFAULT_PARAMETERS }),
  Object.freeze({ type: "compressor", name: "Compressor", defaultParameters: Object.freeze({ threshold: -20, ratio: 3, attack: 0.006, release: 0.16 }) }),
  Object.freeze({ type: "limiter", name: "Limiter", defaultParameters: Object.freeze({ threshold: -4, ratio: 18, attack: 0.002, release: 0.08 }) }),
  Object.freeze({ type: "noise-gate", name: "Noise Gate", defaultParameters: Object.freeze({ threshold: -48, reduction: 0.18 }) }),
  Object.freeze({ type: "saturation", name: "Saturation", defaultParameters: Object.freeze({ drive: 1.8, mix: 0.65 }) }),
  Object.freeze({ type: "bitcrusher", name: "Bitcrusher", defaultParameters: Object.freeze({ bits: 8, mix: 0.45 }) }),
  Object.freeze({ type: "delay", name: "Delay", defaultParameters: Object.freeze({ time: 0.22, feedback: 0.28, mix: 0.32 }) }),
  Object.freeze({ type: "ping-pong-delay", name: "Ping-Pong Delay", defaultParameters: Object.freeze({ time: 0.28, feedback: 0.34, mix: 0.28 }) }),
  Object.freeze({ type: "reverb", name: "Reverb", defaultParameters: Object.freeze({ decay: 1.8, mix: 0.24 }) }),
  Object.freeze({ type: "chorus", name: "Chorus", defaultParameters: Object.freeze({ rate: 0.8, depth: 0.012, mix: 0.35 }) }),
  Object.freeze({ type: "phaser", name: "Phaser", defaultParameters: Object.freeze({ rate: 0.45, depth: 650, mix: 0.32 }) }),
  Object.freeze({ type: "tremolo-autopan", name: "Tremolo / AutoPan", defaultParameters: Object.freeze({ rate: 4, depth: 0.38 }) })
]);

export const POCKET_BUILT_IN_FX_TYPES = Object.freeze(POCKET_BUILT_IN_FX.map((fx) => fx.type));

export function findPocketBuiltInFx(type) {
  return POCKET_BUILT_IN_FX.find((fx) => fx.type === type) || null;
}
