import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/audioEngine";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { createInitialState, createRecordingUiState, currentProject, loadProjectIntoState } from "../src/app/state";
import { createDemoProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";

describe("project load state hydration", () => {
  it("syncs recovered autosave state and engine diagnostics before any edit", () => {
    const initialState = createInitialState();
    const engine = new AudioEngine(currentProject(initialState));
    const initialDiagnostics = engine.getDiagnostics();
    const recoveredProject = parsePocketDawProjectFile(buildPocketDawProjectFile(createDemoProject()));
    recoveredProject.project.title = "Recovered Different Song";
    recoveredProject.timeline.clips = recoveredProject.timeline.clips.slice(0, 1);
    recoveredProject.timeline.markers = recoveredProject.timeline.markers.slice(0, 1);
    recoveredProject.timeline.bars = recoveredProject.timeline.clips[0]?.barLength || 1;

    const recoveredState = loadProjectIntoState(initialState, recoveredProject, {
      status: "Recovered autosaved Pocket DAW project.",
      currentFile: { path: null, label: "Recovered autosave: Recovered Different Song" }
    });
    engine.setProject(currentProject(recoveredState));
    const recoveredDiagnostics = engine.getDiagnostics();

    expect(recoveredState.status).toBe("Recovered autosaved Pocket DAW project.");
    expect(recoveredState.currentFile).toEqual({ path: null, label: "Recovered autosave: Recovered Different Song" });
    expect(recoveredState.selectedClipId).toBe(recoveredProject.timeline.clips[0].id);
    expect(recoveredState.selectedTrackId).toBe("drums");
    expect(recoveredState.playheadBar).toBe(1);
    expect(recoveredState.cursorBar).toBe(1);
    expect(recoveredState.meterLevels).toEqual({});
    expect(recoveredState.nativeCacheStatus).toMatchObject({
      assetRegionCount: 0,
      cachedClipCount: 0,
      generatedRegionCount: 0,
      runtimeAudioRegionCount: 0,
      proceduralFallbackEventCount: 0,
      buildPending: false,
      prewarmScheduled: false,
      bypassedForLiveEdits: false,
      lastBuildReason: null,
      lastError: null
    });
    expect(recoveredState.recording).toMatchObject({
      status: "idle",
      sessionId: null,
      trackId: null,
      elapsedSeconds: 0,
      inputPeak: 0
    });
    expect(recoveredState.chordsmithStepSelection).toBeNull();
    expect(recoveredDiagnostics.eventCount).toBe(renderTimelineEvents(recoveredProject).length);
    expect(recoveredDiagnostics.eventCount).not.toBe(initialDiagnostics.eventCount);
  });

  it("clears transient playback, cache and recording state when a project is loaded", () => {
    const initialState = createInitialState();
    initialState.playing = true;
    initialState.playheadBar = 12;
    initialState.cursorBar = 12;
    initialState.meterLevels = { bass: 0.8 };
    initialState.busyMessage = "Rendering...";
    initialState.exportProgress = { message: "Exporting..." };
    initialState.showFilePanel = true;
    initialState.showControls = true;
    initialState.showAddTrack = true;
    initialState.showAudioSettings = true;
    initialState.lowerDockTab = "audio-editor";
    initialState.nativeCacheStatus = {
      ...initialState.nativeCacheStatus,
      assetRegionCount: 8,
      cachedClipCount: 4,
      generatedRegionCount: 4,
      runtimeAudioRegionCount: 2,
      proceduralFallbackEventCount: 1,
      buildPending: true,
      prewarmScheduled: true,
      bypassedForLiveEdits: true,
      lastBuildReason: "old-project-cache",
      lastError: "old project cache failed"
    };
    initialState.recording = createRecordingUiState({
      status: "recording",
      sessionId: 44,
      trackId: "live-vocals",
      startBar: 7,
      inputPeak: 0.7,
      livePeaks: [0.7]
    });
    initialState.importTextError = "Previous import failed.";

    const loadedProject = createDemoProject();
    loadedProject.project.title = "Loaded Clean Session";
    const loadedState = loadProjectIntoState(initialState, loadedProject, {
      status: "Opened Loaded Clean Session.",
      currentFile: { path: "C:/Songs/loaded-clean.pocketdaw", label: "loaded-clean.pocketdaw" }
    });

    expect(loadedState.playing).toBe(false);
    expect(loadedState.playheadBar).toBe(1);
    expect(loadedState.cursorBar).toBe(1);
    expect(loadedState.meterLevels).toEqual({});
    expect(loadedState.busyMessage).toBeNull();
    expect(loadedState.exportProgress).toBeNull();
    expect(loadedState.nativeCacheStatus.assetRegionCount).toBe(0);
    expect(loadedState.nativeCacheStatus.lastBuildReason).toBeNull();
    expect(loadedState.nativeCacheStatus.lastError).toBeNull();
    expect(loadedState.recording).toEqual(createRecordingUiState());
    expect(loadedState.importTextError).toBeNull();
    expect(loadedState.showFilePanel).toBe(true);
    expect(loadedState.showControls).toBe(true);
    expect(loadedState.showAddTrack).toBe(true);
    expect(loadedState.showAudioSettings).toBe(true);
    expect(loadedState.lowerDockTab).toBe("audio-editor");
  });

  it("preserves saved solo state through roundtrip load", () => {
    const project = createDemoProject();
    project.tracks.find((track) => track.id === "bass")!.solo = true;
    const parsed = parsePocketDawProjectFile(buildPocketDawProjectFile(project));

    const recoveredState = loadProjectIntoState(createInitialState(), parsed, {
      status: "Opened solo test.",
      currentFile: { path: "C:/Songs/solo-test.pocketdaw", label: "solo-test.pocketdaw" }
    });
    const engine = new AudioEngine(currentProject(recoveredState));

    expect(currentProject(recoveredState).tracks.find((track) => track.id === "bass")?.solo).toBe(true);
    expect(engine.getDiagnostics().mixerControls.find((track) => track.id === "bass")?.solo).toBe(true);
  });
});
