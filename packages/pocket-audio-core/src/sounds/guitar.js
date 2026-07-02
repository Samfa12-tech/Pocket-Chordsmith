export const POCKET_GUITAR_ARTICULATIONS = Object.freeze(["off", "open", "chug", "accent", "hold", "scratch"]);

export const POCKET_GUITAR_STEP_CYCLE = Object.freeze(["off", "chug", "accent", "hold", "scratch"]);

export const POCKET_GUITAR_TONES = Object.freeze(["clean", "crunch", "high_gain", "metal", "tight_metal", "doom_fuzz", "western_twang"]);
export const DEFAULT_GUITAR_TONE = "high_gain";

export const POCKET_GUITAR_REGISTERS = Object.freeze(["low", "mid", "high"]);
export const DEFAULT_GUITAR_REGISTER = "low";

export const POCKET_GUITAR_STRUM_MODES = Object.freeze(["down", "up", "alternate"]);
export const DEFAULT_GUITAR_STRUM_MODE = "down";

export const POCKET_GUITAR_PATTERN_PRESETS = Object.freeze([
  "rock_eighths",
  "punk_downstrokes",
  "metal_chug",
  "gallop",
  "doom_slow",
  "thrash_gallop",
  "tremolo_drive",
  "breakdown_stabs",
  "verse_chorus",
  "boom_chick",
  "train_chop",
  "western_waltz"
]);

export const POCKET_GUITAR_FILL_STYLES = Object.freeze(["gentle_strum", "sparse_strum", "chug", "accents_only"]);

export const POCKET_GUITAR_TONE_CONFIGS = Object.freeze({
  clean: Object.freeze({ drive: 0.65, input: 0.62, peak: 0.086, lowpass: 4300, highpass: 90, body: 1.4, mid: 1.0, spread: 0.016, sustain: 1.08, mute: 0.085, scratch: 0.04 }),
  crunch: Object.freeze({ drive: 2.4, input: 0.8, peak: 0.092, lowpass: 3600, highpass: 100, body: 2.8, mid: 2.0, spread: 0.013, sustain: 0.98, mute: 0.074, scratch: 0.044 }),
  high_gain: Object.freeze({ drive: 4.2, input: 0.88, peak: 0.09, lowpass: 3250, highpass: 108, body: 3.7, mid: 2.6, spread: 0.01, sustain: 0.91, mute: 0.066, scratch: 0.042 }),
  metal: Object.freeze({ drive: 6.2, input: 0.92, peak: 0.088, lowpass: 3050, highpass: 115, body: 4.5, mid: 3.0, spread: 0.009, sustain: 0.86, mute: 0.06, scratch: 0.04 }),
  tight_metal: Object.freeze({ drive: 7.1, input: 0.88, peak: 0.078, lowpass: 2850, highpass: 145, body: 3.5, mid: 3.35, spread: 0.007, sustain: 0.76, mute: 0.045, scratch: 0.036 }),
  doom_fuzz: Object.freeze({ drive: 8.4, input: 0.82, peak: 0.075, lowpass: 2450, highpass: 72, body: 5.2, mid: 2.15, spread: 0.012, sustain: 1.18, mute: 0.095, scratch: 0.03 }),
  western_twang: Object.freeze({ drive: 1.25, input: 0.68, peak: 0.082, lowpass: 4700, highpass: 125, body: 1.1, mid: 2.4, spread: 0.02, sustain: 0.72, mute: 0.07, scratch: 0.034 })
});

export function findPocketGuitarTone(id) {
  return POCKET_GUITAR_TONE_CONFIGS[id] || POCKET_GUITAR_TONE_CONFIGS[DEFAULT_GUITAR_TONE];
}

export function validatePocketGuitarRegistry() {
  return {
    missingToneConfigs: POCKET_GUITAR_TONES.filter((id) => !POCKET_GUITAR_TONE_CONFIGS[id])
  };
}
