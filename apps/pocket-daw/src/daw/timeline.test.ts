import { describe, expect, it } from "vitest";
import { createDemoProject } from "../demo/demoProject";
import {
  barBeatTickToSamples,
  beatsToSamples,
  beatsToSeconds,
  samplesToBarBeatTick,
  samplesToBeats,
  samplesToSeconds,
  secondsToBeats,
  secondsToSamples,
  timelineSecondsAtBar,
  wrapTimelineLoopSeconds
} from "./timeline";

describe("Pocket DAW timeline conversions", () => {
  it("converts samples and seconds consistently", () => {
    expect(samplesToSeconds(48_000, 48_000)).toBe(1);
    expect(secondsToSamples(1.5, 48_000)).toBe(72_000);
  });

  it("converts beats, seconds, and samples consistently at 120 BPM", () => {
    expect(beatsToSeconds(4, 120)).toBe(2);
    expect(secondsToBeats(2, 120)).toBe(4);
    expect(beatsToSamples(4, 48_000, 120)).toBe(96_000);
    expect(samplesToBeats(96_000, 48_000, 120)).toBe(4);
  });

  it("converts bar/beat/tick positions through samples", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.sampleRate = 48_000;
    project.project.meterMap = [];
    project.automation.lanes = project.automation.lanes.filter((lane) => lane.targetPath !== "project.tempo");

    const samples = barBeatTickToSamples(project, { bar: 3, beat: 1, tick: 0 }, 48_000);
    expect(samples).toBe(192_000);

    const position = samplesToBarBeatTick(project, samples, 48_000);
    expect(position.bar).toBe(3);
    expect(position.beat).toBe(1);
    expect(position.tick).toBe(0);
  });

  it("renders four bars to the expected duration at 120 BPM", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [];
    project.automation.lanes = project.automation.lanes.filter((lane) => lane.targetPath !== "project.tempo");

    expect(timelineSecondsAtBar(project, 5)).toBe(8);
  });

  it("wraps loop playback with overflow preserved", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [];
    project.automation.lanes = project.automation.lanes.filter((lane) => lane.targetPath !== "project.tempo");
    project.timeline.loop = {
      enabled: true,
      startBar: 1,
      endBar: 3
    };

    expect(wrapTimelineLoopSeconds(project, 4.25)).toBeCloseTo(0.25, 6);
  });
});
