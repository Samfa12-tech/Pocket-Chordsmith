#!/usr/bin/env node
/**
 * Manifest-driven Pocket DAW Vitest scopes. Uncertain local or branch mapping
 * deliberately broadens to every deterministic test so optimization cannot
 * turn incomplete Git state into a skip.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";
import { loadManifest, validateTestScopeManifest } from "./verify-test-scope-manifest.mjs";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(appRoot, "..", "..");
const vitest = resolve(appRoot, "node_modules", "vitest", "vitest.mjs");

export function branchChangedFilesGitArgs(base) {
  if (!base) throw new Error("DAW_CHECK_BASE is required for a branch scope.");
  return ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRD", `${base}...HEAD`];
}

export function workingTreeChangedFilesGitArgs() {
  return ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRD", "HEAD"];
}

function splitGitPaths(output) {
  return output.split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"));
}

export function collectChangedFiles(scope, base, cwd = repositoryRoot, runGit = execFileSync) {
  if (scope === "branch") {
    const diff = runGit("git", branchChangedFilesGitArgs(base), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return [...new Set(splitGitPaths(diff))].sort();
  }
  if (scope !== "changed") throw new Error(`Unknown changed-file scope: ${scope}`);

  const diff = runGit("git", workingTreeChangedFilesGitArgs(), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const untracked = runGit("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return [...new Set([...splitGitPaths(diff), ...splitGitPaths(untracked)])].sort();
}

export function resolveChangedScope(scope, base, cwd = repositoryRoot) {
  try {
    return { changed: collectChangedFiles(scope, base, cwd), broadened: false, reason: null };
  } catch (error) {
    return { changed: [], broadened: true, reason: error.message };
  }
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

export function vitestExitCode(result) {
  if (result.error) throw result.error;
  if (Number.isInteger(result.status)) return result.status;
  const cause = result.signal ? `signal ${result.signal}` : "unknown process failure";
  process.stderr.write(`Vitest did not exit normally (${cause}); treating the check as failed.\n`);
  return 1;
}

function main(argv) {
  const scope = argv[0] || "changed";
  const explicitChanged = argv.slice(1).filter((argument) => !argument.startsWith("--"));
  const manifest = loadManifest();
  let changed = explicitChanged;
  let broadened = false;
  if (scope === "changed" && changed.length === 0 || scope === "branch") {
    const resolved = resolveChangedScope(scope, process.env.DAW_CHECK_BASE);
    changed = resolved.changed;
    broadened = resolved.broadened;
    if (broadened) {
      process.stderr.write(`Unable to determine ${scope} paths (${resolved.reason}); running the complete deterministic scope.\n`);
    }
  }
  let tests;
  try {
    tests = selectDawChecks(broadened ? "full" : scope === "branch" ? "changed" : scope, manifest, changed);
  } catch (error) {
    if (scope !== "changed" && scope !== "branch") throw error;
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
  process.exitCode = vitestExitCode(result);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
