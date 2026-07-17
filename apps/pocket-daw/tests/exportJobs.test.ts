import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/demo/demoProject";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { buildPortableGamePackSourceProjectFile, createGameExportManifest, createGamePackDeliveryTargets, createGamePackZipBlob, createSectionLoopExportManifest, createSectionLoopMetadata, createSectionLoopZipBlob, createStemExportManifest, createStemExportPlan, createStemZipBlob, gamePackAudioCodecMetadata, projectForClipRender, projectForSectionLoopRender, projectWithOnlyTracksAudible, verifyExportPackageEntries } from "../src/daw/exportJobs";
import { branchGeneratedDrumsToTracks, cycleDrumBranchStep, DRUM_LANE_DEFS, getDrumLaneMix, setDrumBranchGroupCollapsed } from "../src/daw/drumLanes";
import { addMediaPoolItem, createMediaPoolItem } from "../src/daw/mediaPool";
import { addReturnTrack, setTrackSendLevel, setTrackSendMode } from "../src/daw/routing";
import { toggleTrackMute, toggleTrackSolo } from "../src/daw/mixer";
import { addTrackToProject, setTrackFolder, trackIsAudible } from "../src/daw/tracks";

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

  it("keeps folder group controls neutral inside isolated stem render projects", () => {
    const withFolder = addTrackToProject(createDemoProject(), "folder");
    const assigned = setTrackFolder(withFolder.project, "bass", withFolder.trackId);
    const folderMuted = toggleTrackMute(assigned, withFolder.trackId);
    const bassStemProject = projectWithOnlyTracksAudible(folderMuted, ["bass"]);
    const bass = bassStemProject.tracks.find((track) => track.id === "bass")!;
    const folder = bassStemProject.tracks.find((track) => track.id === withFolder.trackId)!;

    expect(folder.mute).toBe(false);
    expect(folder.solo).toBe(false);
    expect(bass.mute).toBe(false);
    expect(trackIsAudible(bass, bassStemProject.tracks)).toBe(true);
  });

  it("builds branch-aware drum stem plans and filtered render projects", () => {
    const project = branchGeneratedDrumsToTracks(createDemoProject());
    const stems = createStemExportPlan(project);
    const fullDrums = stems.find((stem) => stem.id === "drums")!;
    const kick = stems.find((stem) => stem.id === "drums-kick")!;
    const clap = stems.find((stem) => stem.id === "drums-clap")!;
    const openHat = stems.find((stem) => stem.id === "drums-openhat")!;
    const kickProject = projectWithOnlyTracksAudible(project, kick.trackIds, "stem-wavs");
    const events = renderTimelineEvents(kickProject);
    const clapEvents = renderTimelineEvents(projectWithOnlyTracksAudible(project, clap.trackIds, "stem-wavs"));
    const openHatEvents = renderTimelineEvents(projectWithOnlyTracksAudible(project, openHat.trackIds, "stem-wavs"));
    const branchStemIds = DRUM_LANE_DEFS.map((lane) => `drums-${lane.id}`);

    expect(stems.map((stem) => stem.id)).toEqual(expect.arrayContaining(["drums", ...branchStemIds]));
    expect(fullDrums.trackIds).toEqual(["drums"]);
    expect(kick.trackIds).toEqual(["drums-kick"]);
    expect(kick.packPath).toMatch(/^audio\/stems\/.+-drums-kick-stem\.wav$/);
    expect(stems.find((stem) => stem.id === "drums-openhat")?.packPath).toMatch(/^audio\/stems\/.+-drums-open-hat-stem\.wav$/);
    expect(stems.find((stem) => stem.id === "drums-crash")?.packPath).toMatch(/^audio\/stems\/.+-drums-crash-stem\.wav$/);
    expect(kickProject.tracks.find((track) => track.id === "drums")?.mute).toBe(false);
    expect(kickProject.tracks.find((track) => track.id === "bass")?.mute).toBe(true);
    expect(getDrumLaneMix(kickProject, "kick").solo).toBe(true);
    expect(getDrumLaneMix(kickProject, "snare").solo).toBe(false);
    expect(events.some((event) => event.kind === "kick")).toBe(true);
    expect(events.some((event) => event.kind === "snare")).toBe(false);
    expect(events.some((event) => event.kind === "hat")).toBe(false);
    expect(clapEvents.some((event) => event.kind === "clap" && event.trackId === "drums-clap")).toBe(true);
    expect(clapEvents.some((event) => event.kind === "snare")).toBe(false);
    expect(openHatEvents.some((event) => event.kind === "openhat" && event.trackId === "drums-openhat")).toBe(true);
    expect(openHatEvents.some((event) => event.kind === "hat")).toBe(false);
  });

  it("keeps hidden drum branch rows export-active for stems and game packs", () => {
    const project = setDrumBranchGroupCollapsed(branchGeneratedDrumsToTracks(createDemoProject()), true);
    const stems = createStemExportPlan(project);
    const manifest = createGameExportManifest(project, "godot-adaptive-pack");

    expect(stems.map((stem) => stem.id)).toEqual(expect.arrayContaining(["drums-kick", "drums-clap", "drums-openhat", "drums-crash"]));
    expect(manifest.stems.map((stem) => stem.id)).toEqual(expect.arrayContaining(["drums-kick", "drums-clap", "drums-openhat", "drums-crash"]));
    expect(manifest.stems.find((stem) => stem.id === "drums-openhat")?.packPath).toMatch(/^audio\/stems\/.+-drums-open-hat-stem\.wav$/);
  });

  it("renders authored live-kit branch overlays into their matching branch stems", () => {
    let project = branchGeneratedDrumsToTracks(createDemoProject());
    project = cycleDrumBranchStep(project, "A", "tomlow", 2);
    const tomStem = createStemExportPlan(project).find((stem) => stem.id === "drums-tomlow")!;
    const tomProject = projectWithOnlyTracksAudible(project, tomStem.trackIds, "stem-wavs");
    const events = renderTimelineEvents(tomProject);

    expect(getDrumLaneMix(tomProject, "tomlow").solo).toBe(true);
    expect(events.some((event) => event.kind === "tomlow" && event.trackId === "drums-tomlow")).toBe(true);
    expect(events.some((event) => event.kind === "kick")).toBe(false);
  });

  it("builds a downloadable stem ZIP with manifest and deterministic paths", async () => {
    const project = createDemoProject();
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.sampleRate = 44100;
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.settings.channelMode = "mono";
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.settings.normalize = "peak";
    project.exportProfiles.find((profile) => profile.id === "stem-wavs")!.sampleRate = 48000;
    project.exportProfiles.find((profile) => profile.id === "stem-wavs")!.settings.channelMode = "stereo";
    project.exportProfiles.find((profile) => profile.id === "stem-wavs")!.settings.normalize = false;
    project.exportProfiles.find((profile) => profile.id === "stem-wavs")!.settings.dither = "tpdf";
    const progress: string[] = [];
    const renderProfiles: Array<{ sampleRate?: number; channelMode?: unknown; normalize?: unknown; dither?: unknown }> = [];
    const result = await createStemZipBlob(project, {
      renderWav: async (renderProject) => {
        const wavProfile = renderProject.exportProfiles.find((profile) => profile.id === "full-song-wav");
        renderProfiles.push({ sampleRate: wavProfile?.sampleRate, channelMode: wavProfile?.settings.channelMode, normalize: wavProfile?.settings.normalize, dither: wavProfile?.settings.dither });
        return new Blob([`audible:${renderProject.tracks.filter((track) => !track.mute).map((track) => track.id).join(",")}`], { type: "audio/wav" });
      },
      onProgress: (label, detail) => {
        progress.push(`${label}:${detail}`);
      }
    });
    const paths = result.entries.map((entry) => entry.path);

    expect(result.blob.type).toBe("application/zip");
    expect(result.blob.size).toBeGreaterThan(128);
    expect(result.selfCheck).toMatchObject({ ok: true, checkedFileCount: paths.length, audioFileCount: result.manifest.stems.length });
    expect(paths).toContain("manifests/stem-wavs-manifest.json");
    expect(result.manifest.kind).toBe("stem-wavs");
    expect(result.manifest.stems.every((stem) => paths.includes(stem.packPath))).toBe(true);
    expect(result.manifest.files).toEqual(["manifests/stem-wavs-manifest.json", ...result.manifest.stems.map((stem) => stem.packPath)]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(result.manifest.sizeSummary).toMatchObject({
      expectedFileCount: paths.length,
      renderedFileCount: paths.length,
      missingSizePaths: []
    });
    expect(result.manifest.sizeSummary.totalSizeBytes).toBe(result.entries.reduce((sum, entry) => sum + entry.size, 0));
    expect(result.manifest.sizeSummary.audioSizeBytes).toBe(
      result.entries
        .filter((entry) => entry.path.startsWith("audio/"))
        .reduce((sum, entry) => sum + entry.size, 0)
    );
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.format === "wav")).toBe(true);
    expect(result.manifest.audio.current.sampleRate).toBe(48000);
    expect(result.manifest.audio.current.normalization).toEqual({ mode: "off" });
    expect(result.manifest.audio.current.dither).toEqual({ mode: "tpdf", appliesTo: "fixed-point-pcm" });
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.sampleRate === 48000)).toBe(true);
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.normalization.mode === "off")).toBe(true);
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.dither.mode === "tpdf")).toBe(true);
    expect(new Set(renderProfiles.map((profile) => profile.sampleRate))).toEqual(new Set([48000]));
    expect(new Set(renderProfiles.map((profile) => profile.channelMode))).toEqual(new Set(["stereo"]));
    expect(new Set(renderProfiles.map((profile) => profile.normalize))).toEqual(new Set([false]));
    expect(new Set(renderProfiles.map((profile) => profile.dither))).toEqual(new Set(["tpdf"]));
    expect(progress.some((item) => item.startsWith("Assembling stem ZIP:"))).toBe(true);
  });

  it("creates stem export manifests without section-loop-only warnings", () => {
    const project = createDemoProject();
    project.timeline.clips = project.timeline.clips.filter((clip) => clip.type !== "generated-section");

    const manifest = createStemExportManifest(project);

    expect(manifest.warnings.join("\n")).not.toContain("No generated sections are available");
    expect(manifest.notes.join("\n")).toContain("single ZIP archive");
    expect(manifest.mediaPortability).toMatchObject({ embeddedSourceProjectPortable: true, needsCollectionOrRelinkCount: 0 });
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

  it("calculates section loop metadata with active meter-map seconds", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];
    const section = project.timeline.clips.find((clip) => clip.type === "generated-section")!;
    section.startBar = 2;
    section.barLength = 2;

    const loop = createSectionLoopMetadata(project).find((item) => item.sourceClipId === section.id)!;

    expect(loop.startBar).toBe(2);
    expect(loop.endBar).toBe(4);
    expect(loop.lengthSeconds).toBeCloseTo(3.25, 5);
  });

  it("builds a downloadable section-loop ZIP with manifest and deterministic paths", async () => {
    const project = createDemoProject();
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.sampleRate = 44100;
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.settings.channelMode = "stereo";
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.settings.normalize = false;
    project.exportProfiles.find((profile) => profile.id === "section-loops")!.sampleRate = 48000;
    project.exportProfiles.find((profile) => profile.id === "section-loops")!.settings.channelMode = "mono";
    project.exportProfiles.find((profile) => profile.id === "section-loops")!.settings.normalize = "peak";
    const progress: string[] = [];
    const renderProfiles: Array<{ sampleRate?: number; tailSeconds?: unknown; channelMode?: unknown; normalize?: unknown }> = [];
    const result = await createSectionLoopZipBlob(project, {
      renderWav: async (renderProject) => {
        const wavProfile = renderProject.exportProfiles.find((profile) => profile.id === "full-song-wav");
        renderProfiles.push({ sampleRate: wavProfile?.sampleRate, tailSeconds: wavProfile?.settings.tailSeconds, channelMode: wavProfile?.settings.channelMode, normalize: wavProfile?.settings.normalize });
        return new Blob([`bars:${renderProject.timeline.bars}:clips:${renderProject.timeline.clips.length}`], { type: "audio/wav" });
      },
      onProgress: (label, detail) => {
        progress.push(`${label}:${detail}`);
      }
    });
    const paths = result.entries.map((entry) => entry.path);

    expect(result.blob.type).toBe("application/zip");
    expect(result.blob.size).toBeGreaterThan(128);
    expect(result.selfCheck).toMatchObject({ ok: true, checkedFileCount: paths.length, audioFileCount: result.manifest.sectionLoops.length });
    expect(paths).toContain("manifests/section-loops-manifest.json");
    expect(result.manifest.kind).toBe("section-loop-wavs");
    expect(result.manifest.sectionLoops.every((loop) => paths.includes(loop.packPath))).toBe(true);
    expect(result.manifest.files).toEqual(["manifests/section-loops-manifest.json", ...result.manifest.sectionLoops.map((loop) => loop.packPath)]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(result.manifest.sizeSummary).toMatchObject({
      expectedFileCount: paths.length,
      renderedFileCount: paths.length,
      missingSizePaths: []
    });
    expect(result.manifest.sizeSummary.totalSizeBytes).toBe(result.entries.reduce((sum, entry) => sum + entry.size, 0));
    expect(result.manifest.sizeSummary.audioSizeBytes).toBe(
      result.entries
        .filter((entry) => entry.path.startsWith("audio/"))
        .reduce((sum, entry) => sum + entry.size, 0)
    );
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.format === "wav")).toBe(true);
    expect(result.manifest.audio.current.sampleRate).toBe(48000);
    expect(result.manifest.audio.current.normalization).toEqual({ mode: "peak", targetPeak: 0.95 });
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.sampleRate === 48000)).toBe(true);
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.normalization.mode === "peak")).toBe(true);
    expect(new Set(renderProfiles.map((profile) => profile.sampleRate))).toEqual(new Set([48000]));
    expect(new Set(renderProfiles.map((profile) => profile.tailSeconds))).toEqual(new Set([0]));
    expect(new Set(renderProfiles.map((profile) => profile.channelMode))).toEqual(new Set(["mono"]));
    expect(new Set(renderProfiles.map((profile) => profile.normalize))).toEqual(new Set(["peak"]));
    expect(progress.some((item) => item.startsWith("Assembling section-loop ZIP:"))).toBe(true);
  });

  it("creates section-loop export manifests without self-contradictory missing-loop warnings", () => {
    const project = createDemoProject();

    const manifest = createSectionLoopExportManifest(project);

    expect(manifest.warnings.join("\n")).not.toContain("No generated sections are available");
    expect(manifest.notes.join("\n")).toContain("single ZIP archive");
    expect(manifest.mediaPortability).toMatchObject({ embeddedSourceProjectPortable: true, needsCollectionOrRelinkCount: 0 });
  });

  it("builds section-only render projects for loop WAV export", () => {
    const project = createDemoProject();
    project.tracks.forEach((track) => {
      if (track.trackType === "generated") track.active = false;
    });
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
    expect(renderProject.tracks.filter((track) => track.trackType === "generated").every((track) => track.active && !track.mute && !track.solo)).toBe(true);
    expect(renderProject.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings.tailSeconds).toBe(0);
  });

  it("builds selected-clip render projects for freeze WAV export", () => {
    const project = createDemoProject();
    project.timeline.markers.push({ id: "cue", bar: 3, name: "Cue" });
    project.timeline.loop.enabled = true;
    const source = project.timeline.clips[0];
    const result = projectForClipRender(project, source.id)!;

    expect(result.clip.id).toBe(source.id);
    expect(result.project.timeline.clips).toHaveLength(1);
    expect(result.project.timeline.clips[0]).toMatchObject({
      id: source.id,
      startBar: 1,
      muted: false
    });
    expect(result.project.timeline.markers).toEqual([]);
    expect(result.project.timeline.loop.enabled).toBe(false);
    expect(result.project.timeline.bars).toBe(Math.ceil(source.barLength));
    expect(result.project.exportProfiles.find((profile) => profile.id === "full-song-wav")?.settings.tailSeconds).toBe(0.25);
  });

  it("keeps selected-clip freeze render projects audible when the source folder is muted", () => {
    const audioTrack = addTrackToProject(createDemoProject(), "live-instrument");
    const imported = addImportedAudioMedia(audioTrack.project, {
      name: "Freeze Source.wav",
      durationSeconds: 2,
      sampleRate: 44100,
      channels: 2,
      sizeBytes: 2048
    });
    const placed = placeAudioClipOnTrack(imported.project, imported.item.id, audioTrack.trackId, 1);
    const source = placed.project.timeline.clips.find((clip) => clip.id === placed.clipId)!;
    const withFolder = addTrackToProject(placed.project, "folder");
    const assigned = setTrackFolder(withFolder.project, audioTrack.trackId, withFolder.trackId);
    const folderMuted = toggleTrackMute(assigned, withFolder.trackId);
    const result = projectForClipRender(folderMuted, source.id)!;
    const sourceTrack = result.project.tracks.find((track) => track.id === audioTrack.trackId)!;
    const folder = result.project.tracks.find((track) => track.id === withFolder.trackId)!;

    expect(folder.mute).toBe(false);
    expect(folder.solo).toBe(false);
    expect(sourceTrack.mute).toBe(false);
    expect(sourceTrack.active).toBe(true);
    expect(trackIsAudible(sourceTrack, result.project.tracks)).toBe(true);
  });

  it("generates Godot and web game manifest previews", () => {
    const project = createDemoProject();
    project.timeline.markers.push({ id: "combat", bar: 5, name: "Combat", markerType: "game-state", gameState: "combat" });

    const godot = createGameExportManifest(project, "godot-adaptive-pack");
    const web = createGameExportManifest(project, "web-game-pack");

    expect(godot.kind).toBe("godot-adaptive-pack");
    expect(web.kind).toBe("web-game-pack");
    expect(godot.stems.length).toBeGreaterThan(0);
    expect(godot.sectionLoops.length).toBeGreaterThan(0);
    expect(godot.markers.find((marker) => marker.id === "combat")).toMatchObject({ id: "combat", gameState: "combat", seconds: expect.any(Number) });
    expect(godot.files).toContain("manifests/godot-adaptive-manifest.json");
    expect(web.files).toContain("manifests/web-game-manifest.json");
    expect(godot.files).toContain(godot.fullMix);
    expect(godot.files).toContain(godot.sourceProject);
    expect(godot.folders).toMatchObject({ stems: "audio/stems/", sections: "audio/sections/" });
    expect(godot.notes.join("\n")).toContain("section loop WAVs are rendered into this pack");
    expect(godot.audio.current).toMatchObject({ format: "wav", codec: "pcm-s16le", mimeType: "audio/wav", status: "implemented" });
    expect(godot.routing).toMatchObject({ sendCount: expect.any(Number), returnCount: expect.any(Number) });
    expect(godot.renderCache).toMatchObject({
      totalCount: expect.any(Number),
      freezeRenderCount: expect.any(Number),
      nativeGeneratedStemCount: expect.any(Number)
    });
    expect(godot.mediaAnalysis).toMatchObject({
      audioMediaCount: expect.any(Number),
      waveformReadyCount: expect.any(Number),
      normalizeReadyClipCount: expect.any(Number)
    });
    expect(godot.mediaPortability).toMatchObject({
      totalMediaCount: 0,
      needsCollectionOrRelinkCount: 0,
      embeddedSourceProjectPortable: true
    });
    expect(web.mediaPortability.embeddedSourceProjectPortable).toBe(true);
    expect(godot.audio.plannedFormats.map((format) => format.format)).toEqual(["flac", "ogg-vorbis", "mp3"]);
    expect(godot.artifacts.map((artifact) => artifact.path)).toEqual(godot.files);
    expect(godot.artifacts.find((artifact) => artifact.role === "full-mix")?.audio?.format).toBe("wav");
    expect(godot.sizeSummary).toMatchObject({
      expectedFileCount: godot.files.length,
      renderedFileCount: 0,
      audioFileCount: 1 + godot.stems.length + godot.sectionLoops.length,
      totalSizeBytes: null,
      audioSizeBytes: null,
      missingSizePaths: godot.files
    });
  });

  it("calculates game marker seconds with active meter-map timing", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];
    project.timeline.markers.push({ id: "metered-cue", bar: 4, name: "Metered Cue", markerType: "game-state", gameState: "combat" });

    const manifest = createGameExportManifest(project, "godot-adaptive-pack");

    expect(manifest.markers.find((marker) => marker.id === "metered-cue")?.seconds).toBeCloseTo(5.25, 5);
  });

  it("describes game-pack delivery targets without claiming target smoke", () => {
    const targets = createGamePackDeliveryTargets();

    expect(targets.map((target) => target.id)).toEqual(["godot-local-loopback", "godot-zip", "web-zip"]);
    expect(targets.find((target) => target.id === "godot-local-loopback")).toMatchObject({
      kind: "godot-adaptive-pack",
      delivery: "local-loopback-with-zip-fallback",
      action: "push-godot-pack",
      supportedAudioFormats: ["wav"],
      targetRuntimeSmoke: "manual-required-before-release-claim"
    });
    expect(targets.every((target) => target.verifierCommand.includes("verify:game-pack"))).toBe(true);
    expect(targets.every((target) => target.targetRuntimeSmoke === "manual-required-before-release-claim")).toBe(true);
  });

  it("builds a downloadable game-pack ZIP with manifest, source, mix, stems and loops", async () => {
    const project = createDemoProject();
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.sampleRate = 48000;
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.settings.normalize = "peak";
    const result = await createGamePackZipBlob(project, "web-game-pack", {
      sourceProjectContents: JSON.stringify(project),
      renderWav: async (renderProject) => new Blob([`bars:${renderProject.timeline.bars}`], { type: "audio/wav" })
    });
    const paths = result.entries.map((entry) => entry.path);

    expect(result.blob.type).toBe("application/zip");
    expect(result.blob.size).toBeGreaterThan(128);
    expect(result.selfCheck).toMatchObject({
      ok: true,
      checkedFileCount: paths.length,
      audioFileCount: 1 + result.manifest.stems.length + result.manifest.sectionLoops.length
    });
    expect(paths).toContain("manifests/web-game-manifest.json");
    expect(paths).toContain(result.manifest.fullMix);
    expect(paths).toContain(result.manifest.sourceProject);
    expect(result.manifest.stems.every((stem) => paths.includes(stem.packPath))).toBe(true);
    expect(result.manifest.sectionLoops.every((loop) => paths.includes(loop.packPath))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
    expect(result.manifest.sizeSummary).toMatchObject({
      expectedFileCount: paths.length,
      renderedFileCount: paths.length,
      missingSizePaths: []
    });
    expect(result.manifest.sizeSummary.totalSizeBytes).toBe(result.entries.reduce((sum, entry) => sum + entry.size, 0));
    expect(result.manifest.sizeSummary.audioSizeBytes).toBe(
      result.entries
        .filter((entry) => entry.path.startsWith("audio/"))
        .reduce((sum, entry) => sum + entry.size, 0)
    );
    for (const entry of result.entries) {
      expect(result.manifest.artifacts.find((artifact) => artifact.path === entry.path)?.sizeBytes).toBe(entry.size);
    }
    expect(result.manifest.audio.current.sampleRate).toBe(48000);
    expect(result.manifest.audio.current.normalization).toEqual({ mode: "peak", targetPeak: 0.95 });
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.sampleRate === 48000)).toBe(true);
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.normalization.mode === "peak")).toBe(true);
  });

  it("reports package self-check failures for missing manifest entries", () => {
    const manifest = createGameExportManifest(createDemoProject(), "web-game-pack");
    const partialEntries = [
      { path: manifest.manifestFile, size: 512 },
      { path: manifest.fullMix, size: 128 }
    ];
    const checked = verifyExportPackageEntries({
      ...manifest,
      artifacts: manifest.artifacts.map((artifact) => ({
        ...artifact,
        sizeBytes: partialEntries.find((entry) => entry.path === artifact.path)?.size ?? null
      })),
      sizeSummary: {
        ...manifest.sizeSummary,
        expectedFileCount: manifest.artifacts.length,
        renderedFileCount: partialEntries.length,
        totalSizeBytes: partialEntries.reduce((sum, entry) => sum + entry.size, 0),
        missingSizePaths: manifest.artifacts
          .filter((artifact) => !partialEntries.some((entry) => entry.path === artifact.path))
          .map((artifact) => artifact.path)
      }
    }, partialEntries);

    expect(checked.ok).toBe(false);
    expect(checked.errors.join("\n")).toContain("Manifest file is missing from ZIP entries");
    expect(checked.errors.join("\n")).toContain("Size summary renderedFileCount");
  });

  it("builds a Godot game-pack ZIP with addon manifest paths and source project", async () => {
    const project = createDemoProject();
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.sampleRate = 48000;
    const result = await createGamePackZipBlob(project, "godot-adaptive-pack", {
      sourceProjectContents: JSON.stringify(project),
      renderWav: async (renderProject) => new Blob([`bars:${renderProject.timeline.bars}`], { type: "audio/wav" })
    });
    const paths = result.entries.map((entry) => entry.path);

    expect(result.manifest.kind).toBe("godot-adaptive-pack");
    expect(result.manifest.manifestFile).toBe("manifests/godot-adaptive-manifest.json");
    expect(paths).toContain("manifests/godot-adaptive-manifest.json");
    expect(paths).toContain(result.manifest.sourceProject);
    expect(result.manifest.sourceProject).toMatch(/^source\/.+\.pocketdaw\.json$/);
    expect(paths).toContain(result.manifest.fullMix);
    expect(result.manifest.fullMix).toMatch(/^audio\/full\/.+-full-mix\.wav$/);
    expect(result.manifest.stems.map((stem) => stem.packPath)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^audio\/stems\/.+-drums-stem\.wav$/),
      expect.stringMatching(/^audio\/stems\/.+-bass-stem\.wav$/),
      expect.stringMatching(/^audio\/stems\/.+-chords-stem\.wav$/),
      expect.stringMatching(/^audio\/stems\/.+-melody-stem\.wav$/),
      expect.stringMatching(/^audio\/stems\/.+-guitar-stem\.wav$/)
    ]));
    expect(result.manifest.stems.every((stem) => paths.includes(stem.packPath))).toBe(true);
    expect(result.manifest.sectionLoops.every((loop) => paths.includes(loop.packPath))).toBe(true);
    expect(result.manifest.artifacts.filter((artifact) => artifact.audio).every((artifact) => artifact.audio?.format === "wav")).toBe(true);
    expect(result.manifest.audio.current.sampleRate).toBe(48000);
    expect(result.manifest.audio.current.normalization).toEqual({ mode: "off" });
    expect(result.manifest.sizeSummary.largestEntry?.path).toBeTruthy();
  });

  it("reserves future codec metadata without changing current WAV pack paths", () => {
    const project = createDemoProject();
    const manifest = createGameExportManifest(project, "godot-adaptive-pack");
    const flac = gamePackAudioCodecMetadata("flac", project.project.sampleRate);
    const ogg = gamePackAudioCodecMetadata("ogg-vorbis", project.project.sampleRate);
    const mp3 = gamePackAudioCodecMetadata("mp3", project.project.sampleRate);

    expect(manifest.fullMix).toMatch(/\.wav$/);
    expect(manifest.stems.every((stem) => stem.packPath.endsWith(".wav"))).toBe(true);
    expect(manifest.sectionLoops.every((loop) => loop.packPath.endsWith(".wav"))).toBe(true);
    expect(manifest.audio.current).toMatchObject({
      format: "wav",
      mimeType: "audio/wav",
      status: "implemented",
      normalization: { mode: "off" },
      targetRuntimeSmoke: "required-before-release-claim"
    });
    expect(flac).toMatchObject({ format: "flac", mimeType: "audio/flac", status: "planned", targetRuntimeSmoke: "required-before-release-claim" });
    expect(ogg).toMatchObject({ format: "ogg-vorbis", mimeType: "audio/ogg", status: "planned", targetRuntimeSmoke: "required-before-release-claim" });
    expect(mp3).toMatchObject({ format: "mp3", mimeType: "audio/mpeg", status: "planned", targetRuntimeSmoke: "required-before-release-claim" });
  });

  it("adds manifest warnings for unresolved runtime-only media and muted tracks", () => {
    let project = createDemoProject();
    const browserOnly = createMediaPoolItem({ kind: "audio", name: "Browser Only.wav", metadata: { runtimeOnly: true } });
    const external = createMediaPoolItem({ kind: "audio", name: "External.wav", uri: "C:\\Sessions\\External.wav" }, [browserOnly]);
    const missing = createMediaPoolItem({ kind: "audio", name: "Missing.wav", uri: "file:///lost/Missing.wav", metadata: { missing: true, unresolved: true } }, [browserOnly, external]);
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, browserOnly), external), missing);
    project.tracks.find((track) => track.id === "guitar")!.mute = true;

    const manifest = createGameExportManifest(project, "web-game-pack");
    const warnings = manifest.warnings.join("\n");

    expect(warnings).toContain("Browser Only.wav");
    expect(warnings).toContain("Missing.wav");
    expect(warnings).toContain("3 media items must be collected or relinked");
    expect(warnings).toContain("Guitar");
    expect(warnings).not.toContain("C:\\Sessions");
    expect(warnings).not.toContain("file:///lost");
    expect(manifest.mediaPortability).toMatchObject({
      totalMediaCount: 3,
      audioMediaCount: 3,
      portableCount: 0,
      copyableExternalCount: 1,
      cacheOnlyCount: 0,
      blockedCount: 2,
      runtimeOnlyCount: 1,
      missingOrUnresolvedCount: 1,
      needsCollectionOrRelinkCount: 3,
      embeddedSourceProjectPortable: false
    });
    expect(manifest.sharedMediaPortability).toMatchObject({
      localReferenceFieldCount: 2,
      localReferenceItemCount: 2,
      portableForSharing: false
    });
    expect(JSON.stringify(manifest.mediaPortability)).not.toContain("C:\\");
  });

  it("adds manifest warnings for folder group mute and solo scope", () => {
    const withFolder = addTrackToProject(createDemoProject(), "folder");
    let project = setTrackFolder(withFolder.project, "bass", withFolder.trackId);
    project = toggleTrackMute(project, withFolder.trackId);
    project = toggleTrackSolo(project, withFolder.trackId);

    const manifest = createGameExportManifest(project, "godot-adaptive-pack");
    const warnings = manifest.warnings.join("\n");

    expect(warnings).toContain("Folder Folder mutes child lanes in audible renders: Bass");
    expect(warnings).toContain("Soloed tracks and folders restrict audible renders to their solo scope: Folder");
  });

  it("builds portable embedded source projects without collected local provenance", () => {
    let project = createDemoProject();
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected.wav",
      uri: "project-media/Collected.wav",
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/Collected.wav",
        originalUri: "C:\\Sessions\\Collected.wav",
        nativePath: "C:\\Songs\\project-media\\Collected.wav",
        nativeDecodedCachePath: "C:\\Songs\\project-cache\\native-audio\\imports\\Collected.wav",
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/Collected.wav",
        lastReloadSourcePath: "C:\\Sessions\\Collected.wav"
      }
    });
    project = addMediaPoolItem(project, collected);

    const sourceProject = buildPortableGamePackSourceProjectFile(project);
    const parsed = JSON.parse(sourceProject);
    const media = parsed.mediaPool.find((item: { id: string }) => item.id === collected.id);

    expect(media.uri).toBe("project-media/Collected.wav");
    expect(media.metadata.projectRelativePath).toBe("project-media/Collected.wav");
    expect(media.metadata.nativeDecodedCacheRelativePath).toBe("project-cache/native-audio/imports/Collected.wav");
    expect(sourceProject).not.toContain("C:\\");
    expect(sourceProject).not.toContain("originalUri");
    expect(sourceProject).not.toContain("nativePath");
    expect(sourceProject).not.toContain("lastReloadSourcePath");
    expect(createGameExportManifest(project, "web-game-pack").sharedMediaPortability).toMatchObject({
      localReferenceFieldCount: 0,
      portableForSharing: true
    });
  });

  it("adds manifest warnings for project invariant errors", () => {
    const project = createDemoProject();
    project.timeline.clips[0].trackId = "missing-track";

    const manifest = createGameExportManifest(project, "godot-adaptive-pack");

    expect(manifest.warnings.join("\n")).toContain("Project invariant error");
    expect(manifest.warnings.join("\n")).toContain("missing track");
  });

  it("summarizes render-cache health and warns about invalidated cache entries in game manifests", () => {
    const project = createDemoProject();
    project.renderCache.push(
      {
        id: "freeze_1",
        sourceClipId: project.timeline.clips[0].id,
        mediaPoolItemId: "frozen_audio",
        profileId: "freeze-selected-clip-wav",
        createdAt: "2026-06-28T12:00:00.000Z",
        invalidated: false,
        metadata: { cacheKind: "freeze-render" }
      },
      {
        id: "native_stem_1",
        sourceClipId: project.timeline.clips[0].id,
        mediaPoolItemId: "native_stem_audio",
        profileId: "native-generated-stem",
        createdAt: "2026-06-28T12:05:00.000Z",
        invalidated: true,
        metadata: { cacheKind: "native-generated-stem" }
      }
    );

    const manifest = createGameExportManifest(project, "godot-adaptive-pack");

    expect(manifest.renderCache).toMatchObject({
      totalCount: 2,
      activeCount: 1,
      invalidatedCount: 1,
      linkedMediaCount: 2,
      unlinkedCount: 0,
      freezeRenderCount: 1,
      nativeGeneratedStemCount: 1,
      latestCreatedAt: "2026-06-28T12:05:00.000Z",
      byKind: {
        "freeze-render": 1,
        "native-generated-stem": 1
      }
    });
    expect(manifest.warnings.join("\n")).toContain("1 render-cache item is invalidated");
  });

  it("summarizes audio media analysis and warns about limited waveform coverage in game manifests", () => {
    const imported = addImportedAudioMedia(createDemoProject(), {
      name: "Missing Analysis.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [], waveformNeedsRefresh: true }
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1);

    const manifest = createGameExportManifest(placed.project, "web-game-pack");

    expect(manifest.mediaAnalysis).toMatchObject({
      audioMediaCount: 1,
      audioClipCount: 1,
      waveformReadyCount: 0,
      waveformMissingCount: 1,
      normalizeReadyClipCount: 0,
      clipsMissingWaveformCount: 1,
      staleAnalysisCount: 1
    });
    expect(manifest.warnings.join("\n")).toContain("1 audio clip is missing waveform analysis");
    expect(manifest.warnings.join("\n")).toContain("1 audio media item has stale waveform analysis flags");
  });

  it("adds manifest routing counts for pre-fader sends without planned-mode warnings", () => {
    const ret = addReturnTrack(createDemoProject(), "Delay Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.4);
    const pre = setTrackSendMode(sent, "bass", ret.trackId, "pre-fader");

    const manifest = createGameExportManifest(pre, "web-game-pack");

    expect(manifest.routing.preFaderSendCount).toBe(1);
    expect(manifest.routing.sendCount).toBeGreaterThanOrEqual(1);
    expect(manifest.warnings.join("\n")).not.toContain("current render graphs are post-fader only");
  });
});
