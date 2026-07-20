export const POCKET_AUDIO_PROFILE_IDS = Object.freeze([
  "standard",
  "lofi_chill",
  "chip_arcade",
  "western_frontier",
  "heavy_metal",
  "funk_groove"
]);

export const POCKET_AUDIO_PROFILE_ALIASES = Object.freeze({
  chordsmith: "standard",
  base: "standard",
  default: "standard",
  lofi: "lofi_chill",
  "lofi-chill": "lofi_chill",
  chip: "chip_arcade",
  chiptune: "chip_arcade",
  chip_tune: "chip_arcade",
  western: "western_frontier",
  frontier: "western_frontier",
  metal: "heavy_metal",
  funk: "funk_groove"
});

const PROFILE_FEATURES = Object.freeze([
  "sound-profile-v1",
  "rich-events-v1",
  "articulations-v1",
  "expanded-drums-v1",
  "capability-report-v1"
]);

export const POCKET_AUDIO_PROFILES = Object.freeze({
  standard: profile("standard", "Chordsmith", "standard_chordsmith", {
    neutralTone: 0.5,
    transientClarity: 0.5
  }),
  lofi_chill: profile("lofi_chill", "Lofi", "lofi_study_room", {
    vinylCrackle: 0.12,
    tapeHiss: 0.08,
    wowFlutter: 0.08,
    warmth: 0.24,
    lowPassAge: 0.18,
    bitCrush: 0
  }),
  chip_arcade: profile("chip_arcade", "Chiptune", "chip_nes_pulse", {
    pulseWidth: 0.5,
    bitDepth: 0.2,
    sampleRateCrush: 0.16,
    pitchDrift: 0.015,
    saturation: 0.14,
    stereoSpread: 0.1
  }),
  western_frontier: profile("western_frontier", "Western", "western_trail", {
    twang: 0.62,
    pickAttack: 0.56,
    body: 0.48,
    roomSize: 0.2,
    swing: 0.12
  }),
  heavy_metal: profile("heavy_metal", "Metal", "metal_tight_riff", {
    drive: 0.48,
    palmMute: 0.78,
    lowTightness: 0.86,
    presence: 0.58,
    roomSize: 0.12,
    pickAttack: 0.72
  }),
  funk_groove: profile("funk_groove", "Funk", "funk_classic_pocket", {
    pocket: 0.72,
    ghostNotes: 0.42,
    slapAmount: 0.68,
    popBrightness: 0.62,
    muteDepth: 0.74,
    stabTightness: 0.76
  })
});

export const POCKET_AUDIO_FORMAT_FEATURES = PROFILE_FEATURES;

export function normalisePocketAudioProfileId(value, fallback = "standard") {
  const requested = String(value || "").trim().toLowerCase();
  if (POCKET_AUDIO_PROFILE_IDS.includes(requested)) return requested;
  if (POCKET_AUDIO_PROFILE_ALIASES[requested]) return POCKET_AUDIO_PROFILE_ALIASES[requested];
  return POCKET_AUDIO_PROFILE_IDS.includes(fallback) ? fallback : "standard";
}

export function findPocketAudioProfile(value) {
  return POCKET_AUDIO_PROFILES[normalisePocketAudioProfileId(value)];
}

export function normalisePocketAudioSoundProfile(value = {}, legacy = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const requestedId = source.id ?? source.profile ?? legacy.audioProfile;
  const id = normalisePocketAudioProfileId(requestedId || profileIdFromPreset(source.preset ?? legacy.stylePreset));
  const manifest = POCKET_AUDIO_PROFILES[id];
  const preset = String(source.preset ?? legacy.stylePreset ?? legacy.preset ?? "").trim() || manifest.defaultPreset;
  const recipeVersion = positiveInt(source.recipeVersion, manifest.recipeVersion);
  const sourceParameters = source.parameters && typeof source.parameters === "object" && !Array.isArray(source.parameters)
    ? source.parameters
    : {};
  return {
    ...cloneJson(source),
    id,
    preset,
    recipeVersion,
    parameters: {
      ...cloneJson(manifest.defaultParameters),
      ...cloneJson(sourceParameters)
    }
  };
}

export function validatePocketAudioProfileRegistry() {
  const manifestIds = Object.keys(POCKET_AUDIO_PROFILES);
  return {
    missingProfiles: POCKET_AUDIO_PROFILE_IDS.filter((id) => !POCKET_AUDIO_PROFILES[id]),
    unexpectedProfiles: manifestIds.filter((id) => !POCKET_AUDIO_PROFILE_IDS.includes(id)),
    invalidRecipeVersions: manifestIds.filter((id) => !Number.isInteger(POCKET_AUDIO_PROFILES[id].recipeVersion) || POCKET_AUDIO_PROFILES[id].recipeVersion < 1)
  };
}

function profile(id, label, defaultPreset, defaultParameters) {
  return Object.freeze({
    id,
    label,
    defaultPreset,
    recipeVersion: 1,
    formatFeatures: PROFILE_FEATURES,
    defaultParameters: Object.freeze({ ...defaultParameters })
  });
}

function profileIdFromPreset(value) {
  const preset = String(value || "").toLowerCase();
  if (preset.startsWith("lofi_")) return "lofi_chill";
  if (preset.startsWith("chip_")) return "chip_arcade";
  if (preset.startsWith("western_")) return "western_frontier";
  if (preset.startsWith("metal_")) return "heavy_metal";
  if (preset.startsWith("funk_")) return "funk_groove";
  return "standard";
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 1 ? number : fallback;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
