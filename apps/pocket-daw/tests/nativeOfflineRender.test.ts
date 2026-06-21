import { describe, expect, it } from "vitest";
import { nativeWavExportDurationSeconds, renderProjectToNativeWavBlob } from "../src/audio/nativeOfflineRender";
import { createDemoProject } from "../src/demo/demoProject";
import { barsToSeconds } from "../src/daw/timeline";
import type { NativeMediaApi } from "../src/native/mediaBridge";

describe("native offline WAV rendering", () => {
  it("renders full-song WAV exports through the native mix payload", async () => {
    const project = createDemoProject();
    project.timeline.loop = { enabled: true, startBar: 2, endBar: 4 };
    project.project.metronome = { enabled: true, countInBars: 1, volume: 0.7 };
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
    };
    expect(args.durationSeconds).toBeCloseTo(nativeWavExportDurationSeconds(project), 5);
    expect(payload.loop).toBeNull();
    expect(payload.metronome).toBeNull();
    expect(payload.events.length).toBeGreaterThan(0);
    expect(payload.assets).toEqual([]);
    expect(payload.regions).toEqual([]);
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
});
