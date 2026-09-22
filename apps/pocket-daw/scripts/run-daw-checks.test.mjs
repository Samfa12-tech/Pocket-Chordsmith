import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { branchChangedFilesGitArgs, collectChangedFiles, resolveChangedScope, selectDawChecks, vitestExitCode, workingTreeChangedFilesGitArgs } from "./run-daw-checks.mjs";
import { loadManifest } from "./verify-test-scope-manifest.mjs";

const manifest = loadManifest();

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function write(root, path, content) {
  const fullPath = join(root, path);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content);
}

test("local and branch checks have distinct package entry points", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.check, "node scripts/run-daw-checks.mjs changed");
  assert.equal(packageJson.scripts["check:branch"], "node scripts/run-daw-checks.mjs branch");
  assert.equal(packageJson.scripts["check:pr"], "node scripts/run-daw-checks.mjs pr");
  assert.ok(existsSync(new URL("./run-daw-checks.mjs", import.meta.url)));
});

test("full and required scopes select only ordinary deterministic tests", () => {
  for (const [scope, predicate] of [
    ["full", () => true],
    ["pr", (entry) => entry.required.pullRequest],
    ["release-source", (entry) => entry.required.releasePrepare],
    ["windows-contract", (entry) => [entry.primaryCategory, ...entry.additionalCategories].includes("windows-contract")]
  ]) {
    const selected = selectDawChecks(scope, manifest);
    assert.deepEqual(selected, manifest.tests.filter((entry) => entry.ordinaryVitest && predicate(entry)));
  }
});

test("changed sources select their mapped tests and unknown scopes fail", () => {
  const changed = selectDawChecks("changed", manifest, ["apps/pocket-daw/src/app/feedback.ts"]);
  assert.ok(changed.length > 0);
  assert.ok(changed.length < manifest.tests.filter((entry) => entry.ordinaryVitest).length);
  assert.throws(() => selectDawChecks("typo", manifest), /Unknown Pocket DAW check scope/);
});

test("Git path discovery includes all statuses and preserves both rename paths", () => {
  assert.deepEqual(workingTreeChangedFilesGitArgs(), ["diff", "--no-renames", "--name-only", "-z", "HEAD"]);
  assert.deepEqual(branchChangedFilesGitArgs("origin/main"), ["diff", "--no-renames", "--name-only", "-z", "origin/main...HEAD"]);
  assert.throws(() => branchChangedFilesGitArgs(""), /DAW_CHECK_BASE is required/);
});

test("local changed scope covers index, worktree, deletions, both rename paths, and relevant untracked source", (context) => {
  const root = mkdtempSync(join(tmpdir(), "daw-check-scope-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Test");
  write(root, ".gitignore", "ignored-output/\n");
  write(root, "apps/pocket-daw/src/existing.ts", "before\n");
  write(root, "apps/pocket-daw/src/deleted.ts", "remove\n");
  write(root, "apps/pocket-daw/src/renamed.ts", "rename\n");
  write(root, "apps/pocket-daw/src/space name.ts", "space\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "baseline");
  const baseline = git(root, "rev-parse", "HEAD");
  write(root, "apps/pocket-daw/src/branch-only.ts", "committed branch change\n");
  git(root, "add", "apps/pocket-daw/src/branch-only.ts");
  git(root, "commit", "-m", "branch source change");
  assert.deepEqual(collectChangedFiles("branch", baseline, root), ["apps/pocket-daw/src/branch-only.ts"]);


  write(root, "apps/pocket-daw/src/staged.ts", "staged\n");
  git(root, "add", "apps/pocket-daw/src/staged.ts");
  write(root, "apps/pocket-daw/src/existing.ts", "edited in worktree\n");
  git(root, "rm", "apps/pocket-daw/src/deleted.ts");
  git(root, "mv", "apps/pocket-daw/src/renamed.ts", "apps/pocket-daw/src/renamed new.ts");
  write(root, "apps/pocket-daw/src/untracked.ts", "untracked\n");
  write(root, "ignored-output/generated.ts", "ignored\n");

  const changed = collectChangedFiles("changed", undefined, root);
  assert.deepEqual(changed, [
    "apps/pocket-daw/src/deleted.ts",
    "apps/pocket-daw/src/existing.ts",
    "apps/pocket-daw/src/renamed new.ts",
    "apps/pocket-daw/src/renamed.ts",
    "apps/pocket-daw/src/staged.ts",
    "apps/pocket-daw/src/untracked.ts"
  ]);
  assert.equal(changed.includes("ignored-output/generated.ts"), false);
  assert.deepEqual(collectChangedFiles("branch", baseline, root), ["apps/pocket-daw/src/branch-only.ts"]);

});

test("invalid branch bases broaden to full scope", () => {
  const root = mkdtempSync(join(tmpdir(), "daw-check-invalid-base-"));
  try {
    git(root, "init", "-b", "main");
    const resolved = resolveChangedScope("branch", "missing-base", root);
    assert.equal(resolved.broadened, true);
    assert.match(resolved.reason, /missing-base/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("abnormal Vitest termination fails closed", () => {
  assert.equal(vitestExitCode({ status: 0, signal: null }), 0);
  assert.equal(vitestExitCode({ status: 3, signal: null }), 3);
  assert.equal(vitestExitCode({ status: null, signal: "SIGTERM" }, () => {}), 1);
  assert.throws(() => vitestExitCode({ status: null, error: new Error("spawn failed") }), /spawn failed/);
});
