import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { createGameExportManifest, createSectionLoopMetadata, createStemExportPlan, projectWithOnlyTracksAudible } from "../src/daw/exportJobs";

describe("export job helpers", () => {
  it("builds stem plans and track-filtered stem projects", () => {
    const project = createDemoProject();
    const stems = createStemExportPlan(project);
    const bass = stems.find((stem) => stem.id === "bass")!;
    const stemProject = projectWithOnlyTracksAudible(project, bass.trackIds);

    expect(stems.map((stem) => stem.id)).toEqual(expect.arrayContaining(["drums", "bass", "chords", "melody", "guitar"]));
    expect(bass.fileName).toContain("bass-stem.wav");
    expect(stemProject.tracks.find((track) => track.id === "bass")?.mute).toBe(false);
    expect(stemProject.tracks.find((track) => track.id === "drums")?.mute).toBe(true);
  });

  it("calculates section loop metadata from generated-section clips", () => {
    const project = createDemoProject();
    const loops = createSectionLoopMetadata(project);

    expect(loops.length).toBeGreaterThan(0);
    expect(loops[0]).toMatchObject({
      bpm: project.project.bpm,
      key: project.project.key,
      scale: project.project.scale,
      timeSig: project.project.timeSig
    });
    expect(loops[0].lengthSeconds).toBeGreaterThan(0);
    expect(loops[0].fileName).toContain("loop.wav");
  });

  it("generates Godot and web game manifest previews", () => {
    const project = createDemoProject();
    project.timeline.markers.push({ id: "combat", bar: 5, name: "Combat", markerType: "game-state" });

    const godot = createGameExportManifest(project, "godot-adaptive-pack");
    const web = createGameExportManifest(project, "web-game-pack");

    expect(godot.kind).toBe("godot-adaptive-pack");
    expect(web.kind).toBe("web-game-pack");
    expect(godot.stems.length).toBeGreaterThan(0);
    expect(godot.sectionLoops.length).toBeGreaterThan(0);
    expect(godot.markers.find((marker) => marker.id === "combat")).toMatchObject({ id: "combat", seconds: expect.any(Number) });
    expect(godot.files).toContain("godot-adaptive-manifest.json");
    expect(web.files).toContain("web-game-manifest.json");
  });
});
