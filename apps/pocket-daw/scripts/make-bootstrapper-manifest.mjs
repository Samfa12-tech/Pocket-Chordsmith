import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import packageJson from "../package.json" with { type: "json" };

export const DEFAULT_BOOTSTRAPPER_MANIFEST = "pocket-daw-bootstrapper-latest.json";
export const DEFAULT_UPDATER_MANIFEST_URL = "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json";

export function makeBootstrapperManifest(options) {
  const artifact = requiredFile(options.artifact, "--artifact");
  const url = requiredValue(options.url, "--url");
  const version = options.version || packageJson.version;
  const pubDate = options.pubDate || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const out = options.out || `releases/updater/${DEFAULT_BOOTSTRAPPER_MANIFEST}`;
  const updaterManifestUrl = options.updaterManifestUrl || DEFAULT_UPDATER_MANIFEST_URL;
  const fileName = options.fileName || basename(artifact);

  const manifest = {
    app: "Pocket DAW",
    version,
    pub_date: pubDate,
    installer: {
      fileName,
      url,
      sha256: sha256File(artifact)
    },
    updaterManifestUrl
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, out };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requiredFile(path, flag) {
  const value = requiredValue(path, flag);
  if (!existsSync(value)) throw new Error(`${flag} file does not exist: ${value}`);
  return value;
}

function requiredValue(value, flag) {
  if (!value) throw new Error(`Missing required ${flag}.`);
  return value;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (process.argv[1] && process.argv[1].endsWith("make-bootstrapper-manifest.mjs")) {
  try {
    const result = makeBootstrapperManifest(parseArgs(process.argv.slice(2)));
    console.log(`Wrote ${result.out}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
