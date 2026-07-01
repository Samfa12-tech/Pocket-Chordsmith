#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importTextToProject } from "../apps/pocket-daw/src/app/commands.ts";
import { buildPocketDawProjectFile } from "../apps/pocket-daw/src/daw/dawProject.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "releases", "samfa12-compilation-album-1", "sources", "schema16-album");
const projectDir = join(repoRoot, "releases", "samfa12-compilation-album-1", "projects");

await mkdir(projectDir, { recursive: true });

const files = (await readdir(sourceDir)).filter((name) => name.endsWith(".json")).sort();
const written = [];

for (const file of files) {
  const raw = await readFile(join(sourceDir, file), "utf8");
  const { project } = importTextToProject(raw);
  const outputName = file.replace(/\.json$/i, ".pocketdaw");
  const outputPath = join(projectDir, outputName);
  await writeFile(outputPath, buildPocketDawProjectFile(project));
  written.push({
    file: outputName,
    title: project.title,
    tracks: project.tracks?.length || 0,
    arrangement: project.arrangement?.length || project.timeline?.clips?.length || 0
  });
}

console.log(JSON.stringify({ ok: true, count: written.length, written }, null, 2));
