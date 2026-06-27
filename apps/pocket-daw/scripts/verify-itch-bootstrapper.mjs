import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { BOOTSTRAPPER_MANIFEST_URL, packageItchBootstrapper } from "./package-itch-bootstrapper.mjs";

const result = packageItchBootstrapper();
const files = [result.exePath, result.readmePath, result.indexPath, result.checksumPath];

for (const file of files) {
  if (!existsSync(file)) fail(`Missing bootstrapper artifact: ${file}`);
}

const readme = readFileSync(result.readmePath, "utf8");
if (!readme.includes(BOOTSTRAPPER_MANIFEST_URL)) fail("Bootstrapper README must point at the latest bootstrapper manifest.");
if (!readme.includes("itch channel only needs a new upload when this bootstrapper changes")) {
  fail("Bootstrapper README must explain that normal app updates do not require itch uploads.");
}

const checksums = readFileSync(result.checksumPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
const names = checksums.map((line) => line.replace(/^[a-f0-9]{64}  /i, ""));
for (const name of [basename(result.exePath), "README_FIRST.txt"]) {
  if (!names.includes(name)) fail(`Checksum file is missing ${name}.`);
}
if (!names.includes("index.html")) fail("Checksum file is missing index.html.");

const index = readFileSync(result.indexPath, "utf8");
if (!index.includes(basename(result.exePath))) fail("Fallback index.html must link to the bootstrapper EXE.");
if (!index.includes("Windows installed app")) fail("Fallback index.html must explain Pocket DAW is installed-app only.");

console.log(`Itch bootstrapper verification OK: ${result.uploadDir}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
