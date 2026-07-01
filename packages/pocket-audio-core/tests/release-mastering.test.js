import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  analyseRenderedBuffer,
  batchMasterRelease,
  decodePcmWavBytes,
  encodePcm24WavBytes,
  getReleaseProfile,
  masterBuffer,
  suggestMixPatch
} from "../src/index.js";

const fixturesDir = new URL("./fixtures/", import.meta.url);

test("release metrics report finite, peak, LUFS, stereo and tail fields", () => {
  const sampleRate = 48000;
  const left = new Float32Array(sampleRate);
  const right = new Float32Array(sampleRate);
  for (let index = 0; index < sampleRate / 2; index += 1) {
    const sample = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.25;
    left[index] = sample;
    right[index] = sample;
  }

  const metrics = analyseRenderedBuffer({ channels: [left, right], sampleRate, duration: 1, eventCount: 1 });

  assert.equal(metrics.channelCount, 2);
  assert.equal(metrics.nonFiniteSamples, 0);
  assert.equal(metrics.clippedSamples, 0);
  assert.ok(metrics.integratedLufs < -10);
  assert.equal(metrics.lufsMethod, "estimated_bs1770_k_weighted_gated_v2");
  assert.equal(metrics.truePeakMethod, "estimated_catmull_rom_4x_v2");
  assert.equal(metrics.meteringStatus, "estimated_pending_external_calibration");
  assert.ok(metrics.samplePeakDbfs < -11);
  assert.ok(metrics.tailSeconds > 0.4);
  assert.ok(metrics.stereoCorrelation > 0.99);
  assert.ok(metrics.spectralBalance.mid !== undefined);
});

test("release metrics catch clipped, non-finite, DC offset and inverse stereo fixtures", () => {
  const clipped = analyseRenderedBuffer({
    channels: [Float32Array.from([0.2, 1.1, NaN, 0.3]), Float32Array.from([-0.2, -Infinity, -1.2, -0.3])],
    sampleRate: 44100,
    duration: 4 / 44100
  });
  assert.equal(clipped.clippedSamples, 2);
  assert.equal(clipped.nonFiniteSamples, 2);

  const sampleRate = 44100;
  const left = new Float32Array(sampleRate);
  const right = new Float32Array(sampleRate);
  for (let index = 0; index < sampleRate; index += 1) {
    const sample = Math.sin(2 * Math.PI * 110 * index / sampleRate) * 0.2;
    left[index] = sample + 0.05;
    right[index] = -sample + 0.05;
  }
  const inverse = analyseRenderedBuffer({ channels: [left, right], sampleRate, duration: 1 });
  assert.ok(inverse.dcOffsetL > 0.04);
  assert.ok(inverse.dcOffsetR > 0.04);
  assert.ok(inverse.stereoCorrelation < -0.95);
});

test("WAV24 export writes valid PCM and can be re-read", () => {
  const bytes = encodePcm24WavBytes({
    channels: [Float32Array.from([0, 0.5, -0.5]), Float32Array.from([0.25, -0.25, 0])],
    sampleRate: 44100
  });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint16(34, true), 24);
  assert.equal(view.getUint32(40, true), 18);

  const decoded = decodePcmWavBytes(bytes);
  assert.equal(decoded.bitDepth, 24);
  assert.equal(decoded.channels.length, 2);
  assert.equal(decoded.channels[0].length, 3);
});

test("lofi release profile applies the chord-balance mastering note as a non-destructive trim", () => {
  const patch = suggestMixPatch(
    { title: "Chord Balance Fixture" },
    {
      chords: { rmsDbfs: -18, truePeakDbtp: -5, crestFactorDb: 8, spectralBalance: {} },
      melody: { rmsDbfs: -24, truePeakDbtp: -10, crestFactorDb: 7, spectralBalance: {} }
    },
    getReleaseProfile("spotify_lofi_chill"),
    { integratedLufs: -20, truePeakDbtp: -4, samplePeakDbfs: -4 }
  );

  assert.equal(patch.changes.stems.chords.gainDb, -0.6);
  assert.ok(patch.reasons.some((reason) => reason.includes("chord stem sits a bit forward")));
});

test("master chain moves a quiet mix toward target loudness and enforces true peak", () => {
  const sampleRate = 44100;
  const left = new Float32Array(sampleRate);
  const right = new Float32Array(sampleRate);
  for (let index = 0; index < left.length; index += 1) {
    const sample = Math.sin(2 * Math.PI * 220 * index / sampleRate) * 0.05;
    left[index] = sample;
    right[index] = sample;
  }

  const result = masterBuffer({ channels: [left, right], sampleRate, duration: 1 }, getReleaseProfile("spotify_lofi_chill"));

  assert.ok(result.postAnalysis.integratedLufs > -20);
  assert.ok(result.postAnalysis.truePeakDbtp <= -0.95);
  assert.equal(result.postAnalysis.clippedSamples, 0);
  assert.equal(result.settings.loudnessTargetStatus, "reached");
  assert.ok(result.settings.chain.includes("true_peak_lookahead_limiter_pass_1"));
});

test("master chain warns instead of squashing transient-limited material", () => {
  const sampleRate = 44100;
  const length = sampleRate * 4;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let index = 0; index < length; index += Math.floor(sampleRate / 3)) {
    left[index] = 0.95;
    right[index] = 0.95;
    if (index + 1 < length) {
      left[index + 1] = -0.7;
      right[index + 1] = -0.7;
    }
  }

  const result = masterBuffer({ channels: [left, right], sampleRate, duration: 4 }, getReleaseProfile("spotify_lofi_chill"));

  assert.equal(result.settings.loudnessTargetStatus, "transient-limited");
  assert.match(result.settings.loudnessTargetReason, /limiter-reduction cap|transient-limited/);
  assert.ok(result.settings.limiterGainReductionDb <= getReleaseProfile("spotify_lofi_chill").maxLimiterGainReductionDb + 0.05);
  assert.ok(result.postAnalysis.truePeakDbtp <= -0.95);
});

test("master chain refuses invalid non-finite audio before export", () => {
  assert.throws(() => masterBuffer({
    channels: [Float32Array.from([0, NaN, 0]), Float32Array.from([0, 0, 0])],
    sampleRate: 44100,
    duration: 3 / 44100
  }, getReleaseProfile("spotify_lofi_chill")), /non-finite samples/);
});

test("batch release writes reports and preserves source JSON while failing invalid sequence input", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pocket-release-test-"));
  const input = join(temp, "input");
  const out = join(temp, "release");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(input, { recursive: true }));
  const source = JSON.parse(await readFile(new URL("section-sequence.pcs.json", fixturesDir), "utf8"));
  source.audioProfile = "lofi_chill";
  source.lofiPreset = "lofi_study_room";
  source.title = "Release Pass Fixture";
  await writeFile(join(input, "01-pass.json"), JSON.stringify(source, null, 2));
  const invalid = { ...source };
  delete invalid.songSequence;
  await writeFile(join(input, "02-fail.json"), JSON.stringify(invalid, null, 2));

  const result = await batchMasterRelease({
    input: join(input, "*.json"),
    out,
    profile: "spotify_lofi_chill",
    scope: "sequence"
  });

  assert.equal(result.manifest.inputCount, 2);
  assert.equal(result.manifest.status, "FAIL");
  assert.ok(result.manifest.albumConsistency);
  assert.equal(result.reports[0].sourceHash.length, 64);
  assert.ok(result.reports[0].outputs.masterWav.endsWith(".wav"));
  assert.ok(result.reports[0].renderInfo.sectionIds.length > 1);
  assert.equal(result.reports[1].qc.status, "FAIL");
  assert.match(result.reports[1].qc.failures.join("\n"), /missing songSequence/);
  assert.equal(JSON.parse(await readFile(result.reports[0].outputs.sourceProject, "utf8")).title, "Release Pass Fixture");

  const resumed = await batchMasterRelease({
    input: join(input, "*.json"),
    out,
    profile: "spotify_lofi_chill",
    scope: "sequence"
  });
  assert.equal(resumed.reports[0].resumed, true);
  assert.equal(resumed.manifest.tracks[0].resumed, true);

  const analyzeOnly = await batchMasterRelease({
    input: join(input, "01-pass.json"),
    out: join(temp, "analyze-only"),
    profile: "spotify_lofi_chill",
    scope: "sequence",
    analyzeOnly: true,
    albumConsistency: true
  });
  assert.equal(analyzeOnly.reports[0].analyzeOnly, true);
  assert.equal(analyzeOnly.reports[0].outputs.masterWav, undefined);
  assert.equal(analyzeOnly.manifest.exports.includes("wav24"), false);
  assert.match(analyzeOnly.reports[0].qc.checks.find((check) => check.name === "exported WAV re-read/reanalysed").message, /Analyze-only/);
});
