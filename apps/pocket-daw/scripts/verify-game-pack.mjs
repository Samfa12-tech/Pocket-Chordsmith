import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const VALID_KINDS = new Set(["godot-adaptive-pack", "web-game-pack"]);
const MANIFEST_BY_KIND = {
  "godot-adaptive-pack": "manifests/godot-adaptive-manifest.json",
  "web-game-pack": "manifests/web-game-manifest.json"
};

export function verifyGamePackZip(zipPath, options = {}) {
  const errors = [];
  const warnings = [];
  const expectedKind = options.kind || "";
  if (expectedKind && !VALID_KINDS.has(expectedKind)) {
    errors.push(`Unsupported expected game-pack kind: ${expectedKind}.`);
  }
  if (!existsSync(zipPath)) {
    return failResult(zipPath, expectedKind, [`ZIP file does not exist: ${zipPath}`], warnings);
  }

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (error) {
    return failResult(zipPath, expectedKind, [`Could not read ZIP file: ${errorMessage(error)}`], warnings);
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const entryPaths = entries.map((entry) => normalizeZipPath(entry.entryName));
  const entrySet = new Set(entryPaths);
  const entrySizes = new Map(entries.map((entry) => [normalizeZipPath(entry.entryName), entry.header.size]));
  const unsafeEntryPaths = entryPaths.filter((entryPath) => !isSafePackPath(entryPath));
  unsafeEntryPaths.forEach((entryPath) => errors.push(`Unsafe ZIP entry path: ${entryPath}`));

  const manifestPaths = entryPaths.filter((entryPath) => entryPath.startsWith("manifests/") && entryPath.endsWith(".json"));
  if (manifestPaths.length !== 1) errors.push(`Expected exactly one manifest JSON under manifests/, found ${manifestPaths.length}.`);
  const manifestPath = expectedKind && MANIFEST_BY_KIND[expectedKind] ? MANIFEST_BY_KIND[expectedKind] : manifestPaths[0];
  if (manifestPath && !entrySet.has(manifestPath)) errors.push(`Expected manifest file is missing from ZIP: ${manifestPath}`);

  let manifest = null;
  if (manifestPath && entrySet.has(manifestPath)) {
    try {
      manifest = JSON.parse(zip.readAsText(manifestPath));
    } catch (error) {
      errors.push(`Could not parse manifest ${manifestPath}: ${errorMessage(error)}`);
    }
  }

  if (manifest) {
    verifyManifest(manifest, { manifestPath, expectedKind, entrySet, entrySizes, errors, warnings });
    verifyEmbeddedSourceProject(manifest, { zip, entrySet, errors });
  }

  if (!warnings.some((warning) => warning.includes("Manual target-runtime smoke"))) {
    warnings.push("Manual target-runtime smoke is still required before claiming Godot/Web import validation.");
  }

  return {
    ok: errors.length === 0,
    zipPath,
    kind: manifest?.kind || expectedKind || null,
    manifestPath: manifestPath || null,
    entryCount: entries.length,
    errors,
    warnings
  };
}

function verifyManifest(manifest, context) {
  const { manifestPath, expectedKind, entrySet, entrySizes, errors, warnings } = context;
  if (!VALID_KINDS.has(manifest.kind)) errors.push(`Manifest kind is not a supported game-pack kind: ${String(manifest.kind)}.`);
  if (expectedKind && manifest.kind !== expectedKind) errors.push(`Manifest kind ${manifest.kind} does not match expected kind ${expectedKind}.`);
  if (manifest.manifestFile !== manifestPath) errors.push(`Manifest manifestFile ${String(manifest.manifestFile)} does not match ZIP path ${manifestPath}.`);

  const files = Array.isArray(manifest.files) ? manifest.files.map(normalizeZipPath) : [];
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (!files.length) errors.push("Manifest files must be a non-empty array.");
  if (!artifacts.length) errors.push("Manifest artifacts must be a non-empty array.");

  [...files, ...artifacts.map((artifact) => normalizeZipPath(artifact?.path || ""))]
    .filter(Boolean)
    .forEach((packPath) => {
      if (!isSafePackPath(packPath)) errors.push(`Unsafe manifest path: ${packPath}`);
      if (!entrySet.has(packPath)) errors.push(`Manifest path is missing from ZIP: ${packPath}`);
    });

  const artifactPaths = artifacts.map((artifact) => normalizeZipPath(artifact?.path || "")).filter(Boolean);
  const duplicateArtifactPaths = duplicates(artifactPaths);
  duplicateArtifactPaths.forEach((packPath) => errors.push(`Duplicate artifact path in manifest: ${packPath}`));
  if (artifactPaths.length && JSON.stringify(artifactPaths) !== JSON.stringify(files)) {
    errors.push("Manifest artifacts paths must match manifest files in order.");
  }

  verifyRequiredPackFiles(manifest, { entrySet, errors });
  verifyArtifactSizes(artifacts, { entrySizes, errors });
  verifySizeSummary(manifest, { artifacts, errors });
  verifyAudioMetadata(manifest, { errors, warnings });
}

function verifyRequiredPackFiles(manifest, { entrySet, errors }) {
  const sourceProject = normalizeZipPath(manifest.sourceProject || "");
  const fullMix = normalizeZipPath(manifest.fullMix || "");
  const stems = Array.isArray(manifest.stems) ? manifest.stems : [];
  const loops = Array.isArray(manifest.sectionLoops) ? manifest.sectionLoops : [];

  if (!sourceProject || !sourceProject.startsWith("source/") || !sourceProject.endsWith(".pocketdaw.json")) errors.push("Manifest sourceProject must point to source/*.pocketdaw.json.");
  if (sourceProject && !entrySet.has(sourceProject)) errors.push(`Source project is missing from ZIP: ${sourceProject}`);
  if (!fullMix || !fullMix.startsWith("audio/full/") || !fullMix.endsWith(".wav")) errors.push("Manifest fullMix must point to audio/full/*.wav.");
  if (fullMix && !entrySet.has(fullMix)) errors.push(`Full mix is missing from ZIP: ${fullMix}`);
  if (!stems.length) errors.push("Manifest must include at least one stem.");
  if (!loops.length) errors.push("Manifest must include at least one section loop.");
  stems.forEach((stem) => {
    const packPath = normalizeZipPath(stem?.packPath || "");
    if (!packPath.startsWith("audio/stems/") || !packPath.endsWith(".wav")) errors.push(`Stem packPath must point to audio/stems/*.wav: ${packPath}`);
  });
  loops.forEach((loop) => {
    const packPath = normalizeZipPath(loop?.packPath || "");
    if (!packPath.startsWith("audio/sections/") || !packPath.endsWith(".wav")) errors.push(`Section loop packPath must point to audio/sections/*.wav: ${packPath}`);
  });
}

function verifyArtifactSizes(artifacts, { entrySizes, errors }) {
  artifacts.forEach((artifact) => {
    const packPath = normalizeZipPath(artifact?.path || "");
    const expected = entrySizes.get(packPath);
    if (expected === undefined) return;
    if (artifact.sizeBytes !== expected) {
      errors.push(`Artifact size mismatch for ${packPath}: manifest ${String(artifact.sizeBytes)}, ZIP ${expected}.`);
    }
  });
}

function verifySizeSummary(manifest, { artifacts, errors }) {
  const summary = manifest.sizeSummary || {};
  const rendered = artifacts.filter((artifact) => artifact?.sizeBytes !== null && artifact?.sizeBytes !== undefined);
  const audio = artifacts.filter((artifact) => artifact?.audio);
  const renderedAudio = audio.filter((artifact) => artifact?.sizeBytes !== null && artifact?.sizeBytes !== undefined);
  const totalSizeBytes = rendered.length === artifacts.length ? rendered.reduce((sum, artifact) => sum + Number(artifact.sizeBytes || 0), 0) : null;
  const audioSizeBytes = renderedAudio.length === audio.length ? renderedAudio.reduce((sum, artifact) => sum + Number(artifact.sizeBytes || 0), 0) : null;
  const missingSizePaths = artifacts.filter((artifact) => artifact?.sizeBytes === null || artifact?.sizeBytes === undefined).map((artifact) => normalizeZipPath(artifact?.path || ""));
  const largest = rendered.reduce((current, artifact) => {
    if (!current) return artifact;
    return Number(artifact.sizeBytes || 0) > Number(current.sizeBytes || 0) ? artifact : current;
  }, null);
  const largestEntry = largest ? { path: normalizeZipPath(largest.path || ""), sizeBytes: Number(largest.sizeBytes || 0) } : null;

  assertEqual(summary.expectedFileCount, artifacts.length, "sizeSummary.expectedFileCount", errors);
  assertEqual(summary.renderedFileCount, rendered.length, "sizeSummary.renderedFileCount", errors);
  assertEqual(summary.audioFileCount, audio.length, "sizeSummary.audioFileCount", errors);
  assertEqual(summary.totalSizeBytes, totalSizeBytes, "sizeSummary.totalSizeBytes", errors);
  assertEqual(summary.audioSizeBytes, audioSizeBytes, "sizeSummary.audioSizeBytes", errors);
  if (JSON.stringify(summary.missingSizePaths || []) !== JSON.stringify(missingSizePaths)) {
    errors.push("sizeSummary.missingSizePaths does not match artifact size metadata.");
  }
  if (JSON.stringify(summary.largestEntry || null) !== JSON.stringify(largestEntry)) {
    errors.push("sizeSummary.largestEntry does not match artifact size metadata.");
  }
}

function verifyAudioMetadata(manifest, { errors, warnings }) {
  const current = manifest.audio?.current;
  if (!isWavImplemented(current)) errors.push("Manifest audio.current must be implemented WAV metadata for current game packs.");
  const planned = Array.isArray(manifest.audio?.plannedFormats) ? manifest.audio.plannedFormats : [];
  const plannedByFormat = new Map(planned.map((item) => [item?.format, item]));
  for (const format of ["flac", "ogg-vorbis", "mp3"]) {
    const metadata = plannedByFormat.get(format);
    if (!metadata) {
      errors.push(`Missing planned codec metadata for ${format}.`);
      continue;
    }
    if (metadata.status !== "planned" || metadata.targetRuntimeSmoke !== "required-before-release-claim") {
      errors.push(`Planned codec metadata for ${format} must remain planned with target-runtime smoke required.`);
    }
  }
  const audioArtifacts = (Array.isArray(manifest.artifacts) ? manifest.artifacts : []).filter((artifact) => artifact?.audio);
  audioArtifacts.forEach((artifact) => {
    if (!isWavImplemented(artifact.audio)) errors.push(`Audio artifact ${artifact.path || "[missing path]"} must use implemented WAV metadata.`);
    if (!String(artifact.path || "").endsWith(".wav")) errors.push(`Audio artifact ${artifact.path || "[missing path]"} must use a .wav path.`);
  });
  if (manifest.audio?.releaseStatus && !String(manifest.audio.releaseStatus).toLowerCase().includes("wav")) {
    warnings.push("Manifest audio.releaseStatus does not explicitly mention WAV.");
  }
}

function verifyEmbeddedSourceProject(manifest, { zip, entrySet, errors }) {
  const sourceProjectPath = normalizeZipPath(manifest.sourceProject || "");
  if (!sourceProjectPath || !entrySet.has(sourceProjectPath)) return;
  let project;
  try {
    project = JSON.parse(zip.readAsText(sourceProjectPath));
  } catch (error) {
    errors.push(`Could not parse embedded source project ${sourceProjectPath}: ${errorMessage(error)}`);
    return;
  }
  const mediaPool = Array.isArray(project?.mediaPool) ? project.mediaPool : [];
  if (!mediaPool.length) return;
  const localRefs = findEmbeddedSourceLocalMediaRefs(mediaPool);
  if (localRefs.localReferenceFieldCount) {
    const keys = localRefs.affectedFieldKeys.length ? ` (${localRefs.affectedFieldKeys.join(", ")})` : "";
    errors.push(`${sourceProjectPath}: embedded source project contains ${localRefs.localReferenceFieldCount} local media reference field${localRefs.localReferenceFieldCount === 1 ? "" : "s"}${keys}; collect or relink media before sharing the pack.`);
  }
  const manifestShared = manifest.sharedMediaPortability;
  if (manifestShared && Number(manifestShared.localReferenceFieldCount) !== localRefs.localReferenceFieldCount) {
    errors.push(`${sourceProjectPath}: sharedMediaPortability.localReferenceFieldCount expected ${localRefs.localReferenceFieldCount} but found ${String(manifestShared.localReferenceFieldCount)}.`);
  }
}

function findEmbeddedSourceLocalMediaRefs(mediaPool) {
  const affectedFieldKeys = new Set();
  let localReferenceFieldCount = 0;
  mediaPool.forEach((item) => {
    const fields = [["uri", item?.uri], ...Object.entries(item?.metadata || {})];
    fields.forEach(([key, value]) => {
      if (!isLocalMediaReferenceField(key, value)) return;
      affectedFieldKeys.add(key);
      localReferenceFieldCount += 1;
    });
  });
  return {
    localReferenceFieldCount,
    affectedFieldKeys: Array.from(affectedFieldKeys).sort()
  };
}

function isLocalMediaReferenceField(key, value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || isProjectRelativeMediaPath(trimmed)) return false;
  if (key === "uri" || /(?:uri|path|file|source|original|native|reload)/i.test(key)) {
    return isExternalMediaPath(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\\\");
  }
  return false;
}

function isProjectRelativeMediaPath(value) {
  const normalized = normalizeZipPath(String(value || "").replace(/^project:\/\/media\//i, "project-media/"));
  if (!normalized || normalized.includes("://") || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/") || normalized.startsWith("\\\\")) return false;
  if (!normalized.startsWith("project-media/") && !normalized.startsWith("project-cache/")) return false;
  return !normalized.split("/").some((part) => !part || part === "." || part === "..");
}

function isExternalMediaPath(value) {
  return /^(file|https?):/i.test(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function isWavImplemented(metadata) {
  return metadata?.format === "wav" &&
    metadata?.status === "implemented" &&
    metadata?.extension === "wav" &&
    metadata?.targetRuntimeSmoke === "required-before-release-claim";
}

function normalizeZipPath(packPath) {
  return String(packPath || "").replace(/\\/g, "/");
}

function isSafePackPath(packPath) {
  if (!packPath || packPath.startsWith("/") || /^[A-Za-z]:\//.test(packPath) || packPath.includes("://")) return false;
  return !packPath.split("/").some((part) => part === "" || part === "." || part === "..");
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach((value) => {
    if (seen.has(value)) repeated.add(value);
    else seen.add(value);
  });
  return Array.from(repeated);
}

function assertEqual(actual, expected, label, errors) {
  if (actual !== expected) errors.push(`${label} expected ${String(expected)} but found ${String(actual)}.`);
}

function failResult(zipPath, kind, errors, warnings) {
  return { ok: false, zipPath, kind: kind || null, manifestPath: null, entryCount: 0, errors, warnings };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv) {
  const args = [...argv];
  let kind = "";
  const positional = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--kind") {
      kind = args.shift() || "";
      continue;
    }
    positional.push(arg);
  }
  return { zipPath: positional[0] || "", kind };
}

async function main() {
  const { zipPath, kind } = parseArgs(process.argv.slice(2));
  if (!zipPath) {
    console.error("Usage: node scripts/verify-game-pack.mjs <pack.zip> [--kind godot-adaptive-pack|web-game-pack]");
    process.exitCode = 2;
    return;
  }
  const resolved = path.resolve(zipPath);
  const result = verifyGamePackZip(resolved, { kind });
  let sizeText = "";
  try {
    const info = await stat(resolved);
    sizeText = ` (${info.size} bytes)`;
  } catch {
    sizeText = "";
  }
  if (result.ok) {
    console.log(`Game pack OK: ${resolved}${sizeText}`);
    console.log(`Kind: ${result.kind || "unknown"}; manifest: ${result.manifestPath || "none"}; entries: ${result.entryCount}`);
    result.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
    return;
  }
  console.error(`Game pack verification failed: ${resolved}${sizeText}`);
  result.errors.forEach((error) => console.error(`- ${error}`));
  result.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
