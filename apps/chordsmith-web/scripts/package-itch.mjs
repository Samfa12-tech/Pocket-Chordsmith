import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = resolve("..", "releases", "web-app");
const outputZip = resolve(outputDir, "pocket-chordsmith-web.zip");
const bestzipCli = resolve("node_modules", "bestzip", "bin", "cli.js");

mkdirSync(outputDir, { recursive: true });

const result = spawnSync(process.execPath, [bestzipCli, outputZip, "*"], {
  cwd: resolve("dist"),
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
