import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { createInitialState, currentProject, type AppState } from "../src/app/state";
import { addTrackCommand } from "../src/app/commands";
import { AudioEngine } from "../src/audio/audioEngine";
import { PerformanceDiagnosticsRecorder } from "../src/app/performanceDiagnostics";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { createUndoStack } from "../src/daw/undo";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { addTrackToProject } from "../src/daw/tracks";
import { activateAudioTake, setAudioTakeArchived } from "../src/daw/clips";
import { addMidiNote, importMidiFileToProject, midiDataFromClip } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { simpleMidiBytes } from "./midiFixtures";

function appHarness(state: AppState) {
  const app = Object.create(App.prototype) as {
    state: AppState;
    engine: AudioEngine;
    performanceDiagnostics: PerformanceDiagnosticsRecorder;
    renderCount: number;
    renderCountDuringPlayback: number;
    liveUpdateCount: number;
    applyAiBridgeLiveCommand(command: unknown): AppState;
    applyAiBridgeLiveCommands(commands: unknown[]): unknown;
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

  it("applies manual recording latency offsets through the live bridge executor", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const app = appHarness(state);

    const next = app.applyAiBridgeLiveCommand({
      type: "set_recording_latency_offset",
      trackId: "live-vocals",
      offsetSeconds: 0.029
    });

    const track = next.undoStack.present.tracks.find((item) => item.id === "live-vocals");
    expect(next.status).toBe("Live Vocals recording latency offset set to 29 ms.");
    expect(track?.metadata).toMatchObject({
      recordingLatencyOffsetSeconds: 0.029,
      recordingLatencyOffsetMs: 29,
      recordingLatencyOffsetMode: "manual-track-offset"
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

  it("sets and clears ordinary edit ranges through the live bridge executor and status", () => {
    const app = appHarness(createInitialState());

    const ranged = app.applyAiBridgeLiveCommand({
      type: "set_timeline_selection",
      startBar: 3,
      endBar: 5
    });
    app.state = ranged;
    const rangedStatus = app.aiBridgeLiveStatus() as {
      timelineSelection?: { startBar: number; endBar: number; source: string } | null;
    };
    const cleared = app.applyAiBridgeLiveCommand({ type: "clear_timeline_selection" });
    app.state = cleared;
    const clearedStatus = app.aiBridgeLiveStatus() as {
      timelineSelection?: { startBar: number; endBar: number; source: string } | null;
    };

    expect(ranged.status).toBe("Updated edit range.");
    expect(ranged.undoStack.present.timeline.selection).toEqual({ startBar: 3, endBar: 5, source: "manual" });
    expect(rangedStatus.timelineSelection).toEqual({ startBar: 3, endBar: 5, source: "manual" });
    expect(cleared.status).toBe("Edit range cleared.");
    expect(cleared.undoStack.present.timeline.selection).toBeNull();
    expect(clearedStatus.timelineSelection).toBeNull();
  });

  it("sets edit ranges from clips and splits through the live bridge executor", () => {
    let state = createInitialState();
    let project = currentProject(state);
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const imported = addImportedAudioMedia(project, {
      name: "Live range split.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state = {
      ...state,
      selectedClipId: placed.clipId,
      selectedTrackId: placed.trackId,
      undoStack: createUndoStack(placed.project)
    };
    const app = appHarness(state);

    const clipRanged = app.applyAiBridgeLiveCommand({
      type: "set_timeline_selection_to_clip",
      clipId: placed.clipId
    });
    app.state = clipRanged;
    const narrowed = app.applyAiBridgeLiveCommand({
      type: "set_timeline_selection",
      startBar: 3,
      endBar: 5
    });
    app.state = narrowed;
    const split = app.applyAiBridgeLiveCommand({ type: "split_timeline_selection" });
    const splitAudioClipStarts = split.undoStack.present.timeline.clips
      .filter((clip) => clip.name.startsWith("Live range split.wav"))
      .map((clip) => clip.startBar)
      .sort((a, b) => a - b);

    expect(clipRanged.status).toBe("Edit range set to selected clip.");
    expect(clipRanged.undoStack.present.timeline.selection).toEqual({ startBar: 2, endBar: 6, source: "clip" });
    expect(split.status).toContain("at edit range.");
    expect(splitAudioClipStarts).toEqual([2, 3, 5]);
  });

  it("crops and deletes selected audio clip ranges through the live bridge executor", () => {
    let cropState = createInitialState();
    const cropProject = createEmptyPocketDawProject();
    cropProject.project.bpm = 120;
    cropProject.project.timeSig = 4;
    cropProject.timeline.clips = [];
    const cropImport = addImportedAudioMedia(cropProject, {
      name: "Live crop range.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const cropPlaced = placeAudioClipOnTimeline(cropImport.project, cropImport.item.id, 2);
    cropState = {
      ...cropState,
      selectedClipId: cropPlaced.clipId,
      selectedTrackId: cropPlaced.trackId,
      undoStack: createUndoStack(cropPlaced.project)
    };
    const cropApp = appHarness(cropState);

    const cropRanged = cropApp.applyAiBridgeLiveCommand({ type: "set_timeline_selection", startBar: 3, endBar: 5 });
    cropApp.state = cropRanged;
    const cropped = cropApp.applyAiBridgeLiveCommand({
      type: "crop_clip_to_timeline_selection",
      clipId: cropPlaced.clipId
    });
    const croppedClip = cropped.undoStack.present.timeline.clips.find((clip) => clip.id === cropPlaced.clipId)!;

    let deleteState = createInitialState();
    const deleteProject = createEmptyPocketDawProject();
    deleteProject.project.bpm = 120;
    deleteProject.project.timeSig = 4;
    deleteProject.timeline.clips = [];
    const deleteImport = addImportedAudioMedia(deleteProject, {
      name: "Live delete range.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const deletePlaced = placeAudioClipOnTimeline(deleteImport.project, deleteImport.item.id, 2);
    deleteState = {
      ...deleteState,
      selectedClipId: deletePlaced.clipId,
      selectedTrackId: deletePlaced.trackId,
      undoStack: createUndoStack(deletePlaced.project)
    };
    const deleteApp = appHarness(deleteState);

    const deleteRanged = deleteApp.applyAiBridgeLiveCommand({ type: "set_timeline_selection", startBar: 3, endBar: 5 });
    deleteApp.state = deleteRanged;
    const deleted = deleteApp.applyAiBridgeLiveCommand({
      type: "delete_clip_range",
      clipId: deletePlaced.clipId
    });
    const deletedSegments = deleted.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === deleteImport.item.id)
      .sort((a, b) => a.startBar - b.startBar);

    expect(cropped.status).toBe("Cropped Live crop range.wav to edit range.");
    expect(croppedClip).toMatchObject({ startBar: 3, barLength: 2 });
    expect(croppedClip.metadata?.sourceOffsetSeconds).toBe(2);
    expect(cropped.selectedClipId).toBe(cropPlaced.clipId);
    expect(deleted.status).toBe("Deleted range from Live delete range.wav.");
    expect(deletedSegments.map((clip) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [5, 1]]);
    expect(deletedSegments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 6]);
    expect(deleted.selectedClipId).toBe(deletedSegments[1].id);
  });

  it("ripple deletes selected ranges and all-track ranges through the live bridge executor", () => {
    let selectedState = createInitialState();
    const selectedProject = createEmptyPocketDawProject();
    selectedProject.project.bpm = 120;
    selectedProject.project.timeSig = 4;
    selectedProject.timeline.clips = [];
    const selectedImport = addImportedAudioMedia(selectedProject, {
      name: "Live ripple range.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstPlaced = placeAudioClipOnTimeline(selectedImport.project, selectedImport.item.id, 2);
    const laterPlaced = placeAudioClipOnTrack(firstPlaced.project, selectedImport.item.id, firstPlaced.trackId, 7);
    selectedState = {
      ...selectedState,
      selectedClipId: firstPlaced.clipId,
      selectedTrackId: firstPlaced.trackId,
      undoStack: createUndoStack(laterPlaced.project)
    };
    const selectedApp = appHarness(selectedState);

    const selectedRanged = selectedApp.applyAiBridgeLiveCommand({ type: "set_timeline_selection", startBar: 3, endBar: 5 });
    selectedApp.state = selectedRanged;
    const selectedRipple = selectedApp.applyAiBridgeLiveCommand({
      type: "ripple_delete_clip_range",
      clipId: firstPlaced.clipId
    });
    const selectedSegments = selectedRipple.undoStack.present.timeline.clips
      .filter((clip) => clip.mediaPoolItemId === selectedImport.item.id && clip.trackId === firstPlaced.trackId)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    let allState = createInitialState();
    const allProject = createEmptyPocketDawProject();
    allProject.project.bpm = 120;
    allProject.project.timeSig = 4;
    allProject.timeline.clips = [];
    const allImport = addImportedAudioMedia(allProject, {
      name: "Live ripple all.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1
    });
    const firstTrack = placeAudioClipOnTimeline(allImport.project, allImport.item.id, 2);
    const firstLater = placeAudioClipOnTrack(firstTrack.project, allImport.item.id, firstTrack.trackId, 7);
    const secondTrack = addTrackToProject(firstLater.project, "live-instrument");
    const secondEarly = placeAudioClipOnTrack(secondTrack.project, allImport.item.id, secondTrack.trackId, 3);
    const secondLater = placeAudioClipOnTrack(secondEarly.project, allImport.item.id, secondTrack.trackId, 8);
    allState = {
      ...allState,
      selectedClipId: firstTrack.clipId,
      selectedTrackId: firstTrack.trackId,
      undoStack: createUndoStack(secondLater.project)
    };
    const allApp = appHarness(allState);

    const allRanged = allApp.applyAiBridgeLiveCommand({ type: "set_timeline_selection", startBar: 3, endBar: 5 });
    allApp.state = allRanged;
    const allRipple = allApp.applyAiBridgeLiveCommand({ type: "ripple_delete_timeline_selection" });

    expect(selectedRipple.status).toBe("Ripple deleted range from Live ripple range.wav; moved 2 clips.");
    expect(selectedSegments.map((clip) => [clip.startBar, clip.barLength])).toEqual([[2, 1], [3, 1], [5, 4]]);
    expect(selectedSegments.map((clip) => clip.metadata?.sourceOffsetSeconds)).toEqual([0, 6, 0]);
    expect(allRipple.status).toBe("Ripple deleted edit range across all tracks; edited 2 clips and moved 2 later clips.");
    expect(allRipple.undoStack.present.timeline.clips.find((clip) => clip.id === firstLater.clipId)?.startBar).toBe(5);
    expect(allRipple.undoStack.present.timeline.clips.find((clip) => clip.id === secondLater.clipId)?.startBar).toBe(6);
    expect(allRipple.undoStack.present.timeline.clips.find((clip) => clip.id === secondEarly.clipId)?.metadata?.sourceOffsetSeconds).toBe(4);
  });

  it("applies audio transient and warp marker actions through the live bridge executor", () => {
    let state = createInitialState();
    const project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Live warp loop.wav",
      durationSeconds: 6,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.05, 0.72, 0.2, 0.15, 0.86, 0.3] }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state = {
      ...state,
      selectedClipId: placed.clipId,
      selectedTrackId: placed.trackId,
      undoStack: createUndoStack(placed.project)
    };
    const app = appHarness(state);

    const analyzed = app.applyAiBridgeLiveCommand({
      type: "apply_audio_clip_action",
      clipId: placed.clipId,
      action: "analyze-transients"
    });
    app.state = analyzed;
    const warped = app.applyAiBridgeLiveCommand({
      type: "apply_audio_clip_action",
      clipId: placed.clipId,
      action: "create-warp-markers"
    });
    app.state = warped;
    const quantized = app.applyAiBridgeLiveCommand({
      type: "apply_audio_clip_action",
      clipId: placed.clipId,
      action: "quantize-warp-markers"
    });
    app.state = quantized;
    const moved = app.applyAiBridgeLiveCommand({
      type: "set_audio_warp_marker_target",
      clipId: placed.clipId,
      markerId: "warp_2",
      targetBar: 4.5
    });
    app.state = moved;
    const deleted = app.applyAiBridgeLiveCommand({
      type: "delete_audio_warp_marker",
      clipId: placed.clipId,
      markerId: "warp_1"
    });
    const media = deleted.undoStack.present.mediaPool.find((item) => item.id === imported.item.id)!;
    const clip = deleted.undoStack.present.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(analyzed.status).toContain("Detected 2 transient markers");
    expect(warped.status).toContain("Created 2 source-safe warp markers");
    expect(quantized.status).toContain("Quantized 2 warp marker targets");
    expect(moved.status).toContain("Moved warp marker warp_2");
    expect(deleted.status).toContain("Deleted warp marker warp_1");
    expect(media.metadata?.audioTransientMarkersSeconds).toEqual([1.5, 4.5]);
    expect(clip.metadata?.audioWarpReady).toBe(true);
    expect(clip.metadata?.audioWarpQuantizeGrid).toBeUndefined();
    expect(clip.metadata?.audioWarpPlaybackMode).toBe("metadata-only");
    expect(clip.metadata?.audioWarpMarkers).toEqual([
      expect.objectContaining({ id: "warp_2", sourceSeconds: 4.5, targetBar: 4.5, targetSeconds: 7 })
    ]);
    expect(deleted.selectedClipId).toBe(placed.clipId);
    expect(deleted.selectedTrackId).toBe(placed.trackId);
  });

  it("applies MIDI quantize, swing and groove edits through the live bridge executor", () => {
    let state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(createEmptyPocketDawProject(), parsed, "live-midi.mid");
    const project = addMidiNote(imported.project, imported.clipId, 181);
    state = {
      ...state,
      selectedClipId: imported.clipId,
      selectedTrackId: imported.trackId,
      undoStack: createUndoStack(project)
    };
    const app = appHarness(state);

    const quantized = app.applyAiBridgeLiveCommand({ type: "quantize_midi_clip", clipId: imported.clipId, grid: "1/16" });
    app.state = quantized;
    const lengths = app.applyAiBridgeLiveCommand({ type: "quantize_midi_durations", clipId: imported.clipId, grid: "1/8" });
    app.state = lengths;
    const swung = app.applyAiBridgeLiveCommand({ type: "swing_midi_clip", clipId: imported.clipId, percent: 60 });
    app.state = swung;
    const grooved = app.applyAiBridgeLiveCommand({ type: "apply_midi_groove", clipId: imported.clipId, templateId: "pocket-16" });
    const clip = grooved.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const midi = midiDataFromClip(clip);

    expect(quantized.status).toContain("Quantized live-midi.mid to 1/16");
    expect(lengths.status).toContain("Quantized live-midi.mid note lengths to 1/8");
    expect(swung.status).toContain("Applied 60% swing to live-midi.mid");
    expect(grooved.status).toContain("Applied Pocket 16 groove to live-midi.mid");
    expect(midi.metadata).toMatchObject({
      lastQuantizeGrid: "1/16",
      lastDurationQuantizeGrid: "1/8",
      lastSwingPercent: 50,
      lastGrooveTemplate: "pocket-16"
    });
    expect(grooved.selectedClipId).toBe(imported.clipId);
    expect(grooved.selectedTrackId).toBe(imported.trackId);
  });

  it("applies reversible audio clip actions through the live bridge executor", () => {
    let state = createInitialState();
    const project = createEmptyPocketDawProject();
    project.timeline.clips = [];
    const imported = addImportedAudioMedia(project, {
      name: "Live reverse.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state = {
      ...state,
      selectedClipId: placed.clipId,
      selectedTrackId: placed.trackId,
      undoStack: createUndoStack(placed.project)
    };
    const app = appHarness(state);

    const reversed = app.applyAiBridgeLiveCommand({
      type: "apply_audio_clip_action",
      clipId: placed.clipId,
      action: "reverse"
    });
    app.state = reversed;
    const restored = app.applyAiBridgeLiveCommand({
      type: "apply_audio_clip_action",
      clipId: placed.clipId,
      action: "reverse"
    });

    expect(reversed.status).toBe("Reversed Live reverse.wav.");
    expect(reversed.undoStack.present.timeline.clips.find((clip) => clip.id === placed.clipId)?.metadata?.reversed).toBe(true);
    expect(restored.status).toBe("Restored forward playback for Live reverse.wav.");
    expect(restored.undoStack.present.timeline.clips.find((clip) => clip.id === placed.clipId)?.metadata?.reversed).toBe(false);
  });

  it("places punch takes from the active range through the live bridge executor", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    const project = currentProject(state);
    const secondsPerBar = project.project.timeSig * (60 / project.project.bpm);
    const imported = addImportedAudioMedia(project, {
      name: "Live range punch.wav",
      uri: "project-media/recordings/live-range-punch.wav",
      mimeType: "audio/wav",
      durationSeconds: secondsPerBar * 4,
      sampleRate: 48000,
      channels: 1,
      metadata: {
        mediaRefKind: "project",
        recordingTakeId: "live-range-punch-take-1",
        recordingTakeGroupId: "live-range-punch-group",
        takeLaneId: "live-range-punch-group-lane-1"
      }
    });
    state = { ...state, undoStack: createUndoStack(imported.project) };
    const app = appHarness(state);

    const ranged = app.applyAiBridgeLiveCommand({
      type: "set_punch_range",
      startBar: 7,
      endBar: 9
    });
    app.state = ranged;
    const placed = app.applyAiBridgeLiveCommand({
      type: "place_punch_recording_clip_from_range",
      mediaPoolItemId: imported.item.id,
      trackId: "live-vocals",
      captureStartBar: 6
    });
    const punchClip = placed.undoStack.present.timeline.clips.find((clip) => clip.name === "Live range punch.wav");

    expect(placed.status).toBe("Placed punch take Live range punch.wav from active punch range 7 to 9.");
    expect(placed.undoStack.present.timeline.selection).toEqual({ startBar: 7, endBar: 9, source: "punch" });
    expect(punchClip).toMatchObject({ trackId: "live-vocals", startBar: 7, barLength: 2 });
    expect(punchClip?.metadata).toMatchObject({
      recordingTakeId: "live-range-punch-take-1",
      recordingTakeGroupId: "live-range-punch-group",
      punchStartBar: 7,
      punchEndBar: 9,
      captureStartBar: 6
    });
  });

  it("activates grouped audio take lanes through the live bridge executor", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    let project = currentProject(state);
    const firstImport = addImportedAudioMedia(project, {
      name: "Live take lane A.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-lane-switch" }
    });
    const firstLeft = placeAudioClipOnTrack(firstImport.project, firstImport.item.id, "live-vocals", 1);
    const firstRight = placeAudioClipOnTrack(firstLeft.project, firstImport.item.id, "live-vocals", 3);
    const secondImport = addImportedAudioMedia(firstRight.project, {
      name: "Live take lane B.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-lane-switch" }
    });
    const secondLeft = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, "live-vocals", 1);
    const secondRight = placeAudioClipOnTrack(secondLeft.project, secondImport.item.id, "live-vocals", 3);
    project = {
      ...secondRight.project,
      timeline: {
        ...secondRight.project.timeline,
        clips: secondRight.project.timeline.clips.map((clip) => {
          if (clip.id === firstLeft.clipId || clip.id === firstRight.clipId) {
            return { ...clip, muted: false, metadata: { ...(clip.metadata || {}), takeLaneId: "live-lane-a", takeLaneIndex: 1, takeStatus: "active", takeActive: true } };
          }
          if (clip.id === secondLeft.clipId || clip.id === secondRight.clipId) {
            return { ...clip, muted: true, metadata: { ...(clip.metadata || {}), takeLaneId: "live-lane-b", takeLaneIndex: 2, takeStatus: "muted-take", takeActive: false } };
          }
          return clip;
        })
      }
    };
    state = { ...state, selectedClipId: firstLeft.clipId, selectedTrackId: "live-vocals", undoStack: createUndoStack(project) };
    const app = appHarness(state);

    const next = app.applyAiBridgeLiveCommand({
      type: "activate_audio_take_lane",
      clipId: secondLeft.clipId
    });
    const byId = new Map(next.undoStack.present.timeline.clips.map((clip) => [clip.id, clip]));

    expect(next.status).toBe("Activated take lane live-lane-b for Live take lane B.wav.");
    expect(next.selectedClipId).toBe(secondLeft.clipId);
    expect([firstLeft.clipId, firstRight.clipId].map((id) => byId.get(id))).toEqual([
      expect.objectContaining({ muted: true, metadata: expect.objectContaining({ takeStatus: "muted-take", takeActive: false }) }),
      expect.objectContaining({ muted: true, metadata: expect.objectContaining({ takeStatus: "muted-take", takeActive: false }) })
    ]);
    expect([secondLeft.clipId, secondRight.clipId].map((id) => byId.get(id))).toEqual([
      expect.objectContaining({ muted: false, metadata: expect.objectContaining({ takeStatus: "active", takeActive: true }) }),
      expect.objectContaining({ muted: false, metadata: expect.objectContaining({ takeStatus: "active", takeActive: true }) })
    ]);
  });

  it("archives and restores grouped audio takes through the live bridge executor", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    let project = currentProject(state);
    const firstImport = addImportedAudioMedia(project, {
      name: "Live archive keep.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-archive-takes" }
    });
    const firstPlaced = placeAudioClipOnTrack(firstImport.project, firstImport.item.id, "live-vocals", 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Live archive maybe.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-archive-takes" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, "live-vocals", 2);
    project = activateAudioTake(secondPlaced.project, firstPlaced.clipId).project;
    state = { ...state, selectedClipId: firstPlaced.clipId, selectedTrackId: "live-vocals", undoStack: createUndoStack(project) };
    const app = appHarness(state);

    const archived = app.applyAiBridgeLiveCommand({
      type: "set_audio_take_archived",
      clipId: secondPlaced.clipId,
      archived: true
    });
    app.state = archived;
    const restored = app.applyAiBridgeLiveCommand({
      type: "set_audio_take_archived",
      clipId: secondPlaced.clipId,
      archived: false
    });
    const archivedClip = archived.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;
    const restoredClip = restored.undoStack.present.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;

    expect(archived.status).toContain("Archived Live archive maybe.wav");
    expect(archivedClip).toMatchObject({ muted: true, metadata: expect.objectContaining({ takeStatus: "archived-take", takeActive: false }) });
    expect(archived.undoStack.present.mediaPool.find((item) => item.id === secondImport.item.id)).toBeTruthy();
    expect(restored.status).toContain("Restored Live archive maybe.wav");
    expect(restoredClip).toMatchObject({ muted: true, metadata: expect.objectContaining({ takeStatus: "muted-take", takeActive: false }) });
    expect(restored.selectedClipId).toBe(secondPlaced.clipId);
  });

  it("comps grouped audio takes from an explicit bar through the live bridge executor", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    let project = currentProject(state);
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const firstImport = addImportedAudioMedia(project, {
      name: "Live comp take 1.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-comp-takes" }
    });
    const firstPlaced = placeAudioClipOnTrack(firstImport.project, firstImport.item.id, "live-vocals", 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Live comp take 2.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-comp-takes" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, "live-vocals", 2);
    project = activateAudioTake(secondPlaced.project, firstPlaced.clipId).project;
    state = { ...state, selectedClipId: firstPlaced.clipId, selectedTrackId: "live-vocals", undoStack: createUndoStack(project) };
    const app = appHarness(state);

    const edited = app.applyAiBridgeLiveCommand({
      type: "comp_audio_take_from_bar",
      clipId: secondPlaced.clipId,
      bar: 4
    });
    const clips = edited.undoStack.present.timeline.clips.filter((clip) => clip.metadata?.takeGroupId === "live-comp-takes");
    const secondRight = clips.find((clip) => clip.name === "Live comp take 2.wav split")!;
    const firstRight = clips.find((clip) => clip.name === "Live comp take 1.wav split")!;

    expect(edited.status).toContain("Comped Live comp take 2.wav split from bar 4");
    expect(clips).toHaveLength(4);
    expect(firstRight).toMatchObject({ startBar: 4, muted: true, metadata: expect.objectContaining({ takeStatus: "muted-take", sourceOffsetSeconds: 4 }) });
    expect(secondRight).toMatchObject({ startBar: 4, muted: false, metadata: expect.objectContaining({ takeStatus: "active", sourceOffsetSeconds: 4 }) });
    expect(edited.selectedClipId).toBe(secondRight.id);
  });

  it("uses timeline audio sync for live bridge commands that change clips", () => {
    let state = addTrackCommand(createInitialState(), "live-vocals");
    let project = currentProject(state);
    const firstImport = addImportedAudioMedia(project, {
      name: "Live sync lane A.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-sync-lane" }
    });
    const firstLeft = placeAudioClipOnTrack(firstImport.project, firstImport.item.id, "live-vocals", 1);
    const secondImport = addImportedAudioMedia(firstLeft.project, {
      name: "Live sync lane B.wav",
      durationSeconds: 8,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "live-sync-lane" }
    });
    const secondLeft = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, "live-vocals", 1);
    project = {
      ...secondLeft.project,
      timeline: {
        ...secondLeft.project.timeline,
        clips: secondLeft.project.timeline.clips.map((clip) => {
          if (clip.id === firstLeft.clipId) {
            return { ...clip, muted: false, metadata: { ...(clip.metadata || {}), takeLaneId: "live-sync-a", takeStatus: "active", takeActive: true } };
          }
          if (clip.id === secondLeft.clipId) {
            return { ...clip, muted: true, metadata: { ...(clip.metadata || {}), takeLaneId: "live-sync-b", takeStatus: "muted-take", takeActive: false } };
          }
          return clip;
        })
      }
    };
    state = { ...state, undoStack: createUndoStack(project) };
    const app = appHarness(state) as ReturnType<typeof appHarness> & {
      applyProjectState(next: AppState, options: { audio?: string }): void;
    };
    const syncModes: string[] = [];
    app.applyProjectState = (next, options) => {
      app.state = next;
      syncModes.push(options.audio || "");
    };

    app.applyAiBridgeLiveCommands([
      { type: "activate_audio_take_lane", clipId: secondLeft.clipId },
      { type: "set_audio_take_archived", clipId: firstLeft.clipId, archived: true },
      { type: "comp_audio_take_from_bar", clipId: secondLeft.clipId, bar: 1.5 }
    ]);

    expect(syncModes).toEqual(["timeline-structure", "timeline-structure", "timeline-structure"]);
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
    expect(status.capabilities.liveCommands).toContain("set_recording_latency_offset");
    expect(status.capabilities.liveCommands).toContain("set_recording_input_channel");
    expect(status.capabilities.liveCommands).toContain("set_punch_range");
    expect(status.capabilities.liveCommands).toContain("set_timeline_selection");
    expect(status.capabilities.liveCommands).toContain("set_timeline_selection_to_clip");
    expect(status.capabilities.liveCommands).toContain("clear_timeline_selection");
    expect(status.capabilities.liveCommands).toContain("split_timeline_selection");
    expect(status.capabilities.liveCommands).toContain("crop_clip_to_timeline_selection");
    expect(status.capabilities.liveCommands).toContain("delete_clip_range");
    expect(status.capabilities.liveCommands).toContain("ripple_delete_clip_range");
    expect(status.capabilities.liveCommands).toContain("ripple_delete_timeline_selection");
    expect(status.capabilities.liveCommands).toContain("apply_audio_clip_action");
    expect(status.capabilities.liveCommands).toContain("quantize_midi_clip");
    expect(status.capabilities.liveCommands).toContain("quantize_midi_durations");
    expect(status.capabilities.liveCommands).toContain("swing_midi_clip");
    expect(status.capabilities.liveCommands).toContain("apply_midi_groove");
    expect(status.capabilities.liveCommands).toContain("place_punch_recording_clip_from_range");
    expect(status.capabilities.liveCommands).toContain("activate_audio_take_lane");
    expect(status.capabilities.liveCommands).toContain("set_audio_take_archived");
    expect(status.capabilities.liveCommands).toContain("comp_audio_take_from_bar");
    expect(status.capabilities.liveCommands).toContain("comp_audio_take_range");
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
          groups: Array<{
            groupId: string;
            clipCount: number;
            activeCount: number;
            archivedCount: number;
            lanes: Array<{
              laneId: string;
              clipIds: string[];
              clipNames: string[];
              activeClipIds: string[];
              activeCount: number;
              archivedCount: number;
            }>;
          }>;
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
        groups: [{
          groupId: "live-status-takes-a",
          clipCount: 2,
          activeCount: 1,
          archivedCount: 1,
          lanes: [
            {
              laneId: "live-status-takes-a-lane-1",
              clipIds: [firstPlaced.clipId],
              clipNames: ["Live take 1.wav"],
              activeClipIds: [],
              activeCount: 0,
              archivedCount: 1
            },
            {
              laneId: "live-status-takes-a-lane-2",
              clipIds: [secondPlaced.clipId],
              clipNames: ["Live take 2.wav"],
              activeClipIds: [secondPlaced.clipId],
              activeCount: 1,
              archivedCount: 0
            }
          ]
        }]
      }
    });
  });
});
