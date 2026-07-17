import { describe, expect, it } from "vitest";
import { normalizeSessionPayload } from "../src/native/sessionBridge";

describe("native DAW session bridge", () => {
  it("normalizes a native multi-format session payload", () => {
    const bundle = normalizeSessionPayload({
      title: "Billions of Years",
      sourcePaths: ["C:/Music/Billions of Years files"],
      formats: ["stems", "midi", "ableton-live", "dawproject", "aaf"],
      audioAssets: [{
        name: "bass.wav",
        role: "bass",
        uri: "C:/cache/bass.wav",
        mimeType: "audio/wav",
        durationSeconds: 207.870023,
        sampleRate: 44100,
        channels: 2,
        sizeBytes: 36668316,
        checksum: "file-hash",
        pcmChecksum: "pcm-hash",
        sourceFormat: "stems",
        sourcePath: "C:/Music/stems.zip",
        sourceEntry: "bass.wav"
      }],
      midiAssets: [{
        name: "bass.mid",
        role: "bass",
        bytes: [0x4d, 0x54, 0x68, 0x64],
        sizeBytes: 4,
        checksum: "midi-hash",
        sourceFormat: "midi",
        sourcePath: "C:/Music/midis.zip",
        sourceEntry: "bass.mid"
      }],
      noteTracks: [{
        name: "bass",
        role: "bass",
        sourceFormat: "dawproject",
        sourcePath: "C:/Music/song.dawproject",
        sourceEntry: "project.xml",
        ppq: 960,
        notes: [{ pitch: 42, startBeat: 4.06875, durationBeats: 2.429167, velocity: 103, channel: 0 }]
      }],
      fixedTempoBpm: 120,
      warnings: ["source warning"],
      checksum: "bundle-hash"
    });

    expect(bundle).toMatchObject({
      title: "Billions of Years",
      formats: ["stems", "midi", "ableton-live", "dawproject", "aaf"],
      fixedTempoBpm: 120,
      checksum: "bundle-hash"
    });
    expect(bundle.audioAssets[0]).toMatchObject({ role: "bass", durationSeconds: 207.870023, pcmChecksum: "pcm-hash" });
    expect(bundle.midiAssets[0].bytes).toEqual([0x4d, 0x54, 0x68, 0x64]);
    expect(bundle.noteTracks[0].notes[0]).toEqual({ pitch: 42, startBeat: 4.06875, durationBeats: 2.429167, velocity: 103, channel: 0 });
  });

  it("rejects invalid audio metadata before it reaches project assembly", () => {
    expect(() => normalizeSessionPayload({
      title: "Broken",
      sourcePaths: [],
      formats: ["stems"],
      audioAssets: [{ name: "bad.wav", uri: "C:/bad.wav", durationSeconds: 0, sampleRate: 44100, channels: 2, sourceFormat: "stems" }],
      midiAssets: [],
      noteTracks: []
    })).toThrow("duration is invalid");
  });
});
