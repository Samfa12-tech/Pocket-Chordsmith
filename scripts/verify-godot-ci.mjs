import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const godotBin = argument("--godot-bin");
const workspace = mkdtempSync(resolve(tmpdir(), "pocket-audio-godot-ci-"));
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
  runScript("res://addons/pocket_chordsmith/tools/validate_editor_accessibility.gd", ["--audio-driver", "Dummy"]);
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
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

function runScript(script, godotArgs = [], scriptArgs = []) {
  run([
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
  const result = spawnSync(godotBin, args, { cwd: workspace, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Godot ${args.join(" ")} failed with status ${result.status}`);
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
