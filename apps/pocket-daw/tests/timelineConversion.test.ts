import { describe, expect, it } from "vitest";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { createDemoChordsmithProject } from "../src/demo/demoProject";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { createAutomationLane } from "../src/daw/automation";
import { barFloatToDisplayPosition, effectiveMeterAtBar, timelineBarAtSeconds, timelineSecondsAtBar } from "../src/daw/timeline";

describe("timeline conversion", () => {
  it("creates generated-section clips from songSequence", () => {
    const pcs = sanitizePocketChordsmithProject(createDemoChordsmithProject());
    const daw = createDawProjectFromChordsmithProject(pcs);
    expect(daw.timeline.clips).toHaveLength(pcs.songSequence.length);
    expect(daw.timeline.clips[0]).toMatchObject({
      type: "generated-section",
      trackId: "arrangement",
      sectionId: "A",
      startBar: 1,
      barLength: 4
    });
    expect(daw.timeline.clips[2].sectionId).toBe("B");
  });

  it("respects section lengths", () => {
    const source = createDemoChordsmithProject();
    (source.sectionBars as Record<string, number>).A = 2;
    (source.sectionBars as Record<string, number>).B = 3;
    source.songSequence = ["A", "B"];
    const daw = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    expect(daw.timeline.clips[0].barLength).toBe(2);
    expect(daw.timeline.clips[1].startBar).toBe(3);
    expect(daw.timeline.clips[1].barLength).toBe(3);
  });

  it("resolves effective display meter from project meter-map points", () => {
    const project = createEmptyPocketDawProject();
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_1", bar: 2, numerator: 7, denominator: 8, source: "midi-import" },
      { id: "meter_2", bar: 4.5, numerator: 3, denominator: 4, source: "midi-import" }
    ];

    expect(effectiveMeterAtBar(project, 1)).toMatchObject({ numerator: 4, denominator: 4 });
    expect(effectiveMeterAtBar(project, 2)).toMatchObject({ numerator: 7, denominator: 8, sourceBar: 2 });
    expect(effectiveMeterAtBar(project, 5)).toMatchObject({ numerator: 3, denominator: 4, sourceBar: 4.5 });
  });

  it("formats bar display positions with the active meter-map numerator", () => {
    const project = createEmptyPocketDawProject();
    project.project.ppq = 480;
    project.project.meterMap = [{ id: "meter_1", bar: 2, numerator: 7, denominator: 8, source: "midi-import" }];

    expect(barFloatToDisplayPosition(project, 1.75)).toMatchObject({ bar: 1, beat: 4, tick: 0, meter: { numerator: 4, denominator: 4 } });
    expect(barFloatToDisplayPosition(project, 2 + 6 / 7)).toMatchObject({ bar: 2, beat: 7, tick: 0, meter: { numerator: 7, denominator: 8 } });
  });

  it("uses meter-map bar lengths for timeline seconds", () => {
    const project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];

    expect(timelineSecondsAtBar(project, 2)).toBeCloseTo(2, 5);
    expect(timelineSecondsAtBar(project, 3)).toBeCloseTo(3.75, 5);
    expect(timelineSecondsAtBar(project, 4)).toBeCloseTo(5.25, 5);
    expect(timelineBarAtSeconds(project, 3.75)).toBeCloseTo(3, 4);
  });

  it("combines meter-map bar lengths with hold tempo automation", () => {
    let project = createEmptyPocketDawProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" }
    ];
    project = createAutomationLane(project, "project.tempo", {
      min: 40,
      max: 240,
      points: [
        { bar: 1, value: 60, curve: "hold" },
        { bar: 3, value: 120, curve: "hold" }
      ]
    }).project;

    expect(timelineSecondsAtBar(project, 2)).toBeCloseTo(4, 5);
    expect(timelineSecondsAtBar(project, 3)).toBeCloseTo(7.5, 5);
    expect(timelineSecondsAtBar(project, 4)).toBeCloseTo(9.25, 5);
  });
});
