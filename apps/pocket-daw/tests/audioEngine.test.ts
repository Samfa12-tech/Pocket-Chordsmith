import { describe, expect, it } from "vitest";
import { AudioEngine, calculateLoopSeekSeconds } from "../src/audio/audioEngine";
import { createDemoProject } from "../src/demo/demoProject";
import type { NativeAudioStatus } from "../src/native/audioPlayback";

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
});

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
