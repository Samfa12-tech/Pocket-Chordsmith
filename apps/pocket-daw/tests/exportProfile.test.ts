import { describe, expect, it } from "vitest";
import { createDefaultExportProfiles, validateExportProfile } from "../src/daw/exportProfiles";
import { setExportProfileSettingCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";

describe("export profiles", () => {
  it("includes required v0 and future profiles", () => {
    const profiles = createDefaultExportProfiles();
    const ids = profiles.map((profile) => profile.id);
    expect(ids).toContain("full-song-wav");
    expect(ids).toContain("full-song-midi");
    expect(ids).toContain("section-loops");
    expect(ids).toContain("godot-adaptive-pack");
    expect(ids).toContain("web-game-pack");
    expect(profiles.find((profile) => profile.id === "section-loops")).toMatchObject({
      format: "wav",
      settings: {
        channelMode: "stereo",
        normalize: false,
        renderWavs: true,
        manifest: true,
        mode: "zip-archive"
      }
    });
    expect(profiles.find((profile) => profile.id === "stem-wavs")).toMatchObject({
      format: "wav",
      settings: {
        channelMode: "stereo",
        normalize: false,
        manifest: true,
        mode: "zip-archive"
      }
    });
  });

  it("updates full-song WAV render settings through an undoable command", () => {
    let state = createInitialState();

    state = setExportProfileSettingCommand(state, "full-song-wav", "sampleRate", 48000);
    state = setExportProfileSettingCommand(state, "full-song-wav", "bitDepth", 32);
    state = setExportProfileSettingCommand(state, "full-song-wav", "tailSeconds", 2.35);
    state = setExportProfileSettingCommand(state, "full-song-wav", "channelMode", "mono");
    state = setExportProfileSettingCommand(state, "full-song-wav", "normalize", "peak");
    state = setExportProfileSettingCommand(state, "full-song-wav", "dither", "tpdf");

    const profile = state.undoStack.present.exportProfiles.find((item) => item.id === "full-song-wav");
    expect(profile).toMatchObject({
      sampleRate: 48000,
      bitDepth: 32,
      settings: { tailSeconds: 2.35, channelMode: "mono", normalize: "peak", dither: "tpdf" }
    });
    expect(state.undoStack.past.length).toBe(6);
    expect(state.status).toBe("Set Full Song WAV dither to TPDF.");
  });

  it("validates WAV bit-depth support explicitly", () => {
    const profile = createDefaultExportProfiles().find((item) => item.id === "full-song-wav")!;

    profile.bitDepth = 24;
    expect(validateExportProfile(profile).ok).toBe(true);

    profile.bitDepth = 32;
    expect(validateExportProfile(profile).ok).toBe(true);

    profile.bitDepth = 48 as 32;
    const result = validateExportProfile(profile);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("bitDepth=48");
  });

  it("validates WAV channel modes explicitly", () => {
    const profile = createDefaultExportProfiles().find((item) => item.id === "full-song-wav")!;

    profile.settings.channelMode = "mono";
    expect(validateExportProfile(profile).ok).toBe(true);

    profile.settings.channelMode = "5.1";
    const result = validateExportProfile(profile);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("channelMode=5.1");
  });

  it("validates WAV normalization modes explicitly", () => {
    const profile = createDefaultExportProfiles().find((item) => item.id === "full-song-wav")!;

    profile.settings.normalize = "peak";
    expect(validateExportProfile(profile).ok).toBe(true);

    profile.settings.normalize = "lufs";
    const result = validateExportProfile(profile);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("normalize=lufs");
  });

  it("validates WAV dither modes explicitly", () => {
    const profile = createDefaultExportProfiles().find((item) => item.id === "full-song-wav")!;

    profile.settings.dither = "tpdf";
    expect(validateExportProfile(profile).ok).toBe(true);

    profile.settings.dither = "noise-shaped";
    const result = validateExportProfile(profile);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("dither=noise-shaped");
  });
});
