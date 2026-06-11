import { describe, expect, it } from "vitest";
import { renderTimelineEvents, resolveClipEvents } from "../src/audio/eventRenderer";
import { createDemoProject } from "../src/demo/demoProject";
import type { Clip, ClipType } from "../src/daw/schema";

describe("event renderer", () => {
  it("renders audible demo events for generated tracks", () => {
    const events = renderTimelineEvents(createDemoProject());
    const trackIds = new Set(events.map((event) => event.trackId));

    expect(events.length).toBeGreaterThan(0);
    expect(Array.from(trackIds)).toEqual(expect.arrayContaining(["drums", "bass", "chords", "melody", "guitar"]));
    expect(events[0]).toMatchObject({ trackId: "drums", time: 0 });
  });

  it("renders guitar with an explicit tone and usable velocity", () => {
    const events = renderTimelineEvents(createDemoProject());
    const guitarEvents = events.filter((event) => event.trackId === "guitar");

    expect(guitarEvents.length).toBeGreaterThan(0);
    expect(guitarEvents[0].instrument).toBeTruthy();
    expect(guitarEvents[0].velocity).toBeGreaterThan(0.4);
    expect(guitarEvents[0].midiNotes?.length).toBeGreaterThanOrEqual(3);
    expect(guitarEvents[0].midiNotes?.[0]).toBe(45);
    expect(guitarEvents[0].direction).toBe("down");
  });

  it("uses Chordsmith-style bass peaks", () => {
    const events = renderTimelineEvents(createDemoProject());
    const bassEvent = events.find((event) => event.trackId === "bass");

    expect(bassEvent?.velocity).toBeCloseTo(0.34, 5);
  });

  it("safely ignores clip types without resolvers or payloads", () => {
    const project = createDemoProject();
    const base = project.timeline.clips[0];
    const futureTypes: ClipType[] = ["generated-pattern", "audio", "automation", "marker"];

    futureTypes.forEach((type) => {
      const clip: Clip = { ...base, id: `future-${type}`, type, muted: false };
      expect(resolveClipEvents(project, clip)).toEqual([]);
    });

    expect(resolveClipEvents(project, { ...base, id: "midi-empty", type: "midi", muted: false, metadata: {} })).toEqual([]);
  });
});
