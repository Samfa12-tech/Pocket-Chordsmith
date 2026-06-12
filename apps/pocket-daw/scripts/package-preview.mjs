import AdmZip from "adm-zip";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

export const RELEASE_DOCS = [
  "WHAT_WORKS_AND_WHATS_NEXT.md",
  "POCKET_DAW_NORTH_STAR.md",
  "docs/V0_5_1_HARDENING_NOTES.md",
  "docs/POCKET_AUDIO_CORE_CONVERGENCE_REVIEW.md",
  "docs/v0.5.1-verification.md",
  "docs/PRIVATE_ALPHA_RELEASE_CHECKLIST.md",
  "docs/RELEASE_NOTES_TEMPLATE.md",
  "docs/WINDOWS_TESTING_CHECKLIST.md",
  "docs/V0_6_FOUNDATION_NOTES.md",
  "docs/RECORDING_PREP.md"
];

export function previewZipName(version) {
  const safeVersion = String(version || "0.0.0").replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "-");
  return `pocket-daw-browser-preview-v${safeVersion}.zip`;
}

export function copyReleaseDocs(root, distDir, releaseDir) {
  RELEASE_DOCS.forEach((doc) => {
    const distTarget = join(distDir, doc);
    const releaseTarget = join(releaseDir, doc);
    mkdirSync(dirname(distTarget), { recursive: true });
    mkdirSync(dirname(releaseTarget), { recursive: true });
    copyFileSync(join(root, doc), distTarget);
    copyFileSync(join(root, doc), releaseTarget);
  });
}

export function createPreviewZip({ root = process.cwd(), version = packageJson.version } = {}) {
  const distDir = join(root, "dist");
  const releaseDir = join(root, "releases");
  if (!existsSync(distDir)) throw new Error("dist/ does not exist. Run npm run build before packaging preview.");
  mkdirSync(releaseDir, { recursive: true });
  copyReleaseDocs(root, distDir, releaseDir);

  const zipPath = join(releaseDir, previewZipName(version));
  if (existsSync(zipPath)) rmSync(zipPath);

  const zip = new AdmZip();
  zip.addLocalFolder(distDir);
  zip.writeZip(zipPath);
  return zipPath;
}

const invokedPath = process.argv[1] ? fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`)) : "";
if (basename(invokedPath) === basename(fileURLToPath(import.meta.url))) {
  const zipPath = createPreviewZip();
  console.log(`Wrote ${zipPath}`);
}
