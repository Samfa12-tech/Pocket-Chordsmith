import type { Clip, PocketDawProject, TimelineMarker, TimelinePosition } from "./schema";
import { cloneProject } from "./dawProject";

export type SnapMode = "bar" | "beat" | "off";

export function sortClips(clips: Clip[]): Clip[] {
  return clips.slice().sort((a, b) => a.startBar - b.startBar || (a.lane || 0) - (b.lane || 0) || a.id.localeCompare(b.id));
}

export function recomputeTimelineBars(project: PocketDawProject): PocketDawProject {
  const lastBar = project.timeline.clips.reduce((max, clip) => Math.max(max, clip.startBar + clip.barLength - 1), 1);
  project.timeline.bars = Math.max(1, lastBar);
  if (project.timeline.loop.endBar > project.timeline.bars + 1) project.timeline.loop.endBar = project.timeline.bars + 1;
  return project;
}

export function positionToBarFloat(pos: TimelinePosition, timeSig: number, ppq: number): number {
  const beat = Math.max(1, pos.beat) - 1;
  return pos.bar + beat / Math.max(1, timeSig) + pos.tick / Math.max(1, ppq * timeSig);
}

export function barFloatToPosition(value: number, timeSig: number, ppq: number): TimelinePosition {
  const bar = Math.max(1, Math.floor(value));
  const barFraction = Math.max(0, value - bar);
  const beatFloat = barFraction * timeSig;
  const beat = Math.floor(beatFloat) + 1;
  const tick = Math.round((beatFloat - Math.floor(beatFloat)) * ppq);
  return { bar, beat, tick };
}

export function barsToSeconds(bars: number, bpm: number, timeSig: number): number {
  return bars * timeSig * (60 / bpm);
}

export function secondsToBars(seconds: number, bpm: number, timeSig: number): number {
  return seconds / Math.max(0.0001, timeSig * (60 / bpm));
}

export function findClipAtBar(project: PocketDawProject, bar: number): Clip | null {
  return sortClips(project.timeline.clips).find((clip) => bar >= clip.startBar && bar < clip.startBar + clip.barLength) || null;
}

export function snapBarValue(value: number, mode: SnapMode, timeSig: number): number {
  const safe = Math.max(1, value);
  if (mode === "off") return Math.round(safe * 100) / 100;
  if (mode === "beat") {
    const beatSize = 1 / Math.max(1, timeSig);
    return Math.max(1, Math.round((safe - 1) / beatSize) * beatSize + 1);
  }
  return Math.max(1, Math.round(safe));
}

export function setLoopToClip(project: PocketDawProject, clipId: string): PocketDawProject {
  const next = cloneProject(project);
  const clip = next.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return project;
  next.timeline.loop = {
    enabled: true,
    startBar: Math.max(1, clip.startBar),
    endBar: Math.max(clip.startBar + 1, clip.startBar + clip.barLength)
  };
  return next;
}

export function clearLoop(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  next.timeline.loop.enabled = false;
  return next;
}

export function addMarkerAtBar(project: PocketDawProject, bar: number, name?: string, markerType: TimelineMarker["markerType"] = "cue"): PocketDawProject {
  const next = cloneProject(project);
  const id = nextMarkerId(next.timeline.markers);
  next.timeline.markers.push({
    id,
    bar: Math.max(1, Math.round(bar)),
    name: name || `Marker ${next.timeline.markers.length + 1}`,
    markerType,
    color: markerType === "game-state" ? "#7cff9b" : markerType === "export" ? "#ffc857" : "#40d8ff"
  });
  next.timeline.markers = next.timeline.markers.slice().sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id));
  return next;
}

export function renameMarker(project: PocketDawProject, markerId: string, name: string): PocketDawProject {
  const next = cloneProject(project);
  const marker = next.timeline.markers.find((item) => item.id === markerId);
  if (!marker) return project;
  marker.name = name.trim() || marker.name;
  return next;
}

export function deleteMarker(project: PocketDawProject, markerId: string): PocketDawProject {
  const next = cloneProject(project);
  next.timeline.markers = next.timeline.markers.filter((marker) => marker.id !== markerId);
  return next;
}

function nextMarkerId(markers: TimelineMarker[]): string {
  let i = markers.length + 1;
  const ids = new Set(markers.map((marker) => marker.id));
  while (ids.has(`marker_${String(i).padStart(3, "0")}`)) i += 1;
  return `marker_${String(i).padStart(3, "0")}`;
}
