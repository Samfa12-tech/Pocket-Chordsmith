import { describe, expect, it } from "vitest";
import { audioBufferPeaks } from "./audioBufferCache";

function bufferWithImpulses(length: number, channels: Array<Record<number, number>>): AudioBuffer {
  const data = channels.map((impulses) => {
    const channel = new Float32Array(length);
    for (const [index, value] of Object.entries(impulses)) channel[Number(index)] = value;
    return channel;
  });
  return {
    length,
    numberOfChannels: data.length,
    getChannelData: (index: number) => data[index]
  } as AudioBuffer;
}

describe("audioBufferPeaks", () => {
  it("covers the final sample in a non-divisible 1000-frame buffer", () => {
    const peaks = audioBufferPeaks(bufferWithImpulses(1000, [{ 999: 1 }]), 256);
    expect(peaks).toHaveLength(256);
    expect(peaks.at(-1)).toBe(1);
    expect(peaks.slice(0, -1).every((peak) => peak === 0)).toBe(true);
  });

  it("covers every frame exactly once, including stereo impulses", () => {
    const peaks = audioBufferPeaks(bufferWithImpulses(10, [{ 0: 0.4, 9: 0.8 }, { 4: -1 }]), 3);
    expect(peaks).toEqual([0.4, 1, 0.8]);
  });

  it("bounds short and empty buffers", () => {
    expect(audioBufferPeaks(bufferWithImpulses(2, [{ 1: 1 }]), 256)).toEqual([0, 1]);
    expect(audioBufferPeaks(bufferWithImpulses(0, [{}]), 256)).toEqual([]);
  });
});
