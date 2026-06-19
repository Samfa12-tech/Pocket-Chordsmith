import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../../../", import.meta.url);
const coreRoot = new URL("../", import.meta.url);
const dawRoot = new URL("../../../apps/pocket-daw/", import.meta.url);
const npmCommand = npmTaskCommand();

const tasks = [
  {
    label: "shared sound-surface freshness",
    cwd: coreRoot,
    command: npmCommand.command,
    args: [...npmCommand.prefixArgs, "run", "verify:sound-surfaces"]
  },
  {
    label: "cross-app sound surface drift tests",
    cwd: coreRoot,
    command: process.execPath,
    args: ["--test", "tests/surface-drift.test.js"]
  },
  {
    label: "Chordsmith browser trace parity",
    cwd: coreRoot,
    command: npmCommand.command,
    args: [...npmCommand.prefixArgs, "run", "compare:chordsmith-browser-trace"]
  },
  {
    label: "core event/render/Godot pack fixtures",
    cwd: coreRoot,
    command: process.execPath,
    args: ["--test", "tests/core.test.js", "tests/golden.test.js", "tests/godot-kit.test.js"]
  },
  {
    label: "Pocket DAW Chordsmith parity import/render/export tests",
    cwd: dawRoot,
    command: npmCommand.command,
    args: [
      ...npmCommand.prefixArgs,
      "test",
      "--",
      "tests/parityFixtures.test.ts",
      "tests/pcsImport.test.ts",
      "tests/pocketAudioCoreAdapter.test.ts",
      "tests/eventRenderer.test.ts",
      "tests/exportProfile.test.ts",
      "tests/offlineRender.test.ts",
      "tests/chordsmithBrowserParity.test.ts"
    ]
  }
];

for (const task of tasks) {
  console.log(`\nVerifying ${task.label}...`);
  const result = spawnSync(task.command, task.args, {
    cwd: fileURLToPath(task.cwd),
    stdio: "inherit"
  });
  if (result.error) {
    console.error(result.error);
  }
  if (result.status !== 0) {
    console.error(`\nFamily parity verification failed at: ${task.label}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nFamily parity verification passed for ${fileURLToPath(repoRoot)}`);

function npmTaskCommand() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      prefixArgs: [process.env.npm_execpath]
    };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    prefixArgs: []
  };
}
