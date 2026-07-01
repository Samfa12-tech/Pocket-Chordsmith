import type { Clip, MediaPoolItem, PocketDawProject } from "../daw/schema";
import { timelineSecondsAtBar } from "../daw/timeline";
import { trackIsAudible } from "../daw/tracks";
import { clipAutomationPath, evaluateAutomationLane, interpolateAutomationValue } from "../daw/automation";

export interface AudioRegionGainAutomationPoint {
  localSeconds: number;
  value: number;
  curve?: "linear" | "hold" | "ease-in" | "ease-out";
}

export interface AudioRegion {
  clipId: string;
  trackId: string;
  mediaPoolItemId: string;
  startTimeSeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
  gain: number;
  phaseMultiplier: number;
  reversed: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  playbackRate: number;
  pitchSemitones: number;
  gainAutomation?: AudioRegionGainAutomationPoint[];
}

export interface AudioFadeEnvelope {
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface AudioClipPropertyDiagnostic {
  field: "sourceOffsetSeconds" | "durationSeconds" | "gain" | "fadeInSeconds" | "fadeOutSeconds" | "playbackRate" | "pitchSemitones";
  code: "invalid" | "negative" | "capped" | "scaled";
  message: string;
}

export interface AudioClipProperties extends AudioFadeEnvelope {
  sourceOffsetSeconds: number;
  durationSeconds: number;
  gain: number;
  phaseMultiplier: number;
  reversed: boolean;
  playbackRate: number;
  pitchSemitones: number;
  diagnostics: AudioClipPropertyDiagnostic[];
}

export interface RenderedAudioTimeline {
  audioRegions: AudioRegion[];
  warnings: string[];
}

export interface RenderTimelineAudioRegionsOptions {
  includeMutedTracks?: boolean;
}

export interface AudioRegionPlaybackWindow {
  sourceOffsetSeconds: number;
  sourceDurationSeconds: number;
  durationSeconds: number;
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
    startTimeSeconds: timelineSecondsAtBar(project, clip.startBar),
    sourceOffsetSeconds: properties.sourceOffsetSeconds,
    durationSeconds: properties.durationSeconds,
    gain: properties.gain,
    phaseMultiplier: properties.phaseMultiplier,
    reversed: properties.reversed,
    fadeInSeconds: properties.fadeInSeconds,
    fadeOutSeconds: properties.fadeOutSeconds,
    playbackRate: properties.playbackRate,
    pitchSemitones: properties.pitchSemitones,
    gainAutomation: gainAutomationFromClip(project, clip, properties.gain, properties.durationSeconds)
  };
}

export function normalizeAudioClipProperties(project: PocketDawProject, clip: Clip, media: MediaPoolItem): AudioClipProperties {
  const diagnostics: AudioClipPropertyDiagnostic[] = [];
  const metadata = clip.metadata || {};
  const clipDuration = clipDurationSeconds(project, clip);
  const mediaDuration = cleanPositiveMediaDuration(media.durationSeconds, clipDuration);
  const rawSourceOffset = readNonNegativeMetadata(metadata.sourceOffsetSeconds, 0, "sourceOffsetSeconds", diagnostics);
  const sourceOffsetSeconds = capValue(rawSourceOffset, mediaDuration, "sourceOffsetSeconds", "media duration", diagnostics);
  const basePlaybackRate = readRangedMetadata(metadata.playbackRate, 1, 0.25, 4, "playbackRate", diagnostics);
  const pitchSemitones = readRangedMetadata(metadata.pitchSemitones, 0, -48, 48, "pitchSemitones", diagnostics);
  const playbackRate = cleanPlaybackRate(basePlaybackRate * (2 ** (pitchSemitones / 12)));
  const explicitDuration = readNonNegativeMetadata(metadata.durationSeconds, mediaDuration, "durationSeconds", diagnostics);
  const maxDuration = Math.max(0, mediaDuration - sourceOffsetSeconds);
  const maxTimelineDuration = playbackRate > 0 ? maxDuration / playbackRate : maxDuration;
  const durationSeconds = capValue(Math.max(0, explicitDuration || clipDuration), Math.min(clipDuration, maxTimelineDuration), "durationSeconds", "clip/media bounds", diagnostics);
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
    phaseMultiplier: metadata.invertPhase === true ? -1 : 1,
    reversed: metadata.reversed === true,
    playbackRate,
    pitchSemitones,
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

export function audioRegionEnvelopeGainAt(region: Pick<AudioRegion, "durationSeconds" | "gain" | "fadeInSeconds" | "fadeOutSeconds"> & Partial<Pick<AudioRegion, "phaseMultiplier" | "gainAutomation">>, localSeconds: number): number {
  const duration = Math.max(0, region.durationSeconds);
  const local = Math.max(0, Math.min(duration, localSeconds));
  const baseGain = Math.max(0, audioRegionGainAutomationAt(region, local));
  const phaseMultiplier = region.phaseMultiplier === -1 ? -1 : 1;
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
  return baseGain * multiplier * phaseMultiplier;
}

export function scheduleAudioRegionEnvelope(param: AudioParam, region: AudioRegion, when: number, sourceElapsed: number, scheduledDuration: number): void {
  const startLocal = Math.max(0, sourceElapsed);
  const endLocal = Math.min(region.durationSeconds, startLocal + Math.max(0, scheduledDuration));
  if (endLocal <= startLocal) return;
  param.cancelScheduledValues(when);
  param.setValueAtTime(audioRegionEnvelopeGainAt(region, startLocal), when);
  const schedulePoints = audioRegionEnvelopeSchedulePoints(region, startLocal, endLocal);
  schedulePoints.forEach((local) => {
    if (local <= startLocal || local >= endLocal) return;
    param.linearRampToValueAtTime(audioRegionEnvelopeGainAt(region, local), when + local - startLocal);
  });
  const fade = normalizeAudioFade(region.durationSeconds, region.fadeInSeconds, region.fadeOutSeconds);
  const signedGain = Math.max(0, audioRegionGainAutomationAt(region, Math.min(fade.fadeInSeconds, endLocal))) * (region.phaseMultiplier === -1 ? -1 : 1);
  if (fade.fadeInSeconds > startLocal && fade.fadeInSeconds < endLocal) {
    param.linearRampToValueAtTime(signedGain, when + fade.fadeInSeconds - startLocal);
  }
  const fadeOutStart = region.durationSeconds - fade.fadeOutSeconds;
  if (fade.fadeOutSeconds > 0 && fadeOutStart > startLocal && fadeOutStart < endLocal) {
    param.setValueAtTime(signedGain, when + fadeOutStart - startLocal);
  }
  if (fade.fadeOutSeconds > 0 && endLocal > fadeOutStart) {
    param.linearRampToValueAtTime(audioRegionEnvelopeGainAt(region, endLocal), when + endLocal - startLocal);
  }
}

export function audioRegionPlaybackWindow(region: AudioRegion, sourceDurationSeconds: number, sourceElapsed: number): AudioRegionPlaybackWindow | null {
  const elapsed = Math.max(0, sourceElapsed);
  const sourceDuration = Math.max(0, sourceDurationSeconds);
  const remainingRegion = Math.max(0, region.durationSeconds - elapsed);
  const playbackRate = cleanPlaybackRate(region.playbackRate);
  if (remainingRegion <= 0 || sourceDuration <= 0) return null;
  const sourceSpan = remainingRegion * playbackRate;
  const offset = region.reversed
    ? sourceDuration - (region.sourceOffsetSeconds + region.durationSeconds * playbackRate) + elapsed * playbackRate
    : region.sourceOffsetSeconds + elapsed * playbackRate;
  const sourceOffsetSeconds = Math.max(0, offset);
  if (sourceOffsetSeconds >= sourceDuration) return null;
  const sourceDurationAvailable = Math.min(sourceSpan, Math.max(0, sourceDuration - sourceOffsetSeconds));
  const durationSeconds = sourceDurationAvailable / playbackRate;
  return durationSeconds > 0 && sourceDurationAvailable > 0
    ? { sourceOffsetSeconds, sourceDurationSeconds: sourceDurationAvailable, durationSeconds }
    : null;
}

export function audioBufferForRegionPlayback(ctx: BaseAudioContext, buffer: AudioBuffer, region: Pick<AudioRegion, "reversed">): AudioBuffer {
  if (!region.reversed) return buffer;
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    const target = reversed.getChannelData(channel);
    for (let index = 0; index < source.length; index += 1) {
      target[index] = source[source.length - 1 - index] || 0;
    }
  }
  return reversed;
}

function gainAutomationFromClip(project: PocketDawProject, clip: Clip, fallbackGain: number, durationSeconds: number): AudioRegionGainAutomationPoint[] | undefined {
  const lane = project.automation.lanes.find((item) => item.targetPath === clipAutomationPath(clip.id, "gain"));
  if (!lane?.enabled || !lane.points.length) return undefined;
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar || (a.beat || 0) - (b.beat || 0) || (a.tick || 0) - (b.tick || 0));
  const duration = Math.max(0, durationSeconds);
  const startCurve = points.filter((point) => point.bar <= clip.startBar).at(-1)?.curve || points[0]?.curve || "linear";
  const localPoints = [
    { localSeconds: 0, value: evaluateAutomationLane(lane, clip.startBar, fallbackGain), curve: startCurve },
    ...points
      .map((point) => ({
        localSeconds: timelineSecondsAtBar(project, point.bar) - timelineSecondsAtBar(project, clip.startBar),
        value: point.value,
        curve: point.curve
      }))
      .filter((point) => point.localSeconds > 0 && point.localSeconds < duration),
    { localSeconds: duration, value: evaluateAutomationLane(lane, clip.startBar + clip.barLength, fallbackGain), curve: "linear" as const }
  ];
  return localPoints.map((point) => ({
    localSeconds: Math.max(0, Math.min(duration, point.localSeconds)),
    value: Math.max(0, Math.min(4, Number.isFinite(point.value) ? point.value : fallbackGain)),
    curve: point.curve === "hold" ? "hold" : point.curve === "ease-in" || point.curve === "ease-out" ? point.curve : "linear"
  }));
}

function clipDurationSeconds(project: PocketDawProject, clip: Clip): number {
  return Math.max(0, timelineSecondsAtBar(project, clip.startBar + Math.max(0, clip.barLength)) - timelineSecondsAtBar(project, clip.startBar));
}

function audioRegionGainAutomationAt(region: Pick<AudioRegion, "gain"> & Partial<Pick<AudioRegion, "gainAutomation">>, localSeconds: number): number {
  const points = (region.gainAutomation || []).slice().sort((a, b) => a.localSeconds - b.localSeconds);
  if (!points.length) return region.gain;
  const local = Math.max(0, localSeconds);
  if (local <= points[0].localSeconds) return points[0].value;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (local >= a.localSeconds && local <= b.localSeconds) {
      if (a.curve === "hold") return a.value;
      const t = (local - a.localSeconds) / Math.max(0.0001, b.localSeconds - a.localSeconds);
      return interpolateAutomationValue(a.value, b.value, t, a.curve);
    }
  }
  return points[points.length - 1].value;
}

function audioRegionEnvelopeSchedulePoints(region: AudioRegion, startLocal: number, endLocal: number): number[] {
  const points = new Set<number>();
  const fade = normalizeAudioFade(region.durationSeconds, region.fadeInSeconds, region.fadeOutSeconds);
  points.add(fade.fadeInSeconds);
  points.add(region.durationSeconds - fade.fadeOutSeconds);
  (region.gainAutomation || []).forEach((point) => points.add(point.localSeconds));
  const step = 0.1;
  for (let local = Math.ceil(startLocal / step) * step; local < endLocal; local += step) points.add(Number(local.toFixed(3)));
  return Array.from(points).filter((point) => point > startLocal && point < endLocal).sort((a, b) => a - b);
}

function cleanNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanSignedNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanPlaybackRate(value: unknown): number {
  return clampNumber(cleanSignedNumber(value, 1), 0.25, 4, 1);
}

function cleanPositiveMediaDuration(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Math.max(0, fallback);
}

function readRangedMetadata(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: AudioClipPropertyDiagnostic["field"],
  diagnostics: AudioClipPropertyDiagnostic[]
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    diagnostics.push({ field, code: "invalid", message: `${field} was not finite and fell back to ${fallback}.` });
    return fallback;
  }
  const clamped = clampNumber(number, min, max, fallback);
  if (clamped !== number) diagnostics.push({ field, code: "capped", message: `${field} exceeded its supported range and was capped to ${clamped}.` });
  return clamped;
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

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
