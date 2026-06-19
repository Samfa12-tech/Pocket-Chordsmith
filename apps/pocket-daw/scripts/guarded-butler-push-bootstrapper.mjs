import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };
import { BOOTSTRAPPER_CHANNEL, BOOTSTRAPPER_SLUG } from "./package-itch-bootstrapper.mjs";

if (process.env.PUBLISH !== "1") {
  console.error("Refusing to upload the bootstrapper. Set PUBLISH=1 only after manual approval and bootstrapper smoke review.");
  process.exit(1);
}

const folder = "releases/itch-bootstrapper/upload";
const args = ["push", folder, `${BOOTSTRAPPER_SLUG}:${BOOTSTRAPPER_CHANNEL}`, "--userversion", `bootstrapper-${packageJson.version}`];
console.log(`> butler ${args.join(" ")}`);
const result = spawnSync("butler", args, { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status || 0);
