import { clamp01, safeChoice } from "./preset-utils.js";

export const CHIP_AUDIO_PROFILE_ID = "chip_tune";
export const DEFAULT_CHIP_PRESET_ID = "chip_arcade_start";

export const CHIP_CHORD_INSTRUMENTS = Object.freeze([
  "chip_square_stack",
  "chip_triangle_pad",
  "chip_arp_keys",
  "modern_chip_poly"
]);

export const CHIP_MELODY_INSTRUMENTS = Object.freeze([
  "chip_square_lead",
  "chip_pulse_lead",
  "chip_triangle_blip",
  "chip_bell_stack",
  "modern_chip_lead"
]);

export const CHIP_BASS_TONES = Object.freeze([
  "chip_triangle_bass",
  "chip_square_bass",
  "modern_chip_sub",
  "bitcrush_bass"
]);

export const CHIP_DRUM_KITS = Object.freeze([
  "chip_noise_kit",
  "chip_arcade_kit",
  "modern_chip_punch"
]);

export const CHIP_DRUM_GROOVE_PRESETS = Object.freeze([
  "chip_run_128",
  "chip_menu_bounce",
  "chip_boss_half_time",
  "chip_arp_jam",
  "chip_dungeon_shuffle",
  "chip_victory_stomp"
]);

export const DEFAULT_CHIP_TEXTURE = Object.freeze({
  enabled: false,
  bitDepth: 0.22,
  sampleRateCrush: 0.18,
  pulseWidth: 0.5,
  pitchDrift: 0.03,
  saturation: 0.16,
  stereoSpread: 0.12
});

export const CHIP_STYLE_PRESETS = Object.freeze({
  chip_arcade_start: Object.freeze({
    id: "chip_arcade_start",
    label: "Arcade Start",
    description: "Bright square lead, triangle bass and classic noise drums for instant retro-game hooks.",
    bpm: Object.freeze({ min: 116, max: 132, default: 124 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["C major", "G major", "A minor"]),
    scalePreference: "major",
    swing: 0.02,
    humanize: 0.03,
    chordType: "triad",
    chordStyle: "punchy I-V-vi-IV game loop",
    chordInstrument: "chip_square_stack",
    melodyInstrument: "chip_square_lead",
    bassTone: "chip_triangle_bass",
    drumKit: "chip_noise_kit",
    drumGroovePreset: "chip_run_128",
    fx: Object.freeze({ delay: 0.12, chorus: 0.08, flanger: 0.02, reverb: 0.08, mix: 0.44, sidechain: 0.18 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.2, sampleRateCrush: 0.16, pulseWidth: 0.5, pitchDrift: 0.015, saturation: 0.14, stereoSpread: 0.1 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", danger: "C", full: "D" })
  }),
  chip_bug_maze_pulse: Object.freeze({
    id: "chip_bug_maze_pulse",
    label: "Bug Maze Pulse",
    description: "Modern chiptune-inspired pressure loop with punchy drums, thick sub and harmonised leads.",
    bpm: Object.freeze({ min: 124, max: 138, default: 130 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["E minor", "B minor", "A minor"]),
    scalePreference: "minor",
    swing: 0.04,
    humanize: 0.05,
    chordType: "seventh",
    chordStyle: "dark minor lift with harmonised hooks",
    chordInstrument: "modern_chip_poly",
    melodyInstrument: "modern_chip_lead",
    bassTone: "modern_chip_sub",
    drumKit: "modern_chip_punch",
    drumGroovePreset: "chip_arp_jam",
    fx: Object.freeze({ delay: 0.16, chorus: 0.12, flanger: 0.04, reverb: 0.1, mix: 0.52, sidechain: 0.36 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.18, sampleRateCrush: 0.14, pulseWidth: 0.42, pitchDrift: 0.025, saturation: 0.32, stereoSpread: 0.2 }),
    intensityHints: Object.freeze({ menu: "A", build: "B", danger: "C", full: "D" })
  }),
  chip_neon_boss: Object.freeze({
    id: "chip_neon_boss",
    label: "Neon Boss",
    description: "Half-time boss pulse with hard noise hits, wide square chords and aggressive bass.",
    bpm: Object.freeze({ min: 132, max: 150, default: 142 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["F# minor", "C# minor", "D minor"]),
    scalePreference: "minor",
    swing: 0.03,
    humanize: 0.03,
    chordType: "sus4",
    chordStyle: "tense sus and minor movement",
    chordInstrument: "modern_chip_poly",
    melodyInstrument: "chip_pulse_lead",
    bassTone: "bitcrush_bass",
    drumKit: "modern_chip_punch",
    drumGroovePreset: "chip_boss_half_time",
    fx: Object.freeze({ delay: 0.09, chorus: 0.1, flanger: 0.05, reverb: 0.14, mix: 0.5, sidechain: 0.42 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.32, sampleRateCrush: 0.22, pulseWidth: 0.36, pitchDrift: 0.02, saturation: 0.4, stereoSpread: 0.18 }),
    intensityHints: Object.freeze({ menu: "A", danger: "C", boss: "D", full: "D" })
  }),
  chip_tiny_quest: Object.freeze({
    id: "chip_tiny_quest",
    label: "Tiny Quest",
    description: "Small adventure loop with triangle blips, bouncy bass and gentle arcade drums.",
    bpm: Object.freeze({ min: 104, max: 122, default: 112 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["G major", "D major", "E minor"]),
    scalePreference: "major",
    swing: 0.03,
    humanize: 0.05,
    chordType: "triad",
    chordStyle: "simple quest cadence",
    chordInstrument: "chip_triangle_pad",
    melodyInstrument: "chip_triangle_blip",
    bassTone: "chip_triangle_bass",
    drumKit: "chip_arcade_kit",
    drumGroovePreset: "chip_menu_bounce",
    fx: Object.freeze({ delay: 0.13, chorus: 0.08, flanger: 0.01, reverb: 0.12, mix: 0.45, sidechain: 0.16 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.16, sampleRateCrush: 0.12, pulseWidth: 0.54, pitchDrift: 0.02, saturation: 0.12, stereoSpread: 0.12 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", full: "D" })
  }),
  chip_modern_jam: Object.freeze({
    id: "chip_modern_jam",
    label: "Modern Jam",
    description: "Produced chiptune jam with harmonised hooks, sidechain pump and a full low end.",
    bpm: Object.freeze({ min: 120, max: 136, default: 128 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["A minor", "C minor", "E minor"]),
    scalePreference: "minor",
    swing: 0.05,
    humanize: 0.05,
    chordType: "seventh",
    chordStyle: "minor seventh chip-pop loop",
    chordInstrument: "modern_chip_poly",
    melodyInstrument: "modern_chip_lead",
    bassTone: "modern_chip_sub",
    drumKit: "modern_chip_punch",
    drumGroovePreset: "chip_arp_jam",
    fx: Object.freeze({ delay: 0.18, chorus: 0.16, flanger: 0.03, reverb: 0.12, mix: 0.58, sidechain: 0.34 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.2, sampleRateCrush: 0.16, pulseWidth: 0.44, pitchDrift: 0.035, saturation: 0.28, stereoSpread: 0.24 }),
    intensityHints: Object.freeze({ menu: "A", build: "B", full: "D" })
  }),
  chip_menu_glow: Object.freeze({
    id: "chip_menu_glow",
    label: "Menu Glow",
    description: "Soft glowing menu bed with chip bells, light pulse chords and restrained drums.",
    bpm: Object.freeze({ min: 88, max: 106, default: 96 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["C major", "F major", "A minor"]),
    scalePreference: "major",
    swing: 0.02,
    humanize: 0.04,
    chordType: "sus2",
    chordStyle: "gentle suspended menu loop",
    chordInstrument: "chip_triangle_pad",
    melodyInstrument: "chip_bell_stack",
    bassTone: "chip_triangle_bass",
    drumKit: "chip_arcade_kit",
    drumGroovePreset: "chip_menu_bounce",
    fx: Object.freeze({ delay: 0.14, chorus: 0.12, flanger: 0.01, reverb: 0.18, mix: 0.52, sidechain: 0.08 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.14, sampleRateCrush: 0.1, pulseWidth: 0.5, pitchDrift: 0.02, saturation: 0.1, stereoSpread: 0.18 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", full: "C" })
  }),
  chip_dungeon_drive: Object.freeze({
    id: "chip_dungeon_drive",
    label: "Dungeon Drive",
    description: "Moody shuffle with square bass, narrow pulse lead and gritty dungeon movement.",
    bpm: Object.freeze({ min: 110, max: 126, default: 118 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["D minor", "G minor", "A minor"]),
    scalePreference: "minor",
    swing: 0.08,
    humanize: 0.06,
    chordType: "sus4",
    chordStyle: "dark sus/minor movement",
    chordInstrument: "chip_arp_keys",
    melodyInstrument: "chip_pulse_lead",
    bassTone: "chip_square_bass",
    drumKit: "chip_noise_kit",
    drumGroovePreset: "chip_dungeon_shuffle",
    fx: Object.freeze({ delay: 0.12, chorus: 0.08, flanger: 0.04, reverb: 0.16, mix: 0.48, sidechain: 0.22 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.26, sampleRateCrush: 0.2, pulseWidth: 0.34, pitchDrift: 0.025, saturation: 0.22, stereoSpread: 0.1 }),
    intensityHints: Object.freeze({ menu: "A", explore: "B", danger: "C", full: "D" })
  }),
  chip_victory_burst: Object.freeze({
    id: "chip_victory_burst",
    label: "Victory Burst",
    description: "Short bright win-loop language with square stacks, bell hooks and arcade stomp drums.",
    bpm: Object.freeze({ min: 126, max: 148, default: 136 }),
    timeSig: 4,
    preferredKeys: Object.freeze(["C major", "D major", "G major"]),
    scalePreference: "major",
    swing: 0.01,
    humanize: 0.03,
    chordType: "triad",
    chordStyle: "bright tonic-dominant payoff",
    chordInstrument: "chip_square_stack",
    melodyInstrument: "chip_bell_stack",
    bassTone: "chip_square_bass",
    drumKit: "chip_arcade_kit",
    drumGroovePreset: "chip_victory_stomp",
    fx: Object.freeze({ delay: 0.1, chorus: 0.1, flanger: 0.02, reverb: 0.16, mix: 0.48, sidechain: 0.2 }),
    texture: Object.freeze({ enabled: true, bitDepth: 0.2, sampleRateCrush: 0.14, pulseWidth: 0.56, pitchDrift: 0.015, saturation: 0.18, stereoSpread: 0.2 }),
    intensityHints: Object.freeze({ menu: "A", victory: "D", full: "D" })
  })
});

export const CHIP_STYLE_PRESET_IDS = Object.freeze(Object.keys(CHIP_STYLE_PRESETS));

export function getChipStylePreset(id = DEFAULT_CHIP_PRESET_ID) {
  return CHIP_STYLE_PRESETS[id] || CHIP_STYLE_PRESETS[DEFAULT_CHIP_PRESET_ID];
}

export function isChipProfile(value) {
  return String(value || "").toLowerCase() === CHIP_AUDIO_PROFILE_ID;
}

export function normaliseChipTexture(value = {}, preset = getChipStylePreset()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const presetTexture = preset?.texture || {};
  return {
    enabled: source.enabled ?? presetTexture.enabled ?? DEFAULT_CHIP_TEXTURE.enabled ? true : false,
    bitDepth: clamp01(source.bitDepth ?? presetTexture.bitDepth ?? DEFAULT_CHIP_TEXTURE.bitDepth),
    sampleRateCrush: clamp01(source.sampleRateCrush ?? presetTexture.sampleRateCrush ?? DEFAULT_CHIP_TEXTURE.sampleRateCrush),
    pulseWidth: clamp01(source.pulseWidth ?? presetTexture.pulseWidth ?? DEFAULT_CHIP_TEXTURE.pulseWidth),
    pitchDrift: clamp01(source.pitchDrift ?? presetTexture.pitchDrift ?? DEFAULT_CHIP_TEXTURE.pitchDrift),
    saturation: clamp01(source.saturation ?? presetTexture.saturation ?? DEFAULT_CHIP_TEXTURE.saturation),
    stereoSpread: clamp01(source.stereoSpread ?? presetTexture.stereoSpread ?? DEFAULT_CHIP_TEXTURE.stereoSpread)
  };
}

export function normaliseChipProjectSettings(project = {}) {
  const stylePreset = String(project.stylePreset || "");
  const hasRequestedPreset = Boolean(project.chipPreset || stylePreset.startsWith("chip_"));
  const requestedPreset = project.chipPreset || (stylePreset.startsWith("chip_") ? stylePreset : "") || DEFAULT_CHIP_PRESET_ID;
  const preset = getChipStylePreset(requestedPreset);
  const audioProfile = isChipProfile(project.audioProfile) || (hasRequestedPreset && CHIP_STYLE_PRESETS[requestedPreset]) ? CHIP_AUDIO_PROFILE_ID : String(project.audioProfile || "standard");
  const chipActive = audioProfile === CHIP_AUDIO_PROFILE_ID;
  return {
    audioProfile,
    presetId: chipActive ? preset.id : "",
    preset,
    drumKit: chipActive ? safeChoice(project.drumKit, CHIP_DRUM_KITS, preset.drumKit) : "",
    drumGroovePreset: chipActive ? safeChoice(project.drumGroovePreset, CHIP_DRUM_GROOVE_PRESETS, preset.drumGroovePreset) : "",
    bassTone: chipActive ? safeChoice(project.bassTone, CHIP_BASS_TONES, preset.bassTone) : "",
    texture: chipActive
      ? normaliseChipTexture(project.chipTexture, preset)
      : { ...DEFAULT_CHIP_TEXTURE, enabled: false },
    intensityHints: chipActive ? { ...preset.intensityHints } : {}
  };
}
