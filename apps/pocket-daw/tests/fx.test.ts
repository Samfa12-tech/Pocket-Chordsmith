import { describe, expect, it } from "vitest";
import { addFxSlot, BUILT_IN_FX, ensureProjectFx } from "../src/daw/fx";
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

    expect(melodyChain?.slots[0]?.type).toBe("delay");
    expect(melodyChain?.slots[0]?.enabled).toBe(true);
  });

  it("keeps custom future chain ids during migration repair", () => {
    const project = createDemoProject();
    const bass = project.tracks.find((track) => track.id === "bass");
    if (bass) bass.fxChainId = "future_custom_bass_fx";
    project.fx.chains = project.fx.chains.filter((chain) => chain.ownerTrackId !== "bass");

    const repaired = ensureProjectFx(project);

    expect(repaired.fx.chains.some((chain) => chain.id === "future_custom_bass_fx")).toBe(true);
  });
});
