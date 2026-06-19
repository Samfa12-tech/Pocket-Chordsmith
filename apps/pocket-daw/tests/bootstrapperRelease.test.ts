import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeBootstrapperManifest } from "../scripts/make-bootstrapper-manifest.mjs";
import { BOOTSTRAPPER_MANIFEST_URL, bootstrapperPowerShell, packageItchBootstrapper } from "../scripts/package-itch-bootstrapper.mjs";

describe("Pocket DAW itch bootstrapper release helpers", () => {
  it("writes the bootstrapper latest manifest with installer hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-daw-bootstrapper-"));
    const artifact = join(dir, "Pocket.DAW_0.6.10_x64-setup.exe");
    const out = join(dir, "pocket-daw-bootstrapper-latest.json");
    writeFileSync(artifact, "setup bytes");

    const result = makeBootstrapperManifest({
      artifact,
      out,
      version: "0.6.10",
      pubDate: "2026-06-20T00:00:00Z",
      url: "https://example.com/Pocket.DAW_0.6.10_x64-setup.exe"
    });

    expect(result.manifest).toMatchObject({
      app: "Pocket DAW",
      version: "0.6.10",
      pub_date: "2026-06-20T00:00:00Z",
      installer: {
        fileName: "Pocket.DAW_0.6.10_x64-setup.exe",
        url: "https://example.com/Pocket.DAW_0.6.10_x64-setup.exe",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    });
    expect(JSON.parse(readFileSync(out, "utf8")).installer.sha256).toBe(result.manifest.installer.sha256);
  });

  it("embeds a hash-verifying PowerShell downloader", () => {
    const script = bootstrapperPowerShell();

    expect(script).toContain(BOOTSTRAPPER_MANIFEST_URL);
    expect(script).toContain("$manifest = Invoke-RestMethod -Uri $ManifestUrl -UseBasicParsing");
    expect(script).not.toContain("$manifestResponse.Content | ConvertFrom-Json");
    expect(script).toContain("Get-FileHash -Algorithm SHA256");
    expect(script).toContain("Installer SHA-256 mismatch");
    expect(script).toContain("Start-Process -FilePath $installerPath -Wait");
    expect(script).toContain("Manual fallback");
  });

  it("packages only the stable bootstrapper upload files", () => {
    const result = packageItchBootstrapper({ compile: false });
    const checksums = readFileSync(result.checksumPath, "utf8");

    expect(result.uploadDir.replace(/\\/g, "/")).toContain("releases/itch-bootstrapper/upload");
    expect(readFileSync(result.readmePath, "utf8")).toContain("itch channel only needs a new upload when this bootstrapper changes");
    expect(checksums).toContain("Pocket_DAW_Itch_Bootstrapper");
    expect(checksums).toContain("README_FIRST.txt");
  });
});
