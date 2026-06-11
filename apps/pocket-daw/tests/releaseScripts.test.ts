import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("release scripts", () => {
  it("keeps native release bundling explicit", () => {
    const script = readFileSync("scripts/verify-release.mjs", "utf8");

    expect(packageJson.scripts["tauri:build"]).toBe("tauri build");
    expect(packageJson.scripts["verify:native-release"]).toContain("--native-release");
    expect(script).toContain('process.argv.includes("--native-release")');
    expect(script).toContain("POCKET_DAW_NATIVE_RELEASE");
    expect(script).toContain('"tauri:debug"');
    expect(script).toContain('"tauri:build"');
  });
});
