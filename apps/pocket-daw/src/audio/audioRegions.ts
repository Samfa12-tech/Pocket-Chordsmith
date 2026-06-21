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

export interface AudioFadeEnvelope {
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface AudioClipPropertyDiagnostic {
  field: "sourceOffsetSeconds" | "durationSeconds" | "gain" | "fadeInSeconds" | "fadeOutSeconds";
  code: "invalid" | "negative" | "capped" | "scaled";
  message: string;
}

export interface AudioClipProperties extends AudioFadeEnvelope {
  sourceOffsetSeconds: number;
  durationSeconds: number;
  gain: number;
  diagnostics: AudioClipPropertyDiagnostic[];
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
  const properties = normalizeAudioClipProperties(project, clip, media);
  return {
    clipId: clip.id,
    trackId: clip.trackId,
    mediaPoolItemId: clip.mediaPoolItemId || media.id,
    startTimeSeconds: barsToSeconds(clip.startBar - 1, project.project.bpm, project.project.timeSig),
    sourceOffsetSeconds: properties.sourceOffsetSeconds,
    durationSeconds: properties.durationSeconds,
    gain: properties.gain,
    fadeInSeconds: properties.fadeInSeconds,
    fadeOutSeconds: properties.fadeOutSeconds
  };
}

export function normalizeAudioClipProperties(project: PocketDawProject, clip: Clip, media: MediaPoolItem): AudioClipProperties {
  const diagnostics: AudioClipPropertyDiagnostic[] = [];
  const metadata = clip.metadata || {};
  const clipDuration = barsToSeconds(clip.barLength, project.project.bpm, project.project.timeSig);
  const mediaDuration = cleanPositiveMediaDuration(media.durationSeconds, clipDuration);
  const rawSourceOffset = readNonNegativeMetadata(metadata.sourceOffsetSeconds, 0, "sourceOffsetSeconds", diagnostics);
  const sourceOffsetSeconds = capValue(rawSourceOffset, mediaDuration, "sourceOffsetSeconds", "media duration", diagnostics);
  const explicitDuration = readNonNegativeMetadata(metadata.durationSeconds, mediaDuration, "durationSeconds", diagnostics);
  const maxDuration = Math.max(0, mediaDuration - sourceOffsetSeconds);
  const durationSeconds = capValue(Math.max(0, explicitDuration || clipDuration), Math.min(clipDuration, maxDuration), "durationSeconds", "clip/media bounds", diagnostics);
  const gain = readNonNegativeMetadata(metadata.gain, clip.transforms.gain ?? 1, "gain", diagnostics);
  const rawFadeIn = readNonNegativeMetadata(metadata.fadeInSeconds, 0, "fadeInSeconds", diagnostics);
  const rawFadeOut = readNonNegativeMetadata(metadata.fadeOutSeconds, 0, "fadeOutSeconds", diagnostics);
  const cappedFadeIn = capValue(rawFadeIn, durationSeconds, "fadeInSeconds", "region duration", diagnostics);
  const cappedFadeOut = capValue(rawFadeOut, durationSeconds, "fadeOutSeconds", "region duration", diagnostics);
  const fade = normalizeAudioFade(durationSeconds, cappedFadeIn, cappedFadeOut);
  if (durationSeconds > 0 && cappedFadeIn + cappedFadeOut > durationSeconds) {
    diagnostics.push({
      field: "fadeInSeconds",
      code: "scaled",
      message: `Fade lengths exceeded region duration and were scaled to ${fade.fadeInSeconds.toFixed(3)}s / ${fade.fadeOutSeconds.toFixed(3)}s.`
    });
  }
  return {
    sourceOffsetSeconds,
    durationSeconds,
    gain,
    fadeInSeconds: fade.fadeInSeconds,
    fadeOutSeconds: fade.fadeOutSeconds,
    diagnostics
  };
}

export function normalizeAudioFade(durationSeconds: number, fadeInSeconds: number, fadeOutSeconds: number): AudioFadeEnvelope {
  const duration = Math.max(0, cleanNumber(durationSeconds, 0));
  let fadeIn = Math.min(duration, cleanNumber(fadeInSeconds, 0));
  let fadeOut = Math.min(duration, cleanNumber(fadeOutSeconds, 0));
  const total = fadeIn + fadeOut;
  if (duration > 0 && total > duration) {
    const scale = duration / total;
    fadeIn *= scale;
    fadeOut *= scale;
  }
  return { fadeInSeconds: fadeIn, fadeOutSeconds: fadeOut };
}

export function audioRegionEnvelopeGainAt(region: Pick<AudioRegion, "durationSeconds" | "gain" | "fadeInSeconds" | "fadeOutSeconds">, localSeconds: number): number {
  const duration = Math.max(0, region.durationSeconds);
  const local = Math.max(0, Math.min(duration, localSeconds));
  const baseGain = Math.max(0, region.gain);
  const fade = normalizeAudioFade(duration, region.fadeInSeconds, region.fadeOutSeconds);
  if (duration <= 0 || baseGain <= 0) return 0;
  let multiplier = 1;
  if (fade.fadeInSeconds > 0 && local < fade.fadeInSeconds) {
    multiplier = Math.min(multiplier, local / fade.fadeInSeconds);
  }
  if (fade.fadeOutSeconds > 0) {
    const fadeOutStart = duration - fade.fadeOutSeconds;
    if (local > fadeOutStart) {
      multiplier = Math.min(multiplier, Math.max(0, (duration - local) / fade.fadeOutSeconds));
    }
  }
  return baseGain * multiplier;
}

export function scheduleAudioRegionEnvelope(param: AudioParam, region: AudioRegion, when: number, sourceElapsed: number, scheduledDuration: number): void {
  const startLocal = Math.max(0, sourceElapsed);
  const endLocal = Math.min(region.durationSeconds, startLocal + Math.max(0, scheduledDuration));
  if (endLocal <= startLocal) return;
  param.cancelScheduledValues(when);
  param.setValueAtTime(audioRegionEnvelopeGainAt(region, startLocal), when);
  const fade = normalizeAudioFade(region.durationSeconds, region.fadeInSeconds, region.fadeOutSeconds);
  if (fade.fadeInSeconds > startLocal && fade.fadeInSeconds < endLocal) {
    param.linearRampToValueAtTime(Math.max(0, region.gain), when + fade.fadeInSeconds - startLocal);
  }
  const fadeOutStart = region.durationSeconds - fade.fadeOutSeconds;
  if (fade.fadeOutSeconds > 0 && fadeOutStart > startLocal && fadeOutStart < endLocal) {
    param.setValueAtTime(Math.max(0, region.gain), when + fadeOutStart - startLocal);
  }
  if (fade.fadeOutSeconds > 0 && endLocal > fadeOutStart) {
    param.linearRampToValueAtTime(audioRegionEnvelopeGainAt(region, endLocal), when + endLocal - startLocal);
  }
}

function cleanNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanPositiveMediaDuration(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Math.max(0, fallback);
}

function readNonNegativeMetadata(
  value: unknown,
  fallback: number,
  field: AudioClipPropertyDiagnostic["field"],
  diagnostics: AudioClipPropertyDiagnostic[]
): number {
  if (value === undefined || value === null || value === "") return Math.max(0, fallback);
  const number = Number(value);
  if (!Number.isFinite(number)) {
    diagnostics.push({ field, code: "invalid", message: `${field} was not finite and fell back to ${fallback}.` });
    return Math.max(0, fallback);
  }
  if (number < 0) {
    diagnostics.push({ field, code: "negative", message: `${field} was negative and was clamped to 0.` });
    return 0;
  }
  return number;
}

function capValue(
  value: number,
  maximum: number,
  field: AudioClipPropertyDiagnostic["field"],
  boundLabel: string,
  diagnostics: AudioClipPropertyDiagnostic[]
): number {
  const max = Math.max(0, maximum);
  if (value > max) {
    diagnostics.push({ field, code: "capped", message: `${field} exceeded ${boundLabel} and was capped to ${max}.` });
    return max;
  }
  return value;
}
