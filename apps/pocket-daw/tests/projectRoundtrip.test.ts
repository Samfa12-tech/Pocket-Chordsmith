import { describe, expect, it } from "vitest";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import { createDemoProject } from "../src/demo/demoProject";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { addFxSlot } from "../src/daw/fx";
import { createAutomationLane } from "../src/daw/automation";
import { addBusTrack, routeTrackToOutput } from "../src/daw/routing";

describe("project roundtrip", () => {
  it("saves and opens .pocketdaw JSON", () => {
    let project = addFxSlot(createDemoProject(), "bass", "compressor");
    const bus = addBusTrack(project, "Music Bus");
    project = routeTrackToOutput(bus.project, "bass", bus.trackId);
    project = createAutomationLane(project, "tracks.bass.volume", { points: [{ bar: 1, value: 0.5 }, { bar: 2, value: 1 }] }).project;
    project.audioDeviceSettings.devices = [
      { id: "wasapi_input_1", name: "Test Interface Input", kind: "input", host: "wasapi", isDefaultInput: true, isDefaultOutput: false }
    ];
    const raw = buildPocketDawProjectFile(project);
    const parsed = migratePocketDawProject(parsePocketDawProjectFile(raw));
    expect(parsed.app).toBe("PocketDAW");
    expect(parsed.timeline.clips.length).toBe(project.timeline.clips.length);
    expect(parsed.sourceRefs[0].original).toBeTruthy();
    expect(parsed.fx.chains.find((chain) => chain.ownerTrackId === "bass")?.slots[0]?.type).toBe("compressor");
    expect(parsed.audioDeviceSettings.devices?.[0]?.name).toBe("Test Interface Input");
    expect(parsed.automation.lanes.find((lane) => lane.targetPath === "tracks.bass.volume")?.points).toHaveLength(2);
    expect(parsed.tracks.find((track) => track.id === "bass")?.routing.outputId).toBe(bus.trackId);
    expect(parsed.routing.buses.find((item) => item.id === bus.trackId)?.trackIds).toContain("bass");
    expect(parsed.exportProfiles.find((profile) => profile.id === "stem-wavs")?.enabled).toBe(true);
  });
});
