import type { Clip, MediaPoolItem, PocketDawProject } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import { trackIsAudible } from "../daw/tracks";

export interface AudioRegion {
  clipId: string;
  trackId: string;
  mediaPoolItemId: string;
  startTimeSeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
  gain: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface RenderedAudioTimeline {
  audioRegions: AudioRegion[];
  warnings: string[];
}

export interface RenderTimelineAudioRegionsOptions {
  includeMutedTracks?: boolean;
}

export function renderTimelineAudioRegions(project: PocketDawProject, options: RenderTimelineAudioRegionsOptions = {}): RenderedAudioTimeline {
  const warnings: string[] = [];
  const regions = project.timeline.clips
    .filter((clip) => clip.type === "audio" && !clip.muted)
    .flatMap((clip) => {
      const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) : null;
      if (!clip.mediaPoolItemId || !media) {
        warnings.push(`Audio clip ${clip.name} has no linked media item.`);
        return [];
      }
      const track = project.tracks.find((item) => item.id === clip.trackId);
      if (!track || track.active === false) return [];
      if (!options.includeMutedTracks && !trackIsAudible(track, project.tracks)) return [];
      const region = audioRegionFromClip(project, clip, media);
      if (region.durationSeconds <= 0) return [];
      return [region];
    })
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.clipId.localeCompare(b.clipId));
  return { audioRegions: regions, warnings };
}

export function audioRegionFromClip(project: PocketDawProject, clip: Clip, media: MediaPoolItem): AudioRegion {
  const sourceOffsetSeconds = cleanNumber(clip.metadata?.sourceOffsetSeconds, 0);
  const explicitDuration = cleanNumber(clip.metadata?.durationSeconds, media.durationSeconds || 0);
  const clipDuration = barsToSeconds(clip.barLength, project.project.bpm, project.project.timeSig);
  return {
    clipId: clip.id,
    trackId: clip.trackId,
    mediaPoolItemId: clip.mediaPoolItemId || media.id,
    startTimeSeconds: barsToSeconds(clip.startBar - 1, project.project.bpm, project.project.timeSig),
    sourceOffsetSeconds,
    durationSeconds: Math.max(0, Math.min(explicitDuration || clipDuration, clipDuration)),
    gain: cleanNumber(clip.metadata?.gain, clip.transforms.gain ?? 1),
    fadeInSeconds: cleanNumber(clip.metadata?.fadeInSeconds, 0),
    fadeOutSeconds: cleanNumber(clip.metadata?.fadeOutSeconds, 0)
  };
}

function cleanNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
