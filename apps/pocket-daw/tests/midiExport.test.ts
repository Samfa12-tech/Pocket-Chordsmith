import { describe, expect, it } from "vitest";
import { exportProjectToMidiBlob } from "../src/audio/midiExport";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createDemoChordsmithProject } from "../src/demo/demoProject";

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
});

function readText(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length)).map((byte) => String.fromCharCode(byte)).join("");
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
