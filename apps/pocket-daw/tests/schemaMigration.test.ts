import { describe, expect, it } from "vitest";
import { migratePocketDawProject } from "../src/compatibility/migrations";
import { DRUM_LANE_DEFS } from "../src/daw/drumLanes";

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
    expect(migrated.fx.chains.length).toBe(migrated.tracks.length + DRUM_LANE_DEFS.length);
    expect(migrated.fx.chains.filter((chain) => chain.metadata?.parentTrackId === "drums")).toHaveLength(DRUM_LANE_DEFS.length);
    expect(Object.keys((migrated.tracks.find((track) => track.role === "drums")?.metadata?.drumLanes || {}) as Record<string, unknown>))
      .toEqual(DRUM_LANE_DEFS.map((lane) => lane.id));
    expect(migrated.audioDeviceSettings.host).toBe("wasapi");
    expect(migrated.sourceRefs[0]).toMatchObject({ sourceType: "pocket-chordsmith", title: "Old" });
    expect(migrated.timeline.clips[0]).toMatchObject({ type: "generated-section", sectionId: "A" });
    expect((migrated as unknown as Record<string, unknown>).futureRootField).toEqual({ keep: true });
    expect((migrated.project as unknown as Record<string, unknown>).futureProjectField).toBe("keep");
    expect((migrated.timeline as unknown as Record<string, unknown>).futureTimelineField).toBe("keep");
  });

  it("normalizes malicious nested project structures without bumping schema", () => {
    const migrated = migratePocketDawProject({
      app: "PocketDAW",
      schemaVersion: 2,
      project: { title: "Unsafe", bpm: 9999, timeSig: "bad", swing: 999 },
      tracks: [{
        id: `track" onclick=alert(1)`,
        name: `<img onerror=alert(1)>`,
        trackType: "audio",
        role: "bass",
        volume: 99,
        pan: -99,
        mute: "nope",
        solo: true,
        armed: true,
        colour: "red;background:url(javascript:alert(1))",
        routing: { outputId: "master", inputIds: ["input"], sendIds: [] },
        automationLaneIds: [`lane" onclick=alert(1)`]
      }],
      timeline: {
        bars: -5,
        loop: { enabled: true, startBar: 8, endBar: 2 },
        markers: [{ id: `marker" onclick=alert(1)`, bar: -1, name: `<script>bad</script>`, color: "url(javascript:bad)" }],
        clips: [{
          id: `clip" onclick=alert(1)`,
          type: "audio",
          trackId: `track" onclick=alert(1)`,
          mediaPoolItemId: `media" onclick=alert(1)`,
          startBar: -100,
          barLength: "bad",
          name: `<script>clip</script>`,
          color: "red;background:url(javascript:alert(1))",
          transforms: { transpose: 999, octave: -99, gain: 999, stemMutes: { "bad/stem": true } }
        }]
      },
      mediaPool: [{
        id: `media" onclick=alert(1)`,
        kind: "audio",
        name: `<img onerror=alert(1)>`,
        uri: "project-media/Loop.wav",
        durationSeconds: -1,
        sampleRate: 999999,
        channels: 999,
        metadata: { keep: true }
      }],
      automation: {
        lanes: [{
          id: `lane" onclick=alert(1)`,
          trackId: `track" onclick=alert(1)`,
          targetPath: `volume"><script>alert(1)</script>`,
          unit: "not-a-unit",
          points: [{ bar: -1, value: 999, curve: "bad" }],
          enabled: true
        }]
      }
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.project.bpm).toBe(240);
    expect(migrated.project.timeSig).toBe(4);
    expect(migrated.project.swing).toBe(0.35);
    expect(migrated.tracks[0]).toMatchObject({
      id: "track-onclick-alert-1",
      volume: 1.2,
      pan: -1,
      colour: "#40d8ff"
    });
    expect(migrated.timeline.loop.endBar).toBeGreaterThan(migrated.timeline.loop.startBar);
    expect(migrated.timeline.clips[0]).toMatchObject({
      id: "clip-onclick-alert-1",
      trackId: "track-onclick-alert-1",
      mediaPoolItemId: "media-onclick-alert-1",
      startBar: 1,
      barLength: 1,
      color: "#40d8ff"
    });
    expect(migrated.timeline.clips[0].transforms.transpose).toBe(48);
    expect(migrated.mediaPool[0]).toMatchObject({ id: "media-onclick-alert-1", sampleRate: 192000, channels: 32 });
    expect(migrated.automation.lanes[0]).toMatchObject({
      id: "lane-onclick-alert-1",
      trackId: "track-onclick-alert-1",
      unit: "linear",
      points: [{ bar: 1, value: 120, curve: "linear" }]
    });
    expect(migrated.tracks[0].automationLaneIds).toEqual(["lane-onclick-alert-1"]);
  });
});
