import { describe, expect, it } from "vitest";
import { migratePocketDawProject } from "../src/compatibility/migrations";

describe("schema migrations", () => {
  it("fills required v2 future-ready containers", () => {
    const migrated = migratePocketDawProject({
      app: "PocketDAW",
      schemaVersion: 1,
      project: { title: "Old", bpm: 90, futureProjectField: "keep" },
      timeline: { clips: [], futureTimelineField: "keep" },
      futureRootField: { keep: true }
    });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.mediaPool).toEqual([]);
    expect(migrated.renderCache).toEqual([]);
    expect(migrated.automation.lanes).toEqual([]);
    expect(migrated.routing.masterTrackId).toBe("master");
    expect(migrated.fx.chains.length).toBe(migrated.tracks.length);
    expect(migrated.audioDeviceSettings.host).toBe("wasapi");
    expect((migrated as unknown as Record<string, unknown>).futureRootField).toEqual({ keep: true });
    expect((migrated.project as unknown as Record<string, unknown>).futureProjectField).toBe("keep");
    expect((migrated.timeline as unknown as Record<string, unknown>).futureTimelineField).toBe("keep");
  });
});
