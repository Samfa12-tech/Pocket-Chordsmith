import { describe, expect, it } from "vitest";
import { AudioEngine, calculateLoopSeekSeconds } from "../src/audio/audioEngine";
import { createDemoProject } from "../src/demo/demoProject";

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
});
