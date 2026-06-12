import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { setTrackPanCommand, setTrackVolumeCommand } from "../src/app/commands";
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
});
