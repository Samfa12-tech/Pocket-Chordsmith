#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

const scriptDirectory = new URL(".", import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(fileURLToPath(new URL("../../..", scriptDirectory)));
const manifestPath = resolve(root, "apps/pocket-daw/test-scope-manifest.json");
const matrixPath = resolve(root, "apps/pocket-daw/docs/TEST_MATRIX.md");
const VALID_CATEGORIES = new Set([
  "unit-domain", "integration", "compatibility-parity", "release-contract", "windows-contract", "browser-e2e", "native-rust", "installed-artifact", "manual-evidence"
]);
const VALID_PLATFORMS = new Set(["linux", "windows", "macos"]);

function repositoryPath(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [repositoryPath(path)];
  });
}

function discoveredTestFiles() {
  const webTests = [
    ...walk(resolve(root, "apps/pocket-daw/tests")),
    ...walk(resolve(root, "apps/pocket-daw/src"))
  ]
    .filter((file) => /(?:\.test\.[cm]?[jt]s|\.spec\.[cm]?[jt]s)$/.test(file));
  const rustTests = walk(resolve(root, "apps/pocket-daw/src-tauri/tests"))
    .filter((file) => file.endsWith(".rs"));
  return [...webTests, ...rustTests].sort();
}

function globToRegExp(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else source += "[^/]*";
    } else if ("\\^$+?.()|{}[]".includes(char)) source += `\\${char}`;
    else source += char;
  }
  return new RegExp(`${source}$`);
}

function matches(pattern, file) {
  return globToRegExp(pattern).test(file);
}

function fail(failures, message) {
  failures.push(message);
}

export function loadManifest(path = manifestPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateTestScopeManifest(manifest, options = {}) {
  const failures = [];
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.tests)) {
    return { ok: false, failures: ["Manifest must provide schemaVersion 1 and a tests array."], selected: [] };
  }
  const entries = new Map();
  for (const [index, entry] of manifest.tests.entries()) {
    const label = `tests[${index}]`;
    if (!entry || typeof entry.file !== "string" || !entry.file.startsWith("apps/pocket-daw/")) fail(failures, `${label} has an invalid file path.`);
    else if (entries.has(entry.file)) fail(failures, `${entry.file} is mapped more than once.`);
    else entries.set(entry.file, entry);
    if (!VALID_CATEGORIES.has(entry?.primaryCategory)) fail(failures, `${label} has an invalid primaryCategory.`);
    if (!Array.isArray(entry?.additionalCategories) || entry.additionalCategories.some((category) => !VALID_CATEGORIES.has(category) || category === entry.primaryCategory)) fail(failures, `${label} has invalid additionalCategories.`);
    if (!Array.isArray(entry?.platforms) || entry.platforms.length === 0 || entry.platforms.some((platform) => !VALID_PLATFORMS.has(platform))) fail(failures, `${label} has invalid platforms.`);
    if (!Array.isArray(entry?.sourcePathPatterns) || entry.sourcePathPatterns.length === 0 || entry.sourcePathPatterns.some((pattern) => typeof pattern !== "string" || !pattern.includes("/"))) fail(failures, `${label} must declare sourcePathPatterns.`);
    for (const key of ["pullRequest", "main", "releasePrepare"]) if (typeof entry?.required?.[key] !== "boolean") fail(failures, `${label}.required.${key} must be boolean.`);
    for (const key of ["installedApp", "hardware", "externalPlugin", "humanJudgment"]) if (typeof entry?.requires?.[key] !== "boolean") fail(failures, `${label}.requires.${key} must be boolean.`);
    if (typeof entry?.ordinaryVitest !== "boolean") fail(failures, `${label}.ordinaryVitest must be boolean.`);
    if (typeof entry?.replacementNotes !== "string" || entry.replacementNotes.length === 0) fail(failures, `${label} must explain retained/replacement coverage.`);
    if (entry?.ordinaryVitest && Object.values(entry?.requires || {}).some(Boolean)) fail(failures, `${entry.file} requires installed/manual/external evidence but is included in ordinary Vitest.`);
    const categories = [entry?.primaryCategory, ...(entry?.additionalCategories || [])];
    if (categories.some((category) => ["release-contract", "native-rust"].includes(category)) && !entry?.required?.releasePrepare) fail(failures, `${entry.file} is release-critical but absent from release:prepare.`);
    if (entry?.required?.releasePrepare && !entry?.required?.main) fail(failures, `${entry.file} is release-required but absent from the full main scope.`);
    if (entry?.file && !existsSync(resolve(root, entry.file))) fail(failures, `Mapped test does not exist: ${entry.file}`);
  }
  const discovered = discoveredTestFiles();
  for (const file of discovered) if (!entries.has(file)) fail(failures, `Unmapped test file: ${file}`);
  for (const file of entries.keys()) if (!discovered.includes(file)) fail(failures, `Mapped file is not a recognized test artifact: ${file}`);

  const changed = options.changed || [];
  const selected = new Set();
  for (const rawPath of changed) {
    const file = rawPath.replaceAll("\\", "/").replace(/^\.\//, "");
    const direct = entries.get(file);
    if (direct) selected.add(direct.file);
    const affected = manifest.tests.filter((entry) => entry.sourcePathPatterns.some((pattern) => matches(pattern, file)));
    affected.forEach((entry) => selected.add(entry.file));
    const sourceLike = /^(apps\/pocket-daw\/(src|scripts|src-tauri)\/|apps\/pocket-daw\/(?:package\.json|vite\.config\.ts|release-status\.json)$|packages\/(?:pocket-audio-core|pcs-format)\/)/.test(file);
    if (sourceLike && !direct && affected.length === 0) {
      const fallback = manifest.tests.filter((entry) => manifest.sourceFallbackPatterns?.some((pattern) => matches(pattern, file)));
      if (fallback.length === 0) fail(failures, `Unknown source path would select no tests: ${file}`);
      else fallback.forEach((entry) => selected.add(entry.file));
    }
  }
  return { ok: failures.length === 0, failures, selected: [...selected].sort(), discovered };
}

export function renderTestMatrix(manifest) {
  const totals = new Map();
  for (const entry of manifest.tests) totals.set(entry.primaryCategory, (totals.get(entry.primaryCategory) || 0) + 1);
  const lines = [
    "# Pocket DAW Test Matrix",
    "",
    "> Generated from `apps/pocket-daw/test-scope-manifest.json` by `node scripts/verify-test-scope-manifest.mjs --write-matrix`. Do not hand-edit this file.",
    "",
    `Current inventory: ${manifest.tests.length} runnable test artifacts. The categories below identify the primary execution contract; evidence-validator tests are deterministic and do not claim that physical/manual evidence has occurred.`,
    "",
    "## Category totals",
    "",
    "| Category | Test artifacts |",
    "| --- | ---: |",
    ...[...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, count]) => `| ${category} | ${count} |`),
    "",
    "## Inventory",
    "",
    "| Test artifact | Primary category | Platforms | PR | Main | Release prepare | Ordinary Vitest | Evidence requirement | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...manifest.tests.map((entry) => {
      const evidence = Object.entries(entry.requires).filter(([, needed]) => needed).map(([name]) => name).join(", ") || "none (validator/fixture only)";
      return `| \`${entry.file}\` | ${entry.primaryCategory} | ${entry.platforms.join(", ")} | ${entry.required.pullRequest ? "yes" : "no"} | ${entry.required.main ? "yes" : "no"} | ${entry.required.releasePrepare ? "yes" : "no"} | ${entry.ordinaryVitest ? "yes" : "no"} | ${evidence} | ${entry.replacementNotes} |`;
    }),
    ""
  ];
  return lines.join("\n");
}

function main(argv) {
  const manifest = loadManifest();
  const changedIndex = argv.indexOf("--changed");
  const changed = changedIndex === -1 ? [] : argv.slice(changedIndex + 1).filter((argument) => !argument.startsWith("--"));
  const result = validateTestScopeManifest(manifest, { changed });
  if (argv.includes("--print-matrix")) process.stdout.write(renderTestMatrix(manifest));
  if (argv.includes("--write-matrix")) writeFileSync(matrixPath, renderTestMatrix(manifest));
  if (!result.ok) throw new Error(`Pocket DAW test-scope manifest failed:\n${result.failures.map((failure) => `- ${failure}`).join("\n")}`);
  if (changed.length > 0 && !argv.includes("--print-matrix")) process.stdout.write(`${JSON.stringify({ changed, selected: result.selected }, null, 2)}\n`);
  else if (!argv.includes("--print-matrix")) process.stdout.write(`Pocket DAW test-scope manifest verified (${result.discovered.length} test artifacts).\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) main(process.argv.slice(2));
