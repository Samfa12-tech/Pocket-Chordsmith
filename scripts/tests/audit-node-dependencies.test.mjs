import assert from "node:assert/strict";
import test from "node:test";
import { auditNodeDependencies } from "../audit-node-dependencies.mjs";

function auditWith({ platform = "linux", env = {}, lockfiles = ["app/package-lock.json"], results = [{ status: 0 }] } = {}) {
  const calls = [];
  const out = [];
  const errors = [];
  let index = 0;
  const result = auditNodeDependencies({
    repositoryRoot: "C:/repo",
    packages: ["app"],
    platform,
    env,
    exists: (path) => lockfiles.includes(path.replaceAll("\\", "/").replace("C:/repo/", "")),
    spawn: (...args) => {
      calls.push(args);
      return results[index++];
    },
    stdout: (line) => out.push(line),
    stderr: (line) => errors.push(line),
  });
  return { result, calls, out, errors };
}

test("audits invoke npm with the high severity threshold and surface success", () => {
  const { result, calls, out } = auditWith();
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "npm");
  assert.deepEqual(calls[0][1], ["audit", "--audit-level=high"]);
  assert.equal(calls[0][2].cwd.replaceAll("\\", "/"), "C:/repo/app");
  assert.deepEqual(out, ["app: dependency audit passed"]);
});

test("missing lockfiles fail closed instead of silently skipping a component", () => {
  const { result, calls, errors } = auditWith({ lockfiles: [] });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.failed, ["app"]);
  assert.equal(calls.length, 0);
  assert.match(errors[0], /package-lock\.json is missing/);
});

test("audit failures and abnormal process termination retain actionable diagnostics", () => {
  const ordinary = auditWith({ results: [{ status: 2 }] });
  assert.equal(ordinary.result.exitCode, 1);
  assert.match(ordinary.errors[0], /failed with exit code 2/);

  const signaled = auditWith({ results: [{ status: null, signal: "SIGTERM" }] });
  assert.equal(signaled.result.exitCode, 1);
  assert.match(signaled.errors[0], /signal SIGTERM/);

  const failedToStart = auditWith({ results: [{ status: null, error: new Error("spawn denied") }] });
  assert.equal(failedToStart.result.exitCode, 1);
  assert.match(failedToStart.errors[0], /spawn denied/);
});

test("Windows audit uses the configured command processor with a fixed npm command", () => {
  const { calls } = auditWith({ platform: "win32", env: { ComSpec: "C:/Windows/cmd.exe" } });
  assert.equal(calls[0][0], "C:/Windows/cmd.exe");
  assert.deepEqual(calls[0][1], ["/d", "/s", "/c", "npm audit --audit-level=high"]);
});
