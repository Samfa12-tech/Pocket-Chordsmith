import { describe, expect, it } from "vitest";
import { automationSurfaceAudioSyncMode, automationSurfacePointFromClient } from "../src/app/automationSurface";

describe("automation surface helpers", () => {
  it("maps click coordinates to rounded automation bar and value", () => {
    expect(automationSurfacePointFromClient(
      { left: 10, top: 20, width: 200, height: 100 },
      1,
      9,
      40,
      240,
      60,
      45
    )).toEqual({ bar: 3, value: 190 });
  });

  it("uses composition-event sync for timeline automation and mixer graph sync for FX parameters", () => {
    expect(automationSurfaceAudioSyncMode("project.tempo")).toBe("composition-events");
    expect(automationSurfaceAudioSyncMode("clips.clip-a.gain")).toBe("composition-events");
    expect(automationSurfaceAudioSyncMode("tracks.bass.sends.return.level")).toBe("composition-events");
    expect(automationSurfaceAudioSyncMode("fx.chain-a.slots.slot-a.parameters.wet")).toBe("mixer-graph");
  });
});
