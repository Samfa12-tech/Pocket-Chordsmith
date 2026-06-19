import { describe, expect, it } from "vitest";
import { chordsmithOfflineLofiTextureForProject, chordsmithOfflineTrackExportGain } from "../src/audio/offlineRender";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { CHORDSMITH_OFFLINE_STEM_GAIN } from "../../../packages/pocket-audio-core/src/performance/stem-mix.js";

describe("offline WAV render parity helpers", () => {
  it("extracts Chordsmith lofi texture settings for continuous export texture", () => {
    const texture = chordsmithOfflineLofiTextureForProject(createLofiTemplateProject());

    expect(texture).toMatchObject({
      enabled: true,
      vinylCrackle: 0.08,
      tapeHiss: 0.05,
      wowFlutter: 0.03,
      warmth: 0.18,
      lowPassAge: 0.24,
      bitCrush: 0.01
    });
  });

  it("does not add offline texture for non-lofi or disabled Chordsmith imports", () => {
    expect(chordsmithOfflineLofiTextureForProject(createDemoProject())).toBeNull();

    const disabled = createLofiTemplateProject();
    const normalized = disabled.sourceRefs[0]?.normalized as Record<string, unknown>;
    normalized.lofiTexture = { enabled: false, vinylCrackle: 0.5, tapeHiss: 0.5 };

    expect(chordsmithOfflineLofiTextureForProject(disabled)).toBeNull();
  });

  it("applies Chordsmith WAV stem staging to generated Chordsmith tracks only", () => {
    const project = createDemoProject();
    const chords = project.tracks.find((track) => track.id === "chords");
    const drums = project.tracks.find((track) => track.id === "drums");
    const master = project.tracks.find((track) => track.id === "master");
    expect(chords).toBeTruthy();
    expect(drums).toBeTruthy();
    expect(master).toBeTruthy();

    expect(chordsmithOfflineTrackExportGain(project, chords!, 0.72)).toBeCloseTo(0.72 * CHORDSMITH_OFFLINE_STEM_GAIN.chords, 6);
    expect(chordsmithOfflineTrackExportGain(project, drums!, 1.2)).toBeCloseTo(1.2 * CHORDSMITH_OFFLINE_STEM_GAIN.drums, 6);
    expect(chordsmithOfflineTrackExportGain(project, master!, 0.82)).toBeCloseTo(0.82, 6);

    const withoutChordsmithSource = { ...project, sourceRefs: [] };
    expect(chordsmithOfflineTrackExportGain(withoutChordsmithSource, chords!, 0.72)).toBeCloseTo(0.72, 6);
  });
});
