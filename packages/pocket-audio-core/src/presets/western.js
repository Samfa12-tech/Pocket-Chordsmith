import { clamp01, safeChoice } from "./preset-utils.js";

export const WESTERN_AUDIO_PROFILE_ID = "western_frontier";
export const DEFAULT_WESTERN_PRESET_ID = "western_trail";
export const WESTERN_BASS_TONES = Object.freeze(["western_upright", "western_picked_bass"]);
export const WESTERN_DRUM_KITS = Object.freeze(["western_brush_kit", "western_train_kit"]);
export const WESTERN_CHORD_INSTRUMENTS = Object.freeze(["western_saloon_piano", "western_mandolin_chop"]);
export const WESTERN_MELODY_INSTRUMENTS = Object.freeze(["western_harmonica", "western_banjo", "western_fiddle"]);
export const WESTERN_GROOVE_PRESETS = Object.freeze(["western_boom_chick", "western_train", "western_waltz", "western_showdown"]);
export const DEFAULT_WESTERN_PARAMETERS = Object.freeze({ twang: 0.62, pickAttack: 0.56, body: 0.48, roomSize: 0.2, swing: 0.12 });

export const WESTERN_STYLE_PRESETS = Object.freeze({
  western_trail: westernPreset("western_trail", "Western Trail", 104, "western_train", "western_picked_bass", { twang: 0.68, pickAttack: 0.64 }),
  western_boom_chick: westernPreset("western_boom_chick", "Boom Chick", 112, "western_boom_chick", "western_upright", { body: 0.62, swing: 0.08 }),
  western_waltz: westernPreset("western_waltz", "Frontier Waltz", 90, "western_waltz", "western_upright", { body: 0.7, roomSize: 0.3 }),
  western_showdown: westernPreset("western_showdown", "Showdown", 126, "western_showdown", "western_picked_bass", { twang: 0.9, pickAttack: 0.82, roomSize: 0.12 })
});
export const WESTERN_STYLE_PRESET_IDS = Object.freeze(Object.keys(WESTERN_STYLE_PRESETS));

export function getWesternStylePreset(id = DEFAULT_WESTERN_PRESET_ID) {
  return WESTERN_STYLE_PRESETS[id] || WESTERN_STYLE_PRESETS[DEFAULT_WESTERN_PRESET_ID];
}

export function normaliseWesternProjectSettings(project = {}) {
  const sound = project.soundProfile || {};
  const requestedPreset = sound.preset || project.westernPreset || (String(project.stylePreset || "").startsWith("western_") ? project.stylePreset : "") || DEFAULT_WESTERN_PRESET_ID;
  const active = sound.id === WESTERN_AUDIO_PROFILE_ID || project.audioProfile === WESTERN_AUDIO_PROFILE_ID || String(requestedPreset).startsWith("western_");
  const preset = getWesternStylePreset(requestedPreset);
  const source = sound.parameters || project.westernParameters || {};
  return {
    audioProfile: active ? WESTERN_AUDIO_PROFILE_ID : String(project.audioProfile || "standard"),
    presetId: active ? preset.id : "",
    preset,
    drumKit: active ? safeChoice(project.drumKit, WESTERN_DRUM_KITS, preset.drumKit) : "",
    bassTone: active ? safeChoice(project.bassTone, WESTERN_BASS_TONES, preset.bassTone) : "",
    groovePreset: active ? safeChoice(project.drumGroovePreset, WESTERN_GROOVE_PRESETS, preset.groovePreset) : "",
    parameters: Object.fromEntries(Object.keys(DEFAULT_WESTERN_PARAMETERS).map((key) => [key, clamp01(source[key] ?? preset.parameters[key] ?? DEFAULT_WESTERN_PARAMETERS[key])]))
  };
}

function westernPreset(id, label, bpm, groovePreset, bassTone, parameters) {
  return Object.freeze({ id, label, bpm: Object.freeze({ min: bpm - 14, max: bpm + 14, default: bpm }), groovePreset, drumKit: groovePreset === "western_train" ? "western_train_kit" : "western_brush_kit", bassTone, guitarTone: "western_twang", parameters: Object.freeze({ ...DEFAULT_WESTERN_PARAMETERS, ...parameters }) });
}
