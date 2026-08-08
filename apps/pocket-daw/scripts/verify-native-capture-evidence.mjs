import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { computeNativeCaptureFingerprint, computeNativeCaptureFingerprintAtCommit, sameNativeCaptureFingerprint } from "./native-capture-fingerprint.mjs";
import { verifyInstalledPunchTakeSummaryFile } from "./verify-installed-punch-take-summary.mjs";
import { verifyManualFreshAudibleEvidence } from "./manual-fresh-audible-evidence.mjs";
import { sha256File, verifySmokeAttestationFile } from "./verify-smoke-attestation.mjs";

export function verifyNativeCaptureEvidence(options = {}) {
  const failures = [];
  const root = options.root || process.cwd();
  const attestation = readJson(options.attestationPath, "Current smoke attestation", failures);
  if (!attestation) return { ok: false, failures, mode: null, fingerprint: null };

  const declaration = attestation.audioCaptureEvidence;
  const mode = declaration?.mode || null;
  let currentFingerprint = options.audioCaptureFingerprint || null;
  if (!currentFingerprint) {
    try {
      currentFingerprint = mode === "manual-fresh-audible"
        ? computeNativeCaptureFingerprintAtCommit(root, attestation.commit)
        : computeNativeCaptureFingerprint(root);
    } catch (error) {
      failures.push(`Could not compute the exact candidate native capture fingerprint: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!sameNativeCaptureFingerprint(declaration?.fingerprint, currentFingerprint)) {
    failures.push("Current attestation native capture fingerprint does not match the current capture source/dependencies.");
  }

  const currentPunch = safeVerifyPunch({
    summaryPath: options.punchTakeSummaryPath,
    installerPath: options.installerPath,
    version: options.version,
    requireAudibleAudio: mode === "fresh-audible",
    requireExportFiles: true,
    requireMidiInput: true
  }, "Current installer punch/take evidence", failures);
  if (currentPunch && !currentPunch.ok) failures.push(...currentPunch.failures.map((failure) => `Current installer: ${failure}`));

  const baselineAttestationPath = options.baselineAttestationPath || "";
  const baselineInstallerPath = options.baselineInstallerPath || "";
  if (mode === "fresh-audible") {
    if (options.requireAudibleAudio !== true) failures.push("Fresh-audible mode requires --require-audible-audio; audible thresholds cannot be implicit or weakened.");
    if (baselineAttestationPath || baselineInstallerPath) failures.push("Fresh-audible mode must not provide baseline reuse files.");
  } else if (mode === "manual-fresh-audible") {
    if (options.requireAudibleAudio === true) failures.push("Manual-fresh-audible mode must not relabel the automated companion run as audible.");
    if (baselineAttestationPath || baselineInstallerPath) failures.push("Manual-fresh-audible mode must not provide baseline reuse files or chains.");
    verifyManualFreshAudibleMode({
      declaration,
      attestation,
      attestationPath: options.attestationPath,
      installerPath: options.installerPath,
      punchTakeSummaryPath: options.punchTakeSummaryPath,
      manualEvidencePath: options.manualFreshAudibleEvidencePath,
      version: options.version,
      fingerprint: currentFingerprint
    }, failures);
  } else if (mode === "baseline-reuse") {
    if (options.requireAudibleAudio === true) failures.push("Baseline-reuse mode must not also request fresh-audible mode.");
    verifyBaselineReuse({
      declaration,
      currentAttestation: attestation,
      currentAttestationPath: options.attestationPath,
      currentInstallerPath: options.installerPath,
      baselineAttestationPath,
      baselineInstallerPath,
      currentFingerprint,
      root
    }, failures);
  } else {
    failures.push("Current attestation must select audioCaptureEvidence.mode fresh-audible, manual-fresh-audible, or baseline-reuse.");
  }

  return { ok: failures.length === 0, failures, mode, fingerprint: currentFingerprint };
}

function verifyManualFreshAudibleMode(options, failures) {
  if (!options.manualEvidencePath) {
    failures.push("Manual-fresh-audible mode requires --manual-fresh-audible-evidence.");
    return;
  }
  if (!existsSync(options.manualEvidencePath)) {
    failures.push(`Manual fresh-audible evidence file does not exist: ${options.manualEvidencePath}`);
    return;
  }
  const manualBinding = options.declaration?.manual;
  const companionBinding = options.declaration?.companion;
  if (!manualBinding || typeof manualBinding !== "object") failures.push("Manual-fresh-audible attestation is missing its exact manual evidence binding.");
  if (!companionBinding || typeof companionBinding !== "object") failures.push("Manual-fresh-audible attestation is missing its exact automated companion binding.");
  if (!manualBinding || !companionBinding) return;
  compare(manualBinding.evidenceFile, basename(options.manualEvidencePath), "Manual evidence filename", failures);
  compareHash(manualBinding.evidenceSha256, sha256File(options.manualEvidencePath), "Manual evidence SHA-256", failures);
  compare(companionBinding.summaryFile, basename(options.punchTakeSummaryPath || ""), "Automated companion summary filename", failures);
  if (options.punchTakeSummaryPath && existsSync(options.punchTakeSummaryPath)) {
    compareHash(companionBinding.summarySha256, sha256File(options.punchTakeSummaryPath), "Automated companion summary SHA-256", failures);
  }

  const manual = verifyManualFreshAudibleEvidence({
    reportPath: options.manualEvidencePath,
    installerPath: options.installerPath,
    version: options.version,
    commit: options.attestation.commit,
    expectedFingerprint: options.fingerprint
  });
  if (!manual.ok) failures.push(...manual.failures.map((failure) => `Manual audible evidence: ${failure}`));

  const report = readJson(options.manualEvidencePath, "Manual fresh-audible report", failures);
  const companion = readJson(options.punchTakeSummaryPath, "Automated companion summary", failures);
  if (!report || !companion) return;
  const manualCapturedAt = Date.parse(report.capturedAt || "");
  const manualAnalyzedAt = Date.parse(report.analyzedAt || "");
  const companionTestedAt = Date.parse(companion.testedAt || "");
  const attestedAt = Date.parse(options.attestation.testedAt || "");
  if (![manualCapturedAt, manualAnalyzedAt, companionTestedAt, attestedAt].every(Number.isFinite)) {
    failures.push("Manual, companion, and attestation timestamps must all be valid UTC timestamps.");
  } else {
    if (companionTestedAt <= manualCapturedAt) failures.push("Automated companion testedAt must be later than the manual capture; prior summaries cannot be reused.");
    if (attestedAt < manualAnalyzedAt || attestedAt < companionTestedAt) failures.push("Attestation testedAt must be after both manual analysis and automated companion evidence.");
  }
}

function verifyBaselineReuse(options, failures) {
  if (!options.baselineAttestationPath) failures.push("Baseline-reuse mode requires --audio-capture-baseline-attestation.");
  if (!options.baselineInstallerPath) failures.push("Baseline-reuse mode requires --audio-capture-baseline-installer.");
  if (!options.baselineAttestationPath || !options.baselineInstallerPath) return;
  if (!existsSync(options.baselineAttestationPath)) failures.push(`Baseline attestation file does not exist: ${options.baselineAttestationPath}`);
  if (!existsSync(options.baselineInstallerPath)) failures.push(`Baseline installer file does not exist: ${options.baselineInstallerPath}`);
  if (!existsSync(options.baselineAttestationPath) || !existsSync(options.baselineInstallerPath)) return;

  const binding = options.declaration?.baseline;
  if (!binding || typeof binding !== "object") {
    failures.push("Baseline-reuse attestation is missing its exact baseline binding.");
    return;
  }
  compare(binding.attestationFile, basename(options.baselineAttestationPath), "Baseline attestation filename", failures);
  compareHash(binding.attestationSha256, sha256File(options.baselineAttestationPath), "Baseline attestation SHA-256", failures);
  compare(binding.installerFile, basename(options.baselineInstallerPath), "Baseline installer filename", failures);
  compareHash(binding.installerSha256, sha256File(options.baselineInstallerPath), "Baseline installer SHA-256", failures);

  const currentAttestationHash = sha256File(options.currentAttestationPath);
  const currentInstallerHash = sha256File(options.currentInstallerPath);
  if (currentAttestationHash === sha256File(options.baselineAttestationPath)) failures.push("Baseline attestation must be a prior attestation, not the current candidate attestation.");
  if (currentInstallerHash === sha256File(options.baselineInstallerPath)) failures.push("Baseline installer must be a prior installer, not the current candidate installer.");

  const baseline = readJson(options.baselineAttestationPath, "Baseline smoke attestation", failures);
  if (!baseline) return;
  const baselineMode = baseline.audioCaptureEvidence?.mode;
  if (baselineMode !== "fresh-audible" && baselineMode !== "manual-fresh-audible") {
    failures.push("Baseline attestation must contain direct fresh-audible or direct manual-fresh-audible evidence; baseline-reuse chains are forbidden.");
  }
  if (!sameNativeCaptureFingerprint(baseline.audioCaptureEvidence?.fingerprint, options.currentFingerprint)) {
    failures.push("Baseline native capture fingerprint does not match the current capture source/dependencies.");
  }
  if (baseline.commit === options.currentAttestation.commit) failures.push("Baseline attestation commit must differ from the current candidate commit.");
  const baselineTestedAt = Date.parse(baseline.testedAt || "");
  const currentTestedAt = Date.parse(options.currentAttestation.testedAt || "");
  if (!Number.isFinite(baselineTestedAt) || !Number.isFinite(currentTestedAt) || baselineTestedAt >= currentTestedAt) {
    failures.push("Baseline attestation testedAt must be earlier than the current candidate attestation.");
  }

  try {
    const verified = verifySmokeAttestationFile({
      attestationPath: options.baselineAttestationPath,
      installerPath: options.baselineInstallerPath,
      version: baseline.version,
      commit: baseline.commit,
      audioCaptureFingerprint: options.currentFingerprint,
      root: options.root
    });
    if (!verified.ok) failures.push(...verified.failures.map((failure) => `Baseline attestation: ${failure}`));
  } catch (error) {
    failures.push(`Baseline attestation verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const punchEvidence = baseline.checks?.find((check) => check?.id === "punch-take-lane-recording")?.evidence
    ?.find((entry) => entry?.kind === "installed-punch-take-summary");
  if (!punchEvidence?.file) {
    failures.push("Baseline attestation does not reference an installed punch/take summary.");
    return;
  }
  const punchPath = isAbsolute(punchEvidence.file) ? punchEvidence.file : resolve(dirname(options.baselineAttestationPath), punchEvidence.file);
  const baselinePunch = safeVerifyPunch({
    summaryPath: punchPath,
    installerPath: options.baselineInstallerPath,
    version: baseline.version,
    requireAudibleAudio: baselineMode === "fresh-audible",
    requireExportFiles: baselineMode === "manual-fresh-audible",
    requireMidiInput: baselineMode === "manual-fresh-audible"
  }, "Baseline audible punch/take evidence", failures);
  if (baselinePunch && !baselinePunch.ok) failures.push(...baselinePunch.failures.map((failure) => `Baseline audible evidence: ${failure}`));
  if (baselineMode === "manual-fresh-audible") {
    const manualFile = baseline.audioCaptureEvidence?.manual?.evidenceFile;
    const manualPath = resolveSiblingEvidence(options.baselineAttestationPath, manualFile, "Baseline manual evidence", failures);
    if (manualPath) {
      verifyManualFreshAudibleMode({
        declaration: baseline.audioCaptureEvidence,
        attestation: baseline,
        attestationPath: options.baselineAttestationPath,
        installerPath: options.baselineInstallerPath,
        punchTakeSummaryPath: punchPath,
        manualEvidencePath: manualPath,
        version: baseline.version,
        fingerprint: options.currentFingerprint
      }, failures);
    }
  }
}

function resolveSiblingEvidence(attestationPath, file, label, failures) {
  if (typeof file !== "string" || !file.trim() || isAbsolute(file) || file.split(/[\\/]+/).includes("..")) {
    failures.push(`${label} must be a contained relative file beside the direct attestation.`);
    return null;
  }
  const path = resolve(dirname(attestationPath), file);
  if (!existsSync(path)) {
    failures.push(`${label} does not exist: ${file}`);
    return null;
  }
  return path;
}

function safeVerifyPunch(options, label, failures) {
  if (!options.summaryPath) {
    failures.push(`${label} path is required.`);
    return null;
  }
  try {
    return verifyInstalledPunchTakeSummaryFile(options);
  } catch (error) {
    failures.push(`${label} verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readJson(path, label, failures) {
  if (!path) {
    failures.push(`${label} path is required.`);
    return null;
  }
  if (!existsSync(path)) {
    failures.push(`${label} file does not exist: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function compare(actual, expected, label, failures) {
  if (actual !== expected) failures.push(`${label} ${JSON.stringify(actual)} does not match exact file ${JSON.stringify(expected)}.`);
}

function compareHash(actual, expected, label, failures) {
  if (String(actual || "").toLowerCase() !== String(expected || "").toLowerCase()) failures.push(`${label} does not match exact file bytes.`);
}
