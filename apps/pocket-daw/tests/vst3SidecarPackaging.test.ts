import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SIDECAR_BLOCK_FRAMES,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_TARGET,
  VST3_SDK_COMMIT,
  VST3_SDK_TAG,
  VST3_SDK_LICENSE_SHA256,
  hashVendoredSdkTree,
  peMachine,
  stagedSidecarName,
  validateProbePayload
} from "../scripts/prepare-plugin-host-sidecar.mjs";

describe("VST3 sidecar packaging", () => {
  it("uses Tauri's target-suffixed external binary contract", () => {
    expect(stagedSidecarName()).toBe(`pocket-daw-plugin-host-${SIDECAR_TARGET}.exe`);
    const packageConfig = JSON.parse(readFileSync("src-tauri/tauri.package.conf.json", "utf8"));
    const debugConfig = JSON.parse(readFileSync("src-tauri/tauri.sidecar.conf.json", "utf8"));
    const baseConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    expect(packageConfig.bundle.externalBin).toEqual(["binaries/pocket-daw-plugin-host"]);
    expect(debugConfig.bundle.externalBin).toEqual(["binaries/pocket-daw-plugin-host"]);
    expect(baseConfig.bundle.resources["resources/THIRD_PARTY_NOTICES.txt"]).toBe("THIRD_PARTY_NOTICES.txt");
    const notices = readFileSync("src-tauri/resources/THIRD_PARTY_NOTICES.txt", "utf8");
    expect(notices).toContain("Steinberg VST 3 SDK");
    expect(notices).toContain("Permission is hereby granted");
    const sdkRoot = "src-tauri/third_party/vst3sdk";
    const sourceLock = JSON.parse(readFileSync(`${sdkRoot}/SOURCE_LOCK.json`, "utf8"));
    expect(sourceLock.licenseSha256).toBe(VST3_SDK_LICENSE_SHA256);
    expect(sourceLock.tag).toBe(VST3_SDK_TAG);
    expect(sourceLock.commit).toBe(VST3_SDK_COMMIT);
    expect(hashVendoredSdkTree(sdkRoot, sourceLock.vendoredSubset)).toBe(sourceLock.vendoredTreeSha256);
  });

  it("accepts only the pinned scanner and session-audio SDK probe", () => {
    const probe = {
      component: "pocket-daw-plugin-host",
      protocolVersion: SIDECAR_PROTOCOL_VERSION,
      transport: "windowsNamedPipe",
      modes: ["scanner", "session"],
      vst3SdkLinked: true,
      scannerAvailable: true,
      audioHostingAvailable: true,
      audioBlockFrames: SIDECAR_BLOCK_FRAMES,
      vst3SdkTag: VST3_SDK_TAG,
      vst3SdkCommit: VST3_SDK_COMMIT
    };
    expect(validateProbePayload(probe)).toBe(probe);
    expect(() => validateProbePayload({ ...probe, audioHostingAvailable: false })).toThrow("session-audio capabilities");
    expect(() => validateProbePayload({ ...probe, protocolVersion: 1 })).toThrow("protocol mismatch");
    expect(() => validateProbePayload({ ...probe, vst3SdkCommit: "0".repeat(40) })).toThrow("source pin");
  });

  it("recognises only an x64 PE machine header", () => {
    const bytes = Buffer.alloc(128);
    bytes.write("MZ", 0, "ascii");
    bytes.writeUInt32LE(64, 0x3c);
    bytes.write("PE\0\0", 64, "ascii");
    bytes.writeUInt16LE(0x8664, 68);
    expect(peMachine(bytes)).toBe(0x8664);
    bytes.writeUInt16LE(0x014c, 68);
    expect(peMachine(bytes)).toBe(0x014c);
    expect(peMachine(Buffer.from("not-pe"))).toBeNull();
  });
});
