import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const corePackagePath = path.join(repoRoot, "packages", "pocket-audio-core", "package.json");
const coreLockPath = path.join(repoRoot, "packages", "pocket-audio-core", "package-lock.json");

const minimumActionMajors = {
  "upload-artifact": 7,
  cache: 6
};
const requiredActions = new Set(["upload-artifact"]);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function verifyActionMajors(workflow) {
  const actionUsePattern = /uses:\s*actions\/(upload-artifact|cache)@v?(\d+)/g;
  const seen = new Set();
  for (const match of workflow.matchAll(actionUsePattern)) {
    const [, action, majorText] = match;
    const major = Number(majorText);
    seen.add(action);
    const required = minimumActionMajors[action];
    if (!Number.isFinite(major) || major < required) {
      fail(`.github/workflows/ci.yml uses actions/${action}@v${majorText}; use v${required}+ so GitHub does not emit Node 20 deprecation warnings.`);
    }
  }
  for (const action of requiredActions) {
    if (!seen.has(action)) fail(`.github/workflows/ci.yml does not contain actions/${action}; update this verifier if the CI artifact/cache strategy changed.`);
  }
}

function verifyWorkflowNode(workflow) {
  if (!/node-version:\s*22\b/.test(workflow)) fail(".github/workflows/ci.yml should keep project commands on Node 22.");
  if (/playwright@1\.52\.0\s+install\s+--with-deps/.test(workflow)) {
    fail(".github/workflows/ci.yml still uses the old Playwright 1.52 install --with-deps path; use install-deps plus per-package browser installs.");
  }
}

function verifyFamilyParityDependencies(workflow) {
  const dawInstallStep = workflow.search(
    /- name: Install Pocket DAW dependencies for family parity\s+working-directory: apps\/pocket-daw\s+run: npm ci/
  );
  const familyParityStep = workflow.indexOf("npm run verify:family-parity");
  if (dawInstallStep < 0) {
    fail(".github/workflows/ci.yml must install Pocket DAW dependencies before family parity so Vitest is available on clean runners.");
  } else if (familyParityStep < 0 || dawInstallStep > familyParityStep) {
    fail(".github/workflows/ci.yml must install Pocket DAW dependencies before running verify:family-parity.");
  }
}

function verifyPocketAudioCorePlaywrightDependency() {
  const packageJson = readJson(corePackagePath);
  const lockJson = readJson(coreLockPath);
  if (!packageJson.devDependencies?.playwright) {
    fail("packages/pocket-audio-core/package.json must list playwright as a devDependency because verify:family-parity runs a browser trace comparison after npm ci.");
  }
  if (!lockJson.packages?.["node_modules/playwright"]) {
    fail("packages/pocket-audio-core/package-lock.json must include node_modules/playwright so CI npm ci installs the browser trace dependency.");
  }
}

const workflow = readText(workflowPath);
verifyActionMajors(workflow);
verifyWorkflowNode(workflow);
verifyFamilyParityDependencies(workflow);
verifyPocketAudioCorePlaywrightDependency();

if (process.exitCode) process.exit(process.exitCode);
console.log("CI workflow verifier OK");
