import { describe, expect, it } from "vitest";
import { normalizeRenderedEventForPocketAudioCore } from "../src/audio/pocketAudioCoreAdapter";
import type { RenderedEvent } from "../src/audio/eventRenderer";

describe("Pocket Audio Core adapter", () => {
  it("normalizes rendered events into a stable core-ready contract", () => {
    const event: RenderedEvent = {
      id: "clip_1_note",
      clipId: "clip_1",
      kind: "melody",
      trackId: "melody",
      role: "melody",
      time: 1.1234567,
      duration: 0.5,
      bar: 1,
      step: 0,
      midi: 129,
      velocity: 1.2,
      pan: -0.4,
      accent: true
    };

    expect(normalizeRenderedEventForPocketAudioCore(event)).toEqual({
      id: "clip_1_note",
      clipId: "clip_1",
      trackId: "melody",
      role: "melody",
      kind: "melody",
      startSeconds: 1.123457,
      durationSeconds: 0.5,
      midiNotes: [127],
      velocity: 1,
      pan: -0.4,
      instrument: "melody_preview",
      articulation: "note",
      accent: true
    });
  });
});
