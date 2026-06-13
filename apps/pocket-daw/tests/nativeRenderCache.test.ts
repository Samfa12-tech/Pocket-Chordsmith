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

vi.mock("../src/audio/offlineRender", () => offlineRenderMock);

import { AudioEngine } from "../src/audio/audioEngine";
import { clearAudioBufferCache, setCachedAudioBuffer } from "../src/audio/audioBufferCache";
import {
  buildNativeRenderCache,
  buildNativeRuntimeAudioCache,
  hydrateNativeRenderCacheAssets,
  mergeNativeRenderCacheItems,
  nativeRenderCacheRelativePath,
  nativeRenderCacheSignature,
  nativeRuntimeAudioCacheSignature,
  persistNativeRenderCacheAssets
} from "../src/audio/nativeRenderCache";
import { createDemoProject } from "../src/demo/demoProject";
import type { Clip, MediaPoolItem } from "../src/daw/schema";
import type { NativeMediaApi } from "../src/native/mediaBridge";

describe("native render cache", () => {
  beforeEach(() => {
    clearAudioBufferCache();
    offlineRenderMock.renderProjectToWavBlob.mockClear();
    offlineRenderMock.encodeWav.mockClear();
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
    expect(offlineRenderMock.renderProjectToWavBlob).toHaveBeenCalled();
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
        return {
          assetId: String(args?.assetId || ""),
          path: `C:\\Songs\\${String(args?.relativePath || "").replace(/\//g, "\\")}`,
          relativePath: String(args?.relativePath || ""),
          sizeBytes: Array.isArray(args?.bytes) ? args.bytes.length : 0
        } as never;
      }
    };

    const result = await persistNativeRenderCacheAssets("C:\\Songs\\Song.pocketdaw", cache, api);

    expect(result.writtenAssetCount).toBe(cache.assets.length);
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

  it("merges native render-cache items and invalidates stale native entries without touching other caches", async () => {
    const project = createDemoProject();
    project.renderCache.push(
      { id: "old-native", createdAt: "2026-06-01T00:00:00.000Z", invalidated: false, metadata: { cacheKind: "native-generated-stem", sourceHash: "old" } },
      { id: "manual-cache", createdAt: "2026-06-01T00:00:00.000Z", invalidated: false, metadata: { cacheKind: "manual" } }
    );
    const cache = await buildNativeRenderCache(project, "new-signature");

    const merged = mergeNativeRenderCacheItems(project, cache.renderCacheItems);

    expect(merged.renderCache.find((item) => item.id === "old-native")?.invalidated).toBe(true);
    expect(merged.renderCache.find((item) => item.id === "manual-cache")?.invalidated).toBe(false);
    expect(merged.renderCache.some((item) => item.id === cache.renderCacheItems[0].id)).toBe(true);
  });

  it("sanitizes durable native cache asset paths", () => {
    expect(nativeRenderCacheRelativePath("Native Cache 01")).toBe("project-cache/native-audio/native-cache-01.wav");
    expect(nativeRenderCacheRelativePath("../bad")).toBe("project-cache/native-audio/bad.wav");
  });
});

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
