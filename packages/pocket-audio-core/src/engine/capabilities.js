import { POCKET_AUDIO_FORMAT_FEATURES, POCKET_AUDIO_PROFILE_IDS, normalisePocketAudioProfileId } from "../profiles/profile-registry.js";
import { POCKET_AUDIO_COMMON_ARTICULATIONS } from "../performance/expression.js";
import { POCKET_AUDIO_COMMON_DRUM_LANE_IDS, normalisePocketAudioDrumLane, pocketAudioDrumLaneFallback } from "../sounds/drum-lanes.js";

const DIRECT_DRUM_LANES = Object.freeze(["kick", "snare", "clap", "hat_closed", "hat_open"]);
const DIRECT_ARTICULATIONS = Object.freeze([
  "finger", "slap", "pop", "mute", "ghost", "hammer", "pull", "slide", "hold",
  "staccato", "legato", "bend", "vibrato", "tremolo", "open", "chug", "scratch",
  "palm_mute", "accent", "choke"
]);
const APPROXIMATED_ARTICULATIONS = Object.freeze(["flam", "drag", "roll"]);

export const POCKET_AUDIO_RENDERER_CAPABILITIES = Object.freeze({
  offline: capability("pocket-audio-core-offline", {
    sampleClock: true,
    directDrumLanes: DIRECT_DRUM_LANES,
    directArticulations: DIRECT_ARTICULATIONS,
    techniqueCommands: {
      chip: ["channel", "duty", "envelope", "commands", "sweep", "pitchSlide", "vibrato", "retrigger"],
      metal: ["palmMute", "pickDirection", "tremoloRate", "string", "dualTakeSeed"],
      western: ["pickDirection", "strumDirection", "banjoRoll", "bowDirection", "breathDirection", "bend"],
      funk: ["hand", "rake", "ghostDepth", "pocketOffset", "callResponseRole"]
    }
  }),
  live: capability("pocket-audio-core-live", {
    sampleClock: true,
    directDrumLanes: DIRECT_DRUM_LANES,
    directArticulations: DIRECT_ARTICULATIONS,
    techniqueCommands: {
      chip: ["channel", "duty", "envelope", "commands", "sweep", "pitchSlide", "vibrato", "retrigger"],
      metal: ["palmMute", "pickDirection", "tremoloRate", "string", "dualTakeSeed"],
      western: ["pickDirection", "strumDirection", "banjoRoll", "bowDirection", "breathDirection", "bend"],
      funk: ["hand", "rake", "ghostDepth", "pocketOffset", "callResponseRole"]
    }
  })
});

export function getPocketAudioRendererCapabilities(renderer = "offline") {
  return cloneJson(POCKET_AUDIO_RENDERER_CAPABILITIES[renderer] || POCKET_AUDIO_RENDERER_CAPABILITIES.offline);
}

export function createPocketAudioRendererCapabilityReport(input, options = {}) {
  const renderer = options.renderer || "offline";
  const capabilities = getPocketAudioRendererCapabilities(renderer);
  const entries = [];
  const profileId = normalisePocketAudioProfileId(input?.soundProfile?.id || input?.meta?.audioProfile || options.profileId);
  const formatFeatures = Array.isArray(input?.formatFeatures) ? input.formatFeatures : [];
  formatFeatures.forEach((feature, index) => {
    if (capabilities.formatFeatures.includes(feature)) return;
    entries.push(entry(`formatFeatures[${index}]`, feature, "preserved", "", `Unknown feature ${feature} is preserved but not interpreted by ${capabilities.id}.`));
  });
  if (!capabilities.profileIds.includes(profileId)) {
    entries.push(entry("soundProfile.id", `sound-profile:${profileId}`, "fallback", "standard", `Profile ${profileId} renders with the Standard recipe.`));
  }

  collectRichEvents(input).forEach(({ event, path, trackId }) => {
    const articulation = String(event.articulation || "").toLowerCase();
    if (articulation && !capabilities.directArticulations.includes(articulation)) {
      const action = capabilities.approximatedArticulations.includes(articulation) ? "approximated" : "fallback";
      entries.push(entry(`${path}.articulation`, `articulation:${articulation}`, action, articulationFallback(articulation), `${articulation} is ${action} by ${capabilities.id}; source intent is preserved.`));
    }
    const laneCandidate = event.lane || (trackId === "drums" ? event.sound : trackId);
    if (laneCandidate) {
      const lane = normalisePocketAudioDrumLane(laneCandidate);
      if (POCKET_AUDIO_COMMON_DRUM_LANE_IDS.includes(lane) && !capabilities.directDrumLanes.includes(lane)) {
        entries.push(entry(`${path}.lane`, `drum-lane:${lane}`, "fallback", pocketAudioDrumLaneFallback(lane), `${lane} uses the ${pocketAudioDrumLaneFallback(lane)} fallback recipe.`));
      }
    }
    Object.entries(event.technique || {}).forEach(([namespace, commands]) => {
      const supported = new Set(capabilities.techniqueCommands[namespace] || []);
      Object.keys(commands || {}).forEach((command) => {
        if (!supported.has(command)) entries.push(entry(`${path}.technique.${namespace}.${command}`, `technique:${namespace}:${command}`, "preserved", "", `Unknown ${namespace}.${command} command is preserved but not interpreted.`));
      });
    });
  });

  const losses = entries.filter((item) => item.action !== "preserved");
  return {
    renderer: capabilities.id,
    rendererVersion: capabilities.version,
    profileId,
    supported: !entries.some((item) => item.action === "dropped"),
    exact: losses.length === 0,
    entries,
    losses,
    capabilities
  };
}

export const negotiatePocketAudioRendererCapabilities = createPocketAudioRendererCapabilityReport;

function capability(id, values) {
  return Object.freeze({
    id,
    version: 1,
    formatFeatures: POCKET_AUDIO_FORMAT_FEATURES,
    profileIds: POCKET_AUDIO_PROFILE_IDS,
    articulations: POCKET_AUDIO_COMMON_ARTICULATIONS,
    directArticulations: values.directArticulations,
    approximatedArticulations: APPROXIMATED_ARTICULATIONS,
    drumLanes: POCKET_AUDIO_COMMON_DRUM_LANE_IDS,
    directDrumLanes: values.directDrumLanes,
    techniqueCommands: Object.freeze(values.techniqueCommands),
    preservesUnknownData: true,
    reportsFallbacks: true,
    sampleClock: values.sampleClock
  });
}

function collectRichEvents(input) {
  if (Array.isArray(input)) return input.map((event, index) => ({ event, path: `events[${index}]`, trackId: event.trackId || event.stem || "" }));
  const out = [];
  Object.entries(input?.sections || {}).forEach(([sectionId, section]) => {
    const tracks = section.richTracks || section.tracks || {};
    Object.entries(tracks).forEach(([trackId, track]) => {
      (track?.events || []).forEach((event, index) => out.push({ event, trackId, path: `sections.${sectionId}.tracks.${trackId}.events[${index}]` }));
    });
  });
  return out;
}

function articulationFallback(value) {
  if (value === "flam" || value === "drag" || value === "roll") return "accent";
  if (value === "pop" || value === "slap") return "accent";
  return "finger";
}

function entry(path, feature, action, fallback, message) {
  return { path, feature, action, ...(fallback ? { fallback } : {}), message };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
