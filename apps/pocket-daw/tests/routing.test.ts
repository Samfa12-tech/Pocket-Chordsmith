import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { activeTrackSendRoutes, addBusTrack, addReturnTrack, routeTrackToOutput, setTrackSendLevel } from "../src/daw/routing";

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
    expect(activeTrackSendRoutes(sent, sent.tracks.find((track) => track.id === "bass")!)).toEqual([{ returnTrackId: ret.trackId, level: 0.4 }]);
  });
});
