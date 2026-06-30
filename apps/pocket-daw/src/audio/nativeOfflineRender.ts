import type { PocketDawProject } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import { buildNativeAudioStartPayload } from "../native/audioPlayback";
import { renderNativeAudioWav, type NativeMediaApi } from "../native/mediaBridge";
import { renderTimelineEvents } from "./eventRenderer";
import { buildNativeRuntimeAudioCache } from "./nativeRenderCache";
import { fullSongWavChannelMode, fullSongWavPeakNormalize, fullSongWavSampleRate, wavBlobWithChannelMode, type WavChannelMode } from "./offlineRender";

export async function renderProjectToNativeWavBlob(project: PocketDawProject, api?: NativeMediaApi, options: { channelMode?: WavChannelMode; normalizePeak?: boolean } = {}): Promise<Blob | null> {
  const renderProject = projectForFullSongWavExport(project);
  const runtimeCache = await buildNativeRuntimeAudioCache(renderProject);
  if (runtimeCache.missingRuntimeAudioRegionCount > 0) {
    throw new Error("Native WAV export is missing one or more timeline audio files.");
  }
  const payload = buildNativeAudioStartPayload(renderProject, renderTimelineEvents(renderProject), 0, runtimeCache);
  const rendered = await renderNativeAudioWav({
    ...payload,
    loop: null,
    metronome: null
  }, nativeWavExportDurationSeconds(renderProject), api);
  if (!rendered) return null;
  return wavBlobWithChannelMode(
    new Blob([new Uint8Array(rendered.bytes)], { type: "audio/wav" }),
    options.channelMode || fullSongWavChannelMode(renderProject),
    { normalizePeak: options.normalizePeak ?? fullSongWavPeakNormalize(renderProject) }
  );
}

export function nativeWavExportDurationSeconds(project: PocketDawProject): number {
  const tailSeconds = Number(project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings.tailSeconds ?? 1.2);
  return barsToSeconds(project.timeline.bars, project.project.bpm, project.project.timeSig) + tailSeconds;
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
