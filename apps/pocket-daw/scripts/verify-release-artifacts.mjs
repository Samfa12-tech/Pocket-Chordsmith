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
if (manifest.schemaVersion !== 2) fail(`Manifest schemaVersion ${manifest.schemaVersion} must remain 2`);
if (manifest.target?.channel !== ITCH_CHANNEL) fail(`Manifest channel ${manifest.target?.channel} must be ${ITCH_CHANNEL}`);
if (manifest.distribution?.installerOnly !== true) fail("Manifest must mark the release as installer-only.");
if (manifest.distribution?.publicPortableApp !== false) fail("Manifest must explicitly disable public portable app distribution.");
if ("portableZip" in manifest) fail("Manifest must not include portableZip metadata.");
if (manifest.manualItchUpload?.run !== false) fail("Manifest must not claim itch upload was run.");
if (manifest.windowsSmokeTest?.status !== "NOT RUN" && manifest.windowsSmokeTest?.status !== "PASSED" && manifest.windowsSmokeTest?.status !== "FAILED") {
  fail("Manifest has an invalid Windows smoke status.");
}

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

function fail(message) {
  console.error(message);
  process.exit(1);
}
