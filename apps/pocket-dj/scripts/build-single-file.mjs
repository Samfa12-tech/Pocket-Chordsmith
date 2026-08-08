import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "src/pocket-dj-source-manifest.json"), "utf8"),
);
const placeholder = "/*__POCKET_DJ_INLINE_BUNDLE__*/";
const shell = readFileSync(resolve(root, "src/app-shell.html"), "utf8");
if (shell.split(placeholder).length !== 2)
  throw new Error(
    "Pocket DJ app shell must contain exactly one bundle placeholder.",
  );
const bundle = manifest.fragments
  .map((path) => readFileSync(resolve(root, path), "utf8").trimEnd())
  .join("\n\n");
const output = shell.replace(placeholder, bundle);
const outputPath = resolve(root, manifest.output);
if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== output) {
    console.error(
      `${manifest.output} has drifted from modular Pocket DJ source. Run npm run build:single-file.`,
    );
    process.exit(1);
  }
  console.log(
    `Verified deterministic ${manifest.output} (${manifest.fragments.length} fragments).`,
  );
} else {
  writeFileSync(outputPath, output, "utf8");
  console.log(
    `Built deterministic ${manifest.output} from ${manifest.fragments.length} fragments.`,
  );
}
