import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App";
import { ProjectFileOpen } from "../src/app/projectFileOpen";
import { createInitialState, currentProject } from "../src/app/state";
import { createDemoProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { discoverProjectRecoveryNative, openProjectFileNative } from "../src/native/fileBridge";
import { loadAudioMediaNative } from "../src/native/mediaBridge";
import { addImportedAudioMedia, placeAudioClipOnTimeline } from "../src/daw/audioClips";
import { clearAudioBufferCache, getCachedAudioBuffer } from "../src/audio/audioBufferCache";
import { prepareFinishComparison } from "../src/audio/finishPreparation";

vi.mock("../src/native/fileBridge", async (original) => ({
  ...await original<typeof import("../src/native/fileBridge")>(),
  openProjectFileNative: vi.fn(), discoverProjectRecoveryNative: vi.fn()
}));
vi.mock("../src/native/mediaBridge", async (original) => ({
  ...await original<typeof import("../src/native/mediaBridge")>(), loadAudioMediaNative: vi.fn()
}));
vi.mock("../src/audio/finishPreparation", () => ({ prepareFinishComparison: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function input(id = "input-a") { return { id, name: id, onmidimessage: null as unknown }; }
function access(device: ReturnType<typeof input>) { return { inputs: new Map([[device.id, device]]) }; }
function nextProject() {
  const project = createDemoProject(); project.project.title = "New project";
  return project;
}
function selection() {
  return { mode: "selected" as const, project: { contents: buildPocketDawProjectFile(nextProject()), file: { path: "C:/new.pocketdaw", label: "new.pocketdaw" } } };
}
// The constructor owns browser/native services. Exercise the actual imported App
// methods on a minimal state host; only external device, picker and rendering
// boundaries are substituted. No copied method bodies or mocked isCurrent guard.
function host() {
  const app = Object.create(App.prototype) as any;
  const state = createInitialState();
  const project = currentProject(state);
  project.tracks.push({ ...structuredClone(project.tracks[0]), id: "old-midi", name: "Old MIDI", trackType: "midi" });
  state.selectedTrackId = "old-midi"; state.selectedClipId = null; state.selectedClipIds = [];
  Object.assign(app, {
    state, projectFileOpen: new ProjectFileOpen(), recordingStartToken: 0,
    midiInputStartToken: 0, midiInputStartPending: false, midiInputRecordingRuntime: null,
    engine: { isPlaying: () => true, stop: vi.fn(), setProject: vi.fn(), getTransportRevision: () => 0 },
    fileInput: { click: vi.fn() }, render: vi.fn(), stopLiveMetronome: vi.fn(),
    stopRecordingTimer: vi.fn(), saveAutosaveSnapshot: vi.fn(),
    syncArmedInputPreview: vi.fn(async () => {}), hydrateNativeCacheFromProject: vi.fn(async () => {})
  });
  return app;
}
function comparisonHost() {
  const app = host(); let revision = 0;
  currentProject(app.state).timeline.selection = { startBar: 1, endBar: 2, source: "manual" };
  Object.assign(app, { finishActionToken: 0, finishContext: null, selectionAuditionToken: 0, selectionAuditionContext: null,
    hydrateTimelineAudioBuffers: vi.fn(async () => ({})), assertNoMissingAudibleAudioBuffers: vi.fn(), updateLiveDom: vi.fn(), aiBridgeLiveStatus: () => ({ recording: {} }),
    playTransport: vi.fn(async () => { revision++; app.state.playing = true; }) });
  Object.assign(app.engine, { getTransportRevision: () => revision, seekToBar: vi.fn(),
    isPlaying: () => app.state.playing, stop: vi.fn(() => { revision++; app.state.playing = false; }),
    playPreparedComparison: vi.fn(async () => { revision++; app.state.playing = true; return true; }) });
  app.state.finishComparison.presetId = "track_quieter";
  return app;
}
function prepared(app: any) {
  return { proposed: structuredClone(currentProject(app.state)), payload: { monitorComparison: {} },
    a: { integratedLufs: -20, truePeakDbtp: -3 }, b: { integratedLufs: -20, truePeakDbtp: -3 },
    gains: { aDb: 0, bDb: 0 }, warnings: [], dispose: vi.fn(async () => {}) } as any;
}

function stoppedHost() {
  const app = host(), preparing = deferred<void>(), release = deferred<void>();
  app.samplePreviewTimer = null;
  app.updateLiveDom = vi.fn();
  app.nextPaint = vi.fn(async () => {});
  app.syncVst3RenderBoundaryState = vi.fn();
  app.startLiveMetronome = vi.fn();
  app.timelineAudioPreparationState = () => ({ reloadableMissingBufferCount: 0, native: { needsPreparation: true } });
  app.nativeAudioPreparationMessage = () => "Preparing native audio";
  Object.assign(app.engine, {
    isPlaying: () => app.state.playing,
    canResumePausedNativePlayback: () => false,
    getNativeRuntimeAudioPreparationState: () => ({ needsPreparation: true }),
    prepareNativeRuntimeAudioForPlayback: vi.fn(async () => { preparing.resolve(); await release.promise; }),
    play: vi.fn(async () => { app.state.playing = true; }),
    stop: vi.fn(() => { app.state.playing = false; }),
    seekToBar: vi.fn()
  });
  return { app, preparing, release };
}

function addReloadableAudio(app: any) {
  const imported = addImportedAudioMedia(currentProject(app.state), { name: "owned-fixture.wav", uri: "C:/owned-fixture.wav", mimeType: "audio/wav", durationSeconds: 1, sampleRate: 44100, channels: 1 });
  app.state.undoStack.present = placeAudioClipOnTimeline(imported.project, imported.item.id, 1).project;
  const samples = new Float32Array([0, 0.1, -0.1, 0]);
  app.decodeAudioSource = vi.fn(async () => ({ buffer: { duration: 1, numberOfChannels: 1, sampleRate: 44100, length: samples.length, getChannelData: () => samples }, durationSeconds: 1, sampleRate: 44100, channels: 1, waveformPeaks: [0.1] }));
  return imported.item.id;
}
function audioSource() {
  return { name: "owned-fixture.wav", uri: "C:/owned-fixture.wav", mimeType: "audio/wav", mode: "native" as const, sizeBytes: 16, bytes: new TextEncoder().encode("RIFF1234WAVEdata").buffer };
}

describe("actual App project-open/MIDI ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAudioBufferCache();
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
    vi.mocked(discoverProjectRecoveryNative).mockResolvedValue(null);
    vi.mocked(openProjectFileNative).mockResolvedValue(selection());
  });
  afterEach(() => { clearAudioBufferCache(); vi.unstubAllGlobals(); });

  it("blocks Prepare, examples, A/B and Apply while actual MIDI permission is pending", async () => {
    const permission = deferred<unknown>(), device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: () => permission.promise });
    const app = comparisonHost(), before = JSON.stringify(currentProject(app.state)); vi.mocked(prepareFinishComparison).mockResolvedValue(prepared(app));
    const starting = app.startMidiInputRecording();
    for (const action of ["finish-prepare", "finish-example-a", "finish-example-b", "finish-a", "finish-b", "finish-apply"]) await app.handleFinishAction(action);
    const preparations = vi.mocked(prepareFinishComparison).mock.calls.length, starts = app.engine.playPreparedComparison.mock.calls.length;
    permission.resolve(access(device)); await starting;
    expect(preparations).toBe(0); expect(starts).toBe(0); expect(JSON.stringify(currentProject(app.state))).toBe(before);
    expect(app.state.midiInputRecording.status).toBe("recording"); expect(typeof device.onmidimessage).toBe("function");
  });

  it("underlying MIDI start cancels an already playing example before installing its handler", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const app = comparisonHost(); vi.mocked(prepareFinishComparison).mockResolvedValue(prepared(app));
    await app.handleFinishAction("finish-example-b"); expect(app.state.finishComparison.phase).toBe("playing");
    await app.startMidiInputRecording();
    expect(app.finishContext).toBeNull(); expect(app.state.finishComparison.phase).toBe("idle"); expect(app.state.midiInputRecording.status).toBe("recording");
    expect(app.engine.playPreparedComparison).toHaveBeenCalledOnce(); expect(app.playTransport).toHaveBeenCalledOnce();
  });

  for (const action of ["midi_record_start", "midi_record_toggle"]) it(`actual bridge ${action} cancels comparison before deferred MIDI permission`, async () => {
    const permission = deferred<unknown>(), device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: () => permission.promise });
    const app = comparisonHost(); vi.mocked(prepareFinishComparison).mockResolvedValue(prepared(app));
    await app.handleFinishAction("finish-example-b"); const starting = app.handleAiBridgeControl({ action });
    expect(app.finishContext).toBeNull(); expect(app.state.finishComparison.phase).toBe("idle"); expect(app.midiInputStartPending).toBe(true); expect(app.state.playing).toBe(false);
    permission.resolve(access(device)); await starting; expect(app.state.midiInputRecording.status).toBe("recording"); expect(typeof device.onmidimessage).toBe("function");
  });

  it("MIDI start cancels a deferred example and disposes its late render without autoplay", async () => {
    const render = deferred<any>(), device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const app = comparisonHost(), result = prepared(app); vi.mocked(prepareFinishComparison).mockReturnValue(render.promise);
    const hearing = app.handleFinishAction("finish-example-b"); await vi.waitFor(() => expect(prepareFinishComparison).toHaveBeenCalledOnce());
    await app.startMidiInputRecording(); render.resolve(result); await hearing;
    expect(result.dispose).toHaveBeenCalledOnce(); expect(app.engine.playPreparedComparison).not.toHaveBeenCalled(); expect(app.finishContext).toBeNull(); expect(app.state.midiInputRecording.status).toBe("recording");
  });

  it("cancelled MIDI permission cannot install a handler over a newer example", async () => {
    const permission = deferred<unknown>(), device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: () => permission.promise });
    const app = comparisonHost(); vi.mocked(prepareFinishComparison).mockResolvedValue(prepared(app));
    const starting = app.startMidiInputRecording(); await app.stopMidiInputRecording(); await app.handleFinishAction("finish-example-b"); permission.resolve(access(device)); await starting;
    expect(device.onmidimessage).toBeNull(); expect(app.state.midiInputRecording.status).toBe("idle"); expect(app.state.finishComparison.phase).toBe("playing");
  });

  it("failed current MIDI permission releases pending UI ownership for a fresh comparison", async () => {
    vi.stubGlobal("navigator", { requestMIDIAccess: async () => { throw new Error("permission declined"); } });
    const app = comparisonHost(); await app.startMidiInputRecording(); expect(app.state.midiInputStartPending).toBe(false); expect(app.state.midiInputRecording.status).toBe("error");
    vi.mocked(prepareFinishComparison).mockResolvedValue(prepared(app)); await app.handleFinishAction("finish-example-b"); expect(app.state.finishComparison.phase).toBe("playing");
  });

  it("Stop during example preparation then pending MIDI prevents either late example completion or Apply", async () => {
    const render = deferred<any>(), permission = deferred<unknown>(), device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: () => permission.promise });
    const app = comparisonHost(), result = prepared(app); vi.mocked(prepareFinishComparison).mockReturnValue(render.promise);
    const hearing = app.handleFinishAction("finish-example-b"); await vi.waitFor(() => expect(prepareFinishComparison).toHaveBeenCalledOnce());
    await app.handleFinishAction("finish-stop"); const starting = app.startMidiInputRecording(); render.resolve(result); await hearing; await app.handleFinishAction("finish-apply"); permission.resolve(access(device)); await starting;
    expect(app.engine.playPreparedComparison).not.toHaveBeenCalled(); expect(app.finishContext).toBeNull(); expect(app.state.midiInputRecording.status).toBe("recording");
  });

  it("does not open a project while real MIDI startup awaits device access", async () => {
    const pending = deferred<unknown>(), device = input();
    vi.stubGlobal("navigator", { requestMIDIAccess: vi.fn(() => pending.promise) });
    const app = host(), original = currentProject(app.state);
    const starting = app.startMidiInputRecording();
    await app.openProject(); pending.resolve(access(device)); await starting;
    expect(currentProject(app.state) === original).toBe(true);
    expect(openProjectFileNative).not.toHaveBeenCalled();
    expect(app.midiInputRecordingRuntime.trackId).toBe("old-midi");
    expect(original.tracks.some(track => track.id === app.midiInputRecordingRuntime.trackId)).toBe(true);
  });

  it("rejects a pending picker after MIDI startup begins, before permission resolves", async () => {
    const picker = deferred<ReturnType<typeof selection>>(), pending = deferred<unknown>(), device = input();
    vi.mocked(openProjectFileNative).mockImplementation(() => picker.promise);
    vi.stubGlobal("navigator", { requestMIDIAccess: () => pending.promise });
    const app = host(), original = currentProject(app.state);
    const opening = app.openProject(), starting = app.startMidiInputRecording();
    picker.resolve(selection()); await opening; pending.resolve(access(device)); await starting;
    expect(currentProject(app.state) === original).toBe(true);
    expect(discoverProjectRecoveryNative).not.toHaveBeenCalled();
    expect(app.midiInputRecordingRuntime.trackId).toBe("old-midi");
  });

  it("project reset cancels pending startup before it can install an old-track handler", async () => {
    const pending = deferred<unknown>(), device = input();
    vi.stubGlobal("navigator", { requestMIDIAccess: () => pending.promise });
    const app = host(), starting = app.startMidiInputRecording(), replacement = nextProject();
    app.resetProjectSessionForProjectLoad(replacement, { status: "New project loaded" });
    const loaded = currentProject(app.state);
    pending.resolve(access(device)); await starting;
    expect(currentProject(app.state) === loaded).toBe(true);
    expect(device.onmidimessage).toBeNull();
    expect(app.midiInputRecordingRuntime).toBeNull();
    expect(app.state.midiInputRecording.status).toBe("idle");
    expect(app.state.status).toBe("New project loaded");
  });

  it("late failure from a reset project cannot overwrite the new project's status", async () => {
    const pending = deferred<unknown>();
    vi.stubGlobal("navigator", { requestMIDIAccess: () => pending.promise });
    const app = host(), starting = app.startMidiInputRecording();
    app.resetProjectSessionForProjectLoad(nextProject(), { status: "Keep new status" });
    pending.reject(new Error("old permission rejected")); await starting;
    expect(app.state.status).toBe("Keep new status");
    expect(app.state.midiInputRecording.status).toBe("idle");
  });

  it("Stop cancels pending startup and an old completion cannot clear a newer session", async () => {
    const first = deferred<unknown>(), second = deferred<unknown>(), oldInput = input("old"), newInput = input("new");
    vi.stubGlobal("navigator", { requestMIDIAccess: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) });
    const app = host(), oldStart = app.startMidiInputRecording();
    await app.stopMidiInputRecording(); const newStart = app.startMidiInputRecording();
    second.resolve(access(newInput)); await newStart;
    const runtime = app.midiInputRecordingRuntime;
    first.resolve(access(oldInput)); await oldStart;
    expect(oldInput.onmidimessage).toBeNull();
    expect(app.midiInputRecordingRuntime).toBe(runtime);
    expect(runtime.input).toBe(newInput);
    expect(typeof newInput.onmidimessage).toBe("function");
    expect(app.state.midiInputRecording.status).toBe("recording");
  });

  it("suppresses duplicate MIDI starts and allows explicit toggle cancellation", async () => {
    const pending = deferred<unknown>(), device = input(), request = vi.fn(() => pending.promise);
    vi.stubGlobal("navigator", { requestMIDIAccess: request });
    const app = host(), starting = app.startMidiInputRecording();
    await app.startMidiInputRecording(); await app.toggleMidiInputRecording();
    pending.resolve(access(device)); await starting;
    expect(request).toHaveBeenCalledOnce();
    expect(device.onmidimessage).toBeNull();
    expect(app.midiInputRecordingRuntime).toBeNull();
  });

  it("does not show a stale recovery prompt after delayed discovery", async () => {
    const pending = deferred<any>();
    vi.mocked(discoverProjectRecoveryNative).mockImplementation(() => pending.promise);
    const app = host(), opening = app.openProject(); await Promise.resolve();
    const replacement = nextProject(); app.resetProjectSessionForProjectLoad(replacement, { status: "Keep replacement" });
    const loaded = currentProject(app.state);
    pending.resolve({ current: null, backup: null, temp: { path: "C:/new.pocketdaw.tmp", sizeBytes: 1, modifiedUnixMs: 1, valid: true, note: "valid" } });
    await opening;
    expect(window.confirm).not.toHaveBeenCalled();
    expect(currentProject(app.state) === loaded).toBe(true);
    expect(app.state.status).toBe("Keep replacement");
  });

  it("does not publish stale discovery errors after project replacement", async () => {
    const pending = deferred<any>();
    vi.mocked(discoverProjectRecoveryNative).mockImplementation(() => pending.promise);
    const app = host(), opening = app.openProject(); await Promise.resolve();
    app.resetProjectSessionForProjectLoad(nextProject(), { status: "Keep replacement" });
    pending.reject(new Error("old discovery error")); await opening;
    expect(app.state.status).toBe("Keep replacement");
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("keeps normal current-project recovery and MIDI startup working", async () => {
    const device = input();
    vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const app = host(); await app.startMidiInputRecording();
    expect(app.state.midiInputRecording.status).toBe("recording");
    expect(typeof device.onmidimessage).toBe("function");
    await app.stopMidiInputRecording();
    expect(device.onmidimessage).toBeNull();
    vi.mocked(discoverProjectRecoveryNative).mockResolvedValue({ current: null, backup: null, temp: { path: "C:/new.pocketdaw.tmp", sizeBytes: 1, modifiedUnixMs: 1, valid: true, note: "valid" } });
    await app.openProject();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(currentProject(app.state).project.title).toBe("New project");
  });

  it("detaches an active MIDI handler on real project reset", async () => {
    const device = input();
    vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const app = host(); await app.startMidiInputRecording();
    expect(typeof device.onmidimessage).toBe("function");
    app.resetProjectSessionForProjectLoad(nextProject(), { status: "New project loaded" });
    expect(device.onmidimessage).toBeNull();
    expect(app.midiInputRecordingRuntime).toBeNull();
  });

  it("cancels a delayed recovery prompt when MIDI startup begins during discovery", async () => {
    const discovery = deferred<any>(), midi = deferred<unknown>(), device = input();
    vi.mocked(discoverProjectRecoveryNative).mockImplementation(() => discovery.promise);
    vi.stubGlobal("navigator", { requestMIDIAccess: () => midi.promise });
    const app = host(), original = currentProject(app.state), opening = app.openProject();
    await Promise.resolve(); const starting = app.startMidiInputRecording();
    discovery.resolve({ current: null, backup: null, temp: { path: "C:/new.pocketdaw.tmp", sizeBytes: 1, modifiedUnixMs: 1, valid: true, note: "valid" } });
    await opening; midi.resolve(access(device)); await starting;
    expect(window.confirm).not.toHaveBeenCalled();
    expect(currentProject(app.state) === original).toBe(true);
    expect(app.midiInputRecordingRuntime.trackId).toBe("old-midi");
  });

  it("does not install MIDI after an edited project revision or competing audio start", async () => {
    for (const change of ["edit", "audio"]) {
      const midi = deferred<unknown>(), device = input();
      vi.stubGlobal("navigator", { requestMIDIAccess: () => midi.promise });
      const app = host(), starting = app.startMidiInputRecording();
      if (change === "edit") app.state.undoStack.present = nextProject();
      else app.state.recording.status = "preparing";
      app.state.status = "Keep newer work";
      midi.resolve(access(device)); await starting;
      expect(device.onmidimessage).toBeNull();
      expect(app.midiInputRecordingRuntime).toBeNull();
      expect(app.state.status).toBe("Keep newer work");
    }
  });

  it("does not publish a late picker read error after project replacement", async () => {
    const picker = deferred<any>(); vi.mocked(openProjectFileNative).mockImplementation(() => picker.promise);
    const app = host(), opening = app.openProject();
    app.resetProjectSessionForProjectLoad(nextProject(), { status: "Keep replacement" });
    picker.reject(new Error("old picker read error")); await opening;
    expect(app.state.status).toBe("Keep replacement");
  });

  it("does not play a replacement project when stopped MIDI startup finishes old native preparation", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const { app, preparing, release } = stoppedHost();
    const starting = app.startMidiInputRecording(); await preparing.promise;
    app.resetProjectSessionForProjectLoad(nextProject(), { status: "Keep replacement" });
    const loaded = currentProject(app.state);
    release.resolve(); await starting;
    expect(app.engine.play).not.toHaveBeenCalled();
    expect(app.state.playing).toBe(false);
    expect(currentProject(app.state) === loaded).toBe(true);
    expect(app.state.status).toBe("Keep replacement");
    expect(device.onmidimessage).toBeNull();
    expect(app.startLiveMetronome).not.toHaveBeenCalled();
  });

  it("MIDI Stop cancels held native preparation without later playback or a stuck busy overlay", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const { app, preparing, release } = stoppedHost();
    const starting = app.startMidiInputRecording(); await preparing.promise;
    await app.stopMidiInputRecording(); const stoppedStatus = app.state.status, busyAfterStop = app.state.busyMessage;
    release.resolve(); await starting;
    expect(busyAfterStop).toBeNull();
    expect(app.engine.play).not.toHaveBeenCalled();
    expect(app.state.playing).toBe(false);
    expect(app.state.status).toBe(stoppedStatus);
    expect(device.onmidimessage).toBeNull();
  });

  it("checks ownership after the actual busy-paint await before native preparation dispatch", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const { app, release } = stoppedHost(), painted = deferred<void>(), releasePaint = deferred<void>();
    app.nextPaint = async () => { painted.resolve(); await releasePaint.promise; };
    const starting = app.startMidiInputRecording(); await painted.promise;
    app.resetProjectSessionForProjectLoad(nextProject(), { status: "Keep replacement" });
    releasePaint.resolve(); release.resolve(); await starting;
    expect(app.engine.prepareNativeRuntimeAudioForPlayback).not.toHaveBeenCalled();
    expect(app.engine.play).not.toHaveBeenCalled();
    expect(app.state.status).toBe("Keep replacement");
  });

  it("an old cancelled preparation cannot clear a newer preparation's busy state or start it", async () => {
    const devices = [input("old"), input("new")];
    vi.stubGlobal("navigator", { requestMIDIAccess: vi.fn().mockResolvedValueOnce(access(devices[0])).mockResolvedValueOnce(access(devices[1])) });
    const { app, preparing, release } = stoppedHost(), newPreparing = deferred<void>(), releaseNew = deferred<void>();
    const oldStart = app.startMidiInputRecording(); await preparing.promise;
    await app.stopMidiInputRecording();
    app.nativeAudioPreparationMessage = () => "New preparation owns busy state";
    app.engine.prepareNativeRuntimeAudioForPlayback.mockImplementationOnce(async () => { newPreparing.resolve(); await releaseNew.promise; });
    const newStart = app.startMidiInputRecording(); await newPreparing.promise;
    release.resolve(); await oldStart;
    const oldPlayCalls = app.engine.play.mock.calls.length, newBusy = app.state.busyMessage, currentInput = app.midiInputRecordingRuntime.input;
    releaseNew.resolve(); await newStart;
    expect(oldPlayCalls).toBe(0);
    expect(newBusy).toBe("New preparation owns busy state");
    expect(currentInput).toBe(devices[1]);
    expect(app.engine.play).toHaveBeenCalledOnce();
    expect(app.state.busyMessage).toBeNull();
  });

  it("still starts stopped MIDI transport after current native preparation completes", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const { app, preparing, release } = stoppedHost();
    const starting = app.startMidiInputRecording(); await preparing.promise;
    release.resolve(); await starting;
    expect(app.engine.play).toHaveBeenCalledOnce();
    expect(app.state.playing).toBe(true);
    expect(app.state.midiInputRecording.status).toBe("recording");
    expect(typeof device.onmidimessage).toBe("function");
    expect(app.startLiveMetronome).toHaveBeenCalledOnce();
    expect(app.state.busyMessage).toBeNull();
  });

  it("keeps startup ownership through the actual hydrator's own metadata repair", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    vi.mocked(loadAudioMediaNative).mockResolvedValue(audioSource());
    const { app, preparing, release } = stoppedHost(), mediaId = addReloadableAudio(app), before = currentProject(app.state);
    const starting = app.startMidiInputRecording(); await preparing.promise;
    expect(currentProject(app.state) === before).toBe(false);
    expect(getCachedAudioBuffer(mediaId)).not.toBeNull();
    release.resolve(); await starting;
    expect(app.engine.play).toHaveBeenCalledOnce();
    expect(app.state.midiInputRecording.status).toBe("recording");
    expect(app.midiInputRecordingRuntime.trackId).toBe("old-midi");
  });

  it("MIDI Stop during actual delayed hydration prevents cache writes and later preparation/play", async () => {
    const device = input(); vi.stubGlobal("navigator", { requestMIDIAccess: async () => access(device) });
    const loading = deferred<void>(), source = deferred<ReturnType<typeof audioSource>>();
    vi.mocked(loadAudioMediaNative).mockImplementation(async () => { loading.resolve(); return await source.promise; });
    const { app, release } = stoppedHost(), mediaId = addReloadableAudio(app);
    const starting = app.startMidiInputRecording(); await loading.promise;
    await app.stopMidiInputRecording(); source.resolve(audioSource()); release.resolve(); await starting;
    expect(getCachedAudioBuffer(mediaId)).toBeNull();
    expect(app.engine.prepareNativeRuntimeAudioForPlayback).not.toHaveBeenCalled();
    expect(app.engine.play).not.toHaveBeenCalled();
    expect(app.state.playing).toBe(false);
    expect(app.state.busyMessage).toBeNull();
  });
});
