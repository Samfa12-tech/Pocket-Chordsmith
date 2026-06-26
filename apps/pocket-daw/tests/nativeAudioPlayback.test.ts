import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { addDrumLaneFx, DRUM_LANE_DEFS } from "../src/daw/drumLanes";
import { addFxSlot, setFxSlotParameter } from "../src/daw/fx";
import { setTrackSendLevel } from "../src/daw/routing";
import { createAutomationLane } from "../src/daw/automation";
import type { RenderedEvent } from "../src/audio/eventRenderer";
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
    expect(payload.tracks.find((track) => track.id === "bass")?.fxChainId).toBe("fx_bass");
    expect(payload.tracks.find((track) => track.id === "bass")?.sends).toEqual([]);
    expect(payload.events.length).toBe(events.length);
    expect(payload.events.some((event) => event.kind === "guitar" && event.midiNotes.length > 0)).toBe(true);
    expect(payload.events.some((event) => event.kind === "guitar" && event.instrument === "crunch")).toBe(true);
    expect(payload.events.some((event) => event.kind === "guitar" && event.direction)).toBe(true);
    expect(payload.fxChains.some((chain) => chain.ownerTrackId === "master")).toBe(true);
    expect(payload.loop).toBeNull();
    expect(payload.sidechain).toEqual({ enabled: true, amount: 0.35, targetTrackId: "chords", triggerKind: "kick" });
  });

  it("applies track automation to native start mixer controls", () => {
    let project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    const bassBaseVolume = project.tracks.find((track) => track.id === "bass")?.volume || 1;
    project = createAutomationLane(project, "tracks.bass.volume", {
      points: [
        { bar: 1, value: 0.5, curve: "linear" },
        { bar: 3, value: 1, curve: "linear" }
      ]
    }).project;
    project = createAutomationLane(project, "tracks.bass.pan", {
      points: [
        { bar: 1, value: -0.5, curve: "linear" },
        { bar: 3, value: 0.5, curve: "linear" }
      ]
    }).project;

    const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 2);
    const bass = payload.tracks.find((track) => track.id === "bass");

    expect(bass?.volume).toBeCloseTo(bassBaseVolume * 0.75, 5);
    expect(bass?.pan).toBeCloseTo(0, 5);
  });

  it("preserves bass and melody slide targets for the native installed-app synth", () => {
    const project = createDemoProject();
    const events: RenderedEvent[] = [
      {
        id: "slide_bass",
        clipId: "clip",
        kind: "bass",
        trackId: "bass",
        role: "bass",
        time: 0,
        duration: 0.5,
        bar: 1,
        step: 0,
        velocity: 0.8,
        midi: 36,
        slideMidi: 43,
        slideOffset: 0.125,
        bassTone: "warm_sub"
      },
      {
        id: "slide_melody",
        clipId: "clip",
        kind: "melody",
        trackId: "melody",
        role: "melody",
        time: 0.5,
        duration: 0.4,
        bar: 1,
        step: 2,
        velocity: 0.7,
        midi: 72,
        slideMidi: 76,
        slideOffset: 0.1,
        instrument: "soft"
      }
    ];

    const payload = buildNativeAudioStartPayload(project, events, 0);

    expect(payload.events.find((event) => event.id === "slide_bass")).toMatchObject({ slideMidi: 43, slideOffset: 0.125 });
    expect(payload.events.find((event) => event.id === "slide_melody")).toMatchObject({ slideMidi: 76, slideOffset: 0.1 });
  });

  it("passes timeline loop bounds to native playback for sample-accurate wrapping", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.timeline.loop = { enabled: true, startBar: 2, endBar: 4 };

    const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0);

    expect(payload.loop).toEqual({ enabled: true, startSeconds: 2, endSeconds: 6 });
  });

  it("passes enabled metronome timing to native playback", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 3;
    project.project.metronome = { enabled: true, countInBars: 1, volume: 0.4 };

    const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0);

    expect(payload.metronome).toEqual({ enabled: true, beatSeconds: 0.5, timeSig: 3, volume: 0.4 });
  });

  it("passes guarded send routes to native playback tracks", () => {
    const project = setTrackSendLevel(createDemoProject(), "bass", "fx-return", 0.35);
    const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0);

    expect(payload.tracks.find((track) => track.id === "fx-return")?.isReturn).toBe(true);
    expect(payload.tracks.find((track) => track.id === "bass")?.sends).toEqual([{ returnTrackId: "fx-return", level: 0.35 }]);
  });

  it("passes editable EQ chains and drum lane ownership to the native runtime", () => {
    let project = addFxSlot(createDemoProject(), "master", "parametric-eq");
    const masterChain = project.fx.chains.find((chain) => chain.ownerTrackId === "master");
    const masterSlot = masterChain?.slots[0];
    project = setFxSlotParameter(project, masterChain?.id || "", masterSlot?.id || "", "highMidGain", 2.4);
    project = addDrumLaneFx(project, "snare", "parametric-eq");

    const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0);
    const nativeMasterEq = payload.fxChains.find((chain) => chain.ownerTrackId === "master")?.slots.find((slot) => slot.type === "parametric-eq");
    const nativeSnareEq = payload.fxChains.find((chain) => chain.metadata?.drumLaneId === "snare")?.slots.find((slot) => slot.type === "parametric-eq");

    expect(nativeMasterEq?.parameters.highMidGain).toBe(2.4);
    expect(nativeSnareEq?.type).toBe("parametric-eq");
    expect(payload.events.some((event) => event.kind === "snare" && event.drumLane === "snare")).toBe(true);
  });

  it("can route every Chordsmith live drum pad lane through native per-lane FX", () => {
    const project = DRUM_LANE_DEFS.reduce(
      (next, lane) => addDrumLaneFx(next, lane.id, "parametric-eq"),
      createDemoProject()
    );
    const livePadEvents: RenderedEvent[] = DRUM_LANE_DEFS.map((lane, index) => ({
      id: `live_${lane.id}`,
      clipId: "live-kit",
      kind: lane.id,
      trackId: "drums",
      role: "drums",
      time: index * 0.1,
      duration: 0.12,
      bar: 1,
      step: index,
      velocity: 0.7,
      pan: lane.defaultPan,
      drumLane: lane.id,
      accent: lane.chordsmithRecordLevel > 1
    }));

    const payload = buildNativeAudioStartPayload(project, livePadEvents, 0);

    expect(payload.events.map((event) => [event.kind, event.drumLane])).toEqual(DRUM_LANE_DEFS.map((lane) => [lane.id, lane.id]));
    expect(
      payload.fxChains
        .filter((chain) => chain.metadata?.parentTrackId === "drums")
        .map((chain) => chain.metadata?.drumLaneId)
    ).toEqual(DRUM_LANE_DEFS.map((lane) => lane.id));
    DRUM_LANE_DEFS.forEach((lane) => {
      const chain = payload.fxChains.find((item) => item.metadata?.drumLaneId === lane.id);
      expect(chain?.slots[0]?.type).toBe("parametric-eq");
    });
  });

  it("preserves lofi sound metadata for the native installed-app synth", () => {
    const project = createLofiTemplateProject();
    const payload = buildNativeAudioStartPayload(project, renderTimelineEvents(project), 0);

    expect(payload.events.some((event) => event.kind === "texture" && event.audioProfile === "lofi_chill" && event.lofiPreset === "lofi_study_room")).toBe(true);
    expect(payload.events.find((event) => event.kind === "texture")?.lofiTexture).toMatchObject({ enabled: true, tapeHiss: 0.05, vinylCrackle: 0.08 });
    expect(payload.events.find((event) => event.kind === "texture")?.step).toEqual(expect.any(Number));
    expect(payload.events.some((event) => event.kind === "kick" && event.drumKit === "lofi_dusty")).toBe(true);
    expect(payload.events.some((event) => event.kind === "bass" && event.bassTone === "warm_sub")).toBe(true);
    expect(payload.events.some((event) => event.kind === "chord" && event.instrument === "dusty_rhodes")).toBe(true);
    expect(payload.events.some((event) => event.kind === "melody" && event.instrument === "tape_bell")).toBe(true);
    expect(payload.fxChains.find((chain) => chain.ownerTrackId === "drums")?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "lofi-drum-softener" });
    expect(payload.fxChains.find((chain) => chain.ownerTrackId === "master")?.slots[0]).toMatchObject({ type: "parametric-eq", presetId: "lofi-soft-rolloff" });
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
        pan: -0.2,
        fadeIn: 0,
        fadeOut: 0
      }]
    };

    const payload = buildNativeAudioStartPayload(project, [], 0, cache);

    expect(payload.events).toEqual([]);
    expect(payload.assets).toEqual(cache.assets);
    expect(payload.regions).toEqual(cache.regions);
  });

  it("omits already decoded native asset bytes on later starts", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeAudioInvokeApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return status({ active: true }) as never;
      }
    };
    const bridge = new NativeAudioPlaybackBridge(async () => api);
    const cache = {
      assets: [{
        id: "asset_loop",
        name: "Loop.wav",
        sampleRate: 48000,
        channels: 2,
        durationSeconds: 8,
        bytes: [82, 73, 70, 70]
      }],
      regions: [{
        id: "region_loop",
        assetId: "asset_loop",
        trackId: "bass",
        startTime: 0,
        sourceOffset: 0,
        duration: 8,
        gain: 1,
        pan: 0,
        fadeIn: 0,
        fadeOut: 0
      }]
    };
    const payload = buildNativeAudioStartPayload(createDemoProject(), [], 0, cache);

    await bridge.start(payload);
    await bridge.start(payload);

    const firstAssets = (calls[0].args?.payload as { assets: Array<{ bytes?: number[] }> }).assets;
    const secondAssets = (calls[1].args?.payload as { assets: Array<{ bytes?: number[] }> }).assets;
    expect(firstAssets[0].bytes).toEqual([82, 73, 70, 70]);
    expect(secondAssets[0].bytes).toBeUndefined();
  });

  it("preloads native assets so the first cached start can send metadata only", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api: NativeAudioInvokeApi = {
      isAvailable: () => true,
      async invoke(command, args) {
        calls.push({ command, args });
        return status({ active: true }) as never;
      }
    };
    const bridge = new NativeAudioPlaybackBridge(async () => api);
    const cache = {
      assets: [{
        id: "asset_preloaded_loop",
        name: "Preloaded loop.wav",
        sampleRate: 48000,
        channels: 2,
        durationSeconds: 8,
        bytes: [82, 73, 70, 70]
      }],
      regions: [{
        id: "region_preloaded_loop",
        assetId: "asset_preloaded_loop",
        trackId: "bass",
        startTime: 0,
        sourceOffset: 0,
        duration: 8,
        gain: 1,
        pan: 0,
        fadeIn: 0,
        fadeOut: 0
      }]
    };
    const payload = buildNativeAudioStartPayload(createDemoProject(), [], 0, cache);

    await expect(bridge.preloadAssets(cache.assets)).resolves.toBe(1);
    await bridge.start(payload);

    expect(calls.map((call) => call.command)).toEqual(["native_audio_preload_asset", "native_audio_start"]);
    const preloadedAsset = calls[0].args?.asset as { bytes?: number[] };
    const startAssets = (calls[1].args?.payload as { assets: Array<{ bytes?: number[] }> }).assets;
    expect(preloadedAsset.bytes).toEqual([82, 73, 70, 70]);
    expect(startAssets[0].bytes).toBeUndefined();
  });

  it("uses native Tauri commands for start, pause, resume, seek, mixer updates and stop", async () => {
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
    await bridge.pause();
    await bridge.resume();
    await bridge.seek(2);
    await bridge.updateTrack({ trackId: "bass", volume: 0.4, pan: -0.5 });
    await bridge.stop();

    expect(calls.map((call) => call.command)).toEqual([
      "native_audio_start",
      "native_audio_pause",
      "native_audio_resume",
      "native_audio_seek",
      "native_audio_update_track",
      "native_audio_stop"
    ]);
    expect(calls[0].args).toMatchObject({ payload: expect.objectContaining({ projectTitle: expect.any(String) }) });
    expect(calls[4].args).toMatchObject({ patch: { trackId: "bass", volume: 0.4, pan: -0.5 } });
  });

  it("reports unavailable native runtime without throwing", async () => {
    const bridge = new NativeAudioPlaybackBridge(async () => ({ isAvailable: () => false, invoke: async () => status() as never }));

    await expect(bridge.start(buildNativeAudioStartPayload(createDemoProject(), [], 0))).resolves.toMatchObject({
      started: false,
      status: null,
      error: "Native Tauri audio runtime is unavailable.",
      unavailable: true
    });
    await expect(bridge.status()).resolves.toBeNull();
  });
});
