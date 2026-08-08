import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const packageRoots = [
  "apps/chordsmith-web",
  "apps/pocket-dj",
  "apps/pocket-daw",
  "packages/pocket-audio-core",
  "packages/pcs-format",
];
const failed = [];

for (const packageRoot of packageRoots) {
  if (!existsSync(resolve(root, packageRoot, "package-lock.json"))) continue;
  const windows = process.platform === "win32";
  const command = windows ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe" : "npm";
  const commandArgs = windows ? ["/d", "/s", "/c", "npm audit --audit-level=high"] : ["audit", "--audit-level=high"];
  const result = spawnSync(command, commandArgs, {
    cwd: resolve(root, packageRoot),
    encoding: "utf8",
    shell: false,
  });
  if (result.status === 0) {
    console.log(`${packageRoot}: dependency audit passed`);
  } else {
    failed.push(packageRoot);
    console.error(`${packageRoot}: dependency audit failed (details available from npm audit in that component)`);
  }
}

if (failed.length) process.exit(1);
