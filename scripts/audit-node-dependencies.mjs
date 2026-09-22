#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
export const packageRoots = [
  "apps/chordsmith-web",
  "apps/pocket-dj",
  "apps/pocket-daw",
  "packages/pocket-audio-core",
  "packages/pcs-format",
];

export function auditNodeDependencies({
  repositoryRoot = root,
  packages = packageRoots,
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  spawn = spawnSync,
  stdout = (line) => process.stdout.write(`${line}\n`),
  stderr = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  const failed = [];

  for (const packageRoot of packages) {
    const directory = resolve(repositoryRoot, packageRoot);
    const lockfile = resolve(directory, "package-lock.json");
    if (!exists(lockfile)) {
      failed.push(packageRoot);
      stderr(`${packageRoot}: dependency audit cannot run; package-lock.json is missing`);
      continue;
    }

    const windows = platform === "win32";
    const command = windows ? env.ComSpec || "C:\\Windows\\System32\\cmd.exe" : "npm";
    const commandArgs = windows ? ["/d", "/s", "/c", "npm audit --audit-level=high"] : ["audit", "--audit-level=high"];
    const result = spawn(command, commandArgs, {
      cwd: directory,
      encoding: "utf8",
      shell: false,
      stdio: "inherit",
    });

    if (result.error) {
      failed.push(packageRoot);
      stderr(`${packageRoot}: dependency audit could not start: ${result.error.message}`);
    } else if (result.status === 0) {
      stdout(`${packageRoot}: dependency audit passed`);
    } else {
      failed.push(packageRoot);
      const termination = result.status === null
        ? `did not exit normally${result.signal ? ` (signal ${result.signal})` : ""}`
        : `failed with exit code ${result.status}`;
      stderr(`${packageRoot}: dependency audit ${termination}`);
    }
  }

  if (failed.length) stderr(`Dependency audit failed for: ${failed.join(", ")}`);
  return { exitCode: failed.length ? 1 : 0, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = auditNodeDependencies().exitCode;
}
