import { describe, expect, it } from "vitest";
import { addFxSlot, BUILT_IN_FX, ensureProjectFx, setFxSlotParameter, setPocketProEqPreset } from "../src/daw/fx";
import { addDrumLaneFx, DRUM_LANE_DEFS, getDrumLaneFxChain, getDrumLaneMix, setDrumLanePan, setDrumLaneVolume } from "../src/daw/drumLanes";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";

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
