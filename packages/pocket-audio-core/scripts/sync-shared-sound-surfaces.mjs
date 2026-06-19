import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const repoRoot = new URL("../../../", import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);

const tasks = [
  {
    label: "Godot shared sound metadata",
    args: ["packages/pocket-audio-core/scripts/generate-godot-sound-metadata.mjs"]
  },
  {
    label: "Pocket DAW native sound recipes",
    args: ["apps/pocket-daw/scripts/generate-native-sound-recipes.mjs"]
  }
];

for (const task of tasks) {
  const args = check ? [...task.args, "--check"] : task.args;
  console.log(`${check ? "Verifying" : "Generating"} ${task.label}...`);
  const result = spawnSync(process.execPath, args, {
    cwd: repoRootPath,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(check ? "Shared sound surfaces are up to date." : "Shared sound surfaces generated.");
