import { afterEach, describe, expect, it } from "vitest";
import { chordsmithOfflineLofiTextureForProject, chordsmithOfflineTrackExportGain, downmixPcm16WavToMono, encodeWav, fullSongWavBitDepth, fullSongWavChannelMode, fullSongWavPeakNormalize, fullSongWavSampleRate, peakNormalizePcm16Wav, renderProjectToWavBlob } from "../src/audio/offlineRender";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { createAutomationLane } from "../src/daw/automation";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { CHORDSMITH_OFFLINE_STEM_GAIN } from "../../../packages/pocket-audio-core/src/performance/stem-mix.js";

const originalWindow = (globalThis as unknown as { window?: unknown }).window;

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = originalWindow;
});

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

  it("uses the full-song WAV profile bit depth", () => {
    const project = createDemoProject();
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;

    expect(fullSongWavBitDepth(project)).toBe(16);

    profile.bitDepth = 24;
    expect(fullSongWavBitDepth(project)).toBe(24);

    profile.bitDepth = 32;
    expect(fullSongWavBitDepth(project)).toBe(32);
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

  it("encodes 24-bit PCM WAVs when requested", async () => {
    const blob = encodeWav(fakeAudioBuffer([
      [1, -1],
      [0, 0.5]
    ]), { channelMode: "mono", bitDepth: 24 });
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(32, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint32(40, true)).toBe(6);
    expect(readInt24(view, 44)).toBeCloseTo(0x3fffff, -2);
    expect(readInt24(view, 47)).toBeCloseTo(-0x200000, -2);
  });

  it("encodes 32-bit float WAVs when requested", async () => {
    const blob = encodeWav(fakeAudioBuffer([
      [1.25, -1.25],
      [0.25, -0.25]
    ]), { channelMode: "mono", bitDepth: 32 });
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(32);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getFloat32(44, true)).toBeCloseTo(0.75, 5);
    expect(view.getFloat32(48, true)).toBeCloseTo(-0.75, 5);
  });

  it("applies deterministic TPDF dither when quantizing fixed-point WAVs", async () => {
    const buffer = fakeAudioBuffer([
      new Array(32).fill(0),
      new Array(32).fill(0)
    ]);
    const first = new Uint8Array(await encodeWav(buffer, { bitDepth: 16, dither: "tpdf" }).arrayBuffer());
    const second = new Uint8Array(await encodeWav(buffer, { bitDepth: 16, dither: "tpdf" }).arrayBuffer());
    const samples = Array.from({ length: 32 }, (_, index) => new DataView(first.buffer).getInt16(44 + index * 4, true));

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(samples.some((sample) => sample !== 0)).toBe(true);
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

  it("samples offline track automation through project meter-map timing", async () => {
    const scheduled: Array<{ value: number; time: number }> = [];
    installFakeOfflineAudioContext(scheduled);
    let project = createEmptyPocketDawProject();
    project.sourceRefs = [];
    project.timeline.clips = [];
    project.timeline.markers = [];
    project.timeline.bars = 3;
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [
      { id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" },
      { id: "meter_3_4", bar: 3, numerator: 3, denominator: 4, source: "manual" }
    ];
    project.tracks.forEach((track) => {
      track.volume = track.id === "bass" ? 0.2 : 0.05;
    });
    project.tracks.find((track) => track.id === "bass")!.trackType = "audio";
    project.fx = { chains: [] };
    project.mixer.masterLimiter = false;
    project.exportProfiles.find((profile) => profile.id === "full-song-wav")!.settings.tailSeconds = 0;
    project = createAutomationLane(project, "tracks.bass.volume", {
      points: [
        { bar: 1, value: 0.2, curve: "hold" },
        { bar: 3, value: 0.8, curve: "hold" }
      ]
    }).project;
    const expectedBassGain = chordsmithOfflineTrackExportGain(project, project.tracks.find((track) => track.id === "bass")!, 0.2 * 0.8);

    await renderProjectToWavBlob(project, { includeChordsmithOfflineLofiTexture: false });

    expect(scheduled).toContainEqual(expect.objectContaining({ time: 3.75, value: expectedBassGain }));
  });
});

function fakeAudioBuffer(channels: number[][], sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0]?.length || 0,
    getChannelData(index: number) {
      return Float32Array.from(channels[index] || []);
    }
  } as AudioBuffer;
}

function installFakeOfflineAudioContext(scheduled: Array<{ value: number; time: number }>) {
  class FakeAudioParam {
    value = 1;
    setValueAtTime(value: number, time: number) {
      this.value = value;
      scheduled.push({ value, time });
      return this;
    }
  }

  class FakeAudioNode {
    connect() {
      return null;
    }
  }

  class FakeGainNode extends FakeAudioNode {
    gain = new FakeAudioParam();
  }

  class FakeStereoPannerNode extends FakeAudioNode {
    pan = new FakeAudioParam();
  }

  class FakeDynamicsCompressorNode extends FakeAudioNode {
    threshold = new FakeAudioParam();
    knee = new FakeAudioParam();
    ratio = new FakeAudioParam();
    attack = new FakeAudioParam();
    release = new FakeAudioParam();
  }

  class FakeOfflineAudioContext {
    destination = new FakeAudioNode();
    sampleRate: number;
    length: number;

    constructor(_channels: number, length: number, sampleRate: number) {
      this.length = length;
      this.sampleRate = sampleRate;
    }

    createGain() {
      return new FakeGainNode();
    }

    createDynamicsCompressor() {
      return new FakeDynamicsCompressorNode();
    }

    createStereoPanner() {
      return new FakeStereoPannerNode();
    }

    createBuffer(channels: number, length: number, sampleRate: number) {
      return fakeAudioBuffer(Array.from({ length: channels }, () => new Array(length).fill(0)), sampleRate);
    }

    createBufferSource() {
      return Object.assign(new FakeAudioNode(), {
        buffer: null,
        playbackRate: new FakeAudioParam(),
        start() {},
        stop() {}
      });
    }

    async startRendering() {
      const length = Math.max(1, this.length);
      return fakeAudioBuffer([
        new Array(length).fill(0),
        new Array(length).fill(0)
      ], this.sampleRate);
    }
  }

  (globalThis as unknown as { window?: unknown }).window = {
    OfflineAudioContext: FakeOfflineAudioContext,
    webkitOfflineAudioContext: FakeOfflineAudioContext
  };
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

function readInt24(view: DataView, offset: number): number {
  const raw = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
  return raw & 0x800000 ? raw - 0x1000000 : raw;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}
