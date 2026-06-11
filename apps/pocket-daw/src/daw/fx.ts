import type { FxChain, FxPluginInstance, FxPluginType, FxState, JsonObject, PocketDawProject, Track } from "./schema";
import { cloneProject } from "./dawProject";

export interface FxDefinition {
  type: FxPluginType;
  name: string;
  defaultParameters: JsonObject;
}

export const BUILT_IN_FX: FxDefinition[] = [
  { type: "utility-gain", name: "Utility Gain", defaultParameters: { gain: 1 } },
  { type: "high-pass", name: "High Pass", defaultParameters: { frequency: 80, q: 0.7 } },
  { type: "low-pass", name: "Low Pass", defaultParameters: { frequency: 12000, q: 0.7 } },
  { type: "three-band-eq", name: "3-Band EQ", defaultParameters: { lowGain: 0, midGain: 0, highGain: 0, midFrequency: 1200 } },
  { type: "compressor", name: "Compressor", defaultParameters: { threshold: -20, ratio: 3, attack: 0.006, release: 0.16 } },
  { type: "limiter", name: "Limiter", defaultParameters: { threshold: -4, ratio: 18, attack: 0.002, release: 0.08 } },
  { type: "noise-gate", name: "Noise Gate", defaultParameters: { threshold: -48, reduction: 0.18 } },
  { type: "saturation", name: "Saturation", defaultParameters: { drive: 1.8, mix: 0.65 } },
  { type: "bitcrusher", name: "Bitcrusher", defaultParameters: { bits: 8, mix: 0.45 } },
  { type: "delay", name: "Delay", defaultParameters: { time: 0.22, feedback: 0.28, mix: 0.32 } },
  { type: "ping-pong-delay", name: "Ping-Pong Delay", defaultParameters: { time: 0.28, feedback: 0.34, mix: 0.28 } },
  { type: "reverb", name: "Reverb", defaultParameters: { decay: 1.8, mix: 0.24 } },
  { type: "chorus", name: "Chorus", defaultParameters: { rate: 0.8, depth: 0.012, mix: 0.35 } },
  { type: "phaser", name: "Phaser", defaultParameters: { rate: 0.45, depth: 650, mix: 0.32 } },
  { type: "tremolo-autopan", name: "Tremolo / AutoPan", defaultParameters: { rate: 4, depth: 0.38 } }
];

export function createDefaultFxState(tracks: Track[]): FxState {
  return {
    chains: tracks.map((track) => createEmptyFxChain(track.id, `${track.name} FX`))
  };
}

export function createEmptyFxChain(trackId: string, name = "Track FX"): FxChain {
  return { id: `fx_${trackId}`, name, ownerTrackId: trackId, slots: [] };
}

export function ensureProjectFx(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  next.fx = next.fx && Array.isArray(next.fx.chains) ? next.fx : { chains: [] };
  next.tracks.forEach((track) => {
    const chainId = track.fxChainId || `fx_${track.id}`;
    track.fxChainId = chainId;
    if (!next.fx.chains.some((chain) => chain.id === chainId)) {
      next.fx.chains.push({ ...createEmptyFxChain(track.id, `${track.name} FX`), id: chainId });
    }
  });
  return next;
}

export function addFxSlot(project: PocketDawProject, trackId: string, type: string): PocketDawProject {
  const next = ensureProjectFx(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const def = BUILT_IN_FX.find((item) => item.type === type);
  if (!track || !def) return next;
  const chain = next.fx.chains.find((item) => item.id === track.fxChainId);
  if (!chain) return next;
  chain.slots.push(createFxPluginInstance(def, chain.slots.length + 1));
  return next;
}

export function toggleFxSlot(project: PocketDawProject, chainId: string, slotId: string): PocketDawProject {
  const next = cloneProject(project);
  const slot = next.fx?.chains.find((chain) => chain.id === chainId)?.slots.find((item) => item.id === slotId);
  if (slot) slot.enabled = !slot.enabled;
  return next;
}

export function removeFxSlot(project: PocketDawProject, chainId: string, slotId: string): PocketDawProject {
  const next = cloneProject(project);
  const chain = next.fx?.chains.find((item) => item.id === chainId);
  if (chain) chain.slots = chain.slots.filter((slot) => slot.id !== slotId);
  return next;
}

export function getTrackFxChain(project: PocketDawProject, track: Track | null | undefined): FxChain | null {
  if (!track?.fxChainId) return null;
  return project.fx?.chains.find((chain) => chain.id === track.fxChainId) || null;
}

function createFxPluginInstance(def: FxDefinition, index: number): FxPluginInstance {
  return {
    id: `slot_${Date.now().toString(36)}_${index}`,
    type: def.type,
    name: def.name,
    enabled: true,
    presetId: "default",
    parameters: { ...def.defaultParameters }
  };
}
