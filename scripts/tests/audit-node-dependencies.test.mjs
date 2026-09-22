import assert from "node:assert/strict";
import { relative, resolve } from "node:path";
import test from "node:test";
import { auditNodeDependencies } from "../audit-node-dependencies.mjs";

const cleanReport = JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }, vulnerabilities: {} });
const repositoryRoot = resolve("audit-test-root");

function auditWith({ platform = "linux", env = {}, lockfiles = ["app/package-lock.json"], results = [{ status: 0, stdout: cleanReport, stderr: "" }] } = {}) {
  const calls = [];
  const out = [];
  const errors = [];
  let index = 0;
  const result = auditNodeDependencies({
    repositoryRoot,
    packages: ["app"],
    platform,
    env,
    exists: (path) => lockfiles.includes(relative(repositoryRoot, path).replaceAll("\\", "/")),
    spawn: (...args) => {
      calls.push(args);
      return results[index++];
    },
    stdout: (line) => out.push(line),
    stderr: (line) => errors.push(line),
  });
  return { result, calls, out, errors };
}

test("audits request JSON at the high severity threshold and summarize clean reports", () => {
  const { result, calls, out } = auditWith();
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "npm");
  assert.deepEqual(calls[0][1], ["audit", "--json", "--audit-level=high"]);
  assert.equal(calls[0][2].cwd, resolve(repositoryRoot, "app"));
  assert.equal(calls[0][2].stdio[1], "pipe");
  assert.match(out[0], /passed \(0 total advisories/);
});

test("missing lockfiles fail closed instead of silently skipping a component", () => {
  const { result, calls, errors } = auditWith({ lockfiles: [] });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.failed, ["app"]);
  assert.equal(calls.length, 0);
  assert.match(errors[0], /package-lock\.json is missing/);
});

test("high and critical npm advisories are classified with package names", () => {
  const report = JSON.stringify({
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 1, total: 3 } },
    vulnerabilities: {
      "high-package": { severity: "high" },
      "critical-package": { severity: "critical" },
    },
  });
  const { result, errors } = auditWith({ results: [{ status: 1, stdout: report, stderr: "" }] });
  assert.equal(result.exitCode, 1);
  assert.match(errors[0], /1 critical, 1 high/);
  assert.match(errors[0], /high-package, critical-package|critical-package, high-package/);
});

test("moderate advisories pass while legacy high advisories fail", () => {
  const moderate = JSON.stringify({ metadata: { vulnerabilities: { moderate: 2, high: 0, critical: 0, total: 2 } }, vulnerabilities: {} });
  assert.equal(auditWith({ results: [{ status: 0, stdout: moderate, stderr: "" }] }).result.exitCode, 0);
  const legacy = JSON.stringify({ advisories: { 42: { severity: "high", module_name: "legacy-high" } } });
  const failed = auditWith({ results: [{ status: 1, stdout: legacy, stderr: "" }] });
  assert.equal(failed.result.exitCode, 1);
  assert.match(failed.errors[0], /legacy-high/);
  const legacyCritical = JSON.stringify({ advisories: { 43: { severity: "critical", module_name: "legacy-critical" } } });
  const critical = auditWith({ results: [{ status: 1, stdout: legacyCritical, stderr: "" }] });
  assert.match(critical.errors[0], /1 critical, 0 high/);
});

test("registry, malformed JSON, malformed reports, and npm process failures stay distinct", () => {
  const registry = auditWith({ results: [{ status: 1, stdout: JSON.stringify({ error: { code: "ENOAUDIT", summary: "registry unavailable" } }), stderr: "registry transport failed" }] });
  assert.match(registry.errors[0], /registry\/audit service failure: ENOAUDIT: registry unavailable/);
  const secretError = auditWith({ results: [{ status: 1, stdout: JSON.stringify({ error: { summary: "_authToken=private-secret" } }), stderr: "" }] });
  assert.doesNotMatch(secretError.errors[0], /private-secret/);
  assert.match(secretError.errors[0], /\[redacted\]/);
  assert.match(registry.errors[0], /registry transport failed/);

  const serviceErrors = auditWith({ results: [{ status: 1, stdout: JSON.stringify({ errors: { code: "EAI_AGAIN", summary: "dns timeout" } }), stderr: "" }] });
  assert.match(serviceErrors.errors[0], /registry\/audit service failure: EAI_AGAIN: dns timeout/);

  const malformedJson = auditWith({ results: [{ status: 1, stdout: "{broken", stderr: "npm warning" }] });
  assert.match(malformedJson.errors[0], /malformed npm audit JSON response/);
  assert.match(malformedJson.errors[0], /stdout:/);
  assert.match(malformedJson.errors[0], /npm warning/);

  const malformedReport = auditWith({ results: [{ status: 0, stdout: "{}", stderr: "" }] });
  assert.match(malformedReport.errors[0], /metadata\.vulnerabilities is missing/);
  const malformedCounts = auditWith({ results: [{ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 0 } }, vulnerabilities: {} }), stderr: "" }] });
  assert.match(malformedCounts.errors[0], /nonnegative high and critical counts/);
  const malformedPackages = auditWith({ results: [{ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } }, vulnerabilities: [] }), stderr: "" }] });
  assert.match(malformedPackages.errors[0], /vulnerabilities must be a JSON object/);
  const invalidSeverity = auditWith({ results: [{ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } }, vulnerabilities: { pkg: { severity: "unknown" } } }), stderr: "" }] });
  assert.match(invalidSeverity.errors[0], /invalid entry or severity/);
  const inconsistentCounts = auditWith({ results: [{ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } }, vulnerabilities: { pkg: { severity: "high" } } }), stderr: "" }] });
  assert.match(inconsistentCounts.errors[0], /0 critical, 1 high/);

  const processFailure = auditWith({ results: [{ status: null, signal: "SIGTERM", stderr: "cancelled by host" }] });
  assert.match(processFailure.errors[0], /npm audit process failure: terminated by SIGTERM/);
  assert.match(processFailure.errors[0], /cancelled by host/);

  const spawnFailure = auditWith({ results: [{ status: null, error: new Error("spawn denied"), stderr: "" }] });
  assert.match(spawnFailure.errors[0], /npm audit process failure: spawn denied/);
});

test("diagnostics redact credentials and Windows uses a fixed JSON audit command", () => {
  const secret = auditWith({ results: [{ status: null, signal: "SIGTERM", stderr: "_authToken=private-secret Authorization: Bearer also-secret" }] });
  assert.doesNotMatch(secret.errors[0], /private-secret|also-secret/);
  assert.match(secret.errors[0], /\[redacted\]/);
  const jsonSecret = auditWith({ results: [{ status: 0, stdout: JSON.stringify({ token: "json-secret", metadata: {} }), stderr: "" }] });
  assert.doesNotMatch(jsonSecret.errors[0], /json-secret/);

  const { calls } = auditWith({ platform: "win32", env: { ComSpec: "C:/Windows/cmd.exe" } });
  assert.equal(calls[0][0], "C:/Windows/cmd.exe");
  assert.deepEqual(calls[0][1], ["/d", "/s", "/c", "npm audit --json --audit-level=high"]);
});
