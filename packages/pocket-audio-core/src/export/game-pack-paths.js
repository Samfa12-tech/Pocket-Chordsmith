export const GAME_PACK_FOLDERS = Object.freeze({
  full: "audio/full/",
  stems: "audio/stems/",
  sections: "audio/sections/",
  samples: "audio/samples/",
  manifests: "manifests/",
  source: "source/"
});

export const GAME_PACK_MANIFEST_FILES = Object.freeze({
  "godot-adaptive-pack": "godot-adaptive-manifest.json",
  "web-game-pack": "web-game-manifest.json"
});

export function gamePackPath(folder, fileName) {
  const prefix = GAME_PACK_FOLDERS[folder] || "";
  const safeFile = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!prefix || !safeFile) throw new Error(`Invalid game-pack path: ${folder}/${fileName}`);
  return `${prefix}${safeFile}`;
}

export function gamePackManifestPath(kind = "godot-adaptive-pack") {
  const file = GAME_PACK_MANIFEST_FILES[kind] || GAME_PACK_MANIFEST_FILES["godot-adaptive-pack"];
  return gamePackPath("manifests", file);
}

export function safeGamePackName(value, fallback = "pocket-audio") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function gamePackFullMixPath(projectTitle = "pocket-audio") {
  return gamePackPath("full", `${safeGamePackName(projectTitle)}-full-mix.wav`);
}

export function gamePackStemPath(projectTitle, stemLabel) {
  return gamePackPath("stems", `${safeGamePackName(projectTitle)}-${safeGamePackName(stemLabel, "stem")}-stem.wav`);
}

export function gamePackSectionLoopPath(projectTitle, sectionName) {
  return gamePackPath("sections", `${safeGamePackName(projectTitle)}-${safeGamePackName(sectionName, "section")}-loop.wav`);
}

export function gamePackSourceProjectPath(projectTitle = "pocket-audio") {
  return gamePackPath("source", `${safeGamePackName(projectTitle)}.pocketdaw.json`);
}
