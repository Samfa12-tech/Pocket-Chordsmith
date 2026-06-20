import {
  CHIP_BASS_TONES,
  CHIP_CHORD_INSTRUMENTS,
  CHIP_DRUM_KITS,
  CHIP_MELODY_INSTRUMENTS
} from "../presets/chip.js";

export const CHIP_DRUM_KIT_CONFIGS = Object.freeze({
  chip_noise_kit: Object.freeze({
    kick: Object.freeze({ startFreq: 210, endFreq: 55, sweepSeconds: 0.075, filterFreq: 1900, gainFloor: 0.05, gainScale: 0.7, length: 0.11, rampSeconds: 0.095 }),
    snare: Object.freeze({ noiseSeconds: 0.075, highpass: 1500, lowpass: 6200, gainFloor: 0.035, gainScale: 0.72, length: 0.08, rampSeconds: 0.07, bodyFreq: 260, bodyGain: 0.028, bodyLength: 0.055, bodyRampSeconds: 0.05 }),
    hat: Object.freeze({ closedLength: 0.035, openLength: 0.12, highpassClosed: 5200, highpassOpen: 3600, lowpass: 9400, gainFloorClosed: 0.018, gainFloorOpen: 0.03, gainScaleClosed: 0.68, gainScaleOpen: 0.72, rampSecondsClosed: 0.03, rampSecondsOpen: 0.105 })
  }),
  chip_arcade_kit: Object.freeze({
    kick: Object.freeze({ startFreq: 185, endFreq: 48, sweepSeconds: 0.095, filterFreq: 1400, gainFloor: 0.055, gainScale: 0.78, length: 0.14, rampSeconds: 0.12 }),
    snare: Object.freeze({ noiseSeconds: 0.09, highpass: 1300, lowpass: 5600, gainFloor: 0.04, gainScale: 0.68, length: 0.1, rampSeconds: 0.085, bodyFreq: 220, bodyGain: 0.032, bodyLength: 0.075, bodyRampSeconds: 0.065 }),
    hat: Object.freeze({ closedLength: 0.04, openLength: 0.145, highpassClosed: 5000, highpassOpen: 3300, lowpass: 9000, gainFloorClosed: 0.018, gainFloorOpen: 0.032, gainScaleClosed: 0.66, gainScaleOpen: 0.72, rampSecondsClosed: 0.034, rampSecondsOpen: 0.12 })
  }),
  modern_chip_punch: Object.freeze({
    kick: Object.freeze({ startFreq: 150, endFreq: 38, sweepSeconds: 0.145, filterFreq: 230, gainFloor: 0.06, gainScale: 0.88, length: 0.18, rampSeconds: 0.16 }),
    snare: Object.freeze({ noiseSeconds: 0.105, highpass: 980, lowpass: 4800, gainFloor: 0.04, gainScale: 0.76, length: 0.12, rampSeconds: 0.1, bodyFreq: 190, bodyGain: 0.046, bodyLength: 0.095, bodyRampSeconds: 0.08 }),
    hat: Object.freeze({ closedLength: 0.045, openLength: 0.17, highpassClosed: 4300, highpassOpen: 3000, lowpass: 7800, gainFloorClosed: 0.02, gainFloorOpen: 0.035, gainScaleClosed: 0.7, gainScaleOpen: 0.78, rampSecondsClosed: 0.04, rampSecondsOpen: 0.145 })
  })
});

export const CHIP_BASS_TONE_CONFIGS = Object.freeze({
  chip_triangle_bass: Object.freeze({ mainWave: "triangle", subWave: "sine", mainPeak: 0.88, subPeak: 0.25, cutoff: 520, subCutoff: 180, attack: 0.004 }),
  chip_square_bass: Object.freeze({ mainWave: "square", subWave: "triangle", mainPeak: 0.72, subPeak: 0.22, cutoff: 680, subCutoff: 220, attack: 0.002 }),
  modern_chip_sub: Object.freeze({ mainWave: "square", subWave: "sine", mainPeak: 0.64, subPeak: 0.62, cutoff: 420, subCutoff: 150, attack: 0.006 }),
  bitcrush_bass: Object.freeze({ mainWave: "sawtooth", subWave: "square", mainPeak: 0.58, subPeak: 0.34, cutoff: 560, subCutoff: 210, attack: 0.003 })
});

export const CHIP_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  chip_square_stack: Object.freeze({
    rootWave: "square",
    wave: "square",
    peak: 0.16,
    filter: "lowpass",
    freq: 3600,
    filterQ: 0.8,
    attack: 0.002,
    decay: 0.08,
    sustain: 0.48,
    release: 0.14,
    durMul: 0.82,
    spreadMul: 0.16,
    shimmer: false,
    maxLiveDur: 0.68,
    layers: Object.freeze([
      Object.freeze({ wave: "square", level: 0.72 }),
      Object.freeze({ wave: "square", level: 0.38, detune: 6 }),
      Object.freeze({ wave: "triangle", freqMul: 2, level: 0.12 })
    ])
  }),
  chip_triangle_pad: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.125,
    filter: "lowpass",
    freq: 2200,
    filterQ: 0.62,
    attack: 0.055,
    decay: 0.16,
    sustain: 0.72,
    release: 0.34,
    durMul: 1.18,
    spreadMul: 0.12,
    shimmer: false,
    maxLiveDur: 1.2,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.8 }),
      Object.freeze({ wave: "sine", freqMul: 2, level: 0.18 })
    ])
  }),
  chip_arp_keys: Object.freeze({
    rootWave: "square",
    wave: "square",
    peak: 0.135,
    filter: "bandpass",
    freq: 1850,
    filterQ: 1.1,
    attack: 0.001,
    decay: 0.055,
    sustain: 0.16,
    release: 0.12,
    durMul: 0.46,
    spreadMul: 0.72,
    shimmer: true,
    maxLiveDur: 0.36,
    layers: Object.freeze([
      Object.freeze({ wave: "square", level: 0.74 }),
      Object.freeze({ wave: "triangle", freqMul: 2, level: 0.16, detune: -4 })
    ])
  }),
  modern_chip_poly: Object.freeze({
    rootWave: "square",
    wave: "sawtooth",
    peak: 0.142,
    filter: "lowpass",
    freq: 2550,
    filterQ: 0.78,
    filterSweep: 3400,
    attack: 0.008,
    decay: 0.13,
    sustain: 0.54,
    release: 0.22,
    durMul: 0.96,
    spreadMul: 0.28,
    shimmer: true,
    maxLiveDur: 0.92,
    layers: Object.freeze([
      Object.freeze({ wave: "square", level: 0.62, detune: -7 }),
      Object.freeze({ wave: "sawtooth", level: 0.4, detune: 8 }),
      Object.freeze({ wave: "triangle", freqMul: 0.5, level: 0.22 })
    ])
  })
});

export const CHIP_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  chip_square_lead: Object.freeze({
    wave: "square",
    peak: 0.155,
    filter: "lowpass",
    freq: 4200,
    durMul: 0.88,
    extras: Object.freeze([
      Object.freeze({ freqMul: 2, wave: "triangle", peak: 0.018, peakScale: 0.12, filter: "lowpass", freq: 5200, offset: 0.004, durMul: 0.42, maxDur: 0.12 })
    ])
  }),
  chip_pulse_lead: Object.freeze({
    wave: "square",
    peak: 0.135,
    filter: "bandpass",
    freq: 2400,
    durMul: 0.76,
    extras: Object.freeze([
      Object.freeze({ freqMul: 1.005, slideFreqMul: 1.008, wave: "square", peak: 0.026, peakScale: 0.16, filter: "lowpass", freq: 3600, offset: 0.006, durMul: 0.62 })
    ])
  }),
  chip_triangle_blip: Object.freeze({
    wave: "triangle",
    peak: 0.12,
    filter: "lowpass",
    freq: 3100,
    durMul: 0.54,
    extras: Object.freeze([
      Object.freeze({ freqMul: 2, wave: "sine", peak: 0.012, peakScale: 0.1, filter: "lowpass", freq: 4200, offset: 0.004, durMul: 0.28, maxDur: 0.08 })
    ])
  }),
  chip_bell_stack: Object.freeze({
    wave: "sine",
    peak: 0.108,
    filter: "lowpass",
    freq: 3900,
    durMul: 1.05,
    extras: Object.freeze([
      Object.freeze({ freqMul: 2.003, midiOffset: 12, wave: "sine", peak: 0.024, peakScale: 0.18, filter: "lowpass", freq: 4800, offset: 0.012, durMul: 0.5, maxDur: 0.18 }),
      Object.freeze({ freqMul: 3.01, wave: "triangle", peak: 0.01, peakScale: 0.08, filter: "highpass", freq: 2100, offset: 0.018, durMul: 0.38, maxDur: 0.14 })
    ])
  }),
  modern_chip_lead: Object.freeze({
    wave: "square",
    peak: 0.138,
    filter: "lowpass",
    freq: 3600,
    durMul: 0.86,
    extras: Object.freeze([
      Object.freeze({ freqMul: 1.997, midiOffset: 12, wave: "triangle", peak: 0.02, peakScale: 0.14, filter: "lowpass", freq: 4300, offset: 0.005, durMul: 0.58, maxDur: 0.16 }),
      Object.freeze({ freqMul: 0.5, midiOffset: -12, wave: "square", peak: 0.012, peakScale: 0.09, filter: "lowpass", freq: 1600, offset: 0.002, durMul: 0.68, maxDur: 0.18 })
    ])
  })
});

export const POCKET_CHIP_SOUND_REGISTRY = Object.freeze({
  drumKits: CHIP_DRUM_KIT_CONFIGS,
  bassTones: CHIP_BASS_TONE_CONFIGS,
  chordInstruments: CHIP_CHORD_INSTRUMENT_CONFIGS,
  leadInstruments: CHIP_LEAD_INSTRUMENT_CONFIGS
});

export function validateChipSoundRegistry() {
  return {
    missingDrumKits: missingKeys(CHIP_DRUM_KITS, CHIP_DRUM_KIT_CONFIGS),
    missingBassTones: missingKeys(CHIP_BASS_TONES, CHIP_BASS_TONE_CONFIGS),
    missingChordInstruments: missingKeys(CHIP_CHORD_INSTRUMENTS, CHIP_CHORD_INSTRUMENT_CONFIGS),
    missingLeadInstruments: missingKeys(CHIP_MELODY_INSTRUMENTS, CHIP_LEAD_INSTRUMENT_CONFIGS)
  };
}

function missingKeys(ids, configs) {
  return ids.filter((id) => !configs[id]);
}
