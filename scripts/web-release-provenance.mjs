import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(args.repoRoot || ".");
const zipPath = resolve(repoRoot, required("zip"));
const outputPath = resolve(repoRoot, required("output"));
const sourceEntry = required("sourceEntry").replaceAll("\\", "/");
const requiredFiles = list("required");

if (!existsSync(zipPath)) throw new Error(`Release package does not exist: ${zipPath}`);
if (!existsSync(resolve(repoRoot, sourceEntry))) throw new Error(`Source entry does not exist: ${sourceEntry}`);
if (!requiredFiles.length) throw new Error("At least one --required file is required.");

const sourceCommit = git(["rev-parse", "HEAD"]);
const dirtyPaths = git(["status", "--porcelain", "--untracked-files=normal"])
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.slice(3).replaceAll("\\", "/"));
const builtAt = sourceDate();
const zipBytes = readFileSync(zipPath);
const manifest = {
  manifestVersion: 1,
  product: required("product"),
  sourceCommit,
  dirtyWorkingTree: dirtyPaths.length > 0,
  dirtyPaths,
  internalBuild: required("build"),
  schemaVersion: numberOrString(required("schema")),
  legacySchemaVersion: args.legacySchema ? numberOrString(args.legacySchema) : null,
  coreVersion: args.core || null,
  builtAt,
  packageFile: basename(zipPath),
  packageSha256: createHash("sha256").update(zipBytes).digest("hex"),
  sourceEntry,
  requiredFiles,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${relative(repoRoot, outputPath)} for ${manifest.packageFile} (${manifest.packageSha256})`);

function parseArgs(values) {
  const parsed = { required: [] };
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    if (key === "required") parsed.required.push(value.replaceAll("\\", "/"));
    else parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function required(key) {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function list(key) {
  return Array.isArray(args[key]) ? args[key] : [];
}

function git(commandArgs) {
  return execFileSync("git", commandArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function sourceDate() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (!epoch) return new Date().toISOString();
  const timestamp = Number(epoch);
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error("SOURCE_DATE_EPOCH must be a non-negative number.");
  return new Date(timestamp * 1000).toISOString();
}

function numberOrString(value) {
  const number = Number(value);
  return String(number) === String(value) ? number : value;
}
