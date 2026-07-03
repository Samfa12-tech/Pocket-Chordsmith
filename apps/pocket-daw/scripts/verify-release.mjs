import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const cargoCmd = isWindows ? "cargo.exe" : "cargo";
const nativeRelease = process.argv.includes("--native-release") || process.env.POCKET_DAW_NATIVE_RELEASE === "1";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pocketAudioCoreDir = path.resolve(scriptDir, "../../../packages/pocket-audio-core");

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = isWindows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(command, args)], { stdio: "inherit", shell: false, ...options })
    : spawnSync(command, args, { stdio: "inherit", shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function commandExists(command) {
  const probe = isWindows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(command, ["--version"])], { stdio: "ignore", shell: false })
    : spawnSync(command, ["--version"], { stdio: "ignore", shell: false });
  return !probe.error && probe.status === 0;
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}

run(npmCmd, ["run", "verify:ci-workflow"]);
run(npmCmd, ["run", "verify:family-parity"], { cwd: pocketAudioCoreDir });
run(npmCmd, ["test"]);
run(npmCmd, ["run", "build"]);
run(npmCmd, ["run", "package:preview"]);

if (commandExists(cargoCmd)) {
  run(npmCmd, ["run", "tauri:debug"]);
  if (nativeRelease) run(npmCmd, ["run", "tauri:build"]);
} else {
  console.log("\nNative verification skipped: cargo was not found on PATH.");
  if (nativeRelease) {
    console.log("Native release build was requested but cannot run without cargo.");
    process.exit(1);
  }
}
