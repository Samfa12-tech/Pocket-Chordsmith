import {
  POCKET_DRUM_LANE_IDS,
  POCKET_DRUM_LANES
} from "../../../../packages/pocket-audio-core/src/sounds/drum-lanes.js";
import { addFxSlotToChain, createEmptyFxChain, getFxChainById, removeFxSlot, toggleFxSlot } from "./fx";
import type { FxChain, JsonObject, PocketDawProject, Track } from "./schema";

export type DrumLaneId = (typeof POCKET_DRUM_LANE_IDS)[number];

export interface DrumLaneDefinition {
  id: DrumLaneId;
  label: string;
  short: string;
  chordsmithPad: string;
  chordsmithPadName: string;
  chordsmithPadMeta: string;
  chordsmithPadKey: string;
  chordsmithPadClass: string;
  chordsmithRecordTrack: "kick" | "snare" | "hat" | null;
  chordsmithRecordLevel: number;
  sequenced: boolean;
  defaultVolume: number;
  defaultPan: number;
}

export interface DrumLaneMix {
  volume: number;
  pan: number;
  mute: boolean;
  fxChainId: string;
}

export const DRUM_LANE_DEFS = POCKET_DRUM_LANES as DrumLaneDefinition[];
export const DRUM_LANE_IDS = POCKET_DRUM_LANE_IDS as DrumLaneId[];

export function isDrumLaneId(value: string | undefined): value is DrumLaneId {
  return !!value && DRUM_LANE_IDS.includes(value as DrumLaneId);
}

export function isDrumEventKind(value: string): value is DrumLaneId {
  return isDrumLaneId(value);
}

export function ensureDrumLaneMixer(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  ensureDrumLaneMixerInPlace(next);
  return next;
}

export function ensureDrumLaneMixerInPlace(project: PocketDawProject): void {
  const drums = drumTrack(project);
  if (!drums) return;
  drums.metadata = { ...(drums.metadata || {}) };
  const lanes = laneMap(drums);
  DRUM_LANE_DEFS.forEach((def) => {
    const existing = lanes[def.id] as JsonObject | undefined;
    lanes[def.id] = {
      volume: clampNumber(existing?.volume, 0, 1.2, def.defaultVolume),
      pan: clampNumber(existing?.pan, -1, 1, def.defaultPan),
      mute: existing?.mute === true,
      fxChainId: safeChainId(existing?.fxChainId, drumLaneFxChainId(def.id))
    };
  });
  drums.metadata.drumLanes = lanes;
  project.fx = project.fx && Array.isArray(project.fx.chains) ? project.fx : { chains: [] };
  DRUM_LANE_DEFS.forEach((def) => {
    const mix = getDrumLaneMixFromTrack(drums, def.id);
    if (!project.fx.chains.some((chain) => chain.id === mix.fxChainId)) {
      const chain = createEmptyFxChain(`drums:${def.id}`, `${def.label} FX`);
      chain.id = mix.fxChainId;
      chain.metadata = { ...(chain.metadata || {}), drumLaneId: def.id, parentTrackId: "drums" };
      project.fx.chains.push(chain);
    }
  });
}

export function getDrumLaneMix(project: PocketDawProject, laneId: string): DrumLaneMix {
  return getDrumLaneMixFromTrack(drumTrack(project), laneId);
}

export function getDrumLaneFxChain(project: PocketDawProject, laneId: string): FxChain | null {
  const mix = getDrumLaneMix(project, laneId);
  return getFxChainById(project, mix.fxChainId);
}

export function setDrumLaneVolume(project: PocketDawProject, laneId: string, volume: number): PocketDawProject {
  return updateDrumLaneMix(project, laneId, { volume: clampNumber(volume, 0, 1.2, 1) });
}

export function setDrumLanePan(project: PocketDawProject, laneId: string, pan: number): PocketDawProject {
  return updateDrumLaneMix(project, laneId, { pan: clampNumber(pan, -1, 1, 0) });
}

export function setDrumLaneMute(project: PocketDawProject, laneId: string, mute: boolean): PocketDawProject {
  return updateDrumLaneMix(project, laneId, { mute });
}

export function addDrumLaneFx(project: PocketDawProject, laneId: string, type: string): PocketDawProject {
  const next = ensureDrumLaneMixer(project);
  const mix = getDrumLaneMix(next, laneId);
  return addFxSlotToChain(next, mix.fxChainId, type);
}

export function toggleDrumLaneFx(project: PocketDawProject, chainId: string, slotId: string): PocketDawProject {
  return toggleFxSlot(project, chainId, slotId);
}

export function removeDrumLaneFx(project: PocketDawProject, chainId: string, slotId: string): PocketDawProject {
  return removeFxSlot(project, chainId, slotId);
}

export function drumLaneFxChainId(laneId: string): string {
  return `fx_drums_lane_${safeLaneId(laneId)}`;
}

function updateDrumLaneMix(project: PocketDawProject, laneId: string, patch: Partial<DrumLaneMix>): PocketDawProject {
  if (!isDrumLaneId(laneId)) return project;
  const next = ensureDrumLaneMixer(project);
  const drums = drumTrack(next);
  if (!drums) return project;
  const lanes = laneMap(drums);
  lanes[laneId] = { ...getDrumLaneMixFromTrack(drums, laneId), ...patch };
  drums.metadata = { ...(drums.metadata || {}), drumLanes: lanes };
  return next;
}

function getDrumLaneMixFromTrack(track: Track | null | undefined, laneId: string): DrumLaneMix {
  const def = DRUM_LANE_DEFS.find((lane) => lane.id === laneId) || DRUM_LANE_DEFS[0];
  const lanes = laneMap(track);
  const source = (lanes[def.id] || {}) as JsonObject;
  return {
    volume: clampNumber(source.volume, 0, 1.2, def.defaultVolume),
    pan: clampNumber(source.pan, -1, 1, def.defaultPan),
    mute: source.mute === true,
    fxChainId: safeChainId(source.fxChainId, drumLaneFxChainId(def.id))
  };
}

function drumTrack(project: PocketDawProject): Track | null {
  return project.tracks.find((track) => track.role === "drums") || null;
}

function laneMap(track: Track | null | undefined): Record<string, JsonObject> {
  const lanes = track?.metadata?.drumLanes;
  return lanes && typeof lanes === "object" && !Array.isArray(lanes) ? { ...(lanes as Record<string, JsonObject>) } : {};
}

function safeChainId(value: unknown, fallback: string): string {
  const safe = String(value || "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 96);
  return safe || fallback;
}

function safeLaneId(value: string): string {
  return String(value || "lane").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cloneProject(project: PocketDawProject): PocketDawProject {
  return JSON.parse(JSON.stringify(project)) as PocketDawProject;
}
