import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const SIDECAR_NAME = "pocket-daw-plugin-host";
export const SIDECAR_PROTOCOL_VERSION = 2;
export const SIDECAR_TARGET = "x86_64-pc-windows-msvc";
export const SIDECAR_BLOCK_FRAMES = 128;
export const VST3_SDK_TAG = "v3.8.0_build_66";
export const VST3_SDK_COMMIT = "9fad9770f2ae8542ab1a548a68c1ad1ac690abe0";
export const VST3_SDK_LICENSE_SHA256 = "d6115b263faa1cdf8c7372d70889c833dde1cec95252e7ee93e4f7d599ec96ca";

// The vendored SDK is textual C/C++ source. Canonicalising CRLF means the
// source lock identifies the same upstream bytes on Windows worktrees without
// accepting any other content change. The staged sidecar itself remains bound
// to its exact raw executable SHA-256.
export function canonicalSdkSourceBytes(path) {
  return Buffer.from(readFileSync(path).toString("latin1").replaceAll("\r\n", "\n"), "latin1");
}

export function hashVendoredSdkTree(sdkRoot, subsets) {
  const files = [];
  const collect = (path) => {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error("VST3 SDK source lock cannot include symlinks.");
    if (info.isFile()) {
      files.push(path);
      return;
    }
    if (!info.isDirectory()) throw new Error("VST3 SDK source lock entries must be files or directories.");
    for (const name of readdirSync(path)) collect(join(path, name));
  };
  for (const subset of subsets) collect(join(sdkRoot, subset));
  const uniqueFiles = [...new Set(files)].sort((left, right) =>
    left.slice(sdkRoot.length + 1).replaceAll("\\", "/").localeCompare(
      right.slice(sdkRoot.length + 1).replaceAll("\\", "/")
    )
  );
  const hash = createHash("sha256");
  for (const path of uniqueFiles) {
    hash.update(path.slice(sdkRoot.length + 1).replaceAll("\\", "/"));
    hash.update(Buffer.from([0]));
    hash.update(canonicalSdkSourceBytes(path));
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

export function stagedSidecarName(target = SIDECAR_TARGET) {
  return `${SIDECAR_NAME}-${target}.exe`;
}

export function validateProbePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Sidecar probe did not return an object.");
  if (payload.component !== SIDECAR_NAME) throw new Error("Sidecar probe component mismatch.");
  if (payload.protocolVersion !== SIDECAR_PROTOCOL_VERSION) throw new Error("Sidecar protocol mismatch.");
  if (payload.transport !== "windowsNamedPipe") throw new Error("Sidecar transport mismatch.");
  if (payload.audioBlockFrames !== SIDECAR_BLOCK_FRAMES) throw new Error("Sidecar audio block size mismatch.");
  if (payload.vst3SdkLinked !== true || payload.scannerAvailable !== true || payload.audioHostingAvailable !== true) {
    throw new Error("Sidecar must expose the SDK-linked isolated scanner and session-audio capabilities.");
  }
  if (payload.vst3SdkTag !== VST3_SDK_TAG || payload.vst3SdkCommit !== VST3_SDK_COMMIT) {
    throw new Error("Sidecar VST3 SDK source pin mismatch.");
  }
  return payload;
}

export function peMachine(bytes) {
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null;
  const header = bytes.readUInt32LE(0x3c);
  if (header + 6 > bytes.length || bytes.toString("ascii", header, header + 4) !== "PE\0\0") return null;
  return bytes.readUInt16LE(header + 4);
}

export function preparePluginHostSidecar({ release = false, checkOnly = false, root = process.cwd() } = {}) {
  if (process.platform !== "win32") throw new Error("Pocket DAW's plug-in host sidecar is Windows-only.");
  const profile = release ? "release" : "debug";
  const binariesDir = join(root, "src-tauri", "binaries");
  const stagedPath = join(binariesDir, stagedSidecarName());
  const metadataPath = join(binariesDir, `${SIDECAR_NAME}-build.json`);
  const sdkLicensePath = join(root, "src-tauri", "third_party", "vst3sdk", "LICENSE.txt");
  const sdkRoot = join(root, "src-tauri", "third_party", "vst3sdk");
  const sdkLock = JSON.parse(readFileSync(join(sdkRoot, "SOURCE_LOCK.json"), "utf8"));

  if (!checkOnly) {
    run("cargo.exe", [
      "build",
      "--manifest-path",
      join("src-tauri", "Cargo.toml"),
      "--bin",
      SIDECAR_NAME,
      ...(release ? ["--release"] : [])
    ], root);
    const builtPath = join(root, "src-tauri", "target", profile, `${SIDECAR_NAME}.exe`);
    if (!existsSync(builtPath)) throw new Error(`Sidecar build output is missing: ${builtPath}`);
    mkdirSync(binariesDir, { recursive: true });
    copyFileSync(builtPath, stagedPath);
  }

  if (!existsSync(stagedPath)) throw new Error("The staged Pocket DAW plug-in host sidecar is missing.");
  const bytes = readFileSync(stagedPath);
  if (!existsSync(sdkLicensePath)) throw new Error("Pinned VST3 SDK license is missing.");
  const licenseHash = createHash("sha256").update(canonicalSdkSourceBytes(sdkLicensePath)).digest("hex");
  if (licenseHash !== VST3_SDK_LICENSE_SHA256) throw new Error("Pinned VST3 SDK license hash mismatch.");
  if (sdkLock.tag !== VST3_SDK_TAG || sdkLock.commit !== VST3_SDK_COMMIT) {
    throw new Error("Pinned VST3 SDK source metadata mismatch.");
  }
  const vendoredTreeHash = hashVendoredSdkTree(sdkRoot, sdkLock.vendoredSubset);
  if (vendoredTreeHash !== sdkLock.vendoredTreeSha256) {
    throw new Error("Pinned VST3 SDK vendored tree hash mismatch.");
  }
  if (peMachine(bytes) !== 0x8664) throw new Error("The staged plug-in host is not a Windows x64 PE executable.");
  const probe = probeSidecar(stagedPath);
  const metadata = {
    component: SIDECAR_NAME,
    protocolVersion: SIDECAR_PROTOCOL_VERSION,
    target: SIDECAR_TARGET,
    profile,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
    vst3SdkLinked: probe.vst3SdkLinked,
    scannerAvailable: probe.scannerAvailable,
    audioHostingAvailable: probe.audioHostingAvailable,
    vst3SdkTag: probe.vst3SdkTag,
    vst3SdkCommit: probe.vst3SdkCommit,
    vst3SdkLicenseSha256: licenseHash,
    vst3SdkVendoredTreeSha256: vendoredTreeHash,
    audioBlockFrames: SIDECAR_BLOCK_FRAMES
  };
  if (!checkOnly) writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`Verified ${basename(stagedPath)} (${metadata.sha256}).`);
  return { stagedPath, metadataPath, metadata, probe };
}

function probeSidecar(path) {
  const result = spawnSync(path, ["--probe"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 2000,
    maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Plug-in host sidecar probe failed.");
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("Plug-in host sidecar probe returned invalid JSON.");
  }
  return validateProbePayload(payload);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", windowsHide: true, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  preparePluginHostSidecar({
    release: process.argv.includes("--release"),
    checkOnly: process.argv.includes("--check")
  });
}
