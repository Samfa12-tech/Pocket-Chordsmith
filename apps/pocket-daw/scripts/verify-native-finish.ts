// Actual native DSP via the existing retained-file test transport. No Tauri
// IPC, installed app, physical recording, output device or listening claim.
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { projectWithFinishPreset, finishMonitorGains, type FinishPresetId } from "../src/daw/finishing";
import { buildNativeAudioStartPayload } from "../src/native/audioPlayback";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { analyseFinishWav } from "../src/audio/finishAnalysis";
import { analyseAudioChannels } from "../../../packages/pocket-audio-core/src/export/audio-metrics.js";
import { decodePcmWavBytes } from "../../../packages/pocket-audio-core/src/export/wav.js";
import { parseEbur128Summary, parseOversampledPeak, compareMeterReadings } from "../../../packages/pocket-audio-core/scripts/lib/meter-calibration-fixtures.mjs";
import { wavBlobWithChannelMode } from "../src/audio/offlineRender";
import { finishAudioWarnings } from "../src/audio/finishAnalysis";
import type { PocketDawProject } from "../src/daw/schema";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const input = argument("--source-evidence");
const cargo = argument("--cargo-bin");
const ffmpeg = argument("--ffmpeg-bin");
const output = resolve(root, "local-artifacts/scratch/validation/native-finish");
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(resolve(output, "run-"));
const sourcePath = resolve(input, "source-project.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8")) as PocketDawProject;
const sourceBytes = readFileSync(sourcePath);
const sourceBefore = JSON.stringify(source);
const retained = JSON.parse(readFileSync(resolve(input, "native-00/input.json"), "utf8"));
const duration = 8.8568125;
const rate = source.project.sampleRate;
const range = { startSeconds: 0, endSeconds: duration };
const results: Array<Record<string, unknown>> = [];
for (const preset of ["original", "tidy", "glue"] as FinishPresetId[]) {
  const project = projectWithFinishPreset(source, preset);
  const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0, { assets: retained.payload.assets, regions: retained.payload.regions });
  const target = resolve(directory, preset);
  mkdirSync(target);
  const request = resolve(target, "input.json");
  writeFileSync(request, JSON.stringify({ payload: { ...payload, loop: null, metronome: null }, durationSeconds: duration, renderMode: "mix-exact", bitDepth: 32 }));
  const run = spawnSync(cargo, ["test", "--locked", "--lib", "native_godot_arranged_export_fixture", "--", "--ignored", "--nocapture"], { cwd: resolve(root, "apps/pocket-daw/src-tauri"), encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, POCKET_DAW_NATIVE_GODOT_INPUT: request, POCKET_DAW_NATIVE_GODOT_OUTPUT: target } });
  writeFileSync(resolve(target, "native.log"), `${run.stdout || ""}\n${run.stderr || ""}`);
  if (run.error || run.status !== 0) throw new Error(`Native render failed (${target}): ${run.error || run.status}`);
  const bytes = readFileSync(resolve(target, "render.wav"));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const metrics = analyseFinishWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), range);
  const result = { preset, file: resolve(target, "render.wav"), bytes: bytes.length, sha256: hash(bytes), sampleRate: rate, waveFormat: view.getUint16(20, true), bitDepth: view.getUint16(34, true), metrics };
  results.push(result);
  writeFileSync(resolve(directory, "native-render-report.json"), JSON.stringify({ sourceEvidence: input, sourceSha256: hash(sourceBytes), range, results }, null, 2));
  // The public shared decoder must accept files actually advertised/exported
  // by the DAW. Preserve the preceding native file/report if this gate fails.
  const decoded = decodePcmWavBytes(bytes);
  const decodedMetrics = analyseAudioChannels(decoded);
  writeFileSync(resolve(target, "decoded-metrics.json"), JSON.stringify(decodedMetrics, null, 2));
  console.log(`${preset}: native float32 ${bytes.length} bytes, decoded ${decoded.duration}s`);
}
if (JSON.stringify(source) !== sourceBefore) throw new Error("Finish mutated the original project.");
const a = results[0].metrics as ReturnType<typeof analyseFinishWav>;
const comparisons = results.slice(1).map(item => ({ preset: item.preset, gains: finishMonitorGains(a, item.metrics as ReturnType<typeof analyseFinishWav>) }));
const original = decodePcmWavBytes(readFileSync(String(results[0].file)));
const proposed = decodePcmWavBytes(readFileSync(String(results[2].file)));
const gains = comparisons[1].gains;
const rematched = [original, proposed].map((decoded, index) => analyseAudioChannels({ ...decoded, channels: decoded.channels.map(channel => channel.map(sample => sample * (index ? gains.bGain : gains.aGain))) }));
if (Math.abs(rematched[0].integratedLufs! - rematched[1].integratedLufs!) > 0.02) throw new Error("Actual matched PCM differs in integrated loudness.");

const monitorDirectory = resolve(directory, "monitor"); mkdirSync(monitorDirectory);
const switches = [{ frame: 12000, side: "b", sequence: 1 }, { frame: 12240, side: "a", sequence: 2 }, { frame: 48000, side: "b", sequence: 3 }];
const trackIds = ["original", "proposed"];
const payload = { projectTitle: "Real native Finish monitor fixture", sampleRate: rate, startSeconds: 0, audition: { endSeconds: duration }, monitorComparison: { aTrackId: "original", bTrackId: "proposed", aGain: gains.aGain, bGain: gains.bGain, side: "a" }, tracks: trackIds.map(id => ({ id, volume: 1, pan: 0, mute: false, solo: false })), events: [], fxChains: [], assets: [results[0], results[2]].map((item, index) => ({ id: trackIds[index], name: `${trackIds[index]}.wav`, sourcePath: item.file, sampleRate: rate, channels: 2, durationSeconds: duration, sourceHash: item.sha256 })), regions: trackIds.map(id => ({ id, assetId: id, trackId: id, startTime: 0, sourceOffset: 0, duration, gain: 1, pan: 0 })) };
const monitorRequest = resolve(monitorDirectory, "input.json"); writeFileSync(monitorRequest, JSON.stringify({ payload, durationSeconds: duration, monitorCapture: true, switches }));
const monitorRun = spawnSync(cargo, ["test", "--locked", "--lib", "native_godot_arranged_export_fixture", "--", "--ignored", "--nocapture"], { cwd: resolve(root, "apps/pocket-daw/src-tauri"), encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, POCKET_DAW_NATIVE_GODOT_INPUT: monitorRequest, POCKET_DAW_NATIVE_GODOT_OUTPUT: monitorDirectory } });
writeFileSync(resolve(monitorDirectory, "native.log"), `${monitorRun.stdout || ""}\n${monitorRun.stderr || ""}`);
if (monitorRun.error || monitorRun.status !== 0) throw new Error(`Native monitor failed: ${monitorRun.error || monitorRun.status}`);
const captured = decodePcmWavBytes(readFileSync(resolve(monitorDirectory, "render.wav")));
let maxError = 0, squaredError = 0, blend = 0, targetBlend = 0, ramp = 0;
const frameCount = Math.round(duration * rate);
if (captured.channels[0].length !== frameCount) throw new Error("Native monitor frame count changed.");
for (let frame = 0; frame < frameCount; frame++) {
  const change = switches.find(item => item.frame === frame);
  if (change) { targetBlend = change.side === "a" ? 0 : 1; ramp = Math.round(rate * 0.01); }
  if (ramp) { blend += (targetBlend - blend) / ramp; ramp--; if (!ramp) blend = targetBlend; }
  const fade = Math.max(0, Math.min(1, (frameCount - frame - 1) / (rate * 0.01)));
  for (let channel = 0; channel < 2; channel++) {
    const expected = (original.channels[channel][frame] * gains.aGain * (1 - blend) + proposed.channels[channel][frame] * gains.bGain * blend) * fade;
    const error = Math.abs(captured.channels[channel][frame] - expected);
    maxError = Math.max(maxError, error); squaredError += error * error;
  }
}
const clock = JSON.parse(readFileSync(resolve(monitorDirectory, "render.json"), "utf8")).monitorProducerClockEvidence as Array<{ frame: number; positionSeconds: number; renderedFrameCount: number; generation: number }>;
const monitor = { frames: frameCount, maxError, rmsError: Math.sqrt(squaredError / (frameCount * 2)), clock, source: "Actual native renderer/atomic commands; producer clock only, not device-consumed output." };
writeFileSync(resolve(monitorDirectory, "comparison.json"), JSON.stringify(monitor, null, 2));
if (maxError > 0.00001 || clock.some(item => item.frame !== item.renderedFrameCount || Math.abs(item.positionSeconds - item.frame / rate) > 1 / rate || item.generation !== 17)) throw new Error("Native monitor differs from aligned matched source PCM or resets its clock.");

const deliveries = [];
const sourceBlob = new Blob([new Uint8Array(readFileSync(String(results[2].file)))]);
for (const config of [
  { name: "stereo16", mode: "stereo", bitDepth: 16, dither: "off", normalizePeak: false },
  { name: "stereo24", mode: "stereo", bitDepth: 24, dither: "off", normalizePeak: false },
  { name: "stereo32", mode: "stereo", bitDepth: 32, dither: "off", normalizePeak: false },
  { name: "mono16", mode: "mono", bitDepth: 16, dither: "off", normalizePeak: false },
  { name: "stereo16-tpdf", mode: "stereo", bitDepth: 16, dither: "tpdf", normalizePeak: false },
  { name: "stereo24-tpdf", mode: "stereo", bitDepth: 24, dither: "tpdf", normalizePeak: false },
  { name: "stereo24-normalized", mode: "stereo", bitDepth: 24, dither: "off", normalizePeak: true }
] as const) {
  const blob = await wavBlobWithChannelMode(sourceBlob, config.mode, config);
  const bytes = new Uint8Array(await blob.arrayBuffer()), path = resolve(directory, `${config.name}.wav`); writeFileSync(path, bytes);
  const decoded = decodePcmWavBytes(bytes), metrics = analyseAudioChannels(decoded);
  if (decoded.bitDepth !== config.bitDepth || decoded.channels.length !== (config.mode === "mono" ? 1 : 2) || decoded.channels[0].length !== frameCount) throw new Error(`Decoded ${config.name} metadata/frame parity failed.`);
  let maxPcmError = 0;
  if (!config.normalizePeak) {
    for (let frame = 0; frame < frameCount; frame++) for (let channel = 0; channel < decoded.channels.length; channel++) {
      const expected = config.mode === "mono" ? (proposed.channels[0][frame] + proposed.channels[1][frame]) / 2 : proposed.channels[channel][frame];
      maxPcmError = Math.max(maxPcmError, Math.abs(decoded.channels[channel][frame] - expected));
    }
    const bound = config.bitDepth === 32 ? 0 : (config.dither === "tpdf" ? 2 : 0.51) / (2 ** (config.bitDepth - 1) - 1);
    if (maxPcmError > bound + 0.00000001) throw new Error(`Decoded ${config.name} PCM error ${maxPcmError} exceeds ${bound}.`);
  }
  const filter = `ebur128=peak=true:framelog=verbose,aresample=${rate * 4}:osf=dbl:filter_size=32:cutoff=1.0,astats=measure_perchannel=none:measure_overall=Peak_level`;
  const referenceLog = runFfmpeg(["-hide_banner", "-nostdin", "-loglevel", "info", "-i", path, "-af", filter, "-c:a", "pcm_f64le", "-f", "null", "-"]);
  writeFileSync(resolve(directory, `${config.name}.ffmpeg.log`), referenceLog);
  const ebur128 = parseEbur128Summary(referenceLog), reference = { ...ebur128, ebur128TruePeakDbtp: ebur128.truePeakDbtp, truePeakDbtp: parseOversampledPeak(referenceLog) }, comparison = compareMeterReadings(metrics, reference);
  deliveries.push({ config, file: path, sha256: hash(bytes), maxPcmError, metrics, warnings: finishAudioWarnings(metrics), reference, comparison });
}
const report = { sourceEvidence: input, sourceSha256: hash(sourceBytes), range, sourceUnchanged: true, results, comparisons, rematched, monitor, deliveries, reference: { version: runFfmpeg(["-version"]).split(/\r?\n/)[0], binarySha256: await fileHash(ffmpeg) }, passed: deliveries.every(item => item.comparison.loudnessPassed && item.comparison.truePeakPassed), limits: "Generated recorded-media path plus authored Campfire/FX/automation. Real native offline renderer/monitor producer; not physical recording, installed Tauri/device or human listening evidence. Delivery WAVs are written and decoded/reanalyzed; other formats remain staged." };
writeFileSync(resolve(directory, "summary.json"), JSON.stringify(report, null, 2));
if (!report.passed) throw new Error(`Decoded delivery external-reference checks failed: ${directory}`);
console.log(`Native Finish evidence: ${directory}`);

function argument(name: string) { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`); return resolve(process.argv[index + 1]); }
function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
async function fileHash(path: string) { const digest = createHash("sha256"); for await (const chunk of createReadStream(path)) digest.update(chunk); return digest.digest("hex"); }
function runFfmpeg(args: string[]) { const result = spawnSync(ffmpeg, args, { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); if (result.error || result.status !== 0) throw new Error(`Reference failed: ${result.error || result.stderr}`); return `${result.stdout || ""}\n${result.stderr || ""}`; }
