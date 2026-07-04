import { describe, expect, it } from "vitest";
import { createDemoProject } from "../demo/demoProject";
import { buildRecordingSamplePlacement, buildRecordingSamplePlacementMetadata } from "./recordingOrchestration";

describe("Pocket DAW recording sample placement", () => {
  it("derives clip placement from timeline samples and manual offset", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.sampleRate = 48_000;
    project.audioDeviceSettings.bufferSize = 512;
    const track = {
      metadata: {
        recordingLatencyOffsetSeconds: 0.1
      }
    } as unknown as typeof project.tracks[number];

    const placement = buildRecordingSamplePlacement({
      project,
      track,
      startBar: 3,
      requestedStartSeconds: 4,
      captureSampleRate: 48_000,
      captureStartInputFrame: 100,
      firstInputFrame: 340
    });

    expect(placement.requestedStartSample).toBe(192_000);
    expect(placement.manualOffsetSamples).toBe(4_800);
    expect(placement.clipTimelineStartSample).toBe(187_200);
    expect(placement.clipTimelineStartBar).toBeCloseTo(2.95, 3);
    expect(placement.recordedBufferOffsetSamples).toBe(240);
    expect(placement.estimatedOutputLatencySamples).toBe(512);
  });

  it("emits sample-domain metadata for later clip placement", () => {
    const project = createDemoProject();
    const track = project.tracks.find((item) => item.trackType === "audio") || null;
    const metadata = buildRecordingSamplePlacementMetadata({
      project,
      track,
      startBar: 1,
      requestedStartSeconds: 0,
      captureSampleRate: project.project.sampleRate,
      captureStartInputFrame: 12,
      firstInputFrame: 24
    });

    expect(metadata.recordingPlacementTimingModel).toBe("timeline-samples-v1");
    expect(metadata.timelineSampleRate).toBe(project.project.sampleRate);
    expect(metadata.clipTimelineStartSample).toBe(0);
    expect(metadata.recordedBufferOffsetSamples).toBe(12);
  });
});
