export const LOFI_AUDIO_PROFILE_ID = "lofi_chill";
export const DEFAULT_LOFI_PRESET_ID = "lofi_study_room";

export const LOFI_CHORD_INSTRUMENTS = Object.freeze([
  "dusty_rhodes",
  "felt_piano",
  "cassette_keys",
  "muted_jazz_guitar",
  "lofi_warm_pad"
]);

export const LOFI_MELODY_INSTRUMENTS = Object.freeze([
  "mellow_vibes",
  "soft_pluck",
  "mellow_sax",
  "muted_trumpet",
  "tape_bell"
]);

export const LOFI_BASS_TONES = Object.freeze([
  "warm_sub",
  "soft_upright",
  "rounded_triangle_bass"
]);

export const LOFI_DRUM_KITS = Object.freeze([
  "lofi_dusty",
  "lofi_brush",
  "lofi_tape_soft"
]);

export const LOFI_DRUM_GROOVE_PRESETS = Object.freeze([
  "lofi_backbeat_76",
  "lofi_lazy_boom_bap",
  "lofi_half_time_soft",
  "lofi_brush_shuffle",
  "lofi_sparse_clicks",
  "lofi_sleepy_waltz_3_4"
]);

export const DEFAULT_LOFI_TEXTURE = Object.freeze({
  enabled: false,
  vinylCrackle: 0.08,
  tapeHiss: 0.05,
  wowFlutter: 0.03,
  warmth: 0.16,
  lowPassAge: 0.22,
  bitCrush: 0.01
});

export const LOFI_STYLE_PRESETS = Object.freeze({
  lofi_study_room: Object.freeze({
    id: "lofi_study_room",
    label: "Study Room Loop",
    description: "Warm, steady study/game bed with dusty Rhodes, soft hats and a small vinyl edge.",
    bpm: Object.freeze({ min: 72, max: 80, default: 76 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["A minor", "C major", "D minor"]),
    scalePreference: "minor",
    swing: 0.12,
    humanize: 0.11,
    chordType: "seventh",
    chordStyle: "maj7/min7 loop",
    chordInstrument: "dusty_rhodes",
    melodyInstrument: "mellow_vibes",
    bassTone: "warm_sub",
    drumKit: "lofi_dusty",
    drumGroovePreset: "lofi_backbeat_76",
    fx: Object.freeze({ delay: 0.12, chorus: 0.22, flanger: 0.02, reverb: 0.18, mix: 0.58, sidechain: 0.24 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.09, tapeHiss: 0.04, wowFlutter: 0.03, warmth: 0.18, lowPassAge: 0.24, bitCrush: 0.01 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", rain: "C", full: "D" })
  }),
  lofi_rainy_window: Object.freeze({
    id: "lofi_rainy_window",
    label: "Rainy Window Loop",
    description: "Felt piano and brushed snare feel with a soft rain-like noise bed.",
    bpm: Object.freeze({ min: 68, max: 76, default: 72 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["D minor", "F major", "A minor"]),
    scalePreference: "minor",
    swing: 0.1,
    humanize: 0.13,
    chordType: "seventh",
    chordStyle: "minor seventh/add9 colour",
    chordInstrument: "felt_piano",
    melodyInstrument: "tape_bell",
    bassTone: "soft_upright",
    drumKit: "lofi_brush",
    drumGroovePreset: "lofi_brush_shuffle",
    fx: Object.freeze({ delay: 0.18, chorus: 0.12, flanger: 0.02, reverb: 0.28, mix: 0.62, sidechain: 0.18 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.04, tapeHiss: 0.1, wowFlutter: 0.025, warmth: 0.14, lowPassAge: 0.2, bitCrush: 0 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", rain: "C", full: "D" })
  }),
  lofi_moon_garden: Object.freeze({
    id: "lofi_moon_garden",
    label: "Moon Garden Loop",
    description: "Dreamy Rhodes and pad bed for night garden or calm menu scenes.",
    bpm: Object.freeze({ min: 74, max: 84, default: 80 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["E minor", "G major", "B minor"]),
    scalePreference: "minor",
    swing: 0.14,
    humanize: 0.1,
    chordType: "seventh",
    chordStyle: "sustained nostalgic sevenths",
    chordInstrument: "lofi_warm_pad",
    melodyInstrument: "mellow_vibes",
    bassTone: "warm_sub",
    drumKit: "lofi_tape_soft",
    drumGroovePreset: "lofi_half_time_soft",
    fx: Object.freeze({ delay: 0.14, chorus: 0.26, flanger: 0.03, reverb: 0.24, mix: 0.62, sidechain: 0.2 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.06, tapeHiss: 0.05, wowFlutter: 0.045, warmth: 0.22, lowPassAge: 0.18, bitCrush: 0.01 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", full: "D" })
  }),
  lofi_koi_pond: Object.freeze({
    id: "lofi_koi_pond",
    label: "Koi Pond Loop",
    description: "Sparse percussion, warm pad/Rhodes and soft bell melody for gentle garden play.",
    bpm: Object.freeze({ min: 68, max: 74, default: 70 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["F major", "D minor", "C major"]),
    scalePreference: "major",
    swing: 0.11,
    humanize: 0.12,
    chordType: "seventh",
    chordStyle: "maj7/add9 calm loop",
    chordInstrument: "lofi_warm_pad",
    melodyInstrument: "tape_bell",
    bassTone: "rounded_triangle_bass",
    drumKit: "lofi_tape_soft",
    drumGroovePreset: "lofi_sparse_clicks",
    fx: Object.freeze({ delay: 0.16, chorus: 0.2, flanger: 0.02, reverb: 0.26, mix: 0.58, sidechain: 0.14 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.035, tapeHiss: 0.045, wowFlutter: 0.02, warmth: 0.18, lowPassAge: 0.16, bitCrush: 0 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", full: "D" })
  }),
  lofi_train_window: Object.freeze({
    id: "lofi_train_window",
    label: "Train Window Loop",
    description: "Lazy boom-bap groove with muted guitar/Rhodes and gentle tape wobble.",
    bpm: Object.freeze({ min: 78, max: 86, default: 82 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["C minor", "G minor", "Eb major"]),
    scalePreference: "minor",
    swing: 0.15,
    humanize: 0.12,
    chordType: "seventh",
    chordStyle: "dominant/minor ninth colour",
    chordInstrument: "muted_jazz_guitar",
    melodyInstrument: "soft_pluck",
    bassTone: "warm_sub",
    drumKit: "lofi_dusty",
    drumGroovePreset: "lofi_lazy_boom_bap",
    fx: Object.freeze({ delay: 0.1, chorus: 0.18, flanger: 0.04, reverb: 0.16, mix: 0.52, sidechain: 0.28 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.08, tapeHiss: 0.06, wowFlutter: 0.055, warmth: 0.2, lowPassAge: 0.28, bitCrush: 0.018 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", travel: "D", night: "C", full: "D" })
  }),
  lofi_ant_farm_night: Object.freeze({
    id: "lofi_ant_farm_night",
    label: "Ant Farm Night",
    description: "Tiny, curious night-loop texture with clicky hats and a mellow sub pulse.",
    bpm: Object.freeze({ min: 76, max: 84, default: 80 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["B minor", "D major", "E minor"]),
    scalePreference: "minor",
    swing: 0.13,
    humanize: 0.14,
    chordType: "seventh",
    chordStyle: "compact min7/sus loop",
    chordInstrument: "cassette_keys",
    melodyInstrument: "soft_pluck",
    bassTone: "rounded_triangle_bass",
    drumKit: "lofi_tape_soft",
    drumGroovePreset: "lofi_sparse_clicks",
    fx: Object.freeze({ delay: 0.13, chorus: 0.22, flanger: 0.025, reverb: 0.18, mix: 0.55, sidechain: 0.22 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.05, tapeHiss: 0.07, wowFlutter: 0.04, warmth: 0.18, lowPassAge: 0.22, bitCrush: 0.012 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", full: "D" })
  }),
  lofi_menu_warmth: Object.freeze({
    id: "lofi_menu_warmth",
    label: "Menu Warmth",
    description: "Soft menu loop that stays out of the way and leaves room for UI sounds.",
    bpm: Object.freeze({ min: 72, max: 80, default: 76 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["C major", "A minor", "F major"]),
    scalePreference: "major",
    swing: 0.09,
    humanize: 0.08,
    chordType: "seventh",
    chordStyle: "slow warm sevenths",
    chordInstrument: "felt_piano",
    melodyInstrument: "tape_bell",
    bassTone: "warm_sub",
    drumKit: "lofi_brush",
    drumGroovePreset: "lofi_half_time_soft",
    fx: Object.freeze({ delay: 0.08, chorus: 0.16, flanger: 0.01, reverb: 0.22, mix: 0.48, sidechain: 0.12 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.03, tapeHiss: 0.04, wowFlutter: 0.02, warmth: 0.16, lowPassAge: 0.18, bitCrush: 0 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", full: "D" })
  }),
  lofi_sleepy_waltz: Object.freeze({
    id: "lofi_sleepy_waltz",
    label: "Sleepy Waltz",
    description: "Very sparse 3/4 felt-piano/pad loop for sleepy menus or night scenes.",
    bpm: Object.freeze({ min: 64, max: 72, default: 68 }),
    timeSig: 3,
    preferredKeys: Object.freeze(["C major", "A minor", "D minor"]),
    scalePreference: "major",
    swing: 0.06,
    humanize: 0.11,
    chordType: "seventh",
    chordStyle: "gentle 3/4 maj7/min7",
    chordInstrument: "felt_piano",
    melodyInstrument: "mellow_vibes",
    bassTone: "soft_upright",
    drumKit: "lofi_brush",
    drumGroovePreset: "lofi_sleepy_waltz_3_4",
    fx: Object.freeze({ delay: 0.1, chorus: 0.14, flanger: 0.01, reverb: 0.28, mix: 0.5, sidechain: 0.08 }),
    texture: Object.freeze({ enabled: true, vinylCrackle: 0.035, tapeHiss: 0.035, wowFlutter: 0.025, warmth: 0.14, lowPassAge: 0.2, bitCrush: 0 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", night: "C", full: "D" })
  })
});

export const LOFI_STYLE_PRESET_IDS = Object.freeze(Object.keys(LOFI_STYLE_PRESETS));

export function getLofiStylePreset(id = DEFAULT_LOFI_PRESET_ID) {
  return LOFI_STYLE_PRESETS[id] || LOFI_STYLE_PRESETS[DEFAULT_LOFI_PRESET_ID];
}

export function isLofiProfile(value) {
  return String(value || "").toLowerCase() === LOFI_AUDIO_PROFILE_ID;
}

export function normaliseLofiTexture(value = {}, preset = getLofiStylePreset()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const presetTexture = preset?.texture || {};
  return {
    enabled: source.enabled ?? presetTexture.enabled ?? DEFAULT_LOFI_TEXTURE.enabled ? true : false,
    vinylCrackle: clamp01(source.vinylCrackle ?? presetTexture.vinylCrackle ?? DEFAULT_LOFI_TEXTURE.vinylCrackle),
    tapeHiss: clamp01(source.tapeHiss ?? presetTexture.tapeHiss ?? DEFAULT_LOFI_TEXTURE.tapeHiss),
    wowFlutter: clamp01(source.wowFlutter ?? presetTexture.wowFlutter ?? DEFAULT_LOFI_TEXTURE.wowFlutter),
    warmth: clamp01(source.warmth ?? presetTexture.warmth ?? DEFAULT_LOFI_TEXTURE.warmth),
    lowPassAge: clamp01(source.lowPassAge ?? presetTexture.lowPassAge ?? DEFAULT_LOFI_TEXTURE.lowPassAge),
    bitCrush: clamp01(source.bitCrush ?? presetTexture.bitCrush ?? DEFAULT_LOFI_TEXTURE.bitCrush)
  };
}

export function normaliseLofiProjectSettings(project = {}) {
  const hasRequestedPreset = Boolean(project.lofiPreset || project.stylePreset);
  const requestedPreset = project.lofiPreset || project.stylePreset || DEFAULT_LOFI_PRESET_ID;
  const preset = getLofiStylePreset(requestedPreset);
  const audioProfile = isLofiProfile(project.audioProfile) || (hasRequestedPreset && LOFI_STYLE_PRESETS[requestedPreset]) ? LOFI_AUDIO_PROFILE_ID : String(project.audioProfile || "standard");
  const lofiActive = audioProfile === LOFI_AUDIO_PROFILE_ID;
  return {
    audioProfile,
    presetId: lofiActive ? preset.id : "",
    preset,
    drumKit: lofiActive ? safeChoice(project.drumKit, LOFI_DRUM_KITS, preset.drumKit) : "",
    drumGroovePreset: lofiActive ? safeChoice(project.drumGroovePreset, LOFI_DRUM_GROOVE_PRESETS, preset.drumGroovePreset) : "",
    bassTone: safeChoice(project.bassTone, lofiActive ? LOFI_BASS_TONES : ["classic"], lofiActive ? preset.bassTone : "classic"),
    texture: lofiActive
      ? normaliseLofiTexture(project.lofiTexture, preset)
      : { ...DEFAULT_LOFI_TEXTURE, enabled: false },
    intensityHints: lofiActive ? { ...preset.intensityHints } : {}
  };
}

function safeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
