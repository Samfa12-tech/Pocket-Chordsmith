// Bounded real-native DSP diagnostic using a retained, unchanged native test
// binary. This is not a new installed application or physical output test.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { projectWithFinishPreset, finishMonitorGains } from "../src/daw/finishing";
import { buildNativeAudioStartPayload } from "../src/native/audioPlayback";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { analyseFinishWav } from "../src/audio/finishAnalysis";
import { decodePcmWavBytes } from "../../../packages/pocket-audio-core/src/export/wav.js";
import { analyseAudioChannels } from "../../../packages/pocket-audio-core/src/export/audio-metrics.js";
import type { PocketDawProject } from "../src/daw/schema";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const argument = (name: string) => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${name}`); return resolve(process.argv[i + 1]); };
const sourceRoot = argument("--retained-source-root"), binary = argument("--native-test-bin"), input = argument("--source-evidence");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : entry.name.endsWith(".rs") ? [join(path, entry.name)] : []);
const nativeRoot = resolve(root, "apps/pocket-daw/src-tauri/src");
const sourceIdentity = walk(nativeRoot).map(path => {
  const name = relative(nativeRoot, path), current = hash(readFileSync(path));
  const retained = hash(readFileSync(resolve(sourceRoot, "apps/pocket-daw/src-tauri/src", name)));
  if (current !== retained) throw new Error(`Native source differs from retained binary source: ${name}`);
  return { path: name.replaceAll("\\", "/"), sha256: current };
});
const output = resolve(root, "local-artifacts/scratch/validation/track-gain-native"); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(output, "run-"));
const sourceBytes = readFileSync(resolve(input, "source-project.json"));
const source = JSON.parse(sourceBytes.toString()) as PocketDawProject, before = JSON.stringify(source);
const retained = JSON.parse(readFileSync(resolve(input, "native-00/input.json"), "utf8"));
const rate = source.project.sampleRate, seconds = 8.8568125, frameCount = Math.round(seconds * rate);
const proposed = projectWithFinishPreset(source, "track_quieter", "guitar");
const expectedRatio = 10 ** (-3 / 20);
if (Math.abs(proposed.tracks.find(track => track.id === "guitar")!.volume / source.tracks.find(track => track.id === "guitar")!.volume - expectedRatio) > 1e-12) throw new Error("Proposal fader delta changed");
function nativeRun(name: string, request: unknown) {
  const target = join(directory, name); mkdirSync(target);
  const path = join(target, "input.json"); writeFileSync(path, JSON.stringify(request));
  const run = spawnSync(binary, ["native_godot_arranged_export_fixture", "--ignored", "--nocapture", "--test-threads=1"], { cwd: resolve(root, "apps/pocket-daw/src-tauri"), encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, POCKET_DAW_NATIVE_GODOT_INPUT: path, POCKET_DAW_NATIVE_GODOT_OUTPUT: target } });
  writeFileSync(join(target, "native.log"), `${run.stdout || ""}\n${run.stderr || ""}`);
  if (run.error || run.status !== 0 || !run.stdout?.includes("1 passed")) throw new Error(`Native diagnostic failed: ${run.error || run.status}`);
  const bytes = readFileSync(join(target, "render.wav")), decoded = decodePcmWavBytes(bytes);
  if (decoded.channels[0].length !== frameCount || decoded.sampleRate !== rate) throw new Error("Native decoded duration/rate changed");
  return { name, file: join(target, "render.wav"), sha256: hash(bytes), decoded, measurements: analyseFinishWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { startSeconds: 0, endSeconds: seconds }) };
}
const renders = [source, proposed].map((project, index) => {
  const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0, { assets: retained.payload.assets, regions: retained.payload.regions });
  return nativeRun(index ? "proposed" : "original", { payload: { ...payload, loop: null, metronome: null }, durationSeconds: seconds, renderMode: "mix-exact", bitDepth: 32 });
});
const gains = finishMonitorGains(renders[0].measurements, renders[1].measurements);
let pcmDifference = 0;
for (let frame = 0; frame < frameCount; frame++) pcmDifference = Math.max(pcmDifference, Math.abs(renders[0].decoded.channels[0][frame] - renders[1].decoded.channels[0][frame]));
if (!(pcmDifference > 1e-5)) throw new Error("Proposal has no measured PCM difference in the retained arrangement");
const matched = renders.map((render, index) => analyseAudioChannels({ ...render.decoded, channels: render.decoded.channels.map((channel: Float32Array) => channel.map(sample => sample * (index ? gains.bGain : gains.aGain))) }));
if (Math.abs(matched[0].integratedLufs! - matched[1].integratedLufs!) > .02) throw new Error("Matched native passages differ in loudness");
const switches = [{ frame: 12000, side: "b", sequence: 1 }, { frame: 12240, side: "a", sequence: 2 }, { frame: 48000, side: "b", sequence: 3 }];
const ids = ["original", "proposed"];
const capture = nativeRun("monitor", { durationSeconds: seconds, monitorCapture: true, switches, payload: { projectTitle: "Selected track gain comparison diagnostic", sampleRate: rate, startSeconds: 0, audition: { endSeconds: seconds }, monitorComparison: { aTrackId: ids[0], bTrackId: ids[1], aGain: gains.aGain, bGain: gains.bGain, side: "a" }, tracks: ids.map(id => ({ id, volume: 1, pan: 0, mute: false, solo: false })), events: [], fxChains: [], assets: renders.map((render, index) => ({ id: ids[index], name: ids[index]+".wav", sourcePath: render.file, sourceHash: render.sha256, sampleRate: rate, channels: 2, durationSeconds: seconds })), regions: ids.map(id => ({ id, assetId: id, trackId: id, startTime: 0, sourceOffset: 0, duration: seconds, gain: 1, pan: 0 })) } });
let blend = 0, targetBlend = 0, ramp = 0, maxError = 0, squaredError = 0;
for (let frame = 0; frame < frameCount; frame++) {
  const change = switches.find(item => item.frame === frame);
  if (change) { targetBlend = change.side === "a" ? 0 : 1; ramp = Math.round(rate * .01); }
  if (ramp) { blend += (targetBlend - blend) / ramp; ramp--; if (!ramp) blend = targetBlend; }
  const fade = Math.max(0, Math.min(1, (frameCount - frame - 1) / (rate * .01)));
  for (let channel = 0; channel < 2; channel++) {
    const expected = (renders[0].decoded.channels[channel][frame] * gains.aGain * (1-blend) + renders[1].decoded.channels[channel][frame] * gains.bGain * blend) * fade;
    const error = Math.abs(capture.decoded.channels[channel][frame] - expected); maxError = Math.max(maxError, error); squaredError += error * error;
  }
}
const clock = JSON.parse(readFileSync(join(directory, "monitor/render.json"), "utf8")).monitorProducerClockEvidence as Array<{ frame: number; renderedFrameCount: number; positionSeconds: number; generation: number }>;
if (maxError > 1e-5 || clock.some(item => item.frame !== item.renderedFrameCount || Math.abs(item.positionSeconds - item.frame/rate) > 1/rate || item.generation !== 17)) throw new Error("Monitor differs from aligned crossfade/clock reference");
if (JSON.stringify(source) !== before) throw new Error("Source project changed");
const report = { passed: true, sourceSha256: hash(sourceBytes), nativeTestBinarySha256: hash(readFileSync(binary)), nativeSourceFiles: sourceIdentity.length, sourceIdentity, frames: frameCount, rate, seconds, expectedRatio, pcmDifference, gains, matchedLufs: matched.map(item => item.integratedLufs), maxError, rmsError: Math.sqrt(squaredError/(frameCount*2)), clock, sourceUnchanged: true, renders: renders.map(({name,file,sha256,measurements}) => ({name,file,sha256,measurements})), scope: "Retained unchanged native DSP test binary; new TypeScript track proposal. Generated arrangement/media/FX/automation fixture. Native offline/producer-clock PCM, not new installed 0.6.53 IPC, physical output or human listening." };
writeFileSync(join(directory, "summary.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ directory, passed: report.passed, frames: frameCount, pcmDifference, matchedLufs: report.matchedLufs, maxError, rmsError: report.rmsError, nativeSourceFiles: report.nativeSourceFiles }));
