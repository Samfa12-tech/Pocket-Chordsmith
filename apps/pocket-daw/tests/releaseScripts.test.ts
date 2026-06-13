import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("release scripts", () => {
  it("keeps native release bundling explicit", () => {
    const script = readFileSync("scripts/verify-release.mjs", "utf8");
    const itchScript = readFileSync("scripts/verify-itch.mjs", "utf8");
    const packageItch = readFileSync("scripts/package-itch.mjs", "utf8");
    const guardedPush = readFileSync("scripts/guarded-butler-push.mjs", "utf8");
    const updaterManifest = readFileSync("scripts/make-updater-manifest.mjs", "utf8");

    expect(packageJson.scripts["tauri:build"]).toBe("tauri build");
    expect(packageJson.scripts["verify:native-release"]).toContain("--native-release");
    expect(packageJson.scripts["package:itch"]).toBe("node scripts/package-itch.mjs");
    expect(packageJson.scripts["verify:itch"]).toBe("node scripts/verify-itch.mjs");
    expect(packageJson.scripts["release:itch:local"]).toBe("npm run verify:itch");
    expect(packageJson.scripts["release:updater-manifest"]).toBe("node scripts/make-updater-manifest.mjs");
    expect(script).toContain('process.argv.includes("--native-release")');
    expect(script).toContain("POCKET_DAW_NATIVE_RELEASE");
    expect(script).toContain('"tauri:debug"');
    expect(script).toContain('"tauri:build"');
    expect(itchScript).toContain('"package:itch"');
    expect(itchScript).toContain('"verify:artifacts"');
    expect(packageItch).toContain("pocket-daw-windows-x64-v");
    expect(packageItch).toContain("butler push-preview");
    expect(guardedPush).toContain('PUBLISH !== "1"');
    expect(updaterManifest).toContain("pocket-daw-latest.json");
    expect(updaterManifest).toContain("SHA256SUMS.txt");
  });
});
