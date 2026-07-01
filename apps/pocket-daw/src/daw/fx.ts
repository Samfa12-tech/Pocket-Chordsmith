import type { FxChain, FxPluginInstance, FxPluginType, FxState, JsonObject, PocketDawProject, Track } from "./schema";
import { cloneProject } from "./dawProject";
import { POCKET_BUILT_IN_FX } from "../../../../packages/pocket-audio-core/src/fx/built-in-fx.js";
import { POCKET_PRO_EQ_TYPE, getPocketProEqPreset, pocketProEqPresetParameters } from "../../../../packages/pocket-audio-core/src/fx/pro-eq.js";

export interface FxDefinition {
  type: FxPluginType;
  name: string;
  defaultParameters: JsonObject;
}

export const BUILT_IN_FX = POCKET_BUILT_IN_FX as unknown as FxDefinition[];

export function createDefaultFxState(tracks: Track[]): FxState {
  return {
    chains: tracks.filter(trackCanHaveFx).map((track) => createEmptyFxChain(track.id, `${track.name} FX`))
  };
}

export function createEmptyFxChain(trackId: string, name = "Track FX"): FxChain {
  return { id: `fx_${trackId}`, name, ownerTrackId: trackId, slots: [] };
}

export function ensureProjectFx(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  next.fx = next.fx && Array.isArray(next.fx.chains) ? next.fx : { chains: [] };
  const folderTrackIds = new Set(next.tracks.filter((track) => track.trackType === "folder").map((track) => track.id));
  next.fx.chains = next.fx.chains.filter((chain) => {
    if (folderTrackIds.has(String(chain.ownerTrackId || ""))) return false;
    if (String(chain.id || "").startsWith("fx_") && folderTrackIds.has(String(chain.id).slice(3))) return false;
    return true;
  });
  next.tracks.forEach((track) => {
    if (!trackCanHaveFx(track)) {
      delete track.fxChainId;
      return;
    }
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
  if (!track || !trackCanHaveFx(track) || !def) return next;
  const chain = next.fx.chains.find((item) => item.id === track.fxChainId);
  if (!chain) return next;
  chain.slots.push(createFxPluginInstance(def, chain.slots.length + 1));
  return next;
}

export function addFxSlotToChain(project: PocketDawProject, chainId: string, type: string): PocketDawProject {
  const next = cloneProject(project);
  const def = BUILT_IN_FX.find((item) => item.type === type);
  const chain = next.fx?.chains.find((item) => item.id === chainId);
  if (!def || !chain) return next;
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

export function setFxSlotParameter(project: PocketDawProject, chainId: string, slotId: string, parameter: string, value: number | boolean): PocketDawProject {
  const safeParameter = String(parameter || "").replace(/[^a-z0-9_-]+/gi, "");
  if (!safeParameter) return project;
  const next = cloneProject(project);
  const slot = next.fx?.chains.find((chain) => chain.id === chainId)?.slots.find((item) => item.id === slotId);
  if (!slot) return next;
  slot.parameters = { ...(slot.parameters || {}), [safeParameter]: value };
  return next;
}

export function setPocketProEqPreset(project: PocketDawProject, chainId: string, slotId: string, presetId: string): PocketDawProject {
  const next = cloneProject(project);
  const slot = next.fx?.chains.find((chain) => chain.id === chainId)?.slots.find((item) => item.id === slotId);
  if (!slot || slot.type !== POCKET_PRO_EQ_TYPE) return next;
  const preset = getPocketProEqPreset(presetId);
  slot.presetId = preset.id;
  slot.parameters = pocketProEqPresetParameters(preset.id);
  return next;
}

export function getTrackFxChain(project: PocketDawProject, track: Track | null | undefined): FxChain | null {
  if (!track?.fxChainId || !trackCanHaveFx(track)) return null;
  return project.fx?.chains.find((chain) => chain.id === track.fxChainId) || null;
}

export function getFxChainById(project: PocketDawProject, chainId: string | null | undefined): FxChain | null {
  if (!chainId) return null;
  return project.fx?.chains.find((chain) => chain.id === chainId) || null;
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

function trackCanHaveFx(track: Track): boolean {
  return track.trackType !== "folder";
}
