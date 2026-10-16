import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createGodotExportKit, decodePcmWavBytes } from "../src/index.js";
import { compareCapturedStereoPcm } from "./lib/pcm-parity.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const binIndex = process.argv.indexOf("--godot-bin");
if (binIndex < 0 || !process.argv[binIndex + 1]) throw new Error("Pass --godot-bin with Godot 4.6.3.");
const godot = process.argv[binIndex + 1];
const rendered = process.argv.includes("--rendered");
const hardCutEnding = process.argv.includes("--hard-cut-ending");
const loopKit = process.argv.includes("--loop-kit");
const repetitions = loopKit ? 3 : 1;
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
    melody: { events: [
      { tick: 480, durationTicks: 240, notes: [69], sound: "tape_bell", velocity: 80 },
      // A naturally decaying ending cue detects silence-padded early stops.
      // Nonzero hard-cut endings and repeated section seams have separate gates.
      { tick: 1728, durationTicks: 144, notes: [69], sound: "soft", velocity: 110 }
    ] }
  } } }
};
if (hardCutEnding) {
  source.sections.A.tracks.guitar.events.push({ tick: 1680, durationTicks: 120, notes: [50], sound: "campfire_acoustic", velocity: 110 });
  source.sections.A.tracks.melody.events.pop();
}
const kit = await createGodotExportKit(source, { profile: loopKit ? "LOOP_KIT" : "STEM_SYNC", sampleRate: 48000 });
const referencePath = loopKit ? kit.manifest.sections.A.assets.mix : kit.manifest.assets.mix;
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
\tconfig.load(${JSON.stringify(`res://pack/${referencePath}.import`)})
\tconfig.set_value("params", "edit/loop_mode", ${loopKit ? 0 : 1}) # Default for loop probe; explicit Disabled for ordinary ending gate.
\tconfig.save(${JSON.stringify(`res://pack/${referencePath}.import`)})
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
if (!loopKit && !readFileSync(resolve(pack, `${referencePath}.import`), "utf8").includes("edit/loop_mode=1")) throw new Error("Import discarded the explicit loop choice.");
const output = run([
  ...(rendered ? ["--rendering-method", "gl_compatibility", "--audio-driver", "WASAPI"] : ["--headless", "--audio-driver", "Dummy"]),
  "--script", "res://addons/pocket_chordsmith/tests/pcs_rendered_pack_capture_test.gd", "--", "res://pack/manifest.json", "res://", String(repetitions)
], "capture.log");
const capture = output.split(/\r?\n/).filter((line) => line.startsWith('{"captures"') || line.includes('"test":"rendered-pack-capture"')).map((line) => JSON.parse(line)).at(-1);
if (!capture || capture.mix_rate !== 48000) throw new Error("Missing 48 kHz Godot capture report.");
if (capture.driver !== (rendered ? "WASAPI" : "Dummy")) throw new Error(`Requested audio driver was not used: ${capture.driver}`);
const decoded = decodePcmWavBytes(readFileSync(resolve(pack, referencePath)));
const expected = {...decoded, channels:decoded.channels.map(channel => {
  const repeated = new Float32Array(channel.length * repetitions);
  for(let index=0;index<repetitions;index++) repeated.set(channel,index*channel.length);
  return repeated;
})};
const records = capture.captures.map((item) => compare(item));
if (capture.captures.some((item) => item.mix === "layers" && item.selected_streams !== 6)) throw new Error("The rendered fixture must include five dry stems and a shared bed.");
const report = { route: "Core source -> real recipe WAV pack -> imported profile -> Godot conductor -> engine bus", engine:capture.engine, profile:kit.manifest.profile, repetitions, driver: capture.driver, rendered, ending: hardCutEnding ? "nonzero-hard-cut" : "natural-decay", mixRate: capture.mix_rate, workspace, sourceHashes, sourceWavBytesPreserved: true, explicitLoopChoicePreserved: !loopKit, records, humanListening: "not tested", nativeDawRoute: "not tested by this fixture" };
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
  if (bytes.length % 8) throw new Error(`Captured stereo Float32 bytes are truncated: ${item.file}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const actualFrames = bytes.length / 8;
  const actual = Array.from({ length: 2 }, () => new Float32Array(actualFrames));
  for (let frame = 0; frame < actualFrames; frame += 1) for (let channel = 0; channel < 2; channel += 1) actual[channel][frame] = view.getFloat32(frame * 8 + channel * 4, true);
  const comparison = compareCapturedStereoPcm(actual, expected.channels, expected.sampleRate);
  const short = actual.map((channel) => channel.slice(0, comparison.alignedLatencyFrames + comparison.referenceFrames - 1));
  const padded = actual.map((channel) => channel.slice());
  padded.forEach((channel) => channel.fill(0, comparison.alignedLatencyFrames + comparison.referenceFrames - comparison.tail.frames));
  const rejectsMissingFinalFrame = !compareCapturedStereoPcm(short, expected.channels, expected.sampleRate).passed;
  const rejectsSilencePaddedEnding = !compareCapturedStereoPcm(padded, expected.channels, expected.sampleRate).passed;
  return { ...item, ...comparison, deliberateTruncation: { rejectsMissingFinalFrame, rejectsSilencePaddedEnding }, passed: comparison.passed && comparison.tail.energyRequired && rejectsMissingFinalFrame && rejectsSilencePaddedEnding };
}
