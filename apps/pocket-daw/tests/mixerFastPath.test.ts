import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { setTrackPanCommand, setTrackVolumeCommand, toggleTrackMuteCommand, toggleTrackSoloCommand } from "../src/app/commands";
import { createInitialState, currentProject } from "../src/app/state";

describe("mixer fast path", () => {
  it("keeps live mixer previews out of undo history until final commit", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));

    engine.updateTrackMixerControl("bass", { pan: -1 });
    engine.updateTrackMixerControl("bass", { pan: 1 });
    engine.updateTrackMixerControl("bass", { pan: -0.25 });

    expect(state.undoStack.past).toHaveLength(0);
    expect(currentProject(state).tracks.find((track) => track.id === "bass")?.pan).toBe(0);
    expect(engine.getDiagnostics().mixerControls.find((track) => track.id === "bass")?.pan).toBe(-0.25);

    const committed = setTrackPanCommand(state, "bass", -0.25);
    const bass = committed.undoStack.present.tracks.find((track) => track.id === "bass");

    expect(committed.undoStack.past).toHaveLength(1);
    expect(committed.undoStack.future).toHaveLength(0);
    expect(bass?.pan).toBe(-0.25);
  });

  it("commits volume once after live preview changes", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));

    engine.updateTrackMixerControl("bass", { volume: 0.2 });
    engine.updateTrackMixerControl("bass", { volume: 0.95 });

    expect(currentProject(state).tracks.find((track) => track.id === "bass")?.volume).toBe(0.86);
    expect(engine.getDiagnostics().mixerControls.find((track) => track.id === "bass")?.volume).toBe(0.95);

    const committed = setTrackVolumeCommand(state, "bass", 0.95);
    const bass = committed.undoStack.present.tracks.find((track) => track.id === "bass");

    expect(committed.undoStack.past).toHaveLength(1);
    expect(bass?.volume).toBe(0.95);
  });

  it("keeps mute and solo on the mixer fast path until their single click commits", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));
    const before = engine.getDiagnostics();

    const mutedState = toggleTrackMuteCommand(state, "chords");
    const mutedTrack = currentProject(mutedState).tracks.find((track) => track.id === "chords");
    engine.updateTrackMixerControl("chords", { mute: mutedTrack?.mute === true });
    const afterMute = engine.getDiagnostics();

    expect(currentProject(state).tracks.find((track) => track.id === "chords")?.mute).toBe(false);
    expect(mutedState.undoStack.past).toHaveLength(1);
    expect(afterMute.eventCount).toBe(before.eventCount);
    expect(afterMute.timelineClipCount).toBe(before.timelineClipCount);
    expect(afterMute.sourceRefTitles).toEqual(before.sourceRefTitles);
    expect(afterMute.chordsmithSectionCount).toBe(before.chordsmithSectionCount);
    expect(afterMute.mixerControls.find((track) => track.id === "chords")).toMatchObject({ mute: true, solo: false });

    const soloedState = toggleTrackSoloCommand(mutedState, "bass");
    const soloedTrack = currentProject(soloedState).tracks.find((track) => track.id === "bass");
    engine.updateTrackMixerControl("bass", { solo: soloedTrack?.solo === true });
    const afterSolo = engine.getDiagnostics();

    expect(soloedState.undoStack.past).toHaveLength(2);
    expect(afterSolo.eventCountsByTrack).toEqual(before.eventCountsByTrack);
    expect(afterSolo.projectTitle).toBe("Pocket DAW Demo - Neon Roads");
    expect(afterSolo.mixerControls.find((track) => track.id === "bass")).toMatchObject({ mute: false, solo: true });
  });
});
