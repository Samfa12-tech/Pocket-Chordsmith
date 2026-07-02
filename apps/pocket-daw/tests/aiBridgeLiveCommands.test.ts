import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { createInitialState, currentProject, type AppState } from "../src/app/state";
import { addTrackCommand } from "../src/app/commands";
import { AudioEngine } from "../src/audio/audioEngine";
import { PerformanceDiagnosticsRecorder } from "../src/app/performanceDiagnostics";
import { createUndoStack } from "../src/daw/undo";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { activateAudioTake, setAudioTakeArchived } from "../src/daw/clips";

function appHarness(state: AppState) {
  const app = Object.create(App.prototype) as {
    state: AppState;
    engine: AudioEngine;
    performanceDiagnostics: PerformanceDiagnosticsRecorder;
    renderCount: number;
    renderCountDuringPlayback: number;
    liveUpdateCount: number;
    applyAiBridgeLiveCommand(command: unknown): AppState;
    aiBridgeLiveStatus(): unknown;
  };
  app.state = state;
  app.engine = new AudioEngine(state.undoStack.present);
  app.performanceDiagnostics = new PerformanceDiagnosticsRecorder();
  app.renderCount = 0;
  app.renderCountDuringPlayback = 0;
  app.liveUpdateCount = 0;
  return app;
}

describe("Pocket DAW AI bridge live commands", () => {
  it("applies recording input channel assignments through the live bridge executor", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const project = state.undoStack.present;
    project.audioDeviceSettings = {
      devices: [{ id: "interface-4", name: "Four Channel Interface", kind: "input", isDefaultInput: true, supportedChannels: [1, 2, 4] }],
      inputDeviceId: "interface-4",
      outputDeviceId: null,
      sampleRate: 48000,
      bufferSize: 256,
      inputChannels: 4,
      outputChannels: 2,
      host: "wasapi"
    };
    const app = appHarness(state);

    const next = app.applyAiBridgeLiveCommand({
      type: "set_recording_input_channel",
      trackId: "live-vocals",
      deviceId: "interface-4",
      mode: "stereo",
      channelPair: [2, 3]
    });

    const track = next.undoStack.present.tracks.find((item) => item.id === "live-vocals");
    expect(next.status).toBe("Live Vocals recording input set to Stereo Ch 3-4.");
    expect(track?.recordingInput).toMatchObject({
      deviceId: "interface-4",
      mode: "stereo",
      channelPair: [2, 3]
    });
  });

  it("applies split-mono recording input assignments through the live bridge executor", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const project = state.undoStack.present;
    project.audioDeviceSettings = {
      devices: [{ id: "interface-4", name: "Four Channel Interface", kind: "input", isDefaultInput: true, supportedChannels: [1, 2, 4] }],
      inputDeviceId: "interface-4",
      outputDeviceId: null,
      sampleRate: 48000,
      bufferSize: 256,
      inputChannels: 4,
      outputChannels: 2,
      host: "wasapi"
    };
    const app = appHarness(state);

    const next = app.applyAiBridgeLiveCommand({
      type: "set_recording_input_channel",
      trackId: "live-vocals",
      deviceId: "interface-4",
      mode: "split-mono",
      channelIndex: 1
    });

    const track = next.undoStack.present.tracks.find((item) => item.id === "live-vocals");
    expect(next.status).toBe("Live Vocals recording input set to Split Mono Ch 2.");
    expect(track?.recordingInput).toMatchObject({
      deviceId: "interface-4",
      mode: "split-mono",
      channelIndex: 1
    });
  });

  it("applies arm and monitor states through the live bridge executor", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const app = appHarness(state);

    const armed = app.applyAiBridgeLiveCommand({
      type: "set_track_armed",
      trackId: "live-vocals",
      armed: true
    });
    app.state = armed;
    const monitored = app.applyAiBridgeLiveCommand({
      type: "set_track_monitor",
      trackId: "live-vocals",
      monitorEnabled: true
    });
    const track = monitored.undoStack.present.tracks.find((item) => item.id === "live-vocals");

    expect(armed.status).toBe("Armed Live Vocals.");
    expect(monitored.status).toBe("Live Vocals monitor on.");
    expect(track).toMatchObject({ armed: true, monitorEnabled: true });
  });

  it("applies track input device selection through the live bridge executor", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const app = appHarness(state);

    const next = app.applyAiBridgeLiveCommand({
      type: "set_track_input",
      trackId: "live-vocals",
      inputDeviceId: "interface-4"
    });
    const track = next.undoStack.present.tracks.find((item) => item.id === "live-vocals");

    expect(next.status).toBe("Updated track input.");
    expect(track).toMatchObject({
      inputDeviceId: "interface-4",
      recordingInput: { deviceId: "interface-4", mode: "mono", channelIndex: 0 }
    });
  });

  it("applies explicit punch ranges through the live bridge executor and status", () => {
    const state = createInitialState();
    const app = appHarness(state);

    const next = app.applyAiBridgeLiveCommand({
      type: "set_punch_range",
      startBar: 7,
      endBar: 9
    });
    app.state = next;
    const status = app.aiBridgeLiveStatus() as {
      timelineSelection?: { startBar: number; endBar: number; source: string } | null;
    };

    expect(next.status).toBe("Punch range set from bar 7 to 9.");
    expect(next.undoStack.present.timeline.selection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
    expect(status.timelineSelection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
  });

  it("exposes recording input preflight and live recording commands in live status", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const project = state.undoStack.present;
    project.audioDeviceSettings = {
      devices: [{ id: "interface-4", name: "Four Channel Interface", kind: "input", isDefaultInput: true, supportedChannels: [1, 2, 4] }],
      inputDeviceId: "interface-4",
      outputDeviceId: null,
      sampleRate: 48000,
      bufferSize: 256,
      inputChannels: 4,
      outputChannels: 2,
      host: "wasapi"
    };
    const track = project.tracks.find((item) => item.id === "live-vocals")!;
    track.armed = true;
    track.recordingInput = { deviceId: "interface-4", mode: "stereo", channelPair: [2, 3] };
    track.recordingChannelMode = "stereo";
    const app = appHarness(state);

    const status = app.aiBridgeLiveStatus() as {
      recording: { inputPreflight?: { ok: boolean; errors: string[] } };
      capabilities: { liveCommands: string[] };
    };

    expect(status.capabilities.liveCommands).toContain("set_track_armed");
    expect(status.capabilities.liveCommands).toContain("set_track_monitor");
    expect(status.capabilities.liveCommands).toContain("set_track_input");
    expect(status.capabilities.liveCommands).toContain("set_recording_input_channel");
    expect(status.capabilities.liveCommands).toContain("set_punch_range");
    expect(status.recording.inputPreflight).toMatchObject({ ok: false });
    expect(status.recording.inputPreflight?.errors.join("\n")).toContain("native recording alpha currently captures Stereo Ch 1-2 only");
  });

  it("exposes future grouped capture planning in live status for MCP-observed recording smoke", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    state = addTrackCommand(state, "live-instrument");
    const project = state.undoStack.present;
    project.audioDeviceSettings = {
      devices: [{ id: "interface-4", name: "Four Channel Interface", kind: "input", isDefaultInput: true, supportedChannels: [1, 2, 4] }],
      inputDeviceId: "interface-4",
      outputDeviceId: null,
      sampleRate: 48000,
      bufferSize: 256,
      inputChannels: 4,
      outputChannels: 2,
      host: "wasapi"
    };
    const vocals = project.tracks.find((item) => item.id === "live-vocals")!;
    const guitar = project.tracks.find((item) => item.id === "live-instrument")!;
    vocals.armed = true;
    guitar.armed = true;
    vocals.recordingInput = { deviceId: "interface-4", mode: "split-mono", channelIndex: 0 };
    guitar.recordingInput = { deviceId: "interface-4", mode: "stereo", channelPair: [1, 2] };
    const app = appHarness(state);

    const status = app.aiBridgeLiveStatus() as {
      recording: {
        futureCapturePlan?: {
          ok: boolean;
          recordingSessionId: string;
          takeGroupId: string;
          items: Array<{
            trackId: string;
            mode: string;
            channelMap: number[];
            outputChannels: number;
            projectRelativePath: string;
            takeMetadata: { inputMode?: string; takeGroupId?: string; latencyCompensationAppliedSeconds?: number };
          }>;
        };
      };
    };

    expect(status.recording.futureCapturePlan).toMatchObject({
      ok: true,
      recordingSessionId: "live-preview",
      takeGroupId: "live-preview-take-group"
    });
    expect(status.recording.futureCapturePlan?.items.map((item) => ({
      trackId: item.trackId,
      mode: item.mode,
      channelMap: item.channelMap,
      outputChannels: item.outputChannels,
      projectRelativePath: item.projectRelativePath
    }))).toEqual([
      {
        trackId: "live-vocals",
        mode: "split-mono",
        channelMap: [0],
        outputChannels: 1,
        projectRelativePath: "project-media/recordings/live-preview-live-vocals-split-ch1.wav"
      },
      {
        trackId: "live-instrument",
        mode: "stereo",
        channelMap: [1, 2],
        outputChannels: 2,
        projectRelativePath: "project-media/recordings/live-preview-live-instrument-ch2-3.wav"
      }
    ]);
    expect(status.recording.futureCapturePlan?.items[0].takeMetadata).toMatchObject({
      inputMode: "split-mono",
      takeGroupId: "live-preview-take-group",
      latencyCompensationAppliedSeconds: 0
    });
  });

  it("exposes compact export readiness for MCP-observed game-pack smoke", () => {
    const app = appHarness(createInitialState());

    const status = app.aiBridgeLiveStatus() as {
      export: {
        stemCount: number;
        sectionLoopCount: number;
        deliveryTargets: Array<{ id: string }>;
        gamePacks: {
          godot: { kind: string; manifestFile: string; fullMix: string; warningCount: number };
          web: { kind: string; manifestFile: string; fullMix: string; warningCount: number };
        };
      };
      capabilities: { read: string[] };
    };

    expect(status.capabilities.read).toContain("export_readiness");
    expect(status.export.stemCount).toBeGreaterThan(0);
    expect(status.export.sectionLoopCount).toBeGreaterThan(0);
    expect(status.export.deliveryTargets.map((target) => target.id)).toEqual(["godot-local-loopback", "godot-zip", "web-zip"]);
    expect(status.export.gamePacks.godot).toMatchObject({
      kind: "godot-adaptive-pack",
      manifestFile: expect.stringContaining("godot"),
      fullMix: expect.stringContaining(".wav")
    });
    expect(status.export.gamePacks.web).toMatchObject({
      kind: "web-game-pack",
      manifestFile: expect.stringContaining("web"),
      fullMix: expect.stringContaining(".wav")
    });
  });

  it("exposes live track setup fields needed for MCP-observed recording smoke", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const project = state.undoStack.present;
    const track = project.tracks.find((item) => item.id === "live-vocals")!;
    track.armed = true;
    track.monitorEnabled = true;
    track.inputDeviceId = "interface-4";
    track.recordingChannelMode = "stereo";
    track.recordingInput = { deviceId: "interface-4", mode: "stereo", channelPair: [0, 1] };
    track.folderId = "vocals-folder";
    track.routing.outputId = "master";
    const app = appHarness(state);

    const status = app.aiBridgeLiveStatus() as {
      tracks: Array<{
        id: string;
        armed?: boolean;
        monitorEnabled?: boolean;
        inputDeviceId?: string | null;
        recordingChannelMode?: string;
        recordingInput?: unknown;
        folderId?: string | null;
        outputId?: string | null;
      }>;
    };

    expect(status.tracks.find((item) => item.id === "live-vocals")).toMatchObject({
      armed: true,
      monitorEnabled: true,
      inputDeviceId: "interface-4",
      recordingChannelMode: "stereo",
      recordingInput: { deviceId: "interface-4", mode: "stereo", channelPair: [0, 1] },
      folderId: "vocals-folder",
      outputId: "master"
    });
  });

  it("exposes compact media and take summaries for MCP-observed recording smoke", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    let project = currentProject(state);
    const firstImport = addImportedAudioMedia(project, {
      name: "Live take 1.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/recordings/live-take-1.wav",
        importMode: "native-recording",
        takeGroupId: "live-status-takes-a"
      }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 1);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Live take 2.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/recordings/live-take-2.wav",
        importMode: "native-recording",
        takeGroupId: "live-status-takes-a"
      }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 1);
    project = setAudioTakeArchived(activateAudioTake(secondPlaced.project, secondPlaced.clipId).project, firstPlaced.clipId, true).project;
    state = { ...state, undoStack: createUndoStack(project) };
    const app = appHarness(state);

    const status = app.aiBridgeLiveStatus() as {
      media?: {
        poolCount: number;
        projectMediaCount: number;
        runtimeOnlyCount: number;
        missingCount: number;
        audioTakes: {
          groupedClipCount: number;
          groupCount: number;
          activeCount: number;
          archivedCount: number;
          groups: Array<{ groupId: string; clipCount: number; activeCount: number; archivedCount: number }>;
        };
      };
      capabilities: { read: string[] };
    };

    expect(status.capabilities.read).toContain("media_take_summary");
    expect(status.media).toMatchObject({
      poolCount: 2,
      projectMediaCount: 2,
      runtimeOnlyCount: 0,
      missingCount: 0,
      audioTakes: {
        groupedClipCount: 2,
        groupCount: 1,
        activeCount: 1,
        archivedCount: 1,
        groups: [{ groupId: "live-status-takes-a", clipCount: 2, activeCount: 1, archivedCount: 1 }]
      }
    });
  });
});
