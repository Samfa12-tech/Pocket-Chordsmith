import { describe, expect, it } from "vitest";
import { AudioEngine, calculateLoopSeekSeconds } from "../src/audio/audioEngine";
import { createDemoProject } from "../src/demo/demoProject";
import type { NativeAudioStartPayload, NativeAudioStatus } from "../src/native/audioPlayback";
import { cycleBassStep } from "../src/daw/chordsmithEditor";
import { addTrackToProject } from "../src/daw/tracks";
import { nativeRenderCacheSignature, type NativeRenderCache } from "../src/audio/nativeRenderCache";
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
      renderCacheItems: [],
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

  it("keeps meters active for native cached regions without WebAudio analysers", () => {
    const project = createDemoProject();
    const engine = new AudioEngine(project);
    const cache: NativeRenderCache = {
      signature: nativeRenderCacheSignature(project),
      assets: [],
      regions: [{ id: "clip_001_bass", assetId: "asset_bass", trackId: "bass", startTime: 0, sourceOffset: 0, duration: 4, gain: 0.8, pan: 0, fadeIn: 0, fadeOut: 0 }],
      cachedClipIds: new Set(["clip_001"]),
      renderCacheItems: [],
      renderCacheHitCount: 0,
      renderCacheMissCount: 0,
      proceduralFallbackEventCount: 0,
      generatedRegionCount: 1,
      runtimeAudioRegionCount: 0,
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

  it("does not double-tap procedural meters for cached native events", () => {
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
    const levels = engine.getMeterLevels();

    expect(levels.bass || 0).toBeGreaterThan(0.2);
    expect(levels.bass || 0).toBeLessThan(0.6);
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

  it("hands native fallback playback over to cache when the cache build completes", async () => {
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
      let resolveCacheBuild: (cache: NativeRenderCache | null) => void = () => undefined;
      const cacheBuild = new Promise<NativeRenderCache | null>((resolve) => {
        resolveCacheBuild = resolve;
      });
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
        const cache = await cacheBuild;
        internals.nativeRenderCache = cache;
        return cache;
      };

      await engine.play();

      expect(starts).toHaveLength(1);
      expect(starts[0].events.length).toBeGreaterThan(0);
      expect(starts[0].assets?.length || 0).toBe(0);
      expect(starts[0].regions?.length || 0).toBe(0);

      resolveCacheBuild(fakeNativeRenderCache(project));
      await waitForAsyncCondition(() => starts.length >= 2);

      const cachedStart = starts.at(-1)!;
      expect(starts).toHaveLength(2);
      expect(cachedStart.assets?.length || 0).toBeGreaterThan(0);
      expect(cachedStart.regions?.length || 0).toBeGreaterThan(0);
      expect(cachedStart.events.length).toBeGreaterThan(0);
      expect(cachedStart.events.every(isSilentCachedSidechainTrigger)).toBe(true);
      expect(engine.getDiagnostics().nativeRenderCache.proceduralFallbackEventCount).toBe(0);
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
        nativeRenderCacheBuildCount: number;
        nativeRenderCacheLastBuildReason: string | null;
        nativeRenderCacheError: string | null;
        project: PocketDawProject;
        ensureNativeRenderCache(reason: string): Promise<NativeRenderCache | null>;
      };
      internals.nativeRenderCache = fakeNativeRenderCache(project);
      internals.ensureNativeRenderCache = async (reason: string) => {
        await Promise.resolve();
        const cache = fakeNativeRenderCache(internals.project);
        internals.nativeRenderCache = cache;
        internals.nativeRenderCacheBuildCount += 1;
        internals.nativeRenderCacheLastBuildReason = reason;
        internals.nativeRenderCacheError = null;
        return cache;
      };

      await engine.play();
      const editA = cycleBassStep(project, "A", 0);
      const editB = cycleBassStep(editA, "A", 1);
      const editC = cycleBassStep(editB, "A", 2);

      engine.syncProject(editA, "composition-events", "bass-edit-a");
      engine.syncProject(editB, "composition-events", "bass-edit-b");
      engine.syncProject(editC, "composition-events", "bass-edit-c");

      await waitForAsyncCondition(() => starts.length >= 2);
      await waitForAsyncCondition(() => engine.getDiagnostics().nativeRenderCache.buildCount >= 2);
      await waitForAsyncCondition(() => starts.at(-1)!.events.every(isSilentCachedSidechainTrigger));

      expect(starts.length).toBeGreaterThanOrEqual(2);
      expect(starts.length).toBeLessThanOrEqual(3);
      const restartStarts = starts.slice(1);
      expect(restartStarts.every((start) => start.events.length > 0)).toBe(true);
      expect(starts.at(-1)!.events.every(isSilentCachedSidechainTrigger)).toBe(true);
      expect(starts.at(-1)!.regions?.length || 0).toBeGreaterThan(0);
      expect(engine.getDiagnostics().lastProjectSyncReason).toBe("bass-edit-c");
      expect(engine.getDiagnostics().nativeRenderCache.lastBuildReason).toBe("bass-edit-c");
      expect(engine.getDiagnostics().nativeRenderCache.nativeRenderCacheBypassedForLiveEdits).toBe(false);
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it("keeps stale native cache active when live edit cache builds are discarded", async () => {
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
        nativeRenderCacheBuildCount: number;
        nativeRenderCacheDiscardedBuildCount: number;
        nativeRenderCacheLastBuildReason: string | null;
        ensureNativeRenderCache(reason: string): Promise<NativeRenderCache | null>;
      };
      internals.nativeRenderCache = fakeNativeRenderCache(project);
      internals.ensureNativeRenderCache = async (reason: string) => {
        await Promise.resolve();
        internals.nativeRenderCacheBuildCount += 1;
        internals.nativeRenderCacheDiscardedBuildCount += 1;
        internals.nativeRenderCacheLastBuildReason = reason;
        return null;
      };

      await engine.play();
      expect(starts).toHaveLength(1);
      expect(starts[0].events.length).toBeGreaterThan(0);
      expect(starts[0].events.every(isSilentCachedSidechainTrigger)).toBe(true);

      engine.syncProject(cycleBassStep(project, "A", 0), "composition-events", "bass-edit-discarded");
      await waitForAsyncCondition(() => engine.getDiagnostics().nativeRenderCache.buildCount >= 1);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const diagnostics = engine.getDiagnostics();
      expect(starts).toHaveLength(2);
      expect(starts.at(-1)!.events.length).toBeGreaterThan(0);
      expect(starts.at(-1)!.events.every(isSilentCachedSidechainTrigger)).toBe(false);
      expect(starts.at(-1)!.regions?.length || 0).toBe(0);
      expect(diagnostics.nativeRenderCache.assetRegionCount).toBe(0);
      expect(diagnostics.nativeRenderCache.discardedBuildCount).toBe(1);
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
      await waitForAsyncCondition(() => statusCalls > 0 && Math.abs(engine.currentSeconds() - 8.25) < 0.2);

      expect(statusCalls).toBeGreaterThan(0);
      expect(engine.currentSeconds()).toBeCloseTo(8.25, 0);
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
  const assetId = `asset_${signature.slice(0, 8)}`;
  return {
    signature,
    assets: [{
      id: assetId,
      name: "Test cached render",
      sampleRate: project.project.sampleRate,
      channels: 2,
      durationSeconds: 1,
      sizeBytes: 1,
      bytes: [0]
    }],
    regions: [{
      id: `region_${signature.slice(0, 8)}`,
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
    cachedClipIds: new Set(project.timeline.clips.map((clip) => clip.id)),
    renderCacheItems: [],
    renderCacheHitCount: 0,
    renderCacheMissCount: 0,
    proceduralFallbackEventCount: 0,
    generatedRegionCount: 1,
    runtimeAudioRegionCount: 0,
    missingRuntimeAudioRegionCount: 0,
    cachedAssetByteCount: 1
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
