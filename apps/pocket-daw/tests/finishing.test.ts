import { describe, expect, it } from "vitest";
import { assertMonitorComparisonEvidence } from "../scripts/track-gain-comparison-evidence.mjs";
import { createDemoProject } from "../src/demo/demoProject";
import { addFxSlot } from "../src/daw/fx";
import { createAutomationLane } from "../src/daw/automation";
import { createUndoStack, pushUndo, undo } from "../src/daw/undo";
import { finishMonitorGains, projectWithFinishPreset, type FinishAudioMeasurements } from "../src/daw/finishing";
import { createInitialState, createUiCollapsedSections } from "../src/app/state";
import { renderAppShell } from "../src/app/ui";

const measurement = (lufs: number | null, peak = -3): FinishAudioMeasurements => ({ integratedLufs: lufs, truePeakDbtp: peak, nonFiniteSamples: 0, durationSeconds: 3, sampleRate: 48000, channelCount: 2 });

describe("Finish proposals and monitor matching", () => {
  it("rejects non-finite diagnostic errors and empty, missing or malformed clock evidence", () => {
    const valid = { maxError: 1e-8, squaredError: 1e-9, rate: 48000, switches: [{ frame: 12000 }], clock: [{ frame: 12000, renderedFrameCount: 12000, positionSeconds: .25, generation: 17 }] };
    expect(() => assertMonitorComparisonEvidence(valid)).not.toThrow();
    for (const patch of [{ maxError: NaN }, { maxError: Infinity }, { squaredError: NaN }, { clock: [] }, { clock: null }, { clock: [{ ...valid.clock[0], positionSeconds: NaN }] }, { clock: [{ ...valid.clock[0], renderedFrameCount: 11999 }] }, { switches: [] }]) expect(() => assertMonitorComparisonEvidence({ ...valid, ...patch })).toThrow("finite aligned");
  });
  it("previews selected-track gain without changing source, FX, automation or media and commits one Undo", () => {
    const source = createDemoProject();
    const track = source.tracks.find(item => item.trackType !== "master" && item.volume > 0)!;
    const before = structuredClone(source);
    const proposed = projectWithFinishPreset(source, "track_quieter", track.id);
    expect(source).toEqual(before);
    expect(proposed.tracks.find(item => item.id === track.id)!.volume).toBeCloseTo(track.volume * 10 ** (-3 / 20), 12);
    expect(proposed.fx).toEqual(source.fx);
    expect(proposed.automation).toEqual(source.automation);
    expect(proposed.timeline).toEqual(source.timeline);
    const history = pushUndo(createUndoStack(source), proposed);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toEqual(source);
    expect(() => projectWithFinishPreset(source, "track_quieter", "missing")).toThrow("non-master");
    expect(() => projectWithFinishPreset(source, "track_quieter", source.tracks.find(item => item.trackType === "master")!.id)).toThrow("non-master");
  });
  it("disables example Apply and all preview starts while recording", () => {
    const state = createInitialState(); state.lowerDockTab = "export-details"; state.timelineHeightPx = 430; state.collapsedUiSections = createUiCollapsedSections();
    state.finishComparison.phase = "ready"; state.finishComparison.example = true;
    expect(renderAppShell(state)).toMatch(/data-action="finish-apply"[^>]*disabled/);
    state.recording.status = "recording";
    const html = renderAppShell(state);
    expect(html).toMatch(/data-action="finish-example-a"[^>]*disabled/);
    expect(html).toMatch(/data-action="finish-example-b"[^>]*disabled/);
    expect(html).toMatch(/data-action="finish-prepare"[^>]*disabled/);
    state.recording.status = "idle"; state.midiInputStartPending = true;
    const pending = renderAppShell(state);
    for (const action of ["prepare", "example-a", "example-b", "a", "b", "apply"]) expect(pending).toMatch(new RegExp(`data-action="finish-${action}"[^>]*disabled`));
  });
  it("preserves source and user FX, replaces only managed slots, and bypasses reversibly", () => {
    let source = createDemoProject();
    const master = source.tracks.find(track => track.trackType === "master")!;
    source = addFxSlot(source, master.id, "reverb");
    const before = structuredClone(source);
    const originalSlots = source.fx.chains.find(chain => chain.ownerTrackId === master.id)!.slots;
    const tidy = projectWithFinishPreset(source, "tidy");
    expect(source).toEqual(before);
    expect(projectWithFinishPreset(source, "original")).toBe(source);
    const slots = (project: typeof source) => project.fx.chains.find(chain => chain.ownerTrackId === master.id)!.slots;
    expect(slots(tidy).slice(0, -1)).toEqual(originalSlots);
    expect(slots(tidy).at(-1)).toMatchObject({ type: "high-pass", parameters: { frequency: 30, q: 0.7 } });
    const glue = projectWithFinishPreset(tidy, "glue");
    expect(slots(glue).slice(0, -2)).toEqual(originalSlots);
    expect(slots(glue).slice(-2).map(slot => slot.type)).toEqual(["high-pass", "compressor"]);
    expect(slots(projectWithFinishPreset(glue, "bypass"))).toEqual(originalSlots);
  });

  it("matches by attenuation with common headroom, never boosting or writing project gain", () => {
    const a = measurement(-12, -0.2), b = measurement(-18, -0.1);
    const before = structuredClone({ a, b });
    const result = finishMonitorGains(a, b);
    expect(result.aDb - result.bDb).toBeCloseTo(-6, 10);
    expect(result.headroomDb).toBeCloseTo(-0.9, 10);
    expect(a.integratedLufs! + result.aDb).toBeCloseTo(b.integratedLufs! + result.bDb, 10);
    expect(result.aGain).toBeLessThan(1);
    expect(result.bGain).toBeLessThan(1);
    expect({ a, b }).toEqual(before);
  });

  it("removes automation only for replaced Finish slots and restores it with one Undo", () => {
    let source = projectWithFinishPreset(createDemoProject(), "tidy");
    const chain = source.fx.chains.find(item => item.slots.some(slot => slot.presetId === "pocket-finish:tidy"))!;
    const slot = chain.slots.find(item => item.presetId === "pocket-finish:tidy")!;
    const target = `fx.${chain.id}.slots.${slot.id}.parameters.frequency`;
    source = createAutomationLane(source, target, { points: [{ bar: 1, value: 30, curve: "hold" }] }).project;
    const before = structuredClone(source);
    const next = projectWithFinishPreset(source, "glue");
    expect(next.automation.lanes.some(lane => lane.targetPath === target)).toBe(false);
    expect(next.automation.lanes).toEqual(source.automation.lanes.filter(lane => lane.targetPath !== target));
    const applied = pushUndo(createUndoStack(source), next);
    expect(applied.past).toHaveLength(1);
    expect(undo(applied).present).toEqual(before);
    expect(source).toEqual(before);
  });

  it("rejects incomparable, silent, invalid or non-finite measurements", () => {
    const a = measurement(-16);
    for (const patch of [{ integratedLufs: null }, { integratedLufs: NaN }, { truePeakDbtp: NaN }, { truePeakDbtp: null }, { nonFiniteSamples: 1 }, { sampleRate: 44100 }, { channelCount: 1 }, { durationSeconds: 3.01 }]) {
      expect(() => finishMonitorGains(a, { ...a, ...patch })).toThrow();
    }
  });
});
