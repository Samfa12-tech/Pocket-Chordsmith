import type { JsonObject, PocketDawProject, RoutingGraph, Track } from "./schema";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";

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
