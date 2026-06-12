import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { createDemoProject } from "../src/demo/demoProject";
import { buildNativeAudioStartPayload, NativeAudioPlaybackBridge, type NativeAudioInvokeApi, type NativeAudioStatus } from "../src/native/audioPlayback";

function status(overrides: Partial<NativeAudioStatus> = {}): NativeAudioStatus {
  return {
    backend: "native-cpal",
    available: true,
    active: true,
    playing: true,
    positionSeconds: 0,
    eventCount: 0,
    sampleRate: 48000,
    channels: 2,
    renderedFrameCount: 0,
    startedGeneration: 1,
    projectTitle: "Test",
    deviceName: "Default",
    hostName: "wasapi",
    lastError: null,
    ...overrides
  };
}

describe("native audio playback bridge", () => {
  it("builds a compact native event payload from the rendered Pocket DAW timeline", () => {
    const project = createDemoProject();
    const events = renderTimelineEvents(project);
    const payload = buildNativeAudioStartPayload(project, events, 1.25);

    expect(payload.projectTitle).toBe(project.project.title);
    expect(payload.startSeconds).toBe(1.25);
    expect(payload.sampleRate).toBe(project.project.sampleRate);
    expect(payload.tracks.find((track) => track.id === "bass")).toMatchObject({ mute: false, solo: false });
    expect(payload.events.length).toBe(events.length);
    expect(payload.events.some((event) => event.kind === "guitar" && event.midiNotes.length > 0)).toBe(true);
  });

  it("passes cached WAV assets and timeline regions to the native runtime", () => {
    const project = createDemoProject();
    const cache = {
      assets: [{
        id: "asset_section_a_bass",
        name: "Section A Bass.wav",
        sampleRate: 48000,
        channels: 2,
        durationSeconds: 8,
        bytes: [82, 73, 70, 70]
      }],
      regions: [{
        id: "region_section_a_bass",
        assetId: "asset_section_a_bass",
        trackId: "bass",
        startTime: 4,
        sourceOffset: 0,
        duration: 8,
        gain: 0.9,
        pan: -0.2
      }]
    };

    const payload = buildNativeAudioStartPayload(project, [], 0, cache);

    expect(payload.events).toEqual([]);
    expect(payload.assets).toEqual(cache.assets);
    expect(payload.regions).toEqual(cache.regions);
  });

  it("uses native Tauri commands for start, seek, mixer updates and stop", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeAudioInvokeApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return status({ active: command !== "native_audio_stop" }) as never;
      }
    };
    const bridge = new NativeAudioPlaybackBridge(async () => api);
    const payload = buildNativeAudioStartPayload(createDemoProject(), [], 0);

    await expect(bridge.start(payload)).resolves.toMatchObject({ started: true, error: null });
    await bridge.seek(2);
    await bridge.updateTrack({ trackId: "bass", volume: 0.4, pan: -0.5 });
    await bridge.stop();

    expect(calls.map((call) => call.command)).toEqual([
      "native_audio_start",
      "native_audio_seek",
      "native_audio_update_track",
      "native_audio_stop"
    ]);
    expect(calls[0].args).toMatchObject({ payload: expect.objectContaining({ projectTitle: expect.any(String) }) });
    expect(calls[2].args).toMatchObject({ patch: { trackId: "bass", volume: 0.4, pan: -0.5 } });
  });

  it("reports unavailable native runtime without throwing", async () => {
    const bridge = new NativeAudioPlaybackBridge(async () => ({ isAvailable: () => false, invoke: async () => status() as never }));

    await expect(bridge.start(buildNativeAudioStartPayload(createDemoProject(), [], 0))).resolves.toMatchObject({
      started: false,
      status: null,
      error: "Native Tauri audio runtime is unavailable."
    });
    await expect(bridge.status()).resolves.toBeNull();
  });
});
