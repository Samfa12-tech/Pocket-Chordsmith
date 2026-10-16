import type { PocketDawProject } from "../daw/schema";
import { finishMonitorGains, projectWithFinishPreset, type FinishPresetId } from "../daw/finishing";
import { buildNativeAudioStartPayload, type NativeAudioStartPayload } from "../native/audioPlayback";
import { NativeFinishPreview } from "../native/finishPreview";
import { buildNativeRuntimeAudioCache } from "./nativeRenderCache";
import { renderTimelineEvents } from "./eventRenderer";
import { analyseFinishWavOffThread } from "./finishAnalysisClient";
import { finishAudioWarnings, type FinishAnalysisRange, type FinishMeasurements } from "./finishAnalysis";

export interface PreparedFinishComparison {
  proposed: PocketDawProject;
  payload: NativeAudioStartPayload;
  a: FinishMeasurements;
  b: FinishMeasurements;
  gains: ReturnType<typeof finishMonitorGains>;
  warnings: string[];
  dispose(): Promise<void>;
}

export async function prepareFinishComparison(source: PocketDawProject, preset: FinishPresetId, range: FinishAnalysisRange, signal: AbortSignal, progress: (message: string) => void, cleanupError: (error: unknown) => void, trackId?: string): Promise<PreparedFinishComparison> {
  if (preset === "original") throw new Error("Choose a proposed starting point; A always keeps your original mix.");
  if (range.endSeconds - range.startSeconds > 120 || range.endSeconds > 600 || range.endSeconds * source.project.sampleRate * 8 + 44 > 128 * 1024 * 1024) throw new Error("Choose a shorter or earlier passage: preview keeps up to 600 seconds of effect history and 128 MiB per version, with a passage up to 120 seconds.");
  const proposed = projectWithFinishPreset(source, preset, trackId);
  const native = new NativeFinishPreview();
  const check = () => { if (signal.aborted) throw new DOMException("Finish preparation cancelled.", "AbortError"); };
  const cancel = () => { void native.dispose().catch(cleanupError); };
  signal.addEventListener("abort", cancel, { once: true });
  const dispose = async () => { signal.removeEventListener("abort", cancel); await native.dispose(); };
  try {
    check();
    progress("Preparing source media. Stop cancels; your project is unchanged.");
    const cache = await buildNativeRuntimeAudioCache(source);
    check();
    if (cache.missingRuntimeAudioRegionCount) throw new Error("Relink missing timeline audio before preparing Finish.");
    const files = [], measurements: FinishMeasurements[] = [];
    for (const [index, project] of [source, proposed].entries()) {
      progress(`Rendering ${index ? "Proposed" : "Original"} from the beginning to preserve effect history. Stop cancels.`);
      const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0, cache);
      const prepared = await native.prepare({ ...payload, loop: null, metronome: null }, range.endSeconds);
      check();
      files.push(prepared);
      progress(`Measuring rendered ${index ? "Proposed" : "Original"} in a worker. Stop cancels.`);
      const bytes = await native.read(prepared.id);
      check();
      measurements.push(await analyseFinishWavOffThread(bytes, range, signal));
      check();
    }
    const [a, b] = measurements;
    const gains = finishMonitorGains(a, b);
    const trackIds = ["finish-original", "finish-proposed"];
    const payload: NativeAudioStartPayload = {
      projectTitle: `${source.project.title} · Finish comparison`, sampleRate: source.project.sampleRate,
      startSeconds: range.startSeconds, audition: { endSeconds: range.endSeconds },
      monitorComparison: { aTrackId: trackIds[0], bTrackId: trackIds[1], aGain: gains.aGain, bGain: gains.bGain, side: "a" },
      bpm: source.project.bpm, timeSig: source.project.timeSig, outputDeviceId: source.audioDeviceSettings.outputDeviceId,
      loop: null, metronome: null, tracks: trackIds.map(id => ({ id, isReturn: false, sends: [], volume: 1, pan: 0, mute: false, solo: false })), events: [], fxChains: [],
      assets: files.map(({ id, file }, index) => ({ id, name: `${index ? "Proposed" : "Original"}.wav`, sourcePath: file.sourcePath, sourceHash: id, sampleRate: file.sampleRate, channels: file.channels, durationSeconds: file.durationSeconds, sizeBytes: file.sizeBytes, mimeType: "audio/wav" })),
      regions: files.map(({ id, file }, index) => ({ id: `finish-region-${index}`, assetId: id, trackId: trackIds[index], startTime: 0, sourceOffset: 0, duration: file.durationSeconds, gain: 1, pan: 0, fadeIn: 0, fadeOut: 0 }))
    };
    return { proposed, payload, a, b, gains, warnings: [...finishAudioWarnings(a).map(warning => `Original: ${warning}`), ...finishAudioWarnings(b).map(warning => `Proposed: ${warning}`)], dispose };
  } catch (error) { await dispose().catch(cleanupError); throw error; }
}
