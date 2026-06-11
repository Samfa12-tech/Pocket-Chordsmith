import { describe, expect, it } from "vitest";
import { createDefaultExportProfiles } from "../src/daw/exportProfiles";

describe("export profiles", () => {
  it("includes required v0 and future profiles", () => {
    const ids = createDefaultExportProfiles().map((profile) => profile.id);
    expect(ids).toContain("full-song-wav");
    expect(ids).toContain("full-song-midi");
    expect(ids).toContain("godot-adaptive-pack");
    expect(ids).toContain("web-game-pack");
  });
});
