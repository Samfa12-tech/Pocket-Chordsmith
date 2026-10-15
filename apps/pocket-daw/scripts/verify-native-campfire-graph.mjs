// Real native full-graph output against canonical Core PCM plus the documented
// native dry gain/pan/soft-limit path. No device, host plugin or browser master
// parity is inferred. The Rust test also compares long onsets and seeks exactly.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { renderCampfireAcousticEvent } from "../../../packages/pocket-audio-core/src/sounds/campfire-acoustic.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = resolve(root, "local-artifacts/scratch/validation/native-campfire-graph");
mkdirSync(base, { recursive: true });
const workspace = mkdtempSync(resolve(base, "run-"));
const cargoIndex = process.argv.indexOf("--cargo-bin");
const cargo = cargoIndex >= 0 ? process.argv[cargoIndex + 1] : "cargo";
const run = spawnSync(cargo, ["test", "--locked", "--lib", "native_campfire_full_stereo_graph", "--", "--nocapture"], {
  cwd: resolve(root, "apps/pocket-daw/src-tauri"), encoding: "utf8",
  env: { ...process.env, POCKET_DAW_NATIVE_CAMPFIRE_PARITY_DIR: workspace },
  maxBuffer: 8 * 1024 * 1024
});
writeFileSync(resolve(workspace, "native-test.log"), `${run.stdout || ""}\n${run.stderr || ""}`);
if (run.error || run.status !== 0) throw new Error(`Native graph test failed: ${run.error?.message || run.status}; ${workspace}`);

const f = Math.fround;
function pan(value) {
  const angle = f(f(f(value) + 1) * f(Math.PI / 4));
  return [f(Math.cos(angle)), f(Math.sin(angle))];
}
const center = pan(0), sourcePan = pan(-0.3).map((gain, channel) => f(gain / center[channel])), busPan = pan(0.23);
function graphReference(rate) {
  const mono = renderCampfireAcousticEvent({ midiNotes: [50, 57, 62, 66], velocity: 0.8 }, { sampleRate: rate });
  return Array.from({ length: 2 }, (_, channel) => Float32Array.from(mono, (sample) => {
    if (Math.abs(sample) <= 0.000001) return 0;
    let value = f(sample * sourcePan[channel]);
    value = f(value * f(0.65));
    value = f(value * busPan[channel]);
    value = f(value * f(0.72));
    return f(Math.tanh(value));
  }));
}
const references = new Map([44100, 48000].map((rate) => [rate, graphReference(rate)]));
const records = readdirSync(workspace).filter((file) => file.endsWith(".f32")).map((file) => {
  const [, rateText, onsetText, offsetText, fractionLabel] = /^(\d+)-(\d+)-(-?\d+)(?:-(fraction04|fraction06))?\.f32$/.exec(file) || [];
  if (!rateText) throw new Error(`Unexpected native capture: ${file}`);
  const rate = Number(rateText), offset = Number(offsetText), reference = references.get(rate);
  const bytes = readFileSync(resolve(workspace, file));
  if (bytes.length % 8) throw new Error(`Truncated stereo frames: ${file}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), frames = bytes.length / 8;
  const requiredFrames = Math.round(rate * 1.65) - offset;
  let maxError = 0, squaredError = 0, invalidSamples = 0, peak = 0;
  for (let frame = 0; frame < frames; frame += 1) for (let channel = 0; channel < 2; channel += 1) {
    const sourceFrame = frame + offset;
    const expected = sourceFrame >= 0 ? reference[channel][sourceFrame] || 0 : 0;
    const actual = view.getFloat32(frame * 8 + channel * 4, true);
    if (!Number.isFinite(actual)) { invalidSamples += 1; continue; }
    const delta = Math.abs(actual - expected);
    maxError = Math.max(maxError, delta); squaredError += delta * delta; peak = Math.max(peak, Math.abs(actual));
  }
  const rmsError = Math.sqrt(squaredError / (frames * 2));
  return { file, rate, onsetFrame: Number(onsetText), onsetSubframe: fractionLabel === "fraction04" ? 0.4 : fractionLabel === "fraction06" ? 0.6 : 0, sourceOffsetFrames: offset, frames, requiredFrames, maxError, rmsError, invalidSamples, peak,
    passed: frames === requiredFrames && invalidSamples === 0 && peak > 0.00001 && maxError < 1e-7 && rmsError < 1e-8 };
});
const report = { workspace, route: "Core recipe PCM -> documented native dry gain/pan/soft-limit -> actual native stereo graph", tolerances: { maxSampleError: 1e-7, rmsError: 1e-8 }, fittedLatencyOrGain: false,
  limits: "No installed device/host/master-FX/browser-master/listening claim. Positions are rendered after a short preroll or seek; this does not simulate two hours of uninterrupted callbacks.", records,
  passed: records.length === 30 && records.every((record) => record.passed) };
writeFileSync(resolve(workspace, "parity-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
