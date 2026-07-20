export const POCKET_AUDIO_COMMON_ARTICULATIONS = Object.freeze([
  "finger",
  "slap",
  "pop",
  "mute",
  "ghost",
  "hammer",
  "pull",
  "slide",
  "hold",
  "staccato",
  "legato",
  "bend",
  "vibrato",
  "tremolo",
  "open",
  "chug",
  "scratch",
  "palm_mute",
  "accent",
  "flam",
  "drag",
  "roll",
  "choke"
]);

export const POCKET_AUDIO_ARTICULATION_IDS = POCKET_AUDIO_COMMON_ARTICULATIONS;

export const POCKET_AUDIO_ARTICULATION_ALIASES = Object.freeze({
  dead: "mute",
  muted: "mute",
  hammer_on: "hammer",
  "hammer-on": "hammer",
  pull_off: "pull",
  "pull-off": "pull",
  palmmute: "palm_mute",
  "palm-mute": "palm_mute",
  palm: "palm_mute",
  openhat: "open",
  closed: "choke"
});

export function normalisePocketAudioArticulation(value, options = {}) {
  const requested = String(value || options.fallback || "finger").trim().toLowerCase();
  const canonical = POCKET_AUDIO_ARTICULATION_ALIASES[requested] || requested;
  if (POCKET_AUDIO_COMMON_ARTICULATIONS.includes(canonical)) return canonical;
  if (options.preserveUnknown !== false && canonical) return canonical;
  return options.fallback || "finger";
}

export function normalisePocketAudioExpression(value) {
  return cloneRecord(value);
}

export function normalisePocketAudioTechnique(value) {
  const source = cloneRecord(value);
  const out = {};
  Object.entries(source).forEach(([namespace, commands]) => {
    out[String(namespace)] = cloneRecord(commands);
  });
  return out;
}

export function normalisePocketAudioRole(value, fallback = "") {
  const role = String(value || fallback).trim().toLowerCase();
  return role.replace(/\s+/g, "_");
}

export function isPocketAudioCommonArticulation(value) {
  return POCKET_AUDIO_COMMON_ARTICULATIONS.includes(normalisePocketAudioArticulation(value));
}

function cloneRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}
