import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const archiveRoot = resolve(root, "apps", "archive");
const manifestPath = resolve(archiveRoot, "archive-manifest.json");
const indexPath = resolve(archiveRoot, "ARCHIVE_INDEX.md");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const check = process.argv.includes("--check");
const errors = [];
const paths = new Set();

for (const entry of manifest.entries || []) {
  if (paths.has(entry.path.toLowerCase())) errors.push(`Duplicate archive path: ${entry.path}`);
  paths.add(entry.path.toLowerCase());
  const path = resolve(archiveRoot, entry.path);
  if (!path.startsWith(archiveRoot)) {
    errors.push(`Archive path escapes root: ${entry.path}`);
    continue;
  }
  if (!existsSync(path)) {
    errors.push(`Missing archived file: ${entry.path}`);
    continue;
  }
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== entry.sha256) errors.push(`Immutable archive hash mismatch: ${entry.path}`);
}

const rows = manifest.entries.map((entry) => `| ${entry.version} | ${entry.date} | \`${entry.path}\` | ${entry.reason} | \`${entry.sha256}\` |`);
const content = `# Unsupported Runnable Archive Index\n\n> Generated from \`archive-manifest.json\`. These files are unsupported, immutable historical snapshots and are excluded from current package inputs and normal searches.\n\n| Version | Date retained | Path | Reason retained | SHA-256 |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;

if (check) {
  if (!existsSync(indexPath)) errors.push("Missing generated apps/archive/ARCHIVE_INDEX.md");
  else if (readFileSync(indexPath, "utf8") !== content) errors.push("Generated archive index is stale");
} else {
  writeFileSync(indexPath, content);
  console.log("Generated apps/archive/ARCHIVE_INDEX.md");
}

if (errors.length) {
  console.error("Archive verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(check ? "Archive index and hashes are current." : "Archive index generated.");
