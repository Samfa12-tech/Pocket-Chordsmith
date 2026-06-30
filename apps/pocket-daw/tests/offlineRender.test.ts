import { describe, expect, it } from "vitest";
import { chordsmithOfflineLofiTextureForProject, chordsmithOfflineTrackExportGain, downmixPcm16WavToMono, encodeWav, fullSongWavChannelMode, fullSongWavPeakNormalize, fullSongWavSampleRate, peakNormalizePcm16Wav } from "../src/audio/offlineRender";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { CHORDSMITH_OFFLINE_STEM_GAIN } from "../../../packages/pocket-audio-core/src/performance/stem-mix.js";

describe("offline WAV render parity helpers", () => {
  it("extracts Chordsmith lofi texture settings for continuous export texture", () => {
    const texture = chordsmithOfflineLofiTextureForProject(createLofiTemplateProject());

    expect(texture).toMatchObject({
      enabled: true,
      vinylCrackle: 0.08,
      tapeHiss: 0.05,
      wowFlutter: 0.03,
      warmth: 0.18,
      lowPassAge: 0.24,
      bitCrush: 0.01
    });
  });

  it("does not add offline texture for non-lofi or disabled Chordsmith imports", () => {
    expect(chordsmithOfflineLofiTextureForProject(createDemoProject())).toBeNull();

    const disabled = createLofiTemplateProject();
    const normalized = disabled.sourceRefs[0]?.normalized as Record<string, unknown>;
    normalized.lofiTexture = { enabled: false, vinylCrackle: 0.5, tapeHiss: 0.5 };

    expect(chordsmithOfflineLofiTextureForProject(disabled)).toBeNull();
  });

  it("applies Chordsmith WAV stem staging to generated Chordsmith tracks only", () => {
    const project = createDemoProject();
    const chords = project.tracks.find((track) => track.id === "chords");
    const drums = project.tracks.find((track) => track.id === "drums");
    const master = project.tracks.find((track) => track.id === "master");
    expect(chords).toBeTruthy();
    expect(drums).toBeTruthy();
    expect(master).toBeTruthy();

    expect(chordsmithOfflineTrackExportGain(project, chords!, 0.72)).toBeCloseTo(0.72 * CHORDSMITH_OFFLINE_STEM_GAIN.chords, 6);
    expect(chordsmithOfflineTrackExportGain(project, drums!, 1.2)).toBeCloseTo(1.2 * CHORDSMITH_OFFLINE_STEM_GAIN.drums, 6);
    expect(chordsmithOfflineTrackExportGain(project, master!, 0.82)).toBeCloseTo(0.82, 6);

    const withoutChordsmithSource = { ...project, sourceRefs: [] };
    expect(chordsmithOfflineTrackExportGain(withoutChordsmithSource, chords!, 0.72)).toBeCloseTo(0.72, 6);
  });

  it("uses the full-song WAV profile sample rate when valid", () => {
    const project = createDemoProject();
    project.project.sampleRate = 44100;
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;
    profile.sampleRate = 48000;

    expect(fullSongWavSampleRate(project)).toBe(48000);

    profile.sampleRate = 999999;
    expect(fullSongWavSampleRate(project)).toBe(44100);
  });

  it("uses the full-song WAV profile channel mode", () => {
    const project = createDemoProject();
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;

    expect(fullSongWavChannelMode(project)).toBe("stereo");

    profile.settings.channelMode = "mono";
    expect(fullSongWavChannelMode(project)).toBe("mono");

    profile.settings.channelMode = "surround";
    expect(fullSongWavChannelMode(project)).toBe("stereo");
  });

  it("uses the full-song WAV profile peak normalization setting", () => {
    const project = createDemoProject();
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;

    expect(fullSongWavPeakNormalize(project)).toBe(false);

    profile.settings.normalize = "peak";
    expect(fullSongWavPeakNormalize(project)).toBe(true);

    profile.settings.normalize = true;
    expect(fullSongWavPeakNormalize(project)).toBe(true);

    profile.settings.normalize = "off";
    expect(fullSongWavPeakNormalize(project)).toBe(false);
  });

  it("encodes mono WAVs by downmixing rendered channels", async () => {
    const blob = encodeWav(fakeAudioBuffer([
      [1, -1],
      [0, 0.5]
    ]), { channelMode: "mono" });
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(28, true)).toBe(44100 * 2);
    expect(view.getInt16(44, true)).toBeCloseTo(0x3fff, -1);
    expect(view.getInt16(46, true)).toBeCloseTo(-0x2000, -1);
  });

  it("keeps explicit stereo render options from inheriting full-song mono settings", async () => {
    const project = createDemoProject();
    project.exportProfiles.find((item) => item.id === "full-song-wav")!.settings.channelMode = "mono";

    const blob = encodeWav(fakeAudioBuffer([
      [1, -1],
      [0, 0.5]
    ]), { channelMode: "stereo" });
    const view = new DataView(await blob.arrayBuffer());

    expect(fullSongWavChannelMode(project)).toBe("mono");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2);
  });

  it("peak-normalizes encoded WAV samples after channel layout is chosen", async () => {
    const blob = encodeWav(fakeAudioBuffer([
      [0.25, -0.5],
      [0.25, -0.25]
    ]), { channelMode: "mono", normalizePeak: true });
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBeCloseTo(Math.round(0.25 / 0.375 * 0.95 * 0x7fff), -1);
    expect(Math.abs(view.getInt16(46, true))).toBeCloseTo(0x7999, -1);
  });


  it("downmixes native PCM16 WAV bytes to mono", () => {
    const stereo = new Uint8Array([
      ...wavHeaderBytes({ sampleRate: 48000, channels: 2, dataSize: 8 }),
      0xff, 0x7f, 0x00, 0x00,
      0x00, 0x80, 0xff, 0x7f
    ]);
    const mono = downmixPcm16WavToMono(stereo)!;
    const view = new DataView(mono.buffer);

    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(4);
    expect(view.getInt16(44, true)).toBeCloseTo(16384, -1);
    expect(view.getInt16(46, true)).toBeCloseTo(0, -1);
  });

  it("peak-normalizes native PCM16 WAV bytes without changing the WAV layout", () => {
    const source = new Uint8Array([
      ...wavHeaderBytes({ sampleRate: 48000, channels: 2, dataSize: 8 }),
      0x00, 0x40, 0x00, 0x00,
      0x00, 0xc0, 0x00, 0x20
    ]);
    const normalized = peakNormalizePcm16Wav(source)!;
    const view = new DataView(normalized.buffer);

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(Math.abs(view.getInt16(44, true))).toBeCloseTo(0x7999, -1);
    expect(Math.abs(view.getInt16(48, true))).toBeCloseTo(0x7999, -1);
  });
});

function fakeAudioBuffer(channels: number[][]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    sampleRate: 44100,
    length: channels[0]?.length || 0,
    getChannelData(index: number) {
      return Float32Array.from(channels[index] || []);
    }
  } as AudioBuffer;
}

function wavHeaderBytes(input: { sampleRate: number; channels: number; dataSize: number }): number[] {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + input.dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, input.channels, true);
  view.setUint32(24, input.sampleRate, true);
  view.setUint32(28, input.sampleRate * input.channels * 2, true);
  view.setUint16(32, input.channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, input.dataSize, true);
  return Array.from(bytes);
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}
