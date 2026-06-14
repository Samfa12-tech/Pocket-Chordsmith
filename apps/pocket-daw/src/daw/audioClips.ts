import { addMediaPoolItem, createMediaPoolItem, findMediaPoolItem, updateMediaPoolItem } from "./mediaPool";
import type { JsonObject, MediaPoolItem, PocketDawProject, Track } from "./schema";
import { cloneProject } from "./dawProject";
import { createEmptyFxChain } from "./fx";
import { recomputeTimelineBars } from "./timeline";

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

export function updateAudioMediaAnalysis(project: PocketDawProject, id: string, analysis: Partial<ImportedAudioMedia> & { waveformPeaks?: number[] }): PocketDawProject {
  return updateMediaPoolItem(project, id, {
    durationSeconds: analysis.durationSeconds,
    sampleRate: analysis.sampleRate,
    channels: analysis.channels,
    sizeBytes: analysis.sizeBytes,
    mimeType: analysis.mimeType,
    metadata: {
      waveformPeaks: analysis.waveformPeaks || [],
      missing: false,
      unresolved: false
    }
  });
}

export function placeAudioClipOnTimeline(project: PocketDawProject, mediaPoolItemId: string, startBar: number): PlaceAudioClipResult {
  const item = findMediaPoolItem(project, mediaPoolItemId);
  if (!item || item.kind !== "audio") return { project, clipId: "", trackId: "" };
  const next = cloneProject(project);
  const track = ensureAudioTrack(next, item);
  return placeAudioClipOnTrack(next, item.id, track.id, startBar);
}

export function placeAudioClipOnTrack(project: PocketDawProject, mediaPoolItemId: string, trackId: string, startBar: number): PlaceAudioClipResult {
  const item = findMediaPoolItem(project, mediaPoolItemId);
  if (!item || item.kind !== "audio") return { project, clipId: "", trackId: "" };
  const next = cloneProject(project);
  const track = next.tracks.find((candidate) => candidate.id === trackId && candidate.trackType === "audio");
  if (!track) return { project, clipId: "", trackId: "" };
  const barLength = Math.max(1, secondsToBars(item.durationSeconds || secondsPerBar(next), next));
  const clipId = nextClipId(next);
  next.timeline.clips.push({
    id: clipId,
    type: "audio",
    trackId: track.id,
    mediaPoolItemId: item.id,
    startBar: Math.max(1, Math.round(startBar)),
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
    metadata: {
      durationSeconds: item.durationSeconds || 0,
      sourceOffsetSeconds: 0,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0
    }
  });
  recomputeTimelineBars(next);
  return { project: next, clipId, trackId: track.id };
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

function secondsToBars(seconds: number, project: PocketDawProject): number {
  return Math.max(1, Math.ceil(seconds / secondsPerBar(project)));
}

function secondsPerBar(project: PocketDawProject): number {
  return project.project.timeSig * (60 / project.project.bpm);
}

function nextClipId(project: PocketDawProject): string {
  let i = project.timeline.clips.length + 1;
  const ids = new Set(project.timeline.clips.map((clip) => clip.id));
  while (ids.has(`clip_${String(i).padStart(3, "0")}`)) i += 1;
  return `clip_${String(i).padStart(3, "0")}`;
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
