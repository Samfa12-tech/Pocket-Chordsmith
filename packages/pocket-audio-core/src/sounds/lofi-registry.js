import {
  LOFI_BASS_TONES,
  LOFI_CHORD_INSTRUMENTS,
  LOFI_DRUM_KITS,
  LOFI_MELODY_INSTRUMENTS
} from "../presets/lofi.js";
import { CHIP_BASS_TONES, CHIP_DRUM_KITS } from "../presets/chip.js";
import {
  CHIP_BASS_TONE_CONFIGS,
  CHIP_DRUM_KIT_CONFIGS,
  POCKET_CHIP_SOUND_REGISTRY,
  validateChipSoundRegistry
} from "./chip-registry.js";

export const CLASSIC_DRUM_KIT_CONFIG = Object.freeze({
  kick: Object.freeze({ startFreq: 155, endFreq: 45, sweepSeconds: 0.14, gainFloor: 0.08, gainScale: 1, length: 0.17, rampSeconds: 0.16 }),
  snare: Object.freeze({ noiseSeconds: 0.12, highpass: 1700, gainFloor: 0.05, gainScale: 1, length: 0.13, rampSeconds: 0.12 }),
  hat: Object.freeze({ closedLength: 0.05, openLength: 0.16, highpassClosed: 5600, highpassOpen: 3800, gainFloorClosed: 0.03, gainFloorOpen: 0.05, gainScaleClosed: 1, gainScaleOpen: 1, rampSecondsClosed: 0.05, rampSecondsOpen: 0.14 })
});

export const LOFI_DRUM_KIT_CONFIGS = Object.freeze({
  lofi_dusty: Object.freeze({
    kick: Object.freeze({ startFreq: 132, endFreq: 42, sweepSeconds: 0.18, filterFreq: 170, gainFloor: 0.04, gainScale: 0.58, length: 0.23, rampSeconds: 0.21 }),
    snare: Object.freeze({ noiseSeconds: 0.13, highpass: 980, lowpass: 2800, gainFloor: 0.035, gainScale: 0.52, length: 0.14, rampSeconds: 0.12, bodyFreq: 185, bodyGain: 0.035, bodyLength: 0.11, bodyRampSeconds: 0.09 }),
    hat: Object.freeze({ closedLength: 0.065, openLength: 0.2, highpassClosed: 3400, highpassOpen: 2600, lowpass: 6200, gainFloorClosed: 0.02, gainFloorOpen: 0.035, gainScaleClosed: 0.55, gainScaleOpen: 0.62, rampSecondsClosed: 0.055, rampSecondsOpen: 0.18 })
  }),
  lofi_brush: Object.freeze({
    kick: Object.freeze({ startFreq: 132, endFreq: 42, sweepSeconds: 0.18, filterFreq: 135, gainFloor: 0.04, gainScale: 0.48, length: 0.23, rampSeconds: 0.21 }),
    snare: Object.freeze({ noiseSeconds: 0.18, highpass: 720, lowpass: 2800, gainFloor: 0.035, gainScale: 0.46, length: 0.2, rampSeconds: 0.18, bodyFreq: 150, bodyGain: 0.035, bodyLength: 0.11, bodyRampSeconds: 0.09 }),
    hat: Object.freeze({ closedLength: 0.065, openLength: 0.2, highpassClosed: 3400, highpassOpen: 2600, lowpass: 6200, gainFloorClosed: 0.02, gainFloorOpen: 0.035, gainScaleClosed: 0.55, gainScaleOpen: 0.62, rampSecondsClosed: 0.055, rampSecondsOpen: 0.18 })
  }),
  lofi_tape_soft: Object.freeze({
    kick: Object.freeze({ startFreq: 118, endFreq: 42, sweepSeconds: 0.18, filterFreq: 170, gainFloor: 0.04, gainScale: 0.58, length: 0.23, rampSeconds: 0.21 }),
    snare: Object.freeze({ noiseSeconds: 0.13, highpass: 980, lowpass: 2200, gainFloor: 0.035, gainScale: 0.52, length: 0.14, rampSeconds: 0.12, bodyFreq: 185, bodyGain: 0.035, bodyLength: 0.11, bodyRampSeconds: 0.09 }),
    hat: Object.freeze({ closedLength: 0.065, openLength: 0.2, highpassClosed: 3400, highpassOpen: 2600, lowpass: 5200, gainFloorClosed: 0.02, gainFloorOpen: 0.035, gainScaleClosed: 0.55, gainScaleOpen: 0.62, rampSecondsClosed: 0.055, rampSecondsOpen: 0.18 })
  })
});

export const POCKET_DRUM_KIT_CONFIGS = Object.freeze({
  classic: CLASSIC_DRUM_KIT_CONFIG,
  ...LOFI_DRUM_KIT_CONFIGS,
  ...CHIP_DRUM_KIT_CONFIGS
});

export const DEFAULT_CLASSIC_DRUM_KIT = "classic";
export const DEFAULT_LOFI_DRUM_KIT = "lofi_dusty";
export const DEFAULT_CHIP_DRUM_KIT = "chip_noise_kit";

export const CLASSIC_BASS_TONE_CONFIG = Object.freeze({
  mainWave: "sawtooth",
  subWave: "sine",
  mainPeak: 1,
  subPeak: 0.42,
  cutoff: 420,
  subCutoff: 220,
  attack: 0.01
});

export const LOFI_BASS_TONE_CONFIGS = Object.freeze({
  warm_sub: Object.freeze({ mainWave: "sine", subWave: "sine", mainPeak: 0.82, subPeak: 0.55, cutoff: 210, subCutoff: 120, attack: 0.018 }),
  soft_upright: Object.freeze({ mainWave: "triangle", subWave: "sine", mainPeak: 0.72, subPeak: 0.28, cutoff: 360, subCutoff: 140, attack: 0.008 }),
  rounded_triangle_bass: Object.freeze({ mainWave: "triangle", subWave: "sine", mainPeak: 0.84, subPeak: 0.34, cutoff: 300, subCutoff: 130, attack: 0.012 })
});

export const POCKET_BASS_TONE_CONFIGS = Object.freeze({
  classic: CLASSIC_BASS_TONE_CONFIG,
  ...LOFI_BASS_TONE_CONFIGS,
  ...CHIP_BASS_TONE_CONFIGS
});

export const DEFAULT_CLASSIC_BASS_TONE = "classic";

export function resolvePocketDrumKitId(drumKit, audioProfile = "", lofiPreset = "") {
  const requested = String(drumKit || "");
  if (POCKET_DRUM_KIT_CONFIGS[requested]) return requested;
  if (isPocketChipActive(audioProfile, lofiPreset)) return DEFAULT_CHIP_DRUM_KIT;
  return isPocketLofiActive(audioProfile, lofiPreset) ? DEFAULT_LOFI_DRUM_KIT : DEFAULT_CLASSIC_DRUM_KIT;
}

export function resolvePocketBassToneId(bassTone) {
  const requested = String(bassTone || "");
  return POCKET_BASS_TONE_CONFIGS[requested] ? requested : DEFAULT_CLASSIC_BASS_TONE;
}

export function isPocketLofiActive(audioProfile = "", lofiPreset = "") {
  return audioProfile === "lofi_chill" || String(lofiPreset || "").startsWith("lofi_");
}

export function isPocketChipActive(audioProfile = "", chipPreset = "") {
  return audioProfile === "chip_tune" || String(chipPreset || "").startsWith("chip_");
}

export const LOFI_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  dusty_rhodes: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.155,
    filter: "lowpass",
    freq: 1550,
    filterQ: 0.72,
    attack: 0.012,
    decay: 0.18,
    sustain: 0.44,
    release: 0.34,
    durMul: 0.96,
    spreadMul: 0.38,
    shimmer: false,
    maxLiveDur: 1.05,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.82, detune: -4 }),
      Object.freeze({ wave: "sine", freqMul: 2.01, level: 0.21, detune: 5 }),
      Object.freeze({ wave: "sine", freqMul: 3.01, level: 0.045, detune: -8 })
    ])
  }),
  felt_piano: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.145,
    filter: "lowpass",
    freq: 1900,
    filterQ: 0.82,
    attack: 0.006,
    decay: 0.24,
    sustain: 0.22,
    release: 0.42,
    durMul: 0.82,
    spreadMul: 0.34,
    shimmer: false,
    maxLiveDur: 0.96,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.78 }),
      Object.freeze({ wave: "sine", freqMul: 2, level: 0.16, detune: -3 })
    ])
  }),
  cassette_keys: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.135,
    filter: "lowpass",
    freq: 1320,
    filterQ: 0.7,
    attack: 0.018,
    decay: 0.18,
    sustain: 0.54,
    release: 0.44,
    durMul: 1.04,
    spreadMul: 0.45,
    shimmer: false,
    maxLiveDur: 1.22,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.72, detune: -9 }),
      Object.freeze({ wave: "triangle", level: 0.5, detune: 10 }),
      Object.freeze({ wave: "sine", freqMul: 2, level: 0.12, detune: 3 })
    ])
  }),
  muted_jazz_guitar: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.132,
    filter: "bandpass",
    freq: 1180,
    filterQ: 0.95,
    attack: 0.004,
    decay: 0.09,
    sustain: 0.08,
    release: 0.16,
    durMul: 0.5,
    spreadMul: 0.72,
    shimmer: false,
    maxLiveDur: 0.42,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.8 }),
      Object.freeze({ wave: "square", level: 0.11, detune: -5 })
    ])
  }),
  lofi_warm_pad: Object.freeze({
    rootWave: "sine",
    wave: "triangle",
    peak: 0.115,
    filter: "lowpass",
    freq: 930,
    filterQ: 0.58,
    filterSweep: 1180,
    attack: 0.18,
    decay: 0.3,
    sustain: 0.86,
    release: 0.72,
    durMul: 1.48,
    spreadMul: 0.22,
    shimmer: false,
    maxLiveDur: 1.85,
    layers: Object.freeze([
      Object.freeze({ wave: "sine", level: 0.92, detune: -7 }),
      Object.freeze({ wave: "triangle", level: 0.42, detune: 7 })
    ])
  })
});

export const LOFI_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  mellow_vibes: Object.freeze({ wave: "sine", peak: 0.105, filter: "lowpass", freq: 2100, durMul: 1.15, extra: Object.freeze({ freqMul: 1, slideFreqMul: 2, midiOffset: 12, wave: "sine", peak: 0.018, peakScale: 0.17, filter: "lowpass", freq: 2400, offset: 0.01, durMul: 0.48, maxDur: 0.18 }) }),
  soft_pluck: Object.freeze({ wave: "triangle", peak: 0.112, filter: "lowpass", freq: 1650, durMul: 0.62, extra: Object.freeze({ freqMul: 2, wave: "sine", peak: 0.014, peakScale: 0.13, filter: "lowpass", freq: 2200, offset: 0.004, durMul: 0.45, maxDur: 0.12 }) }),
  mellow_sax: Object.freeze({ wave: "triangle", peak: 0.118, filter: "bandpass", freq: 820, durMul: 1.18, extra: Object.freeze({ freqMul: 1, slideFreqMul: 0.5, midiOffset: -12, wave: "sine", peak: 0.018, peakScale: 0.15, filter: "lowpass", freq: 640, offset: 0.004, durMul: 0.46 }) }),
  muted_trumpet: Object.freeze({ wave: "square", peak: 0.095, filter: "bandpass", freq: 1180, durMul: 0.98, extra: Object.freeze({ freqMul: 1, slideFreqMul: 2, midiOffset: 12, wave: "triangle", peak: 0.012, peakScale: 0.13, filter: "bandpass", freq: 1700, offset: 0.006, durMul: 0.28 }) }),
  tape_bell: Object.freeze({ wave: "sine", peak: 0.088, filter: "lowpass", freq: 1900, durMul: 1.04, extra: Object.freeze({ freqMul: 0.997, slideFreqMul: 1.994, midiOffset: 12, wave: "sine", peak: 0.014, peakScale: 0.16, filter: "lowpass", freq: 2100, offset: 0.016, durMul: 0.38 }) })
});

export const POCKET_LOFI_SOUND_REGISTRY = Object.freeze({
  drumKits: LOFI_DRUM_KIT_CONFIGS,
  bassTones: LOFI_BASS_TONE_CONFIGS,
  chordInstruments: LOFI_CHORD_INSTRUMENT_CONFIGS,
  leadInstruments: LOFI_LEAD_INSTRUMENT_CONFIGS
});

export const POCKET_SOUND_REGISTRY = Object.freeze({
  drumKits: POCKET_DRUM_KIT_CONFIGS,
  bassTones: POCKET_BASS_TONE_CONFIGS,
  lofi: POCKET_LOFI_SOUND_REGISTRY,
  chip: POCKET_CHIP_SOUND_REGISTRY
});

export function validateLofiSoundRegistry() {
  return {
    missingDrumKits: missingKeys(LOFI_DRUM_KITS, LOFI_DRUM_KIT_CONFIGS),
    missingBassTones: missingKeys(LOFI_BASS_TONES, LOFI_BASS_TONE_CONFIGS),
    missingChordInstruments: missingKeys(LOFI_CHORD_INSTRUMENTS, LOFI_CHORD_INSTRUMENT_CONFIGS),
    missingLeadInstruments: missingKeys(LOFI_MELODY_INSTRUMENTS, LOFI_LEAD_INSTRUMENT_CONFIGS)
  };
}

export function validatePocketSoundRegistry() {
  return {
    missingDrumKits: missingKeys(["classic", ...LOFI_DRUM_KITS.filter((id) => id !== "classic"), ...CHIP_DRUM_KITS], POCKET_DRUM_KIT_CONFIGS),
    missingBassTones: missingKeys(["classic", ...LOFI_BASS_TONES, ...CHIP_BASS_TONES], POCKET_BASS_TONE_CONFIGS),
    lofi: validateLofiSoundRegistry(),
    chip: validateChipSoundRegistry()
  };
}

function missingKeys(ids, configs) {
  return ids.filter((id) => !configs[id]);
}
