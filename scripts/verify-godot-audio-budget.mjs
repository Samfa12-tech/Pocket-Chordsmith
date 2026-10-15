// Manual, synthetic loading/game-SFX measurement; never installed/listening proof.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { decodePcmWavBytes, encodePcm16WavBytes } from "../packages/pocket-audio-core/src/export/wav.js";

const root = resolve(import.meta.dirname, "..");
const godot = argument("--godot-bin"), source = argument("--native-wav");
const headless = process.argv.includes("--headless");
const driverIndex = process.argv.indexOf("--driver");
const driver = driverIndex >= 0 ? process.argv[driverIndex + 1] : headless ? "Dummy" : "WASAPI";
if (!driver || driver.startsWith("--")) throw new Error("Expected --driver value.");
if (statSync(source).size > 128 * 1024 * 1024) throw new Error("Source fixture exceeds 128 MiB.");
const sourceBytes = readFileSync(source), decoded = decodePcmWavBytes(sourceBytes);
if (decoded.sampleRate !== 48000 || decoded.channels.length !== 2 || !decoded.channels[0].length) throw new Error("Use nonempty stereo 48 kHz PCM WAV fixture.");
const area = resolve(root, "local-artifacts/scratch/validation/godot-runtime-budget");
mkdirSync(area, { recursive: true });
const workspace = mkdtempSync(resolve(area, headless ? "cpu-" : "rendered-"));
cpSync(resolve(root, "addons/pocket_chordsmith"), resolve(workspace, "addons/pocket_chordsmith"), {
  recursive: true, filter: path => !/\.(?:uid|import)$/i.test(path) && !/[\\/]\.godot(?:[\\/]|$)/.test(path)
});
writeFileSync(resolve(workspace, "project.godot"), 'config_version=5\n[application]\nconfig/name="Pocket Audio synthetic runtime budget"\n[audio]\ndriver/mix_rate=48000\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
const channels = decoded.channels.map(channel => Float32Array.from({ length: 48000 * 60 }, (_, frame) => channel[frame % channel.length]));
const fixture = encodePcm16WavBytes({ channels, sampleRate: 48000 });
for (let index = 0; index < 8; index++) {
  const path = resolve(workspace, `long-stem-${index}.wav`);
  writeFileSync(path, fixture);
  writeFileSync(`${path}.import`, '[remap]\nimporter="wav"\ntype="AudioStreamWAV"\n[params]\nforce/8_bit=false\nforce/mono=false\nforce/max_rate=false\nedit/normalize=false\nedit/trim=false\ncompress/mode=0\n');
}
const pulse = Float32Array.from({ length: 4800 }, (_, frame) => Math.sin(frame * Math.PI * 2 * 887 / 48000) * 0.3 * Math.sin(Math.PI * frame / 4800));
writeFileSync(resolve(workspace, "sfx.wav"), encodePcm16WavBytes({ channels: [pulse, pulse], sampleRate: 48000 }));
run(["--headless", "--editor", "--quit"], "import.log");
run([...(headless ? ["--headless"] : []), "--audio-driver", driver, "--max-fps", "60", "--script", "res://addons/pocket_chordsmith/tools/measure_runtime_audio_budget.gd"], "runtime.log");
const measured = JSON.parse(readFileSync(resolve(workspace, "runtime-budget.json"), "utf8"));
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, max: sorted.at(-1), p95: sorted[Math.floor(sorted.length * 0.95)] };
};
const summary = { workspace, sourceSha256: hash(sourceBytes), fixtureSha256: hash(fixture), headless, requestedDriver: driver, driver: measured.driver,
  cold: measured.cold, coldFramesMs: stats(measured.cold_frame_gaps_ms),
  baselineFramesMs: stats(measured.baseline_frame_gaps_ms), musicFramesMs: stats(measured.music_frame_gaps_ms), gameSfxFramesMs: stats(measured.game_frame_gaps_ms),
  warmPlayMs: stats(measured.warm_play_ms), residentPcmBytes: measured.resident_pcm_bytes, residentStreams: measured.resident_streams,
  sfxRequests: measured.game_sfx_requests, sfxPeak: measured.game_sfx_peak,
  budgets: {
    mainThreadPreparationWithinOne60HzFrame: measured.cold.max_asset_load_us <= 1000000 / 60,
    warmPlayUnder2Ms: Math.max(...measured.warm_play_ms) < 2,
    baselineFramesUnder33Ms: Math.max(...measured.baseline_frame_gaps_ms) < 1000 / 30,
    gameSfxFramesUnder33Ms: Math.max(...measured.game_frame_gaps_ms) < 1000 / 30,
    residentPreparedPcmWithinFixtureBound: measured.resident_pcm_bytes <= 8 * (48000 * 60 * 4 + 132 * 4)
  },
  scope: "Synthetic 2D moving-label scene, eight unique 60-second PCM16 assets derived from supplied WAV, four playing music layers and periodic generated SFX. First conductor load; OS file cache is not flushed. Static memory is not process working set or a peak. No full-game, installed Tauri, device-consumed, human listening or physical recording acceptance. Timing is measured, not a universal pass." };
writeFileSync(resolve(workspace, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (measured.driver !== driver || !measured.cold.ok || measured.cold.loaded !== 8 || measured.resident_streams !== 8 || !measured.no_autoplay_after_prewarm
  || measured.game_sfx_requests < 1 || measured.game_sfx_peak <= 0.001 || !summary.budgets.residentPreparedPcmWithinFixtureBound) throw new Error(`Incomplete fixture/PCM preparation; see ${workspace}`);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error(`Missing ${name}`);
  return resolve(process.argv[index + 1]);
}
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function run(args, log) {
  const result = spawnSync(godot, ["--path", workspace, ...args], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(resolve(workspace, log), `${result.stdout || ""}\n${result.stderr || ""}`);
  if (result.error || result.status !== 0) throw new Error(`${log}: ${result.error || result.status}; evidence retained in ${workspace}`);
}
