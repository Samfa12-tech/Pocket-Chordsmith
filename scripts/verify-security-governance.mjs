import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const requiredLockfiles = [
  "apps/chordsmith-web/package-lock.json",
  "apps/pocket-dj/package-lock.json",
  "apps/pocket-daw/package-lock.json",
  "apps/pocket-daw/src-tauri/Cargo.lock",
  "packages/pocket-audio-core/package-lock.json",
  "packages/pcs-format/package-lock.json",
];
const requiredFiles = [
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  "LICENSES.md",
  "docs/generated/LICENSING_TABLE.md",
  "docs/generated/SECURITY_SCOPE.md",
];
const errors = [];

for (const path of [...requiredLockfiles, ...requiredFiles]) {
  if (!existsSync(resolve(root, path))) errors.push(`Missing security/release input: ${path}`);
}

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
for (const path of tracked) {
  if (/(^|\/)\.env(?:\.|$)/i.test(path)) errors.push(`Environment/config file must not be tracked: ${path}`);
}

const security = readFileSync(resolve(root, "SECURITY.md"), "utf8");
for (const path of ["apps/pocket-audio-handoff/", "packages/pcs-format/", "apps/archive/unsupported-runnable-builds/"]) {
  if (!security.includes(path)) errors.push(`SECURITY.md is missing scope/policy path: ${path}`);
}

if (errors.length) {
  console.error("Security governance verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Security governance verification passed.");
