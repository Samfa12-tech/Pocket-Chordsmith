import { describe, expect, it } from "vitest";
import {
  createDrumRackTrackCommand,
  createQuickSamplerTrackCommand,
  mapDrumRackPadSampleCommand,
  removeInstrumentDeviceCommand,
  setDrumRackPadParameterCommand,
  setInstrumentDeviceEnabledCommand,
  setSamplerEnvelopeParameterCommand,
  setSamplerParameterCommand,
  undoCommand
} from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addImportedAudioMedia } from "../src/daw/audioClips";
import { buildPocketDawProjectFile, createEmptyPocketDawProject, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { createQuickSamplerDevice, deviceAutomationTargetPath, replaceTrackInstrumentDevice, setHostedPluginStateSnapshot } from "../src/daw/devices";
import { validateProjectInvariants } from "../src/daw/projectInvariants";
import { MAX_HOSTED_PLUGIN_STATE_BYTES, type DrumRackDevice, type HostedPluginDevice, type SamplerDevice } from "../src/daw/schema";
import { createUndoStack } from "../src/daw/undo";

describe("schema 3 instrument devices", () => {
  it("creates a Quick Sampler track with safe defaults and undoable edits", () => {
    const state = stateWithSamples(["Piano C3.wav"]);
    const sampleId = state.undoStack.present.mediaPool[0].id;

    let edited = createQuickSamplerTrackCommand(state, sampleId);
    const track = edited.undoStack.present.tracks.find((item) => item.id === edited.selectedTrackId)!;
    const sampler = edited.undoStack.present.devices.find((item): item is SamplerDevice => item.id === track.instrumentDeviceId)!;

    expect(track.trackType).toBe("midi");
    expect(sampler).toMatchObject({
      type: "quick-sampler",
      mediaPoolItemId: sampleId,
      rootNote: 60,
      keyTracking: true,
      playbackMode: "one-shot",
      startPosition: 0,
      endPosition: 1
    });

    edited = setSamplerParameterCommand(edited, sampler.id, "coarseTune", 60);
    edited = setSamplerParameterCommand(edited, sampler.id, "fineTuneCents", -25);
    edited = setSamplerParameterCommand(edited, sampler.id, "playbackMode", "loop");
    edited = setSamplerEnvelopeParameterCommand(edited, sampler.id, "attackSeconds", 0.4);
    edited = setInstrumentDeviceEnabledCommand(edited, sampler.id, false);
    expect(edited.undoStack.present.devices[0]).toMatchObject({
      enabled: false,
      coarseTune: 48,
      fineTuneCents: -25,
      playbackMode: "loop",
      envelope: { attackSeconds: 0.4 }
    });

    const undone = undoCommand(edited);
    expect(undone.undoStack.present.devices[0].enabled).toBe(true);
    expect(undone.undoStack.past.length).toBe(edited.undoStack.past.length - 1);
  });

  it("creates a 16-pad Drum Rack in selection order with a shared hat choke group", () => {
    const state = stateWithSamples(["Kick.wav", "Snare.wav", "Closed Hat.wav", "Open Hat.wav"]);
    const ids = state.undoStack.present.mediaPool.map((item) => item.id);
    let edited = createDrumRackTrackCommand(state, ids);
    const track = edited.undoStack.present.tracks.find((item) => item.id === edited.selectedTrackId)!;
    const rack = edited.undoStack.present.devices.find((item): item is DrumRackDevice => item.id === track.instrumentDeviceId && item.type === "drum-rack");

    expect(rack?.pads).toHaveLength(16);
    expect(rack?.pads.slice(0, 4).map((pad) => pad.mediaPoolItemId)).toEqual(ids);
    expect(rack?.pads.map((pad) => pad.midiNote)).toEqual(Array.from({ length: 16 }, (_, index) => 36 + index));
    expect(rack?.pads.find((pad) => pad.midiNote === 42)?.chokeGroup).toBe("hats");
    expect(rack?.pads.find((pad) => pad.midiNote === 46)?.chokeGroup).toBe("hats");

    edited = setDrumRackPadParameterCommand(edited, rack!.id, 0, "coarseTune", -60);
    edited = mapDrumRackPadSampleCommand(edited, rack!.id, 4, ids[1], "Alt Snare");
    const updated = edited.undoStack.present.devices.find((item): item is DrumRackDevice => item.id === rack!.id && item.type === "drum-rack");
    expect(updated?.pads[0].coarseTune).toBe(-48);
    expect(updated?.pads[4]).toMatchObject({ mediaPoolItemId: ids[1], name: "Alt Snare" });
  });

  it("round-trips sampler devices and device automation, then removes both together", () => {
    const state = stateWithSamples(["Lead.wav"]);
    const created = createQuickSamplerTrackCommand(state, state.undoStack.present.mediaPool[0].id);
    const track = created.undoStack.present.tracks.find((item) => item.id === created.selectedTrackId)!;
    const deviceId = track.instrumentDeviceId!;
    created.undoStack.present.automation.lanes.push({
      id: "auto_sampler_gain",
      trackId: track.id,
      targetPath: deviceAutomationTargetPath(deviceId, "gain"),
      points: [{ bar: 1, value: 0.7 }],
      enabled: true
    });
    track.automationLaneIds.push("auto_sampler_gain");

    const reopened = migratePocketDawProject(parsePocketDawProjectFile(buildPocketDawProjectFile(created.undoStack.present)));
    expect(reopened.schemaVersion).toBe(3);
    expect(reopened.tracks.find((item) => item.id === track.id)?.instrumentDeviceId).toBe(deviceId);
    expect(reopened.devices.find((item) => item.id === deviceId)).toMatchObject({ type: "quick-sampler", mediaPoolItemId: state.undoStack.present.mediaPool[0].id });
    expect(validateProjectInvariants(reopened).ok).toBe(true);

    const removalState = { ...created, undoStack: createUndoStack(reopened) };
    const removed = removeInstrumentDeviceCommand(removalState, deviceId);
    expect(removed.undoStack.present.devices).toEqual([]);
    expect(removed.undoStack.present.tracks.find((item) => item.id === track.id)?.instrumentDeviceId).toBeUndefined();
    expect(removed.undoStack.present.automation.lanes).toEqual([]);
    expect(undoCommand(removed).undoStack.present.devices).toHaveLength(1);
  });

  it("migrates schema 2 projects to empty device state and normalizes malformed schema 3 devices", () => {
    const schema2 = createEmptyPocketDawProject() as unknown as Record<string, unknown>;
    schema2.schemaVersion = 2;
    delete schema2.devices;
    expect(migratePocketDawProject(schema2).devices).toEqual([]);

    const state = stateWithSamples(["Unsafe.wav"]);
    const mediaId = state.undoStack.present.mediaPool[0].id;
    const project = state.undoStack.present as unknown as Record<string, unknown>;
    project.schemaVersion = 3;
    project.devices = [{
      id: "unsafe sampler",
      type: "quick-sampler",
      name: "Unsafe",
      mediaPoolItemId: mediaId,
      rootNote: 999,
      coarseTune: -999,
      startPosition: 0.9,
      endPosition: 0.2,
      envelope: { attackSeconds: -1, sustainLevel: 9 }
    }];
    const midiTrack = (project.tracks as Array<Record<string, unknown>>).find((item) => item.id === "bass")!;
    midiTrack.trackType = "midi";
    midiTrack.instrumentDeviceId = "unsafe sampler";

    const migrated = migratePocketDawProject(project);
    expect(migrated.devices[0]).toMatchObject({ id: "unsafe-sampler", rootNote: 127, coarseTune: -48, startPosition: 0.9, endPosition: 0.901 });
    expect(migrated.tracks.find((item) => item.id === "bass")?.instrumentDeviceId).toBe("unsafe-sampler");
  });

  it("retains the previous hosted state when a replacement exceeds 32 MiB", () => {
    const project = createEmptyPocketDawProject();
    const track = project.tracks.find((item) => item.id === "bass")!;
    track.trackType = "midi";
    const hosted: HostedPluginDevice = {
      id: "plugin-synth",
      type: "vst3-instrument",
      name: "Test Synth",
      enabled: true,
      hostedPlugin: {
        format: "vst3",
        classId: "test-class",
        vendor: "Pocket Tests",
        name: "Test Synth",
        version: "1.0",
        category: "Instrument",
        moduleFilename: "Test Synth.vst3",
        binaryFingerprint: "sha256:test"
      },
      hostedPluginState: {
        encoding: "gzip-base64",
        data: "eA==",
        checksum: "a".repeat(64),
        sizeBytes: 1
      },
      parameters: {}
    };
    const withPlugin = replaceTrackInstrumentDevice(project, track.id, hosted);
    const rejected = setHostedPluginStateSnapshot(withPlugin, hosted.id, {
      encoding: "gzip-base64",
      data: "eA==",
      checksum: "b".repeat(64),
      sizeBytes: MAX_HOSTED_PLUGIN_STATE_BYTES + 1
    });

    expect(rejected).toBe(withPlugin);
    expect((rejected.devices[0] as HostedPluginDevice).hostedPluginState?.checksum).toBe("a".repeat(64));
  });

  it("reports dangling device references without treating missing sample media as project corruption", () => {
    const project = createEmptyPocketDawProject();
    const track = project.tracks.find((item) => item.id === "bass")!;
    track.trackType = "midi";
    const sampler = createQuickSamplerDevice("missing-media", { id: "missing-sampler" });
    project.devices.push(sampler);
    track.instrumentDeviceId = sampler.id;

    const missingMedia = validateProjectInvariants(project);
    expect(missingMedia.ok).toBe(true);
    expect(missingMedia.warnings.map((item) => item.code)).toContain("missing-sampler-media");

    track.instrumentDeviceId = "missing-device";
    const danglingDevice = validateProjectInvariants(project);
    expect(danglingDevice.ok).toBe(false);
    expect(danglingDevice.errors.map((item) => item.code)).toContain("missing-track-instrument-device");
  });
});

function stateWithSamples(names: string[]) {
  const state = createInitialState();
  let project = state.undoStack.present;
  names.forEach((name) => {
    project = addImportedAudioMedia(project, {
      name,
      uri: `C:\\Samples\\${name}`,
      mimeType: "audio/wav",
      durationSeconds: 1,
      sampleRate: 48000,
      channels: 1,
      metadata: { waveformPeaks: [0.5] }
    }).project;
  });
  state.undoStack = createUndoStack(project);
  return state;
}
