import test from "node:test";
import assert from "node:assert/strict";
import { compareMeterReadings, parseEbur128Summary, parseOversampledPeak } from "../scripts/lib/meter-calibration-fixtures.mjs";
import { meterCalibrationFixtures } from "../scripts/lib/meter-calibration-fixtures.mjs";
import { analyseAudioChannels } from "../src/export/audio-metrics.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const frozenReference = JSON.parse(readFileSync(new URL("./fixtures/meter-calibration-reference.json", import.meta.url), "utf8"));

test("meters stay inside independent FFmpeg bounds for all63 hashed rate/fixture cases", () => {
  const rates = [...new Set(frozenReference.results.map(row => row.sampleRate))];
  let checked = 0;
  for (const rate of rates) {
    const fixtures = meterCalibrationFixtures(rate);
    const rows = frozenReference.results.filter(row => row.sampleRate === rate);
    assert.equal(rows.length, fixtures.length);
    for (const fixture of fixtures) {
      const reference = rows.find(row => row.id === fixture.id);
      assert.ok(reference, `${fixture.id}/${rate} lacks an external reference`);
      const bytes = Buffer.alloc(fixture.channels[0].length * fixture.channels.length * 4);
      for (let frame = 0; frame < fixture.channels[0].length; frame += 1) for (let channel = 0; channel < fixture.channels.length; channel += 1) bytes.writeFloatLE(fixture.channels[channel][frame], (frame * fixture.channels.length + channel) * 4);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), reference.inputSha256, `${fixture.id}/${rate} PCM changed`);
      const compared = compareMeterReadings(analyseAudioChannels(fixture), reference);
      assert.ok(compared.loudnessPassed && compared.truePeakPassed, `${fixture.id}/${rate}: ${JSON.stringify(compared)}`);
      checked += 1;
    }
  }
  assert.equal(checked, 63);
});

test("K weighting retains the independently measured 48k stereo1kHz loudness", () => {
  const fixture = meterCalibrationFixtures(48000).find(item => item.id === "tone-1khz");
  const metrics = analyseAudioChannels(fixture);
  // Recorded FFmpeg9 ebur128 result -14.0 LUFS (0.1LU summary resolution).
  // Old v2 was -14.232237 and failed the selected0.15LU acceptance bound.
  assert.ok(Math.abs(metrics.integratedLufs - (-14.0)) <= 0.15, String(metrics.integratedLufs));
  assert.equal(metrics.meteringStatus, "estimated_pending_external_calibration");
});

test("external meter parser requires the final complete reference summary", () => {
  assert.deepEqual(parseEbur128Summary("Summary:\nIntegrated loudness:\n I: -70.0 LUFS\nTrue peak:\n Peak: -inf dBFS\nSummary:\nIntegrated loudness:\n I: -18.2 LUFS\nTrue peak:\n Peak: -1.1 dBFS"), { integratedLufs: -18.2, truePeakDbtp: -1.1 });
  assert.deepEqual(parseEbur128Summary("Summary:\nIntegrated loudness:\n I: -70.0 LUFS\nTrue peak:\n Peak: -inf dBFS"), { integratedLufs: null, truePeakDbtp: null });
  assert.throws(() => parseEbur128Summary("I: -18.2 LUFS TPK: -1.1"), /final/);
  assert.throws(() => parseEbur128Summary("Summary:\nIntegrated loudness:\n I: -18.2 LUFS"), /missing/);
});

test("external meter comparison does not pass missing, nonfinite or out-of-tolerance readings", () => {
  assert.equal(compareMeterReadings({ integratedLufs: null, truePeakDbtp: null }, { integratedLufs: null, truePeakDbtp: null }).loudnessPassed, true);
  assert.equal(compareMeterReadings({ integratedLufs: null, truePeakDbtp: -1 }, { integratedLufs: -18, truePeakDbtp: -1 }).loudnessPassed, false);
  assert.equal(compareMeterReadings({ integratedLufs: NaN, truePeakDbtp: Infinity }, { integratedLufs: -18, truePeakDbtp: -1 }).truePeakPassed, false);
  assert.equal(compareMeterReadings({ integratedLufs: -18.3, truePeakDbtp: -1.3 }, { integratedLufs: -18, truePeakDbtp: -1 }).loudnessPassed, false);
  assert.equal(compareMeterReadings({ integratedLufs: -18.3, truePeakDbtp: -1.3 }, { integratedLufs: -18, truePeakDbtp: -1 }).truePeakPassed, false);
});

test("true peak detects the independently observed intersample overload", () => {
  const fixture = meterCalibrationFixtures(48000).find(item => item.id === "intersample-overload-interior");
  const metrics = analyseAudioChannels(fixture);
  assert.ok(metrics.samplePeakDbfs < -1.3);
  assert.ok(Math.abs(metrics.truePeakDbtp - 20 * Math.log10(1.2)) < 0.1, String(metrics.truePeakDbtp));
  assert.ok(metrics.intersampleRisk);
  assert.equal(parseOversampledPeak("[astats] Overall\n[astats] Peak level dB: 0.4321"), 0.4321);
  assert.equal(parseOversampledPeak("Peak level dB: -inf"), null);
  assert.throws(() => parseOversampledPeak("Peak: 0.4 dBFS"), /missing/);
});
