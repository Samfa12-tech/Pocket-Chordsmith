import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeUpdaterManifest } from "../scripts/make-updater-manifest.mjs";

describe("updater manifest script", () => {
  it("writes the Tauri updater JSON shape and SHA256SUMS", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-updater-"));
    const artifact = join(dir, "Pocket_DAW_0.5.5_x64-setup.exe");
    const signature = `${artifact}.sig`;
    const notes = join(dir, "notes.md");
    const out = join(dir, "pocket-daw-latest.json");
    const sums = join(dir, "SHA256SUMS.txt");
    writeFileSync(artifact, "installer bytes");
    writeFileSync(signature, "signed-payload");
    writeFileSync(notes, "Pocket DAW update notes.");

    makeUpdaterManifest({
      artifact,
      signature,
      notes,
      out,
      sums,
      version: "0.5.5",
      pubDate: "2026-06-13T00:00:00Z",
      url: "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/download/pocket-daw-v0.5.5/Pocket_DAW_0.5.5_x64-setup.exe"
    });

    const manifest = JSON.parse(readFileSync(out, "utf8"));
    expect(manifest.version).toBe("0.5.5");
    expect(manifest.pub_date).toBe("2026-06-13T00:00:00Z");
    expect(manifest.platforms["windows-x86_64"].signature).toBe("signed-payload");
    expect(manifest.platforms["windows-x86_64"].url).toContain("Pocket_DAW_0.5.5_x64-setup.exe");
    expect(readFileSync(sums, "utf8")).toContain("Pocket_DAW_0.5.5_x64-setup.exe");
  });

  it("fails loudly when required files are missing", () => {
    expect(() => makeUpdaterManifest({
      artifact: "missing.exe",
      signature: "missing.exe.sig",
      notes: "missing.md",
      url: "https://example.com/missing.exe"
    })).toThrow("file does not exist");
  });
});
