import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const errors = [];
const canonicalAnchors = [
  "addons/pocket_chordsmith/plugin.cfg",
  "apps/chordsmith-web/index.html",
  "apps/pocket-dj/index.html",
  "apps/pocket-daw/package.json",
  "packages/pocket-audio-core/package.json",
  "docs/LOCAL_ARTIFACTS_POLICY.md"
];
const retiredRootDirectories = [
  "archive",
  "godot-addon",
  "marketing-assets",
  "release",
  "releases",
  "_tmp",
  "bin",
  "web-app",
  "pocket_dj",
  "pocket-daw",
  "pocket_audio_core_handoff"
];
const generatedTrackedPattern = /(^|\/)(node_modules|dist|target)(\/|$)|(^|\/)src-tauri\/target(\/|$)|\.(zip|7z|rar|exe|msi|dmg)$/i;

for (const path of canonicalAnchors) {
  if (!existsSync(join(root, path))) errors.push(`Missing canonical anchor: ${path}`);
}

for (const directory of retiredRootDirectories) {
  if (existsSync(join(root, directory))) {
    errors.push(`Retired root artifact directory present: ${directory}/ (use local-artifacts/)`);
  }
}

for (const name of readdirSync(root)) {
  const fullPath = join(root, name);
  if (statSync(fullPath).isFile() && /\.(zip|7z|rar|exe|msi|dmg)$/i.test(name)) {
    errors.push(`Root-level release artifact present: ${name} (use local-artifacts/)`);
  }
}

const localArtifactsRoot = join(root, "local-artifacts");
if (existsSync(localArtifactsRoot)) {
  const allowedArtifactCategories = new Set(["archive", "scratch", "staging"]);
  for (const entry of readdirSync(localArtifactsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !allowedArtifactCategories.has(entry.name)) {
      errors.push(`Unexpected local-artifacts entry: ${entry.name} (use archive/, scratch/, or staging/)`);
    }
  }
}

for (const sourceRoot of ["addons", "apps", "packages", "docs"]) {
  for (const gitDirectory of findDirectories(join(root, sourceRoot), ".git")) {
    errors.push(`Nested Git repository in canonical source: ${relative(root, gitDirectory)}`);
  }
}

let trackedFiles = [];
try {
  trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
} catch (error) {
  errors.push("Unable to inspect tracked files with git ls-files.");
}

for (const path of trackedFiles) {
  if (generatedTrackedPattern.test(path)) {
    errors.push(`Generated or release artifact is tracked: ${path}`);
  }
}

if (errors.length > 0) {
  console.error("Repository organization check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Repository organization check passed.");

function findDirectories(directory, name) {
  if (!existsSync(directory)) return [];
  const matches = [];
  const skippedDirectoryNames = new Set([
    "node_modules",
    "dist",
    "build",
    "target",
    ".git",
    ".godot",
    ".vite",
    "coverage",
    "test-results",
    "playwright-report"
  ]);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    if (entry.name === name) {
      matches.push(path);
      continue;
    }
    if (skippedDirectoryNames.has(entry.name)) continue;
    matches.push(...findDirectories(path, name));
  }
  return matches;
}
