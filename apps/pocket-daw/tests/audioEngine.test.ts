import { describe, expect, it } from "vitest";
import { AudioEngine, calculateLoopSeekSeconds } from "../src/audio/audioEngine";
import { createDemoProject } from "../src/demo/demoProject";
import type { NativeAudioStartPayload, NativeAudioStatus } from "../src/native/audioPlayback";
import { cycleBassStep } from "../src/daw/chordsmithEditor";
import { addTrackToProject } from "../src/daw/tracks";
import { nativeRenderCacheSignature, nativeRuntimeAudioCacheSignature, type NativeRenderCache } from "../src/audio/nativeRenderCache";
import type { PocketDawProject } from "../src/daw/schema";

describe("audio engine diagnostics", () => {
  it("reports event counts without starting playback", () => {
    const engine = new AudioEngine(createDemoProject());
    const diagnostics = engine.getDiagnostics();

    expect(diagnostics.audioContextState).toBe("not-created");
    expect(diagnostics.playbackBackend).toBe("idle");
    expect(diagnostics.nativeAudio.requested).toBe(true);
    expect(diagnostics.schedulerTickCount).toBe(0);
    expect(diagnostics.missedSchedulerTickCount).toBe(0);
    expect(diagnostics.audioGraphReconfigureCount).toBe(0);
    expect(diagnostics.eventCount).toBeGreaterThan(0);
    expect(diagnostics.fxChainCount).toBeGreaterThan(0);
    expect(diagnostics.nativeRenderCache.nativeRenderCacheBypassedForLiveEdits).toBe(false);
    expect(diagnostics.nativeRenderCache.buildCount).toBe(0);
    expect(diagnostics.nativeRenderCache.lastBuildMs).toBe(0);
    expect(diagnostics.nativeRenderCache.lastBuildReason).toBeNull();
    expect(diagnostics.schedulerLookaheadSeconds).toBeGreaterThanOrEqual(0.5);
    expect(diagnostics.schedulerIntervalMs).toBeLessThanOrEqual(40);
    expect(diagnostics.audioDeviceSettings.host).toBe("wasapi");
    expect(diagnostics.eventCountsByTrack).toMatchObject({
      drums: expect.any(Number),
      bass: expect.any(Number),
      chords: expect.any(Number),
      melody: expect.any(Number),
      guitar: expect.any(Number)
    });
    expect(diagnostics.eventCountsByKind.guitar).toBeGreaterThan(0);
  });

  it("calculates clean loop returns at the loop end bar", () => {
    const project = createDemoProject();
    project.timeline.loop = { enabled: true, startBar: 3, endBar: 7 };
    const secondsPerBar = project.project.timeSig * (60 / project.project.bpm);

    expect(calculateLoopSeekSeconds(project, secondsPerBar * 5.9)).toBeNull();
    expect(calculateLoopSeekSeconds(project, secondsPerBar * 6)).toBeCloseTo(secondsPerBar * 2, 5);

    project.timeline.loop.enabled = false;
    expect(calculateLoopSeekSeconds(project, secondsPerBar * 6)).toBeNull();
  });

  it("updates mixer controls without rebuilding timeline diagnostics", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const before = engine.getDiagnostics();

    expect(engine.updateTrackMixerControl("bass", { pan: 2, volume: -1 })).toBe(true);
    const after = engine.getDiagnostics();
    const bass = after.mixerControls.find((track) => track.id === "bass");

    expect(after.eventCount).toBe(before.eventCount);
    expect(after.audioGraphReconfigureCount).toBe(before.audioGraphReconfigureCount);
    expect(after.projectSyncCount).toBe(before.projectSyncCount);
    expect(after.audioRegionCount).toBe(before.audioRegionCount);
    expect(after.eventCountsByTrack).toEqual(before.eventCountsByTrack);
    expect(after.eventCountsByKind).toEqual(before.eventCountsByKind);
    expect(after.projectTitle).toBe("Pocket DAW Demo - Neon Roads");
    expect(after.timelineClipCount).toBe(before.timelineClipCount);
    expect(after.importHistoryCount).toBe(before.importHistoryCount);
    expect(bass).toMatchObject({ volume: 0, pan: 1 });
  });

  it("updates track mute and solo without changing the loaded demo data", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const before = engine.getDiagnostics();

    expect(engine.updateTrackMixerControl("chords", { mute: true })).toBe(true);
    expect(engine.updateTrackMixerControl("bass", { solo: true })).toBe(true);
    const after = engine.getDiagnostics();
    const chords = after.mixerControls.find((track) => track.id === "chords");
    const bass = after.mixerControls.find((track) => track.id === "bass");

    expect(after.eventCount).toBe(before.eventCount);
    expect(after.audioRegionCount).toBe(before.audioRegionCount);
    expect(after.eventCountsByTrack).toEqual(before.eventCountsByTrack);
    expect(after.eventCountsByKind).toEqual(before.eventCountsByKind);
    expect(after.projectTitle).toBe("Pocket DAW Demo - Neon Roads");
    expect(after.timelineClipCount).toBe(before.timelineClipCount);
    expect(after.importHistoryCount).toBe(before.importHistoryCount);
    expect(after.sourceRefCount).toBe(before.sourceRefCount);
    expect(after.sourceRefTitles).toEqual(before.sourceRefTitles);
    expect(after.chordsmithSectionCount).toBe(before.chordsmithSectionCount);
    expect(chords).toMatchObject({ mute: true, solo: false });
    expect(bass).toMatchObject({ mute: false, solo: true });
  });

  it("preserves generated native cache across live mixer graph track additions", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const cache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [],
      regions: [{ id: "clip_001_bass", assetId: "asset_bass", trackId: "bass", startTime: 0, sourceOffset: 0, duration: 4, gain: 1, pan: 0, fadeIn: 0, fadeOut: 0 }],
      cachedClipIds: new Set(["clip_001"]),
      renderCacheItems: [generatedStemCacheItem("clip_001", "bass", "bass", "asset_bass")],
      renderCacheHitCount: 0,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 1,
      runtimeAudioRegionCount: 0,
      missingRuntimeAudioRegionCount: 0,
      cachedAssetByteCount: 128
    };
    (engine as unknown as { nativeRenderCache: NativeRenderCache }).nativeRenderCache = cache;

    const withLiveTrack = addTrackToProject(project, "live-vocals").project;
    engine.syncProject(withLiveTrack, "mixer-graph", "add-track");

    const diagnostics = engine.getDiagnostics();
    expect(diagnostics.nativeRenderCache.generatedRegionCount).toBe(1);
    expect(diagnostics.nativeRenderCache.proceduralFallbackEventCount).toBe(0);
    expect(diagnostics.eventCountsByTrack.guitar).toBeGreaterThan(0);
  });

  it("does not suppress generated events with runtime-only native cache coverage", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const internals = engine as unknown as {
      events: NativeAudioStartPayload["events"];
      nativePlaybackEvents(cache: NativeRenderCache | null): { events: NativeAudioStartPayload["events"]; proceduralFallbackEventCount: number };
    };
    const firstGeneratedClip = project.timeline.clips.find((clip) => clip.type === "generated-section");
    expect(firstGeneratedClip).toBeTruthy();
    const runtimeOnlyCache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [{
        id: "runtime_audio_asset",
        name: "Runtime audio only",
        sampleRate: project.project.sampleRate,
        channels: 2,
        durationSeconds: 1,
        sizeBytes: 1,
        bytes: [0]
      }],
      regions: [{
        id: "runtime_audio_region",
        assetId: "runtime_audio_asset",
        trackId: "bass",
        startTime: 0,
        sourceOffset: 0,
        duration: 1,
        gain: 1,
        pan: 0,
        fadeIn: 0,
        fadeOut: 0
      }],
      cachedClipIds: new Set([firstGeneratedClip!.id]),
      renderCacheItems: [{
        id: "runtime_audio_item",
        sourceClipId: firstGeneratedClip!.id,
        mediaPoolItemId: "media_audio",
        createdAt: "2026-01-01T00:00:00.000Z",
        invalidated: false,
        metadata: {
          cacheKind: "native-runtime-audio",
          assetId: "runtime_audio_asset"
        }
      }],
      renderCacheHitCount: 1,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 0,
      runtimeAudioRegionCount: 1,
      missingRuntimeAudioRegionCount: 0,
      cachedAssetByteCount: 1
    };

    const playback = internals.nativePlaybackEvents(runtimeOnlyCache);

    expect(playback.proceduralFallbackEventCount).toBe(internals.events.length);
    expect(playback.events.some((event) => event.trackId === "bass" && event.velocity > 0)).toBe(true);
  });

  it("reports runtime audio coverage from merged native playback caches", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const base = runtimeOnlyNativeCache(project, nativeRenderCacheSignature(project), "audio_clip_a", "asset_a", {
      runtimeAudioRegionCount: 1,
      missingRuntimeAudioRegionCount: 1
    });
    const runtime = runtimeOnlyNativeCache(project, nativeRuntimeAudioCacheSignature(project), "audio_clip_b", "asset_b", {
      runtimeAudioRegionCount: 1,
      missingRuntimeAudioRegionCount: 1
    });
    const internals = engine as unknown as {
      audioRegions: unknown[];
      nativeRenderCache: NativeRenderCache;
      nativeRuntimeAudioCache: NativeRenderCache;
    };
    internals.audioRegions = [{ id: "audio_clip_a" }, { id: "audio_clip_b" }];
    internals.nativeRenderCache = base;
    internals.nativeRuntimeAudioCache = runtime;

    const diagnostics = engine.getDiagnostics();

    expect(diagnostics.nativeRenderCache.assetRegionCount).toBe(2);
    expect(diagnostics.nativeRenderCache.runtimeAudioRegionCount).toBe(2);
    expect(diagnostics.nativeRenderCache.missingRuntimeAudioRegionCount).toBe(0);
  });

  it("does not suppress generated events when generated cache metadata has no playable region", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const internals = engine as unknown as {
      events: NativeAudioStartPayload["events"];
      nativePlaybackEvents(cache: NativeRenderCache | null): { events: NativeAudioStartPayload["events"]; proceduralFallbackEventCount: number };
    };
    const firstGeneratedClip = project.timeline.clips.find((clip) => clip.type === "generated-section");
    expect(firstGeneratedClip).toBeTruthy();
    const metadataOnlyCache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [],
      regions: [],
      cachedClipIds: new Set([firstGeneratedClip!.id]),
      renderCacheItems: [generatedStemCacheItem(firstGeneratedClip!.id, "bass", "bass", "missing_bass_asset")],
      renderCacheHitCount: 1,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 0,
      runtimeAudioRegionCount: 0,
      missingRuntimeAudioRegionCount: 0,
      cachedAssetByteCount: 0
    };

    const playback = internals.nativePlaybackEvents(metadataOnlyCache);

    expect(playback.proceduralFallbackEventCount).toBe(internals.events.length);
    expect(playback.events.some((event) => event.trackId === "bass" && event.velocity > 0)).toBe(true);
  });

  it("does not treat lofi texture ticks as drum meter hits", () => {
    const engine = new AudioEngine(createDemoProject());
    const baseEvent = {
      id: "meter-test",
      clipId: "clip-test",
      trackId: "drums",
      role: "drums",
      time: 0,
      duration: 0.1,
      bar: 1,
      step: 0,
      velocity: 1,
      midiNotes: []
    };

    (engine as any).lastMeterRead = performance.now() / 1000;
    (engine as any).events = [{ ...baseEvent, kind: "texture" }];
    (engine as any).primeMeters(0);
    expect(engine.getMeterLevels().drums || 0).toBe(0);

    (engine as any).lastMeterRead = performance.now() / 1000;
    (engine as any).events = [{ ...baseEvent, kind: "kick" }];
    (engine as any).primeMeters(0);
    expect(engine.getMeterLevels().drums || 0).toBeGreaterThan(0.5);
  });

  it("keeps meters active for native runtime audio regions without WebAudio analysers", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const cache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [],
      regions: [{ id: "clip_001_bass", assetId: "asset_bass", trackId: "bass", startTime: 0, sourceOffset: 0, duration: 4, gain: 0.8, pan: 0, fadeIn: 0, fadeOut: 0 }],
      cachedClipIds: new Set(["clip_001"]),
      renderCacheItems: [{
        id: "asset_bass",
        sourceClipId: "clip_001",
        createdAt: new Date().toISOString(),
        invalidated: false,
        metadata: {
          cacheKind: "native-runtime-audio",
          assetId: "asset_bass"
        }
      }],
      renderCacheHitCount: 0,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 0,
      runtimeAudioRegionCount: 1,
      missingRuntimeAudioRegionCount: 0,
      cachedAssetByteCount: 128
    };
    const internals = engine as unknown as { nativeRenderCache: NativeRenderCache; playbackBackend: string; playing: boolean; lastMeterRead: number; tapNativeRegionMeters(current: number): void };
    internals.nativeRenderCache = cache;
    internals.playbackBackend = "native-cpal";
    internals.playing = true;
    internals.lastMeterRead = performance.now() / 1000;

    internals.tapNativeRegionMeters(1);
    const levels = engine.getMeterLevels();

    expect(levels.bass || 0).toBeGreaterThan(0.2);
    expect(levels.master || 0).toBeGreaterThan(0.18);
  });

  it("meters cached native generated stems from the underlying musical events", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const cache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [],
      regions: [{ id: "clip_001_bass", assetId: "asset_bass", trackId: "bass", startTime: 0, sourceOffset: 0, duration: 4, gain: 0.8, pan: 0, fadeIn: 0, fadeOut: 0 }],
      cachedClipIds: new Set(["clip_001"]),
      renderCacheItems: [{
        id: "asset_bass",
        sourceClipId: "clip_001",
        createdAt: new Date().toISOString(),
        invalidated: false,
        metadata: {
          cacheKind: "native-generated-stem",
          trackId: "bass",
          assetId: "asset_bass"
        }
      }],
      renderCacheHitCount: 0,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 1,
      runtimeAudioRegionCount: 0,
      missingRuntimeAudioRegionCount: 0,
      cachedAssetByteCount: 128
    };
    const internals = engine as unknown as {
      nativeRenderCache: NativeRenderCache;
      nativePlaybackStartedWithRenderCache: boolean;
      playbackBackend: string;
      playing: boolean;
      lastMeterRead: number;
      events: Array<Record<string, unknown>>;
      tapNativeMeters(current: number): void;
      tapNativeRegionMeters(current: number): void;
    };
    internals.nativeRenderCache = cache;
    internals.nativePlaybackStartedWithRenderCache = true;
    internals.playbackBackend = "native-cpal";
    internals.playing = true;
    internals.events = [{
      id: "cached-bass-note",
      clipId: "clip_001",
      trackId: "bass",
      kind: "bass",
      time: 1,
      duration: 0.25,
      velocity: 1,
      midiNotes: []
    }];
    internals.lastMeterRead = performance.now() / 1000;

    internals.tapNativeMeters(1);
    internals.tapNativeRegionMeters(1);
    internals.lastMeterRead = performance.now() / 1000;
    const levels = engine.getMeterLevels();

    expect(levels.bass || 0).toBeGreaterThan(0.8);
    expect(levels.master || 0).toBeGreaterThan(0.7);
  });

  it("does not show continuous region meters for cached native generated stems", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const cache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [],
      regions: [{ id: "clip_001_bass", assetId: "asset_bass", trackId: "bass", startTime: 0, sourceOffset: 0, duration: 4, gain: 0.8, pan: 0, fadeIn: 0, fadeOut: 0 }],
      cachedClipIds: new Set(["clip_001"]),
      renderCacheItems: [{
        id: "asset_bass",
        sourceClipId: "clip_001",
        createdAt: new Date().toISOString(),
        invalidated: false,
        metadata: {
          cacheKind: "native-generated-stem",
          trackId: "bass",
          assetId: "asset_bass"
        }
      }],
      renderCacheHitCount: 0,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 1,
      runtimeAudioRegionCount: 0,
      missingRuntimeAudioRegionCount: 0,
      cachedAssetByteCount: 128
    };
    const internals = engine as unknown as {
      nativeRenderCache: NativeRenderCache;
      playbackBackend: string;
      playing: boolean;
      lastMeterRead: number;
      tapNativeRegionMeters(current: number): void;
    };
    internals.nativeRenderCache = cache;
    internals.playbackBackend = "native-cpal";
    internals.playing = true;
    internals.lastMeterRead = performance.now() / 1000;

    internals.tapNativeRegionMeters(1);
    const levels = engine.getMeterLevels();

    expect(levels.bass || 0).toBe(0);
    expect(levels.master || 0).toBe(0);
  });

  it("resumes paused native playback without sending a second native start", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    const calls: string[] = [];
    const native = {
      async start() {
        calls.push("start");
        return { started: true, status: nativeStatus({ playing: true, positionSeconds: 0 }), error: null };
      },
      async pause() {
        calls.push("pause");
        return nativeStatus({ active: true, playing: false, positionSeconds: 3.25 });
      },
      async resume() {
        calls.push("resume");
        return nativeStatus({ active: true, playing: true, positionSeconds: 3.25 });
      },
      async stop() {
        calls.push("stop");
        return nativeStatus({ active: false, playing: false });
      },
      async seek() {
        calls.push("seek");
        return nativeStatus({ active: true, playing: false });
      },
      async updateTrack() {
        calls.push("updateTrack");
        return nativeStatus({ active: true, playing: false });
      },
      async status() {
        return nativeStatus({ active: true, playing: false });
      }
    };

    try {
      const engine = new AudioEngine(createDemoProject(), native);

      await engine.play();
      engine.pause();
      await Promise.resolve();
      expect(engine.canResumePausedNativePlayback()).toBe(true);
      await engine.play();
      engine.stop();

      expect(calls.filter((call) => call === "start")).toHaveLength(1);
      expect(calls).toContain("pause");
      expect(calls).toContain("resume");
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("does not fall back to WebAudio when native playback start fails", async () => {
    const native = {
      async start() {
        return { started: false, status: null, error: "Native output device failed." };
      },
      async pause() { return nativeStatus({ active: true, playing: false }); },
      async resume() { return nativeStatus({ active: true, playing: true }); },
      async stop() { return nativeStatus({ active: false, playing: false }); },
      async seek(seconds: number) { return nativeStatus({ active: true, positionSeconds: seconds }); },
      async updateTrack() { return nativeStatus({ active: true }); },
      async status() { return nativeStatus({ active: true }); }
    };
    const engine = new AudioEngine(createDemoProject(), native);

    await expect(engine.play()).resolves.toBeUndefined();
    const diagnostics = engine.getDiagnostics();

    expect(engine.isPlaying()).toBe(false);
    expect(diagnostics.playbackBackend).toBe("idle");
    expect(diagnostics.nativeAudio.lastError).toBe("Native output device failed.");
    expect(diagnostics.nativeAudio.fallback).toBeNull();
    expect(diagnostics.audioContextState).toBe("not-created");
  });

  it("does not fall back to WebAudio in the installed app when native playback is unavailable", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      __TAURI__: {},
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    const native = {
      async start() {
        return { started: false, status: null, error: "Native Tauri audio runtime is unavailable.", unavailable: true };
      },
      async pause() { return nativeStatus({ active: true, playing: false }); },
      async resume() { return nativeStatus({ active: true, playing: true }); },
      async stop() { return nativeStatus({ active: false, playing: false }); },
      async seek(seconds: number) { return nativeStatus({ active: true, positionSeconds: seconds }); },
      async updateTrack() { return nativeStatus({ active: true }); },
      async status() { return nativeStatus({ active: true }); }
    };

    try {
      const engine = new AudioEngine(createDemoProject(), native);

      await expect(engine.play()).resolves.toBeUndefined();
      const diagnostics = engine.getDiagnostics();

      expect(engine.isPlaying()).toBe(false);
      expect(diagnostics.playbackBackend).toBe("idle");
      expect(diagnostics.nativeAudio.lastError).toBe("Native Tauri audio runtime is unavailable.");
      expect(diagnostics.nativeAudio.fallback).toBeNull();
      expect(diagnostics.audioContextState).toBe("not-created");
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("refreshes cold native fallback playback back to cached stems", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      __TAURI__: {},
      setInterval: () => 1,
      clearInterval: () => undefined,
      setTimeout: (callback: () => void) => {
        queueMicrotask(callback);
        return 1;
      },
      clearTimeout: () => undefined
    };
    const starts: NativeAudioStartPayload[] = [];
    const native = {
      async start(payload: NativeAudioStartPayload) {
        starts.push(payload);
        return {
          started: true,
          status: nativeStatus({
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
      const internals = engine as unknown as {
        nativeRenderCache: NativeRenderCache | null;
        nativeRenderCacheBuildCount: number;
        nativeRenderCacheLastBuildReason: string | null;
        nativeRenderCacheError: string | null;
        ensureNativeRenderCache(reason: string): Promise<NativeRenderCache | null>;
      };
      internals.ensureNativeRenderCache = async (reason: string) => {
        internals.nativeRenderCacheBuildCount += 1;
        internals.nativeRenderCacheLastBuildReason = reason;
        internals.nativeRenderCacheError = null;
        const cache = fakeNativeRenderCache(project);
        internals.nativeRenderCache = cache;
        return cache;
      };

      await engine.play();

      expect(starts).toHaveLength(1);
      expect(starts[0].events.length).toBeGreaterThan(0);
      expect(starts[0].assets?.length || 0).toBe(0);
      expect(starts[0].regions?.length || 0).toBe(0);

      await waitForAsyncCondition(() => starts.length >= 2 && engine.getDiagnostics().nativeRenderCache.buildCount >= 1);

      expect(starts).toHaveLength(2);
      expect(starts[1].assets?.length || 0).toBeGreaterThan(0);
      expect(starts[1].regions?.length || 0).toBeGreaterThan(0);
      expect(starts[1].events.every(isSilentCachedSidechainTrigger)).toBe(true);
      expect(engine.getDiagnostics().nativeRenderCache.lastBuildReason).toBe("play-fallback-cache-build");
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("coalesces rapid native composition edits into latest live playback restarts", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    const starts: NativeAudioStartPayload[] = [];
    const native = {
      async start(payload: NativeAudioStartPayload) {
        starts.push(payload);
        return {
          started: true,
          status: nativeStatus({ playing: true, positionSeconds: payload.startSeconds, eventCount: payload.events.length }),
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
      const internals = engine as unknown as {
        nativeRenderCache: NativeRenderCache | null;
      };
      internals.nativeRenderCache = fakeNativeRenderCache(project);

      await engine.play();
      const editA = cycleBassStep(project, "A", 0);
      const editB = cycleBassStep(editA, "A", 1);
      const editC = cycleBassStep(editB, "A", 2);

      engine.syncProject(editA, "composition-events", "bass-edit-a");
      engine.syncProject(editB, "composition-events", "bass-edit-b");
      engine.syncProject(editC, "composition-events", "bass-edit-c");

      await waitForAsyncCondition(() => starts.length >= 2);

      expect(starts.length).toBeGreaterThanOrEqual(2);
      expect(starts.length).toBeLessThanOrEqual(4);
      const restartStarts = starts.slice(1);
      expect(restartStarts.every((start) => start.events.length > 0)).toBe(true);
      expect(starts.at(-1)!.events.every(isSilentCachedSidechainTrigger)).toBe(false);
      expect(engine.getDiagnostics().lastProjectSyncReason).toBe("bass-edit-c");
      expect(engine.getDiagnostics().nativeRenderCache.pendingReason).toBe("bass-edit-c");
      expect(engine.getDiagnostics().nativeRenderCache.buildCount).toBe(0);
      expect(engine.getDiagnostics().nativeRenderCache.nativeRenderCacheBypassedForLiveEdits).toBe(false);
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("keeps native event playback active when live edit cache rebuilds are deferred", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    const starts: NativeAudioStartPayload[] = [];
    const native = {
      async start(payload: NativeAudioStartPayload) {
        starts.push(payload);
        return {
          started: true,
          status: nativeStatus({ playing: true, positionSeconds: payload.startSeconds, eventCount: payload.events.length }),
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
      const internals = engine as unknown as {
        nativeRenderCache: NativeRenderCache | null;
      };
      internals.nativeRenderCache = fakeNativeRenderCache(project);

      await engine.play();
      expect(starts).toHaveLength(1);
      expect(starts[0].events.length).toBeGreaterThan(0);
      expect(starts[0].events.every(isSilentCachedSidechainTrigger)).toBe(true);

      engine.syncProject(cycleBassStep(project, "A", 0), "composition-events", "bass-edit-discarded");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const diagnostics = engine.getDiagnostics();
      expect(starts).toHaveLength(2);
      expect(starts.at(-1)!.events.length).toBeGreaterThan(0);
      expect(starts.at(-1)!.events.every(isSilentCachedSidechainTrigger)).toBe(false);
      expect(starts.at(-1)!.regions?.length || 0).toBe(0);
      expect(diagnostics.nativeRenderCache.assetRegionCount).toBe(0);
      expect(diagnostics.nativeRenderCache.pendingReason).toBe("bass-edit-discarded");
      expect(diagnostics.nativeRenderCache.buildCount).toBe(0);
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("refreshes live native composition edits back to cached playback", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      setInterval: () => 1,
      clearInterval: () => undefined,
      setTimeout: (callback: () => void) => {
        queueMicrotask(callback);
        return 1;
      },
      clearTimeout: () => undefined
    };
    const starts: NativeAudioStartPayload[] = [];
    const native = {
      async start(payload: NativeAudioStartPayload) {
        starts.push(payload);
        return {
          started: true,
          status: nativeStatus({
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
      const edited = cycleBassStep(project, "A", 0);
      const engine = new AudioEngine(project, native);
      const internals = engine as unknown as {
        nativeRenderCache: NativeRenderCache | null;
        nativeRenderCacheBuildCount: number;
        nativeRenderCacheLastBuildReason: string | null;
        ensureNativeRenderCache(reason: string): Promise<NativeRenderCache | null>;
      };
      internals.nativeRenderCache = fakeNativeRenderCache(project);
      internals.ensureNativeRenderCache = async (reason: string) => {
        internals.nativeRenderCacheBuildCount += 1;
        internals.nativeRenderCacheLastBuildReason = reason;
        internals.nativeRenderCache = fakeNativeRenderCache(edited);
        return internals.nativeRenderCache;
      };

      await engine.play();
      engine.syncProject(edited, "composition-events", "bass-edit-refresh");
      await waitForAsyncCondition(() => starts.length >= 3);

      expect(starts.length).toBeGreaterThanOrEqual(3);
      const staleStart = starts.at(-2)!;
      const refreshedStart = starts.at(-1)!;

      expect(staleStart.events.some((event) => event.trackId === "bass" && event.velocity > 0)).toBe(true);
      expect(refreshedStart.regions?.length || 0).toBeGreaterThan(0);
      expect(refreshedStart.events.every(isSilentCachedSidechainTrigger)).toBe(true);
      expect(engine.getDiagnostics().nativeRenderCache.buildCount).toBe(1);
      expect(engine.getDiagnostics().nativeRenderCache.lastBuildReason).toBe("bass-edit-refresh");
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("corrects native playhead estimates from backend status", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = {
      setInterval: () => 1,
      clearInterval: () => undefined
    };
    let statusCalls = 0;
    const native = {
      async start(payload: { startSeconds: number; events: unknown[] }) {
        return {
          started: true,
          status: nativeStatus({ playing: true, positionSeconds: payload.startSeconds, eventCount: payload.events.length }),
          error: null
        };
      },
      async pause() { return nativeStatus({ active: true, playing: false }); },
      async resume() { return nativeStatus({ active: true, playing: true }); },
      async stop() { return nativeStatus({ active: false, playing: false }); },
      async seek(seconds: number) { return nativeStatus({ active: true, positionSeconds: seconds }); },
      async updateTrack() { return nativeStatus({ active: true }); },
      async status() {
        statusCalls += 1;
        return nativeStatus({ active: true, playing: true, positionSeconds: 8.25 });
      }
    };

    try {
      const engine = new AudioEngine(createDemoProject(), native);

      await engine.play();
      (engine as any).nativeStartedAtMs = performance.now() - 2_000;
      (engine as any).nativeLastStatusRefreshAtMs = 0;
      (engine as any).tickNativePlayback();
      await waitForAsyncCondition(() => statusCalls > 0 && Math.abs((engine as any).offsetSeconds - 8.25) < 0.001);

      expect(statusCalls).toBeGreaterThan(0);
      expect((engine as any).offsetSeconds).toBeCloseTo(8.25, 3);
      expect((engine as any).nativeStatus?.positionSeconds).toBe(8.25);
      engine.stop();
    } finally {
      (globalThis as any).window = previousWindow;
    }
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

function fakeNativeRenderCache(project: PocketDawProject): NativeRenderCache {
  const signature = nativeRenderCacheSignature(project);
  const generatedClips = project.timeline.clips.filter((clip) => clip.type === "generated-section" && !clip.muted);
  const generatedTracks = project.tracks.filter((track) => ["drums", "bass", "chords", "melody", "guitar"].includes(track.role) && track.active !== false);
  const assets = generatedClips.flatMap((clip) => generatedTracks.map((track) => {
    const assetId = `asset_${clip.id}_${track.id}_${signature.slice(0, 8)}`;
    return {
      id: assetId,
      name: `Test cached ${clip.id} ${track.id}`,
      sampleRate: project.project.sampleRate,
      channels: 2,
      durationSeconds: 1,
      sizeBytes: 1,
      bytes: [0]
    };
  }));
  const regions = generatedClips.flatMap((clip) => generatedTracks.map((track) => {
    const assetId = `asset_${clip.id}_${track.id}_${signature.slice(0, 8)}`;
    return {
      id: `region_${clip.id}_${track.id}_${signature.slice(0, 8)}`,
      assetId,
      trackId: track.id,
      startTime: 0,
      sourceOffset: 0,
      duration: 1,
      gain: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0
    };
  }));
  const renderCacheItems = generatedClips.flatMap((clip) => generatedTracks.map((track) =>
    generatedStemCacheItem(clip.id, track.role, track.id, `asset_${clip.id}_${track.id}_${signature.slice(0, 8)}`)
  ));
  return {
    signature,
    assets,
    regions,
    cachedClipIds: new Set(generatedClips.map((clip) => clip.id)),
    renderCacheItems,
    renderCacheHitCount: 0,
    renderCacheMissCount: 0,
    proceduralFallbackEventCount: 0,
    generatedRegionCount: regions.length,
    runtimeAudioRegionCount: 0,
    missingRuntimeAudioRegionCount: 0,
    cachedAssetByteCount: assets.length
  };
}

function runtimeOnlyNativeCache(
  project: PocketDawProject,
  signature: string,
  clipId: string,
  assetId: string,
  stats: Pick<NativeRenderCache, "runtimeAudioRegionCount" | "missingRuntimeAudioRegionCount">
): NativeRenderCache {
  return {
    signature,
    assets: [{
      id: assetId,
      name: `${clipId} runtime audio`,
      sampleRate: project.project.sampleRate,
      channels: 2,
      durationSeconds: 1,
      sizeBytes: 1,
      bytes: [0]
    }],
    regions: [{
      id: `${clipId}_bass_media_audio`,
      assetId,
      trackId: "bass",
      startTime: 0,
      sourceOffset: 0,
      duration: 1,
      gain: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0
    }],
    cachedClipIds: new Set([clipId]),
    renderCacheItems: [runtimeAudioCacheItem(clipId, assetId)],
    renderCacheHitCount: 0,
    renderCacheMissCount: 0,
    proceduralFallbackEventCount: 0,
    generatedRegionCount: 0,
    runtimeAudioRegionCount: stats.runtimeAudioRegionCount,
    missingRuntimeAudioRegionCount: stats.missingRuntimeAudioRegionCount,
    cachedAssetByteCount: 1
  };
}

function runtimeAudioCacheItem(clipId: string, assetId: string) {
  return {
    id: assetId,
    sourceClipId: clipId,
    mediaPoolItemId: "media_audio",
    createdAt: "2026-01-01T00:00:00.000Z",
    invalidated: false,
    metadata: {
      cacheKind: "native-runtime-audio",
      assetId
    }
  };
}

function generatedStemCacheItem(clipId: string, role: string, trackId: string, assetId: string) {
  return {
    id: assetId,
    sourceClipId: clipId,
    createdAt: "2026-01-01T00:00:00.000Z",
    invalidated: false,
    metadata: {
      cacheKind: "native-generated-stem",
      role,
      trackId,
      assetId
    }
  };
}

function nativeStatus(overrides: Partial<NativeAudioStatus> = {}): NativeAudioStatus {
  return {
    backend: "native-cpal",
    available: true,
    active: true,
    playing: true,
    positionSeconds: 0,
    eventCount: 0,
    sampleRate: 48000,
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
