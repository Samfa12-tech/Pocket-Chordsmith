#!/usr/bin/env node
/**
 * Small, manifest-driven Pocket DAW Vitest orchestrator.
 *
 * A missing comparison base, a manifest failure, or an unknown changed source
 * file deliberately selects the complete deterministic scope.  This is a
 * safety boundary: optimisation must never turn uncertainty into a skip.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";
import { loadManifest, validateTestScopeManifest } from "./verify-test-scope-manifest.mjs";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(appRoot, "..", "..");
const vitest = resolve(appRoot, "node_modules", "vitest", "vitest.mjs");

function gitChangedFiles() {
  const base = process.env.DAW_CHECK_BASE;
  if (!base) throw new Error("DAW_CHECK_BASE is required for a changed scope.");
  const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return output.split(/\r?\n/).filter(Boolean);
}

export function selectDawChecks(scope, manifest, changedFiles = []) {
  const verified = validateTestScopeManifest(manifest, { changed: changedFiles });
  if (!verified.ok) throw new Error(verified.failures.join("\n"));
  const eligible = (entry) => entry.ordinaryVitest;
  if (scope === "full") return manifest.tests.filter(eligible);
  if (scope === "pr") return manifest.tests.filter((entry) => eligible(entry) && entry.required.pullRequest);
  if (scope === "release-source") return manifest.tests.filter((entry) => eligible(entry) && entry.required.releasePrepare);
  if (scope === "windows-contract") return manifest.tests.filter((entry) => eligible(entry) && [entry.primaryCategory, ...entry.additionalCategories].includes("windows-contract"));
  if (scope === "changed") {
    const selected = new Set(verified.selected);
    return manifest.tests.filter((entry) => eligible(entry) && selected.has(entry.file));
  }
  throw new Error(`Unknown Pocket DAW check scope: ${scope}`);
}

function main(argv) {
  const scope = argv[0] || "changed";
  const explicitChanged = argv.slice(1).filter((argument) => !argument.startsWith("--"));
  const manifest = loadManifest();
  let changed = explicitChanged;
  let broadened = false;
  if (scope === "changed" && changed.length === 0) {
    try {
      changed = gitChangedFiles();
    } catch (error) {
      broadened = true;
      process.stderr.write(`Unable to determine changed paths (${error.message}); running the complete deterministic scope.\n`);
    }
  }
  let tests;
  try {
    tests = selectDawChecks(broadened ? "full" : scope, manifest, changed);
  } catch (error) {
    if (scope !== "changed") throw error;
    broadened = true;
    process.stderr.write(`Changed-scope mapping is uncertain (${error.message}); running the complete deterministic scope.\n`);
    tests = selectDawChecks("full", manifest);
  }
  if (!existsSync(vitest)) throw new Error("Vitest is not installed. Run npm ci before Pocket DAW checks.");
  const paths = tests.map((entry) => relative(appRoot, resolve(repositoryRoot, entry.file)));
  process.stdout.write(`${JSON.stringify({ scope: broadened ? "full (fail-closed fallback)" : scope, changed, testFiles: paths.length }, null, 2)}\n`);
  if (paths.length === 0) {
    process.stdout.write("No deterministic test files are mapped to this changed scope.\n");
    return;
  }
  const result = spawnSync(process.execPath, [vitest, "run", ...paths], { cwd: appRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status || 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
