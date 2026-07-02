import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { addAutomationPoint, createAutomationLane, deleteAutomationPoint, ensureClipAutomationLane, ensureProjectAutomationLane, ensureTrackSendAutomationLane, evaluateAutomationLane, evaluateProjectTempoAtBar, getAutomatedTrackControls, getProjectAutomationLane, getTrackSendAutomationLane, updateAutomationPoint } from "../src/daw/automation";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../src/daw/audioClips";
import { addReturnTrack, setTrackSendLevel } from "../src/daw/routing";
import { barsToSeconds, timelineBarAtSeconds, timelineDurationSeconds, timelineSecondsAtBar } from "../src/daw/timeline";

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

  it("evaluates ease-in and ease-out automation curves", () => {
    const easeIn = createAutomationLane(createDemoProject(), "tracks.bass.volume", {
      points: [
        { bar: 1, value: 0, curve: "ease-in" },
        { bar: 3, value: 1, curve: "linear" }
      ]
    }).project.automation.lanes[0];
    const easeOut = createAutomationLane(createDemoProject(), "tracks.bass.volume", {
      points: [
        { bar: 1, value: 0, curve: "ease-out" },
        { bar: 3, value: 1, curve: "linear" }
      ]
    }).project.automation.lanes[0];

    expect(evaluateAutomationLane(easeIn, 2, 0)).toBeCloseTo(0.25, 5);
    expect(evaluateAutomationLane(easeOut, 2, 0)).toBeCloseTo(0.75, 5);
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

  it("creates clip gain, fade and source-offset automation lanes attached to audio clips", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Automation.wav",
      durationSeconds: 4,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), gain: 1.5, fadeInSeconds: 0.75, sourceOffsetSeconds: 1.25 };

    const gain = ensureClipAutomationLane(placed.project, placed.clipId, "gain");
    const fade = ensureClipAutomationLane(gain.project, placed.clipId, "fadeInSeconds");
    const offset = ensureClipAutomationLane(fade.project, placed.clipId, "sourceOffsetSeconds");
    const gainLane = offset.project.automation.lanes.find((item) => item.id === gain.laneId)!;
    const fadeLane = offset.project.automation.lanes.find((item) => item.id === fade.laneId)!;
    const offsetLane = offset.project.automation.lanes.find((item) => item.id === offset.laneId)!;
    const updatedClip = offset.project.timeline.clips.find((item) => item.id === placed.clipId)!;

    expect(gainLane).toMatchObject({ targetPath: `clips.${placed.clipId}.gain`, min: 0, max: 4 });
    expect(gainLane.points[0]).toMatchObject({ bar: 2, value: 1.5 });
    expect(fadeLane).toMatchObject({ targetPath: `clips.${placed.clipId}.fadeInSeconds`, min: 0, max: 86400 });
    expect(fadeLane.points[0]).toMatchObject({ bar: 2, value: 0.75 });
    expect(offsetLane).toMatchObject({ targetPath: `clips.${placed.clipId}.sourceOffsetSeconds`, min: 0, max: 86400 });
    expect(offsetLane.points[0]).toMatchObject({ bar: 2, value: 1.25 });
    expect(updatedClip.automationLaneId).toBe(offsetLane.id);
  });

  it("creates send-level automation lanes attached to source tracks", () => {
    const withReturn = addReturnTrack(createDemoProject(), "Verb Return");
    const sent = setTrackSendLevel(withReturn.project, "bass", withReturn.trackId, 0.45);

    const ensured = ensureTrackSendAutomationLane(sent, "bass", withReturn.trackId, "level");
    const lane = getTrackSendAutomationLane(ensured.project, "bass", withReturn.trackId, "level")!;
    const bass = ensured.project.tracks.find((track) => track.id === "bass")!;

    expect(lane).toMatchObject({ targetPath: `tracks.bass.sends.${withReturn.trackId}.level`, min: 0, max: 1 });
    expect(lane.points[0]).toMatchObject({ bar: 1, value: 0.45 });
    expect(bass.automationLaneIds).toContain(ensured.laneId);
  });

  it("creates and evaluates project tempo automation lanes", () => {
    const project = createDemoProject();
    project.project.bpm = 118;

    const ensured = ensureProjectAutomationLane(project, "tempo");
    const lane = getProjectAutomationLane(ensured.project, "tempo")!;
    const ramped = addAutomationPoint(ensured.project, ensured.laneId, { bar: 5, value: 160, curve: "linear" });

    expect(lane).toMatchObject({ id: "auto_project_tempo", targetPath: "project.tempo", min: 40, max: 240, unit: "linear" });
    expect(lane.points[0]).toMatchObject({ bar: 1, value: 118 });
    expect(evaluateProjectTempoAtBar(ramped, 3)).toBeCloseTo(139, 5);
  });

  it("maps musical bars to seconds with project tempo automation", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.bars = 3;

    expect(timelineSecondsAtBar(project, 4)).toBeCloseTo(barsToSeconds(3, 120, 4), 5);

    const automated = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 240,
      points: [
        { bar: 1, value: 120, curve: "hold" },
        { bar: 3, value: 60, curve: "hold" }
      ]
    }).project;

    expect(timelineSecondsAtBar(automated, 3)).toBeCloseTo(4, 5);
    expect(timelineSecondsAtBar(automated, 4)).toBeCloseTo(8, 5);
    expect(timelineBarAtSeconds(automated, 4)).toBeCloseTo(3, 5);
    expect(timelineBarAtSeconds(automated, 8)).toBeCloseTo(4, 5);
    expect(timelineDurationSeconds(automated)).toBeCloseTo(8, 5);
  });

  it("integrates linear project tempo automation ramps", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const automated = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 240,
      points: [
        { bar: 1, value: 120, curve: "linear" },
        { bar: 3, value: 60, curve: "hold" }
      ]
    }).project;

    expect(timelineSecondsAtBar(automated, 3)).toBeCloseTo(8 * Math.log(2), 5);
  });
});
