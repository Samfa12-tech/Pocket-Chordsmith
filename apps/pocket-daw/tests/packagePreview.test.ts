import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { createPreviewZip, previewZipName } from "../scripts/package-preview.mjs";

describe("browser preview packaging", () => {
  it("names preview zips from the current package version", () => {
    expect(previewZipName("0.2.1")).toBe("pocket-daw-browser-preview-v0.2.1.zip");
    expect(previewZipName("v1.0.0 beta")).toBe("pocket-daw-browser-preview-v1.0.0-beta.zip");
  });

  it("writes index and current docs at the zip root", () => {
    const root = join(tmpdir(), `pocket-daw-preview-${Date.now()}`);
    mkdirSync(join(root, "dist", "assets"), { recursive: true });
    mkdirSync(join(root, "releases"), { recursive: true });
    writeFileSync(join(root, "dist", "index.html"), "<html></html>");
    writeFileSync(join(root, "dist", "assets", "index.js"), "console.log('ok');");
    writeFileSync(join(root, "WHAT_WORKS_AND_WHATS_NEXT.md"), "# Current docs");
    writeFileSync(join(root, "POCKET_DAW_NORTH_STAR.md"), "# North star");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "V0_5_1_HARDENING_NOTES.md"), "# Hardening notes");
    writeFileSync(join(root, "docs", "POCKET_AUDIO_CORE_CONVERGENCE_REVIEW.md"), "# Core review");
    writeFileSync(join(root, "docs", "v0.5.1-verification.md"), "# Verification");
    writeFileSync(join(root, "docs", "PRIVATE_ALPHA_RELEASE_CHECKLIST.md"), "# Checklist");
    writeFileSync(join(root, "docs", "ITCH_BUILD_PUSH_AND_UPDATE_TEST.md"), "# Itch build push");
    writeFileSync(join(root, "docs", "ITCH_RELEASE_CHECKLIST.md"), "# Itch checklist");
    writeFileSync(join(root, "docs", "RELEASE_NOTES_TEMPLATE.md"), "# Release notes");
    writeFileSync(join(root, "docs", "WINDOWS_TESTING_CHECKLIST.md"), "# Windows");
    writeFileSync(join(root, "docs", "V0_6_FOUNDATION_NOTES.md"), "# Foundation");
    writeFileSync(join(root, "docs", "RECORDING_PREP.md"), "# Recording");
    writeFileSync(join(root, "docs", "UPDATER_RELEASE_PIPELINE.md"), "# Updater");
    writeFileSync(join(root, "docs", "v0.5.8-itch-release-readiness.md"), "# Readiness");
    writeFileSync(join(root, "docs", "v0.5.4-native-cache.md"), "# Native cache");

    const zipPath = createPreviewZip({ root, version: "0.2.1" });
    const zip = new AdmZip(zipPath);
    const names = zip.getEntries().map((entry) => entry.entryName);

    expect(zipPath.endsWith("pocket-daw-browser-preview-v0.2.1.zip")).toBe(true);
    expect(names).toContain("index.html");
    expect(names).toContain("assets/index.js");
    expect(names).toContain("WHAT_WORKS_AND_WHATS_NEXT.md");
    expect(names).toContain("POCKET_DAW_NORTH_STAR.md");
    expect(names).toContain("docs/V0_5_1_HARDENING_NOTES.md");
    expect(names).toContain("docs/POCKET_AUDIO_CORE_CONVERGENCE_REVIEW.md");
    expect(names).toContain("docs/v0.5.1-verification.md");
    expect(names).toContain("docs/PRIVATE_ALPHA_RELEASE_CHECKLIST.md");
    expect(names).toContain("docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md");
    expect(names).toContain("docs/ITCH_RELEASE_CHECKLIST.md");
    expect(names).toContain("docs/RECORDING_PREP.md");
    expect(names).toContain("docs/UPDATER_RELEASE_PIPELINE.md");
    expect(names).toContain("docs/v0.5.8-itch-release-readiness.md");
    expect(names).toContain("docs/v0.5.4-native-cache.md");
    expect(readFileSync(join(root, "releases", "WHAT_WORKS_AND_WHATS_NEXT.md"), "utf8")).toBe("# Current docs");
    expect(readFileSync(join(root, "releases", "docs", "V0_5_1_HARDENING_NOTES.md"), "utf8")).toBe("# Hardening notes");
    expect(readFileSync(join(root, "releases", "docs", "PRIVATE_ALPHA_RELEASE_CHECKLIST.md"), "utf8")).toBe("# Checklist");

    rmSync(root, { recursive: true, force: true });
  });
});
