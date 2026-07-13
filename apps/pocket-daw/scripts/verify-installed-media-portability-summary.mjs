import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const REQUIRED_EXPORTS = ["wav", "stem-zip", "section-loop-zip", "godot-adaptive-pack", "web-game-pack"];

export function validateInstalledMediaPortabilitySummary(summary, expectations = {}) {
  const failures = [];
  const expectedVersion = expectations.version || packageJson.version;
  const installerPath = expectations.installerPath || expectations.installer;
  const requireInstaller = booleanExpectation(expectations.requireInstaller);
  const requireExportFiles = expectations.requireExportFiles === undefined
    ? true
    : booleanExpectation(expectations.requireExportFiles);

  if (!isObject(summary)) return { ok: false, failures: ["summary must be a JSON object"] };
  if (summary.ok !== true) failures.push("summary.ok must be true");
  if (summary.runningVersion !== expectedVersion) failures.push(`runningVersion ${JSON.stringify(summary.runningVersion)} does not match expected ${JSON.stringify(expectedVersion)}`);
  requireIsoTimestamp(summary.testedAt, "testedAt", failures);
  if (summary.projectFolderMoved !== true) failures.push("projectFolderMoved must be true");
  if (summary.originalSourcesDeleted !== true) failures.push("originalSourcesDeleted must be true");
  if (summary.replacementSourceDeleted !== true) failures.push("replacementSourceDeleted must be true");
  if (typeof summary.originalProjectPath !== "string" || typeof summary.projectPath !== "string" || summary.originalProjectPath === summary.projectPath) {
    failures.push("originalProjectPath and projectPath must identify different locations");
  }

  validateInstaller(summary.installer, installerPath, requireInstaller, failures);
  validateInitial(summary.phases?.initial, failures);
  validatePortablePhase(summary.phases?.collected, "phases.collected", failures);
  validateCollectedFiles(summary.phases?.collected?.files, failures, requireExportFiles);
  validatePortablePhase(summary.phases?.movedReopen, "phases.movedReopen", failures);
  validateCacheFallback(summary.phases?.cacheFallback, failures);
  validatePortablePhase(summary.phases?.final, "phases.final", failures);
  validateExports(summary.exports, failures, requireExportFiles);
  validateGamePack(summary.gamePacks?.godot, "gamePacks.godot", failures);
  validateGamePack(summary.gamePacks?.web, "gamePacks.web", failures);

  if (!isObject(summary.invariants) || summary.invariants.errorCount !== 0) {
    failures.push("invariants.errorCount must be 0");
  }
  return { ok: failures.length === 0, failures };
}

export function verifyInstalledMediaPortabilitySummaryFile(options = {}) {
  const summaryPath = options.summaryPath || options.summary;
  if (!summaryPath) throw new Error("Missing required summary path.");
  if (!existsSync(summaryPath)) throw new Error(`Summary file does not exist: ${summaryPath}`);
  return validateInstalledMediaPortabilitySummary(JSON.parse(readFileSync(summaryPath, "utf8")), options);
}

function validateInstaller(installer, expectedPath, required, failures) {
  if (!required && !installer) return;
  if (!isObject(installer)) {
    failures.push("installer evidence is required");
    return;
  }
  if (!expectedPath) {
    if (required) failures.push("an installer path expectation is required");
    return;
  }
  if (!existsSync(expectedPath)) {
    failures.push(`installer does not exist: ${expectedPath}`);
    return;
  }
  if (!sameInstallerFile(installer.file, basename(expectedPath))) failures.push("installer.file does not match the tested installer");
  validateFileEvidence(installer, "installer", failures, true, expectedPath);
}

function validateInitial(phase, failures) {
  if (!isObject(phase) || !isObject(phase.portability)) {
    failures.push("phases.initial portability evidence is required");
    return;
  }
  if (!Number.isInteger(phase.externalReferenceCount) || phase.externalReferenceCount < 2) {
    failures.push("phases.initial.externalReferenceCount must prove at least two external media references");
  }
}

function validatePortablePhase(phase, label, failures) {
  if (!isObject(phase) || !isObject(phase.portability)) {
    failures.push(`${label}.portability is required`);
    return;
  }
  if (phase.externalReferenceCount !== 0) failures.push(`${label}.externalReferenceCount must be 0`);
  if (phase.runtimeOnlyCount !== 0) failures.push(`${label}.runtimeOnlyCount must be 0`);
  if (phase.missingCount !== 0) failures.push(`${label}.missingCount must be 0`);
  if (phase.portability.embeddedSourceProjectPortable !== true) failures.push(`${label}.portability.embeddedSourceProjectPortable must be true`);
  if (phase.portability.needsCollectionOrRelinkCount !== 0) failures.push(`${label}.portability.needsCollectionOrRelinkCount must be 0`);
}

function validateCacheFallback(phase, failures) {
  if (!isObject(phase) || !isObject(phase.portability) || !isObject(phase.item)) {
    failures.push("phases.cacheFallback portability and item evidence are required");
    return;
  }
  if (!Number.isInteger(phase.portability.cacheOnlyCount) || phase.portability.cacheOnlyCount < 1) failures.push("phases.cacheFallback.portability.cacheOnlyCount must be at least 1");
  if (!Number.isInteger(phase.missingCount) || phase.missingCount < 1) failures.push("phases.cacheFallback.missingCount must be at least 1");
  if (phase.item.lastReloadSourceKind !== "decoded-cache") failures.push("phases.cacheFallback.item.lastReloadSourceKind must be decoded-cache");
  if (phase.item.restoredFromNativeDecodedCache !== true) failures.push("phases.cacheFallback.item.restoredFromNativeDecodedCache must be true");
  if (phase.item.missing !== true || phase.item.unresolved !== true) failures.push("cache fallback must remain honestly missing and unresolved");
}

function validateCollectedFiles(files, failures, requireFiles) {
  if (!isObject(files)) {
    failures.push("phases.collected.files is required");
    return;
  }
  for (const key of ["mediaA", "mediaB", "decodedCacheB"]) validateFileEvidence(files[key], `phases.collected.files.${key}`, failures, requireFiles);
}

function validateExports(exports, failures, requireFiles) {
  if (!isObject(exports)) {
    failures.push("exports evidence is required");
    return;
  }
  for (const format of REQUIRED_EXPORTS) {
    const evidence = exports[format];
    validateFileEvidence(evidence, `exports.${format}`, failures, requireFiles);
    if (isObject(evidence) && !isObject(evidence.artifact)) failures.push(`exports.${format}.artifact is required`);
  }
}

function validateGamePack(pack, label, failures) {
  if (!isObject(pack) || pack.ok !== true) failures.push(`${label}.ok must be true`);
  if (isObject(pack) && Array.isArray(pack.errors) && pack.errors.length) failures.push(`${label}.errors must be empty`);
}

function validateFileEvidence(evidence, label, failures, requireFile, forcedPath = "") {
  if (!isObject(evidence)) {
    failures.push(`${label} must be a file evidence object`);
    return;
  }
  if (!Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes <= 0) failures.push(`${label}.sizeBytes must be positive`);
  if (!/^[a-f0-9]{64}$/i.test(String(evidence.sha256 || ""))) failures.push(`${label}.sha256 must be a SHA-256 digest`);
  const filePath = forcedPath || evidence.path;
  if (!requireFile) return;
  if (typeof filePath !== "string" || !filePath) {
    failures.push(`${label}.path is required`);
    return;
  }
  if (!existsSync(filePath)) {
    failures.push(`${label}.path does not exist: ${filePath}`);
    return;
  }
  const bytes = readFileSync(filePath);
  if (bytes.length !== evidence.sizeBytes) failures.push(`${label}.sizeBytes does not match the file`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== String(evidence.sha256 || "").toLowerCase()) failures.push(`${label}.sha256 does not match the file`);
}

function requireIsoTimestamp(value, label, failures) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) failures.push(`${label} must be a UTC ISO timestamp`);
}

function booleanExpectation(value) {
  return value === true || value === "true" || value === "1";
}

function sameInstallerFile(actual, expected) {
  if (actual === expected) return true;
  return typeof actual === "string" && actual.replace(/^Pocket[ .]DAW_/, "Pocket DAW_") === expected.replace(/^Pocket[ .]DAW_/, "Pocket DAW_");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--require-installer") {
      parsed.requireInstaller = true;
      continue;
    }
    if (arg === "--no-require-export-files") {
      parsed.requireExportFiles = false;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[key] = value;
  }
  return parsed;
}

if (process.argv[1] && process.argv[1].endsWith("verify-installed-media-portability-summary.mjs")) {
  try {
    const result = verifyInstalledMediaPortabilitySummaryFile(parseArgs(process.argv.slice(2)));
    if (!result.ok) {
      result.failures.forEach((failure) => console.error(failure));
      process.exit(1);
    }
    console.log("Installed media portability smoke summary verification OK");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
