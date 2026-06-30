import { GAME_STATE_MARKERS, type Clip, type GameStateMarkerId, type PocketDawProject, type TimelineMarker, type TimelinePosition, type TimelineSelection } from "./schema";
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

export function setTimelineSelectionRange(project: PocketDawProject, startBar: number, endBar: number, source: TimelineSelection["source"] = "manual"): PocketDawProject {
  const rawStart = Number(startBar);
  const rawEnd = Number(endBar);
  const fallbackStart = Number.isFinite(rawStart) ? rawStart : 1;
  const fallbackEnd = Number.isFinite(rawEnd) ? rawEnd : fallbackStart + 1;
  const start = Math.max(1, Math.min(fallbackStart, fallbackEnd));
  const end = Math.max(start + 0.125, Math.max(fallbackStart, fallbackEnd));
  const next = cloneProject(project);
  next.timeline.selection = {
    startBar: cleanRangeBar(start, 1),
    endBar: cleanRangeBar(end, Math.max(2, cleanRangeBar(start, 1) + 1)),
    source
  };
  if (next.timeline.selection.endBar <= next.timeline.selection.startBar) {
    next.timeline.selection.endBar = next.timeline.selection.startBar + 1;
  }
  return next;
}

export function setTimelineSelectionToClip(project: PocketDawProject, clipId: string): PocketDawProject {
  const clip = project.timeline.clips.find((item) => item.id === clipId);
  if (!clip) return project;
  return setTimelineSelectionRange(project, clip.startBar, clip.startBar + clip.barLength, "clip");
}

export function setTimelineSelectionToLoop(project: PocketDawProject): PocketDawProject {
  const loop = project.timeline.loop;
  return setTimelineSelectionRange(project, loop.startBar, loop.endBar, "loop");
}

export function clearTimelineSelection(project: PocketDawProject): PocketDawProject {
  const next = cloneProject(project);
  next.timeline.selection = null;
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

export function isGameStateMarkerId(value: string | undefined): value is GameStateMarkerId {
  return !!value && GAME_STATE_MARKERS.includes(value as GameStateMarkerId);
}

export function addGameStateMarkerAtBar(project: PocketDawProject, bar: number, gameState: GameStateMarkerId): PocketDawProject {
  const next = cloneProject(project);
  const id = nextMarkerId(next.timeline.markers);
  const label = gameStateMarkerLabel(gameState);
  next.timeline.markers.push({
    id,
    bar: Math.max(1, Math.round(bar)),
    name: label,
    markerType: "game-state",
    gameState,
    color: gameStateMarkerColor(gameState)
  });
  next.timeline.markers = next.timeline.markers.slice().sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id));
  return next;
}

export function gameStateMarkerLabel(gameState: GameStateMarkerId): string {
  return gameState.slice(0, 1).toUpperCase() + gameState.slice(1);
}

export function gameStateMarkerColor(gameState: GameStateMarkerId): string {
  switch (gameState) {
    case "combat":
      return "#ff5f57";
    case "danger":
      return "#ffc857";
    case "win":
      return "#7cff9b";
    case "lose":
      return "#b98cff";
    case "menu":
      return "#40d8ff";
    case "calm":
    default:
      return "#8fd3ff";
  }
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

function cleanRangeBar(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value * 100) / 100);
}
