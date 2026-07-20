import { FUNK_BASS_TONES, FUNK_CHORD_INSTRUMENTS, FUNK_DRUM_KITS, FUNK_MELODY_INSTRUMENTS } from "../presets/funk.js";

export const FUNK_DRUM_KIT_CONFIGS = Object.freeze({
  funk_dry_pocket: kit(132, 44, 0.09, 178, 0.8, 0.048, 6500),
  funk_breakbeat: kit(148, 42, 0.12, 192, 0.92, 0.062, 7200)
});
export const FUNK_BASS_TONE_CONFIGS = Object.freeze({
  funk_finger_pocket: bass("triangle", "sine", 0.82, 0.3, 720, 155, 0.008),
  funk_slap_pop: bass("sawtooth", "sine", 0.7, 0.34, 1180, 170, 0.002),
  funk_muted_thump: bass("triangle", "sine", 0.48, 0.28, 410, 130, 0.002),
  funk_round_finger: bass("triangle", "sine", 0.76, 0.42, 520, 145, 0.014),
  funk_synth_pocket: bass("sawtooth", "triangle", 0.68, 0.3, 920, 180, 0.004)
});
export const FUNK_CHORD_INSTRUMENT_CONFIGS = Object.freeze({
  funk_clav_stab: chord("square", "bandpass", 2250, 0.004, 0.34, 0.15),
  funk_rhodes_stab: chord("triangle", "lowpass", 1900, 0.008, 0.56, 0.16),
  funk_brass_stack: chord("sawtooth", "bandpass", 1450, 0.01, 0.42, 0.13)
});
export const FUNK_LEAD_INSTRUMENT_CONFIGS = Object.freeze({
  funk_muted_trumpet: Object.freeze({ wave: "square", peak: 0.11, filter: "bandpass", freq: 1580, durMul: 0.48 }),
  funk_sax_punch: Object.freeze({ wave: "triangle", peak: 0.13, filter: "bandpass", freq: 980, durMul: 0.56 })
});
export const POCKET_FUNK_SOUND_REGISTRY = Object.freeze({ drumKits: FUNK_DRUM_KIT_CONFIGS, bassTones: FUNK_BASS_TONE_CONFIGS, chordInstruments: FUNK_CHORD_INSTRUMENT_CONFIGS, leadInstruments: FUNK_LEAD_INSTRUMENT_CONFIGS });

export function validateFunkSoundRegistry() {
  return { missingDrumKits: missing(FUNK_DRUM_KITS, FUNK_DRUM_KIT_CONFIGS), missingBassTones: missing(FUNK_BASS_TONES, FUNK_BASS_TONE_CONFIGS), missingChordInstruments: missing(FUNK_CHORD_INSTRUMENTS, FUNK_CHORD_INSTRUMENT_CONFIGS), missingLeadInstruments: missing(FUNK_MELODY_INSTRUMENTS, FUNK_LEAD_INSTRUMENT_CONFIGS) };
}
function kit(startFreq, endFreq, sweepSeconds, bodyFreq, snareGain, hatLength, hatHighpass) { return Object.freeze({ kick: Object.freeze({ startFreq, endFreq, sweepSeconds, gainScale: 0.9, length: 0.16 }), snare: Object.freeze({ noiseSeconds: 0.1, highpass: 1200, lowpass: 6800, gainScale: snareGain, bodyFreq, bodyGain: 0.08, length: 0.12 }), hat: Object.freeze({ closedLength: hatLength, openLength: 0.18, highpassClosed: hatHighpass, highpassOpen: 4300, gainScaleClosed: 0.58, gainScaleOpen: 0.72 }), rim: Object.freeze({ bodyFreq: 860, gainScale: 0.42 }), clap: Object.freeze({ highpass: 1250, gainScale: 0.55 }) }); }
function bass(mainWave, subWave, mainPeak, subPeak, cutoff, subCutoff, attack) { return Object.freeze({ mainWave, subWave, mainPeak, subPeak, cutoff, subCutoff, attack }); }
function chord(wave, filter, freq, attack, durMul, peak) { return Object.freeze({ rootWave: wave, wave, filter, freq, filterQ: 0.9, attack, decay: 0.08, sustain: 0.08, release: 0.1, durMul, spreadMul: 0.4, maxLiveDur: 0.42, peak, layers: Object.freeze([Object.freeze({ wave, level: 0.8 }), Object.freeze({ wave: "triangle", freqMul: 2, level: 0.18 })]) }); }
function missing(ids, configs) { return ids.filter((id) => !configs[id]); }
