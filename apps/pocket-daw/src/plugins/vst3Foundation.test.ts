import { describe, expect, it, vi } from "vitest";
import {
  VST3_HOST_PROTOCOL_VERSION,
  VST3_SCAN_TIMEOUT_MS,
  VST3_STATE_LIMIT_BYTES,
  createVst3DiagnosticsSummary,
  discoverVst3Modules,
  findExactVst3Descriptor,
  getVst3BetaStatus,
  loadVst3Instance,
  openVst3VendorEditor,
  pollVst3ParameterEdits,
  quarantineVst3Module,
  restoreVst3InstanceState,
  selectVst3FactoryProgram,
  selectVst3UserScanFolder,
  setVst3BetaEnabled,
  setVst3InstanceParameter,
  validateVst3StateSnapshot,
  verifiedVst3Descriptors,
  type NativeVst3FoundationApi,
  type Vst3BetaStatus
} from "./vst3Foundation";

const status: Vst3BetaStatus = {
  enabled: true,
  consentVersion: 1,
  currentConsentVersion: 1,
  scannerAvailable: false,
  audioHostingAvailable: false,
  vendorEditorAvailable: false,
  genericEditorAvailable: false,
  sidecarAvailable: true,
  sidecarProtocolVersion: VST3_HOST_PROTOCOL_VERSION,
  vst3SdkLinked: false,
  audioBlockFrames: 128,
  officialScanRootCount: 2,
  userScanRootCount: 1,
  cachedModuleCount: 4,
  verifiedDescriptorCount: 0,
  quarantinedModuleCount: 1,
  stateLimitBytes: VST3_STATE_LIMIT_BYTES,
  boundary: "Foundation only."
};

function fakeApi(result: unknown, available = true): NativeVst3FoundationApi & { invoke: ReturnType<typeof vi.fn> } {
  return {
    isAvailable: () => available,
    invoke: vi.fn().mockResolvedValue(result)
  };
}

describe("VST3 foundation bridge", () => {
  it("preserves truthful unavailable capability responses", async () => {
    const api = fakeApi(status);
    const result = await getVst3BetaStatus(api);
    expect(result).toMatchObject({ scannerAvailable: false, audioHostingAvailable: false });
    expect(api.invoke).toHaveBeenCalledWith("vst3_beta_status");
  });

  it("records one-click consent through the native settings command", async () => {
    const api = fakeApi(status);
    await setVst3BetaEnabled(true, api);
    expect(api.invoke).toHaveBeenCalledWith("vst3_beta_set_enabled", { enabled: true });
  });

  it("adds a user scan root only through the native folder picker", async () => {
    const api = fakeApi(["C:\\Audio\\VST3"]);
    await expect(selectVst3UserScanFolder(api)).resolves.toEqual(["C:\\Audio\\VST3"]);
    expect(api.invoke).toHaveBeenCalledWith("vst3_beta_select_user_scan_folder");
  });

  it("returns safe fallbacks outside Tauri", async () => {
    const api = fakeApi(null, false);
    await expect(getVst3BetaStatus(api)).resolves.toBeNull();
    await expect(discoverVst3Modules(api)).resolves.toEqual([]);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("uses reason codes rather than diagnostic strings when quarantining", async () => {
    const api = fakeApi(undefined);
    const sourceKey = "a".repeat(64);
    await quarantineVst3Module(sourceKey, "timeout", api);
    expect(api.invoke).toHaveBeenCalledWith("vst3_beta_quarantine_module", {
      sourceKey,
      reason: "timeout"
    });
  });

  it("builds aggregate diagnostics with no local paths or plug-in identities", () => {
    const summary = createVst3DiagnosticsSummary(status);
    const json = JSON.stringify(summary);
    expect(summary.configuredRootCount).toBe(3);
    expect(summary).toMatchObject({ sidecarAvailable: true, vst3SdkLinked: false, audioBlockFrames: 128 });
    expect(json).not.toMatch(/path|fingerprint|moduleFilename|classId/i);
  });

  it("rejects oversized state before crossing the native bridge", async () => {
    const api = fakeApi(null);
    await expect(
      validateVst3StateSnapshot(new Uint8Array(VST3_STATE_LIMIT_BYTES + 1), "unused", api)
    ).rejects.toThrow("32 MiB");
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("pins the session-graph sidecar protocol", () => {
    expect(VST3_HOST_PROTOCOL_VERSION).toBe(2);
    expect(VST3_SCAN_TIMEOUT_MS).toBe(20_000);
  });

  it("exposes only isolated-scanner-verified descriptors and strips local module paths", () => {
    const identity = {
      format: "vst3" as const,
      classId: "0123456789abcdef",
      vendor: "Test Vendor",
      name: "Test Synth",
      version: "1.0.0",
      category: "Instrument",
      moduleFilename: "C:\\Program Files\\Common Files\\VST3\\Test Synth.vst3",
      binaryFingerprint: "a".repeat(64)
    };
    const modules = [{
      sourceKey: "private-source-key",
      moduleFilename: "Test Synth.vst3",
      binaryFingerprint: identity.binaryFingerprint,
      locationScope: "official" as const,
      descriptorStatus: "verifiedByIsolatedScanner" as const,
      quarantined: false,
      descriptors: [{
        identity,
        moduleSourceKey: "private-source-key",
        supportsInstrumentRole: true,
        supportsEffectRole: false,
        audioInputBusCount: 0,
        audioOutputBusCount: 1,
        eventInputBusCount: 1,
        reportedLatencySamples: 0
      }]
    }];

    const descriptors = verifiedVst3Descriptors(modules);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].identity.moduleFilename).toBe("Test Synth.vst3");
    expect(JSON.stringify(descriptors)).not.toContain("Program Files");
    expect(findExactVst3Descriptor(identity, modules)?.identity.classId).toBe(identity.classId);
    expect(verifiedVst3Descriptors([{ ...modules[0], quarantined: true }])).toEqual([]);
  });

  it("loads session graph instances by stable instance ID with redacted identity", async () => {
    const api = fakeApi({ instanceId: "device-1", phase: "ready" });
    await loadVst3Instance("device-1", {
      format: "vst3",
      classId: "class-id",
      vendor: "Vendor",
      name: "Synth",
      version: "1",
      category: "Instrument",
      moduleFilename: "C:\\Private\\Synth.vst3",
      binaryFingerprint: "fingerprint"
    }, "instrument", api);

    expect(api.invoke).toHaveBeenCalledWith("vst3_session_load_instance", {
      instanceId: "device-1",
      identity: expect.objectContaining({ moduleFilename: "Synth.vst3" }),
      role: "instrument"
    });
  });

  it("keeps the mutable session command argument contract stable", async () => {
    const api = fakeApi({ ok: true, parameterEdits: [], editorOpen: true });
    await setVst3InstanceParameter("device-1", "42", 0.75, api);
    expect(api.invoke).toHaveBeenLastCalledWith("vst3_session_set_parameter", {
      instanceId: "device-1",
      stableParameterId: "42",
      value: 0.75
    });
    await selectVst3FactoryProgram("device-1", "3:7", api);
    expect(api.invoke).toHaveBeenLastCalledWith("vst3_session_select_program", {
      instanceId: "device-1",
      programId: "3:7"
    });
    const snapshot = { encoding: "gzip-base64" as const, data: "", checksum: "a".repeat(64), sizeBytes: 0 };
    await restoreVst3InstanceState("device-1", snapshot, api);
    expect(api.invoke).toHaveBeenLastCalledWith("vst3_session_set_state", { instanceId: "device-1", snapshot });
    await openVst3VendorEditor("device-1", api);
    expect(api.invoke).toHaveBeenLastCalledWith("vst3_session_open_vendor_editor", { instanceId: "device-1" });
    await pollVst3ParameterEdits("device-1", api);
    expect(api.invoke).toHaveBeenLastCalledWith("vst3_session_poll_parameter_edits", { instanceId: "device-1" });
  });
});
