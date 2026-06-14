import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };
import { ITCH_CHANNEL, ITCH_SLUG } from "./package-itch.mjs";

if (process.env.PUBLISH !== "1") {
  console.error("Refusing to upload. Set PUBLISH=1 only after manual approval and smoke-check review.");
  process.exit(1);
}

const version = packageJson.version;
const folder = "releases/itch/installers";
const args = ["push", folder, `${ITCH_SLUG}:${ITCH_CHANNEL}`, "--userversion", version];
console.log(`> butler ${args.join(" ")}`);
const result = spawnSync("butler", args, { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status || 0);
