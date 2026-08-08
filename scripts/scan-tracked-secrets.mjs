import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const excludedPrefixes = ["apps/archive/unsupported-runnable-builds/"];
const binaryExtensions = new Set([".png", ".ico", ".wav", ".mid", ".midi", ".zip"]);
const patterns = [
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[oprsu]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];
const findings = [];

for (const relativePath of tracked) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (excludedPrefixes.some((prefix) => normalized.startsWith(prefix))) continue;
  if (binaryExtensions.has(extname(normalized).toLowerCase())) continue;
  let source;
  try {
    source = readFileSync(resolve(root, relativePath), "utf8");
  } catch {
    continue;
  }
  if (source.includes("\0")) continue;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const [label, pattern] of patterns) {
      if (pattern.test(lines[index])) findings.push(`${normalized}:${index + 1} (${label})`);
    }
  }
}

if (findings.length) {
  console.error("Potential tracked secrets found. Values are intentionally redacted:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Tracked-secret scan passed for ${tracked.length} files (archive snapshots excluded by policy).`);
