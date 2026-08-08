import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const packageRoot = new URL("../", import.meta.url);
const distDir = new URL("dist/", packageRoot);
const packageJson = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const common = {
  bundle: true,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
};

const esmResult = await build({
  ...common,
  platform: "node",
  target: ["node18"],
  entryPoints: [fileURLToPath(new URL("src/index.js", packageRoot))],
  outfile: fileURLToPath(new URL("pocket-audio-core.esm.js", distDir)),
  format: "esm",
});

const browserResult = await build({
  ...common,
  platform: "browser",
  target: ["es2020"],
  entryPoints: [fileURLToPath(new URL("src/browser.js", packageRoot))],
  outfile: fileURLToPath(new URL("pocket-audio-core.browser.esm.js", distDir)),
  format: "esm",
});

await build({
  ...common,
  platform: "browser",
  target: ["es2020"],
  entryPoints: [fileURLToPath(new URL("src/browser.js", packageRoot))],
  outfile: fileURLToPath(new URL("pocket-audio-core.iife.js", distDir)),
  format: "iife",
  globalName: "PocketAudioCore",
});

const esmOutput = Object.values(esmResult.metafile.outputs).find((output) => Array.isArray(output.exports));
const browserOutput = Object.values(browserResult.metafile.outputs).find((output) => Array.isArray(output.exports));
const manifest = {
  package: packageJson.name,
  version: packageJson.version,
  generatedFrom: "src/index.js",
  formats: {
    esm: "pocket-audio-core.esm.js",
    browserEsm: "pocket-audio-core.browser.esm.js",
    iife: "pocket-audio-core.iife.js",
  },
  sourcemaps: false,
  exports: [...(esmOutput?.exports || [])].sort(),
  browserExports: [...(browserOutput?.exports || [])].sort(),
};

await writeFile(new URL("api-manifest.json", distDir), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  new URL("README.md", distDir),
  "Generated from the same source module graph by `npm run build`. All ESM and IIFE files are self-contained and do not import `../src`.\n",
);
console.log("Built self-contained ESM, browser ESM, IIFE, and API manifest.");
