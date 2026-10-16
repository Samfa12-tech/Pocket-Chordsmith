// Independent installed-tool reference only. No renderer, playback or dependency changes.
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { analyseAudioChannels } from "../src/export/audio-metrics.js";
import { CALIBRATION_RATES, CALIBRATION_TOLERANCES, meterCalibrationFixtures, parseEbur128Summary, parseOversampledPeak, compareMeterReadings } from "./lib/meter-calibration-fixtures.mjs";

const ffmpeg = requiredPath("--ffmpeg");
const output = requiredPath("--output");
mkdirSync(output, { recursive: true });
const version = run(["-version"]);
const binaryHash = createHash("sha256");
for await (const chunk of createReadStream(ffmpeg)) binaryHash.update(chunk);
const results = [];
for (const rate of CALIBRATION_RATES) {
  for (const fixture of meterCalibrationFixtures(rate)) {
    const name = `${fixture.id}-${rate}`;
    const path = resolve(output, `${name}.f32`);
    const bytes = Buffer.alloc(fixture.channels[0].length * fixture.channels.length * 4);
    for (let frame = 0; frame < fixture.channels[0].length; frame += 1) for (let channel = 0; channel < fixture.channels.length; channel += 1) bytes.writeFloatLE(fixture.channels[channel][frame], (frame * fixture.channels.length + channel) * 4);
    writeFileSync(path, bytes);
    const filter = `ebur128=peak=true:framelog=verbose,aresample=${rate * 4}:osf=dbl:filter_size=32:cutoff=1.0,astats=measure_perchannel=none:measure_overall=Peak_level`;
    // Keep values above full scale through the independent measurement path.
    // A null muxer's default s16 encoder otherwise negotiates clipping into swr.
    const args = ["-hide_banner", "-nostdin", "-loglevel", "info", "-f", "f32le", "-ar", String(rate), "-ac", String(fixture.channels.length), "-i", path, "-af", filter, "-c:a", "pcm_f64le", "-f", "null", "-"];
    const log = run(args);
    writeFileSync(resolve(output, `${name}.ffmpeg.log`), log);
    const ebur128 = parseEbur128Summary(log);
    const reference = { ...ebur128, ebur128TruePeakDbtp: ebur128.truePeakDbtp, truePeakDbtp: parseOversampledPeak(log) };
    const analysisStarted = performance.now();
    const core = analyseAudioChannels(fixture);
    const coreAnalysisMs = performance.now() - analysisStarted;
    const comparison = compareMeterReadings(core, reference);
    results.push({ id: fixture.id, sampleRate: rate, channels: fixture.channels.length, frames: fixture.channels[0].length, inputSha256: createHash("sha256").update(bytes).digest("hex"), referenceFilter: filter, coreAnalysisMs, core, reference, ...comparison });
    console.log(`${name}: loudness=${comparison.loudnessPassed ? "PASS" : "FAIL"} (${comparison.integratedLufsError}) truePeak=${comparison.truePeakPassed ? "PASS" : "FAIL"} (${comparison.truePeakError})`);
  }
}
const report = {
  reference: { version: version.split(/\r?\n/)[0], binarySha256: binaryHash.digest("hex"), loudnessFilter: "ebur128", peakFilter: "explicit4x libswresample/astats peak; original ebur128 truepeak also retained", source: "https://ffmpeg.org/ffmpeg-filters.html#ebur128", lufsSummaryResolution: 0.1 },
  tolerances: CALIBRATION_TOLERANCES,
  fixtureRecipe: "Original deterministic generated PCM; no physical recording or external music. Identical raw float32 input for Core/reference; no normalization/gain. Reference loudness measures original input; explicit4x float64 resampling is only for reference peak analysis, with no fixed-point clipping.",
  results, passed: results.every(item => item.loudnessPassed && item.truePeakPassed),
  scope: "Comparison against this installed FFmpeg build and listed mono/stereo fixtures/rates. Not EBU/ITU certification, human listening, multichannel acceptance or proof of preview/export DSP parity. Existing estimated status remains until reviewed evidence supports a narrower claim."
};
writeFileSync(resolve(output, "calibration-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: results.length, loudnessPassed: results.filter(item => item.loudnessPassed).length, truePeakPassed: results.filter(item => item.truePeakPassed).length, passed: report.passed }));
if (!report.passed) process.exitCode = 1;

function requiredPath(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Provide ${name} explicitly.`);
  return resolve(process.argv[index + 1]);
}

function run(args) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Reference failed: ${result.error || result.stderr}`);
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}
