import { clamp01, safeChoice } from "./preset-utils.js";

export const HEAVY_METAL_AUDIO_PROFILE_ID = "heavy_metal";
export const DEFAULT_METAL_PRESET_ID = "metal_classic_chug";

export const METAL_CHORD_INSTRUMENTS = Object.freeze(["metal_power_stack", "dark_organ_stack"]);
export const METAL_MELODY_INSTRUMENTS = Object.freeze(["shred_lead_guitar", "twin_harmony_lead"]);
export const METAL_BASS_TONES = Object.freeze(["metal_pick_bass", "metal_sub_pick", "metal_grind_bass"]);
export const METAL_DRUM_KITS = Object.freeze(["metal_tight", "metal_arena", "metal_doom"]);
export const METAL_DRUM_GROOVE_PRESETS = Object.freeze([
  "metal_backbeat_chug",
  "metal_gallop_160",
  "metal_double_kick_drive",
  "metal_blast_220",
  "metal_doom_70",
  "metal_breakdown_half_time"
]);

export const DEFAULT_METAL_TEXTURE = Object.freeze({
  enabled: false,
  drive: 0.42,
  palmMute: 0.72,
  lowTightness: 0.78,
  presence: 0.56,
  roomSize: 0.16,
  pickAttack: 0.64
});

export const METAL_STYLE_PRESETS = Object.freeze({
  metal_classic_chug: metalPreset("metal_classic_chug", "Classic Chug", 128, ["E minor", "A minor"], [0, 5, 6, 4], "metal_tight", "metal_backbeat_chug", "metal_pick_bass", "tight_metal", "metal_chug", { drive: 0.48, palmMute: 0.78, lowTightness: 0.86, presence: 0.58, roomSize: 0.12, pickAttack: 0.72 }),
  metal_thrashing_gallop: metalPreset("metal_thrashing_gallop", "Thrash Gallop", 168, ["E minor", "F# minor"], [0, 1, 0, 6], "metal_tight", "metal_gallop_160", "metal_grind_bass", "tight_metal", "thrash_gallop", { drive: 0.56, palmMute: 0.84, lowTightness: 0.9, presence: 0.64, roomSize: 0.1, pickAttack: 0.82 }, "twin_harmony_lead"),
  metal_doom_procession: metalPreset("metal_doom_procession", "Doom Procession", 70, ["C minor", "D minor"], [0, 6, 5, 1], "metal_doom", "metal_doom_70", "metal_sub_pick", "doom_fuzz", "doom_slow", { drive: 0.64, palmMute: 0.42, lowTightness: 0.58, presence: 0.42, roomSize: 0.38, pickAttack: 0.48 }, "shred_lead_guitar", "dark_organ_stack"),
  metal_power_anthem: metalPreset("metal_power_anthem", "Power Anthem", 144, ["D minor", "E minor"], [0, 5, 2, 6], "metal_arena", "metal_double_kick_drive", "metal_pick_bass", "tight_metal", "rock_eighths", { drive: 0.46, palmMute: 0.6, lowTightness: 0.78, presence: 0.62, roomSize: 0.24, pickAttack: 0.66 }, "twin_harmony_lead"),
  metal_boss_blast: metalPreset("metal_boss_blast", "Boss Blast", 212, ["F# minor", "E minor"], [0, 1, 6, 4], "metal_tight", "metal_blast_220", "metal_grind_bass", "tight_metal", "tremolo_drive", { drive: 0.6, palmMute: 0.72, lowTightness: 0.92, presence: 0.68, roomSize: 0.08, pickAttack: 0.86 }),
  metal_breakdown_gate: metalPreset("metal_breakdown_gate", "Breakdown Gate", 98, ["A minor", "B minor"], [0, 0, 1, 0], "metal_arena", "metal_breakdown_half_time", "metal_sub_pick", "tight_metal", "breakdown_stabs", { drive: 0.54, palmMute: 0.88, lowTightness: 0.94, presence: 0.55, roomSize: 0.1, pickAttack: 0.78 })
});

export const METAL_STYLE_PRESET_IDS = Object.freeze(Object.keys(METAL_STYLE_PRESETS));

export function getMetalStylePreset(id = DEFAULT_METAL_PRESET_ID) {
  return METAL_STYLE_PRESETS[id] || METAL_STYLE_PRESETS[DEFAULT_METAL_PRESET_ID];
}

export function isMetalProfile(value) {
  return String(value || "").toLowerCase() === HEAVY_METAL_AUDIO_PROFILE_ID;
}

export function normaliseMetalTexture(value = {}, preset = getMetalStylePreset()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const presetTexture = preset?.texture || {};
  return {
    enabled: source.enabled ?? presetTexture.enabled ?? DEFAULT_METAL_TEXTURE.enabled ? true : false,
    drive: clamp01(source.drive ?? presetTexture.drive ?? DEFAULT_METAL_TEXTURE.drive),
    palmMute: clamp01(source.palmMute ?? presetTexture.palmMute ?? DEFAULT_METAL_TEXTURE.palmMute),
    lowTightness: clamp01(source.lowTightness ?? presetTexture.lowTightness ?? DEFAULT_METAL_TEXTURE.lowTightness),
    presence: clamp01(source.presence ?? presetTexture.presence ?? DEFAULT_METAL_TEXTURE.presence),
    roomSize: clamp01(source.roomSize ?? presetTexture.roomSize ?? DEFAULT_METAL_TEXTURE.roomSize),
    pickAttack: clamp01(source.pickAttack ?? presetTexture.pickAttack ?? DEFAULT_METAL_TEXTURE.pickAttack)
  };
}

export function normaliseMetalProjectSettings(project = {}) {
  const stylePreset = String(project.stylePreset || "");
  const requestedPreset = project.metalPreset || (stylePreset.startsWith("metal_") ? stylePreset : "") || DEFAULT_METAL_PRESET_ID;
  const hasRequestedPreset = Boolean(project.metalPreset || stylePreset.startsWith("metal_"));
  const preset = getMetalStylePreset(requestedPreset);
  const audioProfile = isMetalProfile(project.audioProfile) || (hasRequestedPreset && METAL_STYLE_PRESETS[requestedPreset]) ? HEAVY_METAL_AUDIO_PROFILE_ID : String(project.audioProfile || "standard");
  const metalActive = audioProfile === HEAVY_METAL_AUDIO_PROFILE_ID;
  return {
    audioProfile,
    presetId: metalActive ? preset.id : "",
    preset,
    drumKit: metalActive ? safeChoice(project.drumKit, METAL_DRUM_KITS, preset.drumKit) : "",
    drumGroovePreset: metalActive ? safeChoice(project.drumGroovePreset, METAL_DRUM_GROOVE_PRESETS, preset.drumGroovePreset) : "",
    bassTone: metalActive ? safeChoice(project.bassTone, METAL_BASS_TONES, preset.bassTone) : "",
    guitarTone: metalActive ? preset.guitarTone : "",
    guitarPatternPreset: metalActive ? preset.guitarPatternPreset : "",
    texture: metalActive ? normaliseMetalTexture(project.metalTexture, preset) : { ...DEFAULT_METAL_TEXTURE, enabled: false },
    intensityHints: metalActive ? { ...preset.intensityHints } : {}
  };
}

function metalPreset(id, label, bpmDefault, preferredKeys, progression, drumKit, drumGroovePreset, bassTone, guitarTone, guitarPatternPreset, texture, melodyInstrument = "shred_lead_guitar", chordInstrument = "metal_power_stack") {
  return Object.freeze({
    id,
    label,
    description: `${label} procedural heavy metal starter preset.`,
    bpm: Object.freeze({ min: Math.max(40, bpmDefault - 16), max: Math.min(240, bpmDefault + 16), default: bpmDefault }),
    timeSig: 4,
    preferredKeys: Object.freeze(preferredKeys),
    scalePreference: "minor",
    progression: Object.freeze(progression.slice()),
    swing: 0,
    humanize: 0.03,
    chordType: "triad",
    chordStyle: "minor power-chord movement",
    chordInstrument,
    melodyInstrument,
    bassTone,
    drumKit,
    drumGroovePreset,
    guitarTone,
    guitarPatternPreset,
    fx: Object.freeze({ delay: 0.08, chorus: 0.04, flanger: 0.02, reverb: 0.12, mix: 0.4, sidechain: 0.2 }),
    texture: Object.freeze({ ...DEFAULT_METAL_TEXTURE, enabled: true, ...texture }),
    intensityHints: Object.freeze({ menu: "A", build: "B", danger: "C", full: "D" })
  });
}
