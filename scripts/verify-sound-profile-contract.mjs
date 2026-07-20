import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const PROFILE_IDS = Object.freeze([
  "standard",
  "lofi_chill",
  "chip_arcade",
  "western_frontier",
  "heavy_metal",
  "funk_groove",
]);

const REQUIRED_ARTICULATIONS = Object.freeze([
  "slap",
  "pop",
  "mute",
  "ghost",
  "hammer",
  "pull",
  "palm_mute",
  "choke",
]);

const surfaces = Object.freeze([
  {
    name: "PCS Format",
    paths: ["packages/pcs-format/src"],
    required: [...PROFILE_IDS, ...REQUIRED_ARTICULATIONS, "formatFeatures"],
  },
  {
    name: "Pocket Audio Core",
    paths: ["packages/pocket-audio-core/src"],
    required: [...PROFILE_IDS, ...REQUIRED_ARTICULATIONS],
  },
  {
    name: "Pocket Chordsmith",
    paths: ["apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html"],
    required: [...PROFILE_IDS, "formatFeatures", "bassArticulation"],
  },
  {
    name: "Pocket DJ",
    paths: ["apps/pocket-dj"],
    required: [...PROFILE_IDS, "formatFeatures"],
  },
  {
    name: "Pocket DAW",
    paths: ["apps/pocket-daw/src", "apps/pocket-daw/src-tauri/src"],
    required: [...PROFILE_IDS, "formatFeatures"],
  },
  {
    name: "Godot addon",
    paths: ["addons/pocket_chordsmith/import", "addons/pocket_chordsmith/runtime"],
    required: [...PROFILE_IDS, "format_features"],
  },
]);

const failures = [];
for (const surface of surfaces) {
  const text = surface.paths.map(readSurface).join("\n");
  for (const token of surface.required) {
    if (!text.includes(token)) failures.push(`${surface.name}: missing ${token}`);
  }
}

const pcsText = readSurface("packages/pcs-format/src");
if (!/PCS_SCHEMA_VERSION\s*=\s*17/.test(pcsText))
  failures.push("PCS Format: PCS_SCHEMA_VERSION is not 17");
if (!/PCS_LEGACY_SCHEMA_VERSION\s*=\s*16/.test(pcsText))
  failures.push("PCS Format: schema-16 compatibility constant is missing");

const chordsmith = readSurface(
  "apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html",
);
if (!/PROJECT_SCHEMA_VERSION\s*=\s*17/.test(chordsmith))
  failures.push("Pocket Chordsmith: project schema is not 17");

const nativeAudio = readSurface("apps/pocket-daw/src-tauri/src/native_audio.rs");
for (const field of ["chip_texture", "metal_texture"]) {
  const occurrences = nativeAudio.split(field).length - 1;
  if (occurrences < 2)
    failures.push(`Pocket DAW native: ${field} is declared but not consumed`);
}

if (failures.length) {
  console.error("Sound-profile contract verification failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Sound-profile contract verified across ${surfaces.length} family surfaces.`,
  );
}

function readSurface(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!statSafe(absolutePath)) return "";
  if (!statSync(absolutePath).isDirectory())
    return readFileSync(absolutePath, "utf8");
  return walk(absolutePath)
    .filter((path) => /\.(?:js|mjs|ts|rs|gd|html|json)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (["dist", "node_modules", "target"].includes(entry)) continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function statSafe(path) {
  try {
    statSync(path);
    return true;
  } catch {
    failures.push(`Missing required surface: ${path}`);
    return false;
  }
}
