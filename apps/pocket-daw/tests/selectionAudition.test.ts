import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { selectionAuditionPlan } from "../src/daw/selectionAudition";
import { createAutomationLane } from "../src/daw/automation";

describe("selection audition monitor plan", () => {
  it("uses explicit range precedence, visible context and tails without changing the project", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.automation.lanes = project.automation.lanes.filter(lane => lane.targetPath !== "project.tempo");
    project.project.meterMap = [];
    project.timeline.selection = { startBar: 3, endBar: 5, source: "manual" };
    const before = structuredClone(project);
    expect(selectionAuditionPlan(project, [project.timeline.clips[0].id])).toMatchObject({ label: "Edit range", startSeconds: 3.5, endSeconds: 9, leadInSeconds: 0.5, tailSeconds: 1 });
    expect(project).toEqual(before);
  });

  it("bounds the span of selected clips including gaps and clamps lead-in only at time zero", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.automation.lanes = project.automation.lanes.filter(lane => lane.targetPath !== "project.tempo");
    project.project.meterMap = [];
    project.timeline.selection = null;
    const clips = project.timeline.clips.slice(0, 2);
    clips[0].startBar = 1; clips[0].barLength = 1;
    clips[1].startBar = 4; clips[1].barLength = 1;
    expect(selectionAuditionPlan(project, clips.map(clip => clip.id), 2, 2)).toMatchObject({ label: "2 selected clips", startBar: 1, endBar: 5, startSeconds: 0, endSeconds: 10, leadInSeconds: 0, tailSeconds: 2 });
  });

  it("uses the authored tempo automation rather than constant-BPM timing", () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.automation.lanes = project.automation.lanes.filter(lane => lane.targetPath !== "project.tempo");
    project.project.meterMap = [];
    project = createAutomationLane(project, "project.tempo", { points: [{ bar: 1, value: 120, curve: "hold" }, { bar: 3, value: 60, curve: "hold" }] }).project;
    project.timeline.selection = { startBar: 3, endBar: 5, source: "manual" };
    expect(selectionAuditionPlan(project, [], 0.5, 1)).toMatchObject({ startSeconds: 3.5, endSeconds: 13 });
  });

  it("rejects unavailable or oversized ranges and invalid context settings explicitly", () => {
    const project = createDemoProject();
    project.timeline.selection = null;
    expect(() => selectionAuditionPlan(project, [])).toThrow(/Select a clip/);
    expect(() => selectionAuditionPlan(project, [project.timeline.clips[0].id], NaN, 1)).toThrow(/lead-in/);
    project.timeline.selection = { startBar: 1, endBar: 200, source: "manual" };
    expect(() => selectionAuditionPlan(project, [])).toThrow(/120 seconds/);
  });
});
