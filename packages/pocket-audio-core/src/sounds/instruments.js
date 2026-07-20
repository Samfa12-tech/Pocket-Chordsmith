import {
  LOFI_CHORD_INSTRUMENT_CONFIGS,
  LOFI_LEAD_INSTRUMENT_CONFIGS
} from "./lofi-registry.js";
import {
  CHIP_CHORD_INSTRUMENT_CONFIGS,
  CHIP_LEAD_INSTRUMENT_CONFIGS
} from "./chip-registry.js";
import {
  METAL_CHORD_INSTRUMENT_CONFIGS,
  METAL_LEAD_INSTRUMENT_CONFIGS
} from "./metal-registry.js";
import { FUNK_CHORD_INSTRUMENT_CONFIGS, FUNK_LEAD_INSTRUMENT_CONFIGS } from "./funk-registry.js";
import { WESTERN_CHORD_INSTRUMENT_CONFIGS, WESTERN_LEAD_INSTRUMENT_CONFIGS } from "./western-registry.js";

export const POCKET_CHORD_INSTRUMENTS = Object.freeze([
  "pocket",
  "piano",
  "saloon_piano",
  "harp",
  "warm_pad",
  "glass",
  "dusty_rhodes",
  "felt_piano",
  "cassette_keys",
  "muted_jazz_guitar",
  "lofi_warm_pad",
  "chip_square_stack",
  "chip_triangle_pad",
  "chip_arp_keys",
  "modern_chip_poly",
  "metal_power_stack",
  "dark_organ_stack"
  ,"funk_clav_stab", "funk_rhodes_stab", "funk_brass_stack"
  ,"western_saloon_piano", "western_mandolin_chop"
]);

export const DEFAULT_CHORD_INSTRUMENT = "pocket";

export const POCKET_MELODY_INSTRUMENTS = Object.freeze([
  "pulse",
  "soft",
  "synth",
  "bell",
  "lead_guitar",
  "distorted_lead_guitar",
  "banjo",
  "harmonica",
  "cowboy_whistle",
  "trumpet",
  "saxophone",
  "mellow_vibes",
  "soft_pluck",
  "mellow_sax",
  "muted_trumpet",
  "tape_bell",
  "chip_square_lead",
  "chip_pulse_lead",
  "chip_triangle_blip",
  "chip_bell_stack",
  "modern_chip_lead",
  "shred_lead_guitar",
  "twin_harmony_lead"
  ,"funk_muted_trumpet", "funk_sax_punch"
  ,"western_harmonica", "western_banjo", "western_fiddle"
]);

export const DEFAULT_MELODY_INSTRUMENT = "pulse";

export const CLASSIC_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  pocket: Object.freeze({
    rootWave: "triangle",
    wave: "sine",
    peak: 0.24,
    filter: "lowpass",
    freq: 1800,
    filterQ: 0.8,
    attack: 0.01,
    decay: 0.06,
    sustain: 0.7,
    release: 0.2,
    durMul: 1,
    spreadMul: 1,
    shimmer: false,
    maxLiveDur: 1.15,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.82 }),
      Object.freeze({ wave: "sine", level: 0.35 })
    ])
  }),
  piano: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.23,
    filter: "lowpass",
    freq: 3100,
    filterQ: 0.9,
    attack: 0.003,
    decay: 0.18,
    sustain: 0.18,
    release: 0.16,
    durMul: 0.72,
    spreadMul: 0.45,
    shimmer: false,
    maxLiveDur: 0.82,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 1 }),
      Object.freeze({ wave: "sine", freqMul: 2, level: 0.18, detune: 3 })
    ])
  }),
  saloon_piano: Object.freeze({
    rootWave: "triangle",
    wave: "triangle",
    peak: 0.205,
    filter: "lowpass",
    freq: 3600,
    filterQ: 1,
    attack: 0.002,
    decay: 0.13,
    sustain: 0.12,
    release: 0.18,
    durMul: 0.62,
    spreadMul: 0.58,
    shimmer: false,
    maxLiveDur: 0.7,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.88, detune: -8 }),
      Object.freeze({ wave: "triangle", level: 0.62, detune: 9 }),
      Object.freeze({ wave: "sine", freqMul: 2, level: 0.16, detune: 5 })
    ])
  }),
  harp: Object.freeze({
    rootWave: "triangle",
    wave: "sine",
    peak: 0.18,
    filter: "lowpass",
    freq: 4600,
    filterQ: 1.4,
    attack: 0.002,
    decay: 0.1,
    sustain: 0.03,
    release: 0.36,
    durMul: 0.5,
    spreadMul: 1.45,
    shimmer: true,
    maxLiveDur: 0.58,
    layers: Object.freeze([
      Object.freeze({ wave: "triangle", level: 0.9 }),
      Object.freeze({ wave: "sine", freqMul: 2, level: 0.26, detune: 7 })
    ])
  }),
  warm_pad: Object.freeze({
    rootWave: "sine",
    wave: "triangle",
    peak: 0.14,
    filter: "lowpass",
    freq: 1200,
    filterQ: 0.65,
    filterSweep: 1700,
    attack: 0.11,
    decay: 0.24,
    sustain: 0.82,
    release: 0.62,
    durMul: 1.35,
    spreadMul: 0.25,
    shimmer: false,
    maxLiveDur: 1.65,
    layers: Object.freeze([
      Object.freeze({ wave: "sine", level: 0.95, detune: -5 }),
      Object.freeze({ wave: "triangle", level: 0.48, detune: 6 })
    ])
  }),
  glass: Object.freeze({
    rootWave: "sine",
    wave: "sine",
    peak: 0.16,
    filter: "bandpass",
    freq: 1500,
    filterQ: 1.15,
    attack: 0.004,
    decay: 0.2,
    sustain: 0.1,
    release: 0.44,
    durMul: 0.9,
    spreadMul: 0.85,
    shimmer: true,
    maxLiveDur: 0.82,
    layers: Object.freeze([
      Object.freeze({ wave: "sine", level: 0.36 }),
      Object.freeze({ wave: "sine", freqMul: 2.01, level: 0.64 }),
      Object.freeze({ wave: "sine", freqMul: 4.02, level: 0.34 }),
      Object.freeze({ wave: "triangle", freqMul: 6.01, level: 0.12 })
    ])
  })
});

export const POCKET_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  ...CLASSIC_CHORD_INSTRUMENT_CONFIGS,
  ...LOFI_CHORD_INSTRUMENT_CONFIGS,
  ...CHIP_CHORD_INSTRUMENT_CONFIGS,
  ...METAL_CHORD_INSTRUMENT_CONFIGS,
  ...FUNK_CHORD_INSTRUMENT_CONFIGS,
  ...WESTERN_CHORD_INSTRUMENT_CONFIGS
});

export const CLASSIC_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  pulse: Object.freeze({
    wave: "square",
    peak: 0.2,
    filter: "lowpass",
    freq: 2300,
    durMul: 1
  }),
  soft: Object.freeze({
    wave: "triangle",
    peak: 0.16,
    filter: "lowpass",
    freq: 1700,
    durMul: 1
  }),
  synth: Object.freeze({
    wave: "sawtooth",
    peak: 0.18,
    filter: "lowpass",
    freq: 1500,
    durMul: 0.95
  }),
  bell: Object.freeze({
    wave: "sine",
    peak: 0.105,
    filter: "lowpass",
    freq: 2600,
    durMul: 1.05,
    extras: Object.freeze([
      Object.freeze({ freqMul: 2, wave: "sine", peak: 0.022, peakScale: 0.16, filter: "lowpass", freq: 3200, offset: 0.012, durMul: 0.42 })
    ])
  }),
  lead_guitar: Object.freeze({
    wave: "sawtooth",
    peak: 0.16,
    filter: "bandpass",
    freq: 1800,
    durMul: 0.92,
    extras: Object.freeze([
      Object.freeze({ freqMul: 1.006, wave: "square", peak: 0.035, peakScale: 0.2, filter: "lowpass", freq: 2600, offset: 0.006, durMul: 0.72 })
    ])
  }),
  distorted_lead_guitar: Object.freeze({
    wave: "sawtooth",
    peak: 0.13,
    filter: "lowpass",
    freq: 2400,
    durMul: 0.86,
    extras: Object.freeze([
      Object.freeze({ freqMul: 0.996, wave: "square", peak: 0.05, peakScale: 0.34, filter: "bandpass", freq: 2100, offset: 0.004, durMul: 0.68 })
    ])
  }),
  banjo: Object.freeze({
    wave: "triangle",
    peak: 0.13,
    filter: "bandpass",
    freq: 2100,
    durMul: 0.48,
    extras: Object.freeze([
      Object.freeze({ freqMul: 2.01, wave: "triangle", peak: 0.028, peakScale: 0.18, filter: "highpass", freq: 1500, offset: 0.004, durMul: 0.38, maxDur: 0.09 }),
      Object.freeze({ freqMul: 0.997, wave: "square", peak: 0.018, peakScale: 0.13, filter: "bandpass", freq: 2600, offset: 0.012, durMul: 0.48, maxDur: 0.13 })
    ])
  }),
  harmonica: Object.freeze({
    wave: "square",
    peak: 0.115,
    filter: "bandpass",
    freq: 1250,
    durMul: 1.18,
    extras: Object.freeze([
      Object.freeze({ freqMul: 1.004, wave: "triangle", peak: 0.035, peakScale: 0.24, filter: "bandpass", freq: 860, offset: 0.006, durMul: 0.92 }),
      Object.freeze({ freqMul: 2, wave: "square", peak: 0.012, peakScale: 0.08, filter: "bandpass", freq: 2100, offset: 0.014, durMul: 0.42 })
    ])
  }),
  cowboy_whistle: Object.freeze({
    wave: "sine",
    peak: 0.1,
    filter: "lowpass",
    freq: 3200,
    durMul: 1.12,
    extras: Object.freeze([
      Object.freeze({ freqMul: 2, wave: "sine", peak: 0.014, peakScale: 0.14, filter: "lowpass", freq: 3600, offset: 0.01, durMul: 0.65 })
    ])
  }),
  trumpet: Object.freeze({
    wave: "square",
    peak: 0.14,
    filter: "bandpass",
    freq: 1650,
    durMul: 1.05,
    extras: Object.freeze([
      Object.freeze({ freqMul: 1, slideFreqMul: 2, midiOffset: 12, wave: "sawtooth", peak: 0.018, peakScale: 0.13, filter: "bandpass", freq: 2400, offset: 0.008, durMul: 0.35 })
    ])
  }),
  saxophone: Object.freeze({
    wave: "triangle",
    peak: 0.17,
    filter: "bandpass",
    freq: 940,
    durMul: 1.12,
    extras: Object.freeze([
      Object.freeze({ freqMul: 1, slideFreqMul: 0.5, midiOffset: -12, wave: "sine", peak: 0.03, peakScale: 0.18, filter: "lowpass", freq: 760, offset: 0.004, durMul: 0.42 })
    ])
  })
});

export const POCKET_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  ...CLASSIC_LEAD_INSTRUMENT_CONFIGS,
  ...LOFI_LEAD_INSTRUMENT_CONFIGS,
  ...CHIP_LEAD_INSTRUMENT_CONFIGS,
  ...METAL_LEAD_INSTRUMENT_CONFIGS,
  ...FUNK_LEAD_INSTRUMENT_CONFIGS,
  ...WESTERN_LEAD_INSTRUMENT_CONFIGS
});

export function findPocketChordInstrumentConfig(name) {
  return POCKET_CHORD_INSTRUMENT_CONFIGS[name] || POCKET_CHORD_INSTRUMENT_CONFIGS[DEFAULT_CHORD_INSTRUMENT];
}

export function findPocketLeadInstrumentConfig(name) {
  return POCKET_LEAD_INSTRUMENT_CONFIGS[name] || POCKET_LEAD_INSTRUMENT_CONFIGS[DEFAULT_MELODY_INSTRUMENT];
}

export function pocketLeadExtraLayers(config) {
  if (!config) return [];
  if (Array.isArray(config.extras)) return config.extras;
  if (config.extra) return [config.extra];
  return [];
}

export function validatePocketInstrumentRegistry() {
  return {
    missingChordConfigs: POCKET_CHORD_INSTRUMENTS.filter((id) => !POCKET_CHORD_INSTRUMENT_CONFIGS[id]),
    missingLeadConfigs: POCKET_MELODY_INSTRUMENTS.filter((id) => !POCKET_LEAD_INSTRUMENT_CONFIGS[id])
  };
}
