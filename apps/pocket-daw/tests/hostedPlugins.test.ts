import { describe, expect, it } from "vitest";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import {
  addHostedPluginEffect,
  applyHostedPocketPreset,
  createHostedPluginInstrumentTrack,
  ensureHostedInstrumentAutomationLane,
  mergeHostedPluginRuntimeMetadata,
  saveHostedPocketPreset,
  setHostedInstrumentParameter,
  setHostedPluginSnapshot,
  substituteHostedPlugin,
  type VerifiedHostedPluginDescriptor
} from "../src/daw/hostedPlugins";
import { addTrackToProject } from "../src/daw/tracks";

function descriptor(name = "Pocket Test", roles = { instrument: true, effect: true }): VerifiedHostedPluginDescriptor {
  return {
    verified: true,
    identity: {
      format: "vst3",
      classId: `class-${name}`,
      vendor: "Pocket Audio",
      name,
      version: "1.0.0",
      category: roles.instrument ? "Instrument" : "Fx",
      moduleFilename: `${name}.vst3`,
      binaryFingerprint: "a".repeat(64)
    },
    supportsInstrumentRole: roles.instrument,
    supportsEffectRole: roles.effect,
    reportedLatencySamples: 64,
    reportedTailSamples: 2_400,
    parameterDescriptors: [{
      stableId: "cutoff",
      name: "Cutoff",
      unit: "Hz",
      min: 20,
      max: 20_000,
      defaultValue: 1_000,
      automatable: true
    }],
    factoryPrograms: [{ id: "init", name: "Init" }]
  };
}

describe("hosted VST3 project operations", () => {
  it("inserts verified instruments and effects without persisting absolute paths", () => {
    const instrument = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), descriptor());
    expect(instrument).not.toBeNull();
    const device = instrument!.project.devices.find((item) => item.id === instrument!.instanceId);
    expect(device?.type).toBe("vst3-instrument");
    expect(JSON.stringify(device)).not.toContain("C:\\");

    const audioTrack = addTrackToProject(instrument!.project, "live-instrument");
    const effect = addHostedPluginEffect(audioTrack.project, audioTrack.trackId, descriptor("Pocket Effect", { instrument: false, effect: true }));
    expect(effect?.chainId).toBeTruthy();
    expect(effect?.project.fx.chains.find((chain) => chain.id === effect.chainId)?.slots.at(-1)?.hostedPlugin?.classId)
      .toBe("class-Pocket Effect");
  });

  it("keeps instance position, valid state and automation while intentionally substituting", () => {
    const inserted = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), descriptor())!;
    let project = setHostedInstrumentParameter(inserted.project, inserted.instanceId, "cutoff", 4_200);
    const automated = ensureHostedInstrumentAutomationLane(project, inserted.instanceId, "cutoff")!;
    project = automated.project;
    const snapshot = { encoding: "gzip-base64" as const, data: "AQID", checksum: "b".repeat(64), sizeBytes: 3 };
    project = setHostedPluginSnapshot(project, inserted.instanceId, snapshot, {
      valid: true,
      compressedBytes: 3,
      checksumSha256: snapshot.checksum
    });

    const replacement = descriptor("Replacement");
    const substituted = substituteHostedPlugin(project, inserted.instanceId, replacement);
    const device = substituted.devices.find((item) => item.id === inserted.instanceId);
    expect(device?.type).toBe("vst3-instrument");
    if (device?.type !== "vst3-instrument") throw new Error("missing hosted device");
    expect(device.hostedPlugin.name).toBe("Replacement");
    expect(device.parameters.cutoff).toBe(4_200);
    expect(device.hostedPluginState).toEqual(snapshot);
    expect(substituted.automation.lanes.find((lane) => lane.id === automated.laneId)?.targetPath)
      .toBe(`device:${inserted.instanceId}:parameter:cutoff`);
  });

  it("retains the previous valid state when validation rejects a replacement snapshot", () => {
    const inserted = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), descriptor())!;
    const good = { encoding: "gzip-base64" as const, data: "AQID", checksum: "c".repeat(64), sizeBytes: 3 };
    const withGood = setHostedPluginSnapshot(inserted.project, inserted.instanceId, good, {
      valid: true,
      compressedBytes: 3,
      checksumSha256: good.checksum
    });
    const invalid = { ...good, data: "not base64", sizeBytes: 10 };
    const rejected = setHostedPluginSnapshot(withGood, inserted.instanceId, invalid, {
      valid: false,
      compressedBytes: 10,
      checksumSha256: invalid.checksum
    });
    expect(rejected).toBe(withGood);
    const device = rejected.devices.find((item) => item.id === inserted.instanceId);
    expect(device?.type === "vst3-instrument" ? device.hostedPluginState : null).toEqual(good);
  });

  it("saves and reapplies Pocket presets with parameter and state snapshots", () => {
    const inserted = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), descriptor())!;
    const edited = setHostedInstrumentParameter(inserted.project, inserted.instanceId, "cutoff", 7_500);
    const saved = saveHostedPocketPreset(edited, inserted.instanceId, "Bright", "2026-08-01T00:00:00.000Z");
    const savedDevice = saved.devices.find((item) => item.id === inserted.instanceId);
    const presetId = savedDevice?.type === "vst3-instrument"
      ? savedDevice.hostedPluginMetadata?.pocketPresets[0].id
      : undefined;
    const changed = setHostedInstrumentParameter(saved, inserted.instanceId, "cutoff", 200);
    const restored = applyHostedPocketPreset(changed, inserted.instanceId, presetId!);
    const device = restored.devices.find((item) => item.id === inserted.instanceId);
    expect(device?.type === "vst3-instrument" ? device.parameters.cutoff : null).toBe(7_500);
  });

  it("preserves the native list:index factory program identifier", () => {
    const source = descriptor();
    source.factoryPrograms = [{ id: "3:7", name: "Seventh" }];
    const inserted = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), source)!;
    const device = inserted.project.devices.find((item) => item.id === inserted.instanceId);
    expect(device?.type === "vst3-instrument" ? device.hostedPluginMetadata?.factoryPrograms[0].id : null).toBe("3:7");
  });

  it("persists runtime parameters, programs, latency and tails after component load", () => {
    const inserted = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), descriptor())!;
    const merged = mergeHostedPluginRuntimeMetadata(inserted.project, inserted.instanceId, {
      parameterDescriptors: [{ stableId: "42", name: "Cutoff", min: 0, max: 1, defaultValue: 0.25, automatable: true }],
      factoryPrograms: [{ id: "3:7", name: "Seventh" }],
      selectedFactoryProgramId: "3:7",
      latencySamples: 128,
      tailSamples: 9_600
    });
    const device = merged.devices.find((item) => item.id === inserted.instanceId);
    if (device?.type !== "vst3-instrument") throw new Error("missing hosted device");
    expect(device.parameters).toEqual({ "42": 0.25 });
    expect(device.hostedPluginMetadata).toMatchObject({
      selectedFactoryProgramId: "3:7",
      lastKnownLatencySamples: 128,
      lastKnownTailSamples: 9_600
    });
  });

  it("bounds hostile plug-in latency and tail reports before persistence", () => {
    const inserted = createHostedPluginInstrumentTrack(createEmptyPocketDawProject(), descriptor())!;
    const merged = mergeHostedPluginRuntimeMetadata(inserted.project, inserted.instanceId, {
      parameterDescriptors: [],
      factoryPrograms: [],
      latencySamples: Number.MAX_SAFE_INTEGER,
      tailSamples: Number.MAX_SAFE_INTEGER
    });
    const device = merged.devices.find((item) => item.id === inserted.instanceId);
    if (device?.type !== "vst3-instrument") throw new Error("missing hosted device");
    expect(device.hostedPluginMetadata?.lastKnownLatencySamples).toBe(262_144);
    expect(device.hostedPluginMetadata?.lastKnownTailSamples).toBe(5_760_000);
  });
});
