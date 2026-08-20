#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./verify-test-scope-manifest.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const appRoot = resolve(root, "apps/pocket-daw");
const destination = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, "local-artifacts/test-profiles/pocket-daw-vitest-baseline.json");
const rawDestination = destination.replace(/\.json$/i, ".vitest.json");
const logDestination = destination.replace(/\.json$/i, ".vitest.log");

mkdirSync(dirname(destination), { recursive: true });
const manifest = loadManifest();
const deterministicTests = manifest.tests
  .filter((entry) => entry.ordinaryVitest)
  .map((entry) => relative(appRoot, resolve(root, entry.file)));
const startedAt = new Date().toISOString();
const started = performance.now();
// Keep Vitest's human reporter alongside JSON: unhandled worker errors can make
// the process fail without an assertion-level JSON failure record.
const vitestArgs = [join(appRoot, "node_modules/vitest/vitest.mjs"), "run", ...deterministicTests, "--reporter=json", "--reporter=default", "--outputFile", rawDestination];
const command = spawnSync(process.execPath, vitestArgs, {
  cwd: appRoot,
  encoding: "utf8"
});
const commandError = command.error ? command.error.message : null;
const commandOutput = `${command.stdout || ""}${command.stderr || ""}`;
writeFileSync(logDestination, commandOutput);
if (command.stdout) process.stdout.write(command.stdout);
if (command.stderr) process.stderr.write(command.stderr);
const elapsedMs = Math.round(performance.now() - started);
const raw = existsSync(rawDestination) ? JSON.parse(readFileSync(rawDestination, "utf8")) : {};
const categoryFor = (name) => manifest.tests.find((entry) => entry.file === `apps/pocket-daw/${name.replaceAll("\\", "/")}`)?.primaryCategory || "unclassified";
const testResults = raw.testResults || [];
const files = testResults.map((result) => {
  const assertions = result.assertionResults || [];
  const durationMs = assertions.reduce((sum, assertion) => sum + (Number(assertion.duration) || 0), 0);
  return { file: relative(appRoot, result.name).replaceAll("\\", "/"), category: categoryFor(relative(appRoot, result.name)), durationMs, testCases: assertions.length, failures: assertions.filter((assertion) => assertion.status === "failed").map((assertion) => assertion.fullName) };
});
const categoryTotals = Object.groupBy(files, (file) => file.category);
const reporterFailures = testResults.flatMap((result) => {
  const file = relative(appRoot, result.name || "unknown").replaceAll("\\", "/");
  const assertions = result.assertionResults || [];
  const assertionFailures = assertions
    .filter((assertion) => assertion.status === "failed")
    .map((assertion) => ({ file, test: assertion.fullName || assertion.title || "unnamed assertion", message: assertion.failureMessages || [] }));
  const suiteMessage = result.failureMessage || result.message;
  return suiteMessage && assertionFailures.length === 0
    ? [{ file, test: "suite failure", message: Array.isArray(suiteMessage) ? suiteMessage : [String(suiteMessage)] }]
    : assertionFailures;
});
const rawCounts = {
  failedTests: Number(raw.numFailedTests) || 0,
  failedSuites: Number(raw.numFailedTestSuites) || 0,
  pendingTests: Number(raw.numPendingTests) || 0,
  pendingSuites: Number(raw.numPendingTestSuites) || 0
};
const unattributedFailure = (command.status !== 0 || raw.success === false) && reporterFailures.length === 0
  ? [{
      file: "<vitest-process>",
      test: "unattributed Vitest failure",
      message: [
        `Vitest exited with status ${command.status ?? "unknown"}${command.signal ? ` (signal ${command.signal})` : ""}.`,
        `Raw JSON: ${rawDestination}`,
        `Process output: ${logDestination}`
      ]
    }]
  : [];
const profile = {
  schemaVersion: 2,
  command: [process.execPath, ...vitestArgs],
  startedAt,
  elapsedMs,
  passed: commandError === null && command.status === 0 && raw.success === true,
  process: {
    status: command.status,
    signal: command.signal,
    error: commandError,
    rawReport: rawDestination,
    outputLog: logDestination
  },
  totals: {
    files: files.length,
    testCases: files.reduce((sum, file) => sum + file.testCases, 0),
    failures: [...reporterFailures, ...unattributedFailure],
    reporter: rawCounts,
    retries: null,
    setupMs: null,
    collectionMs: null,
    note: "Vitest JSON does not expose setup, collection, or retry timing in this version; null records that limitation rather than inventing measurements."
  },
  categories: Object.fromEntries(Object.entries(categoryTotals).map(([category, entries]) => [category, { files: entries.length, testCases: entries.reduce((sum, entry) => sum + entry.testCases, 0) }])),
  slowestFiles: [...files].sort((left, right) => right.durationMs - left.durationMs).slice(0, 20),
  files
};
writeFileSync(destination, `${JSON.stringify(profile, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ profile: destination, rawReport: rawDestination, processOutput: logDestination, passed: profile.passed, files: profile.totals.files, testCases: profile.totals.testCases, failures: profile.totals.failures, elapsedMs }, null, 2)}\n`);
if (!profile.passed) process.exitCode = 1;
