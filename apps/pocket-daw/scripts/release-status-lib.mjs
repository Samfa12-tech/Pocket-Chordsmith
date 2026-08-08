import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function loadReleaseStatusContext(root = process.cwd()) {
  const packageJson = readJson(join(root, "package.json"));
  const packageLock = readJson(join(root, "package-lock.json"));
  const tauriConfig = readJson(join(root, "src-tauri", "tauri.conf.json"));
  const schemaText = readFileSync(join(root, "src", "daw", "schema.ts"), "utf8");
  const cargoToml = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
  const cargoLock = readFileSync(join(root, "src-tauri", "Cargo.lock"), "utf8");
  return {
    root,
    packageJsonVersion: packageJson.version,
    packageLockRootVersion: packageLock.version,
    packageLockPackageVersion: packageLock.packages?.[""]?.version,
    tauriConfigVersion: tauriConfig.version,
    cargoTomlVersion: cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    cargoLockVersion: cargoLock.match(/name = "pocket-daw"\r?\nversion = "([^"]+)"/)?.[1],
    schemaVersion: schemaText.match(/POCKET_DAW_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1],
    schemaAppVersion: schemaText.match(/POCKET_DAW_VERSION\s*=\s*"([^"]+)"/)?.[1]
  };
}

export function loadReleaseStatus(root = process.cwd()) {
  return readJson(join(root, "release-status.json"));
}

export function validateReleaseStatus(releaseStatus, context) {
  const expectedVersion = context.packageJsonVersion;
  const checks = [
    ["package.json", context.packageJsonVersion],
    ["package-lock.json root", context.packageLockRootVersion],
    ["package-lock.json package", context.packageLockPackageVersion],
    ["src-tauri/tauri.conf.json", context.tauriConfigVersion],
    ["src-tauri/Cargo.toml", context.cargoTomlVersion],
    ["src-tauri/Cargo.lock", context.cargoLockVersion],
    ["src/daw/schema.ts POCKET_DAW_VERSION", context.schemaAppVersion],
    ["release-status.json sourceVersion", releaseStatus.sourceVersion]
  ];

  const failures = checks
    .filter(([, value]) => value !== expectedVersion)
    .map(([name, value]) => `${name} is ${value || "missing"}, expected ${expectedVersion}`);

  if (context.schemaVersion !== "3") {
    failures.push(`POCKET_DAW_SCHEMA_VERSION is ${context.schemaVersion}, expected 3`);
  }
  if (releaseStatus.schema !== 1) {
    failures.push(`release-status.json schema is ${releaseStatus.schema}, expected 1`);
  }
  if (String(releaseStatus.projectSchemaVersion) !== context.schemaVersion) {
    failures.push(`release-status.json projectSchemaVersion is ${releaseStatus.projectSchemaVersion}, expected ${context.schemaVersion}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(releaseStatus.latestPublishedVersion || ""))) {
    failures.push("release-status.json latestPublishedVersion must be an explicit semver string");
  }
  if (!String(releaseStatus.latestPublishedTag || "").includes(String(releaseStatus.latestPublishedVersion || ""))) {
    failures.push("release-status.json latestPublishedTag must include latestPublishedVersion");
  }
  if (releaseStatus.latestPublishedCommit && !/^[a-f0-9]{40}$/i.test(String(releaseStatus.latestPublishedCommit))) {
    failures.push("release-status.json latestPublishedCommit must be a 40-character git SHA when present");
  }
  if (releaseStatus.unreleasedSourceNotes !== undefined && !Array.isArray(releaseStatus.unreleasedSourceNotes)) {
    failures.push("release-status.json unreleasedSourceNotes must be an array when present");
  }

  const smoke = releaseStatus.lastInstalledSmoke;
  if (!smoke || typeof smoke !== "object" || Array.isArray(smoke)) {
    failures.push("release-status.json lastInstalledSmoke is missing");
  } else {
    if (!["pass", "partial", "fail", "not-run"].includes(smoke.result)) {
      failures.push("release-status.json lastInstalledSmoke.result must be pass, partial, fail, or not-run");
    }
    if (smoke.result === "pass") {
      for (const field of ["version", "installerFile", "installerSha256", "testedAt"]) {
        if (!smoke[field]) failures.push(`release-status.json lastInstalledSmoke.${field} is required for pass`);
      }
      if (smoke.installerSha256 && !/^[a-f0-9]{64}$/i.test(smoke.installerSha256)) {
        failures.push("release-status.json lastInstalledSmoke.installerSha256 must be a 64-character SHA-256 hex string");
      }
    }
    if (smoke.version && !/^\d+\.\d+\.\d+$/.test(String(smoke.version))) {
      failures.push("release-status.json lastInstalledSmoke.version must be semver when present");
    }
    if (!Array.isArray(smoke.notes)) {
      failures.push("release-status.json lastInstalledSmoke.notes must be an array");
    }
  }

  return { ok: failures.length === 0, failures };
}

export function validateReleaseCandidateTruth(releaseStatus, context, options = {}) {
  const validation = validateReleaseStatus(releaseStatus, context);
  const failures = [...validation.failures];
  const sourceVersion = String(releaseStatus?.sourceVersion || "");
  const latestPublishedVersion = String(releaseStatus?.latestPublishedVersion || "");
  const currentCommit = String(options.currentCommit || "").trim();
  const latestPublishedCommit = String(releaseStatus?.latestPublishedCommit || "").trim();
  const sourceOnlyNotes = Array.isArray(releaseStatus?.unreleasedSourceNotes) ? releaseStatus.unreleasedSourceNotes : [];
  const smokeVersion = String(releaseStatus?.lastInstalledSmoke?.version || "");

  if (compareSemver(latestPublishedVersion, smokeVersion) > 0) {
    const policy = releaseStatus?.installedSmokeException;
    const policyErrors = validateInstalledSmokeException(policy, { latestPublishedVersion, smokeVersion });
    if (policyErrors.length) {
      failures.push(`release-status.json latestPublishedVersion ${latestPublishedVersion} is newer than lastInstalledSmoke.version ${smokeVersion}; exact installed evidence is required unless installedSmokeException is complete and matches both versions.`);
      failures.push(...policyErrors);
    }
  }

  if (sourceVersion && sourceVersion === latestPublishedVersion) {
    if (!currentCommit || !/^[a-f0-9]{40}$/i.test(currentCommit)) {
      failures.push("release candidate truth requires the current 40-character git commit.");
    } else if (!latestPublishedCommit || currentCommit.toLowerCase() !== latestPublishedCommit.toLowerCase()) {
      failures.push(`release-status.json sourceVersion matches latestPublishedVersion (${sourceVersion}) but current commit ${currentCommit || "missing"} does not match latestPublishedCommit ${latestPublishedCommit || "missing"}; bump the next Pocket DAW checkpoint version before packaging/publishing source-only changes.`);
    }
    if (sourceOnlyNotes.length) {
      failures.push("release-status.json unreleasedSourceNotes must be empty when sourceVersion matches latestPublishedVersion; bump the next Pocket DAW checkpoint version before packaging/publishing source-only changes.");
    }
  }

  return { ok: failures.length === 0, failures };
}

function compareSemver(left, right) {
  const parse = (value) => /^\d+\.\d+\.\d+$/.test(value) ? value.split(".").map(Number) : null;
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function validateInstalledSmokeException(policy, versions) {
  const failures = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return ["release-status.json installedSmokeException is missing."];
  }
  if (!["source-only-no-installer", "reduced-hotfix-gate"].includes(policy.kind)) {
    failures.push("release-status.json installedSmokeException.kind must be source-only-no-installer or reduced-hotfix-gate.");
  }
  if (String(policy.publishedVersion || "") !== versions.latestPublishedVersion) {
    failures.push("release-status.json installedSmokeException.publishedVersion must match latestPublishedVersion.");
  }
  if (String(policy.baselineInstalledSmokeVersion || "") !== versions.smokeVersion) {
    failures.push("release-status.json installedSmokeException.baselineInstalledSmokeVersion must match lastInstalledSmoke.version.");
  }
  if (!String(policy.rationale || "").trim()) failures.push("release-status.json installedSmokeException.rationale is required.");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(policy.approvedAt || ""))) failures.push("release-status.json installedSmokeException.approvedAt must be an ISO timestamp.");
  if (!Array.isArray(policy.focusedEvidence) || policy.focusedEvidence.length === 0 || policy.focusedEvidence.some((entry) => !String(entry).trim())) {
    failures.push("release-status.json installedSmokeException.focusedEvidence must contain at least one evidence entry.");
  }
  return failures;
}

export function renderReleaseStatusMarkdown(releaseStatus) {
  const smoke = releaseStatus.lastInstalledSmoke || {};
  const smokeVersion = smoke.version || "not recorded";
  const smokeSha = smoke.installerSha256 || "not recorded";
  const smokeDate = smoke.testedAt || "not recorded";
  const smokeResult = smoke.result || "not-run";
  const notes = Array.isArray(smoke.notes) && smoke.notes.length
    ? smoke.notes.map((note) => `- ${note}`).join("\n")
    : "- No installed-smoke notes recorded.";
  const unreleasedNotes = Array.isArray(releaseStatus.unreleasedSourceNotes) && releaseStatus.unreleasedSourceNotes.length
    ? releaseStatus.unreleasedSourceNotes.map((note) => `- ${note}`).join("\n")
    : "- No unreleased source-only notes recorded.";
  const smokeException = releaseStatus.installedSmokeException
    ? `- Kind: \`${releaseStatus.installedSmokeException.kind}\`\n- Published version: \`${releaseStatus.installedSmokeException.publishedVersion}\`\n- Baseline installed smoke: \`${releaseStatus.installedSmokeException.baselineInstalledSmokeVersion}\`\n- Rationale: ${releaseStatus.installedSmokeException.rationale}\n- Focused evidence:\n${(releaseStatus.installedSmokeException.focusedEvidence || []).map((entry) => `  - ${entry}`).join("\n")}`
    : "- No exception recorded; published installer checkpoints require matching exact installed-smoke evidence.";
  return `# Pocket DAW Current Release Status

Generated from \`release-status.json\`. Refresh with \`npm run status:release\`.

| Field | Value |
| --- | --- |
| Source version | \`${releaseStatus.sourceVersion}\` |
| Project schema version | \`${releaseStatus.projectSchemaVersion}\` |
| Latest published version | \`${releaseStatus.latestPublishedVersion}\` |
| Latest published tag | \`${releaseStatus.latestPublishedTag}\` |
| Latest published commit | \`${releaseStatus.latestPublishedCommit || "not recorded"}\` |
| Last installed-smoke version | \`${smokeVersion}\` |
| Last installed-smoke result | \`${smokeResult}\` |
| Last installed-smoke date | \`${smokeDate}\` |
| Last installed-smoke installer | \`${smoke.installerFile || "not recorded"}\` |
| Last installed-smoke SHA-256 | \`${smokeSha}\` |

## Installed-Smoke Notes

${notes}

## Unreleased Source-Only Notes

${unreleasedNotes}

## Installed-Smoke Exception

${smokeException}

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
`;
}

export function writeReleaseStatusMarkdown(root = process.cwd(), outputPath = join(root, "docs", "CURRENT_RELEASE_STATUS.md")) {
  const releaseStatus = loadReleaseStatus(root);
  const context = loadReleaseStatusContext(root);
  const validation = validateReleaseStatus(releaseStatus, context);
  if (!validation.ok) {
    throw new Error(validation.failures.join("\n"));
  }
  const markdown = renderReleaseStatusMarkdown(releaseStatus);
  writeFileSync(outputPath, markdown, "utf8");
  return { outputPath, markdown };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
