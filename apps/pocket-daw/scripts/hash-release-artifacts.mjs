import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
import { mkdirSync } from "node:fs";

export function toPosixPath(path) {
  return path.split(sep).join("/");
}

export function relativeArtifactPath(root, path) {
  return toPosixPath(relative(root, path));
}

export function fileSizeBytes(path) {
  return statSync(path).size;
}

export async function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = `${root}${sep}${entry.name}`;
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function hashArtifacts(root, paths) {
  const artifacts = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    artifacts.push({
      path: relativeArtifactPath(root, path),
      sizeBytes: fileSizeBytes(path),
      sha256: await sha256File(path)
    });
  }
  return artifacts;
}

export function writeChecksumFile(path, artifacts) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = artifacts
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((artifact) => `${artifact.sha256}  ${artifact.path}`);
  writeFileSync(path, `${lines.join("\n")}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("hash-release-artifacts.mjs")) {
  const [root = process.cwd(), out, ...paths] = process.argv.slice(2);
  if (!out || !paths.length) {
    console.error("Usage: node scripts/hash-release-artifacts.mjs <root> <out-file> <artifact...>");
    process.exit(1);
  }
  const artifacts = await hashArtifacts(root, paths);
  writeChecksumFile(out, artifacts);
  console.log(`Wrote ${out}`);
}
