import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { validateProbePayload } from "./prepare-plugin-host-sidecar.mjs";

const options = parseArgs(process.argv.slice(2));
const sidecarPath = resolve(options.sidecar);
const outputPath = resolve(options.output);
const metadataPath = resolve(options.candidateMetadata || "src-tauri/target/release/bundle/pocket-daw-plugin-host-build.json");
if (!isAbsolute(options.sidecar)) throw new Error("--sidecar must be the absolute path to the sidecar installed by the candidate installer.");
if (!/pocket-daw-plugin-host(?:-[^\\/]+)?\.exe$/i.test(sidecarPath)) throw new Error("--sidecar must name the installed Pocket DAW plug-in host executable.");

const sidecarBytes = readFileSync(sidecarPath);
const sidecarSha256 = sha256(sidecarBytes);
const candidate = JSON.parse(readFileSync(metadataPath, "utf8"));
if (candidate.sha256 !== sidecarSha256 || candidate.sizeBytes !== sidecarBytes.length) {
  throw new Error("The installed plug-in host does not match the release candidate sidecar metadata.");
}
const probe = probeInstalledSidecar(sidecarPath);
const startedAt = new Date().toISOString();
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const test = spawnSync(cargo, [
  "test",
  "--manifest-path", "src-tauri/Cargo.toml",
  "--test", "vst3_session_process",
  "persistent_session_graph_processes_two_fixture_instances_and_recovers_cleanly",
  "--", "--nocapture", "--test-threads=1"
], {
  cwd: process.cwd(),
  env: { ...process.env, POCKET_DAW_TEST_PLUGIN_HOST_EXE: sidecarPath },
  encoding: "utf8",
  windowsHide: true,
  timeout: 180_000,
  maxBuffer: 8 * 1024 * 1024
});
if (test.error) throw test.error;
if (test.status !== 0) {
  const diagnostic = `${test.stdout || ""}\n${test.stderr || ""}`.trim().slice(-4000);
  throw new Error(`Installed VST3 instrument/effect session smoke failed.\n${diagnostic}`);
}

const summary = {
  schema: 1,
  app: "Pocket DAW",
  appVersion: options.version || packageJson.version,
  startedAt,
  completedAt: new Date().toISOString(),
  result: "pass",
  installer: {
    fileName: basename(options.installer),
    sha256: String(options.installerSha256).toLowerCase()
  },
  pluginHostSidecar: {
    fileName: basename(sidecarPath),
    sha256: sidecarSha256,
    sizeBytes: sidecarBytes.length,
    protocolVersion: probe.protocolVersion,
    audioBlockFrames: probe.audioBlockFrames,
    vst3SdkTag: probe.vst3SdkTag,
    vst3SdkCommit: probe.vst3SdkCommit,
    vst3SdkVendoredTreeSha256: candidate.vst3SdkVendoredTreeSha256,
    vst3SdkLinked: probe.vst3SdkLinked,
    scannerAvailable: probe.scannerAvailable,
    audioHostingAvailable: probe.audioHostingAvailable
  },
  deterministicFixture: {
    scanner: true,
    instrument: true,
    effect: true,
    stateRoundTrip: true,
    parameterAutomation: true,
    factoryPrograms: true,
    latencyAndTail: true,
    editorLifecycle: true,
    unloadReloadRecovery: true
  }
};
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Installed VST3 host smoke passed: ${basename(sidecarPath)} ${sidecarSha256}`);
console.log(`Summary: ${outputPath}`);

function probeInstalledSidecar(path) {
  const result = spawnSync(path, ["--probe"], { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Installed plug-in host probe failed.");
  return validateProbePayload(JSON.parse(result.stdout));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArgs(argv) {
  const parsed = { sidecar: "", output: "", candidateMetadata: "", installer: "", installerSha256: "", version: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!["--sidecar", "--output", "--candidate-metadata", "--installer", "--installer-sha256", "--version"].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = value;
    index += 1;
  }
  for (const key of ["sidecar", "output", "installer", "installerSha256"]) if (!parsed[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  if (!/^[a-f0-9]{64}$/i.test(parsed.installerSha256)) throw new Error("--installer-sha256 must be a SHA-256 digest.");
  return parsed;
}
