import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { normalizeRenderedEventsForPocketAudioCore } from "../src/audio/pocketAudioCoreAdapter";
import { PCS_PARITY_FIXTURES } from "./pcsParityFixtures";

describe("Pocket Chordsmith/Core/DAW parity fixtures", () => {
  it.each(PCS_PARITY_FIXTURES)("$name imports and renders deterministically", ({ raw, expected }) => {
    const pcs = sanitizePocketChordsmithProject(raw);
    const daw = createDawProjectFromChordsmithProject(pcs);
    const events = renderTimelineEvents(daw);
    const coreEvents = normalizeRenderedEventsForPocketAudioCore(events);

    expect(daw.sourceRefs[0].original).toMatchObject(raw);
    expect(daw.timeline.clips.map((clip) => clip.sectionId)).toEqual(expected.sequence);
    expect(daw.timeline.clips.map((clip) => clip.barLength)).toEqual(expected.bars);
    expected.eventKinds.forEach((kind) => {
      expect(events.some((event) => event.kind === kind)).toBe(true);
    });
    expect(coreEvents.length).toBe(events.length);
    expect(coreEvents.every((event) => event.startSeconds >= 0 && event.durationSeconds > 0)).toBe(true);

    if (expected.melodyTrackCount) {
      expect(daw.tracks.filter((track) => track.role === "melody")).toHaveLength(expected.melodyTrackCount);
    }
    if (expected.guitarTone) {
      expect(events.find((event) => event.kind === "guitar")?.instrument).toBe(expected.guitarTone);
    }
    if (expected.hasSlide) {
      expect(events.some((event) => typeof event.slideMidi === "number")).toBe(true);
    }
    if (expected.hasTuplet) {
      expect(events.some((event) => event.id.includes("tuplet") || event.time % 0.001 !== 0)).toBe(true);
    }
  });
});
