import { DEFAULT_FX } from "../constants.js";
import { POCKET_PRO_EQ_DEFAULT_PARAMETERS, POCKET_PRO_EQ_TYPE } from "./pro-eq.js";

export const CHORDSMITH_FX_GRAPH = Object.freeze({
  dryGainFloor: 0.52,
  dryGainMixDepth: 0.48,
  wetMasterGain: 1.45,
  toneFrequency: 1800,
  toneBrightness: Object.freeze({
    chorus: 0.9,
    flanger: 1.1,
    reverb: 0.35,
    delay: -0.1,
    gain: 6,
    min: -2,
    max: 7
  }),
  delay: Object.freeze({ timeBase: 0.1, timeRange: 0.42, feedbackBase: 0.05, feedbackRange: 0.72, wetGain: 0.95 }),
  chorus: Object.freeze({ delayTime: 0.016, rateBase: 0.25, rateRange: 1.9, depthBase: 0.0014, depthRange: 0.03, wetGain: 0.95 }),
  flanger: Object.freeze({ delayTime: 0.003, rateBase: 0.1, rateRange: 1.1, depthBase: 0.0007, depthRange: 0.0062, feedbackBase: 0.08, feedbackRange: 0.82, wetGain: 0.85 }),
  reverb: Object.freeze({ impulseSeconds: 1.6, impulseDecay: 2.4, wetGain: 1.05 })
});

export function chordsmithFxParameters(fx = {}) {
  const delay = clamp01(fx.delay ?? fx.fxDelay ?? DEFAULT_FX.delay);
  const chorus = clamp01(fx.chorus ?? fx.fxChorus ?? DEFAULT_FX.chorus);
  const flanger = clamp01(fx.flanger ?? fx.fxFlanger ?? DEFAULT_FX.flanger);
  const reverb = clamp01(fx.reverb ?? fx.fxReverb ?? DEFAULT_FX.reverb);
  const mix = clamp01(fx.mix ?? fx.fxMix ?? DEFAULT_FX.mix);
  const wetScale = mix * CHORDSMITH_FX_GRAPH.wetMasterGain;
  const brightness = (chorus * CHORDSMITH_FX_GRAPH.toneBrightness.chorus) +
    (flanger * CHORDSMITH_FX_GRAPH.toneBrightness.flanger) +
    (reverb * CHORDSMITH_FX_GRAPH.toneBrightness.reverb) -
    (delay * Math.abs(CHORDSMITH_FX_GRAPH.toneBrightness.delay));

  return {
    source: { delay, chorus, flanger, reverb, mix },
    dryGain: Math.max(CHORDSMITH_FX_GRAPH.dryGainFloor, 1 - mix * CHORDSMITH_FX_GRAPH.dryGainMixDepth),
    wetMasterGain: wetScale,
    tone: {
      frequency: CHORDSMITH_FX_GRAPH.toneFrequency,
      gain: clamp(
        brightness * CHORDSMITH_FX_GRAPH.toneBrightness.gain,
        CHORDSMITH_FX_GRAPH.toneBrightness.min,
        CHORDSMITH_FX_GRAPH.toneBrightness.max
      )
    },
    delay: {
      time: CHORDSMITH_FX_GRAPH.delay.timeBase + delay * CHORDSMITH_FX_GRAPH.delay.timeRange,
      feedback: CHORDSMITH_FX_GRAPH.delay.feedbackBase + delay * CHORDSMITH_FX_GRAPH.delay.feedbackRange,
      mix: clamp01(delay * CHORDSMITH_FX_GRAPH.delay.wetGain * wetScale)
    },
    chorus: {
      rate: CHORDSMITH_FX_GRAPH.chorus.rateBase + chorus * CHORDSMITH_FX_GRAPH.chorus.rateRange,
      depth: CHORDSMITH_FX_GRAPH.chorus.depthBase + chorus * CHORDSMITH_FX_GRAPH.chorus.depthRange,
      mix: clamp01(chorus * CHORDSMITH_FX_GRAPH.chorus.wetGain * wetScale)
    },
    flanger: {
      rate: CHORDSMITH_FX_GRAPH.flanger.rateBase + flanger * CHORDSMITH_FX_GRAPH.flanger.rateRange,
      depth: CHORDSMITH_FX_GRAPH.flanger.depthBase + flanger * CHORDSMITH_FX_GRAPH.flanger.depthRange,
      feedback: CHORDSMITH_FX_GRAPH.flanger.feedbackBase + flanger * CHORDSMITH_FX_GRAPH.flanger.feedbackRange,
      mix: clamp01(flanger * CHORDSMITH_FX_GRAPH.flanger.wetGain * wetScale)
    },
    reverb: {
      decay: CHORDSMITH_FX_GRAPH.reverb.impulseSeconds,
      impulseDecay: CHORDSMITH_FX_GRAPH.reverb.impulseDecay,
      mix: clamp01(reverb * CHORDSMITH_FX_GRAPH.reverb.wetGain * wetScale)
    }
  };
}

export function chordsmithDawSynthFxSlots(fx = {}) {
  const params = chordsmithFxParameters(fx);
  const slots = [];
  if (Math.abs(params.tone.gain) > 0.01) {
    slots.push({
      id: "pcs_tone",
      type: POCKET_PRO_EQ_TYPE,
      name: "Chordsmith FX Tone",
      enabled: true,
      presetId: "pocket-chordsmith-tone",
      parameters: {
        ...POCKET_PRO_EQ_DEFAULT_PARAMETERS,
        hpEnabled: false,
        lowShelfEnabled: false,
        lowMidEnabled: false,
        highMidEnabled: false,
        highShelfEnabled: true,
        highShelfFrequency: params.tone.frequency,
        highShelfGain: params.tone.gain,
        lpEnabled: false
      }
    });
  }
  if (params.delay.mix > 0.01) {
    slots.push({
      id: "pcs_delay",
      type: "delay",
      name: "Chordsmith Delay",
      enabled: true,
      presetId: "pocket-chordsmith",
      parameters: params.delay
    });
  }
  const flanger = fxValue(fx.flanger ?? fx.fxFlanger ?? DEFAULT_FX.flanger);
  const modMix = clamp01(params.chorus.mix + flanger * 0.35 * params.wetMasterGain);
  if (modMix > 0.01) {
    slots.push({
      id: "pcs_chorus",
      type: "chorus",
      name: "Chordsmith Mod",
      enabled: true,
      presetId: "pocket-chordsmith",
      parameters: {
        rate: params.chorus.rate + flanger * 0.55,
        depth: params.chorus.depth + flanger * CHORDSMITH_FX_GRAPH.flanger.depthRange,
        mix: modMix
      }
    });
  }
  if (params.reverb.mix > 0.01) {
    slots.push({
      id: "pcs_reverb",
      type: "reverb",
      name: "Chordsmith Reverb",
      enabled: true,
      presetId: "pocket-chordsmith",
      parameters: { decay: params.reverb.decay, mix: params.reverb.mix }
    });
  }
  return slots;
}

function fxValue(value) {
  return clamp01(value);
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clamp(number, 0, 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
