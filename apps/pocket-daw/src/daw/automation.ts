import type { AutomationLane, AutomationPoint, PocketDawProject, Track } from "./schema";
import { cloneProject } from "./dawProject";

export function evaluateAutomationLane(lane: AutomationLane, bar: number, fallback = 0): number {
  if (!lane.enabled || !lane.points.length) return clamp(fallback, lane.min, lane.max);
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar);
  if (bar <= points[0].bar) return clamp(points[0].value, lane.min, lane.max);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (bar >= a.bar && bar <= b.bar) {
      if (a.curve === "hold") return clamp(a.value, lane.min, lane.max);
      const t = (bar - a.bar) / Math.max(0.0001, b.bar - a.bar);
      return clamp(interpolateAutomationValue(a.value, b.value, t, a.curve), lane.min, lane.max);
    }
  }
  return clamp(points[points.length - 1].value, lane.min, lane.max);
}

export type TrackAutomationField = "volume" | "pan";
export type ClipAutomationField = "gain";
export type TrackSendAutomationField = "level";

export function trackAutomationPath(trackId: string, field: TrackAutomationField): string {
  return `tracks.${trackId}.${field}`;
}

export function trackSendAutomationPath(trackId: string, returnTrackId: string, field: TrackSendAutomationField): string {
  return `tracks.${trackId}.sends.${returnTrackId}.${field}`;
}

export function clipAutomationPath(clipId: string, field: ClipAutomationField): string {
  return `clips.${clipId}.${field}`;
}

export function createAutomationLane(project: PocketDawProject, targetPath: string, options: Partial<AutomationLane> = {}): { project: PocketDawProject; laneId: string } {
  const next = cloneProject(project);
  const laneId = uniqueLaneId(next, options.id || laneIdFromTarget(targetPath));
  const defaults = automationDefaultsForTarget(targetPath);
  const lane: AutomationLane = {
    id: laneId,
    targetPath,
    unit: options.unit || defaults.unit,
    min: options.min ?? defaults.min,
    max: options.max ?? defaults.max,
    points: (options.points || []).map((point) => cleanPoint(point, options.min ?? defaults.min, options.max ?? defaults.max)).sort(pointSort),
    enabled: options.enabled ?? true
  };
  next.automation.lanes.push(lane);
  attachLaneToTrack(next, lane);
  attachLaneToClip(next, lane);
  return { project: next, laneId };
}

export function ensureTrackAutomationLane(project: PocketDawProject, trackId: string, field: TrackAutomationField): { project: PocketDawProject; laneId: string } {
  const targetPath = trackAutomationPath(trackId, field);
  const existing = project.automation.lanes.find((lane) => lane.targetPath === targetPath);
  if (existing) return { project, laneId: existing.id };
  const track = project.tracks.find((item) => item.id === trackId);
  return createAutomationLane(project, targetPath, {
    id: `auto_${trackId}_${field}`,
    min: field === "pan" ? -1 : 0,
    max: field === "pan" ? 1 : 1.2,
    points: [{ bar: 1, value: field === "pan" ? track?.pan || 0 : 1, curve: "linear" }]
  });
}

export function addAutomationPoint(project: PocketDawProject, laneId: string, point: AutomationPoint): PocketDawProject {
  return editLane(project, laneId, (lane) => {
    lane.points.push(cleanPoint(point, lane.min, lane.max));
    lane.points.sort(pointSort);
  });
}

export function updateAutomationPoint(project: PocketDawProject, laneId: string, pointIndex: number, patch: Partial<AutomationPoint>): PocketDawProject {
  return editLane(project, laneId, (lane) => {
    const point = lane.points[pointIndex];
    if (!point) return;
    lane.points[pointIndex] = cleanPoint({ ...point, ...patch }, lane.min, lane.max);
    lane.points.sort(pointSort);
  });
}

export function deleteAutomationPoint(project: PocketDawProject, laneId: string, pointIndex: number): PocketDawProject {
  return editLane(project, laneId, (lane) => {
    lane.points = lane.points.filter((_, index) => index !== pointIndex);
  });
}

export function setAutomationLaneEnabled(project: PocketDawProject, laneId: string, enabled: boolean): PocketDawProject {
  return editLane(project, laneId, (lane) => {
    lane.enabled = enabled;
  });
}

export function ensureClipAutomationLane(project: PocketDawProject, clipId: string, field: ClipAutomationField): { project: PocketDawProject; laneId: string } {
  const targetPath = clipAutomationPath(clipId, field);
  const existing = project.automation.lanes.find((lane) => lane.targetPath === targetPath);
  if (existing) return { project, laneId: existing.id };
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  const fallbackGain = typeof clip?.metadata?.gain === "number" ? clip.metadata.gain : clip?.transforms.gain ?? 1;
  return createAutomationLane(project, targetPath, {
    id: `auto_${clipId}_${field}`,
    min: 0,
    max: 4,
    points: [{ bar: clip?.startBar || 1, value: fallbackGain, curve: "linear" }]
  });
}

export function ensureTrackSendAutomationLane(project: PocketDawProject, trackId: string, returnTrackId: string, field: TrackSendAutomationField): { project: PocketDawProject; laneId: string } {
  const targetPath = trackSendAutomationPath(trackId, returnTrackId, field);
  const existing = project.automation.lanes.find((lane) => lane.targetPath === targetPath);
  if (existing) return { project, laneId: existing.id };
  const track = project.tracks.find((item) => item.id === trackId);
  const levels = track?.metadata?.sendLevels;
  const fallbackLevel = levels && typeof levels === "object" && !Array.isArray(levels) ? Number((levels as Record<string, unknown>)[returnTrackId]) : 0;
  return createAutomationLane(project, targetPath, {
    id: `auto_${trackId}_send_${returnTrackId}_${field}`,
    min: 0,
    max: 1,
    points: [{ bar: 1, value: Number.isFinite(fallbackLevel) ? fallbackLevel : 0, curve: "linear" }]
  });
}

export function evaluateAutomationValue(project: PocketDawProject, targetPath: string, bar: number, fallback: number): number {
  const lane = project.automation.lanes.find((item) => item.targetPath === targetPath);
  return lane ? evaluateAutomationLane(lane, bar, fallback) : fallback;
}

export function getTrackAutomationLane(project: PocketDawProject, trackId: string, field: TrackAutomationField): AutomationLane | null {
  return project.automation.lanes.find((lane) => lane.targetPath === trackAutomationPath(trackId, field)) || null;
}

export function getClipAutomationLane(project: PocketDawProject, clipId: string, field: ClipAutomationField): AutomationLane | null {
  return project.automation.lanes.find((lane) => lane.targetPath === clipAutomationPath(clipId, field)) || null;
}

export function getTrackSendAutomationLane(project: PocketDawProject, trackId: string, returnTrackId: string, field: TrackSendAutomationField): AutomationLane | null {
  return project.automation.lanes.find((lane) => lane.targetPath === trackSendAutomationPath(trackId, returnTrackId, field)) || null;
}

export function getAutomatedTrackControls(project: PocketDawProject, track: Track, bar: number): { volume: number; pan: number } {
  const volumeMultiplier = evaluateAutomationValue(project, trackAutomationPath(track.id, "volume"), bar, 1);
  const panOverride = evaluateAutomationValue(project, trackAutomationPath(track.id, "pan"), bar, track.pan);
  return {
    volume: clamp(track.volume * volumeMultiplier, 0, 1.2),
    pan: clamp(panOverride, -1, 1)
  };
}

export function activeAutomationLaneCount(project: PocketDawProject): number {
  return project.automation.lanes.filter((lane) => lane.enabled && lane.points.length > 0).length;
}

export function trackHasAutomation(project: PocketDawProject, trackId: string): boolean {
  return project.automation.lanes.some((lane) => lane.enabled && lane.targetPath.startsWith(`tracks.${trackId}.`) && lane.points.length > 0);
}

export function clipHasAutomation(project: PocketDawProject, clipId: string): boolean {
  return project.automation.lanes.some((lane) => lane.enabled && lane.targetPath.startsWith(`clips.${clipId}.`) && lane.points.length > 0);
}

function editLane(project: PocketDawProject, laneId: string, updater: (lane: AutomationLane) => void): PocketDawProject {
  const next = cloneProject(project);
  const lane = next.automation.lanes.find((item) => item.id === laneId);
  if (!lane) return project;
  updater(lane);
  attachLaneToTrack(next, lane);
  attachLaneToClip(next, lane);
  return next;
}

function attachLaneToTrack(project: PocketDawProject, lane: AutomationLane) {
  const parsed = parseTrackTarget(lane.targetPath);
  if (!parsed) return;
  const track = project.tracks.find((item) => item.id === parsed.trackId);
  if (track && !track.automationLaneIds.includes(lane.id)) track.automationLaneIds.push(lane.id);
}

function attachLaneToClip(project: PocketDawProject, lane: AutomationLane) {
  const parsed = parseClipTarget(lane.targetPath);
  if (!parsed) return;
  const clip = project.timeline.clips.find((item) => item.id === parsed.clipId);
  if (clip) clip.automationLaneId = lane.id;
}

function parseTrackTarget(targetPath: string): { trackId: string; field: TrackAutomationField | TrackSendAutomationField } | null {
  const direct = targetPath.match(/^tracks\.([^.]+)\.(volume|pan)$/);
  if (direct) return { trackId: direct[1], field: direct[2] as TrackAutomationField };
  const send = targetPath.match(/^tracks\.([^.]+)\.sends\.([^.]+)\.(level)$/);
  return send ? { trackId: send[1], field: send[3] as TrackSendAutomationField } : null;
}

function parseClipTarget(targetPath: string): { clipId: string; field: ClipAutomationField } | null {
  const match = targetPath.match(/^clips\.([^.]+)\.(gain)$/);
  return match ? { clipId: match[1], field: match[2] as ClipAutomationField } : null;
}

function automationDefaultsForTarget(targetPath: string): { unit: AutomationLane["unit"]; min: number; max: number } {
  if (targetPath.endsWith(".pan")) return { unit: "linear", min: -1, max: 1 };
  if (/^tracks\.[^.]+\.sends\.[^.]+\.level$/.test(targetPath)) return { unit: "percent", min: 0, max: 1 };
  if (targetPath.startsWith("clips.") && targetPath.endsWith(".gain")) return { unit: "percent", min: 0, max: 4 };
  return { unit: "percent", min: 0, max: 1.2 };
}

function cleanPoint(point: Partial<AutomationPoint>, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): AutomationPoint {
  return {
    bar: Math.max(1, round(Number(point.bar || 1), 3)),
    beat: point.beat === undefined ? undefined : Math.max(1, round(Number(point.beat), 3)),
    tick: point.tick === undefined ? undefined : Math.max(0, Math.round(Number(point.tick))),
    value: clamp(Number(point.value ?? 0), min, max),
    curve: point.curve === "hold" ? "hold" : point.curve === "ease-in" || point.curve === "ease-out" ? point.curve : "linear"
  };
}

function pointSort(a: AutomationPoint, b: AutomationPoint): number {
  return a.bar - b.bar || (a.beat || 0) - (b.beat || 0) || (a.tick || 0) - (b.tick || 0);
}

export function interpolateAutomationValue(start: number, end: number, t: number, curve: AutomationPoint["curve"] = "linear"): number {
  const x = clamp(t, 0, 1);
  const shaped = curve === "ease-in" ? x * x : curve === "ease-out" ? 1 - (1 - x) * (1 - x) : x;
  return start + (end - start) * shaped;
}

function laneIdFromTarget(targetPath: string): string {
  return `auto_${targetPath.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function uniqueLaneId(project: PocketDawProject, base: string): string {
  let id = base;
  let n = 2;
  while (project.automation.lanes.some((lane) => lane.id === id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

function round(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const mul = 10 ** places;
  return Math.round(value * mul) / mul;
}

function clamp(value: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.max(min, Math.min(max, safe));
}
