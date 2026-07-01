import { describe, expect, it } from "vitest";
import { addFxAutomationPointCommand, ensureFxAutomationLaneCommand, recordFxAutomationPointCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { addFxSlot, BUILT_IN_FX, ensureProjectFx, setFxSlotParameter, setPocketProEqPreset } from "../src/daw/fx";
import { addDrumLaneFx, DRUM_LANE_DEFS, getDrumLaneFxChain, getDrumLaneMix, setDrumLanePan, setDrumLaneVolume } from "../src/daw/drumLanes";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { addAutomationPoint, ensureFxParameterAutomationLane, getAutomatedFxChains } from "../src/daw/automation";
import { createUndoStack } from "../src/daw/undo";

describe("built-in FX", () => {
  it("includes the v0.1.3 starter pack", () => {
    const types = BUILT_IN_FX.map((fx) => fx.type);

    expect(types).toEqual([
      "utility-gain",
      "high-pass",
      "low-pass",
      "three-band-eq",
      "parametric-eq",
      "compressor",
      "limiter",
      "noise-gate",
      "saturation",
      "bitcrusher",
      "delay",
      "ping-pong-delay",
      "reverb",
      "chorus",
      "phaser",
      "tremolo-autopan"
    ]);
  });

  it("serializes FX chains through .pocketdaw JSON", () => {
    const project = addFxSlot(createDemoProject(), "melody", "delay");
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(project));
    const melodyChain = parsed.fx.chains.find((chain) => chain.ownerTrackId === "melody");

    const delaySlot = melodyChain?.slots.find((slot) => slot.type === "delay");
    expect(delaySlot?.type).toBe("delay");
    expect(delaySlot?.enabled).toBe(true);
  });

  it("stores editable Pocket Pro EQ settings in normal FX chains", () => {
    let project = addFxSlot(createDemoProject(), "master", "parametric-eq");
    const chain = project.fx.chains.find((item) => item.ownerTrackId === "master");
    const slot = chain?.slots[0];

    project = setFxSlotParameter(project, chain?.id || "", slot?.id || "", "highMidGain", 2.4);
    project = setFxSlotParameter(project, chain?.id || "", slot?.id || "", "hpEnabled", true);
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(project));
    const parsedSlot = parsed.fx.chains.find((item) => item.ownerTrackId === "master")?.slots[0];

    expect(parsedSlot?.type).toBe("parametric-eq");
    expect(parsedSlot?.parameters.highMidGain).toBe(2.4);
    expect(parsedSlot?.parameters.hpEnabled).toBe(true);
  });

  it("applies shared Pocket Pro EQ presets to editable slots", () => {
    let project = addFxSlot(createDemoProject(), "master", "parametric-eq");
    const chain = project.fx.chains.find((item) => item.ownerTrackId === "master");
    const slot = chain?.slots[0];

    project = setPocketProEqPreset(project, chain?.id || "", slot?.id || "", "soft-chord-bed");
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(project));
    const parsedSlot = parsed.fx.chains.find((item) => item.ownerTrackId === "master")?.slots[0];

    expect(parsedSlot?.presetId).toBe("soft-chord-bed");
    expect(parsedSlot?.parameters.hpEnabled).toBe(true);
    expect(parsedSlot?.parameters.lowMidGain).toBe(-1.8);
    expect(parsedSlot?.parameters.lpFrequency).toBe(13200);
  });

  it("creates numeric FX parameter automation lanes and evaluates automated chain parameters", () => {
    let project = addFxSlot(createDemoProject(), "master", "delay");
    const chain = project.fx.chains.find((item) => item.ownerTrackId === "master")!;
    const slot = chain.slots[0];

    const ensured = ensureFxParameterAutomationLane(project, chain.id, slot.id, "mix")!;
    project = addAutomationPoint(ensured.project, ensured.laneId, { bar: 3, value: 0.8, curve: "linear" });
    const automated = getAutomatedFxChains(project, 2).find((item) => item.id === chain.id)?.slots[0];
    const original = project.fx.chains.find((item) => item.id === chain.id)?.slots[0];

    expect(project.tracks.find((track) => track.role === "master")?.automationLaneIds).toContain(ensured.laneId);
    expect(automated?.parameters.mix).toBeCloseTo(0.56, 5);
    expect(original?.parameters.mix).toBe(0.32);
    expect(ensureFxParameterAutomationLane(project, chain.id, slot.id, "enabled")).toBeNull();
  });

  it("creates FX automation through the undoable command path", () => {
    const project = addFxSlot(createDemoProject(), "master", "delay");
    const chain = project.fx.chains.find((item) => item.ownerTrackId === "master")!;
    const slot = chain.slots[0];
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.playheadBar = 5;

    const created = ensureFxAutomationLaneCommand(state, chain.id, slot.id, "feedback");
    const withPoint = addFxAutomationPointCommand(created, chain.id, slot.id, "feedback");
    const lane = withPoint.undoStack.present.automation.lanes.find((item) => item.targetPath === `fx.${chain.id}.slots.${slot.id}.parameters.feedback`)!;

    expect(lane.points).toEqual([
      expect.objectContaining({ bar: 1, value: 0.28 }),
      expect.objectContaining({ bar: 5, value: 0.28 })
    ]);
    expect(withPoint.undoStack.past.length).toBeGreaterThanOrEqual(2);
    expect(withPoint.status).toContain("FX automation point");
  });

  it("records live FX automation into an existing numeric parameter lane", () => {
    const project = addFxSlot(createDemoProject(), "master", "delay");
    const chain = project.fx.chains.find((item) => item.ownerTrackId === "master")!;
    const slot = chain.slots[0];
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.playheadBar = 6;
    const created = ensureFxAutomationLaneCommand(state, chain.id, slot.id, "mix");

    const recorded = recordFxAutomationPointCommand(created, chain.id, slot.id, "mix", 0.74);
    const missing = recordFxAutomationPointCommand(state, chain.id, slot.id, "feedback", 0.5);
    const lane = recorded.undoStack.present.automation.lanes.find((item) => item.targetPath === `fx.${chain.id}.slots.${slot.id}.parameters.mix`)!;

    expect(lane.points).toContainEqual(expect.objectContaining({ bar: 6, value: 0.74, curve: "linear" }));
    expect(recorded.undoStack.past.length).toBe(created.undoStack.past.length + 1);
    expect(recorded.status).toContain("Recorded FX automation point");
    expect(missing).toBe(state);
  });

  it("keeps custom future chain ids during migration repair", () => {
    const project = createDemoProject();
    const bass = project.tracks.find((track) => track.id === "bass");
    if (bass) bass.fxChainId = "future_custom_bass_fx";
    project.fx.chains = project.fx.chains.filter((chain) => chain.ownerTrackId !== "bass");

    const repaired = ensureProjectFx(project);

    expect(repaired.fx.chains.some((chain) => chain.id === "future_custom_bass_fx")).toBe(true);
  });

  it("creates per-drum lane mixer metadata and FX chains without splitting the Drums track", () => {
    let project = createDemoProject();
    project = setDrumLaneVolume(project, "snare", 0.64);
    project = setDrumLanePan(project, "snare", -0.22);
    project = addDrumLaneFx(project, "snare", "high-pass");

    const drums = project.tracks.find((track) => track.role === "drums");
    const snareMix = getDrumLaneMix(project, "snare");

    expect(project.tracks.filter((track) => track.role === "drums")).toHaveLength(1);
    expect(Object.keys((drums?.metadata?.drumLanes || {}) as Record<string, unknown>)).toEqual(DRUM_LANE_DEFS.map((lane) => lane.id));
    expect(snareMix.volume).toBeCloseTo(0.64);
    expect(snareMix.pan).toBeCloseTo(-0.22);
    expect(getDrumLaneFxChain(project, "snare")?.slots[0]?.type).toBe("high-pass");
  });

  it("roundtrips per-drum lane settings through .pocketdaw JSON", () => {
    const project = addDrumLaneFx(setDrumLaneVolume(createDemoProject(), "openhat", 0.42), "openhat", "delay");
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(project));

    expect(getDrumLaneMix(parsed, "openhat").volume).toBeCloseTo(0.42);
    expect(getDrumLaneFxChain(parsed, "openhat")?.slots[0]?.type).toBe("delay");
  });
});
