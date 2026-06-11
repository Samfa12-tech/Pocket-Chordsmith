import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { addAutomationPoint, createAutomationLane, deleteAutomationPoint, evaluateAutomationLane, getAutomatedTrackControls, updateAutomationPoint } from "../src/daw/automation";

describe("automation helpers", () => {
  it("creates, evaluates, updates and deletes clamped automation points", () => {
    const project = createDemoProject();
    const created = createAutomationLane(project, "tracks.bass.volume", {
      min: 0,
      max: 1.2,
      points: [
        { bar: 1, value: 0.5, curve: "linear" },
        { bar: 3, value: 1.5, curve: "linear" }
      ]
    });
    const lane = created.project.automation.lanes.find((item) => item.id === created.laneId)!;

    expect(lane.points[1].value).toBe(1.2);
    expect(evaluateAutomationLane(lane, 2, 1)).toBeCloseTo(0.85, 5);
    expect(created.project.tracks.find((track) => track.id === "bass")?.automationLaneIds).toContain(created.laneId);

    const withPoint = addAutomationPoint(created.project, created.laneId, { bar: 4, value: 0.25, curve: "hold" });
    expect(withPoint.automation.lanes.find((item) => item.id === created.laneId)?.points).toHaveLength(3);

    const updated = updateAutomationPoint(withPoint, created.laneId, 2, { bar: 5, value: 0.75 });
    expect(updated.automation.lanes.find((item) => item.id === created.laneId)?.points[2]).toMatchObject({ bar: 5, value: 0.75 });

    const deleted = deleteAutomationPoint(updated, created.laneId, 1);
    expect(deleted.automation.lanes.find((item) => item.id === created.laneId)?.points).toHaveLength(2);
  });

  it("applies volume automation as a multiplier and pan automation as an override", () => {
    let project = createDemoProject();
    project = createAutomationLane(project, "tracks.bass.volume", { points: [{ bar: 1, value: 0.5 }, { bar: 2, value: 1 }] }).project;
    project = createAutomationLane(project, "tracks.bass.pan", { min: -1, max: 1, points: [{ bar: 1, value: -0.5 }, { bar: 2, value: 0.5 }] }).project;

    const bass = project.tracks.find((track) => track.id === "bass")!;
    const controls = getAutomatedTrackControls(project, bass, 1.5);

    expect(controls.volume).toBeCloseTo(bass.volume * 0.75, 5);
    expect(controls.pan).toBeCloseTo(0, 5);
  });
});
