import { describe, expect, it } from "vitest";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { simpleMidiBytes } from "./midiFixtures";

describe("standard MIDI parser", () => {
  it("parses a basic PPQ MIDI fixture into notes and metadata", () => {
    const parsed = parseStandardMidiFile(simpleMidiBytes());

    expect(parsed.format).toBe(0);
    expect(parsed.ppq).toBe(480);
    expect(parsed.tempoBpm).toBe(120);
    expect(parsed.timeSig).toBe(4);
    expect(parsed.trackNames).toEqual(["Lead"]);
    expect(parsed.notes).toEqual([
      expect.objectContaining({
        pitch: 60,
        startTick: 0,
        durationTicks: 480,
        velocity: 100,
        channel: 0
      })
    ]);
  });

  it("ignores unsupported controller events without dropping notes", () => {
    const parsed = parseStandardMidiFile(simpleMidiBytes(true));

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.metadata.ignoredEvents).toBe(1);
  });

  it("rejects non-MIDI bytes with a readable error", () => {
    expect(() => parseStandardMidiFile(new Uint8Array([1, 2, 3]))).toThrow("MThd");
  });
});
