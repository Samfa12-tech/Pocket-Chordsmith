import { describe, expect, it } from "vitest";
import { importedAudioFromBrowserFile, MAX_AUDIO_IMPORT_BYTES } from "../src/native/mediaBridge";
import { importedMidiFromBrowserFile, MAX_MIDI_IMPORT_BYTES } from "../src/native/midiBridge";

describe("file size limits", () => {
  it("rejects oversized browser audio files before reading bytes", async () => {
    const file = fakeFile("huge.wav", MAX_AUDIO_IMPORT_BYTES + 1, "audio/wav");

    await expect(importedAudioFromBrowserFile(file)).rejects.toThrow("Audio file is too large for this release");
  });

  it("rejects oversized browser MIDI files before reading bytes", async () => {
    const file = fakeFile("huge.mid", MAX_MIDI_IMPORT_BYTES + 1, "audio/midi");

    await expect(importedMidiFromBrowserFile(file)).rejects.toThrow("MIDI file is too large for this release");
  });
});

function fakeFile(name: string, size: number, type: string): File {
  return {
    name,
    size,
    type,
    async arrayBuffer() {
      throw new Error("arrayBuffer should not be called for oversized files");
    }
  } as unknown as File;
}
