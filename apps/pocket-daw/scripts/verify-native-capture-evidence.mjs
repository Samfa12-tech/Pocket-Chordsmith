import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { computeNativeCaptureFingerprint, sameNativeCaptureFingerprint } from "./native-capture-fingerprint.mjs";
import { verifyInstalledPunchTakeSummaryFile } from "./verify-installed-punch-take-summary.mjs";
import { sha256File, verifySmokeAttestationFile } from "./verify-smoke-attestation.mjs";

export function verifyNativeCaptureEvidence(options = {}) {
  const failures = [];
  const root = options.root || process.cwd();
  const currentFingerprint = options.audioCaptureFingerprint || computeNativeCaptureFingerprint(root);
  const attestation = readJson(options.attestationPath, "Current smoke attestation", failures);
  if (!attestation) return { ok: false, failures, mode: null, fingerprint: currentFingerprint };

  const declaration = attestation.audioCaptureEvidence;
  const mode = declaration?.mode || null;
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
    failures.push("Current attestation must select audioCaptureEvidence.mode fresh-audible or baseline-reuse.");
  }

  return { ok: failures.length === 0, failures, mode, fingerprint: currentFingerprint };
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
  if (baseline.audioCaptureEvidence?.mode !== "fresh-audible") {
    failures.push("Baseline attestation must contain direct fresh-audible evidence; baseline-reuse chains are forbidden.");
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
    requireAudibleAudio: true,
    requireExportFiles: false,
    requireMidiInput: false
  }, "Baseline audible punch/take evidence", failures);
  if (baselinePunch && !baselinePunch.ok) failures.push(...baselinePunch.failures.map((failure) => `Baseline audible evidence: ${failure}`));
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
