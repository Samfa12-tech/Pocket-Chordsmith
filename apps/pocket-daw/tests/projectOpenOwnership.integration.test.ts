import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App";
import { ProjectFileOpen } from "../src/app/projectFileOpen";
import { createInitialState, currentProject } from "../src/app/state";
import { createDemoProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile } from "../src/daw/dawProject";
import { discoverProjectRecoveryNative, openProjectFileNative } from "../src/native/fileBridge";

vi.mock("../src/native/fileBridge", async (original) => ({
  ...await original<typeof import("../src/native/fileBridge")>(),
  openProjectFileNative: vi.fn(), discoverProjectRecoveryNative: vi.fn()
}));

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
    engine: { isPlaying: () => true, stop: vi.fn(), setProject: vi.fn() },
    fileInput: { click: vi.fn() }, render: vi.fn(), stopLiveMetronome: vi.fn(),
    stopRecordingTimer: vi.fn(), saveAutosaveSnapshot: vi.fn(),
    syncArmedInputPreview: vi.fn(async () => {}), hydrateNativeCacheFromProject: vi.fn(async () => {})
  });
  return app;
}

describe("actual App project-open/MIDI ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
    vi.mocked(discoverProjectRecoveryNative).mockResolvedValue(null);
    vi.mocked(openProjectFileNative).mockResolvedValue(selection());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

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
});
