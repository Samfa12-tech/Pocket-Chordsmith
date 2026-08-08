import { describe, expect, it } from "vitest";
import {
  chooseWavExportBudget,
  estimateWavExportResources,
  formatWavExportPreflightFailure,
  WAV_EXPORT_LIMITS,
} from "../src/wav-export-preflight.js";

describe("WAV export resource preflight", () => {
  it("accepts short and typical stereo renders within the constrained mobile budget", () => {
    const budget = chooseWavExportBudget({ userAgent: "Android Mobile", deviceMemory: 4 });
    expect(budget.maximumWorkingBytes).toBe(WAV_EXPORT_LIMITS.constrainedMobileWorkingBytes);
    expect(estimateWavExportResources({ durationSeconds: 30, maximumWorkingBytes: budget.maximumWorkingBytes, maximumDurationSeconds: budget.maximumDurationSeconds }).ok).toBe(true);
    expect(estimateWavExportResources({ durationSeconds: 120, maximumWorkingBytes: budget.maximumWorkingBytes, maximumDurationSeconds: budget.maximumDurationSeconds }).ok).toBe(true);
  });

  it("reports the maximum safe boundary deterministically", () => {
    const bytesPerFrame = 2 * (Float32Array.BYTES_PER_ELEMENT * WAV_EXPORT_LIMITS.workingBufferMultiplier + Int16Array.BYTES_PER_ELEMENT);
    const maximumFrames = Math.floor(WAV_EXPORT_LIMITS.constrainedMobileWorkingBytes / bytesPerFrame);
    expect(estimateWavExportResources({ durationSeconds: (maximumFrames - 1) / 44100, maximumWorkingBytes: WAV_EXPORT_LIMITS.constrainedMobileWorkingBytes, maximumDurationSeconds: 360 }).ok).toBe(true);
    expect(estimateWavExportResources({ durationSeconds: (maximumFrames + 1) / 44100, maximumWorkingBytes: WAV_EXPORT_LIMITS.constrainedMobileWorkingBytes, maximumDurationSeconds: 360 }).ok).toBe(false);
  });

  it("rejects intentionally oversized renders with a usable section-export recovery message", () => {
    const estimate = estimateWavExportResources({ durationSeconds: 600, maximumWorkingBytes: WAV_EXPORT_LIMITS.mobileWorkingBytes, maximumDurationSeconds: WAV_EXPORT_LIMITS.mobileDurationSeconds });
    expect(estimate).toMatchObject({ ok: false, durationWithinLimit: false, memoryWithinLimit: false });
    expect(formatWavExportPreflightFailure(estimate)).toContain("Choose Current section");
  });

  it("rejects invalid dimensions before frame allocation", () => {
    expect(() => estimateWavExportResources({ durationSeconds: Number.POSITIVE_INFINITY })).toThrow(/duration/i);
    expect(() => estimateWavExportResources({ durationSeconds: 1, sampleRate: 0 })).toThrow(/sample rate/i);
    expect(() => estimateWavExportResources({ durationSeconds: 1, channels: 0 })).toThrow(/channel/i);
  });
});
