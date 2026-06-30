import { describe, expect, it } from "vitest";
import { addTrackSendAutomationPointCommand, ensureTrackSendAutomationLaneCommand, setTrackSendLevelCommand, setTrackSendModeCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { createDemoProject } from "../src/demo/demoProject";
import { addReturnTrack } from "../src/daw/routing";
import { createUndoStack } from "../src/daw/undo";

describe("routing commands", () => {
  it("sets selected track send levels through the undoable command path", () => {
    const withReturn = addReturnTrack(createDemoProject(), "Verb Return");
    const state = createInitialState();
    state.undoStack = createUndoStack(withReturn.project);
    state.selectedTrackId = "bass";

    const edited = setTrackSendLevelCommand(state, "bass", withReturn.trackId, 0.42);
    const bass = edited.undoStack.present.tracks.find((track) => track.id === "bass")!;

    expect(bass.metadata?.sendLevels).toMatchObject({ [withReturn.trackId]: 0.42 });
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedTrackId).toBe("bass");
    expect(edited.status).toContain("Set Bass send to Verb Return");
  });

  it("guards send edits without a source track and return track", () => {
    const state = createInitialState();

    const edited = setTrackSendLevelCommand(state, "missing", "missing-return", 0.5);

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a source track and return");
  });

  it("sets selected track send modes through the undoable command path", () => {
    const withReturn = addReturnTrack(createDemoProject(), "Verb Return");
    const state = createInitialState();
    state.undoStack = createUndoStack(withReturn.project);
    state.selectedTrackId = "bass";

    const edited = setTrackSendModeCommand(state, "bass", withReturn.trackId, "post-fader");
    const bass = edited.undoStack.present.tracks.find((track) => track.id === "bass")!;

    expect(bass.metadata?.sendModes).toMatchObject({ [withReturn.trackId]: "post-fader" });
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedTrackId).toBe("bass");
    expect(edited.status).toContain("post-fader");
  });

  it("creates selected track send automation through the undoable command path", () => {
    const withReturn = addReturnTrack(createDemoProject(), "Verb Return");
    const state = createInitialState();
    state.undoStack = createUndoStack(withReturn.project);
    state.selectedTrackId = "bass";
    state.playheadBar = 4;

    const created = ensureTrackSendAutomationLaneCommand(state, "bass", withReturn.trackId, "level");
    const withPoint = addTrackSendAutomationPointCommand(created, "bass", withReturn.trackId, "level");
    const bass = withPoint.undoStack.present.tracks.find((track) => track.id === "bass")!;
    const lane = withPoint.undoStack.present.automation.lanes.find((item) => item.targetPath === `tracks.bass.sends.${withReturn.trackId}.level`)!;

    expect(lane.points.some((point) => point.bar === 4)).toBe(true);
    expect(bass.automationLaneIds).toContain(lane.id);
    expect(withPoint.undoStack.past.length).toBeGreaterThanOrEqual(2);
    expect(withPoint.status).toContain("send automation point");
  });
});
