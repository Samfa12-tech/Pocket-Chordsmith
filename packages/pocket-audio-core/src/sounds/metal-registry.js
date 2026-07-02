import { METAL_BASS_TONES, METAL_CHORD_INSTRUMENTS, METAL_DRUM_KITS, METAL_MELODY_INSTRUMENTS } from "../presets/metal.js";

export const METAL_DRUM_KIT_CONFIGS = Object.freeze({
  metal_tight: Object.freeze({ kick: Object.freeze({ startFreq: 112, endFreq: 34, sweepSeconds: 0.075, filterFreq: 240, gainFloor: 0.07, gainScale: 0.98, length: 0.14, rampSeconds: 0.115 }), snare: Object.freeze({ noiseSeconds: 0.09, highpass: 1550, lowpass: 7200, gainFloor: 0.045, gainScale: 0.82, length: 0.105, rampSeconds: 0.09, bodyFreq: 205, bodyGain: 0.04, bodyLength: 0.08, bodyRampSeconds: 0.06 }), hat: Object.freeze({ closedLength: 0.035, openLength: 0.13, highpassClosed: 5600, highpassOpen: 4100, lowpass: 9800, gainFloorClosed: 0.018, gainFloorOpen: 0.03, gainScaleClosed: 0.68, gainScaleOpen: 0.72, rampSecondsClosed: 0.03, rampSecondsOpen: 0.105 }) }),
  metal_arena: Object.freeze({ kick: Object.freeze({ startFreq: 104, endFreq: 36, sweepSeconds: 0.105, filterFreq: 210, gainFloor: 0.072, gainScale: 0.9, length: 0.18, rampSeconds: 0.15 }), snare: Object.freeze({ noiseSeconds: 0.12, highpass: 1280, lowpass: 6800, gainFloor: 0.048, gainScale: 0.86, length: 0.14, rampSeconds: 0.12, bodyFreq: 190, bodyGain: 0.055, bodyLength: 0.105, bodyRampSeconds: 0.08 }), hat: Object.freeze({ closedLength: 0.045, openLength: 0.18, highpassClosed: 5000, highpassOpen: 3600, lowpass: 9200, gainFloorClosed: 0.019, gainFloorOpen: 0.034, gainScaleClosed: 0.64, gainScaleOpen: 0.74, rampSecondsClosed: 0.038, rampSecondsOpen: 0.15 }) }),
  metal_doom: Object.freeze({ kick: Object.freeze({ startFreq: 92, endFreq: 30, sweepSeconds: 0.15, filterFreq: 160, gainFloor: 0.07, gainScale: 0.78, length: 0.26, rampSeconds: 0.22 }), snare: Object.freeze({ noiseSeconds: 0.18, highpass: 880, lowpass: 4400, gainFloor: 0.045, gainScale: 0.7, length: 0.2, rampSeconds: 0.17, bodyFreq: 165, bodyGain: 0.06, bodyLength: 0.14, bodyRampSeconds: 0.11 }), hat: Object.freeze({ closedLength: 0.065, openLength: 0.24, highpassClosed: 3600, highpassOpen: 2600, lowpass: 7200, gainFloorClosed: 0.018, gainFloorOpen: 0.035, gainScaleClosed: 0.52, gainScaleOpen: 0.6, rampSecondsClosed: 0.055, rampSecondsOpen: 0.2 }) })
});

export const METAL_BASS_TONE_CONFIGS = Object.freeze({
  metal_pick_bass: Object.freeze({ mainWave: "sawtooth", subWave: "square", mainPeak: 0.72, subPeak: 0.4, cutoff: 520, subCutoff: 140, attack: 0.003 }),
  metal_sub_pick: Object.freeze({ mainWave: "triangle", subWave: "sine", mainPeak: 0.58, subPeak: 0.68, cutoff: 360, subCutoff: 110, attack: 0.006 }),
  metal_grind_bass: Object.freeze({ mainWave: "sawtooth", subWave: "triangle", mainPeak: 0.66, subPeak: 0.32, cutoff: 760, subCutoff: 170, attack: 0.002 })
});

export const METAL_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  metal_power_stack: Object.freeze({ rootWave: "sawtooth", wave: "sawtooth", peak: 0.15, filter: "bandpass", freq: 1180, filterQ: 0.9, filterSweep: 1950, attack: 0.002, decay: 0.08, sustain: 0.58, release: 0.16, durMul: 0.72, spreadMul: 0.3, shimmer: false, maxLiveDur: 0.76, layers: Object.freeze([Object.freeze({ wave: "sawtooth", level: 0.78, detune: -5 }), Object.freeze({ wave: "square", level: 0.42, detune: 5 }), Object.freeze({ wave: "triangle", freqMul: 0.5, level: 0.2 })]) }),
  dark_organ_stack: Object.freeze({ rootWave: "triangle", wave: "sawtooth", peak: 0.125, filter: "lowpass", freq: 1050, filterQ: 0.62, filterSweep: 1500, attack: 0.09, decay: 0.24, sustain: 0.82, release: 0.62, durMul: 1.35, spreadMul: 0.18, shimmer: false, maxLiveDur: 1.7, layers: Object.freeze([Object.freeze({ wave: "triangle", level: 0.72, detune: -8 }), Object.freeze({ wave: "sawtooth", level: 0.36, detune: 7 }), Object.freeze({ wave: "sine", freqMul: 2, level: 0.16 })]) })
});

export const METAL_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  shred_lead_guitar: Object.freeze({ wave: "sawtooth", peak: 0.132, filter: "bandpass", freq: 2300, durMul: 0.78, extras: Object.freeze([Object.freeze({ freqMul: 1.006, slideFreqMul: 1.012, wave: "square", peak: 0.04, peakScale: 0.26, filter: "lowpass", freq: 3400, offset: 0.004, durMul: 0.62 }), Object.freeze({ freqMul: 2, midiOffset: 12, wave: "triangle", peak: 0.012, peakScale: 0.1, filter: "lowpass", freq: 4200, offset: 0.008, durMul: 0.32, maxDur: 0.12 })]) }),
  twin_harmony_lead: Object.freeze({ wave: "sawtooth", peak: 0.118, filter: "lowpass", freq: 2900, durMul: 0.86, extras: Object.freeze([Object.freeze({ freqMul: 1.5, midiOffset: 7, wave: "sawtooth", peak: 0.032, peakScale: 0.24, filter: "bandpass", freq: 2600, offset: 0.006, durMul: 0.7 }), Object.freeze({ freqMul: 2.005, midiOffset: 12, wave: "triangle", peak: 0.014, peakScale: 0.12, filter: "lowpass", freq: 3800, offset: 0.012, durMul: 0.4, maxDur: 0.16 })]) })
});

export const POCKET_METAL_SOUND_REGISTRY = Object.freeze({
  drumKits: METAL_DRUM_KIT_CONFIGS,
  bassTones: METAL_BASS_TONE_CONFIGS,
  chordInstruments: METAL_CHORD_INSTRUMENT_CONFIGS,
  leadInstruments: METAL_LEAD_INSTRUMENT_CONFIGS
});

export function validateMetalSoundRegistry() {
  return {
    missingDrumKits: missingKeys(METAL_DRUM_KITS, METAL_DRUM_KIT_CONFIGS),
    missingBassTones: missingKeys(METAL_BASS_TONES, METAL_BASS_TONE_CONFIGS),
    missingChordInstruments: missingKeys(METAL_CHORD_INSTRUMENTS, METAL_CHORD_INSTRUMENT_CONFIGS),
    missingLeadInstruments: missingKeys(METAL_MELODY_INSTRUMENTS, METAL_LEAD_INSTRUMENT_CONFIGS)
  };
}

function missingKeys(ids, configs) {
  return ids.filter((id) => !configs[id]);
}
