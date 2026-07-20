import { WESTERN_BASS_TONES, WESTERN_CHORD_INSTRUMENTS, WESTERN_DRUM_KITS, WESTERN_MELODY_INSTRUMENTS } from "../presets/western.js";

export const WESTERN_DRUM_KIT_CONFIGS = Object.freeze({
  western_brush_kit: Object.freeze({ kick: Object.freeze({ startFreq: 118, endFreq: 42, sweepSeconds: 0.16, gainScale: 0.62 }), snare: Object.freeze({ noiseSeconds: 0.16, highpass: 780, lowpass: 3500, gainScale: 0.48, bodyFreq: 165, bodyGain: 0.04 }), hat: Object.freeze({ closedLength: 0.07, openLength: 0.2, highpassClosed: 3900, highpassOpen: 2900, gainScaleClosed: 0.48, gainScaleOpen: 0.56 }) }),
  western_train_kit: Object.freeze({ kick: Object.freeze({ startFreq: 138, endFreq: 44, sweepSeconds: 0.12, gainScale: 0.76 }), snare: Object.freeze({ noiseSeconds: 0.12, highpass: 980, lowpass: 4700, gainScale: 0.64, bodyFreq: 184, bodyGain: 0.05 }), hat: Object.freeze({ closedLength: 0.05, openLength: 0.16, highpassClosed: 4700, highpassOpen: 3300, gainScaleClosed: 0.54, gainScaleOpen: 0.62 }) })
});
export const WESTERN_BASS_TONE_CONFIGS = Object.freeze({
  western_upright: Object.freeze({ mainWave: "triangle", subWave: "sine", mainPeak: 0.74, subPeak: 0.26, cutoff: 490, subCutoff: 135, attack: 0.008 }),
  western_picked_bass: Object.freeze({ mainWave: "sawtooth", subWave: "sine", mainPeak: 0.62, subPeak: 0.32, cutoff: 760, subCutoff: 150, attack: 0.003 })
});
export const WESTERN_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  western_saloon_piano: Object.freeze({ rootWave: "triangle", wave: "triangle", peak: 0.19, filter: "lowpass", freq: 3500, filterQ: 1, attack: 0.002, decay: 0.12, sustain: 0.1, release: 0.16, durMul: 0.6, spreadMul: 0.58, maxLiveDur: 0.68, layers: Object.freeze([Object.freeze({ wave: "triangle", level: 0.86, detune: -8 }), Object.freeze({ wave: "triangle", level: 0.6, detune: 9 })]) }),
  western_mandolin_chop: Object.freeze({ rootWave: "triangle", wave: "square", peak: 0.12, filter: "bandpass", freq: 2400, filterQ: 1.1, attack: 0.002, decay: 0.06, sustain: 0.04, release: 0.09, durMul: 0.34, spreadMul: 0.72, maxLiveDur: 0.28, layers: Object.freeze([Object.freeze({ wave: "triangle", level: 0.8 }), Object.freeze({ wave: "square", freqMul: 2, level: 0.12 })]) })
});
export const WESTERN_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  western_harmonica: Object.freeze({ wave: "square", peak: 0.115, filter: "bandpass", freq: 1250, durMul: 1.18 }),
  western_banjo: Object.freeze({ wave: "triangle", peak: 0.13, filter: "bandpass", freq: 2200, durMul: 0.46 }),
  western_fiddle: Object.freeze({ wave: "sawtooth", peak: 0.11, filter: "bandpass", freq: 1750, durMul: 1.08 })
});
export const POCKET_WESTERN_SOUND_REGISTRY = Object.freeze({ drumKits: WESTERN_DRUM_KIT_CONFIGS, bassTones: WESTERN_BASS_TONE_CONFIGS, chordInstruments: WESTERN_CHORD_INSTRUMENT_CONFIGS, leadInstruments: WESTERN_LEAD_INSTRUMENT_CONFIGS });
export function validateWesternSoundRegistry() { const missing=(ids,cfg)=>ids.filter((id)=>!cfg[id]); return { missingDrumKits: missing(WESTERN_DRUM_KITS,WESTERN_DRUM_KIT_CONFIGS), missingBassTones: missing(WESTERN_BASS_TONES,WESTERN_BASS_TONE_CONFIGS), missingChordInstruments: missing(WESTERN_CHORD_INSTRUMENTS,WESTERN_CHORD_INSTRUMENT_CONFIGS), missingLeadInstruments: missing(WESTERN_MELODY_INSTRUMENTS,WESTERN_LEAD_INSTRUMENT_CONFIGS) }; }
