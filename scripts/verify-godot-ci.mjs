import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { assertGodotProcessSucceeded } from "./godot-run-result.mjs";
import { assertGodotOwnedLoaderShutdownResult } from "./godot-owned-loader-shutdown-result.mjs";

const root = resolve(import.meta.dirname, "..");
const godotBin = argument("--godot-bin");
const sourceOnly = process.argv.includes("--source-only");
const workspaceParent = sourceOnly ? resolve(root, "local-artifacts/scratch/validation/godot-source-ci") : tmpdir();
if (sourceOnly) mkdirSync(workspaceParent, { recursive: true });
const workspace = mkdtempSync(resolve(workspaceParent, "pocket-audio-godot-ci-"));
console.log(JSON.stringify({ workspace, sourceOnly, retained: sourceOnly, releasePackageCreated: false }));
const environment = { ...process.env };
if (sourceOnly) for (const name of ["APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]) {
  const directory = resolve(workspace, "scoped", name);
  mkdirSync(directory, { recursive: true });
  environment[name] = directory;
}
const addonSource = resolve(root, "addons", "pocket_chordsmith");
const addonTarget = resolve(workspace, "addons", "pocket_chordsmith");

try {
  cpSync(addonSource, addonTarget, {
    recursive: true,
    filter: (path) => !/\.(?:uid|import)$/i.test(path) && !/[\\/]\.godot(?:[\\/]|$)/.test(path),
  });
  writeFileSync(resolve(workspace, "project.godot"), [
    "; Generated temporary CI project",
    "config_version=5",
    "",
    "[application]",
    'config/name="Pocket Audio Godot CI"',
    "",
    "[editor_plugins]",
    'enabled=PackedStringArray("res://addons/pocket_chordsmith/plugin.cfg")',
    "",
  ].join("\n"));

  run(["--headless", "--path", workspace, "--editor", "--quit"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_schema17_contract_test.gd");
  runScript("res://addons/pocket_chordsmith/tests/pcs_trust_boundary_test.gd");
  runScript("res://addons/pocket_chordsmith/tests/pcs_game_pack_mix_contract_test.gd");
  runScript("res://addons/pocket_chordsmith/tests/pcs_prepared_wav_ending_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_prepared_arrangement_ending_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_audio_cache_residency_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_audio_async_loading_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_audio_prepared_worker_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_audio_owned_loader_test.gd", ["--audio-driver", "Dummy"]);
  const shutdown = runScript("res://addons/pocket_chordsmith/tests/pcs_audio_owned_loader_shutdown_test.gd", ["--audio-driver", "Dummy"]);
  assertGodotOwnedLoaderShutdownResult(shutdown.stdout);
  runScript("res://addons/pocket_chordsmith/tests/pcs_prepared_passage_audition_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_prepared_loop_clock_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_stem_origin_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tests/pcs_native_arrangement_chart_test.gd", ["--audio-driver", "Dummy"]);
  runScript("res://addons/pocket_chordsmith/tools/validate_editor_accessibility.gd", ["--audio-driver", "Dummy"]);
  if (sourceOnly) {
    console.log("Godot source-only CI gate passed; packaging deferred and workspace retained.");
  } else {
  runScript("res://addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd", [], [
    "--output",
    "res://pocket-chordsmith-addon.zip",
  ]);

  const zipPath = resolve(workspace, "pocket-chordsmith-addon.zip");
  if (!existsSync(zipPath)) throw new Error("Godot addon packager did not create the expected ZIP");
  const entries = readZipEntries(zipPath);
  for (const required of [
    "addons/pocket_chordsmith/plugin.cfg",
    "addons/pocket_chordsmith/LICENSE",
    "addons/pocket_chordsmith/README.md",
  ]) {
    if (!entries.has(required)) throw new Error(`Addon ZIP is missing ${required}`);
  }
  for (const entry of entries) {
    if (!entry.startsWith("addons/pocket_chordsmith/")) throw new Error(`Addon ZIP escaped addon-only root: ${entry}`);
    if (/\.(?:uid|import)$/i.test(entry) || entry.includes("/.godot/")) throw new Error(`Addon ZIP contains generated metadata: ${entry}`);
  }
  console.log(`Godot CI gate passed with ${entries.size} addon-only package entries.`);
  }
} finally {
  if (!sourceOnly) rmSync(workspace, { recursive: true, force: true });
}

function runScript(script, godotArgs = [], scriptArgs = []) {
  return run([
    "--headless",
    ...godotArgs,
    "--path",
    workspace,
    "--script",
    script,
    ...(scriptArgs.length ? ["--", ...scriptArgs] : []),
  ]);
}

function run(args) {
  const result = spawnSync(godotBin, args, { cwd: workspace, env: environment, encoding: "utf8", timeout: 180_000 });
  if (sourceOnly) {
    const scriptIndex = args.indexOf("--script");
    const label = scriptIndex < 0 ? "import" : args[scriptIndex + 1].split("/").at(-1).replace(/\.gd$/, "");
    writeFileSync(resolve(workspace, label + ".log"), (result.stdout || "") + "\n" + (result.stderr || ""));
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assertGodotProcessSucceeded(result, `Godot ${args.join(" ")}`);
  return result;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value) throw new Error(`Missing ${name}`);
  return resolve(value);
}

function readZipEntries(path) {
  const zip = readFileSync(path);
  const minimumEndSize = 22;
  const searchStart = Math.max(0, zip.length - minimumEndSize - 0xffff);
  let end = -1;
  for (let offset = zip.length - minimumEndSize; offset >= searchStart; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("Addon ZIP has no central directory");
  const directorySize = zip.readUInt32LE(end + 12);
  const directoryOffset = zip.readUInt32LE(end + 16);
  const entries = new Set();
  let offset = directoryOffset;
  while (offset < directoryOffset + directorySize) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid ZIP entry at ${offset}`);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    entries.add(zip.toString("utf8", nameStart, nameStart + nameLength).replaceAll("\\", "/"));
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}
