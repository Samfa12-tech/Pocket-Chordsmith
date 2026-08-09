import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RECEIPT_SCHEMA = "pocket-daw-release-candidate-receipt-v1";
export const VERIFICATION_SCHEMA = "pocket-daw-release-candidate-verification-v1";

export const SOURCE_GATE_IDS = Object.freeze([
  "versions",
  "native-sound-recipes",
  "ci-workflow",
  "family-parity",
  "frontend-vitest",
  "native-cargo-test",
  "chromium-e2e",
  "tauri-release-build",
  "release-package",
  "release-artifacts"
]);

export const REQUIRED_ARTIFACT_KEYS = Object.freeze([
  "setupExe",
  "setupSignature",
  "msi",
  "msiSignature",
  "releaseNotes",
  "releaseChecksums",
  "releaseVerdict",
  "releaseManifest",
  "updaterManifest",
  "bootstrapperManifest",
  "updaterChecksums"
]);

export function sha256FileSync(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function assertCleanCandidateWorktree({ root = process.cwd(), inspect = inspectGitState } = {}) {
  const state = inspect(root);
  if (!/^[a-f0-9]{40}$/.test(state.commit || "")) throw new Error("Could not resolve a full candidate Git commit.");
  if (String(state.status || "").trim()) {
    throw new Error(`Candidate verification and publication require an empty git status --porcelain result:\n${String(state.status).trim()}`);
  }
  return state.commit;
}

function inspectGitState(root) {
  const commitResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  if (commitResult.error || commitResult.status !== 0) throw commitResult.error || new Error("git rev-parse HEAD failed.");
  const statusResult = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  if (statusResult.error || statusResult.status !== 0) throw statusResult.error || new Error("git status --porcelain failed.");
  return { commit: commitResult.stdout.trim(), status: statusResult.stdout };
}

export function artifactRecord(root, filePath) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(absoluteRoot, absolutePath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
    throw new Error(`Candidate artifact must stay under the Pocket DAW root: ${absolutePath}`);
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Candidate artifact is missing: ${absolutePath}`);
  }
  return {
    path: relativePath,
    sizeBytes: statSync(absolutePath).size,
    sha256: sha256FileSync(absolutePath)
  };
}

export function createCandidateReceipt({ root, outPath, version, commit, sourceGateIds, artifacts, pluginHostSidecar }) {
  if (existsSync(outPath)) throw new Error(`Candidate receipt already exists and is immutable: ${outPath}`);
  assertVersion(version);
  assertCommit(commit);
  assertSourceGates(sourceGateIds);
  const artifactEntries = Object.fromEntries(REQUIRED_ARTIFACT_KEYS.map((key) => {
    if (!artifacts[key]) throw new Error(`Candidate receipt is missing artifact ${key}.`);
    return [key, artifactRecord(root, artifacts[key])];
  }));
  assertPluginHostSidecar(pluginHostSidecar);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    app: "Pocket DAW",
    version,
    commit,
    createdAt: new Date().toISOString(),
    sourceGates: SOURCE_GATE_IDS.map((id) => ({ id, status: "passed" })),
    pluginHostSidecar: {
      component: pluginHostSidecar.component,
      protocolVersion: pluginHostSidecar.protocolVersion,
      target: pluginHostSidecar.target,
      sha256: pluginHostSidecar.sha256,
      sizeBytes: pluginHostSidecar.sizeBytes,
      preBundleSha256: pluginHostSidecar.preBundleSha256,
      preBundleSizeBytes: pluginHostSidecar.preBundleSizeBytes
    },
    artifacts: artifactEntries
  };
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return receipt;
}

export function verifyCandidateReceipt({ root, receiptPath, expectedVersion = "", expectedCommit = "" }) {
  const failures = [];
  const absoluteReceiptPath = path.resolve(receiptPath);
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(absoluteReceiptPath, "utf8"));
  } catch (error) {
    return { ok: false, failures: [`Candidate receipt could not be read: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (receipt.schema !== RECEIPT_SCHEMA) failures.push(`Candidate receipt schema must be ${RECEIPT_SCHEMA}.`);
  if (receipt.app !== "Pocket DAW") failures.push("Candidate receipt app must be Pocket DAW.");
  try { assertVersion(receipt.version); } catch (error) { failures.push(error.message); }
  try { assertCommit(receipt.commit); } catch (error) { failures.push(error.message); }
  if (expectedVersion && receipt.version !== expectedVersion) failures.push(`Candidate receipt version ${receipt.version} does not match ${expectedVersion}.`);
  if (expectedCommit && receipt.commit !== expectedCommit) failures.push(`Candidate receipt commit ${receipt.commit} does not match ${expectedCommit}.`);
  const gateIds = Array.isArray(receipt.sourceGates)
    ? receipt.sourceGates.filter((gate) => gate?.status === "passed").map((gate) => gate.id)
    : [];
  try { assertSourceGates(gateIds); } catch (error) { failures.push(error.message); }
  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const record = receipt.artifacts?.[key];
    const checked = verifyArtifactRecord(root, key, record);
    failures.push(...checked.failures);
  }
  try { assertPluginHostSidecar(receipt.pluginHostSidecar); } catch (error) { failures.push(error.message); }

  const manifestRecord = receipt.artifacts?.releaseManifest;
  if (manifestRecord?.path) {
    try {
      const manifest = JSON.parse(readFileSync(resolveReceiptPath(root, manifestRecord.path), "utf8"));
      if (manifest.version !== receipt.version) failures.push("Release manifest version does not match the candidate receipt.");
      if (manifest.gitCommitSha !== receipt.commit) failures.push("Release manifest commit does not match the candidate receipt.");
      if (manifest.dirtyWorkingTree !== false) failures.push("Release manifest must record a clean tracked working tree.");
      for (const key of ["component", "protocolVersion", "target", "sha256", "sizeBytes", "preBundleSha256", "preBundleSizeBytes"]) {
        if (manifest.pluginHostSidecar?.[key] !== receipt.pluginHostSidecar?.[key]) {
          failures.push(`Release manifest plug-in host ${key} does not match the candidate receipt.`);
        }
      }
    } catch (error) {
      failures.push(`Release manifest could not be validated: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: failures.length === 0, failures, receipt, receiptPath: absoluteReceiptPath };
}

export function receiptArtifactPath(root, receipt, key) {
  const record = receipt.artifacts?.[key];
  if (!record?.path) throw new Error(`Candidate receipt does not contain artifact ${key}.`);
  return resolveReceiptPath(root, record.path);
}

export function evidenceRecord(filePath, label) {
  const absolutePath = path.resolve(filePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) throw new Error(`${label} is missing: ${absolutePath}`);
  return { label, path: absolutePath, sizeBytes: statSync(absolutePath).size, sha256: sha256FileSync(absolutePath) };
}

export function writeCandidateVerification({ outPath, receiptPath, receipt, evidence, audioMode }) {
  if (existsSync(outPath)) throw new Error(`Candidate verification report already exists and is immutable: ${outPath}`);
  const report = {
    schema: VERIFICATION_SCHEMA,
    app: "Pocket DAW",
    version: receipt.version,
    commit: receipt.commit,
    verifiedAt: new Date().toISOString(),
    receipt: evidenceRecord(receiptPath, "candidate-receipt"),
    validation: {
      audioMode,
      requireExportFiles: true,
      requireMidiInput: true
    },
    evidence
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return report;
}

export function verifyCandidateVerificationReport({ receiptPath, reportPath, receipt }) {
  const failures = [];
  let report;
  try { report = JSON.parse(readFileSync(reportPath, "utf8")); }
  catch (error) { return { ok: false, failures: [`Candidate verification report could not be read: ${error instanceof Error ? error.message : String(error)}`] }; }
  if (report.schema !== VERIFICATION_SCHEMA) failures.push(`Candidate verification schema must be ${VERIFICATION_SCHEMA}.`);
  if (report.version !== receipt.version) failures.push("Candidate verification version does not match the receipt.");
  if (report.commit !== receipt.commit) failures.push("Candidate verification commit does not match the receipt.");
  if (!["fresh-audible", "baseline-reuse", "manual-fresh-audible"].includes(report.validation?.audioMode)) failures.push("Candidate verification audio mode is invalid.");
  if (report.validation?.requireExportFiles !== true || report.validation?.requireMidiInput !== true) failures.push("Candidate verification must require export files and MIDI input.");
  const receiptHash = sha256FileSync(receiptPath);
  if (report.receipt?.sha256 !== receiptHash) failures.push("Candidate verification receipt hash does not match current receipt bytes.");
  if (!Array.isArray(report.evidence) || report.evidence.length < 5) failures.push("Candidate verification report has incomplete evidence bindings.");
  const labels = new Set((report.evidence || []).map((record) => record?.label));
  for (const required of ["smoke-attestation", "punch-take-summary", "media-portability-summary", "vst3-host-summary"]) {
    if (!labels.has(required)) failures.push(`Candidate verification report is missing ${required}.`);
  }
  if (![...labels].some((label) => typeof label === "string" && label.startsWith("game-pack:"))) failures.push("Candidate verification report is missing game-pack evidence.");
  if (report.validation?.audioMode === "baseline-reuse" && (!labels.has("audio-baseline-attestation") || !labels.has("audio-baseline-installer"))) failures.push("Baseline-reuse verification is missing direct baseline bindings.");
  if (report.validation?.audioMode === "manual-fresh-audible" && !labels.has("manual-fresh-audible")) failures.push("Manual-fresh verification is missing its direct report binding.");
  for (const record of report.evidence || []) {
    if (!record?.path || !existsSync(record.path)) failures.push(`Candidate verification evidence is missing: ${record?.label || "unknown"}.`);
    else {
      const actualSize = statSync(record.path).size;
      const actualHash = sha256FileSync(record.path);
      if (record.sizeBytes !== actualSize) failures.push(`${record.label} size changed after candidate verification.`);
      if (record.sha256 !== actualHash) failures.push(`${record.label} hash changed after candidate verification.`);
    }
  }
  return { ok: failures.length === 0, failures, report };
}

function verifyArtifactRecord(root, key, record) {
  const failures = [];
  if (!record?.path || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0 || !/^[a-f0-9]{64}$/.test(record.sha256 || "")) {
    return { failures: [`Candidate receipt artifact ${key} is malformed.`] };
  }
  let absolutePath;
  try { absolutePath = resolveReceiptPath(root, record.path); }
  catch (error) { return { failures: [error.message] }; }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return { failures: [`Candidate artifact ${key} is missing: ${absolutePath}`] };
  if (statSync(absolutePath).size !== record.sizeBytes) failures.push(`Candidate artifact ${key} size changed.`);
  if (sha256FileSync(absolutePath) !== record.sha256) failures.push(`Candidate artifact ${key} hash changed.`);
  return { failures };
}

function resolveReceiptPath(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Candidate receipt contains an unsafe artifact path: ${relativePath}`);
  }
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Candidate receipt artifact escapes the Pocket DAW root: ${relativePath}`);
  }
  return absolutePath;
}

function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("Candidate receipt version is invalid.");
}

function assertCommit(commit) {
  if (!/^[a-f0-9]{40}$/.test(commit || "")) throw new Error("Candidate receipt commit must be a full lowercase Git SHA.");
}

function assertSourceGates(sourceGateIds) {
  const actual = [...new Set(sourceGateIds || [])].sort();
  const expected = [...SOURCE_GATE_IDS].sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`Candidate receipt source gates must be exactly: ${SOURCE_GATE_IDS.join(", ")}.`);
  }
}

function assertPluginHostSidecar(sidecar) {
  if (!sidecar || typeof sidecar.component !== "string" || typeof sidecar.target !== "string") throw new Error("Candidate receipt plug-in host identity is invalid.");
  if (!Number.isSafeInteger(sidecar.protocolVersion) || sidecar.protocolVersion <= 0) throw new Error("Candidate receipt plug-in host protocol is invalid.");
  if (!/^[a-f0-9]{64}$/.test(sidecar.sha256 || "") || !/^[a-f0-9]{64}$/.test(sidecar.preBundleSha256 || "")) throw new Error("Candidate receipt plug-in host hashes are invalid.");
  if (!Number.isSafeInteger(sidecar.sizeBytes) || sidecar.sizeBytes <= 0 || !Number.isSafeInteger(sidecar.preBundleSizeBytes) || sidecar.preBundleSizeBytes <= 0) throw new Error("Candidate receipt plug-in host sizes are invalid.");
}
