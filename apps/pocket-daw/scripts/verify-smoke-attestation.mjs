import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import packageJson from "../package.json" with { type: "json" };

export const REQUIRED_SMOKE_CHECK_IDS = Object.freeze([
  "install-launch",
  "about-diagnostics",
  "basic-audio",
  "chordsmith-import",
  "project-workflow",
  "updater-check"
]);

export function validateSmokeAttestation(attestation, expectations) {
  const failures = [];
  const expected = normalizeExpectations(expectations, failures);

  if (!isPlainObject(attestation)) {
    failures.push("smoke attestation must be a JSON object");
    return { ok: false, failures };
  }

  requireString(attestation.version, "version", failures);
  requireString(attestation.commit, "commit", failures);
  requireString(attestation.installerFile, "installerFile", failures);
  requireString(attestation.installerSha256, "installerSha256", failures);
  requireString(attestation.testedAt, "testedAt", failures);
  requireString(attestation.result, "result", failures);

  validateSemverLike(attestation.version, "version", failures);
  validateCommit(attestation.commit, "commit", failures);
  validateInstallerHash(attestation.installerSha256, "installerSha256", failures);
  validateTestedAt(attestation.testedAt, "testedAt", failures);

  if (attestation.result !== "pass") {
    failures.push(`result must be pass, received ${JSON.stringify(attestation.result)}`);
  }

  if (expected.version && attestation.version !== expected.version) {
    failures.push(`version ${JSON.stringify(attestation.version)} does not match expected ${JSON.stringify(expected.version)}`);
  }
  if (expected.commit && attestation.commit !== expected.commit) {
    failures.push(`commit ${JSON.stringify(attestation.commit)} does not match expected ${JSON.stringify(expected.commit)}`);
  }
  if (expected.installerFile && attestation.installerFile !== expected.installerFile) {
    failures.push(`installerFile ${JSON.stringify(attestation.installerFile)} does not match expected ${JSON.stringify(expected.installerFile)}`);
  }
  if (expected.installerSha256 && attestation.installerSha256?.toLowerCase() !== expected.installerSha256.toLowerCase()) {
    failures.push(`installerSha256 ${JSON.stringify(attestation.installerSha256)} does not match current installer hash ${JSON.stringify(expected.installerSha256)}`);
  }

  if (!isPlainObject(attestation.machine)) {
    failures.push("machine must be a JSON object");
  } else {
    requireString(attestation.machine.windowsVersion, "machine.windowsVersion", failures);
    requireString(attestation.machine.architecture, "machine.architecture", failures);
    requireString(attestation.machine.audioInput, "machine.audioInput", failures);
    requireString(attestation.machine.audioOutput, "machine.audioOutput", failures);
  }

  if (!Array.isArray(attestation.checks)) {
    failures.push("checks must be an array");
  } else {
    const seenIds = new Set();
    const presentRequired = new Set();
    const badChecks = [];

    for (const [index, check] of attestation.checks.entries()) {
      if (!isPlainObject(check)) {
        failures.push(`checks[${index}] must be a JSON object`);
        continue;
      }
      requireString(check.id, `checks[${index}].id`, failures);
      requireString(check.result, `checks[${index}].result`, failures);
      if (check.id && seenIds.has(check.id)) {
        failures.push(`checks contains duplicate id ${JSON.stringify(check.id)}`);
      }
      if (check.id) seenIds.add(check.id);
      if (check.id && REQUIRED_SMOKE_CHECK_IDS.includes(check.id)) presentRequired.add(check.id);
      if (check.result !== "pass") {
        badChecks.push(`${check.id || `checks[${index}]`}=${check.result}`);
      }
    }

    const missingRequired = REQUIRED_SMOKE_CHECK_IDS.filter((id) => !presentRequired.has(id));
    if (missingRequired.length) {
      failures.push(`checks is missing required checks: ${missingRequired.join(", ")}`);
    }
    if (badChecks.length) {
      failures.push(`checks must all pass for a pass attestation: ${badChecks.join(", ")}`);
    }
  }

  if (!Array.isArray(attestation.knownFailures)) {
    failures.push("knownFailures must be an array");
  } else {
    attestation.knownFailures.forEach((entry, index) => {
      if (typeof entry !== "string" || !entry.trim()) {
        failures.push(`knownFailures[${index}] must be a non-empty string`);
      }
    });
  }

  return { ok: failures.length === 0, failures };
}

export function verifySmokeAttestationFile(options = {}) {
  const attestationPath = options.attestationPath || options.attestation || "releases/smoke-attestation.json";
  const installerPath = options.installerPath || options.installer;
  const version = options.version || packageJson.version;
  const commit = options.commit;

  if (!installerPath) throw new Error("Missing required installerPath.");
  if (!commit) throw new Error("Missing required commit.");
  if (!existsSync(attestationPath)) throw new Error(`Attestation file does not exist: ${attestationPath}`);
  if (!existsSync(installerPath)) throw new Error(`Installer file does not exist: ${installerPath}`);

  const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
  const actualInstallerSha256 = sha256File(installerPath);
  return validateSmokeAttestation(attestation, {
    version,
    commit,
    installerFile: basename(installerPath),
    installerSha256: actualInstallerSha256
  });
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeExpectations(expectations, failures) {
  if (!expectations || typeof expectations !== "object") {
    failures.push("expected version, commit, installerFile, and installerSha256 were not provided");
    return {};
  }
  const normalized = {};
  for (const field of ["version", "commit", "installerFile", "installerSha256"]) {
    if (typeof expectations[field] === "string" && expectations[field]) {
      normalized[field] = expectations[field];
    } else if (field === "version" || field === "commit" || field === "installerFile" || field === "installerSha256") {
      failures.push(`expected ${field} is required`);
    }
  }
  validateSemverLike(normalized.version, "expected version", failures);
  validateCommit(normalized.commit, "expected commit", failures);
  if (normalized.installerSha256) validateInstallerHash(normalized.installerSha256, "expected installerSha256", failures);
  return normalized;
}

function requireString(value, label, failures) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} must be a non-empty string`);
  }
}

function validateSemverLike(value, label, failures) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)) {
    failures.push(`${label} must be a semver-like string`);
  }
}

function validateCommit(value, label, failures) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value)) {
    failures.push(`${label} must be a 40-character git SHA`);
  }
}

function validateInstallerHash(value, label, failures) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    failures.push(`${label} must be a 64-character SHA-256 hex string`);
  }
}

function validateTestedAt(value, label, failures) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    failures.push(`${label} must be an ISO date or UTC timestamp`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && process.argv[1].endsWith("verify-smoke-attestation.mjs")) {
  try {
    const result = verifySmokeAttestationFile(parseArgs(process.argv.slice(2)));
    if (!result.ok) {
      for (const failure of result.failures) console.error(failure);
      process.exit(1);
    }
    console.log("Smoke attestation verification OK");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
