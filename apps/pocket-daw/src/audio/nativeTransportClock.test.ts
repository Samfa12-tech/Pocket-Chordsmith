import { describe, expect, it } from "vitest";
import type { NativeAudioStatus } from "../native/audioPlayback";
import { NativeTransportClock, shouldApplyNativeStatus } from "./nativeTransportClock";

function status(positionSeconds: number, consumedFrameCount: number, queueGeneration = 0, startedGeneration = 1): NativeAudioStatus {
  return {
    backend: "native-cpal",
    available: true,
    active: true,
    playing: true,
    positionSeconds,
    eventCount: 0,
    sampleRate: 48_000,
    channels: 2,
    renderedFrameCount: consumedFrameCount + 1024,
    startedGeneration,
    projectTitle: null,
    deviceName: null,
    hostName: null,
    lastError: null,
    outputDiagnostics: {
      renderedPositionSeconds: positionSeconds + 1024 / 48_000,
      consumedPositionSeconds: positionSeconds,
      queueFrames: 1024,
      queueDelaySeconds: 1024 / 48_000,
      deviceOutputLatencySeconds: null,
      targetQueueFrames: 1024,
      queueCapacityFrames: 32768,
      maxQueueFrames: 1024,
      consumedFrameCount,
      underrunFrameCount: 0,
      underrunCallbackCount: 0,
      intentionalSilenceFrameCount: 0,
      lastRenderMicros: 100,
      maxRenderMicros: 100,
      slowRenderBlockCount: 0,
      streamFailed: false,
      streamErrorCount: 0,
      queueGeneration,
      requestedQueueGeneration: queueGeneration
    }
  };
}

describe("NativeTransportClock", () => {
  it("anchors to consumed audio position and follows a loop wrap", () => {
    const clock = new NativeTransportClock();
    clock.updateFromStatus(status(0.49, 23_520), 1000);
    expect(clock.currentPositionSeconds(1000)).toBeCloseTo(0.49);
    expect(clock.currentPositionSeconds(1010)).toBeCloseTo(0.5);
    clock.updateFromStatus(status(0.1, 23_521), 1010);
    expect(clock.currentPositionSeconds(1010)).toBeCloseTo(0.1);
  });

  it("freezes on pause or output failure", () => {
    const clock = new NativeTransportClock();
    clock.updateFromStatus({ ...status(1.25, 60_000), playing: false }, 1000);
    expect(clock.currentPositionSeconds(31_000)).toBeCloseTo(1.25);
    clock.updateFromStatus({ ...status(2, 96_000), active: false, playing: false }, 31_000);
    expect(clock.currentPositionSeconds(61_000)).toBeCloseTo(2);
  });

  it("rejects out-of-order status responses across queue and playback generations", () => {
    const current = status(2, 96_000, 3, 4);
    expect(shouldApplyNativeStatus(current, status(1.9, 95_000, 2, 4))).toBe(false);
    expect(shouldApplyNativeStatus(current, status(1.9, 95_000, 3, 4))).toBe(false);
    expect(shouldApplyNativeStatus(current, status(0.1, 96_000, 4, 4))).toBe(true);
    expect(shouldApplyNativeStatus(current, status(0, 0, 0, 5))).toBe(true);
    expect(shouldApplyNativeStatus(current, status(3, 144_000, 4, 3))).toBe(false);
    const stopped = { ...status(0, 0, 0, 4), active: false, playing: false };
    expect(shouldApplyNativeStatus(current, stopped)).toBe(true);
    expect(shouldApplyNativeStatus(stopped, current)).toBe(false);
  });
});
