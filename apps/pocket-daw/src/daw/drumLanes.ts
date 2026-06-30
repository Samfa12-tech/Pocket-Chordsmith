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
  gate: number;
  mute: boolean;
  solo: boolean;
  fxChainId: string;
}

export const DRUM_LANE_DEFS = POCKET_DRUM_LANES as DrumLaneDefinition[];
export const DRUM_LANE_IDS = POCKET_DRUM_LANE_IDS as DrumLaneId[];
export const DEFAULT_DRUM_BRANCH_LANES = DRUM_LANE_IDS;

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
      gate: clampNumber(existing?.gate, 0.2, 1.5, 1),
      mute: existing?.mute === true,
      solo: existing?.solo === true,
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

export function setDrumLaneGate(project: PocketDawProject, laneId: string, gate: number): PocketDawProject {
  return updateDrumLaneMix(project, laneId, { gate: clampNumber(gate, 0.2, 1.5, 1) });
}

export function setDrumLaneMute(project: PocketDawProject, laneId: string, mute: boolean): PocketDawProject {
  return updateDrumLaneMix(project, laneId, { mute });
}

export function setDrumLaneSolo(project: PocketDawProject, laneId: string, solo: boolean): PocketDawProject {
  return updateDrumLaneMix(project, laneId, { solo });
}

export function anyDrumLaneSolo(project: PocketDawProject): boolean {
  return DRUM_LANE_DEFS.some((def) => getDrumLaneMix(project, def.id).solo);
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

export function generatedDrumBranchLane(track: Track | null | undefined): DrumLaneId | null {
  const lane = typeof track?.metadata?.generatedDrumLane === "string" ? track.metadata.generatedDrumLane : "";
  return isDrumLaneId(lane) ? lane : null;
}

export function branchGeneratedDrumsToTracks(project: PocketDawProject, lanes: readonly DrumLaneId[] = DEFAULT_DRUM_BRANCH_LANES): PocketDawProject {
  const next = ensureDrumLaneMixer(project);
  const drums = drumTrack(next);
  if (!drums) return project;
  const branchLanes = lanes.filter(isDrumLaneId);
  const parentIndex = next.tracks.findIndex((track) => track.id === drums.id);
  let insertIndex = parentIndex >= 0 ? parentIndex + 1 : next.tracks.length;
  const existingBranching =
    drums.metadata?.drumBranching && typeof drums.metadata.drumBranching === "object" && !Array.isArray(drums.metadata.drumBranching)
      ? (drums.metadata.drumBranching as JsonObject)
      : {};
  const existingBranchLanes =
    existingBranching.lanes && typeof existingBranching.lanes === "object" && !Array.isArray(existingBranching.lanes)
      ? (existingBranching.lanes as Record<string, JsonObject>)
      : {};

  drums.metadata = {
    ...(drums.metadata || {}),
    drumBranching: {
      ...existingBranching,
      enabled: true,
      parentTrackId: drums.id,
      mode: "generated-source-view",
      lanes: Object.fromEntries(
        branchLanes.map((lane) => [
          lane,
          {
            ...(existingBranchLanes[lane] || {}),
            trackId: drumBranchTrackId(drums.id, lane),
            visible: existingBranchLanes[lane]?.visible !== false
          }
        ])
      )
    }
  };

  for (const lane of branchLanes) {
    const id = drumBranchTrackId(drums.id, lane);
    const mix = getDrumLaneMixFromTrack(drums, lane);
    const existing = next.tracks.find((track) => track.id === id);
    if (existing) {
      syncBranchTrackFromLane(existing, drums, lane, mix);
      continue;
    }
    const track = createDrumBranchTrack(drums, lane, mix, next.sourceRefs.find((ref) => ref.sourceType === "pocket-chordsmith")?.id);
    next.tracks.splice(insertIndex, 0, track);
    insertIndex += 1;
  }
  return next;
}

export function collapseGeneratedDrumBranches(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  const drums = drumTrack(next);
  next.tracks = next.tracks.filter((track) => !generatedDrumBranchLane(track));
  if (drums) {
    drums.metadata = {
      ...(drums.metadata || {}),
      drumBranching: {
        ...((drums.metadata?.drumBranching || {}) as JsonObject),
        enabled: false,
        parentTrackId: drums.id,
        mode: "generated-source-view"
      }
    };
  }
  return next;
}

export function drumBranchGroupCollapsed(project: PocketDawProject): boolean {
  const branching = drumTrack(project)?.metadata?.drumBranching as JsonObject | undefined;
  return branching?.collapsed === true;
}

export function setDrumBranchGroupCollapsed(project: PocketDawProject, collapsed: boolean): PocketDawProject {
  const next = cloneProject(project);
  const drums = drumTrack(next);
  if (!drums) return project;
  drums.metadata = {
    ...(drums.metadata || {}),
    drumBranching: {
      ...((drums.metadata?.drumBranching || {}) as JsonObject),
      parentTrackId: drums.id,
      mode: "generated-source-view",
      collapsed
    }
  };
  return next;
}

export function getDrumBranchStepLevel(project: PocketDawProject, sectionId: string, laneId: string, step: number): number {
  if (!isDrumLaneId(laneId)) return 0;
  const steps = getDrumBranchSectionLane(project, sectionId, laneId);
  return clampStepLevel(steps[Math.max(0, Math.round(step))]);
}

export function getDrumBranchLaneSteps(project: PocketDawProject, sectionId: string, laneId: string): number[] {
  if (!isDrumLaneId(laneId)) return [];
  return getDrumBranchSectionLane(project, sectionId, laneId).map(clampStepLevel);
}

export function cycleDrumBranchStep(project: PocketDawProject, sectionId: string, laneId: string, step: number): PocketDawProject {
  if (!isDrumLaneId(laneId)) return project;
  const def = DRUM_LANE_DEFS.find((lane) => lane.id === laneId);
  if (def?.sequenced) return project;
  const safeSectionId = safeLaneId(sectionId).toUpperCase();
  const safeStep = Math.max(0, Math.round(step));
  const next = ensureDrumLaneMixer(project);
  const drums = drumTrack(next);
  if (!drums) return project;
  const overlays = drumBranchOverlayMap(drums);
  const section = { ...(overlays[safeSectionId] || {}) };
  const lane = Array.isArray(section[laneId]) ? [...(section[laneId] as number[])] : [];
  while (lane.length <= safeStep) lane.push(0);
  lane[safeStep] = (clampStepLevel(lane[safeStep]) + 1) % 3;
  section[laneId] = lane;
  overlays[safeSectionId] = section;
  drums.metadata = { ...(drums.metadata || {}), drumBranchEvents: overlays };
  return next;
}

export interface DrumBranchStepWrite {
  sectionId: string;
  laneId: DrumLaneId;
  step: number;
  level: number;
}

export function writeDrumBranchStepLevels(project: PocketDawProject, writes: readonly DrumBranchStepWrite[]): PocketDawProject {
  const valid = writes
    .filter((write) => isDrumLaneId(write.laneId) && Number.isFinite(write.step) && Number.isFinite(write.level))
    .map((write) => ({
      sectionId: safeLaneId(write.sectionId).toUpperCase(),
      laneId: write.laneId,
      step: Math.max(0, Math.round(write.step)),
      level: clampStepLevel(write.level)
    }))
    .filter((write) => write.level > 0);
  if (!valid.length) return project;
  const next = branchGeneratedDrumsToTracks(project);
  const drums = drumTrack(next);
  if (!drums) return project;
  const overlays = drumBranchOverlayMap(drums);
  valid.forEach((write) => {
    const section = { ...(overlays[write.sectionId] || {}) };
    const lane = Array.isArray(section[write.laneId]) ? [...(section[write.laneId] as number[])] : [];
    while (lane.length <= write.step) lane.push(0);
    lane[write.step] = Math.max(clampStepLevel(lane[write.step]), write.level);
    section[write.laneId] = lane;
    overlays[write.sectionId] = section;
  });
  drums.metadata = { ...(drums.metadata || {}), drumBranchEvents: overlays };
  return next;
}

export function syncDrumBranchTrackMix(project: PocketDawProject, laneId: string): PocketDawProject {
  if (!isDrumLaneId(laneId)) return project;
  const next = ensureDrumLaneMixer(project);
  const drums = drumTrack(next);
  const mix = getDrumLaneMix(next, laneId);
  next.tracks.forEach((track) => {
    if (generatedDrumBranchLane(track) === laneId) syncBranchTrackFromLane(track, drums, laneId, mix);
  });
  return next;
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
    gate: clampNumber(source.gate, 0.2, 1.5, 1),
    mute: source.mute === true,
    solo: source.solo === true,
    fxChainId: safeChainId(source.fxChainId, drumLaneFxChainId(def.id))
  };
}

function createDrumBranchTrack(parent: Track, laneId: DrumLaneId, mix: DrumLaneMix, sourceRefId: string | undefined): Track {
  const def = DRUM_LANE_DEFS.find((lane) => lane.id === laneId)!;
  return {
    id: drumBranchTrackId(parent.id, laneId),
    name: def.label,
    trackType: "generated",
    role: "drums",
    volume: mix.volume,
    pan: mix.pan,
    mute: mix.mute,
    solo: mix.solo,
    armed: false,
    colour: parent.colour,
    routing: { inputIds: [], outputId: parent.routing.outputId || "master", sendIds: [...(parent.routing.sendIds || [])] },
    automationLaneIds: [],
    fxChainId: mix.fxChainId,
    recordKind: "none",
    inputDeviceId: null,
    monitorEnabled: false,
    active: true,
    metadata: {
      generatedDrumLane: laneId,
      parentGeneratedTrackId: parent.id,
      branchMode: "generated-source-view",
      branchViewOnly: true,
      soloGuarded: false,
      ...(sourceRefId ? { sourceRefId } : {})
    }
  };
}

function syncBranchTrackFromLane(track: Track, parent: Track | null, laneId: DrumLaneId, mix: DrumLaneMix): void {
  const def = DRUM_LANE_DEFS.find((lane) => lane.id === laneId)!;
  track.name = track.name || def.label;
  track.trackType = "generated";
  track.role = "drums";
  track.volume = mix.volume;
  track.pan = mix.pan;
  track.mute = mix.mute;
  track.solo = mix.solo;
  track.fxChainId = mix.fxChainId;
  track.active = true;
  const existingRouting = track.routing || { inputIds: [], outputId: null, sendIds: [] };
  track.routing = {
    inputIds: [],
    outputId: existingRouting.outputId || parent?.routing.outputId || "master",
    sendIds: [...(existingRouting.sendIds || [])]
  };
  track.metadata = {
    ...(track.metadata || {}),
    generatedDrumLane: laneId,
    parentGeneratedTrackId: parent?.id || "drums",
    branchMode: "generated-source-view",
    branchViewOnly: true,
    soloGuarded: false
  };
}

function drumBranchTrackId(parentTrackId: string, laneId: DrumLaneId): string {
  return `${safeLaneId(parentTrackId)}-${safeLaneId(laneId)}`;
}

function drumTrack(project: PocketDawProject): Track | null {
  return project.tracks.find((track) => track.role === "drums") || null;
}

function laneMap(track: Track | null | undefined): Record<string, JsonObject> {
  const lanes = track?.metadata?.drumLanes;
  return lanes && typeof lanes === "object" && !Array.isArray(lanes) ? { ...(lanes as Record<string, JsonObject>) } : {};
}

function drumBranchOverlayMap(track: Track | null | undefined): Record<string, Record<string, number[]>> {
  const source = track?.metadata?.drumBranchEvents;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out: Record<string, Record<string, number[]>> = {};
  Object.entries(source as Record<string, unknown>).forEach(([sectionId, section]) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) return;
    const lanes: Record<string, number[]> = {};
    Object.entries(section as Record<string, unknown>).forEach(([laneId, values]) => {
      if (!isDrumLaneId(laneId) || !Array.isArray(values)) return;
      lanes[laneId] = values.map(clampStepLevel);
    });
    if (Object.keys(lanes).length) out[sectionId] = lanes;
  });
  return out;
}

function getDrumBranchSectionLane(project: PocketDawProject, sectionId: string, laneId: DrumLaneId): number[] {
  const overlays = drumBranchOverlayMap(drumTrack(project));
  const section = overlays[String(sectionId || "").toUpperCase()];
  const lane = section?.[laneId];
  return Array.isArray(lane) ? lane : [];
}

function clampStepLevel(value: unknown): number {
  return Math.max(0, Math.min(2, Math.round(clampNumber(value, 0, 2, 0))));
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
