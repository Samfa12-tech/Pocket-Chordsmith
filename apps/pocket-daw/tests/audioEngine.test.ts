import { describe, expect, it } from "vitest";
import { AudioEngine, calculateLoopSeekSeconds } from "../src/audio/audioEngine";
import { createDemoProject } from "../src/demo/demoProject";

describe("audio engine diagnostics", () => {
  it("reports event counts without starting playback", () => {
    const engine = new AudioEngine(createDemoProject());
    const diagnostics = engine.getDiagnostics();

    expect(diagnostics.audioContextState).toBe("not-created");
    expect(diagnostics.eventCount).toBeGreaterThan(0);
    expect(diagnostics.fxChainCount).toBeGreaterThan(0);
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
});
