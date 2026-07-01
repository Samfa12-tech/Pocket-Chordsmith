import { describe, expect, it } from "vitest";
import { addEmptyMidiClipCommand, addTrackCommand, setTrackFolderCommand, setTrackInputCommand, setTrackRecordingChannelModeCommand, toggleFolderExpandedCommand, toggleTrackArmedCommand, toggleTrackMonitorCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { toggleTrackMute, toggleTrackSolo } from "../src/daw/mixer";
import { midiDataFromClip } from "../src/daw/midiClips";
import { addTrackToProject, setTrackFolder, toggleFolderExpanded, trackIsAudible } from "../src/daw/tracks";
import { createDemoProject } from "../src/demo/demoProject";

describe("track workflow", () => {
  it("adds record-capable live audio tracks with FX chains", () => {
    const result = addTrackToProject(createDemoProject(), "live-vocals");
    const track = result.project.tracks.find((item) => item.id === result.trackId);

    expect(track?.name).toBe("Live Vocals");
    expect(track?.trackType).toBe("audio");
    expect(track?.recordKind).toBe("live-vocals");
    expect(track?.inputDeviceId).toBeNull();
    expect(track?.monitorEnabled).toBe(false);
    expect(track?.recordingChannelMode).toBe("mono");
    expect(result.project.fx.chains.some((chain) => chain.id === track?.fxChainId)).toBe(true);
  });

  it("reactivates an existing Chordsmith instrument instead of duplicating it", () => {
    const project = createDemoProject();
    const guitar = project.tracks.find((track) => track.role === "guitar");
    if (guitar) {
      guitar.active = false;
      guitar.mute = true;
    }

    const result = addTrackToProject(project, "chordsmith-guitar");
    const guitars = result.project.tracks.filter((track) => track.role === "guitar");

    expect(guitars).toHaveLength(1);
    expect(guitars[0].active).toBe(true);
    expect(guitars[0].mute).toBe(false);
  });

  it("adds first-class MIDI instrument tracks with FX chains", () => {
    const result = addTrackToProject(createDemoProject(), "midi-instrument");
    const track = result.project.tracks.find((item) => item.id === result.trackId);

    expect(track?.name).toBe("MIDI Instrument");
    expect(track?.trackType).toBe("midi");
    expect(track?.role).toBe("media");
    expect(track?.recordKind).toBe("none");
    expect(track?.routing.outputId).toBe("master");
    expect(result.project.fx.chains.some((chain) => chain.id === track?.fxChainId)).toBe(true);
  });

  it("adds organizational folder tracks without fake audio routing", () => {
    const result = addTrackToProject(createDemoProject(), "folder");
    const track = result.project.tracks.find((item) => item.id === result.trackId);

    expect(track?.name).toBe("Folder");
    expect(track?.trackType).toBe("folder");
    expect(track?.role).toBe("folder");
    expect(track?.routing.outputId).toBeNull();
    expect(track?.routing.sendIds).toEqual([]);
    expect(track?.fxChainId).toBeUndefined();
    expect(track?.metadata).toMatchObject({ folderExpanded: true, folderMode: "organizational" });
    expect(result.project.fx.chains.some((chain) => chain.ownerTrackId === track?.id || chain.id === track?.fxChainId)).toBe(false);
  });

  it("assigns timeline tracks to folders and toggles folder collapse state", () => {
    const withFolder = addTrackToProject(createDemoProject(), "folder");
    const assigned = setTrackFolder(withFolder.project, "bass", withFolder.trackId);
    const collapsed = toggleFolderExpanded(assigned, withFolder.trackId);

    expect(assigned.tracks.find((track) => track.id === "bass")?.folderId).toBe(withFolder.trackId);
    expect(collapsed.tracks.find((track) => track.id === withFolder.trackId)?.metadata?.folderExpanded).toBe(false);
    expect(setTrackFolder(assigned, withFolder.trackId, withFolder.trackId)).toBe(assigned);
    expect(setTrackFolder(assigned, "bass", "missing-folder")).not.toBe(assigned);
    expect(setTrackFolder(assigned, "bass", "missing-folder").tracks.find((track) => track.id === "bass")?.folderId).toBeNull();
  });

  it("records folder assignment and collapse changes in undo history", () => {
    const withFolder = addTrackCommand(createInitialState(), "folder");
    const assigned = setTrackFolderCommand(withFolder, "bass", withFolder.selectedTrackId || "");
    const collapsed = toggleFolderExpandedCommand(assigned, withFolder.selectedTrackId || "");

    expect(assigned.undoStack.past.length).toBe(withFolder.undoStack.past.length + 1);
    expect(assigned.undoStack.present.tracks.find((track) => track.id === "bass")?.folderId).toBe(withFolder.selectedTrackId);
    expect(collapsed.undoStack.past.length).toBe(assigned.undoStack.past.length + 1);
    expect(collapsed.undoStack.present.tracks.find((track) => track.id === withFolder.selectedTrackId)?.metadata?.folderExpanded).toBe(false);
  });

  it("uses folder mute and solo as child group controls", () => {
    const withFolder = addTrackToProject(createDemoProject(), "folder");
    const assigned = setTrackFolder(withFolder.project, "bass", withFolder.trackId);
    const folderMuted = toggleTrackMute(assigned, withFolder.trackId);
    const folderSoloed = toggleTrackSolo(assigned, withFolder.trackId);

    const mutedBass = folderMuted.tracks.find((track) => track.id === "bass")!;
    const mutedDrums = folderMuted.tracks.find((track) => track.id === "drums")!;
    const soloedBass = folderSoloed.tracks.find((track) => track.id === "bass")!;
    const soloedDrums = folderSoloed.tracks.find((track) => track.id === "drums")!;

    expect(folderMuted.tracks.find((track) => track.id === withFolder.trackId)?.mute).toBe(true);
    expect(trackIsAudible(mutedBass, folderMuted.tracks)).toBe(false);
    expect(trackIsAudible(mutedDrums, folderMuted.tracks)).toBe(true);
    expect(folderSoloed.tracks.find((track) => track.id === withFolder.trackId)?.solo).toBe(true);
    expect(trackIsAudible(soloedBass, folderSoloed.tracks)).toBe(true);
    expect(trackIsAudible(soloedDrums, folderSoloed.tracks)).toBe(false);
  });

  it("ignores mute and solo commands for FX Return and Master", () => {
    const project = addTrackToProject(createDemoProject(), "folder").project;
    const muted = toggleTrackMute(toggleTrackMute(project, "fx-return"), "master");
    const soloed = toggleTrackSolo(toggleTrackSolo(project, "fx-return"), "master");

    expect(muted.tracks.find((track) => track.id === "fx-return")?.mute).toBe(false);
    expect(muted.tracks.find((track) => track.id === "master")?.mute).toBe(false);
    expect(soloed.tracks.find((track) => track.id === "fx-return")?.solo).toBe(false);
    expect(soloed.tracks.find((track) => track.id === "master")?.solo).toBe(false);
  });

  it("records Add Track changes in undo history", () => {
    const state = createInitialState();
    const next = addTrackCommand(state, "live-instrument");

    expect(next.undoStack.past.length).toBe(state.undoStack.past.length + 1);
    expect(next.selectedTrackId).toBe("live-instrument");
    expect(next.undoStack.present.tracks.some((track) => track.id === "live-instrument")).toBe(true);
  });

  it("adds empty MIDI clips to the selected MIDI track", () => {
    const withMidiTrack = addTrackCommand(createInitialState(), "midi-instrument");
    const next = addEmptyMidiClipCommand(withMidiTrack, withMidiTrack.selectedTrackId || "", 3);
    const clip = next.undoStack.present.timeline.clips.find((item) => item.id === next.selectedClipId);

    expect(next.undoStack.past.length).toBe(withMidiTrack.undoStack.past.length + 1);
    expect(next.lowerDockTab).toBe("piano-roll");
    expect(clip).toMatchObject({
      type: "midi",
      trackId: withMidiTrack.selectedTrackId,
      startBar: 3,
      barLength: 1
    });
    expect(clip?.mediaPoolItemId).toBeUndefined();
    expect(midiDataFromClip(clip!).notes).toEqual([]);
    expect(midiDataFromClip(clip!).metadata).toMatchObject({ source: "empty-midi-clip", createdInPocketDaw: true });
  });

  it("rejects empty MIDI clip creation when the selected track is not MIDI", () => {
    const state = createInitialState();
    const next = addEmptyMidiClipCommand(state, "bass", 1);

    expect(next.undoStack.present).toBe(state.undoStack.present);
    expect(next.status).toContain("Select a MIDI track");
  });

  it("arms one live audio track and toggles monitor state", () => {
    const state = addTrackCommand(createInitialState(), "live-vocals");
    const next = toggleTrackArmedCommand(state, "live-vocals");
    const monitored = toggleTrackMonitorCommand(next, "live-vocals");

    expect(next.undoStack.present.tracks.find((track) => track.id === "live-vocals")?.armed).toBe(true);
    expect(next.status).toContain("Armed Live Vocals");
    expect(monitored.undoStack.present.tracks.find((track) => track.id === "live-vocals")?.monitorEnabled).toBe(true);
    expect(monitored.status).toContain("monitor on");
  });

  it("keeps only one live audio track armed at a time", () => {
    const withVocals = addTrackCommand(createInitialState(), "live-vocals");
    const withInstrument = addTrackCommand(withVocals, "live-instrument");
    const vocalsArmed = toggleTrackArmedCommand(withInstrument, "live-vocals");
    const instrumentArmed = toggleTrackArmedCommand(vocalsArmed, "live-instrument");

    expect(instrumentArmed.undoStack.present.tracks.find((track) => track.id === "live-vocals")?.armed).toBe(false);
    expect(instrumentArmed.undoStack.present.tracks.find((track) => track.id === "live-instrument")?.armed).toBe(true);
  });

  it("sets recording channel mode only on live audio tracks", () => {
    const state = addTrackCommand(createInitialState(), "live-instrument");
    const stereo = setTrackRecordingChannelModeCommand(state, "live-instrument", "stereo");
    const rejected = setTrackRecordingChannelModeCommand(stereo, "drums", "stereo");

    expect(stereo.undoStack.present.tracks.find((track) => track.id === "live-instrument")?.recordingChannelMode).toBe("stereo");
    expect(stereo.status).toContain("recording set to stereo");
    expect(rejected.undoStack.present.tracks.find((track) => track.id === "drums")?.recordingChannelMode).toBe("mono");
    expect(rejected.status).toContain("Only live audio tracks");
  });

  it("keeps explicit recording input assignment metadata in sync with live track input controls", () => {
    const state = addTrackCommand(createInitialState(), "live-instrument");
    const withInput = setTrackInputCommand(state, "live-instrument", "interface-8");
    const stereo = setTrackRecordingChannelModeCommand(withInput, "live-instrument", "stereo");
    const track = stereo.undoStack.present.tracks.find((item) => item.id === "live-instrument");

    expect(track?.inputDeviceId).toBe("interface-8");
    expect(track?.recordingInput).toMatchObject({
      deviceId: "interface-8",
      mode: "stereo",
      channelPair: [0, 1]
    });
  });
});
