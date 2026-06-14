import { describe, expect, it } from "vitest";
import { addTrackCommand, toggleTrackArmedCommand, toggleTrackMonitorCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { toggleTrackMute, toggleTrackSolo } from "../src/daw/mixer";
import { addTrackToProject } from "../src/daw/tracks";
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

  it("ignores mute and solo commands for FX Return and Master", () => {
    const project = createDemoProject();
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
});
