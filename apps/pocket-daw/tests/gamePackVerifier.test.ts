import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { createGamePackZipBlob } from "../src/daw/exportJobs";
import { verifyGamePackZip } from "../scripts/verify-game-pack.mjs";

describe("game-pack ZIP verifier", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("accepts valid Godot and Web game-pack ZIPs", async () => {
    const godot = await writeGamePack("godot-adaptive-pack");
    const web = await writeGamePack("web-game-pack");

    const godotResult = verifyGamePackZip(godot, { kind: "godot-adaptive-pack" });
    const webResult = verifyGamePackZip(web, { kind: "web-game-pack" });

    expect(godotResult.ok).toBe(true);
    expect(godotResult.kind).toBe("godot-adaptive-pack");
    expect(godotResult.warnings.join("\n")).toContain("Manual target-runtime smoke");
    expect(webResult.ok).toBe(true);
    expect(webResult.kind).toBe("web-game-pack");
  });

  it("rejects a pack with a missing manifest file", async () => {
    const zipPath = await writeGamePack("godot-adaptive-pack");
    const mutated = removeEntry(zipPath, "manifests/godot-adaptive-manifest.json");

    const result = verifyGamePackZip(mutated, { kind: "godot-adaptive-pack" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Expected exactly one manifest JSON");
    expect(result.errors.join("\n")).toContain("Expected manifest file is missing");
  });

  it("rejects manifest-listed files that are missing from the ZIP", async () => {
    const zipPath = await writeGamePack("web-game-pack");
    const manifest = readManifest(zipPath, "manifests/web-game-manifest.json");
    const missingPath = manifest.fullMix;
    const mutated = removeEntry(zipPath, missingPath);

    const result = verifyGamePackZip(mutated, { kind: "web-game-pack" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(`Manifest path is missing from ZIP: ${missingPath}`);
    expect(result.errors.join("\n")).toContain(`Full mix is missing from ZIP: ${missingPath}`);
  });

  it("rejects size summaries that drift from artifact metadata", async () => {
    const zipPath = await writeGamePack("godot-adaptive-pack");
    const mutated = rewriteManifest(zipPath, "manifests/godot-adaptive-manifest.json", (manifest) => ({
      ...manifest,
      sizeSummary: { ...manifest.sizeSummary, renderedFileCount: 1 }
    }));

    const result = verifyGamePackZip(mutated, { kind: "godot-adaptive-pack" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("sizeSummary.renderedFileCount");
  });

  it("rejects non-WAV current audio metadata and unreviewed planned codec claims", async () => {
    const zipPath = await writeGamePack("web-game-pack");
    const mutated = rewriteManifest(zipPath, "manifests/web-game-manifest.json", (manifest) => ({
      ...manifest,
      audio: {
        ...manifest.audio,
        current: { ...manifest.audio.current, format: "ogg-vorbis", extension: ".ogg" },
        plannedFormats: manifest.audio.plannedFormats.map((format: Record<string, unknown>) =>
          format.format === "mp3" ? { ...format, status: "implemented" } : format
        )
      }
    }));

    const result = verifyGamePackZip(mutated, { kind: "web-game-pack" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("audio.current must be implemented WAV");
    expect(result.errors.join("\n")).toContain("mp3");
  });

  it("rejects unsafe ZIP and manifest paths", async () => {
    const zipPath = await writeGamePack("godot-adaptive-pack");
    const mutated = rewriteManifest(zipPath, "manifests/godot-adaptive-manifest.json", (manifest) => ({
      ...manifest,
      files: [...manifest.files, "../escape.wav"],
      artifacts: [...manifest.artifacts, { path: "../escape.wav", role: "stem", label: "Escape", sizeBytes: 1 }]
    }));

    const result = verifyGamePackZip(mutated, { kind: "godot-adaptive-pack" });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Unsafe manifest path");
  });

  async function writeGamePack(kind: "godot-adaptive-pack" | "web-game-pack") {
    const project = createDemoProject();
    const result = await createGamePackZipBlob(project, kind, {
      sourceProjectContents: JSON.stringify(project),
      renderWav: async (renderProject) => new Blob([`bars:${renderProject.timeline.bars}`], { type: "audio/wav" })
    });
    const zipPath = path.join(tempDir, `${kind}.zip`);
    await writeFile(zipPath, Buffer.from(await result.blob.arrayBuffer()));
    return zipPath;
  }

  function readManifest(zipPath: string, manifestPath: string) {
    return JSON.parse(new AdmZip(zipPath).readAsText(manifestPath));
  }

  function removeEntry(zipPath: string, entryPath: string) {
    const zip = new AdmZip(zipPath);
    zip.deleteFile(entryPath);
    const output = path.join(tempDir, `missing-${path.basename(entryPath)}.zip`);
    zip.writeZip(output);
    return output;
  }

  function rewriteManifest(zipPath: string, manifestPath: string, updater: (manifest: any) => any) {
    const zip = new AdmZip(zipPath);
    const manifest = JSON.parse(zip.readAsText(manifestPath));
    zip.updateFile(manifestPath, Buffer.from(JSON.stringify(updater(manifest), null, 2)));
    const output = path.join(tempDir, `mutated-${Math.random().toString(36).slice(2)}.zip`);
    zip.writeZip(output);
    return output;
  }
});

async function makeTempDir() {
  const dir = path.join(os.tmpdir(), `pocket-daw-game-pack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
