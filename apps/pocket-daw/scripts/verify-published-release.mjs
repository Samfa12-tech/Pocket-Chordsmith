import { createHash } from "node:crypto";
import { basename } from "node:path";

export function normalizeGithubAssetName(name) {
  return String(name || "").replace(/ +/g, ".").toLowerCase();
}

export function expectedGithubReleaseArtifacts({ staged, receiptPath, receipt, receiptSha256 }) {
  return [
    { path: staged.setupExe, sha256: receipt.artifacts.setupExe.sha256 },
    { path: staged.setupSig, sha256: receipt.artifacts.setupSignature.sha256 },
    { path: staged.msi, sha256: receipt.artifacts.msi.sha256 },
    { path: staged.msiSig, sha256: receipt.artifacts.msiSignature.sha256 },
    { path: staged.updaterManifest, sha256: receipt.artifacts.updaterManifest.sha256 },
    { path: staged.bootstrapperManifest, sha256: receipt.artifacts.bootstrapperManifest.sha256 },
    { path: staged.updaterChecksums, sha256: receipt.artifacts.updaterChecksums.sha256 },
    { path: staged.checksums, sha256: receipt.artifacts.releaseChecksums.sha256 },
    { path: staged.manifest, sha256: receipt.artifacts.releaseManifest.sha256 },
    { path: staged.verdict, sha256: receipt.artifacts.releaseVerdict.sha256 },
    { path: receiptPath, sha256: receiptSha256 }
  ];
}

export async function verifyGithubReleaseSnapshot({ releaseView, expectedTag, expectedTargetCommit, expectedArtifacts, fetchImpl = fetch }) {
  const failures = [];
  if (releaseView?.tagName !== expectedTag) failures.push(`GitHub release tag ${releaseView?.tagName || "[missing]"} does not match ${expectedTag}.`);
  if (releaseView?.targetCommitish !== expectedTargetCommit) failures.push(`GitHub release target ${releaseView?.targetCommitish || "[missing]"} does not match ${expectedTargetCommit}.`);

  const expectedByName = new Map();
  for (const artifact of expectedArtifacts || []) {
    const normalized = normalizeGithubAssetName(basename(artifact.path));
    if (expectedByName.has(normalized)) failures.push(`Duplicate expected GitHub asset name: ${basename(artifact.path)}.`);
    expectedByName.set(normalized, artifact);
  }
  const actualByName = new Map();
  for (const asset of releaseView?.assets || []) {
    const normalized = normalizeGithubAssetName(asset?.name);
    if (!normalized || actualByName.has(normalized)) failures.push(`Duplicate or invalid uploaded GitHub asset name: ${asset?.name || "[missing]"}.`);
    else actualByName.set(normalized, asset);
  }
  for (const [name, artifact] of expectedByName) {
    if (!actualByName.has(name)) failures.push(`GitHub release is missing receipt-bound asset ${basename(artifact.path)}.`);
  }
  for (const [name, asset] of actualByName) {
    if (!expectedByName.has(name)) failures.push(`GitHub release contains unexpected asset ${asset.name}.`);
  }
  if (failures.length) return { ok: false, failures };

  for (const [name, artifact] of expectedByName) {
    const asset = actualByName.get(name);
    if (typeof asset.url !== "string" || !asset.url) {
      failures.push(`GitHub asset ${asset.name} has no download URL.`);
      continue;
    }
    const response = await fetchImpl(asset.url);
    if (!response.ok) {
      failures.push(`GitHub asset download failed for ${asset.name}: ${response.status}.`);
      continue;
    }
    const actualHash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    if (actualHash !== artifact.sha256) failures.push(`GitHub asset hash mismatch for ${asset.name}: expected ${artifact.sha256}, got ${actualHash}.`);
  }
  return { ok: failures.length === 0, failures };
}
