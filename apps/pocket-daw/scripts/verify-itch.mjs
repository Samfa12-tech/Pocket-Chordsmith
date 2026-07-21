import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

run("npm", ["run", "verify:versions"]);
run("npm", ["run", "verify:native-sound-recipes"]);
run("npm", ["test"]);
run("npm", ["run", "build"]);
run("cargo", ["test"], { cwd: "src-tauri", optional: true });
run("npm", ["run", "package:itch"], {
  env: { ...process.env, POCKET_DAW_SKIP_NATIVE_BUILD: "1" }
});
run("npm", ["run", "verify:artifacts"]);

console.log(isWindows
  ? "Windows automated release gate completed. Manual smoke checklist is still NOT RUN until a tester fills it against the exact installed-app installer artifact."
  : "Non-Windows gate completed. Windows smoke testing is NOT RUN.");

function run(command, args, options = {}) {
  const executable = isWindows && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
  console.log(`\n> ${executable} ${args.join(" ")}`);
  const result = isWindows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine(executable, args)], {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: "inherit",
        shell: false
      })
    : spawnSync(executable, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: "inherit",
        shell: false
      });
  if (result.error) {
    if (options.optional && result.error.code === "ENOENT") {
      console.log(`${command} not found; optional step skipped.`);
      return;
    }
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.optional) {
      console.log(`${command} ${args.join(" ")} failed; optional step skipped with status ${result.status}.`);
      return;
    }
    process.exit(result.status || 1);
  }
}

function commandLine(command, args) {
  return [command, ...args].join(" ");
}
