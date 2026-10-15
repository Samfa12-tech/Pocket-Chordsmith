import { describe, expect, it, vi } from "vitest";
import { analyseFinishWav, finishAudioWarnings } from "../src/audio/finishAnalysis";
import { analyseFinishWavOffThread } from "../src/audio/finishAnalysisClient";
import { finishMonitorGains } from "../src/daw/finishing";

function floatWav(amplitude: number, seconds = 1): ArrayBuffer {
  const rate = 16000, frames = Math.round(seconds * rate), buffer = new ArrayBuffer(44 + frames * 8), view = new DataView(buffer);
  const ascii = (at: number, text: string) => [...text].forEach((character, i) => view.setUint8(at + i, character.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true); ascii(36, "data"); view.setUint32(40, frames * 8, true);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) view.setFloat32(44 + frame * 8 + channel * 4, amplitude * Math.sin(frame * 2 * Math.PI * 1000 / rate), true);
  return buffer;
}

describe("rendered Finish analysis", () => {
  it("measures decoded float PCM, matches a known level change, and preserves the supplied WAV", () => {
    const buffer = floatWav(0.2), before = buffer.slice(0);
    const a = analyseFinishWav(buffer, { startSeconds: 0, endSeconds: 1 });
    const b = analyseFinishWav(floatWav(0.4), { startSeconds: 0, endSeconds: 1 });
    expect(a.sampleRate).toBe(16000); expect(a.channelCount).toBe(2);
    expect(b.integratedLufs! - a.integratedLufs!).toBeCloseTo(6.0206, 4);
    const gains = finishMonitorGains(a, b);
    expect(gains.aGain).toBeCloseTo(1, 5); expect(gains.bGain).toBeCloseTo(0.5, 5);
    expect(buffer).toEqual(before);
    expect(finishAudioWarnings(a)).toEqual([]);
  });
  it("rejects bad headers, truncation, non-float transport and out-of-file ranges", () => {
    const pcm16 = floatWav(0.2); new DataView(pcm16).setUint16(20, 1, true);
    for (const buffer of [new ArrayBuffer(0), pcm16, floatWav(0.2).slice(0, -1)]) expect(() => analyseFinishWav(buffer, { startSeconds: 0, endSeconds: 1 })).toThrow();
    expect(() => analyseFinishWav(floatWav(0.2), { startSeconds: 0, endSeconds: 2 })).toThrow(/outside/);
  });
  it("reports measured overload, non-finite audio and silence without inventing a passing level", () => {
    const overloaded = floatWav(1.2); new DataView(overloaded).setFloat32(44, NaN, true);
    const metrics = analyseFinishWav(overloaded, { startSeconds: 0, endSeconds: 1 });
    expect(metrics.nonFiniteSamples).toBe(1);
    expect(finishAudioWarnings(metrics).join(" ")).toMatch(/Non-finite.*full scale/);
    expect(finishAudioWarnings(analyseFinishWav(floatWav(0), { startSeconds: 0, endSeconds: 1 })).join(" ")).toMatch(/No usable/);
  });
  it("terminates in-flight worker analysis on abort and removes its listener", async () => {
    const terminated = vi.fn(), postMessage = vi.fn();
    class FixtureWorker { terminate = terminated; postMessage = postMessage; onerror = null; onmessage = null; }
    vi.stubGlobal("Worker", FixtureWorker);
    try {
      const controller = new AbortController(), buffer = floatWav(0.2);
      const pending = analyseFinishWavOffThread(buffer, { startSeconds: 0, endSeconds: 1 }, controller.signal);
      expect(postMessage).toHaveBeenCalledWith({ buffer, range: { startSeconds: 0, endSeconds: 1 } }, [buffer]);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(terminated).toHaveBeenCalledTimes(1);
      await expect(analyseFinishWavOffThread(buffer, { startSeconds: 0, endSeconds: 1 }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
      expect(postMessage).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
