import { addMediaPoolItem, createMediaPoolItem, findMediaPoolItem, type MediaPoolReloadCandidate } from "./mediaPool";
import type { Clip, JsonObject, MediaPoolItem, PocketDawProject, Track } from "./schema";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";
import { recomputeTimelineBars, timelineBarAtSeconds, timelineSecondsAtBar } from "./timeline";
import { recordingLatencyOffsetSeconds } from "./tracks";

export interface ImportedAudioMedia {
  name: string;
  uri?: string;
  mimeType?: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  sizeBytes?: number;
  metadata?: JsonObject;
}

export interface AddAudioMediaResult {
  project: PocketDawProject;
  item: MediaPoolItem;
}

export interface PlaceAudioClipResult {
  project: PocketDawProject;
  clipId: string;
  trackId: string;
}

export interface PlaceAudioClipOptions {
  overwriteOverlaps?: boolean;
  clipBarLength?: number;
  sourceOffsetSeconds?: number;
  sourceDurationSeconds?: number;
  extraMetadata?: JsonObject;
}

export interface PlacePunchRecordingOptions {
  captureStartBar: number;
  punchStartBar: number;
  punchEndBar: number;
}

export interface AudioTransientAnalysis {
  markersSeconds: number[];
  threshold: number;
  peakCount: number;
  maxPeak: number;
}

export interface AudioMediaReloadAnalysis extends Partial<ImportedAudioMedia> {
  waveformPeaks?: number[];
}

export function addImportedAudioMedia(project: PocketDawProject, input: ImportedAudioMedia): AddAudioMediaResult {
  const item = createMediaPoolItem({
    kind: "audio",
    name: input.name,
    uri: input.uri,
    mimeType: input.mimeType,
    durationSeconds: input.durationSeconds,
    sampleRate: input.sampleRate,
    channels: input.channels,
    sizeBytes: input.sizeBytes,
    metadata: {
      external: !!input.uri,
      mediaRefKind: input.uri ? "external" : "browser-runtime-only",
      ...(input.uri ? { originalUri: input.uri } : {}),
      unresolved: false,
      missing: false,
      waveformPeaks: [],
      ...(input.metadata || {})
    }
  }, project.mediaPool);
  return { project: addMediaPoolItem(project, item), item };
}

export function detectAudioTransientsFromPeaks(peaks: unknown, durationSeconds: number, threshold = 0.45): AudioTransientAnalysis {
  const cleanPeaks = Array.isArray(peaks)
    ? peaks
      .map((peak) => Math.abs(Number(peak)))
      .filter((peak) => Number.isFinite(peak) && peak >= 0)
      .map((peak) => Math.min(1, peak))
    : [];
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const cleanThreshold = Math.max(0.05, Math.min(1, Number.isFinite(threshold) ? threshold : 0.45));
  const maxPeak = cleanPeaks.reduce((max, peak) => Math.max(max, peak), 0);
  if (!cleanPeaks.length || duration <= 0 || maxPeak <= 0) {
    return { markersSeconds: [], threshold: cleanThreshold, peakCount: cleanPeaks.length, maxPeak };
  }
  const adaptiveThreshold = Math.max(cleanThreshold, maxPeak * 0.55);
  const markersSeconds: number[] = [];
  cleanPeaks.forEach((peak, index) => {
    const previous = cleanPeaks[index - 1] ?? 0;
    const next = cleanPeaks[index + 1] ?? 0;
    const localMaximum = peak >= previous && peak > next;
    const sharpRise = peak - previous >= 0.18 && peak >= next * 0.75;
    if (peak >= adaptiveThreshold && (localMaximum || sharpRise)) {
      markersSeconds.push(roundSeconds(((index + 0.5) / cleanPeaks.length) * duration));
    }
  });
  return {
    markersSeconds: dedupeNearbyMarkers(markersSeconds, 0.05),
    threshold: roundNumber(adaptiveThreshold),
    peakCount: cleanPeaks.length,
    maxPeak: roundNumber(maxPeak)
  };
}

export function updateAudioMediaAnalysis(project: PocketDawProject, id: string, analysis: Partial<ImportedAudioMedia> & { waveformPeaks?: number[] }): PocketDawProject {
  const next = cloneProject(project);
  const item = next.mediaPool.find((entry) => entry.id === id);
  if (!item) return project;
  if (analysis.durationSeconds !== undefined) item.durationSeconds = analysis.durationSeconds;
  if (analysis.sampleRate !== undefined) item.sampleRate = analysis.sampleRate;
  if (analysis.channels !== undefined) item.channels = analysis.channels;
  if (analysis.sizeBytes !== undefined) item.sizeBytes = analysis.sizeBytes;
  if (analysis.mimeType !== undefined) item.mimeType = analysis.mimeType;
  item.metadata = {
    ...metadataWithoutStaleAudioAnalysis(item.metadata),
    ...(analysis.metadata || {}),
    waveformPeaks: analysis.waveformPeaks || [],
    missing: false,
    unresolved: false,
    analysisInvalidated: false,
    waveformNeedsRefresh: false
  };
  return next;
}

export function updateAudioMediaReloadAnalysis(
  project: PocketDawProject,
  id: string,
  analysis: AudioMediaReloadAnalysis,
  loadedFrom: Pick<MediaPoolReloadCandidate, "kind" | "path">
): PocketDawProject {
  return updateAudioMediaAnalysis(project, id, {
    ...analysis,
    metadata: {
      ...(analysis.metadata || {}),
      lastReloadSourceKind: loadedFrom.kind,
      lastReloadSourcePath: loadedFrom.path,
      restoredFromNativeDecodedCache: loadedFrom.kind === "decoded-cache"
    }
  });
}

function metadataWithoutStaleAudioAnalysis(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const next = { ...(metadata || {}) };
  [
    "audioTransientMarkersSeconds",
    "audioTransientThreshold",
    "audioTransientPeakCount",
    "audioTransientMaxPeak",
    "audioTransientUpdatedAt"
  ].forEach((key) => {
    delete next[key];
  });
  return next;
}

export function placeAudioClipOnTimeline(project: PocketDawProject, mediaPoolItemId: string, startBar: number): PlaceAudioClipResult {
  const item = findMediaPoolItem(project, mediaPoolItemId);
  if (!item || item.kind !== "audio") return { project, clipId: "", trackId: "" };
  const next = cloneProject(project);
  const track = ensureAudioTrack(next, item);
  return placeAudioClipOnTrack(next, item.id, track.id, startBar);
}

export function placeAudioClipOnTrack(project: PocketDawProject, mediaPoolItemId: string, trackId: string, startBar: number, options: PlaceAudioClipOptions = {}): PlaceAudioClipResult {
  const item = findMediaPoolItem(project, mediaPoolItemId);
  if (!item || item.kind !== "audio") return { project, clipId: "", trackId: "" };
  const next = cloneProject(project);
  const track = next.tracks.find((candidate) => candidate.id === trackId && candidate.trackType === "audio");
  if (!track) return { project, clipId: "", trackId: "" };
  const clipStartBar = cleanStartBar(startBar);
  const barLength = Number.isFinite(options.clipBarLength || NaN) && (options.clipBarLength || 0) > 0
    ? Math.max(0.001, Math.round((options.clipBarLength || 0) * 1_000_000) / 1_000_000)
    : Math.max(1, secondsToBarsFromStart(item.durationSeconds || secondsBetweenBars(next, clipStartBar, clipStartBar + 1), next, clipStartBar));
  if (options.overwriteOverlaps) {
    overwriteAudioClipsInRange(next, track.id, clipStartBar, clipStartBar + barLength);
  }
  const metadata = createPlacedAudioClipMetadata(item, next, track.id);
  if (Number.isFinite(options.sourceOffsetSeconds || NaN)) metadata.sourceOffsetSeconds = Math.max(0, Math.round((options.sourceOffsetSeconds || 0) * 1000) / 1000);
  if (Number.isFinite(options.sourceDurationSeconds || NaN)) metadata.sourceDurationSeconds = Math.max(0, Math.round((options.sourceDurationSeconds || 0) * 1000) / 1000);
  if (options.extraMetadata) Object.assign(metadata, options.extraMetadata);
  const clipId = nextClipId(next);
  next.timeline.clips.push({
    id: clipId,
    type: "audio",
    trackId: track.id,
    mediaPoolItemId: item.id,
    startBar: clipStartBar,
    barLength,
    name: item.name,
    muted: false,
    color: track.colour,
    linked: true,
    transforms: {
      transpose: 0,
      octave: 0,
      gain: 1,
      stemMutes: {}
    },
    metadata
  });
  recomputeTimelineBars(next);
  return { project: next, clipId, trackId: track.id };
}

export function placeRecordingClipOnTrack(project: PocketDawProject, mediaPoolItemId: string, trackId: string, startBar: number): PlaceAudioClipResult {
  const placement = recordingLatencyPlacement(project, trackId, startBar);
  return placeAudioClipOnTrack(project, mediaPoolItemId, trackId, placement.startBar, {
    overwriteOverlaps: true,
    extraMetadata: placement.metadata
  });
}

export function placePunchRecordingClipOnTrack(project: PocketDawProject, mediaPoolItemId: string, trackId: string, options: PlacePunchRecordingOptions): PlaceAudioClipResult {
  const captureStartBar = cleanStartBar(options.captureStartBar);
  const punchStartBar = cleanStartBar(options.punchStartBar);
  const punchEndBar = Math.max(punchStartBar, cleanStartBar(options.punchEndBar));
  if (punchEndBar <= punchStartBar + 0.001) return { project, clipId: "", trackId: "" };
  const placement = recordingLatencyPlacement(project, trackId, punchStartBar);
  const sourceOffsetSeconds = secondsBetweenBars(project, captureStartBar, punchStartBar);
  const sourceDurationSeconds = secondsBetweenBars(project, punchStartBar, punchEndBar);
  return placeAudioClipOnTrack(project, mediaPoolItemId, trackId, placement.startBar, {
    overwriteOverlaps: true,
    clipBarLength: punchEndBar - punchStartBar,
    sourceOffsetSeconds,
    sourceDurationSeconds,
    extraMetadata: {
      punchStartBar,
      punchEndBar,
      captureStartBar,
      punchMode: "replace-visible-range",
      ...placement.metadata
    }
  });
}

function recordingLatencyPlacement(project: PocketDawProject, trackId: string, startBar: number): { startBar: number; metadata: JsonObject } {
  const cleanBar = cleanStartBar(startBar);
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  const requestedSeconds = recordingLatencyOffsetSeconds(track);
  if (requestedSeconds === 0) {
    return {
      startBar: cleanBar,
      metadata: {
        latencyCompensationRequestedSeconds: 0,
        latencyCompensationAppliedSeconds: 0,
        latencyCompensationMode: "manual-track-offset"
      }
    };
  }
  const requestedStartSeconds = timelineSecondsAtBar(project, cleanBar);
  const adjustedStartSeconds = Math.max(0, requestedStartSeconds - requestedSeconds);
  const appliedSeconds = roundSeconds(requestedStartSeconds - adjustedStartSeconds);
  return {
    startBar: timelineBarAtSeconds(project, adjustedStartSeconds),
    metadata: {
      latencyCompensationRequestedSeconds: requestedSeconds,
      latencyCompensationAppliedSeconds: appliedSeconds,
      latencyCompensationMode: "manual-track-offset",
      originalRequestedStartBar: cleanBar,
      latencyAdjustedStartSeconds: roundSeconds(adjustedStartSeconds)
    }
  };
}

function createPlacedAudioClipMetadata(item: MediaPoolItem, project: PocketDawProject, trackId: string): JsonObject {
  const metadata: JsonObject = {
    durationSeconds: item.durationSeconds || 0,
    sourceOffsetSeconds: 0,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0
  };
  const source = item.metadata || {};
  [
    "takeGroupId",
    "takeIndex",
    "recordingTakeId",
    "recordingTakeGroupId",
    "takeLaneId",
    "takeLaneIndex",
    "takeStatus",
    "inputMode",
    "channelMap",
    "latencyCompensationRequestedSeconds",
    "latencyCompensationAppliedSeconds",
    "latencyCompensationMode",
    "nativeRecordingSessionId",
    "nativeRequestedStartBar",
    "nativeRequestedStartSeconds",
    "nativeRequestedSampleRate",
    "nativeCaptureSampleRate"
  ].forEach((key) => {
    const value = source[key];
    if (value !== undefined) metadata[key] = value;
  });
  if (typeof metadata.takeGroupId === "string" && typeof metadata.takeIndex !== "number") {
    const siblingCount = project.timeline.clips.filter((clip) => (
      clip.type === "audio" &&
      clip.trackId === trackId &&
      clip.metadata?.takeGroupId === metadata.takeGroupId
    )).length;
    metadata.takeIndex = siblingCount + 1;
  }
  const groupId = typeof metadata.recordingTakeGroupId === "string" && metadata.recordingTakeGroupId.trim()
    ? metadata.recordingTakeGroupId
    : typeof metadata.takeGroupId === "string" && metadata.takeGroupId.trim()
      ? metadata.takeGroupId
      : "";
  if (groupId) {
    metadata.takeGroupId = groupId;
    metadata.recordingTakeGroupId = groupId;
    const takeIndex = typeof metadata.takeLaneIndex === "number" && Number.isFinite(metadata.takeLaneIndex)
      ? Math.max(1, Math.round(metadata.takeLaneIndex))
      : typeof metadata.takeIndex === "number" && Number.isFinite(metadata.takeIndex)
        ? Math.max(1, Math.round(metadata.takeIndex))
        : 1;
    metadata.takeIndex = takeIndex;
    metadata.takeLaneIndex = takeIndex;
    if (typeof metadata.recordingTakeId !== "string" || !metadata.recordingTakeId.trim()) {
      metadata.recordingTakeId = `${groupId}-take-${takeIndex}`;
    }
    if (typeof metadata.takeLaneId !== "string" || !metadata.takeLaneId.trim()) {
      metadata.takeLaneId = `${groupId}-lane-${takeIndex}`;
    }
  }
  if (typeof metadata.takeGroupId === "string" && typeof metadata.takeActive !== "boolean") {
    metadata.takeActive = true;
  }
  if (typeof metadata.takeGroupId === "string" && typeof metadata.takeStatus !== "string") {
    metadata.takeStatus = metadata.takeActive === false ? "muted-take" : "active";
  }
  return metadata;
}

function overwriteAudioClipsInRange(project: PocketDawProject, trackId: string, startBar: number, endBar: number) {
  const overwriteStart = Math.max(1, startBar);
  const overwriteEnd = Math.max(overwriteStart, endBar);
  const nextClips: Clip[] = [];
  const usedClipIds = new Set(project.timeline.clips.map((clip) => clip.id));
  project.timeline.clips.forEach((clip) => {
    if (clip.trackId !== trackId || clip.type !== "audio") {
      nextClips.push(clip);
      return;
    }
    const clipStart = clip.startBar;
    const clipEnd = clip.startBar + clip.barLength;
    if (clipEnd <= overwriteStart || clipStart >= overwriteEnd) {
      nextClips.push(clip);
      return;
    }
    const leftLength = Math.max(0, overwriteStart - clipStart);
    const rightLength = Math.max(0, clipEnd - overwriteEnd);
    if (leftLength > 0.001) {
      nextClips.push({
        ...clip,
        barLength: leftLength
      });
    }
    if (rightLength > 0.001) {
      const rightStart = overwriteEnd;
      nextClips.push({
        ...JSON.parse(JSON.stringify(clip)),
        id: leftLength > 0.001 ? nextUniqueClipId(usedClipIds) : clip.id,
        startBar: rightStart,
        barLength: rightLength,
        metadata: {
          ...(clip.metadata || {}),
          sourceOffsetSeconds: audioClipSourceOffsetSeconds(clip) + secondsBetweenBars(project, clipStart, rightStart)
        }
      });
    }
  });
  project.timeline.clips = nextClips;
}

function ensureAudioTrack(project: PocketDawProject, item: MediaPoolItem): Track {
  const existing = project.tracks.find((track) => {
    if (track.trackType !== "audio" || track.role !== "media" || track.recordKind !== "none") return false;
    return !project.timeline.clips.some((clip) => clip.trackId === track.id && clip.type === "audio");
  });
  if (existing) return existing;
  const id = uniqueTrackId(project, "audio");
  const audioTrackCount = project.tracks.filter((track) => track.trackType === "audio" && track.role === "media").length;
  const track: Track = {
    id,
    name: audioTrackCount > 0 ? audioTrackName(item.name, audioTrackCount + 1) : "Audio",
    trackType: "audio",
    role: "media",
    volume: 0.82,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    colour: "#7dd3ff",
    routing: { inputIds: [], outputId: "master", sendIds: ["fx-return"] },
    automationLaneIds: [],
    fxChainId: `fx_${id}`,
    recordKind: "none",
    inputDeviceId: null,
    monitorEnabled: false,
    active: true
  };
  const masterIndex = project.tracks.findIndex((item) => item.role === "master");
  if (masterIndex === -1) project.tracks.push(track);
  else project.tracks.splice(masterIndex, 0, track);
  project.fx.chains.push(createEmptyFxChain(track.id, `${track.name} FX`));
  return track;
}

function audioTrackName(name: string, fallbackIndex: number): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? `Audio ${fallbackIndex} - ${base.slice(0, 28)}` : `Audio ${fallbackIndex}`;
}

function secondsToBarsFromStart(seconds: number, project: PocketDawProject, startBar: number): number {
  const startSeconds = timelineSecondsAtBar(project, startBar);
  const endBar = timelineBarAtSeconds(project, startSeconds + Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  const bars = endBar - startBar;
  return Math.max(0.001, Math.round(bars * 1_000_000) / 1_000_000);
}

function secondsBetweenBars(project: PocketDawProject, startBar: number, endBar: number): number {
  return Math.max(0, timelineSecondsAtBar(project, endBar) - timelineSecondsAtBar(project, startBar));
}

function cleanStartBar(value: number): number {
  const start = Number.isFinite(value) ? value : 1;
  return Math.max(1, Math.round(start * 1000) / 1000);
}

function dedupeNearbyMarkers(markers: number[], minSpacingSeconds: number): number[] {
  const out: number[] = [];
  markers.forEach((marker) => {
    if (!out.length || marker - out[out.length - 1] >= minSpacingSeconds) out.push(marker);
  });
  return out;
}

function roundSeconds(value: number): number {
  return Math.max(0, Math.round(value * 1000) / 1000);
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function audioClipSourceOffsetSeconds(clip: Clip): number {
  const value = clip.metadata?.sourceOffsetSeconds;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nextClipId(project: PocketDawProject): string {
  let i = project.timeline.clips.length + 1;
  const ids = new Set(project.timeline.clips.map((clip) => clip.id));
  while (ids.has(`clip_${String(i).padStart(3, "0")}`)) i += 1;
  return `clip_${String(i).padStart(3, "0")}`;
}

function nextUniqueClipId(ids: Set<string>): string {
  let i = ids.size + 1;
  while (ids.has(`clip_${String(i).padStart(3, "0")}`)) i += 1;
  const id = `clip_${String(i).padStart(3, "0")}`;
  ids.add(id);
  return id;
}

function uniqueTrackId(project: PocketDawProject, base: string) {
  let id = base;
  let n = 2;
  while (project.tracks.some((track) => track.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
