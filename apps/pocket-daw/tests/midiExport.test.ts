import { describe, expect, it } from "vitest";
import { exportProjectToMidiBlob } from "../src/audio/midiExport";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { setClipTransform } from "../src/daw/clips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createDemoChordsmithProject, createDemoProject } from "../src/demo/demoProject";

describe("MIDI export", () => {
  it("writes format 1 when exporting multiple tracks and preserves project tempo", async () => {
    const source = createDemoChordsmithProject();
    source.bpm = 136;
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(source));
    const bytes = new Uint8Array(await exportProjectToMidiBlob(project).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(readText(bytes, 0, 4)).toBe("MThd");
    expect(readU16(bytes, 8)).toBe(1);
    expect(readU16(bytes, 10)).toBeGreaterThan(1);
    expect(parsed.format).toBe(1);
    expect(parsed.tempoBpm).toBe(136);
    expect(parsed.metadata.parsedTrackCount).toBe(readU16(bytes, 10));
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it("can export only the selected clip's rendered MIDI events", async () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const expectedNoteOns = renderTimelineEvents(project)
      .filter((event) => event.clipId === clip.id)
      .reduce((total, event) => total + (event.midiNotes?.length || (event.midi !== undefined || ["kick", "snare", "hat"].includes(event.kind) ? 1 : 0)), 0);

    const bytes = new Uint8Array(await exportProjectToMidiBlob(project, { clipIds: [clip.id] }).arrayBuffer());
    const parsed = parseStandardMidiFile(bytes);

    expect(expectedNoteOns).toBeGreaterThan(0);
    expect(parsed.notes).toHaveLength(expectedNoteOns);
  });

  it("applies clip transpose and gain before scoped MIDI export", async () => {
    const project = createDemoProject();
    const clip = project.timeline.clips[0];
    const changed = setClipTransform(setClipTransform(project, clip.id, "transpose", 12), clip.id, "gain", 0.5);
    const original = parseStandardMidiFile(new Uint8Array(await exportProjectToMidiBlob(project, { clipIds: [clip.id], trackIds: ["bass"] }).arrayBuffer()));
    const transposed = parseStandardMidiFile(new Uint8Array(await exportProjectToMidiBlob(changed, { clipIds: [clip.id], trackIds: ["bass"] }).arrayBuffer()));

    expect(original.notes.length).toBeGreaterThan(0);
    expect(transposed.notes[0].pitch).toBe(original.notes[0].pitch + 12);
    expect(transposed.notes[0].velocity).toBeLessThan(original.notes[0].velocity);
  });
});

function readText(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length)).map((byte) => String.fromCharCode(byte)).join("");
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
