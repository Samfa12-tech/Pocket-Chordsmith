import { GAME_STATE_MARKERS, type Clip, type GameStateMarkerId, type PocketDawProject, type ProjectMeterMapPoint, type TimelineMarker, type TimelinePosition, type TimelineSelection } from "./schema";
import { cloneProject } from "./dawProject";
import { getProjectAutomationLane } from "./automation";

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

export interface TimelineMeter {
  numerator: number;
  denominator: number;
  source?: ProjectMeterMapPoint["source"];
  sourceBar?: number;
}

export interface TimelineDisplayPosition extends TimelinePosition {
  meter: TimelineMeter;
}

export function effectiveMeterAtBar(project: PocketDawProject, bar: number): TimelineMeter {
  const fallback: TimelineMeter = {
    numerator: Math.max(1, Math.round(Number(project.project.timeSig) || 4)),
    denominator: 4
  };
  const target = Math.max(1, Number.isFinite(bar) ? bar : 1);
  const points = (project.project.meterMap || [])
    .filter((point) => Number.isFinite(point.bar) && Number.isFinite(point.numerator) && Number.isFinite(point.denominator))
    .slice()
    .sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id));
  const active = points.filter((point) => point.bar <= target + 0.000001).at(-1);
  if (!active) return fallback;
  return {
    numerator: Math.max(1, Math.round(active.numerator)),
    denominator: Math.max(1, Math.round(active.denominator)),
    source: active.source,
    sourceBar: active.bar
  };
}

export function barFloatToDisplayPosition(project: PocketDawProject, value: number): TimelineDisplayPosition {
  const safe = Math.max(1, Number.isFinite(value) ? value : 1);
  let bar = Math.max(1, Math.floor(safe));
  const meter = effectiveMeterAtBar(project, bar);
  const ppq = Math.max(1, Math.round(Number(project.project.ppq) || 480));
  const barFraction = Math.max(0, safe - bar);
  const beatFloat = barFraction * meter.numerator;
  let beat = Math.floor(beatFloat) + 1;
  let tick = Math.round((beatFloat - Math.floor(beatFloat)) * ppq);
  if (tick >= ppq) {
    tick = 0;
    beat += 1;
  }
  if (beat > meter.numerator) {
    bar += 1;
    beat = 1;
    tick = 0;
  }
  return { bar, beat, tick, meter: effectiveMeterAtBar(project, bar) };
}

export function barsToSeconds(bars: number, bpm: number, timeSig: number): number {
  return bars * timeSig * (60 / bpm);
}

export function samplesToSeconds(samples: number, sampleRate: number): number {
  const safeSampleRate = Math.max(1, Math.round(Number(sampleRate) || 0));
  return Math.max(0, Number(samples) || 0) / safeSampleRate;
}

export function secondsToSamples(seconds: number, sampleRate: number): number {
  const safeSampleRate = Math.max(1, Math.round(Number(sampleRate) || 0));
  return Math.max(0, Math.round((Number(seconds) || 0) * safeSampleRate));
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return constantTempoBeatsToSeconds(beats, bpm);
}

export function secondsToBeats(seconds: number, bpm: number): number {
  const safeBpm = Math.max(1, Number(bpm) || 0);
  return Math.max(0, Number(seconds) || 0) / (60 / safeBpm);
}

export function beatsToSamples(beats: number, sampleRate: number, bpm: number): number {
  return secondsToSamples(beatsToSeconds(beats, bpm), sampleRate);
}

export function samplesToBeats(samples: number, sampleRate: number, bpm: number): number {
  return secondsToBeats(samplesToSeconds(samples, sampleRate), bpm);
}

export function timelineQuarterNoteBeatsBetweenBars(project: PocketDawProject, startBar: number, endBar: number): number {
  const start = Math.max(1, Number.isFinite(startBar) ? startBar : 1);
  const end = Math.max(start, Number.isFinite(endBar) ? endBar : start);
  if (end <= start) return 0;
  return timelineSegmentsBetweenBars(project, start, end).reduce((sum, segment) => {
    return sum + (segment.endBar - segment.startBar) * quarterNoteBeatsPerBar(segment.meter);
  }, 0);
}

export function timelineSecondsAtBar(project: PocketDawProject, bar: number): number {
  const target = Math.max(1, Number.isFinite(bar) ? bar : 1);
  if (target <= 1) return 0;
  const lane = getProjectAutomationLane(project, "tempo");
  if (!lane || !lane.enabled || lane.points.length === 0) return constantTempoBeatsToSeconds(timelineQuarterNoteBeatsBetweenBars(project, 1, target), project.project.bpm);
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar);
  let cursor = 1;
  let seconds = 0;
  while (cursor < target - 0.000001) {
    const first = points[0];
    const last = points[points.length - 1];
    if (cursor < first.bar) {
      const next = Math.min(target, first.bar);
      seconds += constantTempoBeatsToSeconds(timelineQuarterNoteBeatsBetweenBars(project, cursor, next), first.value);
      cursor = next;
      continue;
    }
    if (cursor >= last.bar || points.length === 1) {
      seconds += constantTempoBeatsToSeconds(timelineQuarterNoteBeatsBetweenBars(project, cursor, target), last.value);
      break;
    }
    const index = Math.max(0, points.findIndex((point, i) => cursor >= point.bar && cursor < (points[i + 1]?.bar ?? Number.POSITIVE_INFINITY)));
    const start = points[index];
    const end = points[index + 1] || last;
    const next = Math.min(target, end.bar);
    seconds += tempoSegmentSeconds(project, cursor, next, start.bar, end.bar, start.value, end.value, start.curve);
    cursor = next;
  }
  return seconds;
}

export function timelineDurationSeconds(project: PocketDawProject): number {
  return Math.max(1, timelineSecondsAtBar(project, project.timeline.bars + 1));
}

export function timelineBarAtSeconds(project: PocketDawProject, seconds: number): number {
  const target = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const lane = getProjectAutomationLane(project, "tempo");
  if ((!lane || !lane.enabled || lane.points.length === 0) && !(project.project.meterMap || []).length) return secondsToBars(target, project.project.bpm, project.project.timeSig) + 1;
  const lastPointBar = lane?.points.reduce((max, point) => Math.max(max, point.bar), 1) || 1;
  let high = Math.max(2, project.timeline.bars + 1, lastPointBar + 1);
  while (timelineSecondsAtBar(project, high) < target && high < 100000) high *= 2;
  let low = 1;
  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    if (timelineSecondsAtBar(project, mid) < target) low = mid;
    else high = mid;
  }
  return high;
}

export function timelineSecondsAtPosition(project: PocketDawProject, position: TimelinePosition): number {
  const safeBar = Math.max(1, Number.isFinite(position.bar) ? position.bar : 1);
  const meter = effectiveMeterAtBar(project, safeBar);
  const ppq = Math.max(1, Math.round(Number(project.project.ppq) || 480));
  const beat = Math.max(1, Math.round(Number(position.beat) || 1));
  const tick = Math.max(0, Math.round(Number(position.tick) || 0));
  const beatsPerBar = Math.max(0.000001, quarterNoteBeatsPerBar(meter));
  const localQuarterNoteBeats = (Math.max(0, beat - 1) * (4 / Math.max(1, meter.denominator))) + (tick / ppq) * (4 / Math.max(1, meter.denominator));
  return timelineSecondsAtBar(project, safeBar) + beatsToSecondsAtBar(project, safeBar, localQuarterNoteBeats, beatsPerBar);
}

export function timelinePositionAtSeconds(project: PocketDawProject, seconds: number): TimelineDisplayPosition {
  return barFloatToDisplayPosition(project, timelineBarAtSeconds(project, seconds));
}

export function barBeatTickToSamples(project: PocketDawProject, position: TimelinePosition, sampleRate = project.project.sampleRate): number {
  return secondsToSamples(timelineSecondsAtPosition(project, position), sampleRate);
}

export function samplesToBarBeatTick(project: PocketDawProject, samples: number, sampleRate = project.project.sampleRate): TimelineDisplayPosition {
  return timelinePositionAtSeconds(project, samplesToSeconds(samples, sampleRate));
}

export function wrapTimelineLoopSeconds(project: PocketDawProject, seconds: number): number {
  if (!project.timeline.loop.enabled) return Math.max(0, Number(seconds) || 0);
  const loopStart = timelineSecondsAtBar(project, project.timeline.loop.startBar);
  const loopEnd = timelineSecondsAtBar(project, project.timeline.loop.endBar);
  if (loopEnd <= loopStart) return Math.max(0, Number(seconds) || 0);
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  if (safeSeconds < loopEnd) return safeSeconds;
  const length = loopEnd - loopStart;
  const wrappedOffset = ((safeSeconds - loopEnd) % length + length) % length;
  return loopStart + wrappedOffset;
}

function constantTempoBarsToSeconds(bars: number, bpm: number, timeSig: number): number {
  return Math.max(0, bars) * timeSig * (60 / Math.max(1, bpm));
}

function constantTempoBeatsToSeconds(beats: number, bpm: number): number {
  return Math.max(0, beats) * (60 / Math.max(1, bpm));
}

function tempoSegmentSeconds(
  project: PocketDawProject,
  cursor: number,
  next: number,
  startBar: number,
  endBar: number,
  startBpm: number,
  endBpm: number,
  curve: string | undefined
): number {
  return timelineSegmentsBetweenBars(project, cursor, next).reduce((seconds, segment) => {
    return seconds + tempoSegmentSecondsForMeter(
      segment.startBar,
      segment.endBar,
      startBar,
      endBar,
      startBpm,
      endBpm,
      curve,
      quarterNoteBeatsPerBar(segment.meter)
    );
  }, 0);
}

function tempoSegmentSecondsForMeter(
  cursor: number,
  next: number,
  startBar: number,
  endBar: number,
  startBpm: number,
  endBpm: number,
  curve: string | undefined,
  quarterNoteBeatsPerBarValue: number
): number {
  const span = Math.max(0.000001, endBar - startBar);
  const t0 = Math.max(0, Math.min(1, (cursor - startBar) / span));
  const t1 = Math.max(t0, Math.min(1, (next - startBar) / span));
  if (curve === "hold" || Math.abs(startBpm - endBpm) < 0.000001) return constantTempoBeatsToSeconds((next - cursor) * quarterNoteBeatsPerBarValue, startBpm);
  if (curve === "linear" || !curve) {
    const delta = endBpm - startBpm;
    const a = Math.max(1, startBpm + delta * t0);
    const b = Math.max(1, startBpm + delta * t1);
    if (Math.abs(delta) < 0.000001) return constantTempoBeatsToSeconds((next - cursor) * quarterNoteBeatsPerBarValue, startBpm);
    return quarterNoteBeatsPerBarValue * 60 * span * Math.log(b / a) / delta;
  }
  return quarterNoteBeatsPerBarValue * 60 * span * integrateReciprocalTempo(t0, t1, (t) => shapedTempo(startBpm, endBpm, t, curve));
}

function shapedTempo(startBpm: number, endBpm: number, t: number, curve: string | undefined): number {
  const x = Math.max(0, Math.min(1, t));
  const shaped = curve === "ease-in" ? x * x : curve === "ease-out" ? 1 - (1 - x) * (1 - x) : x;
  return Math.max(1, startBpm + (endBpm - startBpm) * shaped);
}

function integrateReciprocalTempo(t0: number, t1: number, bpmAt: (t: number) => number): number {
  if (t1 <= t0) return 0;
  const slices = Math.max(4, Math.ceil((t1 - t0) * 32));
  const evenSlices = slices % 2 === 0 ? slices : slices + 1;
  const h = (t1 - t0) / evenSlices;
  let sum = 1 / bpmAt(t0) + 1 / bpmAt(t1);
  for (let i = 1; i < evenSlices; i += 1) sum += (i % 2 === 0 ? 2 : 4) * (1 / bpmAt(t0 + h * i));
  return (h / 3) * sum;
}

export function secondsToBars(seconds: number, bpm: number, timeSig: number): number {
  return seconds / Math.max(0.0001, timeSig * (60 / bpm));
}

function beatsToSecondsAtBar(project: PocketDawProject, startBar: number, localQuarterNoteBeats: number, beatsPerBar: number): number {
  if (localQuarterNoteBeats <= 0) return 0;
  const endBar = startBar + (localQuarterNoteBeats / Math.max(0.000001, beatsPerBar));
  return timelineSecondsAtBar(project, endBar) - timelineSecondsAtBar(project, startBar);
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

export function snapProjectBarValue(project: PocketDawProject, value: number, mode: SnapMode): number {
  const safe = Math.max(1, Number.isFinite(value) ? value : 1);
  if (mode === "off") return Math.round(safe * 100) / 100;
  if (mode === "beat") {
    const bar = Math.max(1, Math.floor(safe));
    const beatSize = snapBeatStepAtBar(project, bar);
    return cleanSnappedBar(Math.max(1, Math.round((safe - bar) / beatSize) * beatSize + bar));
  }
  return Math.max(1, Math.round(safe));
}

export function snapBeatStepAtBar(project: PocketDawProject, bar: number): number {
  return 1 / Math.max(1, Math.round(effectiveMeterAtBar(project, bar).numerator));
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

function cleanSnappedBar(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value * 1000000) / 1000000);
}

function timelineSegmentsBetweenBars(project: PocketDawProject, startBar: number, endBar: number): Array<{ startBar: number; endBar: number; meter: TimelineMeter }> {
  const start = Math.max(1, Number.isFinite(startBar) ? startBar : 1);
  const end = Math.max(start, Number.isFinite(endBar) ? endBar : start);
  if (end <= start) return [];
  const breakpoints = (project.project.meterMap || [])
    .map((point) => point.bar)
    .filter((bar) => Number.isFinite(bar) && bar > start + 0.000001 && bar < end - 0.000001)
    .sort((a, b) => a - b);
  const points = [start, ...breakpoints, end];
  const segments: Array<{ startBar: number; endBar: number; meter: TimelineMeter }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index]!;
    const segmentEnd = points[index + 1]!;
    segments.push({ startBar: segmentStart, endBar: segmentEnd, meter: effectiveMeterAtBar(project, segmentStart) });
  }
  return segments;
}

function quarterNoteBeatsPerBar(meter: TimelineMeter): number {
  return Math.max(0.000001, meter.numerator * (4 / Math.max(1, meter.denominator)));
}
