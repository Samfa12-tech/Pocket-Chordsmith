import type { JsonObject } from "../daw/schema";
import type { SanitizedPcsProject, SanitizedPcsRichEvent } from "./pcsSanitizer";

export const PCS17_FORMAT_FEATURES = [
  "sound-profile-v1",
  "rich-events-v1",
  "articulations-v1",
  "expanded-drums-v1",
  "capability-report-v1"
] as const;

export const POCKET_DAW_PROFILE_IDS = [
  "standard",
  "lofi_chill",
  "chip_arcade",
  "western_frontier",
  "heavy_metal",
  "funk_groove"
] as const;

export type PocketDawProfileId = (typeof POCKET_DAW_PROFILE_IDS)[number];
export type PcsCompatibilityAction = "preserved" | "fallback" | "dropped" | "approximated";

export interface PcsCompatibilityEntry {
  path: string;
  feature: string;
  action: PcsCompatibilityAction;
  fallback?: string;
  message: string;
}

export interface PocketDawPcsCapabilityReport {
  consumer: "pocket-daw-native";
  schemaVersions: number[];
  requestedFeatures: string[];
  supportedFeatures: string[];
  supportedProfiles: PocketDawProfileId[];
  entries: PcsCompatibilityEntry[];
  lossCount: number;
}

const DIRECT_ARTICULATIONS = new Set([
  "finger", "slap", "pop", "mute", "ghost", "hammer", "pull", "slide", "hold",
  "staccato", "legato", "bend", "vibrato", "tremolo", "open", "chug", "scratch",
  "palm_mute", "accent", "choke", "note", "block"
]);

const ARTICULATION_FALLBACKS: Record<string, string> = {
  flam: "accent",
  drag: "ghost",
  roll: "tremolo"
};

const DRUM_LANE_MAP: Record<string, string> = {
  kick: "kick",
  snare: "snare",
  rim: "snare",
  clap: "clap",
  hat_closed: "hat",
  hat: "hat",
  hat_open: "openhat",
  openhat: "openhat",
  ride: "ride",
  crash: "crash",
  china: "crash",
  tom_high: "tomhi",
  tomhi: "tomhi",
  tom_mid: "tommid",
  tommid: "tommid",
  tom_low: "tomlow",
  tomlow: "tomlow",
  percussion: "clap"
};

const SOUND_FALLBACKS: Record<string, Record<string, string>> = {
  western_frontier: {
    acoustic_guitar: "western_twang",
    western_acoustic: "western_twang",
    resonator: "western_twang",
    upright_bass: "soft_upright",
    fiddle: "soft",
    mandolin: "banjo"
  },
  funk_groove: {
    funk_finger_pocket: "soft_upright",
    funk_slap_pop: "soft_upright",
    funk_muted_thump: "soft_upright",
    funk_round_finger: "soft_upright",
    funk_synth_pocket: "classic",
    funk_clav_stab: "muted_jazz_guitar",
    funk_rhodes_stab: "dusty_rhodes",
    funk_muted_guitar: "clean",
    funk_brass_stack: "trumpet",
    funk_sax_punch: "saxophone"
  }
};

export function pocketDawPcsCapabilities(): JsonObject {
  return {
    consumer: "pocket-daw-native",
    schemaVersions: [16, 17],
    formatFeatures: [...PCS17_FORMAT_FEATURES],
    profiles: [...POCKET_DAW_PROFILE_IDS],
    articulations: [...DIRECT_ARTICULATIONS],
    expandedDrumLanes: Object.keys(DRUM_LANE_MAP)
  };
}

export function negotiatePocketDawPcsCapabilities(project: SanitizedPcsProject): PocketDawPcsCapabilityReport {
  const entries: PcsCompatibilityEntry[] = [];
  const requestedFeatures = [...project.formatFeatures];
  requestedFeatures.forEach((feature) => {
    if ((PCS17_FORMAT_FEATURES as readonly string[]).includes(feature)) return;
    entries.push({
      path: "formatFeatures",
      feature,
      action: "preserved",
      message: `Pocket DAW preserved unsupported format feature "${feature}" in the original PCS source.`
    });
  });

  Object.entries(project.sections).forEach(([sectionId, section]) => {
    Object.entries(section.richEvents).forEach(([trackRole, events]) => {
      events.forEach((event, index) => {
        const base = `sections.${sectionId}.tracks.${trackRole}.events[${index}]`;
        appendArticulationCapability(entries, event, base);
        if (trackRole === "drums") appendDrumCapability(entries, event, base);
        appendSoundCapability(entries, project.soundProfile.id, event, base);
      });
    });
  });

  return {
    consumer: "pocket-daw-native",
    schemaVersions: [16, 17],
    requestedFeatures,
    supportedFeatures: [...PCS17_FORMAT_FEATURES],
    supportedProfiles: [...POCKET_DAW_PROFILE_IDS],
    entries,
    lossCount: entries.filter((entry) => entry.action !== "preserved").length
  };
}

function appendArticulationCapability(entries: PcsCompatibilityEntry[], event: SanitizedPcsRichEvent, base: string): void {
  const articulation = event.articulation;
  if (!articulation || DIRECT_ARTICULATIONS.has(articulation)) return;
  const fallback = ARTICULATION_FALLBACKS[articulation] || "note";
  entries.push({
    path: `${base}.articulation`,
    feature: `articulation:${articulation}`,
    action: "fallback",
    fallback,
    message: `Pocket DAW renders ${articulation} as ${fallback} while preserving the source articulation.`
  });
}

function appendDrumCapability(entries: PcsCompatibilityEntry[], event: SanitizedPcsRichEvent, base: string): void {
  const lane = event.sound || stringField(event.expression, "lane") || "percussion";
  const fallback = mapPcsDrumLane(lane);
  if (fallback === lane || (lane === "hat_closed" && fallback === "hat") || (lane === "hat_open" && fallback === "openhat")) return;
  entries.push({
    path: `${base}.sound`,
    feature: `drum-lane:${lane}`,
    action: "fallback",
    fallback,
    message: `${lane} is rendered with Pocket DAW's ${fallback} native recipe; the original lane remains in PCS.`
  });
}

function appendSoundCapability(entries: PcsCompatibilityEntry[], profileId: string, event: SanitizedPcsRichEvent, base: string): void {
  if (!event.sound) return;
  const fallback = SOUND_FALLBACKS[profileId]?.[event.sound];
  if (!fallback) return;
  entries.push({
    path: `${base}.sound`,
    feature: `sound:${event.sound}`,
    action: "approximated",
    fallback,
    message: `${event.sound} uses the native ${fallback} recipe with ${profileId} articulation shaping.`
  });
}

export function mapPcsArticulation(value: string): string {
  return DIRECT_ARTICULATIONS.has(value) ? value : ARTICULATION_FALLBACKS[value] || "note";
}

export function mapPcsDrumLane(value: string): string {
  return DRUM_LANE_MAP[value] || "clap";
}

export function mapPcsSound(profileId: string, value: string): string {
  return SOUND_FALLBACKS[profileId]?.[value] || value;
}

function stringField(value: JsonObject, key: string): string {
  return typeof value[key] === "string" ? String(value[key]) : "";
}
