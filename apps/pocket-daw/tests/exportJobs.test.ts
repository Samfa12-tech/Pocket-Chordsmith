import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { createGameExportManifest, createGamePackZipBlob, createSectionLoopMetadata, createStemExportPlan, projectForSectionLoopRender, projectWithOnlyTracksAudible } from "../src/daw/exportJobs";
import { addMediaPoolItem, createMediaPoolItem } from "../src/daw/mediaPool";

describe("export job helpers", () => {
  it("builds stem plans and track-filtered stem projects", () => {
    const project = createDemoProject();
    const stems = createStemExportPlan(project);
    const bass = stems.find((stem) => stem.id === "bass")!;
    const stemProject = projectWithOnlyTracksAudible(project, bass.trackIds);

    expect(stems.map((stem) => stem.id)).toEqual(expect.arrayContaining(["drums", "bass", "chords", "melody", "guitar"]));
    expect(bass.fileName).toContain("bass-stem.wav");
    expect(bass.packPath).toContain("audio/stems/");
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
    expect(loops[0].packPath).toContain("audio/sections/");
    expect(new Set(loops.map((loop) => loop.packPath)).size).toBe(loops.length);
    expect(loops[0].status).toBe("renderable");
    expect(loops[0].sourceClipId).toBeTruthy();
  });

  it("builds section-only render projects for loop WAV export", () => {
    const project = createDemoProject();
    const loop = createSectionLoopMetadata(project)[0];
    const renderProject = projectForSectionLoopRender(project, loop);

    expect(renderProject.timeline.clips).toHaveLength(1);
    expect(renderProject.timeline.clips[0]).toMatchObject({
      id: expect.stringContaining("loop_render"),
      startBar: 1,
      barLength: loop.lengthBars,
      muted: false
    });
    expect(renderProject.timeline.bars).toBe(loop.lengthBars);
    expect(renderProject.timeline.loop).toMatchObject({ enabled: true, startBar: 1, endBar: 1 + loop.lengthBars });
    expect(renderProject.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings.tailSeconds).toBe(0);
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
    expect(godot.files).toContain("manifests/godot-adaptive-manifest.json");
    expect(web.files).toContain("manifests/web-game-manifest.json");
    expect(godot.files).toContain(godot.fullMix);
    expect(godot.files).toContain(godot.sourceProject);
    expect(godot.folders).toMatchObject({ stems: "audio/stems/", sections: "audio/sections/" });
    expect(godot.notes.join("\n")).toContain("section loop WAVs are rendered into this pack");
  });

  it("builds a downloadable game-pack ZIP with manifest, source, mix, stems and loops", async () => {
    const project = createDemoProject();
    const result = await createGamePackZipBlob(project, "web-game-pack", {
      sourceProjectContents: JSON.stringify(project),
      renderWav: async (renderProject) => new Blob([`bars:${renderProject.timeline.bars}`], { type: "audio/wav" })
    });
    const paths = result.entries.map((entry) => entry.path);

    expect(result.blob.type).toBe("application/zip");
    expect(result.blob.size).toBeGreaterThan(128);
    expect(paths).toContain("manifests/web-game-manifest.json");
    expect(paths).toContain(result.manifest.fullMix);
    expect(paths).toContain(result.manifest.sourceProject);
    expect(result.manifest.stems.every((stem) => paths.includes(stem.packPath))).toBe(true);
    expect(result.manifest.sectionLoops.every((loop) => paths.includes(loop.packPath))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("adds manifest warnings for unresolved runtime-only media and muted tracks", () => {
    let project = createDemoProject();
    const item = createMediaPoolItem({ kind: "audio", name: "Browser Only.wav", metadata: { runtimeOnly: true } });
    project = addMediaPoolItem(project, item);
    project.tracks.find((track) => track.id === "guitar")!.mute = true;

    const manifest = createGameExportManifest(project, "web-game-pack");

    expect(manifest.warnings.join("\n")).toContain("Browser Only.wav");
    expect(manifest.warnings.join("\n")).toContain("Guitar");
  });

  it("adds manifest warnings for project invariant errors", () => {
    const project = createDemoProject();
    project.timeline.clips[0].trackId = "missing-track";

    const manifest = createGameExportManifest(project, "godot-adaptive-pack");

    expect(manifest.warnings.join("\n")).toContain("Project invariant error");
    expect(manifest.warnings.join("\n")).toContain("missing track");
  });
});
