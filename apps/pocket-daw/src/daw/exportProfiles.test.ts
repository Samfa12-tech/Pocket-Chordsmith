import { describe, expect, it, vi } from "vitest";
import { createEmptyPocketDawProject } from "./dawProject";
import { createGamePackZipBlob } from "./exportJobs";
import { createDefaultExportProfiles, validateExportProfile } from "./exportProfiles";
import type { ExportProfile } from "./schema";

describe("export profile codec foundation", () => {
  it("keeps future compressed/interchange profiles disabled by default", () => {
    const profiles = createDefaultExportProfiles();
    const futureIds = ["full-song-flac", "stem-flacs", "godot-ogg-pack", "web-ogg-pack", "full-song-mp3", "aiff-interchange"];

    for (const id of futureIds) {
      const profile = profiles.find((item) => item.id === id);
      expect(profile, id).toBeDefined();
      expect(profile?.enabled, id).toBe(false);
      expect(profile?.future, id).toBe(true);
      expect(validateExportProfile(profile!).ok, id).toBe(false);
    }
  });

  it("keeps the current stem WAV profile as a manifest-backed ZIP archive", () => {
    const profile = createDefaultExportProfiles().find((item) => item.id === "stem-wavs");

    expect(profile).toMatchObject({
      enabled: true,
      format: "wav",
      scope: "stems",
      settings: {
        mode: "zip-archive",
        manifest: true
      }
    });
    expect(validateExportProfile(profile!).ok).toBe(true);
  });

  it("keeps the current section-loop WAV profile as a manifest-backed ZIP archive", () => {
    const profile = createDefaultExportProfiles().find((item) => item.id === "section-loops");

    expect(profile).toMatchObject({
      enabled: true,
      format: "wav",
      scope: "sections",
      settings: {
        renderWavs: true,
        mode: "zip-archive",
        manifest: true
      }
    });
    expect(validateExportProfile(profile!).ok).toBe(true);
  });

  it("rejects planned audio formats instead of treating them as writable WAVs", () => {
    for (const format of ["flac", "ogg-vorbis", "mp3", "aiff", "aif"] as const) {
      const result = validateExportProfile(profileWithFormat(format));

      expect(result.ok, format).toBe(false);
      expect(result.errors.join(" "), format).toContain("planned");
      expect(result.errors.join(" "), format).toContain("Use WAV export for now");
    }
  });

  it("rejects planned audio codec settings even when the wrapper format is json", () => {
    for (const audioCodec of ["flac", "ogg-vorbis", "mp3", "aiff", "aif"] as const) {
      const result = validateExportProfile({
        ...profileWithFormat("json"),
        settings: { audioCodec }
      });

      expect(result.ok, audioCodec).toBe(false);
      expect(result.errors.join(" "), audioCodec).toContain("audioCodec=");
      expect(result.errors.join(" "), audioCodec).toContain("Use WAV export for now");
    }
  });

  it("rejects WAV profiles that request unsupported bit depth or sample rate", () => {
    const badDepth = validateExportProfile({
      ...profileWithFormat("wav"),
      bitDepth: 24,
      sampleRate: 44100
    });
    const badRate = validateExportProfile({
      ...profileWithFormat("wav"),
      bitDepth: 16,
      sampleRate: 384000
    });

    expect(badDepth.ok).toBe(false);
    expect(badDepth.errors.join(" ")).toContain("current WAV encoder writes 16-bit PCM");
    expect(badRate.ok).toBe(false);
    expect(badRate.errors.join(" ")).toContain("outside the supported 22050-192000 Hz range");
  });

  it("rejects mpg as a non-audio export target", () => {
    const result = validateExportProfile(profileWithFormat("mpg"));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("not a Pocket DAW audio export target");
    expect(result.errors.join(" ")).toContain("MP3");
  });

  it("rejects unsupported game-pack audioCodec settings before rendering starts", async () => {
    const project = createEmptyPocketDawProject();
    project.exportProfiles = project.exportProfiles.map((profile) => (
      profile.id === "godot-adaptive-pack"
        ? { ...profile, settings: { ...profile.settings, audioCodec: "ogg-vorbis" } }
        : profile
    ));
    const renderWav = vi.fn(async () => new Blob(["wav"]));

    await expect(createGamePackZipBlob(project, "godot-adaptive-pack", {
      renderWav,
      sourceProjectContents: "{}"
    })).rejects.toThrow(/Ogg Vorbis encoder is wired yet/);
    expect(renderWav).not.toHaveBeenCalled();
  });

  it("continues to allow the current WAV game-pack profile", async () => {
    const project = createEmptyPocketDawProject();
    const renderWav = vi.fn(async () => new Blob(["wav"]));

    const result = await createGamePackZipBlob(project, "godot-adaptive-pack", {
      renderWav,
      sourceProjectContents: "{}"
    });

    expect(result.manifest.fullMix.endsWith(".wav")).toBe(true);
    expect(result.manifest.stems.every((stem) => stem.packPath.endsWith(".wav"))).toBe(true);
    expect(result.manifest.sectionLoops.every((loop) => loop.packPath.endsWith(".wav"))).toBe(true);
    expect(renderWav).toHaveBeenCalled();
  });
});

function profileWithFormat(format: ExportProfile["format"]): ExportProfile {
  return {
    id: `test-${format}`,
    name: `Test ${format}`,
    format,
    enabled: true,
    scope: "full-song",
    settings: {}
  };
}
