import { spawnSync } from "node:child_process";

console.warn("verify:itch is deprecated. Running the single-pass release:prepare gate; it will not reuse or restage an existing candidate.");
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = process.platform === "win32"
  ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `${command} run release:prepare`], { cwd: process.cwd(), stdio: "inherit", shell: false })
  : spawnSync(command, ["run", "release:prepare"], { cwd: process.cwd(), stdio: "inherit", shell: false });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
