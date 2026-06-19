import { describe, expect, it } from "vitest";
import { createDefaultExportProfiles } from "../src/daw/exportProfiles";

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
        renderWavs: true,
        manifest: true
      }
    });
  });
});
