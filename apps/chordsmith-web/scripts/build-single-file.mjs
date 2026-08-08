import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "src/chordsmith-source-manifest.json"), "utf8"),
);
const placeholder = "/*__POCKET_CHORDSMITH_INLINE_BUNDLE__*/";
const shell = readFileSync(resolve(root, "src/app-shell.html"), "utf8");
if (shell.split(placeholder).length !== 2)
  throw new Error(
    "app-shell.html must contain exactly one inline bundle placeholder.",
  );
if (!Array.isArray(manifest.fragments) || manifest.fragments.length < 2)
  throw new Error(
    "Chordsmith source manifest must list ordered source fragments.",
  );

const bundle = manifest.fragments
  .map((path) => readFileSync(resolve(root, path), "utf8").trimEnd())
  .join("\n\n");
const output = shell.replace(placeholder, bundle);
const outputPath = resolve(root, manifest.output);

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== output) {
    console.error(
      `${manifest.output} has drifted from modular Chordsmith source. Run npm run build:single-file.`,
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
