import { describe, expect, it } from "vitest";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { aftertouchMidiBytes, corruptSecondTrackHeader, formatOneTempoAndPianoMidiBytes, metadataRichMidiBytes, overlappingSamePitchMidiBytes, overlongTrackMidiBytes, pitchBendMidiBytes, programChangeMidiBytes, simpleMidiBytes, tempoMapMidiBytes } from "./midiFixtures";

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

  it("parses controller events without dropping notes", () => {
    const parsed = parseStandardMidiFile(simpleMidiBytes(true));

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.controllers).toEqual([
      expect.objectContaining({ controller: 1, value: 64, tick: 480, channel: 0, trackIndex: 0 })
    ]);
    expect(parsed.metadata.controllerCount).toBe(1);
    expect(parsed.metadata.ignoredEvents).toBe(0);
  });

  it("parses program changes without treating them as ignored MIDI events", () => {
    const parsed = parseStandardMidiFile(programChangeMidiBytes());

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]).toMatchObject({ channel: 2 });
    expect(parsed.programChanges).toEqual([
      expect.objectContaining({ program: 24, tick: 0, channel: 2, trackIndex: 0 }),
      expect.objectContaining({ program: 40, tick: 720, channel: 2, trackIndex: 0 })
    ]);
    expect(parsed.metadata.programChangeCount).toBe(2);
    expect(parsed.metadata.ignoredEvents).toBe(0);
  });

  it("parses pitch bend events without treating them as ignored MIDI events", () => {
    const parsed = parseStandardMidiFile(pitchBendMidiBytes());

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]).toMatchObject({ channel: 1 });
    expect(parsed.pitchBends).toEqual([
      expect.objectContaining({ value: 8192, tick: 0, channel: 1, trackIndex: 0 }),
      expect.objectContaining({ value: 12288, tick: 720, channel: 1, trackIndex: 0 })
    ]);
    expect(parsed.metadata.pitchBendCount).toBe(2);
    expect(parsed.metadata.ignoredEvents).toBe(0);
  });

  it("parses poly and channel aftertouch without treating them as ignored MIDI events", () => {
    const parsed = parseStandardMidiFile(aftertouchMidiBytes());

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.aftertouch).toEqual([
      expect.objectContaining({ kind: "poly", note: 60, value: 50, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 64, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "poly", note: 60, value: 32, tick: 720, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 48, tick: 720, channel: 3 })
    ]);
    expect(parsed.metadata.aftertouchCount).toBe(4);
    expect(parsed.metadata.ignoredEvents).toBe(0);
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

  it("preserves DAW-useful MIDI meta events for import diagnostics and future arrangement extraction", () => {
    const parsed = parseStandardMidiFile(metadataRichMidiBytes());

    expect(parsed.tempoBpm).toBe(120);
    expect(parsed.timeSig).toBe(3);
    expect(parsed.metadata.tempoEvents).toEqual([expect.objectContaining({ tick: 0, trackIndex: 0, bpm: 120 })]);
    expect(parsed.metadata.timeSignatureEvents).toEqual([expect.objectContaining({ tick: 0, trackIndex: 0, numerator: 3, denominator: 4 })]);
    expect(parsed.metadata.keySignatures).toEqual([expect.objectContaining({ tick: 0, trackIndex: 0, sharpsFlats: -1, minor: true })]);
    expect(parsed.metadata.lyrics).toEqual([expect.objectContaining({ tick: 0, trackIndex: 0, text: "hello" })]);
    expect(parsed.metadata.sysexCount).toBe(1);
    expect(parsed.metadata.ignoredEvents).toBe(1);
  });

  it("preserves multiple tempo and meter events for import warnings", () => {
    const parsed = parseStandardMidiFile(tempoMapMidiBytes());

    expect(parsed.metadata.tempoEvents).toHaveLength(2);
    expect(parsed.metadata.timeSignatureEvents).toHaveLength(2);
    expect(parsed.tempoBpm).toBe(140);
    expect(parsed.timeSig).toBe(3);
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
