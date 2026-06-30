import { describe, expect, it } from "vitest";
import { nativeWavExportDurationSeconds, renderProjectToNativeWavBlob } from "../src/audio/nativeOfflineRender";
import { createDemoProject } from "../src/demo/demoProject";
import { createSectionLoopMetadata, projectForSectionLoopRender } from "../src/daw/exportJobs";
import { barsToSeconds } from "../src/daw/timeline";
import type { NativeMediaApi } from "../src/native/mediaBridge";

describe("native offline WAV rendering", () => {
  it("renders full-song WAV exports through the native mix payload", async () => {
    const project = createDemoProject();
    project.timeline.loop = { enabled: true, startBar: 2, endBar: 4 };
    project.project.metronome = { enabled: true, countInBars: 1, volume: 0.7 };
    project.project.sampleRate = 44100;
    project.exportProfiles.find((item) => item.id === "full-song-wav")!.sampleRate = 48000;
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return {
          sampleRate: 48_000,
          channels: 2,
          durationSeconds: Number((args as Record<string, unknown>).durationSeconds),
          sizeBytes: 4,
          bytes: [82, 73, 70, 70]
        } as never;
      }
    };

    const blob = await renderProjectToNativeWavBlob(project, api);

    expect(blob?.type).toBe("audio/wav");
    expect(blob?.size).toBe(4);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("native_audio_render_wav");
    const args = calls[0].args!;
    const payload = args.payload as {
      loop: unknown;
      metronome: unknown;
      events: unknown[];
      assets: unknown[];
      regions: unknown[];
      sampleRate: number;
    };
    expect(args.durationSeconds).toBeCloseTo(nativeWavExportDurationSeconds(project), 5);
    expect(payload.loop).toBeNull();
    expect(payload.metronome).toBeNull();
    expect(payload.sampleRate).toBe(48000);
    expect(project.project.sampleRate).toBe(44100);
    expect(payload.events.length).toBeGreaterThan(0);
    expect(payload.assets).toEqual([]);
    expect(payload.regions).toEqual([]);
  });

  it("downmixes native full-song WAV exports when the profile requests mono", async () => {
    const project = createDemoProject();
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;
    profile.settings.channelMode = "mono";
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke() {
        return {
          sampleRate: 44_100,
          channels: 2,
          durationSeconds: 0.00002,
          sizeBytes: 52,
          bytes: [
            ...wavHeaderBytes({ sampleRate: 44100, channels: 2, dataSize: 8 }),
            0xff, 0x7f, 0x00, 0x00,
            0x00, 0x80, 0xff, 0x7f
          ]
        } as never;
      }
    };

    const blob = await renderProjectToNativeWavBlob(project, api);
    const view = new DataView(await blob!.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(4);
    expect(view.getInt16(44, true)).toBeCloseTo(16384, -1);
    expect(view.getInt16(46, true)).toBeCloseTo(0, -1);
  });

  it("keeps explicit native stereo render options from inheriting full-song mono settings", async () => {
    const project = createDemoProject();
    project.exportProfiles.find((item) => item.id === "full-song-wav")!.settings.channelMode = "mono";
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke() {
        return {
          sampleRate: 44_100,
          channels: 2,
          durationSeconds: 0.00002,
          sizeBytes: 52,
          bytes: [
            ...wavHeaderBytes({ sampleRate: 44100, channels: 2, dataSize: 8 }),
            0xff, 0x7f, 0x00, 0x00,
            0x00, 0x80, 0xff, 0x7f
          ]
        } as never;
      }
    };

    const blob = await renderProjectToNativeWavBlob(project, api, { channelMode: "stereo" });
    const view = new DataView(await blob!.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(8);
  });

  it("peak-normalizes native full-song WAV exports when the profile requests it", async () => {
    const project = createDemoProject();
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;
    profile.settings.normalize = "peak";
    const api: NativeMediaApi = {
      isAvailable: () => true,
      async invoke() {
        return {
          sampleRate: 44_100,
          channels: 2,
          durationSeconds: 0.00002,
          sizeBytes: 52,
          bytes: [
            ...wavHeaderBytes({ sampleRate: 44100, channels: 2, dataSize: 8 }),
            0x00, 0x40, 0x00, 0x00,
            0x00, 0xc0, 0x00, 0x20
          ]
        } as never;
      }
    };

    const blob = await renderProjectToNativeWavBlob(project, api);
    const view = new DataView(await blob!.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(2);
    expect(Math.abs(view.getInt16(44, true))).toBeCloseTo(0x7999, -1);
    expect(Math.abs(view.getInt16(48, true))).toBeCloseTo(0x7999, -1);
  });


  it("returns null when the native render API is unavailable", async () => {
    const api: NativeMediaApi = {
      isAvailable: () => false,
      async invoke() {
        throw new Error("should not be called");
      }
    };

    await expect(renderProjectToNativeWavBlob(createDemoProject(), api)).resolves.toBeNull();
  });

  it("uses the full-song export tail duration", () => {
    const project = createDemoProject();
    project.timeline.bars = 2;
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const profile = project.exportProfiles.find((item) => item.id === "full-song-wav")!;
    profile.settings.tailSeconds = 2.5;

    expect(nativeWavExportDurationSeconds(project)).toBeCloseTo(
      barsToSeconds(2, 120, 4) + 2.5,
      5
    );
  });

  it("keeps section loop native renders tail-free", () => {
    const project = createDemoProject();
    const loop = createSectionLoopMetadata(project)[0];
    const renderProject = projectForSectionLoopRender(project, loop);

    expect(nativeWavExportDurationSeconds(renderProject)).toBeCloseTo(loop.lengthSeconds, 5);
  });
});

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
