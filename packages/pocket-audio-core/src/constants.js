export const POCKET_AUDIO_CORE_VERSION = "0.1.0-scaffold";
export const CORE_PROJECT_VERSION = 1;
export const PCS_SHARE_PREFIX = "PCS1:";
export const DEFAULT_SOURCE_SCHEMA_VERSION = 16;
export const DEFAULT_PPQ = 480;
export const DEFAULT_BPM = 96;
export const DEFAULT_TIME_SIG = 4;
export const DEFAULT_RESOLUTION = 4;
export const MAX_SEQUENCE_SLOTS = 64;

export const SECTION_IDS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H"]);
export const STEM_IDS = Object.freeze(["drums", "bass", "chords", "melody", "guitar"]);
export const DRUM_LANES = Object.freeze(["kick", "snare", "hat", "bass"]);
export const NOTES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);

export const DEFAULT_MASTER_VOLUME = 0.82;

export const DEFAULT_STEM_MIX = Object.freeze({
  drums: { volume: 0.86, pan: 0, mute: false },
  bass: { volume: 0.86, pan: 0, mute: false },
  chords: { volume: 0.72, pan: 0, mute: false },
  melody: { volume: 0.65, pan: 0, mute: false },
  guitar: { volume: 0.66, pan: 0, mute: false }
});

export const DEFAULT_FX = Object.freeze({
  filter: 1,
  delay: 0.12,
  echo: 0.12,
  chorus: 0.18,
  flanger: 0.06,
  reverb: 0.18,
  mix: 0.65,
  sidechain: { enabled: false, amount: 0.45 }
});
