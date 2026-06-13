import AdmZip from "adm-zip";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { FORBIDDEN_PACKAGE_PARTS } from "./package-itch.mjs";
import { sha256File, walkFiles } from "./hash-release-artifacts.mjs";

const ROOT = process.cwd();
const version = packageJson.version;
const releaseDir = join(ROOT, "releases", "itch");
const portableName = `pocket-daw-windows-x64-v${version}`;
const portableDir = join(releaseDir, portableName);
const zipPath = join(releaseDir, `${portableName}.zip`);
const manifestPath = join(releaseDir, `pocket-daw-release-manifest-v${version}.json`);
const checksumPath = join(releaseDir, `CHECKSUMS_SHA256_v${version}.txt`);

const required = [
  portableDir,
  zipPath,
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

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== version) fail(`Manifest version ${manifest.version} does not match package ${version}`);
if (manifest.schemaVersion !== 2) fail(`Manifest schemaVersion ${manifest.schemaVersion} must remain 2`);
if (manifest.manualItchUpload?.run !== false) fail("Manifest must not claim itch upload was run.");
if (manifest.windowsSmokeTest?.status !== "NOT RUN" && manifest.windowsSmokeTest?.status !== "PASSED" && manifest.windowsSmokeTest?.status !== "FAILED") {
  fail("Manifest has an invalid Windows smoke status.");
}

for (const artifact of manifest.artifacts || []) {
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
  const path = join(ROOT, rel);
  if (!existsSync(path)) fail(`Checksum file references missing artifact: ${rel}`);
  const actual = await sha256File(path);
  if (actual.toLowerCase() !== expected.toLowerCase()) fail(`Checksum mismatch for ${rel}`);
}

const zip = new AdmZip(zipPath);
const entries = zip.getEntries().filter((entry) => !entry.isDirectory).map((entry) => entry.entryName);
for (const name of ["Pocket DAW.exe", "README_FIRST.txt", "RELEASE_NOTES.md", "KNOWN_LIMITATIONS.md", "WINDOWS_SMOKE_CHECKLIST.md", "LICENSE_OR_FREEWARE_NOTICE.txt", "CHECKSUMS_SHA256.txt"]) {
  if (!entries.includes(name)) fail(`Portable ZIP missing root entry ${name}`);
}
if (entries.length <= 2 && entries.every((entry) => /\.(exe|msi)$/i.test(entry))) fail("Portable ZIP appears to be just installer binaries.");
for (const entry of entries) assertNoForbidden(entry, `ZIP entry ${entry}`);
for (const file of walkFiles(portableDir)) assertNoForbidden(file, `portable file ${file}`);

const signedArtifacts = (manifest.artifacts || []).filter((artifact) => /\.(exe|msi)$/i.test(artifact.path));
const unsigned = signedArtifacts.filter((artifact) => artifact.signatureStatus !== "signed");
if (process.env.POCKET_DAW_REQUIRE_SIGNING === "1" && unsigned.length) {
  fail(`Signing required but unsigned artifacts were found: ${unsigned.map((artifact) => artifact.path).join(", ")}`);
}

console.log(`Release artifact verification OK for v${version}`);

function assertNoForbidden(value, label) {
  const lower = value.replace(/\\/g, "/").toLowerCase();
  for (const part of FORBIDDEN_PACKAGE_PARTS) {
    if (lower.includes(part)) fail(`Forbidden ${label}: ${part}`);
  }
  if (basename(lower).endsWith(".pdb")) fail(`Debug symbols must not be packaged: ${label}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
