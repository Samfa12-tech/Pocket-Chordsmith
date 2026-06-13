import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const DEFAULT_OUT = join("releases", "updater", "pocket-daw-latest.json");
const DEFAULT_SUMS = join("releases", "updater", "SHA256SUMS.txt");
const DEFAULT_PLATFORM = "windows-x86_64";

export function makeUpdaterManifest(options) {
  const artifact = requiredFile(options.artifact, "--artifact");
  const signature = requiredFile(options.signature, "--signature");
  const url = requiredValue(options.url, "--url");
  const notesPath = requiredFile(options.notes, "--notes");
  const version = options.version || packageJson.version;
  const pubDate = options.pubDate || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const platform = options.platform || DEFAULT_PLATFORM;
  const out = options.out || DEFAULT_OUT;
  const sums = options.sums || DEFAULT_SUMS;
  const signatureContents = readFileSync(signature, "utf8").trim();
  if (!signatureContents) throw new Error(`${signature} is empty; updater manifest signatures must contain the .sig file contents.`);

  const manifest = {
    version,
    notes: readFileSync(notesPath, "utf8").trim(),
    pub_date: pubDate,
    platforms: {
      [platform]: {
        signature: signatureContents,
        url
      }
    }
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);

  mkdirSync(dirname(sums), { recursive: true });
  writeFileSync(sums, `${sha256File(artifact)}  ${toPosix(relative(process.cwd(), artifact) || basename(artifact))}\n`);
  return { manifest, out, sums };
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

function toPosix(path) {
  return path.replace(/\\/g, "/");
}

if (process.argv[1] && process.argv[1].endsWith("make-updater-manifest.mjs")) {
  try {
    const result = makeUpdaterManifest(parseArgs(process.argv.slice(2)));
    console.log(`Wrote ${result.out}`);
    console.log(`Wrote ${result.sums}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
