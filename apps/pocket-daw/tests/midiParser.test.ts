import { describe, expect, it } from "vitest";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { corruptSecondTrackHeader, formatOneTempoAndPianoMidiBytes, overlappingSamePitchMidiBytes, overlongTrackMidiBytes, simpleMidiBytes } from "./midiFixtures";

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

  it("parses format 1 files with a tempo track followed by a note track", () => {
    const parsed = parseStandardMidiFile(formatOneTempoAndPianoMidiBytes());

    expect(parsed.format).toBe(1);
    expect(parsed.ppq).toBe(1024);
    expect(parsed.tempoBpm).toBe(136);
    expect(parsed.trackNames).toEqual(["Tempo", "Acoustic Grand Piano"]);
    expect(parsed.metadata.parsedTrackCount).toBe(2);
    expect(parsed.metadata.trackSummaries).toEqual([
      expect.objectContaining({ trackIndex: 0, name: "Tempo", noteCount: 0 }),
      expect.objectContaining({ trackIndex: 1, name: "Acoustic Grand Piano", noteCount: 1 })
    ]);
    expect(parsed.notes).toEqual([
      expect.objectContaining({
        pitch: 60,
        startTick: 0,
        durationTicks: 1024,
        velocity: 100,
        channel: 0,
        trackIndex: 1
      })
    ]);
  });

  it("rejects a malformed second track header with byte context", () => {
    expect(() => parseStandardMidiFile(corruptSecondTrackHeader(formatOneTempoAndPianoMidiBytes()))).toThrow("track 2 is missing an MTrk header");
  });

  it("rejects track chunks that declare more bytes than the file contains", () => {
    expect(() => parseStandardMidiFile(overlongTrackMidiBytes())).toThrow("extends past the end of the file");
  });

  it("keeps overlapping same-pitch notes on the same channel", () => {
    const parsed = parseStandardMidiFile(overlappingSamePitchMidiBytes());

    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes).toEqual([
      expect.objectContaining({ pitch: 60, startTick: 0, durationTicks: 240, velocity: 100 }),
      expect.objectContaining({ pitch: 60, startTick: 120, durationTicks: 240, velocity: 80 })
    ]);
  });

  it("rejects non-MIDI bytes with a readable error", () => {
    expect(() => parseStandardMidiFile(new Uint8Array([1, 2, 3]))).toThrow("MThd");
  });
});
