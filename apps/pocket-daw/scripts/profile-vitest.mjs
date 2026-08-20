#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./verify-test-scope-manifest.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const appRoot = resolve(root, "apps/pocket-daw");
const destination = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, "local-artifacts/test-profiles/pocket-daw-vitest-baseline.json");
const rawDestination = destination.replace(/\.json$/i, ".vitest.json");

mkdirSync(dirname(destination), { recursive: true });
const manifest = loadManifest();
const deterministicTests = manifest.tests
  .filter((entry) => entry.ordinaryVitest)
  .map((entry) => relative(appRoot, resolve(root, entry.file)));
const startedAt = new Date().toISOString();
const started = performance.now();
let commandError = null;
try {
  execFileSync(process.execPath, [join(appRoot, "node_modules/vitest/vitest.mjs"), "run", ...deterministicTests, "--reporter=json", "--outputFile", rawDestination], {
    cwd: appRoot,
    stdio: "inherit"
  });
} catch (error) {
  commandError = error instanceof Error ? error.message : String(error);
}
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
const profile = {
  schemaVersion: 1,
  command: "npx vitest run --reporter=json",
  startedAt,
  elapsedMs,
  passed: commandError === null && raw.success === true,
  commandError,
  totals: {
    files: files.length,
    testCases: files.reduce((sum, file) => sum + file.testCases, 0),
    failures: files.flatMap((file) => file.failures),
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
process.stdout.write(`${JSON.stringify({ profile: destination, passed: profile.passed, files: profile.totals.files, testCases: profile.totals.testCases, elapsedMs }, null, 2)}\n`);
if (commandError) process.exitCode = 1;
