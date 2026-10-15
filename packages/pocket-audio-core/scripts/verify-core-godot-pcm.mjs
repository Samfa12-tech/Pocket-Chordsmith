import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createGodotExportKit, decodePcmWavBytes } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const binIndex = process.argv.indexOf("--godot-bin");
if (binIndex < 0 || !process.argv[binIndex + 1]) throw new Error("Pass --godot-bin with Godot 4.6.3.");
const godot = process.argv[binIndex + 1];
const rendered = process.argv.includes("--rendered");
const scratch = resolve(root, "local-artifacts/scratch/validation/core-godot-pcm");
mkdirSync(scratch, { recursive: true });
const workspace = mkdtempSync(resolve(scratch, "run-"));
cpSync(resolve(root, "addons/pocket_chordsmith"), resolve(workspace, "addons/pocket_chordsmith"), {
  recursive: true, filter: (path) => !/\.(uid|import)$/i.test(path) && !/[\\/]\.godot([\\/]|$)/.test(path)
});
writeFileSync(resolve(workspace, "project.godot"), `config_version=5
[application]
config/name="Pocket Audio exported PCM validation"
[audio]
driver/mix_rate=48000
[rendering]
renderer/rendering_method="gl_compatibility"
`);
const source = {
  projectVersion: 17, bpm: 120, timeSig: 4, resolution: 4, songSequence: ["A"], sectionBars: { A: 1 },
  audioProfile: "lofi_chill", lofiPreset: "lofi_koi_pond",
  lofiTexture: { enabled: true, tapeHiss: 0.035, vinylCrackle: 0.025, warmth: 0.1, lowPassAge: 0.2 },
  sections: { A: { tracks: {
    drums: { events: [] }, bass: { events: [] }, chords: { events: [] },
    guitar: { events: [
      { tick: 0, durationTicks: 240, notes: [50, 57, 62, 66], sound: "campfire_acoustic", velocity: 110, direction: "up" },
      { tick: 960, durationTicks: 240, notes: [74], sound: "campfire_acoustic", velocity: 80 }
    ] },
    melody: { events: [{ tick: 480, durationTicks: 240, notes: [69], sound: "tape_bell", velocity: 80 }] }
  } } }
};
const kit = await createGodotExportKit(source, { profile: "STEM_SYNC", sampleRate: 48000 });
const pack = resolve(workspace, "pack");
mkdirSync(pack);
const sourceHashes = {};
for (const [path, blob] of kit.files) {
  const file = resolve(pack, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));
  sourceHashes[path] = createHash("sha256").update(readFileSync(file)).digest("hex");
}
writeFileSync(resolve(pack, "manifest.json"), JSON.stringify(kit.manifest, null, 2));
writeFileSync(resolve(pack, "source-project.json"), JSON.stringify(source, null, 2));
run(["--headless", "--editor", "--quit"], "import.log");
writeFileSync(resolve(workspace, "prepare-pack.gd"), `extends SceneTree
const Tools = preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
func _init():
\tvar config = ConfigFile.new()
\tconfig.load("res://pack/audio/full/full_mix.wav.import")
\tconfig.set_value("params", "edit/loop_mode", 1) # Explicit Disabled choice must survive.
\tconfig.save("res://pack/audio/full/full_mix.wav.import")
\tvar result = Tools.new().create_playback_profile_from_game_pack_manifest("res://pack/manifest.json", "", "res://pack")
\tprint(JSON.stringify({"ok": result.ok, "errors": result.errors, "wav_import_paths": result.get("wav_import_paths", [])}))
\tquit(0 if result.ok else 1)
`);
run(["--headless", "--script", "res://prepare-pack.gd"], "prepare-pack.log");
run(["--headless", "--editor", "--quit"], "lossless-reimport.log");
for (const path of kit.files.keys()) {
  const settings = readFileSync(resolve(pack, `${path}.import`), "utf8");
  if (!settings.includes("compress/mode=0") || !settings.includes("edit/normalize=false") || !settings.includes("force/max_rate=false")) throw new Error(`Lossless import settings were not applied: ${path}`);
  if (createHash("sha256").update(readFileSync(resolve(pack, path))).digest("hex") !== sourceHashes[path]) throw new Error(`Import changed source WAV bytes: ${path}`);
}
if (!readFileSync(resolve(pack, `${kit.manifest.assets.mix}.import`), "utf8").includes("edit/loop_mode=1")) throw new Error("Import discarded the explicit loop choice.");
const output = run([
  ...(rendered ? ["--rendering-method", "gl_compatibility", "--audio-driver", "WASAPI"] : ["--headless", "--audio-driver", "Dummy"]),
  "--script", "res://addons/pocket_chordsmith/tests/pcs_rendered_pack_capture_test.gd", "--", "res://pack/manifest.json", "res://"
], "capture.log");
const capture = output.split(/\r?\n/).filter((line) => line.startsWith('{"captures"') || line.includes('"test":"rendered-pack-capture"')).map((line) => JSON.parse(line)).at(-1);
if (!capture || capture.mix_rate !== 48000) throw new Error("Missing 48 kHz Godot capture report.");
const expected = decodePcmWavBytes(readFileSync(resolve(pack, kit.manifest.assets.mix)));
const records = capture.captures.map((item) => compare(item));
if (capture.captures.some((item) => item.mix === "layers" && item.selected_streams !== 6)) throw new Error("The rendered fixture must include five dry stems and a shared bed.");
const report = { route: "Core source -> real recipe WAV pack -> imported profile -> Godot conductor -> engine bus", driver: capture.driver, rendered, mixRate: capture.mix_rate, workspace, sourceHashes, sourceWavBytesPreserved: true, explicitLoopChoicePreserved: true, records, humanListening: "not tested", nativeDawRoute: "not tested by this fixture" };
writeFileSync(resolve(workspace, "parity-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (records.some((item) => !item.passed)) process.exitCode = 1;

function run(args, log) {
  const result = spawnSync(godot, ["--path", workspace, ...args], { encoding: "utf8", timeout: 180000 });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  writeFileSync(resolve(workspace, log), output);
  if (result.error || result.status !== 0) throw new Error(`${log}: ${result.error || `Godot exited ${result.status}`}\n${output.slice(-3000)}`);
  return output;
}

function compare(item) {
  const bytes = readFileSync(resolve(workspace, item.file));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const actualFrames = bytes.length / 8;
  const actual = Array.from({ length: 2 }, () => new Float32Array(actualFrames));
  for (let frame = 0; frame < actualFrames; frame += 1) for (let channel = 0; channel < 2; channel += 1) actual[channel][frame] = view.getFloat32(frame * 8 + channel * 4, true);
  const maxLag = Math.min(24000, actualFrames - 1024);
  let bestLag = 0, bestError = Infinity;
  for (let lag = 0; lag <= maxLag; lag += 1) {
    let error = 0;
    for (let frame = 0; frame < 1024; frame += 8) {
      const delta = actual[0][frame + lag] - expected.channels[0][frame];
      error += delta * delta;
    }
    if (error < bestError) { bestError = error; bestLag = lag; }
  }
  const frames = Math.min(actualFrames - bestLag, expected.channels[0].length);
  let maxError = 0, sumError = 0, peak = 0;
  for (let channel = 0; channel < 2; channel += 1) for (let frame = 0; frame < frames; frame += 1) {
    const value = actual[channel][frame + bestLag];
    const error = Math.abs(value - expected.channels[channel][frame]);
    maxError = Math.max(maxError, error);
    sumError += error * error;
    peak = Math.max(peak, Math.abs(value));
  }
  const rmsError = Math.sqrt(sumError / (frames * 2));
  return { ...item, comparedFrames: frames, referenceFrames: expected.channels[0].length, alignedLatencyFrames: bestLag, maxError, rmsError, capturedPeak: peak, passed: frames >= expected.channels[0].length * 0.9 && peak > 0.001 && maxError < 8 / 32767 && rmsError < 2 / 32767 };
}
