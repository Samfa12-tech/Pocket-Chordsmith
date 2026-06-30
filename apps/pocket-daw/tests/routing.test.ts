import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { addAutomationPoint, ensureTrackSendAutomationLane } from "../src/daw/automation";
import { activeTrackSendRoutes, addBusTrack, addReturnTrack, createRoutingExportSummary, getAutomatedTrackSendLevel, routeTrackToOutput, setTrackSendLevel, setTrackSendMode, trackSendLevel, trackSendMode } from "../src/daw/routing";

describe("routing helpers", () => {
  it("creates bus and return tracks and routes a track to a bus", () => {
    const bus = addBusTrack(createDemoProject(), "Music Bus");
    const routed = routeTrackToOutput(bus.project, "bass", bus.trackId);
    const withReturn = addReturnTrack(routed, "Verb Return");

    expect(routed.tracks.find((track) => track.id === "bass")?.routing.outputId).toBe(bus.trackId);
    expect(routed.routing.buses.find((item) => item.id === bus.trackId)?.trackIds).toContain("bass");
    expect(withReturn.project.tracks.find((track) => track.id === withReturn.trackId)?.trackType).toBe("return");
    expect(withReturn.project.routing.returns.find((item) => item.id === withReturn.trackId)).toBeTruthy();
  });

  it("rejects routing cycles and stores guarded send levels as metadata", () => {
    const busA = addBusTrack(createDemoProject(), "Bus A");
    const busB = addBusTrack(busA.project, "Bus B");
    const busAToB = routeTrackToOutput(busB.project, busA.trackId, busB.trackId);
    const rejected = routeTrackToOutput(busAToB, busB.trackId, busA.trackId);

    expect(rejected.tracks.find((track) => track.id === busB.trackId)?.routing.outputId).toBe("master");

    const ret = addReturnTrack(rejected, "Delay Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.4);
    expect(sent.tracks.find((track) => track.id === "bass")?.metadata?.sendLevels).toMatchObject({ [ret.trackId]: 0.4 });
    expect(trackSendLevel(sent.tracks.find((track) => track.id === "bass")!, ret.trackId)).toBe(0.4);
    expect(activeTrackSendRoutes(sent, sent.tracks.find((track) => track.id === "bass")!)).toEqual([{ returnTrackId: ret.trackId, level: 0.4, mode: "post-fader" }]);
    const pre = setTrackSendMode(sent, "bass", ret.trackId, "pre-fader");
    expect(pre.tracks.find((track) => track.id === "bass")?.metadata?.sendModes).toMatchObject({ [ret.trackId]: "pre-fader" });
    expect(trackSendMode(pre.tracks.find((track) => track.id === "bass")!, ret.trackId)).toBe("pre-fader");
    expect(activeTrackSendRoutes(pre, pre.tracks.find((track) => track.id === "bass")!)[0]).toMatchObject({ mode: "pre-fader" });
  });

  it("evaluates send automation for active send routes", () => {
    const ret = addReturnTrack(createDemoProject(), "Delay Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0);
    const ensured = ensureTrackSendAutomationLane(sent, "bass", ret.trackId, "level");
    const automated = addAutomationPoint(ensured.project, ensured.laneId, { bar: 3, value: 0.8 });
    const bass = automated.tracks.find((track) => track.id === "bass")!;

    expect(getAutomatedTrackSendLevel(automated, bass, ret.trackId, 2)).toBeCloseTo(0.4, 5);
    expect(activeTrackSendRoutes(automated, bass, 2)).toEqual([{ returnTrackId: ret.trackId, level: 0.4, mode: "post-fader" }]);
  });

  it("summarizes routing for export diagnostics", () => {
    const ret = addReturnTrack(createDemoProject(), "Delay Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.4);
    const pre = setTrackSendMode(sent, "bass", ret.trackId, "pre-fader");
    const summary = createRoutingExportSummary(pre);

    expect(summary).toMatchObject({
      returnCount: expect.any(Number),
      preFaderSendCount: 1
    });
    expect(summary.sendCount).toBeGreaterThanOrEqual(1);
    expect(summary.postFaderSendCount).toBeGreaterThanOrEqual(0);
    expect(summary.warnings.join("\n")).not.toContain("pre-fader send");
  });
});
