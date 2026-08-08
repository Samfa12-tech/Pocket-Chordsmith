import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const NATIVE_CAPTURE_FINGERPRINT_SCHEMA = "pocket-daw-native-capture-v1";

const FULL_SOURCE_INPUTS = Object.freeze([
  "src-tauri/src/native_recording.rs",
  "src/native/recordingBridge.ts",
  "src/native/audioDevices.ts",
  "src/daw/recordingInputs.ts",
  "src/app/recordingOrchestration.ts"
]);

const SOURCE_REGIONS = Object.freeze([
  {
    id: "src/app/App.ts#startRecording",
    path: "src/app/App.ts",
    start: "  private async startRecording() {",
    end: "\n  private async toggleMidiInputRecording()"
  },
  {
    id: "src/app/App.ts#stopRecording",
    path: "src/app/App.ts",
    start: "  private async stopRecording() {",
    end: "\n  private startRecordingTimer()"
  },
  {
    id: "src/app/App.ts#armedInputPreview",
    path: "src/app/App.ts",
    start: "  private async syncArmedInputPreview(preferredTrackId?: string) {",
    end: "\n  private seekTimelineFromClientX("
  },
  {
    id: "src-tauri/src/lib.rs#audioDeviceProbe",
    path: "src-tauri/src/lib.rs",
    start: "#[derive(serde::Serialize)]\nstruct AudioProbeResult",
    end: "\nfn file_label("
  }
]);

export function computeNativeCaptureFingerprint(root = process.cwd()) {
  const inputs = [];
  for (const relativePath of FULL_SOURCE_INPUTS) {
    inputs.push(inputRecord(relativePath, readText(root, relativePath)));
  }
  for (const region of SOURCE_REGIONS) {
    inputs.push(inputRecord(region.id, extractRegion(readText(root, region.path), region)));
  }
  inputs.push(inputRecord("src-tauri/src/lib.rs#nativeRecordingRegistration", nativeRegistration(readText(root, "src-tauri/src/lib.rs"))));
  inputs.push(inputRecord("src-tauri/Cargo.toml#cpal", tomlDependency(readText(root, "src-tauri/Cargo.toml"), "cpal")));
  inputs.push(inputRecord("src-tauri/Cargo.lock#cpalDependencyClosure", cargoDependencyClosure(readText(root, "src-tauri/Cargo.lock"), "cpal")));
  inputs.push(inputRecord("package.json#@tauri-apps/api", jsonDependency(readText(root, "package.json"), "@tauri-apps/api")));
  inputs.push(inputRecord("package-lock.json#@tauri-apps/api", packageLockDependency(readText(root, "package-lock.json"), "node_modules/@tauri-apps/api")));
  inputs.sort((left, right) => left.id.localeCompare(right.id));
  const value = sha256(JSON.stringify({ schema: NATIVE_CAPTURE_FINGERPRINT_SCHEMA, inputs }));
  return { schema: NATIVE_CAPTURE_FINGERPRINT_SCHEMA, algorithm: "sha256", value, inputs };
}

export function sameNativeCaptureFingerprint(left, right) {
  return canonicalFingerprint(left) === canonicalFingerprint(right);
}

function canonicalFingerprint(value) {
  if (!value || typeof value !== "object") return "";
  return JSON.stringify({
    schema: value.schema,
    algorithm: value.algorithm,
    value: String(value.value || "").toLowerCase(),
    inputs: Array.isArray(value.inputs)
      ? value.inputs.map((entry) => ({ id: entry?.id, sha256: String(entry?.sha256 || "").toLowerCase() }))
      : null
  });
}

function readText(root, relativePath) {
  return normalizeText(readFileSync(resolve(root, relativePath), "utf8"));
}

function normalizeText(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function inputRecord(id, content) {
  return { id, sha256: sha256(normalizeText(content)) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function extractRegion(source, region) {
  const startIndex = source.indexOf(region.start);
  if (startIndex < 0) throw new Error(`Native capture fingerprint start marker is missing: ${region.id}`);
  if (source.indexOf(region.start, startIndex + region.start.length) >= 0) throw new Error(`Native capture fingerprint start marker is ambiguous: ${region.id}`);
  const endIndex = source.indexOf(region.end, startIndex + region.start.length);
  if (endIndex < 0) throw new Error(`Native capture fingerprint end marker is missing: ${region.id}`);
  return source.slice(startIndex, endIndex).trimEnd();
}

function nativeRegistration(source) {
  const lines = source.split("\n").filter((line) => line.includes("native_recording"));
  if (lines.length < 8) throw new Error("Native capture fingerprint could not find the complete native_recording registration surface.");
  return lines.map((line) => line.trim()).join("\n");
}

function tomlDependency(source, name) {
  const matches = source.split("\n").filter((line) => new RegExp(`^${escapeRegExp(name)}\\s*=`).test(line.trim()));
  if (matches.length !== 1) throw new Error(`Native capture fingerprint expected exactly one ${name} Cargo dependency declaration.`);
  return matches[0].trim();
}

function jsonDependency(source, name) {
  const parsed = JSON.parse(source);
  const value = parsed?.dependencies?.[name];
  if (typeof value !== "string" || !value) throw new Error(`Native capture fingerprint is missing package.json dependency ${name}.`);
  return JSON.stringify({ name, value });
}

function packageLockDependency(source, key) {
  const parsed = JSON.parse(source);
  const value = parsed?.packages?.[key];
  if (!value || typeof value !== "object") throw new Error(`Native capture fingerprint is missing package-lock entry ${key}.`);
  return JSON.stringify(value, Object.keys(value).sort());
}

function cargoDependencyClosure(source, rootName) {
  const packages = source.split(/^\[\[package\]\]\s*$/m).slice(1).map((block) => {
    const normalized = normalizeText(block).trim();
    const name = normalized.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = normalized.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || "";
    const dependenciesBlock = normalized.match(/^dependencies\s*=\s*\[([\s\S]*?)^\]/m)?.[1] || "";
    const dependencies = [...dependenciesBlock.matchAll(/^\s*"([^"]+)"/gm)].map((match) => dependencyNameAndVersion(match[1]));
    return { name, version, normalized, dependencies };
  }).filter((entry) => entry.name);
  const byName = new Map();
  for (const entry of packages) byName.set(entry.name, [...(byName.get(entry.name) || []), entry]);
  const roots = byName.get(rootName) || [];
  if (roots.length !== 1) throw new Error(`Native capture fingerprint expected exactly one ${rootName} Cargo.lock package.`);
  const selected = new Map();
  const pending = [...roots];
  while (pending.length) {
    const entry = pending.pop();
    const key = `${entry.name}@${entry.version}`;
    if (selected.has(key)) continue;
    selected.set(key, entry.normalized);
    for (const dependency of entry.dependencies) {
      const candidates = (byName.get(dependency.name) || []).filter((candidate) => !dependency.version || candidate.version === dependency.version);
      for (const candidate of candidates) pending.push(candidate);
    }
  }
  return [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, block]) => block).join("\n\n[[package]]\n");
}

function dependencyNameAndVersion(value) {
  const match = value.match(/^(.+?)\s+(\d+\.\d+\.\d+(?:[-+][^ ]+)?)\b/);
  return match ? { name: match[1], version: match[2] } : { name: value, version: "" };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] && process.argv[1].endsWith("native-capture-fingerprint.mjs")) {
  try {
    console.log(JSON.stringify(computeNativeCaptureFingerprint(process.cwd()), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
