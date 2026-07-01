import type { PocketDawProject } from "../daw/schema";
import { timelineDurationSeconds } from "../daw/timeline";
import { buildNativeAudioStartPayload } from "../native/audioPlayback";
import { renderNativeAudioWav, type NativeMediaApi } from "../native/mediaBridge";
import { renderTimelineEvents } from "./eventRenderer";
import { buildNativeRuntimeAudioCache } from "./nativeRenderCache";
import { fullSongWavBitDepth, fullSongWavChannelMode, fullSongWavDither, fullSongWavPeakNormalize, fullSongWavSampleRate, wavBlobWithChannelMode, type WavBitDepth, type WavChannelMode, type WavDitherMode } from "./offlineRender";

export async function renderProjectToNativeWavBlob(project: PocketDawProject, api?: NativeMediaApi, options: { channelMode?: WavChannelMode; bitDepth?: WavBitDepth; dither?: WavDitherMode; normalizePeak?: boolean } = {}): Promise<Blob | null> {
  const renderProject = projectForFullSongWavExport(project);
  const targetBitDepth = options.bitDepth || fullSongWavBitDepth(renderProject);
  const dither = options.dither || fullSongWavDither(renderProject);
  const nativeBitDepth = dither === "tpdf" && targetBitDepth !== 32 ? 32 : targetBitDepth;
  const runtimeCache = await buildNativeRuntimeAudioCache(renderProject);
  if (runtimeCache.missingRuntimeAudioRegionCount > 0) {
    throw new Error("Native WAV export is missing one or more timeline audio files.");
  }
  const payload = buildNativeAudioStartPayload(renderProject, renderTimelineEvents(renderProject), 0, runtimeCache);
  const rendered = await renderNativeAudioWav({
    ...payload,
    loop: null,
    metronome: null
  }, nativeWavExportDurationSeconds(renderProject), { bitDepth: nativeBitDepth }, api);
  if (!rendered) return null;
  return wavBlobWithChannelMode(
    new Blob([new Uint8Array(rendered.bytes)], { type: "audio/wav" }),
    options.channelMode || fullSongWavChannelMode(renderProject),
    {
      bitDepth: targetBitDepth,
      dither,
      normalizePeak: options.normalizePeak ?? fullSongWavPeakNormalize(renderProject)
    }
  );
}

export function nativeWavExportDurationSeconds(project: PocketDawProject): number {
  const tailSeconds = Number(project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings.tailSeconds ?? 1.2);
  return timelineDurationSeconds(project) + tailSeconds;
}

function projectForFullSongWavExport(project: PocketDawProject): PocketDawProject {
  const sampleRate = fullSongWavSampleRate(project);
  if (sampleRate === project.project.sampleRate) return project;
  return {
    ...project,
    project: {
      ...project.project,
      sampleRate
    }
  };
}
