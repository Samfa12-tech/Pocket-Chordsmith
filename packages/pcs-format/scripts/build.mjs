import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = new URL("../", import.meta.url);
const distDir = new URL("dist/", packageRoot);
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("src/index.js", packageRoot))],
  outfile: fileURLToPath(new URL("index.js", distDir)),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  sourcemap: false,
  legalComments: "none",
});
console.log("Built browser-safe, self-contained pcs-format dist/index.js");
