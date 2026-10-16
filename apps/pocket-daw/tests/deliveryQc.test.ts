import { describe, expect, it } from "vitest";
import { DeliveryQcJob, type DeliveryQcState } from "../src/audio/deliveryQc";
import { MAX_DELIVERY_ANALYSIS_BYTES, type DeliveryAnalysis } from "../src/audio/finishAnalysis";

const analysis = (peak = -3, byteLength = 44) => ({ bitDepth: 24, frameCount: 48000, byteLength, byteSha256: null, measurements: { integratedLufs: -16, truePeakDbtp: peak, nonFiniteSamples: 0, clippedSamples: 0, dcOffsetL: 0, dcOffsetR: 0, stereoCorrelation: 1, sampleRate: 48000, channelCount: 2, durationSeconds: 1 } }) as DeliveryAnalysis;
const flush = async () => { for (let step = 0; step < 20; step++) await Promise.resolve(); };

describe("immutable WAV delivery check ownership", () => {
  it("reports the final bytes without mutating them and releases successful retry state", async () => {
    const states: DeliveryQcState[] = [], bytes = new Uint8Array(44); bytes.set([1, 2, 3, 4]);
    const blob = new Blob([bytes]);
    const job = new DeliveryQcJob(state => states.push(state), async buffer => { expect(new Uint8Array(buffer)).toEqual(bytes); return analysis(0.27); });
    job.queue(blob, "normalized.wav", "Mix", false); await flush();
    expect(states.at(-1)).toMatchObject({ phase: "ready", fileName: "normalized.wav", bytes: 44, canRetry: false });
    expect(states.at(-1)!.warnings.join(" ")).toMatch(/true peak exceeds/);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
  it("defers without reading audio, then measures only after explicitly starting", async () => {
    const states: DeliveryQcState[] = []; let reads = 0;
    const blob = { size: 44, arrayBuffer: async () => { reads++; return new ArrayBuffer(44); } } as Blob;
    const job = new DeliveryQcJob(state => states.push(state), async () => analysis());
    job.queue(blob, "recording.wav", "Mix", true); await flush();
    expect(reads).toBe(0); expect(states.at(-1)?.phase).toBe("deferred");
    await job.start(); expect(reads).toBe(1); expect(states.at(-1)?.phase).toBe("ready");
  });
  it("aborts analysis and rejects an ignored late result from an older download", async () => {
    const states: DeliveryQcState[] = []; let release!: (value: DeliveryAnalysis) => void; let firstSignal: AbortSignal | undefined;
    let calls = 0;
    const job = new DeliveryQcJob(state => states.push(state), async (buffer, signal) => {
      if (++calls === 1) { firstSignal = signal; return new Promise<DeliveryAnalysis>(resolve => { release = resolve; }); }
      return analysis(-3, buffer.byteLength);
    });
    job.queue(new Blob([new Uint8Array(44)]), "old.wav", "Old", false); await flush();
    job.cancel(); expect(firstSignal?.aborted).toBe(true); expect(states.at(-1)?.phase).toBe("cancelled");
    job.queue(new Blob([new Uint8Array(48)]), "new.wav", "New", false); await flush();
    release(analysis(3)); await flush();
    expect(states.at(-1)).toMatchObject({ phase: "ready", fileName: "new.wav", warnings: [] });
  });
  it("does not read oversized files or represent unsupported checks as passed", async () => {
    const states: DeliveryQcState[] = [];
    const blob = { size: MAX_DELIVERY_ANALYSIS_BYTES + 1, arrayBuffer: () => { throw new Error("Must not read"); } } as unknown as Blob;
    const job = new DeliveryQcJob(state => states.push(state), async () => analysis());
    job.queue(blob, "large.wav", "Large", false); await flush();
    expect(states.at(-1)).toMatchObject({ phase: "unavailable", canRetry: false, analysis: null });
  });
  it("rejects a result whose byte count belongs to a different file", async () => {
    const states: DeliveryQcState[] = [];
    const job = new DeliveryQcJob(state => states.push(state), async () => analysis(-3, 45));
    job.queue(new Blob([new Uint8Array(44)]), "current.wav", "Mix", false); await flush();
    expect(states.at(-1)?.phase).toBe("failed");
    expect(states.at(-1)?.message).toContain("does not match");
    expect(states.at(-1)?.analysis).toBeNull();
  });
});
