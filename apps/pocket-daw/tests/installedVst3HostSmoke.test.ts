import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { bindPackagedPluginHostMetadata } from "../scripts/package-itch.mjs";
import { verifyInstalledVst3HostSummaryFile } from "../scripts/verify-installed-vst3-host-summary.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe("installed VST3 host smoke evidence", () => {
  it("binds candidate metadata to the post-Tauri sidecar bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pocket-daw-vst3-packaged-"));
    temporaryDirectories.push(directory);
    const packagedPath = join(directory, "pocket-daw-plugin-host.exe");
    const packagedBytes = Buffer.from("post-Tauri sidecar bytes");
    writeFileSync(packagedPath, packagedBytes);
    const staged = { sha256: "a".repeat(64), sizeBytes: 7, protocolVersion: 2 };

    await expect(bindPackagedPluginHostMetadata(staged, packagedPath)).resolves.toMatchObject({
      preBundleSha256: staged.sha256,
      preBundleSizeBytes: staged.sizeBytes,
      sha256: createHash("sha256").update(packagedBytes).digest("hex"),
      sizeBytes: packagedBytes.length,
      protocolVersion: 2
    });
  });

  it("binds the installed helper and deterministic session results to the exact installer", () => {
    const fixture = createFixture();
    expect(verifyInstalledVst3HostSummaryFile(fixture)).toEqual({ ok: true, failures: [] });

    const summary = JSON.parse(fixture.summaryText);
    summary.pluginHostSidecar.sha256 = "0".repeat(64);
    writeFileSync(fixture.summaryPath, JSON.stringify(summary));
    expect(verifyInstalledVst3HostSummaryFile(fixture)).toMatchObject({ ok: false });
  });
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "pocket-daw-vst3-evidence-"));
  temporaryDirectories.push(directory);
  const installerFileName = `Pocket.DAW_${packageJson.version}_x64-setup.exe`;
  const installerPath = join(directory, installerFileName);
  const candidateMetadataPath = join(directory, "sidecar.json");
  const summaryPath = join(directory, "summary.json");
  const installerBytes = Buffer.from("exact candidate installer");
  writeFileSync(installerPath, installerBytes);
  const candidate = {
    sha256: "a".repeat(64),
    sizeBytes: 1234,
    protocolVersion: 2,
    audioBlockFrames: 128,
    vst3SdkTag: "v3.8.0_build_66",
    vst3SdkCommit: "9fad9770f2ae8542ab1a548a68c1ad1ac690abe0",
    vst3SdkVendoredTreeSha256: "b".repeat(64),
    vst3SdkLinked: true,
    scannerAvailable: true,
    audioHostingAvailable: true
  };
  writeFileSync(candidateMetadataPath, JSON.stringify(candidate));
  const summary = {
    schema: 1,
    appVersion: packageJson.version,
    startedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:00:01.000Z",
    result: "pass",
    installer: {
      fileName: installerFileName,
      sha256: createHash("sha256").update(installerBytes).digest("hex")
    },
    pluginHostSidecar: { ...candidate },
    deterministicFixture: {
      scanner: true,
      instrument: true,
      effect: true,
      stateRoundTrip: true,
      parameterAutomation: true,
      factoryPrograms: true,
      latencyAndTail: true,
      editorLifecycle: true,
      unloadReloadRecovery: true
    }
  };
  const summaryText = JSON.stringify(summary);
  writeFileSync(summaryPath, summaryText);
  return { summaryPath, installerPath, candidateMetadataPath, summaryText };
}
