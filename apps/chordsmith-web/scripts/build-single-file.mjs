import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { constants as zlibConstants, gunzipSync, gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "src/chordsmith-source-manifest.json"), "utf8"),
);
const placeholder = "/*__POCKET_CHORDSMITH_INLINE_BUNDLE__*/";
const shell = readFileSync(resolve(root, "src/app-shell.html"), "utf8");
const preflightModuleTag =
  '<script type="module" src="./src/wav-export-preflight.js"></script>';
if (shell.split(preflightModuleTag).length !== 2)
  throw new Error(
    "app-shell.html must contain exactly one WAV preflight module tag.",
  );
if (shell.split(placeholder).length !== 2)
  throw new Error(
    "app-shell.html must contain exactly one inline bundle placeholder.",
  );
if (!Array.isArray(manifest.fragments) || manifest.fragments.length < 2)
  throw new Error(
    "Chordsmith source manifest must list ordered source fragments.",
  );

const fragments = manifest.fragments
  .map((path) => readFileSync(resolve(root, path), "utf8").trimEnd())
  .join("\n\n");
const preflightSource = readFileSync(
  resolve(root, "src/wav-export-preflight.js"),
  "utf8",
)
  .replace(/^export\s+/gm, "")
  .trimEnd();
const bundle = `${preflightSource}\n\n${fragments}`;
const workerSource = readFileSync(
  resolve(
    root,
    "../../packages/pocket-audio-core/dist/chordsmith-wav-worker.js",
  ),
);
const workerMarker = "__POCKET_AUDIO_CORE_WAV_WORKER_GZIP_BASE64__";
if (bundle.split(workerMarker).length !== 2) {
  throw new Error(
    "Chordsmith source must contain exactly one Core WAV worker embedding marker.",
  );
}
const workerPayload = gzipSync(workerSource, {
  level: 9,
  strategy: zlibConstants.Z_FIXED,
}).toString("base64");
const embeddedBundle = bundle.replace(workerMarker, workerPayload);
const standaloneShell = shell.replace(preflightModuleTag, "");
const output = standaloneShell.replace(placeholder, embeddedBundle);
const outputPath = resolve(root, manifest.output);

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== output) {
    const prefix = 'const POCKET_AUDIO_CORE_WAV_WORKER_GZIP_BASE64 = "';
    const embeddedPayload = (html) => {
      const start = html.indexOf(prefix);
      if (start < 0) return null;
      const from = start + prefix.length;
      const end = html.indexOf('"', from);
      return end < 0 ? null : Buffer.from(html.slice(from, end), "base64");
    };
    const hash = (bytes) =>
      createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const currentGzip = embeddedPayload(current);
    const expectedGzip = embeddedPayload(output);
    if (currentGzip && expectedGzip) {
      try {
        console.error(
          `Embedded worker raw SHA-256: committed=${hash(gunzipSync(currentGzip))} generated=${hash(gunzipSync(expectedGzip))}; gzip SHA-256: committed=${hash(currentGzip)} generated=${hash(expectedGzip)}.`,
        );
      } catch {
        console.error(
          "Embedded worker payload could not be decoded during drift diagnosis.",
        );
      }
    }
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
