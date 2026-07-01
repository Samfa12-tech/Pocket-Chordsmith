import { describe, expect, it } from "vitest";
import { addAutomationPointsToLaneCommand, addAutomationPointToLaneCommand, addProjectAutomationPointCommand, addProjectMeterMapPointCommand, addTrackSendAutomationPointCommand, deleteProjectMeterMapPointCommand, ensureAutomationLaneCommand, ensureProjectAutomationLaneCommand, ensureTrackSendAutomationLaneCommand, moveClipToBarCommand, moveSelectedClipBySnap, recordTrackAutomationPointCommand, recordTrackSendAutomationPointCommand, setTrackSendLevelCommand, setTrackSendModeCommand, updateAutomationPointCommand, updateProjectMeterMapPointCommand } from "../src/app/commands";
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

  it("records live send automation into an existing send lane", () => {
    const withReturn = addReturnTrack(createDemoProject(), "Verb Return");
    const state = createInitialState();
    state.undoStack = createUndoStack(withReturn.project);
    state.playheadBar = 7;
    const created = ensureTrackSendAutomationLaneCommand(state, "bass", withReturn.trackId, "level");

    const recorded = recordTrackSendAutomationPointCommand(created, "bass", withReturn.trackId, "level", 0.37);
    const lane = recorded.undoStack.present.automation.lanes.find((item) => item.targetPath === `tracks.bass.sends.${withReturn.trackId}.level`)!;

    expect(lane.points).toContainEqual(expect.objectContaining({ bar: 7, value: 0.37, curve: "linear" }));
    expect(recorded.undoStack.past.length).toBe(created.undoStack.past.length + 1);
    expect(recorded.status).toContain("Recorded Bass send automation point");
  });

  it("creates project tempo automation through the undoable command path", () => {
    const state = createInitialState();
    state.playheadBar = 6;
    state.undoStack.present.project.bpm = 132;

    const created = ensureProjectAutomationLaneCommand(state, "tempo");
    const withPoint = addProjectAutomationPointCommand(created, "tempo");
    const lane = withPoint.undoStack.present.automation.lanes.find((item) => item.targetPath === "project.tempo")!;

    expect(lane).toBeTruthy();
    expect(lane.points).toEqual([
      expect.objectContaining({ bar: 1, value: 132 }),
      expect.objectContaining({ bar: 6, value: 132 })
    ]);
    expect(withPoint.undoStack.past.length).toBeGreaterThanOrEqual(2);
    expect(withPoint.status).toContain("project tempo automation point");
  });

  it("updates automation point curves through the undoable command path", () => {
    const state = createInitialState();
    state.playheadBar = 6;
    state.undoStack.present.project.bpm = 132;

    const created = ensureProjectAutomationLaneCommand(state, "tempo");
    const withPoint = addProjectAutomationPointCommand(created, "tempo");
    const edited = updateAutomationPointCommand(withPoint, "auto_project_tempo", 1, 7, 118, "ease-out");
    const reset = updateAutomationPointCommand(edited, "auto_project_tempo", 1, 7, 118, "unexpected");
    const lane = edited.undoStack.present.automation.lanes.find((item) => item.targetPath === "project.tempo")!;
    const resetLane = reset.undoStack.present.automation.lanes.find((item) => item.targetPath === "project.tempo")!;

    expect(lane.points[1]).toMatchObject({ bar: 7, value: 118, curve: "ease-out" });
    expect(resetLane.points[1]).toMatchObject({ bar: 7, value: 118, curve: "linear" });
    expect(edited.undoStack.past.length).toBeGreaterThanOrEqual(3);
    expect(edited.status).toContain("Updated automation point");
  });

  it("adds, edits and deletes project meter-map points through the undoable command path", () => {
    const state = createInitialState();
    state.playheadBar = 3.25;
    state.undoStack.present.project.timeSig = 5;

    const added = addProjectMeterMapPointCommand(state);
    const point = added.undoStack.present.project.meterMap?.[0]!;
    const updated = updateProjectMeterMapPointCommand(added, point.id, { bar: 4.5, numerator: 7, denominator: 8 });
    const deleted = deleteProjectMeterMapPointCommand(updated, point.id);

    expect(point).toMatchObject({ bar: 3.25, numerator: 5, denominator: 4, source: "manual" });
    expect(updated.undoStack.present.project.meterMap?.[0]).toMatchObject({ bar: 4.5, numerator: 7, denominator: 8, source: "manual" });
    expect(deleted.undoStack.present.project.meterMap).toEqual([]);
    expect(added.status).toContain("Added project meter 5/4 at Bar 3.25");
    expect(updated.status).toContain("Updated project meter 7/8 at Bar 4.5");
    expect(deleted.status).toContain("Deleted project meter 7/8 at Bar 4.5");
  });

  it("uses project meter-map beat snap for command-path clip moves", () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    project.project.meterMap = [
      { id: "meter_2", bar: 2, numerator: 7, denominator: 8, source: "manual" }
    ];
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.snapMode = "beat";
    state.selectedClipId = clip.id;

    const moved = moveClipToBarCommand(state, clip.id, 2.37);
    const nudged = moveSelectedClipBySnap(moved, 1);

    expect(moved.undoStack.present.timeline.clips.find((item) => item.id === clip.id)?.startBar).toBeCloseTo(2 + 3 / 7, 6);
    expect(nudged.undoStack.present.timeline.clips.find((item) => item.id === clip.id)?.startBar).toBeCloseTo(2 + 4 / 7, 6);
  });

  it("adds drawn automation points directly to an existing lane", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 132;
    const created = ensureProjectAutomationLaneCommand(state, "tempo");

    const drawn = addAutomationPointToLaneCommand(created, "auto_project_tempo", 4.25, 142, "ease-in");
    const lane = drawn.undoStack.present.automation.lanes.find((item) => item.id === "auto_project_tempo")!;

    expect(lane.points).toContainEqual(expect.objectContaining({ bar: 4.25, value: 142, curve: "ease-in" }));
    expect(drawn.undoStack.past.length).toBeGreaterThanOrEqual(2);
    expect(drawn.status).toContain("drawn automation point");
  });

  it("adds drag-drawn automation points as one undoable command", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 132;
    const created = ensureProjectAutomationLaneCommand(state, "tempo");

    const drawn = addAutomationPointsToLaneCommand(created, "auto_project_tempo", [
      { bar: 2, value: 136 },
      { bar: 3.5, value: 144, curve: "ease-out" },
      { bar: 5, value: 120, curve: "unexpected" }
    ]);
    const lane = drawn.undoStack.present.automation.lanes.find((item) => item.id === "auto_project_tempo")!;

    expect(lane.points).toContainEqual(expect.objectContaining({ bar: 2, value: 136, curve: "linear" }));
    expect(lane.points).toContainEqual(expect.objectContaining({ bar: 3.5, value: 144, curve: "ease-out" }));
    expect(lane.points).toContainEqual(expect.objectContaining({ bar: 5, value: 120, curve: "linear" }));
    expect(drawn.undoStack.past.length).toBe(created.undoStack.past.length + 1);
    expect(drawn.status).toContain("3 drawn automation points");
  });

  it("records live track mixer automation into existing lanes", () => {
    const state = createInitialState();
    state.playheadBar = 8;
    state.undoStack.present.tracks.find((track) => track.id === "bass")!.volume = 0.8;
    const volumeLane = ensureAutomationLaneCommand(state, "bass", "volume");
    const panLane = ensureAutomationLaneCommand(volumeLane, "bass", "pan");

    const recordedVolume = recordTrackAutomationPointCommand(panLane, "bass", "volume", 0.4);
    const recordedPan = recordTrackAutomationPointCommand(recordedVolume, "bass", "pan", -0.35, 9);
    const volume = recordedPan.undoStack.present.automation.lanes.find((lane) => lane.targetPath === "tracks.bass.volume")!;
    const pan = recordedPan.undoStack.present.automation.lanes.find((lane) => lane.targetPath === "tracks.bass.pan")!;

    expect(volume.points).toContainEqual(expect.objectContaining({ bar: 8, value: 0.5, curve: "linear" }));
    expect(pan.points).toContainEqual(expect.objectContaining({ bar: 9, value: -0.35, curve: "linear" }));
    expect(recordedPan.undoStack.present.tracks.find((track) => track.id === "bass")?.volume).toBe(0.8);
    expect(recordedPan.status).toContain("Recorded Bass pan automation point");
  });

  it("does not record live mixer automation without a prepared lane", () => {
    const state = createInitialState();

    expect(recordTrackAutomationPointCommand(state, "bass", "volume", 0.4)).toBe(state);
  });
});
