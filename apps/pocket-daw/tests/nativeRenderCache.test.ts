import { beforeEach, describe, expect, it, vi } from "vitest";

const wavBytes = vi.hoisted(() => {
  const writeText = (view: DataView, offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  return (sampleRate = 48_000, channels = 2, samples: number[] = [0, 0, 0, 0]) => {
    const dataLen = samples.length * 2;
    const bytes = new Uint8Array(44 + dataLen);
    const view = new DataView(bytes.buffer);
    writeText(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLen, true);
    writeText(view, 8, "WAVE");
    writeText(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeText(view, 36, "data");
    view.setUint32(40, dataLen, true);
    let offset = 44;
    samples.forEach((sample) => {
      view.setInt16(offset, Math.max(-32768, Math.min(32767, sample)), true);
      offset += 2;
    });
    return bytes;
  };
});

const offlineRenderMock = vi.hoisted(() => ({
  renderProjectToWavBlob: vi.fn(async () => new Blob([wavBytes()], { type: "audio/wav" })),
  encodeWav: vi.fn((buffer: globalThis.AudioBuffer) => {
    const samples = Array.from({ length: Math.max(2, buffer.numberOfChannels * 2) }, () => 0);
    return new Blob([wavBytes(buffer.sampleRate, buffer.numberOfChannels, samples)], { type: "audio/wav" });
  })
}));

const nativeMediaBridgeMock = vi.hoisted(() => ({
  renderNativeAudioWav: vi.fn(async () => null)
}));

vi.mock("../src/audio/offlineRender", () => offlineRenderMock);
vi.mock("../src/native/mediaBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/native/mediaBridge")>();
  return {
    ...actual,
    renderNativeAudioWav: nativeMediaBridgeMock.renderNativeAudioWav
  };
});

import { AudioEngine } from "../src/audio/audioEngine";
import { clearAudioBufferCache, setCachedAudioBuffer } from "../src/audio/audioBufferCache";
import { cloneProject } from "../src/daw/dawProject";
import {
  buildNativeRenderCache,
  buildNativeRuntimeAudioCache,
  hydrateNativeRenderCacheAssets,
  nativeRenderCacheProjectNamespace,
  mergeNativeRenderCacheItems,
  nativeRenderCacheRelativePath,
  nativeRenderCacheSignature,
  nativeRuntimeAudioCacheSignature,
  persistNativeRenderCacheAssets,
  prunePersistedNativeRenderCacheAssets,
  projectForNativeGeneratedStemRender
} from "../src/audio/nativeRenderCache";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { cycleBassStep } from "../src/daw/chordsmithEditor";
import { addDrumLaneFx } from "../src/daw/drumLanes";
import { addFxSlot, setFxSlotParameter } from "../src/daw/fx";
import type { Clip, MediaPoolItem } from "../src/daw/schema";
import type { NativeAudioStartPayload, NativeAudioStatus } from "../src/native/audioPlayback";
import type { NativeMediaApi } from "../src/native/mediaBridge";

function nativeRenderResult(samples: number[] = [512, -512, 256, -256]) {
  const bytes = Array.from(wavBytes(48_000, 2, samples));
  return {
    sampleRate: 48_000,
    channels: 2,
    durationSeconds: 1,
    sizeBytes: bytes.length,
    bytes
  };
}

describe("native render cache", () => {
  beforeEach(() => {
    clearAudioBufferCache();
    offlineRenderMock.renderProjectToWavBlob.mockClear();
    offlineRenderMock.encodeWav.mockClear();
    nativeMediaBridgeMock.renderNativeAudioWav.mockReset();
    nativeMediaBridgeMock.renderNativeAudioWav.mockResolvedValue(nativeRenderResult() as never);
  });

  it("does not invalidate cache signatures for live mixer mute and solo changes", () => {
    const project = createDemoProject();
    const signature = nativeRenderCacheSignature(project);

    project.tracks.find((track) => track.id === "bass")!.mute = true;
    project.tracks.find((track) => track.id === "chords")!.solo = true;

    expect(nativeRenderCacheSignature(project)).toBe(signature);

    project.timeline.clips[0].transforms.transpose += 1;

    expect(nativeRenderCacheSignature(project)).not.toBe(signature);
  });

  it("does not invalidate generated cache signatures for metadata or metronome changes", () => {
    const project = createDemoProject();
    const signature = nativeRenderCacheSignature(project);

    project.project.title = "Renamed Session";
    project.project.metronome = { enabled: true, countInBars: 2, volume: 0.2 };

    expect(nativeRenderCacheSignature(project)).toBe(signature);

    project.project.bpm += 1;

    expect(nativeRenderCacheSignature(project)).not.toBe(signature);
  });

  it("invalidates generated cache only for audio baked into cached stem assets", () => {
    let project = createDemoProject();
    const signature = nativeRenderCacheSignature(project);

    project = addFxSlot(project, "master", "parametric-eq");
    project = addFxSlot(project, "bass", "saturation");

    expect(nativeRenderCacheSignature(project)).toBe(signature);

    project = addDrumLaneFx(project, "snare", "parametric-eq");

    expect(nativeRenderCacheSignature(project)).not.toBe(signature);
  });

  it("builds dry native generated-stem render projects and keeps only drum lane FX baked", () => {
    let project = createLofiTemplateProject();
    project.project.metronome = { enabled: true, countInBars: 1, volume: 0.5 };
    project = addDrumLaneFx(project, "snare", "parametric-eq");
    const clip = project.timeline.clips.find((item) => item.type === "generated-section")!;
    const renderProject = projectForNativeGeneratedStemRender(project, clip, "drums");

    expect(renderProject.project.metronome?.enabled).toBe(false);
    expect(renderProject.mixer.masterLimiter).toBe(false);
    expect(renderProject.tracks.find((track) => track.id === "master")?.volume).toBe(1);
    expect(renderProject.tracks.find((track) => track.id === "drums")?.volume).toBe(1);
    expect(renderProject.tracks.find((track) => track.id === "bass")?.mute).toBe(true);
    expect(renderProject.fx.chains.length).toBeGreaterThan(0);
    expect(renderProject.fx.chains.every((chain) => typeof chain.metadata?.drumLaneId === "string")).toBe(true);
  });

  it("builds generated-section WAV assets, regions and render-cache metadata", async () => {
    const project = createDemoProject();
    const cache = await buildNativeRenderCache(project, "test-signature");

    expect(cache.assets.length).toBeGreaterThan(0);
    expect(cache.regions.length).toBeGreaterThan(0);
    expect(cache.generatedRegionCount).toBe(cache.regions.length);
    expect(cache.runtimeAudioRegionCount).toBe(0);
    expect(cache.renderCacheItems.length).toBe(cache.assets.length);
    expect(cache.renderCacheItems[0].metadata).toMatchObject({
      cacheKind: "native-generated-stem",
      cacheScope: "project-native-audio",
      sourceHash: "test-signature",
      durableCacheReady: false
    });
    expect(cache.assets[0].relativePath).toMatch(/^project-cache\/native-audio\/native-cache-/);
    expect(cache.renderCacheItems[0].metadata?.assetRelativePath).toBe(cache.assets[0].relativePath);
    expect(cache.cachedAssetByteCount).toBeGreaterThan(44);
    expect(nativeMediaBridgeMock.renderNativeAudioWav).toHaveBeenCalled();
    expect(offlineRenderMock.renderProjectToWavBlob).not.toHaveBeenCalled();
  });

  it("uses native offline rendering for generated-section WAV assets when available", async () => {
    const nativeBytes = Array.from(wavBytes(48_000, 2, [512, -512, 256, -256]));
    nativeMediaBridgeMock.renderNativeAudioWav.mockResolvedValue({
      sampleRate: 48_000,
      channels: 2,
      durationSeconds: 1,
      sizeBytes: nativeBytes.length,
      bytes: nativeBytes
    } as never);

    const cache = await buildNativeRenderCache(createDemoProject(), "native-render-signature");

    expect(cache.assets.length).toBeGreaterThan(0);
    expect(cache.assets[0].bytes).toEqual(nativeBytes);
    expect(nativeMediaBridgeMock.renderNativeAudioWav).toHaveBeenCalled();
    const nativeRenderCalls = nativeMediaBridgeMock.renderNativeAudioWav.mock.calls as unknown as Array<unknown[]>;
    expect(nativeRenderCalls[0]?.[2]).toBe("cache-stem");
    expect(offlineRenderMock.renderProjectToWavBlob).not.toHaveBeenCalled();
  });

  it("skips generated-section cache when native stem rendering is unavailable", async () => {
    nativeMediaBridgeMock.renderNativeAudioWav.mockResolvedValue(null);

    const cache = await buildNativeRenderCache(createDemoProject(), "native-unavailable-signature");

    expect(nativeMediaBridgeMock.renderNativeAudioWav).toHaveBeenCalled();
    expect(cache.assets.length).toBe(0);
    expect(cache.regions.length).toBe(0);
    expect(cache.generatedRegionCount).toBe(0);
    expect(cache.renderCacheItems.length).toBe(0);
    expect(cache.cachedClipIds.size).toBe(0);
    expect(cache.renderCacheMissCount).toBeGreaterThan(0);
    expect(offlineRenderMock.renderProjectToWavBlob).not.toHaveBeenCalled();
  });

  it("keeps generated lofi cache stems on the native renderer", async () => {
    const project = createLofiTemplateProject();
    await buildNativeRenderCache(project, "lofi-signature");

    expect(nativeMediaBridgeMock.renderNativeAudioWav).toHaveBeenCalled();
    expect(offlineRenderMock.renderProjectToWavBlob).not.toHaveBeenCalled();
  });

  it("adds runtime-loaded audio clips as native WAV asset regions", async () => {
    const project = withAudioClip(createDemoProject());
    setCachedAudioBuffer("media_audio", fakeAudioBuffer());

    const cache = await buildNativeRenderCache(project, "audio-signature");
    const audioRegion = cache.regions.find((region) => region.id.includes("audio_clip"));

    expect(cache.runtimeAudioRegionCount).toBe(1);
    expect(cache.missingRuntimeAudioRegionCount).toBe(0);
    expect(audioRegion).toMatchObject({
      trackId: "bass",
      sourceOffset: 0.25,
      duration: 0.5,
      gain: 0.75
    });
    expect(cache.renderCacheItems.some((item) => item.metadata?.cacheKind === "native-runtime-audio")).toBe(true);
    expect(offlineRenderMock.encodeWav).toHaveBeenCalled();
  });

  it("uses preserved original WAV bytes for native runtime audio assets", async () => {
    const project = withAudioClip(createDemoProject());
    const originalWav = wavBytes(44_100, 2, Array.from({ length: 44_100 * 2 }, (_, index) => index % 2 === 0 ? 1024 : -1024));
    setCachedAudioBuffer("media_audio", fakeAudioBuffer(), {
      sourceBytes: originalWav,
      sourceMimeType: "audio/wav",
      sourceName: "Loop.wav",
      sourceUri: "C:\\Audio\\Loop.wav"
    });

    const cache = await buildNativeRuntimeAudioCache(project, "runtime-original-wav-signature");

    expect(cache.runtimeAudioRegionCount).toBe(1);
    expect(cache.assets[0]).toMatchObject({
      sampleRate: 44_100,
      channels: 2,
      durationSeconds: 1,
      sizeBytes: originalWav.length,
      bytes: Array.from(originalWav)
    });
    expect(cache.renderCacheItems[0].metadata).toMatchObject({
      cacheKind: "native-runtime-audio",
      sourceEncoding: "original-wav",
      sourceByteLength: originalWav.length
    });
    expect(offlineRenderMock.encodeWav).not.toHaveBeenCalled();
  });

  it("builds runtime audio regions without rendering generated section stems", async () => {
    const project = withAudioClip(createDemoProject());
    setCachedAudioBuffer("media_audio", fakeAudioBuffer());

    const cache = await buildNativeRuntimeAudioCache(project, "runtime-only-signature");

    expect(cache.generatedRegionCount).toBe(0);
    expect(cache.runtimeAudioRegionCount).toBe(1);
    expect(cache.regions[0]).toMatchObject({ trackId: "bass", assetId: cache.assets[0].id });
    expect(offlineRenderMock.encodeWav).toHaveBeenCalled();
    expect(offlineRenderMock.renderProjectToWavBlob).not.toHaveBeenCalled();
  });

  it("keeps runtime audio cache stable across generated section edits", async () => {
    const project = withAudioClip(createDemoProject());
    setCachedAudioBuffer("media_audio", fakeAudioBuffer());

    const beforeSignature = nativeRuntimeAudioCacheSignature(project);
    const beforeCache = await buildNativeRuntimeAudioCache(project);
    project.timeline.clips.find((clip) => clip.type === "generated-section")!.transforms.transpose += 7;
    const afterCache = await buildNativeRuntimeAudioCache(project);

    expect(nativeRuntimeAudioCacheSignature(project)).toBe(beforeSignature);
    expect(afterCache.assets[0].id).toBe(beforeCache.assets[0].id);
  });

  it("counts uncached audio clips as runtime cache misses", async () => {
    const project = withAudioClip(createDemoProject());

    const cache = await buildNativeRenderCache(project, "missing-audio-signature");

    expect(cache.runtimeAudioRegionCount).toBe(0);
    expect(cache.missingRuntimeAudioRegionCount).toBe(1);
  });

  it("exposes ready native cache diagnostics after an explicit rebuild", async () => {
    const engine = new AudioEngine(createDemoProject());

    await engine.rebuildNativeRenderCache("test-rebuild");
    const diagnostics = engine.getDiagnostics();

    expect(diagnostics.nativeRenderCache.buildCount).toBe(1);
    expect(diagnostics.nativeRenderCache.assetRegionCount).toBeGreaterThan(0);
    expect(diagnostics.nativeRenderCache.renderCacheMetadataCount).toBeGreaterThan(0);
    expect(diagnostics.nativeRenderCache.lastBuildReason).toBe("test-rebuild");
    expect(diagnostics.nativeRenderCache.prewarmScheduled).toBe(false);
  });

  it("keeps live composition edits cached while rebuilding native caches", async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    const starts: NativeAudioStartPayload[] = [];
    const native = {
      async start(payload: NativeAudioStartPayload) {
        starts.push(payload);
        return {
          started: true,
          status: nativeStatus({
            active: true,
            playing: true,
            positionSeconds: payload.startSeconds,
            eventCount: payload.events.length,
            assetCount: payload.assets?.length || 0,
            assetRegionCount: payload.regions?.length || 0,
            proceduralEventCount: payload.events.length
          }),
          error: null
        };
      },
      async pause() { return nativeStatus({ active: true, playing: false }); },
      async resume() { return nativeStatus({ active: true, playing: true }); },
      async stop() { return nativeStatus({ active: false, playing: false }); },
      async seek(seconds: number) { return nativeStatus({ active: true, positionSeconds: seconds }); },
      async updateTrack() { return nativeStatus({ active: true }); },
      async status() { return nativeStatus({ active: true }); }
    };

    try {
      const project = createDemoProject();
      const engine = new AudioEngine(project, native);

      await engine.rebuildNativeRenderCache("test-prebuild");
      await engine.play();
      const activeStart = starts.at(-1)!;
      expect(activeStart.assets?.length || 0).toBeGreaterThan(0);
      expect(activeStart.regions?.length || 0).toBeGreaterThan(0);
      engine.syncProject(cycleBassStep(project, "A", 0), "composition-events", "live-bass-edit");
      await Promise.resolve();
      expect(starts).toHaveLength(1);
      await waitForAsyncCondition(() => engine.getDiagnostics().nativeRenderCache.buildCount >= 2 && starts.length >= 2);
      const diagnostics = engine.getDiagnostics();
      const liveEditStart = starts.at(-1)!;

      expect(starts).toHaveLength(2);
      expect(liveEditStart.assets?.length || 0).toBeGreaterThan(0);
      expect(liveEditStart.regions?.length || 0).toBeGreaterThan(0);
      expect(liveEditStart.events.length).toBeGreaterThan(0);
      expect(liveEditStart.events.every(isSilentCachedSidechainTrigger)).toBe(true);
      expect(diagnostics.nativeRenderCache.nativeRenderCacheBypassedForLiveEdits).toBe(false);
      expect(diagnostics.nativeRenderCache.assetRegionCount).toBeGreaterThan(0);
      expect(diagnostics.nativeRenderCache.proceduralFallbackEventCount).toBe(0);
    } finally {
      (globalThis as { window?: unknown }).window = previousWindow;
      starts.length = 0;
    }
  });

  it("keeps metadata-only project loads on cached native generated playback", async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    const starts: NativeAudioStartPayload[] = [];
    const native = {
      async start(payload: NativeAudioStartPayload) {
        starts.push(payload);
        return {
          started: true,
          status: nativeStatus({
            active: true,
            playing: true,
            positionSeconds: payload.startSeconds,
            eventCount: payload.events.length,
            assetCount: payload.assets?.length || 0,
            assetRegionCount: payload.regions?.length || 0,
            proceduralEventCount: payload.events.length
          }),
          error: null
        };
      },
      async pause() { return nativeStatus({ active: true, playing: false }); },
      async resume() { return nativeStatus({ active: true, playing: true }); },
      async stop() { return nativeStatus({ active: false, playing: false }); },
      async seek(seconds: number) { return nativeStatus({ active: true, positionSeconds: seconds }); },
      async updateTrack() { return nativeStatus({ active: true }); },
      async status() { return nativeStatus({ active: true }); }
    };

    try {
      const project = createDemoProject();
      const engine = new AudioEngine(project, native);

      await engine.rebuildNativeRenderCache("test-prebuild");
      await engine.play();
      const cachedStart = starts.at(-1)!;
      expect(cachedStart.regions?.length || 0).toBeGreaterThan(0);

      const metadataOnly = cloneProject(project);
      metadataOnly.project.title = "Renamed During Playback";
      metadataOnly.project.metronome = { enabled: true, countInBars: 2, volume: 0.2 };
      engine.syncProject(metadataOnly, "project-load", "metadata-only");
      await waitForAsyncCondition(() => starts.length >= 2);
      const restarted = starts.at(-1)!;
      const diagnostics = engine.getDiagnostics();

      expect(restarted.assets?.length || 0).toBeGreaterThan(0);
      expect(restarted.regions?.length || 0).toBeGreaterThan(0);
      expect(restarted.events.length).toBeLessThan(diagnostics.eventCount);
      expect(restarted.events.length).toBeGreaterThan(0);
      expect(restarted.events.every(isSilentCachedSidechainTrigger)).toBe(true);
      expect(diagnostics.nativeRenderCache.assetRegionCount).toBeGreaterThan(0);
      expect(diagnostics.nativeRenderCache.proceduralFallbackEventCount).toBe(0);
    } finally {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  });

  it("reports runtime audio preparation only until cached regions are ready", async () => {
    const project = withAudioClip(createDemoProject());
    const engine = new AudioEngine(project);

    expect(engine.getNativeRuntimeAudioPreparationState()).toMatchObject({
      audioRegionCount: 1,
      cachedAudioRegionCount: 0,
      preparedAudioRegionCount: 0,
      needsPreparation: false
    });

    setCachedAudioBuffer("media_audio", fakeAudioBuffer());

    expect(engine.getNativeRuntimeAudioPreparationState()).toMatchObject({
      audioRegionCount: 1,
      cachedAudioRegionCount: 1,
      preparedAudioRegionCount: 0,
      needsPreparation: true
    });

    await engine.rebuildNativeRenderCache("runtime-audio-ready");

    expect(engine.getNativeRuntimeAudioPreparationState()).toMatchObject({
      audioRegionCount: 1,
      cachedAudioRegionCount: 1,
      preparedAudioRegionCount: 1,
      needsPreparation: false
    });
  });

  it("persists native cache assets and marks render-cache metadata durable", async () => {
    const cache = await buildNativeRenderCache(createDemoProject(), "persist-signature");
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        if (command === "prune_native_cache_assets") {
          return {
            deletedCount: 2,
            deletedByteCount: 2048,
            skippedCount: 1,
            errors: []
          } as never;
        }
        return {
          assetId: String(args?.assetId || ""),
          path: `C:\\Songs\\${String(args?.relativePath || "").replace(/\//g, "\\")}`,
          relativePath: String(args?.relativePath || ""),
          sizeBytes: Array.isArray(args?.bytes) ? args.bytes.length : 0
        } as never;
      }
    };

    const result = await persistNativeRenderCacheAssets("C:\\Songs\\Song.pocketdaw", cache, api, { prune: true });

    expect(result.writtenAssetCount).toBe(cache.assets.length);
    expect(result.prunedAssetCount).toBe(2);
    expect(result.prunedByteCount).toBe(2048);
    expect(result.errors).toEqual([]);
    expect(calls[0].command).toBe("write_native_cache_asset");
    expect(calls[0].args).toMatchObject({
      projectFilePath: "C:\\Songs\\Song.pocketdaw",
      relativePath: cache.assets[0].relativePath
    });
    expect(result.renderCacheItems[0].metadata).toMatchObject({
      durableCacheReady: true,
      nativePath: expect.stringContaining("project-cache")
    });
    expect(calls.at(-1)).toMatchObject({
      command: "prune_native_cache_assets",
      args: {
        projectFilePath: "C:\\Songs\\Song.pocketdaw",
        keepRelativePaths: expect.arrayContaining([cache.assets[0].relativePath])
      }
    });
  });

  it("keeps current native cache paths when pruning stale persisted WAV assets", async () => {
    const cache = await buildNativeRenderCache(createDemoProject(), "persist-signature");
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        if (command === "prune_native_cache_assets") {
          const keep = args?.keepRelativePaths;
          expect(Array.isArray(keep)).toBe(true);
          expect(keep).toEqual(expect.arrayContaining(cache.assets.map((asset) => asset.relativePath)));
          expect(keep).not.toContain("project-media/recordings/take.wav");
          return { deletedCount: 1, deletedByteCount: 1234, skippedCount: cache.assets.length, errors: [] } as never;
        }
        return {
          assetId: String(args?.assetId || ""),
          path: `C:\\Songs\\${String(args?.relativePath || "").replace(/\//g, "\\")}`,
          relativePath: String(args?.relativePath || ""),
          sizeBytes: Array.isArray(args?.bytes) ? args.bytes.length : 0
        } as never;
      }
    };

    const result = await persistNativeRenderCacheAssets("C:\\Songs\\Song.pocketdaw", cache, api, { prune: true });

    expect(result.prunedAssetCount).toBe(1);
    expect(result.prunedByteCount).toBe(1234);
    expect(calls.filter((call) => call.command === "prune_native_cache_assets")).toHaveLength(1);
  });

  it("namespaces persisted native cache assets by saved project path", async () => {
    const songA = "C:\\Songs\\Song-A.pocketdaw";
    const songB = "C:\\Songs\\Song-B.pocketdaw";
    const namespaceA = nativeRenderCacheProjectNamespace(songA);
    const namespaceB = nativeRenderCacheProjectNamespace(songB);
    const cache = await buildNativeRenderCache(createDemoProject(), "namespace-signature");
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return {
          assetId: String(args?.assetId || ""),
          path: `C:\\Songs\\${String(args?.relativePath || "").replace(/\//g, "\\")}`,
          relativePath: String(args?.relativePath || ""),
          sizeBytes: Array.isArray(args?.bytes) ? args.bytes.length : 0
        } as never;
      }
    };

    const result = await persistNativeRenderCacheAssets(songA, cache, api, { prune: false });

    expect(namespaceA).not.toBe(namespaceB);
    expect(nativeRenderCacheProjectNamespace("c:\\songs\\SONG-A.pocketdaw")).toBe(namespaceA);
    expect(result.renderCacheItems[0].metadata?.cacheNamespace).toBe(namespaceA);
    expect(result.renderCacheItems[0].metadata?.assetRelativePath).toMatch(new RegExp(`^project-cache/native-audio/${namespaceA}/`));
    expect(result.renderCacheItems[0].metadata?.assetRelativePath).not.toContain(namespaceB);
    expect(calls.every((call) => call.command !== "prune_native_cache_assets")).toBe(true);
  });

  it("prunes only persisted native cache metadata paths after the project save succeeds", async () => {
    const namespace = nativeRenderCacheProjectNamespace("C:\\Songs\\Song.pocketdaw");
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return { deletedCount: 1, deletedByteCount: 44, skippedCount: 2, errors: [] } as never;
      }
    };
    const items = [
      {
        id: "good",
        createdAt: "2026-06-21T00:00:00.000Z",
        invalidated: false,
        metadata: {
          cacheKind: "native-generated-stem",
          assetRelativePath: nativeRenderCacheRelativePath("native-cache-good", namespace)
        }
      },
      {
        id: "unsafe",
        createdAt: "2026-06-21T00:00:00.000Z",
        invalidated: false,
        metadata: {
          cacheKind: "native-generated-stem",
          assetRelativePath: "../bad.wav"
        }
      }
    ];

    const result = await prunePersistedNativeRenderCacheAssets("C:\\Songs\\Song.pocketdaw", items, api);

    expect(result).toMatchObject({ deletedCount: 1, skippedCount: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: "prune_native_cache_assets",
      args: {
        keepRelativePaths: [nativeRenderCacheRelativePath("native-cache-good", namespace)]
      }
    });
  });

  it("hydrates current persisted native cache WAV assets from project render-cache metadata", async () => {
    const project = createDemoProject();
    const signature = nativeRenderCacheSignature(project);
    const built = await buildNativeRenderCache(project, signature);
    project.renderCache = built.renderCacheItems;
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return {
          assetId: String(args?.assetId || ""),
          path: `C:\\Songs\\${String(args?.relativePath || "").replace(/\//g, "\\")}`,
          relativePath: String(args?.relativePath || ""),
          sizeBytes: wavBytes().length,
          bytes: Array.from(wavBytes())
        } as never;
      }
    };

    const result = await hydrateNativeRenderCacheAssets("C:\\Songs\\Song.pocketdaw", project, api);

    expect(result.errors).toEqual([]);
    expect(result.hydratedCacheItemCount).toBe(built.renderCacheItems.length);
    expect(result.cache?.signature).toBe(signature);
    expect(result.cache?.regions.length).toBeGreaterThan(0);
    expect(result.cache?.cachedClipIds.has(project.timeline.clips[0].id)).toBe(true);
    expect(result.cache?.hydratedCacheReadByteCount).toBeGreaterThan(0);
    expect(calls[0]).toMatchObject({
      command: "read_native_cache_asset",
      args: {
        projectFilePath: "C:\\Songs\\Song.pocketdaw",
        relativePath: built.renderCacheItems[0].metadata?.assetRelativePath
      }
    });
  });

  it("skips stale or invalid persisted native cache metadata during hydration", async () => {
    const project = createDemoProject();
    project.renderCache = [
      {
        id: "stale",
        sourceClipId: project.timeline.clips[0].id,
        createdAt: "2026-06-13T00:00:00.000Z",
        invalidated: false,
        metadata: {
          cacheKind: "native-generated-stem",
          sourceHash: "old-signature",
          assetId: "stale",
          assetRelativePath: "project-cache/native-audio/stale.wav",
          role: "drums",
          trackId: "drums"
        }
      },
      {
        id: "bad-path",
        sourceClipId: project.timeline.clips[0].id,
        createdAt: "2026-06-13T00:00:00.000Z",
        invalidated: false,
        metadata: {
          cacheKind: "native-generated-stem",
          sourceHash: nativeRenderCacheSignature(project),
          assetId: "bad-path",
          assetRelativePath: "../bad.wav",
          role: "drums",
          trackId: "drums"
        }
      }
    ];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke() {
        throw new Error("read should not run for stale or invalid paths");
      }
    };

    const result = await hydrateNativeRenderCacheAssets("C:\\Songs\\Song.pocketdaw", project, api);

    expect(result.cache).toBeNull();
    expect(result.staleSourceHashCount).toBe(1);
    expect(result.skippedInvalidPathCount).toBe(1);
    expect(result.hydrationFailureCount).toBe(0);
  });

  it("merges native render-cache items and drops stale native entries without touching other caches", async () => {
    const project = createDemoProject();
    project.renderCache.push(
      { id: "old-native", createdAt: "2026-06-01T00:00:00.000Z", invalidated: false, metadata: { cacheKind: "native-generated-stem", sourceHash: "old" } },
      { id: "manual-cache", createdAt: "2026-06-01T00:00:00.000Z", invalidated: false, metadata: { cacheKind: "manual" } }
    );
    const cache = await buildNativeRenderCache(project, "new-signature");

    const merged = mergeNativeRenderCacheItems(project, cache.renderCacheItems);

    expect(merged.renderCache.some((item) => item.id === "old-native")).toBe(false);
    expect(merged.renderCache.find((item) => item.id === "manual-cache")?.invalidated).toBe(false);
    expect(merged.renderCache.some((item) => item.id === cache.renderCacheItems[0].id)).toBe(true);
  });

  it("sanitizes durable native cache asset paths", () => {
    expect(nativeRenderCacheRelativePath("Native Cache 01")).toBe("project-cache/native-audio/native-cache-01.wav");
    expect(nativeRenderCacheRelativePath("Native Cache 01", "Song A")).toBe("project-cache/native-audio/song-a/native-cache-01.wav");
    expect(nativeRenderCacheRelativePath("../bad")).toBe("project-cache/native-audio/bad.wav");
  });
});

async function waitForAsyncCondition(condition: () => boolean, attempts = 25): Promise<void> {
  for (let index = 0; index < attempts && !condition(); index += 1) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function isSilentCachedSidechainTrigger(event: NativeAudioStartPayload["events"][number]): boolean {
  return event.kind === "kick" && event.velocity === 0 && event.id.endsWith("_cached_sidechain_trigger");
}

function nativeStatus(overrides: Partial<NativeAudioStatus> = {}): NativeAudioStatus {
  return {
    backend: "native-cpal",
    available: true,
    active: true,
    playing: true,
    positionSeconds: 0,
    eventCount: 0,
    sampleRate: 48_000,
    channels: 2,
    renderedFrameCount: 0,
    startedGeneration: 1,
    projectTitle: "Test",
    deviceName: "Default",
    hostName: "wasapi",
    lastError: null,
    ...overrides
  };
}

function withAudioClip(project: ReturnType<typeof createDemoProject>): ReturnType<typeof createDemoProject> {
  const media: MediaPoolItem = {
    id: "media_audio",
    kind: "audio",
    name: "Loop.wav",
    durationSeconds: 1,
    sampleRate: 48_000,
    channels: 2,
    metadata: { mediaRefKind: "project" }
  };
  const clip: Clip = {
    id: "audio_clip",
    type: "audio",
    trackId: "bass",
    startBar: 1,
    barLength: 1,
    name: "Audio Clip",
    muted: false,
    color: "#46d9ff",
    linked: false,
    transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} },
    mediaPoolItemId: media.id,
    metadata: {
      sourceOffsetSeconds: 0.25,
      durationSeconds: 0.5,
      gain: 0.75
    }
  };
  project.mediaPool.push(media);
  project.timeline.clips.push(clip);
  return project;
}

function fakeAudioBuffer(): globalThis.AudioBuffer {
  const sampleRate = 48_000;
  const length = 48_000;
  const channels = [new Float32Array(length), new Float32Array(length)];
  channels[0][0] = 0.5;
  channels[1][0] = -0.5;
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: channels.length,
    getChannelData(index: number) {
      return channels[index] || channels[0];
    }
  } as globalThis.AudioBuffer;
}
