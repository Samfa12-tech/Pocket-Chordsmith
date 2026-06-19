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
      bar: 1,
      step: 0,
      startSeconds: 1.123457,
      durationSeconds: 0.5,
      midi: 127,
      midiNotes: [127],
      velocity: 1,
      pan: -0.4,
      instrument: "melody_preview",
      articulation: "note",
      accent: true
    });
  });

  it("preserves Chordsmith/Core sound metadata used by playback and export handoffs", () => {
    const kick: RenderedEvent = {
      id: "clip_1_kick_0_tuplet",
      clipId: "clip_1",
      kind: "kick",
      drumLane: "kick",
      trackId: "drums",
      role: "drums",
      time: 0.083333333,
      duration: 0.125333333,
      bar: 1,
      step: 0,
      velocity: 0.742,
      pan: -0.25,
      accent: true,
      tuplet: true,
      drumKit: "lofi_dusty",
      audioProfile: "lofi_chill",
      lofiPreset: "rainy_window",
      lofiTexture: { enabled: true, hiss: 0.35, crackle: 0.2 }
    };
    const bass: RenderedEvent = {
      id: "clip_1_bass_4",
      clipId: "clip_1",
      kind: "bass",
      trackId: "bass",
      role: "bass",
      time: 0.75,
      duration: 0.9,
      bar: 1,
      step: 4,
      midi: 38,
      velocity: 0.34,
      slideMidi: 39.8,
      slideOffset: 0.333333333,
      bassTone: "warm_sub",
      audioProfile: "lofi_chill",
      lofiPreset: "rainy_window",
      lofiTexture: { enabled: true, hiss: 0.35, crackle: 0.2 }
    };

    expect(normalizeRenderedEventForPocketAudioCore(kick)).toMatchObject({
      kind: "kick",
      bar: 1,
      step: 0,
      startSeconds: 0.083333,
      durationSeconds: 0.125333,
      velocity: 0.742,
      pan: -0.25,
      accent: true,
      tuplet: true,
      drumLane: "kick",
      drumKit: "lofi_dusty",
      audioProfile: "lofi_chill",
      lofiPreset: "rainy_window",
      lofiTexture: { enabled: true, hiss: 0.35, crackle: 0.2 }
    });
    expect(normalizeRenderedEventForPocketAudioCore(bass)).toMatchObject({
      kind: "bass",
      bar: 1,
      step: 4,
      midi: 38,
      midiNotes: [38],
      slideMidi: 40,
      slideOffset: 0.333333,
      bassTone: "warm_sub",
      audioProfile: "lofi_chill",
      lofiPreset: "rainy_window",
      lofiTexture: { enabled: true, hiss: 0.35, crackle: 0.2 }
    });
  });
});
