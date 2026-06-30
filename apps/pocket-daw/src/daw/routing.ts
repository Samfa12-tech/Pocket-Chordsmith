import type { JsonObject, PocketDawProject, RoutingGraph, Track } from "./schema";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";
import { evaluateAutomationValue, getTrackSendAutomationLane, trackSendAutomationPath } from "./automation";

export function createRoutingGraph(tracks: Track[]): RoutingGraph {
  return {
    masterTrackId: tracks.find((track) => track.role === "master")?.id || "master",
    buses: tracks
      .filter((track) => track.trackType === "bus")
      .map((track) => ({ id: track.id, name: track.name, trackIds: tracks.filter((item) => item.routing.outputId === track.id).map((item) => item.id), outputId: track.routing.outputId || "master" })),
    returns: tracks
      .filter((track) => track.trackType === "return")
      .map((track) => ({ id: track.id, name: track.name, outputId: "master", effectChainIds: [] }))
  };
}

export function addBusTrack(project: PocketDawProject, name = "Bus"): { project: PocketDawProject; trackId: string } {
  const next = cloneProject(project);
  const id = uniqueTrackId(next, slug(name) || "bus");
  const track = createRoutingTrack(id, uniqueDisplayName(next, name), "bus", "#7ad7ff");
  insertBeforeReturns(next, track);
  next.fx.chains.push(createEmptyFxChain(track.id, `${track.name} FX`));
  syncRoutingGraph(next);
  return { project: next, trackId: id };
}

export function addReturnTrack(project: PocketDawProject, name = "Return"): { project: PocketDawProject; trackId: string } {
  const next = cloneProject(project);
  const id = uniqueTrackId(next, slug(name) || "return");
  const track = createRoutingTrack(id, uniqueDisplayName(next, name), "return", "#8aa0ff");
  insertBeforeMaster(next, track);
  next.fx.chains.push(createEmptyFxChain(track.id, `${track.name} FX`));
  syncRoutingGraph(next);
  return { project: next, trackId: id };
}

export function routeTrackToOutput(project: PocketDawProject, trackId: string, outputId: string | null): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  if (!track || track.role === "master") return project;
  const validOutput = outputId === null || outputId === "master" || next.tracks.some((item) => item.id === outputId && (item.trackType === "bus" || item.role === "master"));
  if (!validOutput || outputId === trackId || wouldCreateRoutingCycle(next, trackId, outputId)) return project;
  track.routing.outputId = outputId || "master";
  syncRoutingGraph(next);
  return next;
}

export function setTrackSendLevel(project: PocketDawProject, trackId: string, returnTrackId: string, level: number): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const ret = next.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  if (!track || !ret) return project;
  const sends = { ...((track.metadata?.sendLevels || {}) as JsonObject) };
  sends[returnTrackId] = Math.max(0, Math.min(1, Number(level) || 0));
  track.metadata = { ...(track.metadata || {}), sendLevels: sends };
  if (!track.routing.sendIds.includes(returnTrackId)) track.routing.sendIds.push(returnTrackId);
  syncRoutingGraph(next);
  return next;
}

export interface ActiveTrackSendRoute {
  returnTrackId: string;
  level: number;
  mode: TrackSendMode;
}

export type TrackSendMode = "post-fader" | "pre-fader";

export interface RoutingExportSummary {
  busCount: number;
  returnCount: number;
  sendCount: number;
  postFaderSendCount: number;
  preFaderSendCount: number;
  routedTrackCount: number;
  warnings: string[];
}

export function setTrackSendMode(project: PocketDawProject, trackId: string, returnTrackId: string, mode: TrackSendMode): PocketDawProject {
  const next = cloneProject(project);
  const track = next.tracks.find((item) => item.id === trackId);
  const ret = next.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
  if (!track || !ret) return project;
  const modes = { ...(sendModeMap(track) as Record<string, TrackSendMode>) };
  modes[returnTrackId] = cleanSendMode(mode);
  track.metadata = { ...(track.metadata || {}), sendModes: modes };
  if (!track.routing.sendIds.includes(returnTrackId)) track.routing.sendIds.push(returnTrackId);
  syncRoutingGraph(next);
  return next;
}

export function activeTrackSendRoutes(project: PocketDawProject, track: Track, bar = 1): ActiveTrackSendRoute[] {
  if (track.role === "master") return [];
  const levels = sendLevelMap(track);
  const sendIds = new Set<string>([
    ...(Array.isArray(track.routing?.sendIds) ? track.routing.sendIds : []),
    ...Object.keys(levels),
    ...project.automation.lanes.flatMap((lane) => {
      if (!lane.enabled || !lane.points.length) return [];
      const match = lane.targetPath.match(new RegExp(`^tracks\\.${escapeRegExp(track.id)}\\.sends\\.([^.]+)\\.level$`));
      return match ? [match[1]] : [];
    })
  ]);
  return Array.from(sendIds).flatMap((returnTrackId) => {
    if (!returnTrackId || returnTrackId === track.id) return [];
    const target = project.tracks.find((item) => item.id === returnTrackId && item.trackType === "return");
    if (!target) return [];
    const baseLevel = clampSendLevel(levels[returnTrackId]);
    const level = getAutomatedTrackSendLevel(project, track, returnTrackId, bar);
    const lane = getTrackSendAutomationLane(project, track.id, returnTrackId, "level");
    const automated = Boolean(lane?.enabled && lane.points.length);
    return level > 0 || (automated && baseLevel >= 0) ? [{ returnTrackId, level, mode: trackSendMode(track, returnTrackId) }] : [];
  });
}

export function trackSendLevel(track: Track, returnTrackId: string): number {
  return clampSendLevel(sendLevelMap(track)[returnTrackId]);
}

export function trackSendMode(track: Track, returnTrackId: string): TrackSendMode {
  return cleanSendMode(sendModeMap(track)[returnTrackId]);
}

export function getAutomatedTrackSendLevel(project: PocketDawProject, track: Track, returnTrackId: string, bar = 1): number {
  return clampSendLevel(evaluateAutomationValue(project, trackSendAutomationPath(track.id, returnTrackId, "level"), bar, trackSendLevel(track, returnTrackId)));
}

export function createRoutingExportSummary(project: PocketDawProject): RoutingExportSummary {
  const warnings: string[] = [];
  let sendCount = 0;
  let postFaderSendCount = 0;
  let preFaderSendCount = 0;
  const returns = new Set(project.tracks.filter((track) => track.trackType === "return").map((track) => track.id));
  project.tracks.forEach((track) => {
    if (track.role === "master") return;
    const sendIds = new Set([
      ...(track.routing.sendIds || []),
      ...Object.keys(sendLevelMap(track)),
      ...Object.keys(sendModeMap(track))
    ]);
    sendIds.forEach((returnTrackId) => {
      if (!returnTrackId) return;
      if (!returns.has(returnTrackId)) {
        warnings.push(`${track.name}: send target ${returnTrackId} is not a return track.`);
        return;
      }
      sendCount += 1;
      const mode = trackSendMode(track, returnTrackId);
      if (mode === "pre-fader") {
        preFaderSendCount += 1;
      } else {
        postFaderSendCount += 1;
      }
    });
  });
  return {
    busCount: project.tracks.filter((track) => track.trackType === "bus").length,
    returnCount: returns.size,
    sendCount,
    postFaderSendCount,
    preFaderSendCount,
    routedTrackCount: project.tracks.filter((track) => track.routing.outputId && track.routing.outputId !== "master").length,
    warnings
  };
}

export function availableTrackOutputs(project: PocketDawProject, trackId: string): Array<{ id: string; name: string }> {
  return [
    { id: "master", name: "Master" },
    ...project.tracks.filter((track) => track.trackType === "bus" && track.id !== trackId).map((track) => ({ id: track.id, name: track.name }))
  ];
}

export function syncRoutingGraph(project: PocketDawProject): PocketDawProject {
  project.routing = createRoutingGraph(project.tracks);
  return project;
}

function createRoutingTrack(id: string, name: string, trackType: "bus" | "return", colour: string): Track {
  return {
    id,
    name,
    trackType,
    role: trackType === "bus" ? "bus" : "fx-return",
    volume: trackType === "bus" ? 0.9 : 0.55,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    colour,
    routing: { inputIds: [], outputId: "master", sendIds: [] },
    automationLaneIds: [],
    fxChainId: `fx_${id}`,
    recordKind: "none",
    inputDeviceId: null,
    active: true,
    metadata: trackType === "return" ? { guardedSendReturn: true } : {}
  };
}

function insertBeforeReturns(project: PocketDawProject, track: Track) {
  const index = project.tracks.findIndex((item) => item.trackType === "return" || item.role === "master");
  if (index === -1) project.tracks.push(track);
  else project.tracks.splice(index, 0, track);
}

function insertBeforeMaster(project: PocketDawProject, track: Track) {
  const index = project.tracks.findIndex((item) => item.role === "master");
  if (index === -1) project.tracks.push(track);
  else project.tracks.splice(index, 0, track);
}

function uniqueTrackId(project: PocketDawProject, base: string): string {
  let id = base;
  let n = 2;
  while (project.tracks.some((track) => track.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function uniqueDisplayName(project: PocketDawProject, base: string): string {
  let name = base;
  let n = 2;
  while (project.tracks.some((track) => track.name === name)) {
    name = `${base} ${n}`;
    n += 1;
  }
  return name;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sendLevelMap(track: Track): Record<string, unknown> {
  const levels = track.metadata?.sendLevels;
  return levels && typeof levels === "object" && !Array.isArray(levels) ? levels as Record<string, unknown> : {};
}

function sendModeMap(track: Track): Record<string, unknown> {
  const modes = track.metadata?.sendModes;
  return modes && typeof modes === "object" && !Array.isArray(modes) ? modes as Record<string, unknown> : {};
}

function clampSendLevel(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cleanSendMode(value: unknown): TrackSendMode {
  return value === "pre-fader" ? "pre-fader" : "post-fader";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wouldCreateRoutingCycle(project: PocketDawProject, trackId: string, outputId: string | null): boolean {
  let current = outputId;
  const seen = new Set<string>();
  while (current && current !== "master") {
    if (current === trackId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = project.tracks.find((track) => track.id === current)?.routing.outputId || "master";
  }
  return false;
}
