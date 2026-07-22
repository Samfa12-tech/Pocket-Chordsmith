import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = resolve(".");
const repoRoot = resolve(appRoot, "..", "..");
const distDir = resolve(appRoot, "dist");
const coreRoot = resolve(repoRoot, "packages", "pocket-audio-core");
const bundledCoreRoot = resolve(distDir, "pocket-audio-core");
const outputDir = resolve(repoRoot, "local-artifacts", "staging", "chordsmith-web");
const outputZip = resolve(outputDir, "pocket-chordsmith-web.zip");
const bestzipCli = resolve(appRoot, "node_modules", "bestzip", "bin", "cli.js");
const requiredEntries = [
  "index.html",
  "pocket_chordsmith_v68_core_bridge.html",
  "icon.png",
  "pocket-audio-core/src/index.js",
  "pocket-audio-core/dist/pocket-audio-core.esm.js",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
  return result;
}

function assertInside(parent, child) {
  const pathFromParent = relative(parent, child);
  if (pathFromParent.startsWith("..") || pathFromParent.includes(`..${sep}`)) {
    throw new Error(`Refusing to package path outside ${parent}: ${child}`);
  }
}

function assertExists(entry) {
  const fullPath = resolve(distDir, entry);
  assertInside(distDir, fullPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing required itch package entry: ${entry}`);
  }
}

function readZipEntries(zipPath) {
  const zip = readFileSync(zipPath);
  const minEndOfCentralDirectorySize = 22;
  const maxCommentSize = 0xffff;
  const searchStart = Math.max(0, zip.length - minEndOfCentralDirectorySize - maxCommentSize);
  let endOfCentralDirectory = -1;

  for (let offset = zip.length - minEndOfCentralDirectorySize; offset >= searchStart; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) {
    throw new Error(`Could not find zip central directory in ${zipPath}`);
  }

  const centralDirectorySize = zip.readUInt32LE(endOfCentralDirectory + 12);
  const centralDirectoryOffset = zip.readUInt32LE(endOfCentralDirectory + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  const entries = new Set();
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid zip central directory entry at byte ${offset}`);
    }
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    entries.add(zip.toString("utf8", fileNameStart, fileNameEnd).replace(/\\/g, "/"));
    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

run(process.execPath, [resolve(coreRoot, "scripts", "build.mjs")], { cwd: coreRoot });

rmSync(bundledCoreRoot, { recursive: true, force: true });
mkdirSync(bundledCoreRoot, { recursive: true });
cpSync(resolve(coreRoot, "src"), resolve(bundledCoreRoot, "src"), { recursive: true });
cpSync(resolve(coreRoot, "dist"), resolve(bundledCoreRoot, "dist"), { recursive: true });
cpSync(resolve(appRoot, "icon.png"), resolve(distDir, "icon.png"));

mkdirSync(outputDir, { recursive: true });
for (const entry of requiredEntries) {
  assertExists(entry);
}

run(process.execPath, [bestzipCli, outputZip, "*"], { cwd: distDir });

const zipEntries = readZipEntries(outputZip);
for (const entry of requiredEntries) {
  if (!zipEntries.has(entry)) {
    throw new Error(`Zip is missing required entry: ${entry}`);
  }
}

console.log(`Created ${outputZip}`);
