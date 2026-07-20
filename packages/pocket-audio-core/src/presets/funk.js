import { clamp01, safeChoice } from "./preset-utils.js";

export const FUNK_AUDIO_PROFILE_ID = "funk_groove";
export const DEFAULT_FUNK_PRESET_ID = "funk_classic_pocket";
export const FUNK_BASS_TONES = Object.freeze(["funk_finger_pocket", "funk_slap_pop", "funk_muted_thump", "funk_round_finger", "funk_synth_pocket"]);
export const FUNK_DRUM_KITS = Object.freeze(["funk_dry_pocket", "funk_breakbeat"]);
export const FUNK_CHORD_INSTRUMENTS = Object.freeze(["funk_clav_stab", "funk_rhodes_stab", "funk_brass_stack"]);
export const FUNK_MELODY_INSTRUMENTS = Object.freeze(["funk_muted_trumpet", "funk_sax_punch"]);
export const FUNK_DRUM_GROOVE_PRESETS = Object.freeze(["funk_backbeat_98", "funk_ghost_push", "funk_one_drop", "funk_open_hat_lift", "funk_breakbeat_pocket", "funk_fill_16ths"]);

export const DEFAULT_FUNK_PARAMETERS = Object.freeze({
  pocket: 0.72,
  ghostNotes: 0.42,
  slapAmount: 0.68,
  popBrightness: 0.62,
  muteDepth: 0.74,
  stabTightness: 0.76
});

export const FUNK_STYLE_PRESETS = Object.freeze({
  funk_classic_pocket: funkPreset("funk_classic_pocket", "Classic Pocket", 98, "funk_finger_pocket", "funk_dry_pocket", "funk_backbeat_98", "funk_clav_stab", { pocket: 0.82, ghostNotes: 0.4 }),
  funk_slap_party: funkPreset("funk_slap_party", "Slap Party", 112, "funk_slap_pop", "funk_breakbeat", "funk_open_hat_lift", "funk_brass_stack", { slapAmount: 0.9, popBrightness: 0.82, ghostNotes: 0.5 }),
  funk_clav_stabs: funkPreset("funk_clav_stabs", "Clav Stabs", 104, "funk_muted_thump", "funk_dry_pocket", "funk_ghost_push", "funk_clav_stab", { muteDepth: 0.9, stabTightness: 0.92 }),
  funk_brass_break: funkPreset("funk_brass_break", "Brass Break", 116, "funk_slap_pop", "funk_breakbeat", "funk_breakbeat_pocket", "funk_brass_stack", { slapAmount: 0.78, ghostNotes: 0.62 }),
  funk_soul_pocket: funkPreset("funk_soul_pocket", "Soul Pocket", 88, "funk_round_finger", "funk_dry_pocket", "funk_one_drop", "funk_rhodes_stab", { pocket: 0.66, ghostNotes: 0.3, stabTightness: 0.54 }),
  funk_game_chase: funkPreset("funk_game_chase", "Game Chase", 124, "funk_synth_pocket", "funk_breakbeat", "funk_breakbeat_pocket", "funk_clav_stab", { pocket: 0.88, ghostNotes: 0.48, stabTightness: 0.86 })
});

export const FUNK_STYLE_PRESET_IDS = Object.freeze(Object.keys(FUNK_STYLE_PRESETS));

export function getFunkStylePreset(id = DEFAULT_FUNK_PRESET_ID) {
  return FUNK_STYLE_PRESETS[id] || FUNK_STYLE_PRESETS[DEFAULT_FUNK_PRESET_ID];
}

export function normaliseFunkParameters(value = {}, preset = getFunkStylePreset()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_FUNK_PARAMETERS).map((key) => [key, clamp01(source[key] ?? preset.parameters[key] ?? DEFAULT_FUNK_PARAMETERS[key])]));
}

export function normaliseFunkProjectSettings(project = {}) {
  const sound = project.soundProfile || {};
  const requestedPreset = sound.preset || project.funkPreset || (String(project.stylePreset || "").startsWith("funk_") ? project.stylePreset : "") || DEFAULT_FUNK_PRESET_ID;
  const active = sound.id === FUNK_AUDIO_PROFILE_ID || project.audioProfile === FUNK_AUDIO_PROFILE_ID || String(requestedPreset).startsWith("funk_");
  const preset = getFunkStylePreset(requestedPreset);
  return {
    audioProfile: active ? FUNK_AUDIO_PROFILE_ID : String(project.audioProfile || "standard"),
    presetId: active ? preset.id : "",
    preset,
    drumKit: active ? safeChoice(project.drumKit, FUNK_DRUM_KITS, preset.drumKit) : "",
    drumGroovePreset: active ? safeChoice(project.drumGroovePreset, FUNK_DRUM_GROOVE_PRESETS, preset.drumGroovePreset) : "",
    bassTone: active ? safeChoice(project.bassTone, FUNK_BASS_TONES, preset.bassTone) : "",
    chordInstrument: active ? preset.chordInstrument : "",
    parameters: active ? normaliseFunkParameters(sound.parameters || project.funkParameters, preset) : { ...DEFAULT_FUNK_PARAMETERS }
  };
}

function funkPreset(id, label, bpm, bassTone, drumKit, drumGroovePreset, chordInstrument, parameters) {
  return Object.freeze({ id, label, bpm: Object.freeze({ min: bpm - 12, max: bpm + 12, default: bpm }), bassTone, drumKit, drumGroovePreset, chordInstrument, scalePreference: "minor", chordType: "seventh", parameters: Object.freeze({ ...DEFAULT_FUNK_PARAMETERS, ...parameters }) });
}
