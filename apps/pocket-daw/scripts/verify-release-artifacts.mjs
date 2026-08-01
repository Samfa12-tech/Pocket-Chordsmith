import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { FORBIDDEN_PACKAGE_PARTS, ITCH_CHANNEL } from "./package-itch.mjs";
import { sha256File, walkFiles } from "./hash-release-artifacts.mjs";

const ROOT = process.cwd();
const version = packageJson.version;
const releaseDir = join(ROOT, "releases", "itch");
const installersDir = join(releaseDir, "installers");
const manifestPath = join(releaseDir, `pocket-daw-release-manifest-v${version}.json`);
const checksumPath = join(releaseDir, `CHECKSUMS_SHA256_v${version}.txt`);
const thirdPartyNoticesPath = join(ROOT, "src-tauri", "resources", "THIRD_PARTY_NOTICES.txt");

const required = [
  installersDir,
  manifestPath,
  checksumPath,
  join(releaseDir, `README_FIRST_v${version}.txt`),
  join(releaseDir, `RELEASE_NOTES_v${version}.md`),
  join(releaseDir, `KNOWN_LIMITATIONS_v${version}.md`),
  join(releaseDir, `ITCH_PAGE_COPY_v${version}.md`),
  join(releaseDir, `WINDOWS_SMOKE_CHECKLIST_v${version}.md`),
  join(releaseDir, `FINAL_RELEASE_VERDICT_v${version}.md`)
];

for (const path of required) {
  if (!existsSync(path)) fail(`Missing required release artifact: ${path}`);
}

const installerFiles = walkFiles(installersDir);
const setupExe = installerFiles.find((path) => /setup\.exe$/i.test(basename(path)));
const setupSig = setupExe ? installerFiles.find((path) => basename(path).toLowerCase() === `${basename(setupExe).toLowerCase()}.sig`) : null;
const msi = installerFiles.find((path) => /\.msi$/i.test(basename(path)));
const msiSig = msi ? installerFiles.find((path) => basename(path).toLowerCase() === `${basename(msi).toLowerCase()}.sig`) : null;

if (!setupExe) fail("Missing setup EXE installer in releases/itch/installers.");
if (!setupSig) fail("Missing setup EXE .sig updater signature in releases/itch/installers.");
if (!msi) fail("Missing MSI installer in releases/itch/installers.");
if (!msiSig) fail("Missing MSI .sig updater signature in releases/itch/installers.");
assertSignatureFreshness(setupExe, setupSig, "setup EXE");
assertSignatureFreshness(msi, msiSig, "MSI");

for (const file of installerFiles) assertNoForbidden(file, `installer upload file ${file}`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== version) fail(`Manifest version ${manifest.version} does not match package ${version}`);
if (manifest.schemaVersion !== 3) fail(`Manifest schemaVersion ${manifest.schemaVersion} must be 3`);
if (manifest.target?.channel !== ITCH_CHANNEL) fail(`Manifest channel ${manifest.target?.channel} must be ${ITCH_CHANNEL}`);
if (manifest.distribution?.installerOnly !== true) fail("Manifest must mark the release as installer-only.");
if (manifest.distribution?.publicPortableApp !== false) fail("Manifest must explicitly disable public portable app distribution.");
if ("portableZip" in manifest) fail("Manifest must not include portableZip metadata.");
if (manifest.manualItchUpload?.run !== false) fail("Manifest must not claim itch upload was run.");
if (manifest.windowsSmokeTest?.status !== "NOT RUN" && manifest.windowsSmokeTest?.status !== "PASSED" && manifest.windowsSmokeTest?.status !== "FAILED") {
  fail("Manifest has an invalid Windows smoke status.");
}
assertPluginHostSidecar(manifest.pluginHostSidecar);

for (const artifact of manifest.artifacts || []) {
  if (/\.zip$/i.test(artifact.path)) fail(`Manifest includes ZIP artifact; Pocket DAW public distribution is installer-only: ${artifact.path}`);
  if (basename(artifact.path).toLowerCase() === "pocket daw.exe") fail("Manifest includes standalone Pocket DAW.exe portable artifact.");
  if (/(portable|extract-and-run)/i.test(JSON.stringify(artifact))) fail(`Manifest contains portable workflow wording for ${artifact.path}`);
  const path = join(ROOT, artifact.path);
  if (!existsSync(path)) fail(`Manifest artifact does not exist: ${artifact.path}`);
  const actual = await sha256File(path);
  if (actual !== artifact.sha256) fail(`Manifest hash mismatch for ${artifact.path}`);
}

const checksumLines = readFileSync(checksumPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
for (const line of checksumLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/i);
  if (!match) fail(`Bad checksum line: ${line}`);
  const [, expected, rel] = match;
  if (/\.zip$/i.test(rel)) fail(`Checksum file includes ZIP artifact; installer-only release expected: ${rel}`);
  if (basename(rel).toLowerCase() === "pocket daw.exe") fail("Checksum file includes standalone Pocket DAW.exe portable artifact.");
  const path = join(ROOT, rel);
  if (!existsSync(path)) fail(`Checksum file references missing artifact: ${rel}`);
  const actual = await sha256File(path);
  if (actual.toLowerCase() !== expected.toLowerCase()) fail(`Checksum mismatch for ${rel}`);
}

const releaseText = [
  `README_FIRST_v${version}.txt`,
  `RELEASE_NOTES_v${version}.md`,
  `ITCH_PAGE_COPY_v${version}.md`,
  `WINDOWS_SMOKE_CHECKLIST_v${version}.md`,
  `FINAL_RELEASE_VERDICT_v${version}.md`
].map((name) => readFileSync(join(releaseDir, name), "utf8")).join("\n");

[
  "portable Windows ZIP",
  "Run Pocket DAW.exe",
  "download the Windows ZIP",
  "windows-x64"
].forEach((forbidden) => {
  if (releaseText.toLowerCase().includes(forbidden.toLowerCase())) {
    fail(`Release text still contains forbidden portable-app wording: ${forbidden}`);
  }
});

const signedInstallers = (manifest.artifacts || []).filter((artifact) => /\.(exe|msi)$/i.test(artifact.path));
const unsigned = signedInstallers.filter((artifact) => artifact.signatureStatus !== "signed");
if (process.env.POCKET_DAW_REQUIRE_SIGNING === "1" && unsigned.length) {
  fail(`Signing required but unsigned installers were found: ${unsigned.map((artifact) => artifact.path).join(", ")}`);
}

console.log(`Installed-app release artifact verification OK for v${version}`);

function assertNoForbidden(value, label) {
  const lower = value.replace(/\\/g, "/").toLowerCase();
  for (const part of FORBIDDEN_PACKAGE_PARTS) {
    if (lower.includes(part)) fail(`Forbidden ${label}: ${part}`);
  }
  if (basename(lower).endsWith(".pdb")) fail(`Debug symbols must not be packaged: ${label}`);
  if (basename(lower).toLowerCase() === "pocket daw.exe") fail(`Standalone executable must not be packaged as portable app: ${label}`);
  if (/\.zip$/i.test(lower)) fail(`ZIP artifacts are not part of the public installer-only release: ${label}`);
}

function assertSignatureFreshness(installerPath, signaturePath, label) {
  const installerTime = statSync(installerPath).mtimeMs;
  const signatureTime = statSync(signaturePath).mtimeMs;
  if (signatureTime + 1000 < installerTime) {
    fail(`Tauri updater signature for ${label} appears stale. Rebuild with TAURI_SIGNING_PRIVATE_KEY so ${basename(signaturePath)} is regenerated after ${basename(installerPath)}.`);
  }
}

function assertPluginHostSidecar(sidecar) {
  if (!sidecar || sidecar.component !== "pocket-daw-plugin-host") fail("Manifest is missing Pocket DAW plug-in host sidecar metadata.");
  if (sidecar.protocolVersion !== 2) fail("Manifest plug-in host protocol version must be 2.");
  if (sidecar.target !== "x86_64-pc-windows-msvc") fail("Manifest plug-in host target must be Windows x64 MSVC.");
  if (sidecar.profile !== "release") fail("Manifest plug-in host must be a release-profile build.");
  if (sidecar.audioBlockFrames !== 128) fail("Manifest plug-in host audio block size must be 128 frames.");
  if (!/^[a-f0-9]{64}$/.test(sidecar.sha256 || "") || !Number.isSafeInteger(sidecar.sizeBytes) || sidecar.sizeBytes <= 0) {
    fail("Manifest plug-in host hash or size is invalid.");
  }
  if (sidecar.packagingIntent !== "tauriExternalBin") fail("Manifest must record Tauri external-binary packaging intent.");
  if (sidecar.installedProbeStatus !== "NOT RUN" && sidecar.installedProbeStatus !== "PASSED" && sidecar.installedProbeStatus !== "FAILED") {
    fail("Manifest plug-in host installed probe status is invalid.");
  }
  if (!sidecar.vst3SdkLinked && (sidecar.scannerAvailable || sidecar.audioHostingAvailable)) {
    fail("Manifest plug-in host cannot advertise SDK capabilities when the SDK is not linked.");
  }
  if (sidecar.vst3SdkLinked && (!sidecar.scannerAvailable || !sidecar.audioHostingAvailable)) {
    fail("Manifest SDK-linked plug-in host must expose both isolated scanning and session audio hosting.");
  }
  if (sidecar.thirdPartyNoticesRequired !== sidecar.vst3SdkLinked) {
    fail("Manifest plug-in host third-party notice requirement does not match SDK linkage.");
  }
  const baseConfig = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
  const packageConfig = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.package.conf.json"), "utf8"));
  if (baseConfig.bundle?.resources?.["resources/THIRD_PARTY_NOTICES.txt"] !== "THIRD_PARTY_NOTICES.txt") {
    fail("Tauri must install THIRD_PARTY_NOTICES.txt.");
  }
  if (!packageConfig.bundle?.externalBin?.includes("binaries/pocket-daw-plugin-host")) {
    fail("Tauri release packaging must include the Pocket DAW plug-in host external binary.");
  }
  if (!existsSync(thirdPartyNoticesPath)) fail("Installed third-party notices resource is missing.");
  if (sidecar.vst3SdkLinked) {
    const notices = readFileSync(thirdPartyNoticesPath, "utf8");
    if (!/Steinberg VST 3 SDK/i.test(notices) || !/Permission is hereby granted/i.test(notices)) {
      fail("SDK-linked release is missing the installed Steinberg VST 3 SDK MIT notice.");
    }
    if (!sidecar.vst3SdkTag || !/^[a-f0-9]{40}$/.test(sidecar.vst3SdkCommit || "")) {
      fail("SDK-linked release is missing its exact VST3 SDK tag or commit.");
    }
    if (!/^[a-f0-9]{64}$/.test(sidecar.vst3SdkLicenseSha256 || "")) {
      fail("SDK-linked release is missing the pinned VST3 SDK license hash.");
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
