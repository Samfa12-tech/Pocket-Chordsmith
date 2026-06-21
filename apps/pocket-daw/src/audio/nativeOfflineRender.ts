import type { PocketDawProject } from "../daw/schema";
import { barsToSeconds } from "../daw/timeline";
import { buildNativeAudioStartPayload } from "../native/audioPlayback";
import { renderNativeAudioWav, type NativeMediaApi } from "../native/mediaBridge";
import { renderTimelineEvents } from "./eventRenderer";
import { buildNativeRuntimeAudioCache } from "./nativeRenderCache";

export async function renderProjectToNativeWavBlob(project: PocketDawProject, api?: NativeMediaApi): Promise<Blob | null> {
  const runtimeCache = await buildNativeRuntimeAudioCache(project);
  if (runtimeCache.missingRuntimeAudioRegionCount > 0) {
    throw new Error("Native WAV export is missing one or more timeline audio files.");
  }
  const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0, runtimeCache);
  const rendered = await renderNativeAudioWav({
    ...payload,
    loop: null,
    metronome: null
  }, nativeWavExportDurationSeconds(project), api);
  if (!rendered) return null;
  return new Blob([new Uint8Array(rendered.bytes)], { type: "audio/wav" });
}

export function nativeWavExportDurationSeconds(project: PocketDawProject): number {
  const tailSeconds = Number(project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings.tailSeconds || 1.2);
  return barsToSeconds(project.timeline.bars, project.project.bpm, project.project.timeSig) + tailSeconds;
}
