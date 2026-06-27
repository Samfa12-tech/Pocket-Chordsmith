import { AudioEngine, type AudioProjectSyncMode, type TrackMixerControlPatch } from "../audio/audioEngine";
import { audioBufferPeaks, getCachedAudioBuffer, setCachedAudioBuffer } from "../audio/audioBufferCache";
import { buildTransportMetronomeSchedule, countInSeconds, metronomeSettings, secondsPerBar } from "../audio/metronome";
import { exportProjectToMidiBlob } from "../audio/midiExport";
import { mergeNativeRenderCacheItems, prunePersistedNativeRenderCacheAssets } from "../audio/nativeRenderCache";
import { renderProjectToNativeWavBlob } from "../audio/nativeOfflineRender";
import { renderProjectToWavBlob } from "../audio/offlineRender";
import { createDemoProject } from "../demo/demoProject";
import { buildPocketDawProjectFile, createEmptyPocketDawProject } from "../daw/dawProject";
import { renderTimelineEvents } from "../audio/eventRenderer";
import {
  listenForDeepLinkHandoffs,
  listenForProjectFileLaunches,
  readInitialDeepLinkHandoff,
  readInitialProjectFileLaunch,
  type HandoffBridgeStatus,
  type ProjectFileLaunch
} from "../native/deepLinkBridge";
import {
  discoverProjectRecoveryNative,
  downloadBlob,
  openProjectFileNative,
  projectRecoveryRecommendation,
  projectTitleFromFileState,
  readProjectFileNative,
  safeName,
  saveProjectFile,
  type NativeProjectRecoveryCandidate,
  type OpenProjectFileResult
} from "../native/fileBridge";
import { readPocketDawHandoff, type PocketDawHandoff } from "../native/pocketHandoff";
import {
  listenForAiBridgeRequests,
  readAiBridgeEnabledPreference,
  saveAiBridgeEnabledPreference,
  setAiBridgeEnabled,
  uiStatusFromSession,
  type AiBridgeRequestPayload
} from "../native/aiBridge";
import {
  loadAutosave,
  loadAutosaveFileState,
  loadRecentProjects,
  loadUpdaterAutoCheckPreference,
  saveAutosave,
  savePreImportRecovery,
  saveRecentProject,
  saveUpdaterAutoCheckPreference
} from "../native/recentFiles";
import {
  checkForPocketDawUpdate,
  downloadAndInstallPocketDawUpdate,
  relaunchPocketDaw,
  type PocketDawUpdateProgress
} from "../native/updaterBridge";
import {
  addAutomationPointCommand,
  addBusTrackCommand,
  appendChordsmithSectionCommand,
  addTrackCommand,
  addTrackFxCommand,
  addMarkerAtPlayheadCommand,
  addMidiNoteCommand,
  addReturnTrackCommand,
  addDrumLaneFxCommand,
  applyBassPresetCommand,
  applyDrumPresetCommand,
  applyGuitarPresetCommand,
  clearLoopCommand,
  commitProject,
  copySelectedClip,
  cycleDrumTupletCommand,
  cycleBassStepCommand,
  cycleDrumStepCommand,
  cycleGuitarStepCommand,
  cycleMelodyStepCommand,
  deleteSelectedClip,
  deleteMarkerCommand,
  deleteAutomationPointCommand,
  deleteMidiNoteCommand,
  duplicateSelectedClip,
  importTextToProject,
  loadPocketDawRaw,
  moveClipToBarCommand,
  moveSelectedClip,
  moveSelectedClipBySnap,
  moveMidiNoteCommand,
  pasteClipAtPlayhead,
  placeAudioClipCommand,
  pitchMidiNoteCommand,
  redoCommand,
  renameMarkerCommand,
  renameTrackCommand,
  repeatClipToEndCommand,
  removeDrumLaneFxCommand,
  removeTrackFxCommand,
  routeTrackOutputCommand,
  resizeMidiNoteCommand,
  ensureAutomationLaneCommand,
  setBassModeCommand,
  setChordInstrumentCommand,
  setChordsmithGlobalsCommand,
  setDrumLaneMuteCommand,
  setDrumLanePanCommand,
  setDrumLaneVolumeCommand,
  setGuitarSettingsCommand,
  setFxSlotParameterCommand,
  setPocketProEqPresetCommand,
  setLoopToSelectedClipCommand,
  setSelectedClipTransformCommand,
  setMelodyMuteCommand,
  setMelodyOctaveCommand,
  setMelodyPanCommand,
  setMelodyInstrumentCommand,
  setMelodySoloCommand,
  setSectionBarsCommand,
  setSectionChordCommand,
  setLoopBars,
  setLoopEnabled,
  setTrackInputCommand,
  setTrackPanCommand,
  setTrackVolumeCommand,
  setMidiNoteVelocityCommand,
  setAutomationLaneEnabledCommand,
  toggleDrumLaneFxCommand,
  toggleTrackArmedCommand,
  toggleTrackFxCommand,
  toggleTrackMonitorCommand,
  toggleMetronomeCommand,
  toggleSelectedClipMute,
  toggleTrackMuteCommand,
  toggleTrackSoloCommand,
  toggleBassAccentCommand,
  toggleBassHoldCommand,
  toggleBassSlideCommand,
  toggleBassTupletCommand,
  toggleMelodyHoldCommand,
  toggleMelodySlideCommand,
  toggleMelodyTupletCommand,
  splitSelectedClipAtPlayhead,
  trimSelectedClipEndCommand,
  trimSelectedClipStartCommand,
  updateAutomationPointCommand,
  undoCommand
} from "./commands";
import { commandFromKeyboardEvent } from "./keyboard";
import { createInitialState, createRecordingUiState, currentProject, loadProjectIntoState, recordingSessionMatches, type AppState, type ChordsmithStepSelection, type HandoffResult, type NativeCacheUiStatus } from "./state";
import { chordsmithStepDragAction, type ChordsmithStepArticulation } from "./chordsmithStepGestures";
import { renderAppShell } from "./ui";
import { createUndoStack } from "../daw/undo";
import { probeAudioDevices } from "../native/audioDevices";
import { cloneProject } from "../daw/dawProject";
import { POCKET_DAW_VERSION, type PocketDawProject, type Track } from "../daw/schema";
import { trackIsAudible, type AddTrackKind } from "../daw/tracks";
import { barFloatToPosition, snapBarValue } from "../daw/timeline";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeRecordingClipOnTrack, updateAudioMediaAnalysis } from "../daw/audioClips";
import { createCollectMediaPlan, findMediaPoolItem, markMediaPoolItemCollected, markMediaPoolItemMissing, markMediaPoolItemRelinked, mediaPoolStatus } from "../daw/mediaPool";
import {
  AUDIO_MEDIA_ACCEPT,
  collectProjectMediaNative,
  importedAudioFromBrowserFile,
  importAudioMediaNative,
  loadAudioMediaNative,
  relinkAudioMediaNative,
  writeNativeCacheAsset,
  type ImportedAudioBytes
} from "../native/mediaBridge";
import { importMidiFileToProject } from "../daw/midiClips";
import { parseStandardMidiFile } from "../daw/midiParser";
import { MIDI_MEDIA_ACCEPT, importedMidiFromBrowserFile, importMidiNative, type ImportedMidiBytes } from "../native/midiBridge";
import { isNativeRecordingAvailable, nativeRecordingStatus, startNativeRecording, startNativeRecordingPreview, stopNativeRecording, stopNativeRecordingPreview, updateNativeRecordingMonitor } from "../native/recordingBridge";
import { createGamePackZipBlob, createSectionLoopMetadata, createStemExportPlan, projectForClipRender, projectForSectionLoopRender, projectWithOnlyTracksAudible } from "../daw/exportJobs";
import { getPrimaryChordsmithSource } from "../daw/chordsmithEditor";
import { buildTesterDiagnosticsPayload, diagnosticsJson, runtimeLabel, runtimePlatform } from "./diagnostics";
import { buildFeedbackEmailDraft, MORE_BY_SAMFA12_URL } from "./feedback";
import { pocketDawMcpCopyText } from "./mcpSetup";
import { PerformanceDiagnosticsRecorder, type UiPerformanceCounters } from "./performanceDiagnostics";
import { buildNativeRecordingDiagnosticsMetadata, buildRecordingCompletionMessage, buildRecordingStartupPlan, recordingStartFailureCleanupPlan } from "./recordingOrchestration";
import { PlaybackRenderScheduler, type RenderOptions, type RenderSchedule } from "./renderScheduler";

type MixerControlField = "volume" | "pan";
type ScrollSnapshot = Record<string, { top: number; left: number }>;
type ClipDragMode = "move" | "repeat";
type AiBridgeControlAction = "play" | "pause" | "stop" | "restart" | "seek_bar" | "save_current" | "select_track" | "select_clip" | "open_project" | "apply_commands" | "performance_diagnostics";
type AiBridgeLiveCommand =
  | { type: "set_track_volume"; trackId: string; volume: number }
  | { type: "set_track_pan"; trackId: string; pan: number }
  | { type: "set_track_mute"; trackId: string; mute: boolean }
  | { type: "set_track_solo"; trackId: string; solo: boolean };

interface ApplyProjectOptions {
  audio?: AudioProjectSyncMode | "none";
  render?: RenderSchedule;
  autosave?: "none" | "debounced" | "flush";
  preservePlayback?: boolean;
  preserveScroll?: boolean;
  reason?: string;
}

const STEP_NOTE_LABELS = ["R", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"];
const MAX_PROJECT_IMPORT_BYTES = 25 * 1024 * 1024;

export class App {
  private root: HTMLElement;
  private state: AppState;
  private engine: AudioEngine;
  private fileInput: HTMLInputElement;
  private audioFileInput: HTMLInputElement;
  private midiFileInput: HTMLInputElement;
  private renderCount = 0;
  private renderCountDuringPlayback = 0;
  private liveUpdateCount = 0;
  private performanceDiagnostics = new PerformanceDiagnosticsRecorder();
  private mixerGestureStarts = new Map<string, number>();
  private playbackRenderScheduler = new PlaybackRenderScheduler();
  private chordsmithDragStart: ChordsmithStepSelection | null = null;
  private suppressNextStepClick = false;
  private suppressNextClipClick = false;
  private chordsmithStepChangedTrack = false;
  private deepLinkUnlisten: (() => void) | null = null;
  private pinchPointers = new Map<number, PointerEvent>();
  private pinchStartDistance: number | null = null;
  private pinchStartZoom = 240;
  private metronomeContext: AudioContext | null = null;
  private metronomeTimer: number | null = null;
  private recordingTimer: number | null = null;
  private recordingStartToken = 0;
  private recordingStatusBusy = false;
  private inputPreviewKey: string | null = null;
  private aiBridgeUnlisten: (() => void) | null = null;
  private projectFileLaunchUnlisten: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = createInitialState();
    this.state.recent = loadRecentProjects();
    this.state.updaterAutoCheckOnStartup = loadUpdaterAutoCheckPreference();
    this.engine = new AudioEngine(currentProject(this.state));
    this.engine.setOnTick((tick) => {
      const playingChanged = this.state.playing !== tick.playing;
      this.state.playing = tick.playing;
      this.state.playheadBar = tick.bar;
      this.state.meterLevels = this.engine.getMeterLevels();
      if (!tick.playing && this.state.recording.status === "idle") this.stopLiveMetronome();
      if (playingChanged) {
        if (tick.playing) {
          this.updateLiveDom();
        } else {
          this.playbackRenderScheduler.flushAfterPlaybackStops({ preserveScroll: true }, this.renderSchedulerCallbacks(), this.renderSchedulerTimers());
        }
      } else {
        this.updateLiveDom();
      }
    });
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".pocketdaw,.json,text/plain,application/json";
    this.fileInput.addEventListener("change", () => this.handleFileOpen());
    document.body.appendChild(this.fileInput);
    this.audioFileInput = document.createElement("input");
    this.audioFileInput.type = "file";
    this.audioFileInput.accept = AUDIO_MEDIA_ACCEPT;
    this.audioFileInput.addEventListener("change", () => this.handleAudioFileImport());
    document.body.appendChild(this.audioFileInput);
    this.midiFileInput = document.createElement("input");
    this.midiFileInput.type = "file";
    this.midiFileInput.accept = MIDI_MEDIA_ACCEPT;
    this.midiFileInput.addEventListener("change", () => this.handleMidiFileImport());
    document.body.appendChild(this.midiFileInput);
    this.root.addEventListener("click", (event) => this.handleDelegatedClick(event));
    this.root.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.root.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.root.addEventListener("pointerup", (event) => this.handlePointerEnd(event));
    this.root.addEventListener("pointercancel", (event) => this.handlePointerEnd(event));
    this.root.addEventListener("mousedown", (event) => this.handleMouseDown(event));
    this.root.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
    window.addEventListener("keydown", (event) => this.handleKeyboard(event));
  }

  start() {
    this.applyNativeTitlebarOffset();
    const handoff = readPocketDawHandoff();
    if (handoff) {
      this.consumeHandoff(handoff);
    } else {
      const autosave = loadAutosave();
      if (autosave) {
        try {
          const project = loadPocketDawRaw(autosave);
          const autosaveFile = loadAutosaveFileState() || { path: null, label: `Recovered autosave: ${project.project.title || "Untitled project"}` };
          this.cancelNativeInputPreviewForProjectReset();
          this.state = loadProjectIntoState(this.state, project, {
            status: "Recovered autosaved Pocket DAW project.",
            currentFile: autosaveFile
          });
          this.engine.setProject(project);
          if (autosaveFile.path) void this.hydrateNativeCacheFromProject(autosaveFile.path);
        } catch {
          this.state.status = "Editable demo copy loaded. Autosave was present but could not be recovered.";
        }
      }
    }
    this.render();
    this.bindDeepLinkHandoffs();
    void this.bindProjectFileLaunches();
    void this.openInitialProjectFileLaunch();
    void this.configureAiBridgeFromPreference();
    void this.bindAiBridgeRequests();
    this.scheduleStartupUpdateCheck();
    void this.syncArmedInputPreview();
  }

  private consumeHandoff(handoff: PocketDawHandoff): boolean {
    const imported = this.importText(handoff.code, handoff.status);
    this.recordHandoffResult(
      handoff,
      imported ? "imported" : "failed-parse",
      imported ? handoff.status : `Received ${handoff.source} handoff, but Pocket DAW could not import its payload.`
    );
    if (imported) handoff.clear();
    this.render({ preserveScroll: true });
    return imported;
  }

  private async bindDeepLinkHandoffs() {
    const startupHandoff = await readInitialDeepLinkHandoff((status) => this.recordHandoffBridgeStatus(status));
    if (startupHandoff) this.consumeHandoff(startupHandoff);
    if (this.deepLinkUnlisten) return;
    this.deepLinkUnlisten = await listenForDeepLinkHandoffs((handoff) => {
      this.consumeHandoff(handoff);
    }, (status) => this.recordHandoffBridgeStatus(status));
  }

  private async openInitialProjectFileLaunch() {
    const launch = await readInitialProjectFileLaunch((status) => this.recordHandoffBridgeStatus(status));
    if (launch) await this.openProjectFileLaunch(launch);
  }

  private async bindProjectFileLaunches() {
    if (this.projectFileLaunchUnlisten) return;
    this.projectFileLaunchUnlisten = await listenForProjectFileLaunches((launch) => {
      void this.openProjectFileLaunch(launch);
    }, (status) => this.recordHandoffBridgeStatus(status));
  }

  private async openProjectFileLaunch(launch: ProjectFileLaunch) {
    try {
      const native = await readProjectFileNative(launch.path);
      if (!native) return;
      await this.openNativeProjectWithRecovery(native, `Opened ${native.file.label} from Windows.`);
    } catch (error) {
      this.recordHandoffBridgeStatus({
        source: "project-file",
        result: "failed-parse",
        message: error instanceof Error ? error.message : `Could not open ${launch.path}.`,
        receivedAt: launch.receivedAt
      });
      this.state.status = error instanceof Error ? `Could not open ${launch.path}: ${error.message}` : `Could not open ${launch.path}.`;
      this.render({ preserveScroll: true });
    }
  }

  private async configureAiBridgeFromPreference() {
    const enabled = readAiBridgeEnabledPreference();
    try {
      const session = await setAiBridgeEnabled(enabled);
      this.state.aiBridge = uiStatusFromSession(session, {
        testMessage: session?.enabled ? "Live app bridge is enabled." : "Live app bridge is disabled."
      });
    } catch (error) {
      this.state.aiBridge = {
        ...this.state.aiBridge,
        runtimeAvailable: true,
        enabled: false,
        lastError: error instanceof Error ? error.message : String(error || "Could not initialize AI bridge."),
        testMessage: "Could not initialize live app bridge."
      };
    }
    if (this.state.showMcpSetupPanel) this.render({ preserveScroll: true });
  }

  private async toggleAiBridgeEnabled(enabled: boolean) {
    saveAiBridgeEnabledPreference(enabled);
    try {
      const session = await setAiBridgeEnabled(enabled);
      this.state.aiBridge = uiStatusFromSession(session, {
        testMessage: session?.enabled ? "Live app bridge enabled. MCP live tools can now control this running app." : "Live app bridge disabled."
      });
    } catch (error) {
      this.state.aiBridge = {
        ...this.state.aiBridge,
        enabled: false,
        lastError: error instanceof Error ? error.message : String(error || "Could not update AI bridge."),
        testMessage: "Could not update live app bridge."
      };
    }
    this.render({ preserveScroll: true });
  }

  private async bindAiBridgeRequests() {
    if (this.aiBridgeUnlisten) return;
    this.aiBridgeUnlisten = await listenForAiBridgeRequests((payload) => this.handleAiBridgeRequest(payload));
  }

  private async handleAiBridgeRequest(payload: AiBridgeRequestPayload): Promise<unknown> {
    this.state.aiBridge = {
      ...this.state.aiBridge,
      lastRequestAt: new Date().toISOString(),
      lastError: null
    };
    try {
      if (payload.kind === "status") return this.aiBridgeLiveStatus();
      if (payload.kind === "control") return await this.handleAiBridgeControl(this.parseAiBridgeBody(payload.body));
      return {
        ok: false,
        code: "unknown_request_kind",
        message: `Unsupported Pocket DAW live bridge request kind: ${payload.kind}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Pocket DAW live bridge request failed.");
      this.state.aiBridge = { ...this.state.aiBridge, lastError: message };
      return { ok: false, code: "request_failed", message };
    }
  }

  private parseAiBridgeBody(body: string): Record<string, unknown> {
    if (!body.trim()) return {};
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI bridge control body must be a JSON object.");
    return parsed as Record<string, unknown>;
  }

  private aiBridgeLiveStatus() {
    const project = currentProject(this.state);
    const audioDiagnostics = this.engine.getDiagnostics();
    this.state.nativeCacheStatus = nativeCacheStatusFromDiagnostics(audioDiagnostics);
    const uiPerformance = this.uiPerformanceCounters();
    const performanceDiagnostics = this.performanceDiagnostics.report(this.state, audioDiagnostics, uiPerformance, { recordSample: true });
    return {
      ok: true,
      available: true,
      enabled: this.state.aiBridge.enabled,
      app: "Pocket DAW",
      project: {
        title: project.project.title,
        path: this.state.currentFile.path,
        label: this.state.currentFile.label,
        version: POCKET_DAW_VERSION,
        schemaVersion: project.schemaVersion,
        bars: project.timeline.bars,
        trackCount: project.tracks.length,
        clipCount: project.timeline.clips.length
      },
      transport: {
        playing: this.state.playing || this.engine.isPlaying(),
        playheadBar: this.state.playheadBar,
        bpm: project.project.bpm,
        loop: project.timeline.loop
      },
      selection: {
        trackId: this.state.selectedTrackId,
        clipId: this.state.selectedClipId,
        trackName: project.tracks.find((track) => track.id === this.state.selectedTrackId)?.name || null,
        clipName: project.timeline.clips.find((clip) => clip.id === this.state.selectedClipId)?.name || null
      },
      recording: this.state.recording,
      nativeCache: this.state.nativeCacheStatus,
      diagnostics: {
        audio: audioDiagnostics,
        ui: uiPerformance,
        performance: performanceDiagnostics
      },
      tracks: project.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        role: track.role,
        type: track.trackType,
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo
      })),
      capabilities: {
        control: ["play", "pause", "stop", "restart", "seek_bar", "save_current", "select_track", "select_clip", "open_project", "performance_diagnostics"],
        liveCommands: ["set_track_volume", "set_track_pan", "set_track_mute", "set_track_solo"]
      }
    };
  }

  private async handleAiBridgeControl(input: Record<string, unknown>): Promise<unknown> {
    const action = typeof input.action === "string" ? input.action as AiBridgeControlAction : "";
    if (!action) return { ok: false, code: "missing_action", message: "Pocket DAW live control requires an action." };
    if (action === "play") {
      await this.playTransport();
      this.render({ preserveScroll: true });
      return { ok: true, action, status: "playing", transport: this.aiBridgeLiveStatus().transport };
    }
    if (action === "pause") {
      this.engine.pause();
      this.stopLiveMetronome();
      this.render({ preserveScroll: true });
      return { ok: true, action, status: "paused", transport: this.aiBridgeLiveStatus().transport };
    }
    if (action === "stop") {
      this.engine.stop();
      this.stopLiveMetronome();
      this.render({ preserveScroll: true });
      return { ok: true, action, status: "stopped", transport: this.aiBridgeLiveStatus().transport };
    }
    if (action === "restart") {
      await this.restartTransport();
      this.render({ preserveScroll: true });
      return { ok: true, action, status: "restarted", transport: this.aiBridgeLiveStatus().transport };
    }
    if (action === "seek_bar") {
      const bar = numberInput(input.bar, "bar");
      this.seekToBar(bar, true);
      this.render({ preserveScroll: true });
      return { ok: true, action, bar: this.state.playheadBar, transport: this.aiBridgeLiveStatus().transport };
    }
    if (action === "save_current") {
      if (!this.state.currentFile.path) {
        return { ok: false, code: "needs_save_as", message: "Current Pocket DAW project has no file path. Save As is not triggered through MCP v1." };
      }
      await this.saveProject(false);
      return { ok: true, action, path: this.state.currentFile.path, message: this.state.status };
    }
    if (action === "select_track") {
      const trackId = stringInput(input.trackId, "trackId");
      const track = currentProject(this.state).tracks.find((item) => item.id === trackId);
      if (!track) return { ok: false, code: "track_not_found", message: `Track not found: ${trackId}` };
      this.state.selectedTrackId = trackId;
      this.state.status = `Selected ${track.name}.`;
      this.render({ preserveScroll: true });
      return { ok: true, action, trackId, trackName: track.name };
    }
    if (action === "select_clip") {
      const clipId = stringInput(input.clipId, "clipId");
      const project = currentProject(this.state);
      const clip = project.timeline.clips.find((item) => item.id === clipId);
      if (!clip) return { ok: false, code: "clip_not_found", message: `Clip not found: ${clipId}` };
      this.state.selectedClipId = clipId;
      this.state.selectedTrackId = clip.trackId || this.state.selectedTrackId;
      this.state.status = `Selected ${clip.name}.`;
      this.render({ preserveScroll: true });
      return { ok: true, action, clipId, clipName: clip.name, trackId: clip.trackId };
    }
    if (action === "open_project") {
      const projectPath = stringInput(input.projectPath, "projectPath");
      if (!/\.pocketdaw$/i.test(projectPath)) {
        return { ok: false, code: "unsupported_project_path", message: "open_project only accepts explicit .pocketdaw files." };
      }
      const native = await readProjectFileNative(projectPath);
      if (!native) return { ok: false, code: "native_open_unavailable", message: "Native project reads are unavailable in this runtime." };
      this.engine.stop();
      this.stopLiveMetronome();
      await this.openNativeProjectWithRecovery(native, `Opened ${native.file.label} through MCP.`, false);
      const openedProject = currentProject(this.state);
      return {
        ok: true,
        action,
        path: this.state.currentFile.path,
        project: {
          title: openedProject.project.title,
          bars: openedProject.timeline.bars,
          trackCount: openedProject.tracks.length,
          clipCount: openedProject.timeline.clips.length
        }
      };
    }
    if (action === "apply_commands") {
      const commands = Array.isArray(input.commands) ? input.commands as AiBridgeLiveCommand[] : [];
      return this.applyAiBridgeLiveCommands(commands);
    }
    if (action === "performance_diagnostics") return this.handleAiBridgePerformanceDiagnostics(input);
    return { ok: false, code: "unknown_action", message: `Unsupported Pocket DAW live control action: ${action}` };
  }

  private handleAiBridgePerformanceDiagnostics(input: Record<string, unknown>) {
    const mode = typeof input.mode === "string" ? input.mode : "status";
    const maxSamples = input.maxSamples === undefined ? undefined : numberInput(input.maxSamples, "maxSamples");
    if (mode === "start") {
      this.performanceDiagnostics.start(maxSamples);
      this.state.status = "MCP performance diagnostics capture started.";
      return { ok: true, action: "performance_diagnostics", mode, diagnostics: this.performanceDiagnosticsReport(true, maxSamples) };
    }
    if (mode === "stop") {
      this.performanceDiagnosticsReport(true, maxSamples);
      this.performanceDiagnostics.stop();
      this.state.status = "MCP performance diagnostics capture stopped.";
      return { ok: true, action: "performance_diagnostics", mode, diagnostics: this.performanceDiagnosticsReport(false, maxSamples) };
    }
    if (mode === "reset") {
      this.performanceDiagnostics.reset(maxSamples);
      this.state.status = "MCP performance diagnostics capture reset.";
      return { ok: true, action: "performance_diagnostics", mode, diagnostics: this.performanceDiagnosticsReport(false, maxSamples) };
    }
    if (mode === "status" || mode === "sample") {
      return { ok: true, action: "performance_diagnostics", mode, diagnostics: this.performanceDiagnosticsReport(true, maxSamples) };
    }
    return {
      ok: false,
      code: "unsupported_performance_diagnostics_mode",
      message: `Unsupported performance diagnostics mode: ${mode}`
    };
  }

  private applyAiBridgeLiveCommands(commands: AiBridgeLiveCommand[]) {
    if (!commands.length) return { ok: false, code: "missing_commands", message: "apply_commands requires a non-empty commands array." };
    const statuses: string[] = [];
    for (const command of commands) {
      const next = this.applyAiBridgeLiveCommand(command);
      this.applyProjectState(next, { audio: "mixer-graph", autosave: "debounced", preserveScroll: true, reason: "ai-bridge-live-command" });
      statuses.push(this.state.status);
    }
    return {
      ok: true,
      action: "apply_commands",
      commandCount: commands.length,
      statuses,
      summary: this.aiBridgeLiveStatus()
    };
  }

  private applyAiBridgeLiveCommand(command: AiBridgeLiveCommand): AppState {
    const project = currentProject(this.state);
    const trackId = typeof command.trackId === "string" ? command.trackId : "";
    if (!project.tracks.some((track) => track.id === trackId)) throw new Error(`Track not found: ${trackId || "[missing trackId]"}`);
    if (command.type === "set_track_volume") return setTrackVolumeCommand(this.state, trackId, numberInput(command.volume, "volume"));
    if (command.type === "set_track_pan") return setTrackPanCommand(this.state, trackId, numberInput(command.pan, "pan"));
    if (command.type === "set_track_mute") {
      const track = project.tracks.find((item) => item.id === trackId);
      return track?.mute === Boolean(command.mute) ? { ...this.state, status: "Track mute already matched." } : toggleTrackMuteCommand(this.state, trackId);
    }
    if (command.type === "set_track_solo") {
      const track = project.tracks.find((item) => item.id === trackId);
      return track?.solo === Boolean(command.solo) ? { ...this.state, status: "Track solo already matched." } : toggleTrackSoloCommand(this.state, trackId);
    }
    throw new Error(`Unsupported live command: ${(command as { type?: string }).type || "[missing type]"}`);
  }

  private recordHandoffResult(handoff: PocketDawHandoff, result: HandoffResult, message: string) {
    this.state.lastHandoff = {
      source: handoff.source,
      result,
      kind: handoff.payload.kind,
      receivedAt: new Date().toISOString(),
      message
    };
  }

  private recordHandoffBridgeStatus(status: HandoffBridgeStatus) {
    this.state.lastHandoff = {
      source: status.source,
      result: status.result,
      kind: null,
      receivedAt: status.receivedAt,
      message: status.message
    };
    this.state.status = status.message;
    this.render({ preserveScroll: true });
  }

  private render(options: RenderOptions = {}) {
    this.playbackRenderScheduler.cancelPending(this.renderSchedulerTimers());
    const scroll = options.preserveScroll ? this.captureScrollSnapshot() : null;
    this.renderCount += 1;
    if (this.state.playing || this.engine.isPlaying()) this.renderCountDuringPlayback += 1;
    this.state.nativeCacheStatus = nativeCacheStatusFromDiagnostics(this.engine.getDiagnostics());
    this.root.innerHTML = renderAppShell(this.state);
    this.root.dataset.renderCount = String(this.renderCount);
    this.root.dataset.renderCountDuringPlayback = String(this.renderCountDuringPlayback);
    this.root.dataset.liveUpdateCount = String(this.liveUpdateCount);
    this.bind();
    if (scroll) this.restoreScrollSnapshotSoon(scroll);
  }

  private captureScrollSnapshot(): ScrollSnapshot {
    const snapshot: ScrollSnapshot = {};
    this.root.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((node) => {
      const key = node.dataset.scrollKey;
      if (key) snapshot[key] = { top: node.scrollTop, left: node.scrollLeft };
    });
    return snapshot;
  }

  private restoreScrollSnapshotSoon(snapshot: ScrollSnapshot) {
    const restore = () => this.restoreScrollSnapshot(snapshot);
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(restore);
    else restore();
  }

  private restoreScrollSnapshot(snapshot: ScrollSnapshot) {
    this.root.querySelectorAll<HTMLElement>("[data-scroll-key]").forEach((node) => {
      const key = node.dataset.scrollKey;
      const pos = key ? snapshot[key] : null;
      if (!pos) return;
      node.scrollTop = pos.top;
      node.scrollLeft = pos.left;
    });
  }

  private updateLiveDom() {
    this.liveUpdateCount += 1;
    this.root.dataset.liveUpdateCount = String(this.liveUpdateCount);
    const project = currentProject(this.state);
    const playheadLeft = (this.state.playheadBar - 1) * this.state.zoom;
    const playhead = this.root.querySelector<HTMLElement>("[data-playhead]");
    if (playhead) playhead.style.left = this.timelineBarLeftPx(playheadLeft);

    const readout = this.root.querySelector<HTMLElement>("[data-playhead-readout]");
    if (readout) {
      const pos = this.formatBarBeatParts(this.state.playheadBar);
      this.setTransportReadout(readout, pos.bar, pos.beat);
    }

    const cursor = this.root.querySelector<HTMLElement>("[data-cursor]");
    if (cursor) cursor.style.left = this.timelineBarLeftPx((this.state.cursorBar - 1) * this.state.zoom);

    const playing = this.root.querySelector<HTMLElement>("[data-playing-state]");
    if (playing) {
      this.setTransportReadout(playing, this.state.playing ? "Playing" : "Stopped");
      playing.classList.toggle("playing", this.state.playing);
    }

    const toggle = this.root.querySelector<HTMLButtonElement>("[data-transport-toggle]");
    if (toggle) {
      toggle.dataset.action = this.state.playing ? "pause" : "play";
      toggle.textContent = this.state.playing ? "Pause" : "Play";
    }

    const recordingActive = this.state.recording.status === "preparing" || this.state.recording.status === "count-in" || this.state.recording.status === "recording" || this.state.recording.status === "stopping";
    const recordingReadout = this.root.querySelector<HTMLElement>("[data-recording-state]");
    if (recordingReadout) {
      const recordingPrimary = this.state.recording.status === "recording"
        ? "Recording"
        : recordingActive
          ? this.state.recording.message
          : "Record";
      const recordingSecondary = this.state.recording.status === "recording"
        ? formatRecordingDuration(this.state.recording.elapsedSeconds)
        : "";
      this.setTransportReadout(recordingReadout, recordingPrimary, recordingSecondary);
      recordingReadout.classList.toggle("recording", recordingActive);
    }
    const recordButton = this.root.querySelector<HTMLButtonElement>('[data-action="record-toggle"]');
    if (recordButton) {
      recordButton.textContent = recordingActive ? "Stop Rec" : "Record";
      recordButton.classList.toggle("on", recordingActive);
    }

    project.tracks.forEach((track) => {
      const inputPreviewActive = track.id === this.state.recording.trackId && (track.armed || this.state.recording.status === "recording");
      const level = Math.max(0, Math.min(1, inputPreviewActive ? this.state.recording.inputPeak : this.state.meterLevels[track.id] || 0));
      const percent = Math.round(level * 100);
      const fill = findDataElement<HTMLElement>(this.root, "data-meter-fill", track.id);
      if (fill) fill.style.height = `${percent}%`;
      const meter = findDataElement<HTMLElement>(this.root, "data-meter", track.id);
      if (meter) meter.setAttribute("aria-label", `${track.name} peak meter ${percent}%`);
      const inputFill = findDataElement<HTMLElement>(this.root, "data-input-activity-fill", track.id);
      if (inputFill) inputFill.style.width = `${inputPreviewActive ? percent : 0}%`;
    });
  }

  private setTransportReadout(node: HTMLElement, primary: string, secondary = "") {
    node.replaceChildren();
    const primaryNode = document.createElement("strong");
    primaryNode.textContent = primary;
    node.appendChild(primaryNode);
    if (secondary) {
      const secondaryNode = document.createElement("small");
      secondaryNode.textContent = secondary;
      node.appendChild(secondaryNode);
    }
  }

  private bind() {
    this.root.querySelectorAll<HTMLElement>("[data-clip-id]:not([data-inline-sequencer])").forEach((el) => {
      el.addEventListener("click", () => {
        if (this.consumeSuppressedClipClick()) return;
        this.state.selectedClipId = el.dataset.clipId || null;
        const row = el.dataset.row || "";
        const rowTrack = currentProject(this.state).tracks.find((track) => track.id === row) || currentProject(this.state).tracks.find((track) => track.role === row);
        if (rowTrack) this.state.selectedTrackId = rowTrack.id;
        this.state.status = `Selected ${this.state.selectedClipId}.`;
        this.render({ preserveScroll: true });
      });
    });
    this.root.querySelectorAll<HTMLElement>("[data-track-id]").forEach((el) => {
      el.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (this.isTrackHeaderControlTarget(target)) return;
        this.state.selectedTrackId = el.dataset.trackId || null;
        this.render({ preserveScroll: true });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-volume]").forEach((input) => this.bindMixerControl(input, "volume", input.dataset.volume || ""));
    this.root.querySelectorAll<HTMLInputElement>("[data-pan]").forEach((input) => this.bindMixerControl(input, "pan", input.dataset.pan || ""));
    this.root.querySelectorAll<HTMLSelectElement>("[data-add-fx]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.applyProjectState(addTrackFxCommand(this.state, select.dataset.addFx || "", select.value), {
          audio: "mixer-graph",
          preserveScroll: true,
          reason: "track-add-fx"
        });
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-input]").forEach((select) => {
      select.addEventListener("change", () => {
        const trackId = select.dataset.trackInput || "";
        this.applyProjectState(setTrackInputCommand(this.state, select.dataset.trackInput || "", select.value || null), {
          audio: "none",
          preserveScroll: true,
          reason: "track-input"
        });
        void this.syncActiveOrArmedInputMonitor(trackId);
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-output]").forEach((select) => {
      select.addEventListener("change", () => this.applyProjectState(routeTrackOutputCommand(this.state, select.dataset.trackOutput || "", select.value || "master"), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "track-output"
      }));
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-automation-enabled]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setAutomationLaneEnabledCommand(this.state, input.dataset.automationEnabled || "", input.checked)));
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-clip-transform]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, field] = String(input.dataset.clipTransform || "").split(":");
        if (field !== "transpose" && field !== "gain") return;
        this.applyProjectState(setSelectedClipTransformCommand(this.state, clipId, field, Number(input.value)), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `clip-${field}`
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-automation-point-bar], [data-automation-point-value]").forEach((input) => {
      input.addEventListener("change", () => {
        const packed = input.dataset.automationPointBar || input.dataset.automationPointValue || "";
        const [laneId, indexText] = packed.split(":");
        const index = Number(indexText);
        const bar = Number(findDataElement<HTMLInputElement>(this.root, "data-automation-point-bar", `${laneId}:${index}`)?.value || 1);
        const value = Number(findDataElement<HTMLInputElement>(this.root, "data-automation-point-value", `${laneId}:${index}`)?.value || 0);
        this.applyProjectState(updateAutomationPointCommand(this.state, laneId, index, bar, value));
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-section-bars]").forEach((input) => {
      input.addEventListener("change", () => this.applyChordsmithEditorEdit(setSectionBarsCommand(this.state, input.dataset.sectionBars || "", Number(input.value)), "chordsmith-section-bars"));
    });
    this.root.querySelector<HTMLInputElement>("#chordsmithFollowClip")?.addEventListener("change", (event) => {
      this.state.chordsmithEditorFollowClip = (event.target as HTMLInputElement).checked;
      this.state.chordsmithEditorStepPage = 0;
      this.state.status = this.state.chordsmithEditorFollowClip ? "Chordsmith editor following selected clip." : "Chordsmith editor using manual section.";
      this.render({ preserveScroll: true });
    });
    this.root.querySelector<HTMLSelectElement>("#chordsmithSectionSelect")?.addEventListener("change", (event) => {
      this.state.chordsmithEditorSectionId = (event.target as HTMLSelectElement).value;
      this.state.chordsmithEditorStepPage = 0;
      this.state.chordsmithEditorFollowClip = false;
      this.state.status = `Chordsmith editor set to Section ${this.state.chordsmithEditorSectionId}.`;
      this.render({ preserveScroll: true });
    });
    this.root.querySelector<HTMLSelectElement>("#melodyTrackSelect")?.addEventListener("change", (event) => {
      this.state.chordsmithEditorMelodyTrackIndex = Number((event.target as HTMLSelectElement).value || 0);
      this.state.status = `Melody editor set to track ${this.state.chordsmithEditorMelodyTrackIndex + 1}.`;
      this.render({ preserveScroll: true });
    });
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-chordsmith-global]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.chordsmithGlobal || "";
        const raw = input.value;
        const patch: Parameters<typeof setChordsmithGlobalsCommand>[1] =
          field === "bpm" ? { bpm: Number(raw) } :
          field === "swing" ? { swing: Number(raw) } :
          field === "timeSig" ? { timeSig: Number(raw) } :
          field === "resolution" ? { resolution: Number(raw) } :
          field === "key" ? { key: raw } :
          field === "scale" ? { scale: raw } :
          {};
        this.applyChordsmithEditorEdit(setChordsmithGlobalsCommand(this.state, patch), "chordsmith-globals");
      });
    });
    this.root.querySelector<HTMLSelectElement>("[data-bass-mode]")?.addEventListener("change", (event) => {
      this.applyChordsmithEditorEdit(setBassModeCommand(this.state, (event.target as HTMLSelectElement).value), "chordsmith-bass-mode");
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-bass-preset-section]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.applyChordsmithEditorEdit(applyBassPresetCommand(this.state, select.dataset.bassPresetSection || "", select.value), "chordsmith-bass-preset");
      });
    });
    this.root.querySelector<HTMLSelectElement>("[data-chord-instrument]")?.addEventListener("change", (event) => {
      this.applyChordsmithEditorEdit(setChordInstrumentCommand(this.state, (event.target as HTMLSelectElement).value), "chordsmith-chord-instrument");
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-drum-preset-section]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.applyChordsmithEditorEdit(applyDrumPresetCommand(this.state, select.dataset.drumPresetSection || "", select.value), "chordsmith-drum-preset");
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-guitar-preset-section]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.applyChordsmithEditorEdit(applyGuitarPresetCommand(this.state, select.dataset.guitarPresetSection || "", select.value), "chordsmith-guitar-preset");
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-melody-instrument]").forEach((select) => {
      select.addEventListener("change", () => {
        const [sectionId, trackIndex] = String(select.dataset.melodyInstrument || "").split(":");
        this.applyChordsmithEditorEdit(setMelodyInstrumentCommand(this.state, sectionId, Number(trackIndex), select.value), "chordsmith-melody-instrument");
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-melody-octave]").forEach((input) => {
      input.addEventListener("change", () => {
        const [sectionId, trackIndex] = String(input.dataset.melodyOctave || "").split(":");
        this.applyChordsmithEditorEdit(setMelodyOctaveCommand(this.state, sectionId, Number(trackIndex), Number(input.value)), "chordsmith-melody-octave");
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-melody-pan]").forEach((input) => {
      input.addEventListener("change", () => {
        const [sectionId, trackIndex] = String(input.dataset.melodyPan || "").split(":");
        this.applyChordsmithEditorEdit(setMelodyPanCommand(this.state, sectionId, Number(trackIndex), Number(input.value)), "chordsmith-melody-pan");
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-melody-mute]").forEach((input) => {
      input.addEventListener("change", () => {
        const [sectionId, trackIndex] = String(input.dataset.melodyMute || "").split(":");
        this.applyChordsmithEditorEdit(setMelodyMuteCommand(this.state, sectionId, Number(trackIndex), input.checked), "chordsmith-melody-mute");
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-melody-solo]").forEach((input) => {
      input.addEventListener("change", () => {
        const [sectionId, trackIndex] = String(input.dataset.melodySolo || "").split(":");
        this.applyChordsmithEditorEdit(setMelodySoloCommand(this.state, sectionId, Number(trackIndex), input.checked), "chordsmith-melody-solo");
      });
    });
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-guitar-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.guitarSetting || "";
        const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
        this.applyChordsmithEditorEdit(setGuitarSettingsCommand(this.state, { [field]: field === "guitarVolume" ? Number(value) : value }), "chordsmith-guitar-settings");
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-section-chord]").forEach((select) => {
      select.addEventListener("change", () => {
        const [sectionId, bar] = String(select.dataset.sectionChord || "").split(":");
        this.applyChordsmithEditorEdit(setSectionChordCommand(this.state, sectionId, Number(bar), Number(select.value)), "chordsmith-section-chord");
      });
    });
    this.root.querySelector<HTMLInputElement>("#loopEnabled")?.addEventListener("change", (event) => {
      this.applyProjectState(setLoopEnabled(this.state, (event.target as HTMLInputElement).checked), { audio: "transport-controls", reason: "loop-toggle" });
    });
    this.root.querySelector<HTMLInputElement>("[data-updater-auto-check]")?.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      this.state.updaterAutoCheckOnStartup = input.checked;
      saveUpdaterAutoCheckPreference(input.checked);
      this.state.updaterMessage = input.checked ? "Pocket DAW will check silently on startup." : "Startup update checks are off.";
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("[data-ai-bridge-enabled]")?.addEventListener("change", (event) => {
      void this.toggleAiBridgeEnabled((event.target as HTMLInputElement).checked);
    });
    ["loopStart", "loopEnd"].forEach((id) => {
      this.root.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("change", () => {
        const start = Number(this.root.querySelector<HTMLInputElement>("#loopStart")?.value || 1);
        const end = Number(this.root.querySelector<HTMLInputElement>("#loopEnd")?.value || 2);
        this.applyProjectState(setLoopBars(this.state, start, end), { audio: "transport-controls", reason: "loop-bars" });
      });
    });
    this.root.querySelector<HTMLTextAreaElement>("#importText")?.addEventListener("input", (event) => {
      this.state.importText = (event.target as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLTextAreaElement>("[data-feedback-text]")?.addEventListener("input", (event) => {
      this.state.feedbackText = (event.target as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLSelectElement>("#snapMode")?.addEventListener("change", (event) => {
      this.state.snapMode = (event.target as HTMLSelectElement).value as AppState["snapMode"];
      this.state.status = `Snap set to ${this.state.snapMode}.`;
      this.render();
    });
    this.root.querySelector<HTMLInputElement>("#timelineZoom")?.addEventListener("input", (event) => {
      this.previewTimelineZoom(Number((event.target as HTMLInputElement).value));
    });
    this.root.querySelector<HTMLInputElement>("#timelineZoom")?.addEventListener("change", (event) => {
      this.state.zoom = this.clampTimelineZoom(Number((event.target as HTMLInputElement).value));
      this.state.status = `Timeline zoom set to ${Math.round(this.state.zoom)} px/bar.`;
      this.render({ preserveScroll: true });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-note-velocity]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, noteId] = String(input.dataset.midiNoteVelocity || "").split(":");
        this.applyProjectState(setMidiNoteVelocityCommand(this.state, clipId, noteId, Number(input.value)));
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-drum-lane-volume]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setDrumLaneVolumeCommand(this.state, input.dataset.drumLaneVolume || "", Number(input.value)), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "drum-lane-volume"
      }));
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-drum-lane-pan]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setDrumLanePanCommand(this.state, input.dataset.drumLanePan || "", Number(input.value)), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "drum-lane-pan"
      }));
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-drum-lane-mute]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setDrumLaneMuteCommand(this.state, input.dataset.drumLaneMute || "", input.checked), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "drum-lane-mute"
      }));
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-drum-lane-add-fx]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.applyProjectState(addDrumLaneFxCommand(this.state, select.dataset.drumLaneAddFx || "", select.value), {
          audio: "mixer-graph",
          preserveScroll: true,
          reason: "drum-lane-add-fx"
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-fx-param]").forEach((input) => {
      input.addEventListener("change", () => this.applyFxParameterInput(input, input.dataset.fxParam || ""));
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-fx-eq-preset]").forEach((select) => {
      select.addEventListener("change", () => this.applyPocketProEqPresetInput(select));
    });
  }

  private applyFxParameterInput(input: HTMLInputElement, encoded: string) {
    const [chainId, slotId, parameter] = encoded.split(":");
    if (!chainId || !slotId || !parameter) return;
    const value = input.type === "checkbox" ? input.checked : Number(input.value);
    this.applyProjectState(setFxSlotParameterCommand(this.state, chainId, slotId, parameter, value), {
      audio: "mixer-graph",
      preserveScroll: true,
      reason: "fx-parameter"
    });
  }

  private applyPocketProEqPresetInput(select: HTMLSelectElement) {
    const [chainId, slotId] = String(select.dataset.fxEqPreset || "").split(":");
    if (!chainId || !slotId || !select.value) return;
    this.applyProjectState(setPocketProEqPresetCommand(this.state, chainId, slotId, select.value), {
      audio: "mixer-graph",
      preserveScroll: true,
      reason: "fx-eq-preset"
    });
  }

  private bindMixerControl(input: HTMLInputElement, field: MixerControlField, trackId: string) {
    if (!trackId) return;
    const begin = () => this.beginMixerGesture(trackId, field);
    const preview = () => this.previewMixerControl(input, trackId, field);
    const commit = () => this.commitMixerControl(input, trackId, field);
    input.addEventListener("pointerdown", begin);
    input.addEventListener("focus", begin);
    input.addEventListener("input", preview);
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
  }

  private beginMixerGesture(trackId: string, field: MixerControlField) {
    const key = this.mixerGestureKey(trackId, field);
    if (!this.mixerGestureStarts.has(key)) this.mixerGestureStarts.set(key, this.currentMixerControlValue(trackId, field));
  }

  private previewMixerControl(input: HTMLInputElement, trackId: string, field: MixerControlField) {
    this.beginMixerGesture(trackId, field);
    const value = this.cleanMixerControlValue(field, Number(input.value));
    input.value = String(value);
    this.engine.updateTrackMixerControl(trackId, this.mixerControlPatch(field, value));
    this.updateMixerControlLabel(input, field, value);
  }

  private commitMixerControl(input: HTMLInputElement, trackId: string, field: MixerControlField) {
    const key = this.mixerGestureKey(trackId, field);
    const startValue = this.mixerGestureStarts.get(key) ?? this.currentMixerControlValue(trackId, field);
    const value = this.cleanMixerControlValue(field, Number(input.value));
    this.previewMixerControl(input, trackId, field);
    this.mixerGestureStarts.delete(key);
    if (Math.abs(startValue - value) < 0.0001) return;
    const next = field === "volume" ? setTrackVolumeCommand(this.state, trackId, value) : setTrackPanCommand(this.state, trackId, value);
    this.applyProjectState(next, {
      audio: "none",
      preserveScroll: true,
      reason: `track-${field}`
    });
    void this.syncActiveOrArmedInputMonitor(trackId);
  }

  private currentMixerControlValue(trackId: string, field: MixerControlField): number {
    const track = currentProject(this.state).tracks.find((item) => item.id === trackId);
    return this.cleanMixerControlValue(field, field === "volume" ? track?.volume ?? 0 : track?.pan ?? 0);
  }

  private mixerGestureKey(trackId: string, field: MixerControlField): string {
    return `${field}:${trackId}`;
  }

  private mixerControlPatch(field: MixerControlField, value: number): TrackMixerControlPatch {
    return field === "volume" ? { volume: value } : { pan: value };
  }

  private updateMixerControlLabel(input: HTMLInputElement, field: MixerControlField, value: number) {
    const label = field === "volume" ? `${Math.round(value * 100)}%` : this.panReadout(value);
    input.setAttribute("aria-valuetext", label);
    const readout = input.closest(".strip-control")?.querySelector("strong");
    if (readout) readout.textContent = label;
  }

  private panReadout(pan: number): string {
    if (Math.abs(pan) < 0.01) return "C";
    const side = pan < 0 ? "L" : "R";
    return `${side} ${Math.round(Math.abs(pan) * 100)}`;
  }

  private cleanMixerControlValue(field: MixerControlField, value: number): number {
    if (!Number.isFinite(value)) return field === "volume" ? 0 : 0;
    const min = field === "volume" ? 0 : -1;
    const max = field === "volume" ? 1.2 : 1;
    return Math.max(min, Math.min(max, value));
  }

  private handlePointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null;
    this.trackTimelinePinchPointer(event, target);
    if (this.beginTimelineHeightResize(target, event)) return;
    if (this.beginInspectorResize(target, event)) return;
    if (this.beginTimelineClipDrag(target, event)) return;
    if (this.beginChordsmithStepDrag(target, "pointerup")) return;
    if (this.isTimelineNonSeekTarget(target)) return;
    if (target?.closest("[data-inline-sequencer]")) return;
    const timeline = target?.closest<HTMLElement>("[data-timeline-surface]");
    const seekable = timeline && (target?.closest("[data-seek-ruler]") || !target?.closest("[data-clip-id]"));
    if (!timeline || !seekable) return;
    event.preventDefault();
    const scrub = (clientX: number, final = false) => {
      const bar = this.seekTimelineFromClientX(timeline, clientX, final);
      this.state.status = final ? `Seeked to ${this.formatBarBeat(bar)}.` : `Scrubbing ${this.formatBarBeat(bar)}.`;
    };
    scrub(event.clientX);
    const move = (moveEvent: PointerEvent) => scrub(moveEvent.clientX);
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      scrub(upEvent.clientX, true);
      this.render({ preserveScroll: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private beginTimelineHeightResize(target: HTMLElement | null, event: PointerEvent): boolean {
    if (!target?.closest("[data-timeline-resize-handle]")) return false;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = this.state.timelineHeightPx;
    const update = (clientY: number) => {
      this.state.timelineHeightPx = this.clampTimelineHeight(startHeight + clientY - startY);
      this.root.style.setProperty("--studio-height", `${this.state.timelineHeightPx}px`);
      this.state.status = `Timeline height ${this.state.timelineHeightPx}px.`;
    };
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientY);
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      update(upEvent.clientY);
      this.render({ preserveScroll: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return true;
  }

  private beginInspectorResize(target: HTMLElement | null, event: PointerEvent): boolean {
    if (!target?.closest("[data-inspector-resize-handle]")) return false;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.state.inspectorWidthPx;
    const update = (clientX: number) => {
      this.state.inspectorWidthPx = this.clampInspectorWidth(startWidth - (clientX - startX));
      this.root.style.setProperty("--inspector-width", `${this.state.inspectorWidthPx}px`);
      this.state.status = `Inspector width ${this.state.inspectorWidthPx}px.`;
    };
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX);
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      update(upEvent.clientX);
      this.render({ preserveScroll: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return true;
  }

  private beginTimelineClipDrag(target: HTMLElement | null, event: PointerEvent): boolean {
    if (!target) return false;
    if (target.closest(".timeline-step, select, input, textarea")) return false;
    const loopHandle = target.closest<HTMLElement>("[data-clip-loop-handle]");
    const dragHandle = target.closest<HTMLElement>("[data-clip-drag-handle]");
    const inlineClip = target.closest<HTMLElement>("[data-inline-clip-id]");
    const visibleClip = target.closest<HTMLElement>("[data-clip-id]");
    const clipId = loopHandle?.dataset.clipLoopHandle || dragHandle?.dataset.clipDragHandle || inlineClip?.dataset.inlineClipId || visibleClip?.dataset.clipId || "";
    if (!clipId) return false;
    const timeline = target.closest<HTMLElement>("[data-timeline-surface]") || this.root.querySelector<HTMLElement>("[data-timeline-surface]");
    const clip = currentProject(this.state).timeline.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return false;
    event.preventDefault();
    const mode: ClipDragMode = loopHandle ? "repeat" : "move";
    const startClientX = event.clientX;
    const startBar = clip.startBar;
    const grabOffsetBars = mode === "move" ? Math.max(0, this.clientXToTimelineBar(timeline, event.clientX) - clip.startBar) : 0;
    this.state.selectedClipId = clipId;
    this.state.selectedTrackId = inlineClip?.dataset.inlineRow || visibleClip?.dataset.row || this.state.selectedTrackId;
    this.render({ preserveScroll: true });
    const dragNodes = () => [
      ...findDataElements<HTMLElement>(this.root, "data-inline-clip-id", clipId),
      ...findDataElements<HTMLElement>(this.root, "data-clip-id", clipId)
    ];
    let latestValue = mode === "move" ? startBar : clip.startBar + clip.barLength;
    const preview = (clientX: number) => {
      const currentTimeline = this.root.querySelector<HTMLElement>("[data-timeline-surface]") || timeline;
      const rawBar = this.clientXToTimelineBar(currentTimeline, clientX);
      latestValue = mode === "move"
        ? this.snapTimelineBar(rawBar - grabOffsetBars)
        : Math.max(clip.startBar + clip.barLength, this.snapTimelineBar(rawBar));
      if (mode === "move") {
        const dx = Math.round((latestValue - startBar) * this.state.zoom);
        dragNodes().forEach((node) => {
          node.style.transform = `translateX(${dx}px)`;
          node.classList.add("dragging");
        });
        this.state.status = `Dragging ${clip.name} to Bar ${latestValue}.`;
      } else {
        const repeatBars = Math.max(0, latestValue - (clip.startBar + clip.barLength));
        dragNodes().forEach((node) => {
          node.classList.add("dragging", "loop-dragging");
          node.style.boxShadow = `inset 0 0 0 1px rgba(124, 255, 155, 0.72), ${Math.max(0, repeatBars * this.state.zoom)}px 0 0 rgba(124, 255, 155, 0.12)`;
        });
        this.state.status = `Repeating ${clip.name} to Bar ${latestValue}.`;
      }
    };
    preview(startClientX);
    const move = (moveEvent: PointerEvent) => preview(moveEvent.clientX);
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      preview(upEvent.clientX);
      this.suppressNextClipClick = true;
      if (mode === "move") {
        this.applyProjectState(moveClipToBarCommand(this.state, clipId, latestValue), { audio: "composition-events", preserveScroll: true, reason: "clip-drag-move" });
      } else {
        this.applyProjectState(repeatClipToEndCommand(this.state, clipId, latestValue), { audio: "composition-events", preserveScroll: true, reason: "clip-drag-repeat" });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return true;
  }

  private handleWheel(event: WheelEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("[data-timeline-surface], .timeline-scroll")) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const amount = Math.max(8, Math.min(42, Math.abs(event.deltaY) / 3));
    this.previewTimelineZoom(this.state.zoom + direction * amount);
  }

  private handlePointerMove(event: PointerEvent) {
    if (this.pinchPointers.has(event.pointerId)) {
      this.pinchPointers.set(event.pointerId, event);
      this.updatePinchZoom();
    }
  }

  private handlePointerEnd(event: PointerEvent) {
    if (!this.pinchPointers.has(event.pointerId)) return;
    this.pinchPointers.delete(event.pointerId);
    if (this.pinchPointers.size < 2) {
      this.pinchStartDistance = null;
      this.state.status = `Timeline zoom set to ${Math.round(this.state.zoom)} px/bar.`;
      this.render({ preserveScroll: true });
    }
  }

  private updatePinchZoom() {
    if (this.pinchPointers.size < 2) return;
    const [a, b] = Array.from(this.pinchPointers.values());
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!this.pinchStartDistance) {
      this.pinchStartDistance = distance;
      this.pinchStartZoom = this.state.zoom;
      return;
    }
    if (this.pinchStartDistance <= 0) return;
    this.previewTimelineZoom(this.pinchStartZoom * (distance / this.pinchStartDistance));
  }

  private trackTimelinePinchPointer(event: PointerEvent, target: HTMLElement | null) {
    if (!target?.closest("[data-timeline-surface], .timeline-scroll")) return;
    if (event.pointerType !== "touch") return;
    event.preventDefault();
    this.pinchPointers.set(event.pointerId, event);
    if (this.pinchPointers.size === 2) {
      this.pinchStartDistance = null;
      this.updatePinchZoom();
    }
  }

  private handleMouseDown(event: MouseEvent) {
    if (this.chordsmithDragStart) return;
    const target = event.target as HTMLElement | null;
    this.beginChordsmithStepDrag(target, "mouseup");
  }

  private applyNativeTitlebarOffset() {
    const win = window as unknown as Record<string, unknown>;
    const isTauri = "__TAURI_INTERNALS__" in win;
    document.documentElement.classList.toggle("native-desktop-shell", isTauri);
  }

  private beginChordsmithStepDrag(target: HTMLElement | null, endEventName: "pointerup" | "mouseup"): boolean {
    const stepTarget = this.stepSelectionFromElement(target);
    if (!stepTarget) return false;
    this.chordsmithDragStart = stepTarget;
    const up = (upEvent: PointerEvent | MouseEvent) => {
      window.removeEventListener(endEventName, up);
      const endElement = document.elementFromPoint(upEvent.clientX, upEvent.clientY) as HTMLElement | null;
      const endTarget = this.stepSelectionFromElement(endElement);
      if (endTarget && this.applyChordsmithStepDrag(stepTarget, endTarget)) {
        this.suppressNextStepClick = true;
      }
      this.chordsmithDragStart = null;
    };
    window.addEventListener(endEventName, up);
    return true;
  }

  private handleDelegatedClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (target?.matches("[data-controls-backdrop]")) {
      this.state.showControls = false;
      this.render();
      return;
    }
    if (target?.matches("[data-file-backdrop]")) {
      this.state.showFilePanel = false;
      this.render();
      return;
    }
    if (target?.matches("[data-add-track-backdrop]")) {
      this.state.showAddTrack = false;
      this.render();
      return;
    }
    if (target?.matches("[data-audio-settings-backdrop]")) {
      this.state.showAudioSettings = false;
      this.render();
      return;
    }
    if (target?.matches("[data-updater-backdrop]")) {
      this.state.showUpdaterPanel = false;
      this.render();
      return;
    }
    if (target?.matches("[data-mcp-setup-backdrop]")) {
      this.state.showMcpSetupPanel = false;
      this.render();
      return;
    }
    const addTrackButton = target?.closest<HTMLElement>("[data-add-track-kind]");
    if (addTrackButton) {
      this.applyProjectState(addTrackCommand(this.state, addTrackButton.dataset.addTrackKind as AddTrackKind), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "add-track"
      });
      return;
    }
    const armButton = target?.closest<HTMLElement>("[data-arm-track]");
    if (armButton) {
      const trackId = armButton.dataset.armTrack || "";
      this.applyProjectState(toggleTrackArmedCommand(this.state, armButton.dataset.armTrack || ""), {
        audio: "none",
        preserveScroll: true,
        reason: "track-arm"
      });
      void this.syncArmedInputPreview(trackId);
      return;
    }
    const monitorButton = target?.closest<HTMLElement>("[data-monitor-track]");
    if (monitorButton) {
      void this.toggleTrackMonitor(monitorButton.dataset.monitorTrack || "");
      return;
    }
    const fxToggle = target?.closest<HTMLElement>("[data-fx-toggle]");
    if (fxToggle) {
      const [chainId, slotId] = String(fxToggle.dataset.fxToggle || "").split(":");
      this.applyProjectState(toggleTrackFxCommand(this.state, chainId, slotId), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "track-fx-toggle"
      });
      return;
    }
    const fxRemove = target?.closest<HTMLElement>("[data-fx-remove]");
    if (fxRemove) {
      const [chainId, slotId] = String(fxRemove.dataset.fxRemove || "").split(":");
      this.applyProjectState(removeTrackFxCommand(this.state, chainId, slotId), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "track-fx-remove"
      });
      return;
    }
    const drumLaneFxToggle = target?.closest<HTMLElement>("[data-drum-lane-fx-toggle]");
    if (drumLaneFxToggle) {
      const [chainId, slotId] = String(drumLaneFxToggle.dataset.drumLaneFxToggle || "").split(":");
      this.applyProjectState(toggleDrumLaneFxCommand(this.state, chainId, slotId), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "drum-lane-fx-toggle"
      });
      return;
    }
    const drumLaneFxRemove = target?.closest<HTMLElement>("[data-drum-lane-fx-remove]");
    if (drumLaneFxRemove) {
      const [chainId, slotId] = String(drumLaneFxRemove.dataset.drumLaneFxRemove || "").split(":");
      this.applyProjectState(removeDrumLaneFxCommand(this.state, chainId, slotId), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "drum-lane-fx-remove"
      });
      return;
    }
    const placeAudio = target?.closest<HTMLElement>("[data-place-audio]");
    if (placeAudio) {
      this.applyProjectState(placeAudioClipCommand(this.state, placeAudio.dataset.placeAudio || ""));
      return;
    }
    const reloadMedia = target?.closest<HTMLElement>("[data-reload-media]");
    if (reloadMedia) {
      void this.reloadAudioMedia(reloadMedia.dataset.reloadMedia || "");
      return;
    }
    const relinkMedia = target?.closest<HTMLElement>("[data-relink-media]");
    if (relinkMedia) {
      void this.relinkAudioMedia(relinkMedia.dataset.relinkMedia || "");
      return;
    }
    const addMidiNote = target?.closest<HTMLElement>("[data-midi-note-add]");
    if (addMidiNote) {
      this.applyProjectState(addMidiNoteCommand(this.state, addMidiNote.dataset.midiNoteAdd || ""));
      return;
    }
    const deleteMidiNote = target?.closest<HTMLElement>("[data-midi-note-delete]");
    if (deleteMidiNote) {
      const [clipId, noteId] = String(deleteMidiNote.dataset.midiNoteDelete || "").split(":");
      this.applyProjectState(deleteMidiNoteCommand(this.state, clipId, noteId));
      return;
    }
    const moveMidiNote = target?.closest<HTMLElement>("[data-midi-note-move]");
    if (moveMidiNote) {
      const [clipId, noteId, direction] = String(moveMidiNote.dataset.midiNoteMove || "").split(":");
      this.applyProjectState(moveMidiNoteCommand(this.state, clipId, noteId, Number(direction) < 0 ? -1 : 1));
      return;
    }
    const pitchMidiNote = target?.closest<HTMLElement>("[data-midi-note-pitch]");
    if (pitchMidiNote) {
      const [clipId, noteId, direction] = String(pitchMidiNote.dataset.midiNotePitch || "").split(":");
      this.applyProjectState(pitchMidiNoteCommand(this.state, clipId, noteId, Number(direction) < 0 ? -1 : 1));
      return;
    }
    const resizeMidiNote = target?.closest<HTMLElement>("[data-midi-note-duration]");
    if (resizeMidiNote) {
      const [clipId, noteId, direction] = String(resizeMidiNote.dataset.midiNoteDuration || "").split(":");
      this.applyProjectState(resizeMidiNoteCommand(this.state, clipId, noteId, Number(direction) < 0 ? -1 : 1));
      return;
    }
    const automationCreate = target?.closest<HTMLElement>("[data-automation-create]");
    if (automationCreate) {
      const [trackId, field] = String(automationCreate.dataset.automationCreate || "").split(":");
      this.applyProjectState(ensureAutomationLaneCommand(this.state, trackId, field === "pan" ? "pan" : "volume"));
      return;
    }
    const automationAddPoint = target?.closest<HTMLElement>("[data-automation-add-point]");
    if (automationAddPoint) {
      const [trackId, field] = String(automationAddPoint.dataset.automationAddPoint || "").split(":");
      this.applyProjectState(addAutomationPointCommand(this.state, trackId, field === "pan" ? "pan" : "volume"));
      return;
    }
    const automationDeletePoint = target?.closest<HTMLElement>("[data-automation-delete-point]");
    if (automationDeletePoint) {
      const [laneId, index] = String(automationDeletePoint.dataset.automationDeletePoint || "").split(":");
      this.applyProjectState(deleteAutomationPointCommand(this.state, laneId, Number(index)));
      return;
    }
    const stepPage = target?.closest<HTMLElement>("[data-step-page]");
    if (stepPage) {
      const direction = Number(stepPage.dataset.stepPage || 0);
      this.state.chordsmithEditorStepPage = Math.max(0, this.state.chordsmithEditorStepPage + direction);
      this.state.status = `Chordsmith step page ${this.state.chordsmithEditorStepPage + 1}.`;
      this.render({ preserveScroll: true });
      return;
    }
    const drumStep = target?.closest<HTMLElement>("[data-drum-step]");
    if (drumStep) {
      if (this.consumeSuppressedStepClick()) return;
      const [sectionId, lane, step] = String(drumStep.dataset.drumStep || "").split(":");
      const selection: ChordsmithStepSelection = { kind: "drums", sectionId, lane: lane === "snare" || lane === "hat" ? lane : "kick", step: Number(step) };
      this.selectChordsmithStep(selection);
      this.applyChordsmithEditorEdit(cycleDrumStepCommand(this.state, sectionId, lane, Number(step)), "chordsmith-drum-step", { step: selection });
      return;
    }
    const drumTuplet = target?.closest<HTMLElement>("[data-drum-tuplet]");
    if (drumTuplet) {
      const [sectionId, lane, step] = String(drumTuplet.dataset.drumTuplet || "").split(":");
      this.applyChordsmithEditorEdit(cycleDrumTupletCommand(this.state, sectionId, lane, Number(step)), "chordsmith-drum-tuplet");
      return;
    }
    const bassStep = target?.closest<HTMLElement>("[data-bass-step]");
    if (bassStep) {
      if (this.consumeSuppressedStepClick()) return;
      const [sectionId, step] = String(bassStep.dataset.bassStep || "").split(":");
      const selection: ChordsmithStepSelection = { kind: "bass", sectionId, step: Number(step) };
      this.selectChordsmithStep(selection);
      this.applyChordsmithEditorEdit(cycleBassStepCommand(this.state, sectionId, Number(step)), "chordsmith-bass-step", { step: selection });
      return;
    }
    const bassHold = target?.closest<HTMLElement>("[data-bass-hold]");
    if (bassHold) {
      const [sectionId, step] = String(bassHold.dataset.bassHold || "").split(":");
      this.applyChordsmithEditorEdit(toggleBassHoldCommand(this.state, sectionId, Number(step)), "chordsmith-bass-hold");
      return;
    }
    const bassSlide = target?.closest<HTMLElement>("[data-bass-slide]");
    if (bassSlide) {
      const [sectionId, step] = String(bassSlide.dataset.bassSlide || "").split(":");
      this.applyChordsmithEditorEdit(toggleBassSlideCommand(this.state, sectionId, Number(step)), "chordsmith-bass-slide");
      return;
    }
    const bassAccent = target?.closest<HTMLElement>("[data-bass-accent]");
    if (bassAccent) {
      const [sectionId, step] = String(bassAccent.dataset.bassAccent || "").split(":");
      this.applyChordsmithEditorEdit(toggleBassAccentCommand(this.state, sectionId, Number(step)), "chordsmith-bass-accent");
      return;
    }
    const melodyStep = target?.closest<HTMLElement>("[data-melody-step]");
    if (melodyStep) {
      if (this.consumeSuppressedStepClick()) return;
      const [sectionId, trackIndex, step] = String(melodyStep.dataset.melodyStep || "").split(":");
      const selection: ChordsmithStepSelection = { kind: "melody", sectionId, trackIndex: Number(trackIndex), step: Number(step) };
      this.selectChordsmithStep(selection);
      this.applyChordsmithEditorEdit(cycleMelodyStepCommand(this.state, sectionId, Number(trackIndex), Number(step)), "chordsmith-melody-step", { step: selection });
      return;
    }
    const melodyHold = target?.closest<HTMLElement>("[data-melody-hold]");
    if (melodyHold) {
      const [sectionId, trackIndex, step] = String(melodyHold.dataset.melodyHold || "").split(":");
      this.applyChordsmithEditorEdit(toggleMelodyHoldCommand(this.state, sectionId, Number(trackIndex), Number(step)), "chordsmith-melody-hold");
      return;
    }
    const melodySlide = target?.closest<HTMLElement>("[data-melody-slide]");
    if (melodySlide) {
      const [sectionId, trackIndex, step] = String(melodySlide.dataset.melodySlide || "").split(":");
      this.applyChordsmithEditorEdit(toggleMelodySlideCommand(this.state, sectionId, Number(trackIndex), Number(step)), "chordsmith-melody-slide");
      return;
    }
    const melodyTuplet = target?.closest<HTMLElement>("[data-melody-tuplet]");
    if (melodyTuplet) {
      const [sectionId, trackIndex, step] = String(melodyTuplet.dataset.melodyTuplet || "").split(":");
      this.applyChordsmithEditorEdit(toggleMelodyTupletCommand(this.state, sectionId, Number(trackIndex), Number(step)), "chordsmith-melody-tuplet");
      return;
    }
    const guitarStep = target?.closest<HTMLElement>("[data-guitar-step]");
    if (guitarStep) {
      const [sectionId, step] = String(guitarStep.dataset.guitarStep || "").split(":");
      this.applyChordsmithEditorEdit(cycleGuitarStepCommand(this.state, sectionId, Number(step)), "chordsmith-guitar-step");
      return;
    }
    const actionButton = target?.closest<HTMLElement>("[data-action]");
    if (actionButton) {
      void this.dispatch(actionButton.dataset.action || "", actionButton);
      return;
    }
    const markerRename = target?.closest<HTMLElement>("[data-marker-rename]");
    if (markerRename) {
      const markerId = markerRename.dataset.markerRename || "";
      const marker = currentProject(this.state).timeline.markers.find((item) => item.id === markerId);
      const nextName = window.prompt("Marker name", marker?.name || "Marker");
      if (nextName !== null) this.applyProjectState(renameMarkerCommand(this.state, markerId, nextName));
      return;
    }
    const trackRename = target?.closest<HTMLElement>("[data-track-rename]");
    if (trackRename) {
      const trackId = trackRename.dataset.trackRename || "";
      const track = currentProject(this.state).tracks.find((item) => item.id === trackId);
      const nextName = window.prompt("Track name", track?.name || "Track");
      if (nextName !== null) this.applyProjectState(renameTrackCommand(this.state, trackId, nextName));
      return;
    }
    const markerDelete = target?.closest<HTMLElement>("[data-marker-delete]");
    if (markerDelete) {
      this.applyProjectState(deleteMarkerCommand(this.state, markerDelete.dataset.markerDelete || ""));
      return;
    }
    const muteButton = target?.closest<HTMLElement>("[data-mute-track]");
    if (muteButton) {
      this.toggleTrackMute(muteButton.dataset.muteTrack || "");
      return;
    }
    const soloButton = target?.closest<HTMLElement>("[data-solo-track]");
    if (soloButton) {
      this.toggleTrackSolo(soloButton.dataset.soloTrack || "");
      return;
    }
    const inlineClip = target?.closest<HTMLElement>("[data-inline-clip-id]");
    if (inlineClip) {
      if (this.consumeSuppressedClipClick()) return;
      if (target?.closest("button, input, select, textarea")) return;
      this.state.selectedClipId = inlineClip.dataset.inlineClipId || null;
      this.state.selectedTrackId = inlineClip.dataset.inlineRow || this.state.selectedTrackId;
      this.state.status = `Selected ${this.state.selectedClipId}.`;
      this.render({ preserveScroll: true });
      return;
    }
    if (this.isTimelineNonSeekTarget(target)) return;
    if (target?.closest("[data-inline-sequencer]")) return;
    const timeline = target?.closest<HTMLElement>("[data-timeline-surface]");
    const seekable = target?.closest("[data-seek-ruler]") || (timeline && !target?.closest("[data-clip-id]"));
    if (timeline && seekable) {
      const mouse = event as MouseEvent;
      const bar = this.seekTimelineFromClientX(timeline, mouse.clientX, true);
      this.state.status = `Seeked to ${this.formatBarBeat(bar)}.`;
      this.render({ preserveScroll: true });
    }
  }

  private isTimelineNonSeekTarget(target: HTMLElement | null): boolean {
    return !!target?.closest("[data-track-id], [data-mute-track], [data-solo-track], [data-arm-track], [data-monitor-track], [data-timeline-non-seek], button, input, select, textarea");
  }

  private isTrackHeaderControlTarget(target: HTMLElement | null): boolean {
    return !!target?.closest("[data-mute-track], [data-solo-track], [data-arm-track], [data-monitor-track], [data-timeline-non-seek], button, input, select, textarea");
  }

  private async dispatch(action: string, actionSource?: HTMLElement) {
    if (action === "play") await this.playTransport();
    if (action === "pause") {
      this.engine.pause();
      this.stopLiveMetronome();
    }
    if (action === "stop") {
      this.engine.stop();
      this.stopLiveMetronome();
    }
    if (action === "restart") await this.restartTransport();
    if (action === "record-toggle") await this.toggleRecording();
    if (action === "metronome-toggle") {
      this.applyProjectState(toggleMetronomeCommand(this.state), {
        audio: "project-load",
        preserveScroll: true,
        reason: "metronome-toggle"
      });
      if (metronomeSettings(currentProject(this.state)).enabled && (this.state.playing || this.state.recording.status === "recording")) {
        this.startLiveMetronome(true);
      } else {
        this.stopLiveMetronome();
      }
    }
    if (action === "seek-start") this.seekToBar(1, true);
    if (action === "controls-open") {
      this.state.showControls = true;
      this.render();
    }
    if (action === "controls-close") {
      this.state.showControls = false;
      this.render();
    }
    if (action === "file-window-open") {
      this.state.showFilePanel = true;
      this.render();
    }
    if (action === "file-window-close") {
      this.state.showFilePanel = false;
      this.render();
    }
    if (action === "add-track-open") {
      this.state.showAddTrack = true;
      this.render();
    }
    if (action === "add-bus-track") this.applyProjectState(addBusTrackCommand(this.state), { audio: "mixer-graph", preserveScroll: true, reason: "add-bus-track" });
    if (action === "add-return-track") this.applyProjectState(addReturnTrackCommand(this.state), { audio: "mixer-graph", preserveScroll: true, reason: "add-return-track" });
    if (action === "add-track-close") {
      this.state.showAddTrack = false;
      this.render();
    }
    if (action === "audio-settings-open") {
      this.state.showAudioSettings = true;
      this.render();
    }
    if (action === "audio-settings-close") {
      this.state.showAudioSettings = false;
      this.render();
    }
    if (action === "updater-open") {
      this.state.showUpdaterPanel = true;
      this.render();
    }
    if (action === "updater-close") {
      this.state.showUpdaterPanel = false;
      this.render();
    }
    if (action === "mcp-setup-open") {
      this.state.showMcpSetupPanel = true;
      this.render();
      void this.configureAiBridgeFromPreference();
    }
    if (action === "mcp-setup-close") {
      this.state.showMcpSetupPanel = false;
      this.render();
    }
    if (action === "copy-mcp-setup") await this.copyMcpSetup(actionSource?.dataset.copyMcpSetup || "all");
    if (action === "ai-bridge-test") await this.testAiBridgeConnection();
    if (action === "updater-check") await this.checkForUpdates(true);
    if (action === "updater-download-install") await this.downloadAndInstallUpdate();
    if (action === "updater-restart") await this.restartAfterUpdate();
    if (action === "feedback-open") {
      this.state.showFeedbackPanel = true;
      this.render();
      this.root.querySelector<HTMLTextAreaElement>("[data-feedback-text]")?.focus();
    }
    if (action === "feedback-close") {
      this.state.showFeedbackPanel = false;
      this.render();
    }
    if (action === "feedback-copy-diagnostics") await this.copyDiagnostics();
    if (action === "feedback-send") await this.sendFeedbackEmail();
    if (action === "more-by-samfa12") this.openExternalUrl(MORE_BY_SAMFA12_URL);
    if (action === "media-pool-focus") {
      this.state.status = "Media Pool visible.";
      this.state.showFilePanel = false;
      this.render();
      this.root.querySelector<HTMLElement>("#mediaPool")?.scrollIntoView({ block: "start", inline: "nearest" });
    }
    if (action === "import-focus") {
      this.state.status = "Paste a PCS1 share code, Pocket Chordsmith JSON, PocketHandoff payload or .pocketdaw JSON.";
      this.state.showFilePanel = true;
      this.render();
      const importText = this.root.querySelector<HTMLTextAreaElement>("#importText");
      importText?.scrollIntoView({ block: "center", inline: "nearest" });
      importText?.focus();
    }
    if (action === "toggle-inspector") {
      this.state.inspectorVisible = !this.state.inspectorVisible;
      this.state.status = this.state.inspectorVisible ? "Inspector shown." : "Inspector hidden.";
      this.render({ preserveScroll: true });
    }
    if (action === "import-audio") await this.importAudioMedia();
    if (action === "import-midi") await this.importMidiMedia();
    if (action === "audio-refresh") await this.refreshAudioDevices();
    if (action === "undo") this.applyProjectState(undoCommand(this.state));
    if (action === "redo") this.applyProjectState(redoCommand(this.state));
    if (action === "clip-left") this.applyProjectState(moveSelectedClipBySnap(this.state, -1));
    if (action === "clip-right") this.applyProjectState(moveSelectedClipBySnap(this.state, 1));
    if (action === "clip-duplicate") this.applyProjectState(duplicateSelectedClip(this.state));
    if (action === "clip-delete") this.applyProjectState(deleteSelectedClip(this.state));
    if (action === "clip-mute") this.applyProjectState(toggleSelectedClipMute(this.state));
    if (action === "clip-copy") {
      this.state = copySelectedClip(this.state);
      this.render();
    }
    if (action === "clip-paste") this.applyProjectState(pasteClipAtPlayhead(this.state));
    if (action === "clip-split") this.applyProjectState(splitSelectedClipAtPlayhead(this.state));
    if (action === "trim-start-right") this.applyProjectState(trimSelectedClipStartCommand(this.state, 1));
    if (action === "trim-start-left") this.applyProjectState(trimSelectedClipStartCommand(this.state, -1));
    if (action === "trim-end-left") this.applyProjectState(trimSelectedClipEndCommand(this.state, -1));
    if (action === "trim-end-right") this.applyProjectState(trimSelectedClipEndCommand(this.state, 1));
    if (action === "toggle-loop") this.applyProjectState(setLoopEnabled(this.state, !currentProject(this.state).timeline.loop.enabled), { audio: "transport-controls", reason: "loop-toggle" });
    if (action === "loop-selected") this.applyProjectState(setLoopToSelectedClipCommand(this.state), { audio: "transport-controls", reason: "loop-selected" });
    if (action === "loop-clear") this.applyProjectState(clearLoopCommand(this.state), { audio: "transport-controls", reason: "loop-clear" });
    if (action === "marker-add") this.applyProjectState(addMarkerAtPlayheadCommand(this.state));
    if (action === "section-add") {
      const sectionId = this.root.querySelector<HTMLSelectElement>("#songSectionToAdd")?.value || this.state.chordsmithEditorSectionId || "A";
      this.state.chordsmithEditorSectionId = sectionId;
      this.applyChordsmithEditorEdit(appendChordsmithSectionCommand(this.state, sectionId), "chordsmith-section-add");
    }
    if (action === "zoom-in") {
      this.state.zoom = this.clampTimelineZoom(this.state.zoom + 18);
      this.render({ preserveScroll: true });
    }
    if (action === "zoom-out") {
      this.state.zoom = this.clampTimelineZoom(this.state.zoom - 12);
      this.render({ preserveScroll: true });
    }
    if (action === "import-text") this.importText(this.state.importText);
    if (action === "open-file" || action === "open-project") await this.openProject();
    if (action === "new-project") this.newProject();
    if (action === "load-demo") this.loadDemo();
    if (action === "reset-demo-template") this.reloadDemoTemplate();
    if (action === "save-project") await this.saveProject(false);
    if (action === "save-project-as") await this.saveProject(true);
    if (action === "export-wav") await this.exportWav();
    if (action === "export-midi") this.exportMidi();
    if (action === "export-selected-clip-midi") this.exportSelectedClipMidi();
    if (action === "export-selected-track-midi") this.exportSelectedTrackMidi();
    if (action === "freeze-selected-clip") await this.freezeSelectedClip();
    if (action === "export-stems") await this.exportStems();
    if (action === "export-section-manifest") void this.exportSectionLoops();
    if (action === "export-godot-manifest") await this.exportGamePack("godot-adaptive-pack");
    if (action === "export-web-game-manifest") await this.exportGamePack("web-game-pack");
    if (action === "export-media-plan") this.exportMediaPlan();
    if (action === "collect-media") await this.collectMedia();
    if (action === "build-native-cache") await this.buildNativeCache();
    if (action === "copy-diagnostics") await this.copyDiagnostics();
    if (action === "export-diagnostics") this.exportDiagnostics();
  }

  private scheduleStartupUpdateCheck() {
    if (!this.state.updaterAutoCheckOnStartup) return;
    window.setTimeout(() => {
      void this.checkForUpdates(false);
    }, 3500);
  }

  private async checkForUpdates(showPanel: boolean) {
    this.state.showUpdaterPanel = showPanel || this.state.showUpdaterPanel;
    this.state.updaterStatus = "checking";
    this.state.updaterMessage = "Checking for updates...";
    this.state.updaterAvailableVersion = null;
    this.state.updaterReleaseNotes = null;
    this.state.updaterDownloadProgress = null;
    this.render({ preserveScroll: true });

    const result = await checkForPocketDawUpdate();
    this.state.updaterCurrentVersion = result.currentVersion || POCKET_DAW_VERSION;
    this.state.updaterMessage = result.message;
    if (!result.runtimeAvailable) {
      this.state.updaterStatus = showPanel ? "error" : "idle";
    } else if (result.available && result.update) {
      this.state.updaterStatus = "available";
      this.state.updaterAvailableVersion = result.update.version;
      this.state.updaterReleaseNotes = result.update.notes;
      this.state.status = `Pocket DAW ${result.update.version} is available. Open Help > Check for Updates.`;
      if (!showPanel) this.state.showUpdaterPanel = true;
    } else {
      this.state.updaterStatus = "not-available";
      this.state.updaterAvailableVersion = null;
      this.state.updaterReleaseNotes = null;
      if (!showPanel) this.state.showUpdaterPanel = false;
    }
    this.render({ preserveScroll: true });
  }

  private async downloadAndInstallUpdate() {
    if (this.state.updaterStatus !== "available") return;
    this.state.updaterStatus = "downloading";
    this.state.updaterMessage = this.state.playing ? "Downloading update while playback continues..." : "Downloading update...";
    this.state.updaterDownloadProgress = 0;
    this.render({ preserveScroll: true });

    const result = await downloadAndInstallPocketDawUpdate((progress) => this.applyUpdaterProgress(progress));
    this.state.updaterMessage = result.message;
    if (result.installed) {
      this.state.updaterStatus = "ready-to-restart";
      this.state.updaterDownloadProgress = 1;
      this.state.status = "Update installed. Restart Pocket DAW to finish.";
    } else {
      this.state.updaterStatus = "error";
      this.state.updaterDownloadProgress = null;
    }
    this.render({ preserveScroll: true });
  }

  private applyUpdaterProgress(progress: PocketDawUpdateProgress) {
    this.state.updaterStatus = progress.status;
    this.state.updaterMessage = progress.message;
    this.state.updaterDownloadProgress = progress.progress;
    this.render({ preserveScroll: true });
  }

  private async restartAfterUpdate() {
    const result = await relaunchPocketDaw();
    this.state.updaterMessage = result.message;
    this.state.status = result.message;
    if (!result.relaunched) this.state.updaterStatus = "ready-to-restart";
    this.render({ preserveScroll: true });
  }

  private async handleKeyboard(event: KeyboardEvent) {
    if (this.handleChordsmithStepShortcut(event)) return;
    const command = commandFromKeyboardEvent(event);
    if (!command) return;
    event.preventDefault();
    if (command === "play-pause") {
      if (this.state.playing) {
        this.engine.pause();
        this.stopLiveMetronome();
      } else {
        await this.playTransport();
      }
    }
    if (command === "seek-start") {
      this.seekToBar(1, true);
      this.render();
    }
    if (command === "toggle-loop") this.applyProjectState(setLoopEnabled(this.state, !currentProject(this.state).timeline.loop.enabled), { audio: "transport-controls", reason: "loop-toggle" });
    if (command === "mute-selected-track" && this.state.selectedTrackId) this.toggleTrackMute(this.state.selectedTrackId);
    if (command === "solo-selected-track" && this.state.selectedTrackId) this.toggleTrackSolo(this.state.selectedTrackId);
    if (command === "arm-selected-track" && this.state.selectedTrackId) {
      const trackId = this.state.selectedTrackId;
      this.applyProjectState(toggleTrackArmedCommand(this.state, this.state.selectedTrackId), {
        audio: "none",
        preserveScroll: true,
        reason: "track-arm-keyboard"
      });
      void this.syncArmedInputPreview(trackId);
    }
    if (command === "duplicate-clip") this.applyProjectState(duplicateSelectedClip(this.state));
    if (command === "copy-clip") {
      this.state = copySelectedClip(this.state);
      this.render();
    }
    if (command === "paste-clip") this.applyProjectState(pasteClipAtPlayhead(this.state));
    if (command === "delete-clip") this.applyProjectState(deleteSelectedClip(this.state));
    if (command === "split-clip") this.applyProjectState(splitSelectedClipAtPlayhead(this.state));
    if (command === "loop-selected") this.applyProjectState(setLoopToSelectedClipCommand(this.state), { audio: "transport-controls", reason: "loop-selected" });
    if (command === "add-marker") this.applyProjectState(addMarkerAtPlayheadCommand(this.state));
    if (command === "move-clip-left") this.applyProjectState(moveSelectedClip(this.state, -1));
    if (command === "move-clip-right") this.applyProjectState(moveSelectedClip(this.state, 1));
    if (command === "zoom-in") {
      this.state.zoom = this.clampTimelineZoom(this.state.zoom + 18);
      this.render({ preserveScroll: true });
    }
    if (command === "zoom-out") {
      this.state.zoom = this.clampTimelineZoom(this.state.zoom - 12);
      this.render({ preserveScroll: true });
    }
    if (command === "undo") this.applyProjectState(undoCommand(this.state));
    if (command === "redo") this.applyProjectState(redoCommand(this.state));
    if (command === "save-project") await this.saveProject(false);
    if (command === "open-file") await this.openProject();
    if (command === "export-wav") await this.exportWav();
    if (command === "add-track") {
      this.state.showAddTrack = true;
      this.render();
    }
  }

  private async playTransport() {
    if (this.engine.canResumePausedNativePlayback()) {
      await this.engine.play();
      return;
    }

    let showedBusy = false;
    let hydration: Awaited<ReturnType<typeof this.hydrateTimelineAudioBuffers>> = { total: 0, loaded: 0, cached: 0, missing: [] };
    try {
      const prepared = await this.prepareTimelineAudioForPlayback("native playback");
      showedBusy = prepared.showedBusy;
      hydration = prepared.hydration;
      await this.engine.play();
      this.startLiveMetronome(false);
      if (hydration.loaded > 0) {
        this.state.status = `Loaded ${hydration.loaded} audio file${hydration.loaded === 1 ? "" : "s"} for native playback.`;
      } else if (hydration.missing.length) {
        this.state.status = `Could not load ${hydration.missing.length} audio file${hydration.missing.length === 1 ? "" : "s"}; playback will use available material.`;
      }
    } finally {
      if (showedBusy) {
        this.state.busyMessage = null;
        this.render({ preserveScroll: true });
      }
    }
  }

  private clampTimelineZoom(value: number): number {
    if (!Number.isFinite(value)) return 240;
    return Math.max(48, Math.min(360, Math.round(value)));
  }

  private clampTimelineHeight(value: number): number {
    if (!Number.isFinite(value)) return 430;
    return Math.max(260, Math.min(760, Math.round(value)));
  }

  private clampInspectorWidth(value: number): number {
    if (!Number.isFinite(value)) return 420;
    return Math.max(280, Math.min(620, Math.round(value)));
  }

  private previewTimelineZoom(value: number) {
    this.state.zoom = this.clampTimelineZoom(value);
    const timeline = this.root.querySelector<HTMLElement>("[data-timeline-surface]");
    if (timeline) {
      timeline.style.setProperty("--bar", `${this.state.zoom}px`);
      timeline.style.width = `${this.timelineWidthPx()}px`;
    }
    const input = this.root.querySelector<HTMLInputElement>("#timelineZoom");
    if (input) input.value = String(this.state.zoom);
    const readout = this.root.querySelector<HTMLElement>("[data-zoom-readout]");
    if (readout) readout.textContent = `${Math.round(this.state.zoom)} px/bar`;
    this.updateLiveDom();
  }

  private timelineWidthPx(): number {
    return Math.max(1100, this.timelineTrackHeaderWidth() + (currentProject(this.state).timeline.bars + 1) * this.state.zoom);
  }

  private clientXToTimelineBar(timeline: HTMLElement, clientX: number): number {
    const rect = timeline.getBoundingClientRect();
    return (clientX - rect.left - this.timelineTrackHeaderWidth(timeline)) / this.state.zoom + 1;
  }

  private snapTimelineBar(value: number): number {
    const project = currentProject(this.state);
    return snapBarValue(value, this.state.snapMode, project.project.timeSig);
  }

  private async restartTransport() {
    let showedBusy = false;
    try {
      const prepared = await this.prepareTimelineAudioForPlayback("restart");
      showedBusy = prepared.showedBusy;
      await this.engine.restart();
      this.startLiveMetronome(false);
    } finally {
      if (showedBusy) {
        this.state.busyMessage = null;
        this.render({ preserveScroll: true });
      }
    }
  }

  private async toggleRecording() {
    if (this.state.recording.status === "recording" || this.state.recording.status === "stopping") {
      await this.stopRecording();
      return;
    }
    if (this.state.recording.status === "preparing" || this.state.recording.status === "count-in") {
      this.recordingStartToken += 1;
      this.stopLiveMetronome();
      const trackId = this.state.recording.trackId || undefined;
      const message = this.state.recording.status === "preparing" ? "Recording preparation cancelled." : "Recording count-in cancelled.";
      this.state.recording = createRecordingUiState({ message });
      this.state.status = message;
      this.render({ preserveScroll: true });
      this.inputPreviewKey = null;
      void this.syncArmedInputPreview(trackId);
      return;
    }
    await this.startRecording();
  }

  private async startRecording() {
    const project = currentProject(this.state);
    if (!isNativeRecordingAvailable()) {
      this.state.status = "Live recording is only available in the installed Pocket DAW app.";
      this.state.recording = createRecordingUiState({ status: "error", message: this.state.status });
      this.render({ preserveScroll: true });
      return;
    }
    if (!this.state.currentFile.path) {
      this.state.status = "Save the .pocketdaw project before recording so WAV takes can be stored under project-media/recordings.";
      this.render({ preserveScroll: true });
      return;
    }
    const armedTracks = project.tracks.filter((track) => track.armed && track.recordKind && track.recordKind !== "none");
    if (armedTracks.length !== 1) {
      this.state.status = armedTracks.length
        ? "Only one live audio track can be armed for this recording alpha."
        : "Arm one live audio track before recording.";
      this.render({ preserveScroll: true });
      return;
    }
    const track = armedTracks[0];
    const startBar = Math.max(1, this.state.playheadBar || project.timeline.cursor.bar || 1);
    const sessionId = this.recordingStartToken + 1;
    this.recordingStartToken = sessionId;
    const preRollSeconds = countInSeconds(project);
    const captureStartTransportSeconds = Math.max(0, (startBar - 1) * secondsPerBar(project));
    const shouldStartBackingPlayback = !this.engine.isPlaying();
    const startupPlan = buildRecordingStartupPlan({
      transportAlreadyPlaying: !shouldStartBackingPlayback,
      countInSeconds: preRollSeconds
    });
    this.state.recording = createRecordingUiState({
      status: "preparing",
      sessionId,
      trackId: track.id,
      startBar,
      captureStartTransportSeconds,
      timingSource: shouldStartBackingPlayback ? "prepared-stopped-transport-estimate" : "already-playing-transport-estimate",
      message: `Preparing ${track.name} recording...`
    });
    this.state.status = this.state.recording.message;
    this.render({ preserveScroll: true });

    let nativeCaptureStarted = false;
    let showedBusy = false;
    let startedBackingPlayback = false;
    let playbackStartedAtMonotonicMs: number | null = null;
    let captureRequestedAtMonotonicMs: number | null = null;
    try {
      if (shouldStartBackingPlayback) {
        this.seekToBar(startBar, true);
      }
      const prepared = await this.prepareTimelineAudioForPlayback("recording startup");
      showedBusy = prepared.showedBusy;
      if (!recordingSessionMatches(this.state.recording, sessionId, ["preparing"])) return;

      await this.syncArmedInputPreview(track.id);
      if (!recordingSessionMatches(this.state.recording, sessionId, ["preparing"])) return;

      if (startupPlan.includes("count-in")) {
        this.state.recording = createRecordingUiState({
          ...this.state.recording,
          status: "count-in",
          sessionId,
          trackId: track.id,
          startBar,
          captureStartTransportSeconds,
          message: `Count-in ${Math.max(1, Math.round(preRollSeconds))}s.`
        });
        this.state.status = `Recording ${track.name} after count-in.`;
        this.render({ preserveScroll: true });
        this.startCountInMetronome(project, preRollSeconds);
        await new Promise<void>((resolve) => window.setTimeout(resolve, preRollSeconds * 1000));
        if (!recordingSessionMatches(this.state.recording, sessionId, ["count-in"])) return;
      }

      if (startupPlan.includes("start-backing-playback")) {
        this.seekToBar(startBar, true);
        await this.engine.play();
        startedBackingPlayback = true;
        playbackStartedAtMonotonicMs = monotonicNowMs();
        if (!recordingSessionMatches(this.state.recording, sessionId, preRollSeconds > 0 ? ["count-in"] : ["preparing"])) {
          this.engine.stop();
          return;
        }
      }

      captureRequestedAtMonotonicMs = monotonicNowMs();
      const playbackCaptureAnchor = await this.engine.nativePlaybackRecordingAnchor("capture-request", captureRequestedAtMonotonicMs);
      const status = await startNativeRecording({
        projectFilePath: this.state.currentFile.path,
        projectTitle: project.project.title,
        trackId: track.id,
        trackName: track.name,
        inputDeviceId: track.inputDeviceId || project.audioDeviceSettings.inputDeviceId,
        outputDeviceId: project.audioDeviceSettings.outputDeviceId,
        monitorEnabled: !!track.monitorEnabled && !track.mute,
        monitorVolume: track.mute ? 0 : track.volume,
        monitorPan: track.pan,
        recordingSessionId: sessionId,
        startBar,
        requestedStartSeconds: captureStartTransportSeconds,
        sampleRate: project.project.sampleRate || project.audioDeviceSettings.sampleRate || 44100
      });
      nativeCaptureStarted = true;
      if (!recordingSessionMatches(this.state.recording, sessionId, preRollSeconds > 0 ? ["count-in"] : ["preparing"])) {
        await stopNativeRecording().catch(() => undefined);
        if (startedBackingPlayback) this.engine.stop();
        return;
      }
      this.inputPreviewKey = null;
      this.state.recording = createRecordingUiState({
        status: "recording",
        sessionId,
        trackId: track.id,
        startedAt: new Date().toISOString(),
        startBar,
        captureStartTransportSeconds,
        playbackStartedAtMonotonicMs,
        captureRequestedAtMonotonicMs,
        playbackCaptureAnchor,
        timingSource: shouldStartBackingPlayback ? "playback-start-then-native-capture-estimate" : "already-playing-transport-estimate",
        elapsedSeconds: 0,
        inputPeak: Math.max(0, Math.min(1, status.peak || 0)),
        inputDeviceName: status.inputDeviceName,
        outputDeviceName: status.outputDeviceName,
        monitoring: !!status.monitoring,
        livePeaks: [],
        message: recordingStatusMessage(track.name, status.monitoring, status.outputDeviceName)
      });
      this.state.status = this.state.recording.message;
      if (metronomeSettings(project).enabled) this.startLiveMetronome(true);
      else this.stopLiveMetronome();
      this.startRecordingTimer();
      this.render({ preserveScroll: true });
    } catch (error) {
      if (!recordingSessionMatches(this.state.recording, sessionId, ["preparing", "count-in"])) return;
      this.stopLiveMetronome();
      const cleanup = recordingStartFailureCleanupPlan({
        nativeCaptureStarted,
        backingPlaybackStarted: startedBackingPlayback
      });
      if (cleanup.stopNativeCapture) {
        try {
          await stopNativeRecording();
        } catch {
          // The start error is more useful to surface here.
        }
      }
      if (cleanup.stopBackingPlayback) this.engine.stop();
      const message = error instanceof Error ? error.message : "Could not start live recording.";
      this.state.recording = createRecordingUiState({
        status: "error",
        sessionId,
        trackId: track.id,
        startBar,
        captureStartTransportSeconds,
        message
      });
      this.state.status = message;
      this.render({ preserveScroll: true });
    } finally {
      if (showedBusy) {
        this.state.busyMessage = null;
        this.render({ preserveScroll: true });
      }
    }
  }

  private async stopRecording() {
    if (this.state.recording.status !== "recording" && this.state.recording.status !== "stopping") return;
    const trackId = this.state.recording.trackId;
    const startBar = this.state.recording.startBar || this.state.playheadBar || 1;
    const sessionId = this.state.recording.sessionId ?? this.recordingStartToken;
    const captureStartTransportSeconds = this.state.recording.captureStartTransportSeconds;
    const playbackStartedAtMonotonicMs = this.state.recording.playbackStartedAtMonotonicMs;
    const captureRequestedAtMonotonicMs = this.state.recording.captureRequestedAtMonotonicMs;
    const playbackCaptureAnchor = this.state.recording.playbackCaptureAnchor;
    const timingSource = this.state.recording.timingSource || "ui-transport-boundary-estimate";
    const playbackStopAnchor = await this.engine.nativePlaybackRecordingAnchor("stop-request", monotonicNowMs()).catch(() => null);
    if (!recordingSessionMatches(this.state.recording, sessionId, ["recording", "stopping"])) return;
    this.state.recording = {
      ...this.state.recording,
      playbackStopAnchor,
      status: "stopping",
      message: "Stopping recording and writing WAV..."
    };
    this.state.status = this.state.recording.message;
    this.render({ preserveScroll: true });
    this.stopRecordingTimer();
    this.stopLiveMetronome();
    try {
      const result = await stopNativeRecording();
      if (!recordingSessionMatches(this.state.recording, sessionId, ["stopping"])) return;
      const source = await loadAudioMediaNative(result.targetRelativePath, this.state.currentFile.path);
      if (!recordingSessionMatches(this.state.recording, sessionId, ["stopping"])) return;
      let decoded: Awaited<ReturnType<typeof this.decodeAudioSource>> | null = null;
      if (source) {
        try {
          decoded = await this.decodeAudioSource({ ...source, name: result.fileName });
        } catch {
          decoded = null;
        }
      }
      if (!recordingSessionMatches(this.state.recording, sessionId, ["stopping"])) return;
      const media = addImportedAudioMedia(currentProject(this.state), {
        name: result.fileName,
        uri: result.targetRelativePath,
        mimeType: "audio/wav",
        durationSeconds: decoded?.durationSeconds || result.durationSeconds,
        sampleRate: decoded?.sampleRate || result.sampleRate,
        channels: decoded?.channels || result.channels,
        sizeBytes: result.sizeBytes,
        metadata: {
          importMode: "native-recording",
          mediaRefKind: "project",
          projectRelativePath: result.targetRelativePath,
          originalUri: result.targetPath,
          recordedAt: new Date().toISOString(),
          recordingTrackId: result.trackId,
          requestedStartBar: startBar,
          placementStartBar: startBar,
          captureStartTransportSeconds: captureStartTransportSeconds ?? null,
          playbackStartedAtMonotonicMs: playbackStartedAtMonotonicMs ?? null,
          captureRequestedAtMonotonicMs: captureRequestedAtMonotonicMs ?? null,
          timingSource,
          recordingBackend: "native-cpal",
          ...buildNativeRecordingDiagnosticsMetadata({
            ...result,
            playbackCaptureAnchor,
            playbackStopAnchor
          }),
          peak: result.peak,
          waveformPeaks: decoded?.waveformPeaks || []
        }
      });
      if (decoded && source) setCachedAudioBuffer(media.item.id, decoded.buffer, sourceCacheOptions(source));
      const placed = placeRecordingClipOnTrack(media.project, media.item.id, trackId || result.trackId, startBar);
      const baseClipMessage = placed.clipId
        ? `Recorded ${result.fileName} to ${result.targetRelativePath}.`
        : `Recorded ${result.fileName}, but no armed audio track was available for clip placement.`;
      const clipMessage = buildRecordingCompletionMessage({
        baseMessage: baseClipMessage,
        droppedInputFrameCount: result.droppedInputFrameCount
      });
      this.applyProjectState(commitProject(this.state, placed.project, clipMessage), { autosave: "flush", preserveScroll: true });
      this.state.recording = createRecordingUiState({ message: clipMessage });
      this.state.selectedClipId = placed.clipId || this.state.selectedClipId;
      this.state.selectedTrackId = placed.trackId || this.state.selectedTrackId;
      await this.saveProject(false);
      void this.syncArmedInputPreview(trackId || result.trackId);
    } catch (error) {
      if (!recordingSessionMatches(this.state.recording, sessionId, ["stopping"])) return;
      const message = error instanceof Error ? error.message : "Could not stop live recording.";
      this.state.recording = createRecordingUiState({
        status: "error",
        sessionId,
        trackId,
        startBar,
        message
      });
      this.state.status = message;
      this.render({ preserveScroll: true });
    }
  }

  private startRecordingTimer() {
    this.startInputStatusTimer(Date.now());
  }

  private startInputPreviewTimer() {
    this.startInputStatusTimer(null);
  }

  private startInputStatusTimer(recordingStartedAt: number | null) {
    this.stopRecordingTimer();
    const started = Date.now();
    this.recordingTimer = window.setInterval(() => {
      const inputActive = this.state.recording.status === "recording" || !!this.inputPreviewKey;
      if (!inputActive) return;
      if (this.state.recording.status === "recording") {
        this.state.recording.elapsedSeconds = (Date.now() - (recordingStartedAt || started)) / 1000;
      }
      void this.refreshRecordingStatus();
      this.updateLiveDom();
    }, 250);
  }

  private stopRecordingTimer() {
    if (this.recordingTimer !== null) {
      window.clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    this.recordingStatusBusy = false;
  }

  private async refreshRecordingStatus() {
    const inputActive = this.state.recording.status === "recording" || !!this.inputPreviewKey;
    if (this.recordingStatusBusy || !inputActive) return;
    this.recordingStatusBusy = true;
    try {
      const status = await nativeRecordingStatus();
      const stillInputActive = this.state.recording.status === "recording" || !!this.inputPreviewKey;
      if (!stillInputActive) return;
      const peak = Math.max(0, Math.min(1, Number(status.peak) || 0));
      this.state.recording.inputPeak = peak;
      this.state.recording.inputDeviceName = status.inputDeviceName || this.state.recording.inputDeviceName;
      this.state.recording.outputDeviceName = status.outputDeviceName || this.state.recording.outputDeviceName;
      this.state.recording.monitoring = !!status.monitoring;
      if (this.state.recording.status === "recording") this.state.recording.elapsedSeconds = status.elapsedSeconds || this.state.recording.elapsedSeconds;
      this.state.recording.livePeaks = [...this.state.recording.livePeaks, peak].slice(-64);
      const track = currentProject(this.state).tracks.find((item) => item.id === this.state.recording.trackId);
      if (track) {
        this.state.recording.message = this.state.recording.status === "recording"
          ? recordingStatusMessage(track.name, status.monitoring, this.state.recording.outputDeviceName)
          : inputPreviewStatusMessage(track.name, status.monitoring, this.state.recording.outputDeviceName);
      }
      if (status.lastError) this.state.status = status.lastError;
    } catch {
      // Keep recording UI alive; stop/start calls surface actionable errors.
    } finally {
      this.recordingStatusBusy = false;
    }
  }

  private async prepareTimelineAudioForPlayback(reason: string): Promise<{
    hydration: { total: number; loaded: number; cached: number; missing: string[] };
    showedBusy: boolean;
  }> {
    let showedBusy = false;
    const before = this.timelineAudioPreparationState();
    if (before.reloadableMissingBufferCount > 0) {
      showedBusy = true;
      await this.showTransportBusy(`Loading ${before.reloadableMissingBufferCount} timeline audio file${before.reloadableMissingBufferCount === 1 ? "" : "s"} for ${reason}...`);
    } else if (before.native.needsPreparation) {
      showedBusy = true;
      await this.showTransportBusy(this.nativeAudioPreparationMessage(before.native));
    }

    const hydration = await this.hydrateTimelineAudioBuffers();
    const after = this.engine.getNativeRuntimeAudioPreparationState();
    if (after.needsPreparation && (before.reloadableMissingBufferCount > 0 || !showedBusy)) {
      showedBusy = true;
      await this.showTransportBusy(this.nativeAudioPreparationMessage(after));
    }
    if (after.needsPreparation) {
      await this.engine.prepareNativeRuntimeAudioForPlayback(reason);
    }

    return { hydration, showedBusy };
  }

  private async showTransportBusy(message: string) {
    this.state.busyMessage = message;
    this.state.status = message;
    this.render({ preserveScroll: true });
    await this.nextPaint();
  }

  private async showExportProgress(message: string, detail?: string) {
    this.state.exportProgress = { message, detail };
    this.state.status = `${message}...`;
    this.render({ preserveScroll: true });
    await this.nextPaint();
  }

  private async nextPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      } else {
        window.setTimeout(resolve, 0);
      }
    });
  }

  private startLiveMetronome(force = false) {
    const settings = metronomeSettings(currentProject(this.state));
    if (!force && !settings.enabled) return;
    if (this.engine.isNativePlaybackActive()) return;
    if (this.metronomeTimer !== null) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.metronomeContext = this.metronomeContext || new Ctx();
    void this.metronomeContext.resume?.();
    const ctx = this.metronomeContext;
    let scheduledBeatIndex: number | null = null;
    const schedule = () => {
      const liveProject = currentProject(this.state);
      const liveSettings = metronomeSettings(liveProject);
      const volume = Math.max(0, Math.min(1, liveSettings.volume || 0.55));
      const transportSeconds = this.metronomeTransportSeconds(liveProject);
      const result = buildTransportMetronomeSchedule(liveProject, transportSeconds, scheduledBeatIndex, 0.16);
      scheduledBeatIndex = result.scheduledBeatIndex;
      result.clicks.forEach((click) => {
        const when = ctx.currentTime + Math.max(0.006, click.timeSeconds - transportSeconds);
        this.scheduleMetronomeClick(ctx, when, click.accented, volume);
      });
    };
    schedule();
    this.metronomeTimer = window.setInterval(schedule, 25);
  }

  private startCountInMetronome(project: ReturnType<typeof currentProject>, durationSeconds: number) {
    const settings = metronomeSettings(project);
    if (this.engine.isNativePlaybackActive()) return;
    this.stopLiveMetronome();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.metronomeContext = this.metronomeContext || new Ctx();
    void this.metronomeContext.resume?.();
    const ctx = this.metronomeContext;
    const startedAt = ctx.currentTime;
    const volume = Math.max(0, Math.min(1, settings.volume || 0.55));
    let scheduledBeatIndex: number | null = null;
    const schedule = () => {
      const elapsed = Math.max(0, Math.min(durationSeconds, ctx.currentTime - startedAt));
      const result = buildTransportMetronomeSchedule(project, elapsed, scheduledBeatIndex, 0.16);
      scheduledBeatIndex = result.scheduledBeatIndex;
      result.clicks
        .filter((click) => click.timeSeconds <= durationSeconds + 0.001)
        .forEach((click) => {
          const when = startedAt + click.timeSeconds;
          if (when >= ctx.currentTime - 0.025) this.scheduleMetronomeClick(ctx, Math.max(ctx.currentTime + 0.006, when), click.accented, volume);
        });
    };
    schedule();
    this.metronomeTimer = window.setInterval(schedule, 25);
  }

  private metronomeTransportSeconds(project: ReturnType<typeof currentProject>): number {
    if (this.engine.isPlaying()) return this.engine.currentSeconds();
    return Math.max(0, (this.state.playheadBar - 1) * secondsPerBar(project));
  }

  private stopLiveMetronome() {
    if (this.metronomeTimer !== null) {
      window.clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  private scheduleMetronomeClick(ctx: AudioContext, time: number, accented: boolean, volume: number) {
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(accented ? 1760 : 1040, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * (accented ? 0.18 : 0.11)), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  private nativeAudioPreparationMessage(prep: ReturnType<AudioEngine["getNativeRuntimeAudioPreparationState"]>): string {
    const count = Math.max(1, prep.cachedAudioRegionCount - prep.preparedAudioRegionCount);
    return `Preparing ${count} native audio region${count === 1 ? "" : "s"}...`;
  }

  private timelineAudioPreparationState(): {
    audioClipCount: number;
    reloadableMissingBufferCount: number;
    native: ReturnType<AudioEngine["getNativeRuntimeAudioPreparationState"]>;
  } {
    const project = currentProject(this.state);
    const audioClips = project.timeline.clips.filter((clip) => clip.type === "audio" && clip.mediaPoolItemId);
    const mediaIds = new Set(audioClips.map((clip) => clip.mediaPoolItemId as string));
    let reloadableMissingBufferCount = 0;
    mediaIds.forEach((id) => {
      if (getCachedAudioBuffer(id)) return;
      const item = findMediaPoolItem(project, id);
      if (item && mediaPoolStatus(item).reloadable) reloadableMissingBufferCount += 1;
    });
    return {
      audioClipCount: audioClips.length,
      reloadableMissingBufferCount,
      native: this.engine.getNativeRuntimeAudioPreparationState()
    };
  }

  private consumeSuppressedStepClick(): boolean {
    if (!this.suppressNextStepClick) return false;
    this.suppressNextStepClick = false;
    return true;
  }

  private consumeSuppressedClipClick(): boolean {
    if (!this.suppressNextClipClick) return false;
    this.suppressNextClipClick = false;
    return true;
  }

  private selectChordsmithStep(selection: ChordsmithStepSelection) {
    const beforeTrackId = this.state.selectedTrackId;
    this.state.chordsmithStepSelection = selection;
    const roleTrack =
      selection.kind === "melody"
        ? currentProject(this.state).tracks.find((track) => track.role === "melody" && track.metadata?.chordsmithMelodyTrackIndex === selection.trackIndex)
          || currentProject(this.state).tracks.find((track) => selection.trackIndex === 0 && track.role === "melody")
        : currentProject(this.state).tracks.find((track) => track.role === selection.kind);
    if (roleTrack) this.state.selectedTrackId = roleTrack.id;
    this.chordsmithStepChangedTrack = beforeTrackId !== this.state.selectedTrackId;
  }

  private stepSelectionFromElement(target: HTMLElement | null): ChordsmithStepSelection | null {
    const drum = target?.closest<HTMLElement>("[data-drum-step]");
    if (drum) {
      const [sectionId, lane, step] = String(drum.dataset.drumStep || "").split(":");
      if (lane === "kick" || lane === "snare" || lane === "hat") return { kind: "drums", sectionId, lane, step: Number(step) };
    }
    const bass = target?.closest<HTMLElement>("[data-bass-step]");
    if (bass) {
      const [sectionId, step] = String(bass.dataset.bassStep || "").split(":");
      return { kind: "bass", sectionId, step: Number(step) };
    }
    const melody = target?.closest<HTMLElement>("[data-melody-step]");
    if (melody) {
      const [sectionId, trackIndex, step] = String(melody.dataset.melodyStep || "").split(":");
      return { kind: "melody", sectionId, trackIndex: Number(trackIndex), step: Number(step) };
    }
    return null;
  }

  private applyChordsmithStepDrag(start: ChordsmithStepSelection, end: ChordsmithStepSelection): boolean {
    const drag = chordsmithStepDragAction(start, end);
    if (!drag) return false;
    this.selectChordsmithStep(drag.selection);
    this.applySelectedStepArticulation(drag.articulation, drag.status);
    return true;
  }

  private handleChordsmithStepShortcut(event: KeyboardEvent): boolean {
    if (this.isEditableEventTarget(event.target)) return false;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!["h", "s", "t"].includes(key) || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (!this.state.chordsmithStepSelection) return false;
    event.preventDefault();
    this.applySelectedStepArticulation(key === "h" ? "hold" : key === "s" ? "slide" : "tuplet");
    return true;
  }

  private isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.dataset.noteInput === "true" || target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  private applySelectedStepArticulation(action: ChordsmithStepArticulation, status?: string) {
    const selection = this.state.chordsmithStepSelection;
    if (!selection) return;
    if (selection.kind === "drums") {
      if (action !== "tuplet") {
        this.state.status = "Drum steps support T for tuplet here.";
        this.render({ preserveScroll: true });
        return;
      }
      const next = cycleDrumTupletCommand(this.state, selection.sectionId, selection.lane, selection.step);
      this.applyChordsmithEditorEdit(status ? { ...next, status } : next, "chordsmith-drum-tuplet", { step: selection });
      return;
    }
    if (selection.kind === "bass") {
      let next: AppState | null = null;
      if (action === "hold") next = toggleBassHoldCommand(this.state, selection.sectionId, selection.step);
      else if (action === "slide") next = toggleBassSlideCommand(this.state, selection.sectionId, selection.step);
      else if (action === "tuplet") next = toggleBassTupletCommand(this.state, selection.sectionId, selection.step);
      if (next) {
        this.applyChordsmithEditorEdit(status ? { ...next, status } : next, `chordsmith-bass-${action}`, { step: selection });
      }
      return;
    }
    if (selection.kind === "melody") {
      let next: AppState | null = null;
      if (action === "hold") next = toggleMelodyHoldCommand(this.state, selection.sectionId, selection.trackIndex, selection.step);
      if (action === "slide") next = toggleMelodySlideCommand(this.state, selection.sectionId, selection.trackIndex, selection.step);
      if (action === "tuplet") next = toggleMelodyTupletCommand(this.state, selection.sectionId, selection.trackIndex, selection.step);
      if (next) this.applyChordsmithEditorEdit(status ? { ...next, status } : next, `chordsmith-melody-${action}`, { step: selection });
    }
  }

  private applyChordsmithEditorEdit(next: AppState, reason: string, options: { step?: ChordsmithStepSelection } = {}) {
    const useStepPatch = !!options.step;
    const needsTrackRender = useStepPatch && this.chordsmithStepChangedTrack;
    this.chordsmithStepChangedTrack = false;
    this.applyProjectState(next, {
      audio: "composition-events",
      render: useStepPatch ? (needsTrackRender ? "immediate" : "none") : this.engine.isPlaying() ? "deferred" : "immediate",
      autosave: "debounced",
      preserveScroll: true,
      reason
    });
    if (!useStepPatch) return;
    if (!this.updateChordsmithStepDom(options.step!)) this.render({ preserveScroll: true });
  }

  private updateChordsmithStepDom(selection: ChordsmithStepSelection): boolean {
    const pcs = getPrimaryChordsmithSource(currentProject(this.state));
    const section = pcs?.sections[selection.sectionId as keyof typeof pcs.sections];
    if (!section) return false;

    this.root.querySelectorAll<HTMLElement>(".selected-step").forEach((node) => node.classList.remove("selected-step"));
    let buttons: HTMLElement[] = [];

    if (selection.kind === "drums") {
      buttons = findDataElements<HTMLElement>(this.root, "data-drum-step", `${selection.sectionId}:${selection.lane}:${selection.step}`);
      if (!buttons.length) return false;
      const level = section.grid[selection.lane][selection.step] || 0;
      const tuplet = !!section.gridTuplets[selection.lane][selection.step];
      buttons.forEach((button) => {
        button.className = `${this.stepBaseClass(button)} step-${level} ${tuplet ? "tuplet" : ""} selected-step`;
        button.title = `${this.drumLaneLabel(selection.lane)} step ${selection.step + 1}. Select then press T for tuplet.`;
        button.innerHTML = `${level === 2 ? "!" : level === 1 ? "x" : ""}${this.stepBadgesHtml({ tuplet })}`;
      });
    } else if (selection.kind === "bass") {
      buttons = findDataElements<HTMLElement>(this.root, "data-bass-step", `${selection.sectionId}:${selection.step}`);
      if (!buttons.length) return false;
      const note = section.bassNotes[selection.step];
      const on = note !== null && note !== undefined;
      const tuplet = !!section.gridTuplets.bass[selection.step];
      buttons.forEach((button) => {
        button.className = `${this.stepBaseClass(button)} note-step ${on ? "on" : ""} ${tuplet ? "tuplet" : ""} selected-step`;
        button.title = `Bass note step ${selection.step + 1}. Select then press H, S or T.`;
        button.innerHTML = `${on ? STEP_NOTE_LABELS[note] || String(note) : ""}${this.stepBadgesHtml({ hold: !!section.bassHold[selection.step], slide: !!section.bassSlide[selection.step], tuplet })}`;
      });
    } else {
      buttons = findDataElements<HTMLElement>(this.root, "data-melody-step", `${selection.sectionId}:${selection.trackIndex}:${selection.step}`);
      if (!buttons.length) return false;
      const track = section.melodyTracks[selection.trackIndex] || [];
      const note = track[selection.step];
      const on = note !== null && note !== undefined;
      const tuplet = !!section.melodyTuplets[selection.trackIndex]?.[selection.step];
      buttons.forEach((button) => {
        button.className = `${this.stepBaseClass(button)} note-step ${on ? "on" : ""} ${tuplet ? "tuplet" : ""} selected-step`;
        button.title = `Melody ${selection.trackIndex + 1} note step ${selection.step + 1}. Select then press H, S or T.`;
        button.innerHTML = `${on ? STEP_NOTE_LABELS[note] || String(note) : ""}${this.stepBadgesHtml({
          hold: !!section.melodyHold[selection.trackIndex]?.[selection.step],
          slide: !!section.melodySlide[selection.trackIndex]?.[selection.step],
          tuplet
        })}`;
      });
    }

    this.updateTrackSelectionDom();
    this.updateStatusDom();
    return true;
  }

  private stepBaseClass(button: HTMLElement) {
    return button.classList.contains("timeline-step") ? "step timeline-step" : "step";
  }

  private updateTrackSelectionDom() {
    this.root.querySelectorAll<HTMLElement>("[data-track-id]").forEach((row) => {
      row.classList.toggle("selected", row.dataset.trackId === this.state.selectedTrackId);
    });
    this.root.querySelectorAll<HTMLElement>("[data-row]").forEach((row) => {
      row.classList.toggle("selected-row", row.dataset.row === this.state.selectedTrackId);
    });
  }

  private updateStatusDom() {
    const status = this.root.querySelector<HTMLElement>(".status");
    if (status) status.textContent = this.state.status;
  }

  private stepBadgesHtml(flags: { hold?: boolean; slide?: boolean; tuplet?: boolean }): string {
    const badges = [flags.hold ? "H" : "", flags.slide ? "S" : "", flags.tuplet ? "T" : ""].filter(Boolean);
    return badges.length ? `<span class="step-badges">${badges.map((badge) => `<span>${badge}</span>`).join("")}</span>` : "";
  }

  private drumLaneLabel(lane: string) {
    if (lane === "kick") return "Kick";
    if (lane === "snare") return "Snare";
    if (lane === "hat") return "Hi-hat";
    return lane;
  }

  private applyProjectState(next: AppState, options: ApplyProjectOptions | boolean = {}) {
    const resolved = this.resolveApplyOptions(options);
    this.state = next;
    const project = currentProject(this.state);
    if (resolved.autosave !== "none") this.saveAutosaveSnapshot(project);
    if (resolved.audio && resolved.audio !== "none") this.engine.syncProject(project, resolved.audio, resolved.reason);
    this.scheduleRender(resolved.render || "immediate", { preserveScroll: resolved.preserveScroll });
  }

  private resolveApplyOptions(options: ApplyProjectOptions | boolean): Required<Omit<ApplyProjectOptions, "preservePlayback">> {
    if (typeof options === "boolean") {
      const playing = this.engine.isPlaying();
      return {
        audio: options ? (playing ? "composition-events" : "project-load") : "none",
        render: playing ? "deferred" : "immediate",
        autosave: "debounced",
        preserveScroll: false,
        reason: options ? (playing ? "legacy-playing-safe-sync" : "legacy-sync") : "ui-or-fast-path"
      };
    }
    return {
      audio: options.audio ?? "project-load",
      render: options.render ?? (this.engine.isPlaying() ? "deferred" : "immediate"),
      autosave: options.autosave ?? "debounced",
      preserveScroll: options.preserveScroll ?? false,
      reason: options.reason ?? "project-edit"
    };
  }

  private scheduleRender(schedule: RenderSchedule, options: RenderOptions = {}) {
    this.playbackRenderScheduler.request(schedule, options, this.renderSchedulerCallbacks(), this.renderSchedulerTimers());
  }

  private renderSchedulerCallbacks() {
    return {
      isPlaybackActive: () => this.state.playing || this.engine.isPlaying(),
      render: (options: RenderOptions) => this.render(options),
      updateLiveDom: () => this.updateLiveDom()
    };
  }

  private renderSchedulerTimers() {
    return {
      setTimeout: (callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle: number) => window.clearTimeout(handle)
    };
  }

  private toggleTrackMute(trackId: string) {
    const next = toggleTrackMuteCommand(this.state, trackId);
    this.syncTrackAudibilityFromState(next, trackId, "mute");
    this.applyProjectState(next, {
      audio: "none",
      preserveScroll: true,
      reason: "track-mute"
    });
    void this.syncActiveOrArmedInputMonitor(trackId);
  }

  private toggleTrackSolo(trackId: string) {
    const next = toggleTrackSoloCommand(this.state, trackId);
    this.syncTrackAudibilityFromState(next, trackId, "solo");
    this.applyProjectState(next, {
      audio: "none",
      preserveScroll: true,
      reason: "track-solo"
    });
  }

  private async toggleTrackMonitor(trackId: string) {
    const next = toggleTrackMonitorCommand(this.state, trackId);
    this.applyProjectState(next, {
      audio: "none",
      preserveScroll: true,
      reason: "track-monitor"
    });
    await this.syncActiveOrArmedInputMonitor(trackId);
  }

  private syncTrackAudibilityFromState(next: AppState, trackId: string, field: "mute" | "solo") {
    const track = currentProject(next).tracks.find((item) => item.id === trackId);
    if (!track) return;
    this.engine.updateTrackMixerControl(trackId, field === "mute" ? { mute: track.mute } : { solo: track.solo });
  }

  private async syncActiveRecordingMonitor(trackId: string) {
    if (this.state.recording.status !== "recording" || this.state.recording.trackId !== trackId) return;
    const project = currentProject(this.state);
    const track = project.tracks.find((item) => item.id === trackId);
    if (!track || !track.recordKind || track.recordKind === "none") return;
    try {
      const status = await updateNativeRecordingMonitor({
        outputDeviceId: project.audioDeviceSettings.outputDeviceId,
        monitorEnabled: !!track.monitorEnabled && !track.mute,
        monitorVolume: track.mute ? 0 : track.volume,
        monitorPan: track.pan
      });
      if (this.state.recording.status !== "recording" || this.state.recording.trackId !== trackId) return;
      this.state.recording.monitoring = !!status.monitoring;
      this.state.recording.outputDeviceName = status.outputDeviceName || this.state.recording.outputDeviceName;
      this.state.recording.inputDeviceName = status.inputDeviceName || this.state.recording.inputDeviceName;
      this.state.recording.message = recordingStatusMessage(track.name, status.monitoring, this.state.recording.outputDeviceName);
      this.state.status = this.state.recording.message;
      this.render({ preserveScroll: true });
    } catch (error) {
      if (this.state.recording.status !== "recording" || this.state.recording.trackId !== trackId) return;
      const message = error instanceof Error ? error.message : "Could not update input monitoring.";
      this.state.recording.monitoring = false;
      this.state.recording.message = message;
      this.state.status = message;
      this.render({ preserveScroll: true });
    }
  }

  private async syncActiveOrArmedInputMonitor(trackId: string) {
    if (this.state.recording.status === "recording") {
      await this.syncActiveRecordingMonitor(trackId);
      return;
    }
    await this.syncArmedInputPreview(trackId);
  }

  private async syncArmedInputPreview(preferredTrackId?: string) {
    if (!isNativeRecordingAvailable()) return;
    if (this.state.recording.status === "recording" || this.state.recording.status === "stopping") return;
    const project = currentProject(this.state);
    const armedTracks = project.tracks.filter((track) => track.armed && track.recordKind && track.recordKind !== "none");
    const track = (preferredTrackId ? armedTracks.find((item) => item.id === preferredTrackId) : null) || armedTracks[0] || null;
    if (!track || armedTracks.length !== 1) {
      await this.stopArmedInputPreview();
      return;
    }

    const key = this.inputPreviewSignature(project, track);
    if (this.inputPreviewKey === key) return;
    try {
      const status = await startNativeRecordingPreview({
        trackId: track.id,
        inputDeviceId: track.inputDeviceId || project.audioDeviceSettings.inputDeviceId,
        outputDeviceId: project.audioDeviceSettings.outputDeviceId,
        monitorEnabled: !!track.monitorEnabled && !track.mute,
        monitorVolume: track.mute ? 0 : track.volume,
        monitorPan: track.pan
      });
      this.inputPreviewKey = key;
      if (!["idle", "preparing", "count-in"].includes(this.state.recording.status)) return;
      this.state.recording = createRecordingUiState({
        ...this.state.recording,
        status: this.state.recording.status,
        trackId: track.id,
        startedAt: null,
        startBar: this.state.recording.startBar,
        elapsedSeconds: 0,
        inputPeak: Math.max(0, Math.min(1, Number(status.peak) || 0)),
        inputDeviceName: status.inputDeviceName,
        outputDeviceName: status.outputDeviceName,
        monitoring: !!status.monitoring,
        livePeaks: this.state.recording.livePeaks,
        message: inputPreviewStatusMessage(track.name, status.monitoring, status.outputDeviceName)
      });
      this.state.status = this.state.recording.message;
      this.startInputPreviewTimer();
      this.render({ preserveScroll: true });
    } catch (error) {
      this.inputPreviewKey = null;
      const message = error instanceof Error ? error.message : "Could not start armed input metering.";
      if (this.state.recording.status === "idle") {
        this.state.recording = {
          ...this.state.recording,
          trackId: track.id,
          inputPeak: 0,
          inputDeviceName: null,
          outputDeviceName: null,
          monitoring: false,
          message
        };
      }
      this.state.status = message;
      this.render({ preserveScroll: true });
    }
  }

  private async stopArmedInputPreview() {
    const hadPreview = !!this.inputPreviewKey;
    this.inputPreviewKey = null;
    if (hadPreview) {
      try {
        await stopNativeRecordingPreview();
      } catch {
        // Preview shutdown should not interrupt project edits.
      }
    }
    this.stopRecordingTimer();
    if (this.state.recording.status === "idle" && this.state.recording.trackId) {
      this.state.recording = createRecordingUiState();
      this.render({ preserveScroll: true });
    }
  }

  private inputPreviewSignature(project: ReturnType<typeof currentProject>, track: Track): string {
    return [
      track.id,
      track.inputDeviceId || project.audioDeviceSettings.inputDeviceId || "",
      project.audioDeviceSettings.outputDeviceId || "",
      track.monitorEnabled && !track.mute ? "monitor" : "meter",
      track.mute ? 0 : track.volume,
      track.pan
    ].join("|");
  }

  private seekTimelineFromClientX(timeline: HTMLElement, clientX: number, final: boolean) {
    const rect = timeline.getBoundingClientRect();
    const rawBar = (clientX - rect.left - this.timelineTrackHeaderWidth(timeline)) / this.state.zoom + 1;
    const project = currentProject(this.state);
    const bar = Math.max(1, Math.min(project.timeline.bars + 1, snapBarValue(rawBar, this.state.snapMode, project.project.timeSig)));
    this.seekToBar(bar, final);
    return bar;
  }

  private timelineBarLeftPx(px: number): string {
    return `calc(var(--track-header) + ${Math.round(px)}px)`;
  }

  private timelineTrackHeaderWidth(timeline?: HTMLElement): number {
    const surface = timeline || this.root.querySelector<HTMLElement>("[data-timeline-surface]");
    const raw = surface ? window.getComputedStyle(surface).getPropertyValue("--track-header").trim() : "";
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 176;
  }

  private seekToBar(bar: number, updateCursor: boolean) {
    this.engine.seekToBar(bar);
    this.state.playheadBar = bar;
    if (updateCursor) this.state.cursorBar = bar;
    this.updateLiveDom();
  }

  private formatBarBeat(barValue: number) {
    const parts = this.formatBarBeatParts(barValue);
    return `${parts.bar} ${parts.beat}`;
  }

  private formatBarBeatParts(barValue: number) {
    const project = currentProject(this.state);
    const pos = barFloatToPosition(barValue, project.project.timeSig, project.project.ppq);
    return { bar: `Bar ${pos.bar}`, beat: `Beat ${pos.beat}` };
  }

  private importText(text: string, statusPrefix?: string): boolean {
    try {
      const { project, message } = importTextToProject(text);
      const eventCount = renderTimelineEvents(project).length;
      const recoveryMessage = this.savePreImportRecoverySnapshot(statusPrefix ? "Before PocketHandoff import" : "Before text import");
      this.engine.stop();
      this.cancelNativeInputPreviewForProjectReset();
      this.state = loadProjectIntoState(this.state, project, {
        status: `${statusPrefix || message} ${eventCount} events ready.${recoveryMessage ? ` ${recoveryMessage}` : ""}`,
        currentFile: { path: null, label: project.project.title || "Imported Chordsmith Project" }
      });
      this.engine.setProject(project);
      this.saveAutosaveSnapshot(project);
      saveRecentProject(project.project.title);
      this.state.recent = loadRecentProjects();
      this.render();
      void this.syncArmedInputPreview();
      return true;
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "Import failed.";
      this.render();
      return false;
    }
  }

  private async handleFileOpen() {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_PROJECT_IMPORT_BYTES) {
      this.state.status = "Project file is too large for this release. Try a smaller .pocketdaw/JSON file.";
      this.fileInput.value = "";
      this.render();
      return;
    }
    const text = await file.text();
    if (file.name.endsWith(".pocketdaw")) {
      await this.openRawProjectText(text, file.name, null);
    } else {
      this.state.importText = text;
      this.importText(text);
    }
    this.fileInput.value = "";
  }

  private async importAudioMedia() {
    try {
      this.state.status = "Importing audio...";
      this.render();
      const native = await importAudioMediaNative();
      if (native) {
        await this.addDecodedAudioMedia(native);
        return;
      }
    } catch (error) {
      this.state.status = error instanceof Error ? `Native audio import failed: ${error.message}` : "Native audio import failed.";
      this.render();
      return;
    }
    this.audioFileInput.click();
  }

  private async handleAudioFileImport() {
    const file = this.audioFileInput.files?.[0];
    if (!file) return;
    try {
      await this.addDecodedAudioMedia(await importedAudioFromBrowserFile(file));
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "Audio import failed.";
      this.render();
    } finally {
      this.audioFileInput.value = "";
    }
  }

  private async addDecodedAudioMedia(source: ImportedAudioBytes) {
    try {
      const decoded = await this.decodeAudioSource(source);
      const result = addImportedAudioMedia(currentProject(this.state), {
        name: source.name,
        uri: source.uri,
        mimeType: source.mimeType,
        durationSeconds: decoded.durationSeconds,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        sizeBytes: source.sizeBytes,
        metadata: {
          importMode: source.mode,
          mediaRefKind: source.mode === "native" ? "external" : "browser-runtime-only",
          runtimeOnly: source.mode === "browser",
          waveformPeaks: decoded.waveformPeaks
        }
      });
      setCachedAudioBuffer(result.item.id, decoded.buffer, sourceCacheOptions(source));
      this.applyProjectState(commitProject(this.state, result.project, `Imported audio ${source.name}.`));
      this.root.querySelector<HTMLElement>("#mediaPool")?.scrollIntoView({ block: "nearest" });
    } catch {
      this.state.status = `Could not decode ${source.name}. This format may not be supported by this Web Audio runtime.`;
      this.render();
    }
  }

  private async decodeAudioSource(source: ImportedAudioBytes) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: currentProject(this.state).project.sampleRate });
    try {
      const buffer = await ctx.decodeAudioData(source.bytes.slice(0));
      return {
        buffer,
        durationSeconds: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        waveformPeaks: audioBufferPeaks(buffer)
      };
    } finally {
      void ctx.close?.();
    }
  }

  private async reloadAudioMedia(mediaPoolItemId: string) {
    const item = findMediaPoolItem(currentProject(this.state), mediaPoolItemId);
    if (!item || item.kind !== "audio") {
      this.state.status = "Choose an audio media item to reload.";
      this.render();
      return;
    }
    const path = String(item.metadata?.projectRelativePath || item.uri || "");
    if (!path) {
      this.state.status = `${item.name} has no stored path. Use Relink.`;
      this.render();
      return;
    }
    try {
      this.state.status = `Reloading ${item.name}...`;
      this.render();
      const source = await loadAudioMediaNative(path, this.state.currentFile.path);
      if (!source) {
        this.state.status = "Native media reload is only available in the installed app.";
        this.render();
        return;
      }
      const decoded = await this.decodeAudioSource(source);
      setCachedAudioBuffer(item.id, decoded.buffer, sourceCacheOptions(source));
      const project = updateAudioMediaAnalysis(currentProject(this.state), item.id, {
        name: item.name,
        uri: item.uri,
        mimeType: source.mimeType || item.mimeType,
        durationSeconds: decoded.durationSeconds,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        sizeBytes: source.sizeBytes,
        waveformPeaks: decoded.waveformPeaks
      });
      this.applyProjectState(commitProject(this.state, project, `Reloaded ${item.name}.`), { audio: "timeline-structure", reason: "reload-media" });
    } catch (error) {
      const project = markMediaPoolItemMissing(currentProject(this.state), item.id, true, error instanceof Error ? error.message : "Reload failed.");
      this.applyProjectState(commitProject(this.state, project, `Could not reload ${item.name}. Use Relink.`), { audio: "none", preserveScroll: true, reason: "reload-media-failed" });
    }
  }

  private async relinkAudioMedia(mediaPoolItemId: string) {
    const item = findMediaPoolItem(currentProject(this.state), mediaPoolItemId);
    if (!item || item.kind !== "audio") {
      this.state.status = "Choose an audio media item to relink.";
      this.render();
      return;
    }
    try {
      this.state.status = `Relinking ${item.name}...`;
      this.render();
      const source = await relinkAudioMediaNative();
      if (!source) {
        this.state.status = "Relink cancelled or native picker unavailable.";
        this.render();
        return;
      }
      const decoded = await this.decodeAudioSource(source);
      setCachedAudioBuffer(item.id, decoded.buffer, sourceCacheOptions(source));
      let project = markMediaPoolItemRelinked(currentProject(this.state), item.id, {
        uri: source.uri || "",
        name: source.name || item.name,
        sizeBytes: source.sizeBytes,
        mimeType: source.mimeType
      });
      project = updateAudioMediaAnalysis(project, item.id, {
        name: source.name || item.name,
        uri: source.uri,
        mimeType: source.mimeType,
        durationSeconds: decoded.durationSeconds,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        sizeBytes: source.sizeBytes,
        waveformPeaks: decoded.waveformPeaks
      });
      this.applyProjectState(commitProject(this.state, project, `Relinked ${item.name} to ${source.name}.`), { audio: "timeline-structure", reason: "relink-media" });
    } catch (error) {
      this.state.status = error instanceof Error ? `Relink failed: ${error.message}` : "Relink failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async importMidiMedia() {
    try {
      this.state.status = "Importing MIDI...";
      this.render();
      const native = await importMidiNative();
      if (native) {
        this.addImportedMidiMedia(native);
        return;
      }
    } catch (error) {
      this.state.status = error instanceof Error ? `Native MIDI import failed: ${error.message}` : "Native MIDI import failed.";
      this.render();
      return;
    }
    this.midiFileInput.click();
  }

  private async handleMidiFileImport() {
    const file = this.midiFileInput.files?.[0];
    if (!file) return;
    try {
      this.addImportedMidiMedia(await importedMidiFromBrowserFile(file));
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "MIDI import failed.";
      this.render();
    } finally {
      this.midiFileInput.value = "";
    }
  }

  private addImportedMidiMedia(source: ImportedMidiBytes) {
    try {
      const parsed = parseStandardMidiFile(source.bytes);
      const result = importMidiFileToProject(currentProject(this.state), parsed, source.name, source.uri, source.sizeBytes);
      this.applyProjectState({
        ...commitProject(this.state, result.project, `Imported MIDI ${source.name} with ${parsed.notes.length} note${parsed.notes.length === 1 ? "" : "s"}.`),
        selectedClipId: result.clipId,
        selectedTrackId: result.trackId
      });
      this.root.querySelector<HTMLElement>("#mediaPool")?.scrollIntoView({ block: "nearest" });
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "MIDI import failed.";
      this.render();
    }
  }

  private async openProject() {
    try {
      const native = await openProjectFileNative();
      if (native) {
        await this.openNativeProjectWithRecovery(native);
        return;
      }
    } catch (error) {
      this.state.status = error instanceof Error ? `Native open failed: ${error.message}` : "Native open failed. Choose a file in the browser picker.";
      this.render();
    }
    this.fileInput.click();
  }

  private async openNativeProjectWithRecovery(native: OpenProjectFileResult, status?: string, promptRecovery = true) {
    const recovery = promptRecovery ? await this.recoveryCandidateForOpen(native.file.path) : null;
    if (recovery) {
      const recovered = await readProjectFileNative(recovery.path);
      if (recovered) {
        await this.openRawProjectText(recovered.contents, recovered.file.label, recovered.file.path, {
          status: `Recovered ${recovered.file.label} before opening ${native.file.label}.`
        });
        return;
      }
    }
    await this.openRawProjectText(native.contents, native.file.label, native.file.path, status ? { status } : undefined);
  }

  private async recoveryCandidateForOpen(path: string | null): Promise<NativeProjectRecoveryCandidate | null> {
    if (!path) return null;
    try {
      const state = await discoverProjectRecoveryNative(path);
      const recommendation = projectRecoveryRecommendation(state);
      if (!recommendation.candidate) return null;
      const candidate = state?.[recommendation.candidate] || null;
      if (!candidate?.valid) return null;
      const label = recommendation.candidate === "temp" ? "temporary save" : "backup save";
      const currentLabel = state?.current?.valid ? "The selected project is valid." : "The selected project may be damaged.";
      const useRecovery = window.confirm(
        `${currentLabel}\n\nPocket DAW found a valid ${label} that may contain safer project data:\n${candidate.path}\n\nOpen this recovery candidate instead?`
      );
      return useRecovery ? candidate : null;
    } catch (error) {
      this.state.status = error instanceof Error ? `Recovery check failed: ${error.message}` : "Recovery check failed.";
      this.render({ preserveScroll: true });
      return null;
    }
  }

  private async openRawProjectText(text: string, label: string, path: string | null, options?: { status?: string }) {
    try {
      const project = loadPocketDawRaw(text);
      this.cancelNativeInputPreviewForProjectReset();
      this.state = loadProjectIntoState(this.state, project, {
        status: options?.status || `Opened ${label}.`,
        currentFile: { path, label }
      });
      this.engine.setProject(project);
      saveRecentProject(label, path);
      this.state.recent = loadRecentProjects();
      this.saveAutosaveSnapshot(project);
      this.render();
      void this.syncArmedInputPreview();
      void this.hydrateNativeCacheFromProject(path);
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "Open failed.";
      this.render();
    }
  }

  private async hydrateNativeCacheFromProject(path: string | null) {
    if (!path) return;
    try {
      const result = await this.engine.hydrateNativeRenderCache(path, "project-open-hydrate-native-cache");
      if (!result.cache) this.engine.prewarmNativeRenderCache("project-open-prewarm-native-cache");
      if (!result.hydratedCacheItemCount && !result.staleSourceHashCount && !result.skippedInvalidPathCount && !result.hydrationFailureCount) return;
      this.state.status = [
        `Opened ${this.state.currentFile.label}.`,
        result.hydratedCacheItemCount ? `Hydrated ${result.hydratedCacheItemCount} native cache item${result.hydratedCacheItemCount === 1 ? "" : "s"}` : "",
        result.staleSourceHashCount ? `${result.staleSourceHashCount} stale cache item${result.staleSourceHashCount === 1 ? "" : "s"} skipped` : "",
        result.skippedInvalidPathCount ? `${result.skippedInvalidPathCount} invalid cache path${result.skippedInvalidPathCount === 1 ? "" : "s"} skipped` : "",
        result.hydrationFailureCount ? `${result.hydrationFailureCount} cache read failure${result.hydrationFailureCount === 1 ? "" : "s"}` : ""
      ].filter(Boolean).join(" ");
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.status = error instanceof Error ? `Native cache hydration failed: ${error.message}` : "Native cache hydration failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async saveProject(forceSaveAs: boolean) {
    const project = currentProject(this.state);
    const result = await saveProjectFile(project, this.state.currentFile.path, forceSaveAs);
    if (result.file) {
      this.state.currentFile = result.file;
      const adoptedTitle = this.adoptSavedFileTitle(result.file);
      if (adoptedTitle && result.file.path) {
        const rewrite = await saveProjectFile(currentProject(this.state), result.file.path, false);
        if (rewrite.file) this.state.currentFile = rewrite.file;
        result.message = `Saved ${adoptedTitle}.`;
      }
      saveRecentProject(result.file.label, result.file.path);
      this.state.recent = loadRecentProjects();
    }
    this.state.status = result.message;
    this.saveAutosaveSnapshot(project);
    this.render({ preserveScroll: true });
  }

  private adoptSavedFileTitle(file: { label: string; path: string | null }): string | null {
    const project = currentProject(this.state);
    if (!this.isUntitledProjectTitle(project.project.title)) return null;
    const title = projectTitleFromFileState(file);
    if (!title || this.isUntitledProjectTitle(title)) return null;
    const renamed = cloneProject(project);
    renamed.project.title = title;
    renamed.sourceRefs = renamed.sourceRefs.map((ref) => ref.sourceType === "pocket-chordsmith" ? { ...ref, title } : ref);
    this.state.undoStack = { ...this.state.undoStack, present: renamed };
    return title;
  }

  private isUntitledProjectTitle(title: string): boolean {
    return /^untitled(?:\s+project)?$/i.test(String(title || "").trim());
  }

  private async exportWav() {
    try {
      await this.showExportProgress("Preparing WAV export", "Loading timeline audio files");
      const hydration = await this.hydrateTimelineAudioBuffers();
      this.assertNoMissingAudibleAudioBuffers(hydration, "WAV export");
      await this.showExportProgress("Rendering WAV mix", "Longer songs and imported audio can take a little while");
      const project = currentProject(this.state);
      const blob = await this.renderWavNativeFirst(project);
      await this.showExportProgress("Preparing WAV download", `${Math.round(blob.size / 1024)} KB rendered`);
      downloadBlob(blob, safeName(project.project.title, "wav"));
      this.state.exportProgress = null;
      this.state.status = `Exported WAV (${Math.round(blob.size / 1024)} KB).`;
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `WAV export failed: ${error.message}` : "WAV export failed.";
      this.render({ preserveScroll: true });
    }
  }

  private exportMidi() {
    try {
      const blob = exportProjectToMidiBlob(currentProject(this.state));
      downloadBlob(blob, safeName(currentProject(this.state).project.title, "mid"));
      this.state.status = `Exported MIDI (${Math.round(blob.size / 1024)} KB).`;
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? `MIDI export failed: ${error.message}` : "MIDI export failed.";
      this.render();
    }
  }

  private exportSelectedClipMidi() {
    const project = currentProject(this.state);
    const clip = project.timeline.clips.find((item) => item.id === this.state.selectedClipId);
    if (!clip) {
      this.state.status = "Select a clip before exporting clip MIDI.";
      this.render();
      return;
    }
    if (clip.type === "audio") {
      this.state.status = "Audio clips do not contain MIDI events.";
      this.render();
      return;
    }
    const events = renderTimelineEvents(project).filter((event) => event.clipId === clip.id);
    if (!events.length) {
      this.state.status = `${clip.name} has no MIDI-exportable events.`;
      this.render();
      return;
    }
    try {
      const blob = exportProjectToMidiBlob(project, { clipIds: [clip.id], title: `${project.project.title} - ${clip.name}` });
      downloadBlob(blob, safeName(`${project.project.title}-${clip.name}`, "mid"));
      this.state.status = `Exported ${clip.name} MIDI (${Math.round(blob.size / 1024)} KB).`;
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? `Clip MIDI export failed: ${error.message}` : "Clip MIDI export failed.";
      this.render();
    }
  }

  private exportSelectedTrackMidi() {
    const project = currentProject(this.state);
    const track = project.tracks.find((item) => item.id === this.state.selectedTrackId);
    if (!track) {
      this.state.status = "Select a track before exporting track MIDI.";
      this.render();
      return;
    }
    const events = renderTimelineEvents(project).filter((event) => event.trackId === track.id);
    if (!events.length) {
      this.state.status = `${track.name} has no MIDI-exportable events.`;
      this.render();
      return;
    }
    try {
      const blob = exportProjectToMidiBlob(project, { trackIds: [track.id], title: `${project.project.title} - ${track.name}` });
      downloadBlob(blob, safeName(`${project.project.title}-${track.name}`, "mid"));
      this.state.status = `Exported ${track.name} MIDI (${Math.round(blob.size / 1024)} KB).`;
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? `Track MIDI export failed: ${error.message}` : "Track MIDI export failed.";
      this.render();
    }
  }

  private async freezeSelectedClip() {
    const project = currentProject(this.state);
    const clip = project.timeline.clips.find((item) => item.id === this.state.selectedClipId);
    const renderTarget = clip ? projectForClipRender(project, clip.id) : null;
    if (!clip || !renderTarget) {
      this.state.status = "Select a clip before freezing.";
      this.render();
      return;
    }
    try {
      await this.showExportProgress("Freezing selected clip", clip.name);
      const hydration = await this.hydrateTimelineAudioBuffers();
      if (clip.type === "audio" && clip.mediaPoolItemId && !getCachedAudioBuffer(clip.mediaPoolItemId)) {
        const item = findMediaPoolItem(project, clip.mediaPoolItemId);
        if (!item || hydration.missing.includes(item.name) || hydration.missing.includes(item.id)) {
          throw new Error(`${clip.name} needs its source audio loaded before freezing.`);
        }
      }
      const blob = await this.renderWavNativeFirst(renderTarget.project);
      const source = await this.freezeBlobSource(blob, clip);
      const decoded = await this.decodeAudioSource(source);
      const media = addImportedAudioMedia(currentProject(this.state), {
        name: source.name,
        uri: source.uri,
        mimeType: source.mimeType,
        durationSeconds: decoded.durationSeconds,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        sizeBytes: source.sizeBytes,
        metadata: {
          importMode: source.mode,
          mediaRefKind: source.mode === "native" ? "external" : "browser-runtime-only",
          runtimeOnly: source.mode === "browser",
          ...(source.uri && !/^[a-z]+:\/\//i.test(source.uri) ? { projectRelativePath: source.uri } : {}),
          freezeSourceClipId: clip.id,
          freezeSourceClipName: clip.name,
          waveformPeaks: decoded.waveformPeaks
        }
      });
      setCachedAudioBuffer(media.item.id, decoded.buffer, sourceCacheOptions(source));
      const placed = placeAudioClipOnTimeline(media.project, media.item.id, clip.startBar);
      const nextProject = placed.project;
      const sourceClip = nextProject.timeline.clips.find((item) => item.id === clip.id);
      if (sourceClip) {
        sourceClip.muted = true;
        sourceClip.transforms = { ...sourceClip.transforms, freezeRenderId: media.item.id };
      }
      const frozenClip = nextProject.timeline.clips.find((item) => item.id === placed.clipId);
      if (frozenClip) {
        frozenClip.name = `Frozen ${clip.name}`;
        frozenClip.linked = false;
        frozenClip.metadata = {
          ...(frozenClip.metadata || {}),
          freezeSourceClipId: clip.id,
          freezeSourceClipName: clip.name,
          gain: 1
        };
      }
      this.state.exportProgress = null;
      this.applyProjectState({
        ...commitProject(this.state, nextProject, `Froze ${clip.name} to audio and muted the source clip.`),
        selectedClipId: placed.clipId || clip.id,
        selectedTrackId: placed.trackId || clip.trackId
      }, {
        audio: "project-load",
        preserveScroll: true,
        reason: "freeze-selected-clip"
      });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `Freeze failed: ${error.message}` : "Freeze failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async freezeBlobSource(blob: Blob, clip: NonNullable<ReturnType<typeof currentProject>["timeline"]["clips"][number]>): Promise<ImportedAudioBytes> {
    const bytes = await blob.arrayBuffer();
    const name = safeName(`Frozen ${clip.name}`, "wav");
    const source: ImportedAudioBytes = {
      name,
      mimeType: "audio/wav",
      sizeBytes: bytes.byteLength,
      bytes,
      mode: "browser"
    };
    if (!this.state.currentFile.path) return source;
    const relativePath = `project-cache/native-audio/freezes/${safeName(`${clip.id}-${Date.now()}`, "wav")}`;
    const written = await writeNativeCacheAsset(this.state.currentFile.path, {
      assetId: `freeze_${clip.id}_${Date.now()}`,
      relativePath,
      bytes
    });
    if (!written) return source;
    return {
      ...source,
      uri: written.relativePath,
      sizeBytes: written.sizeBytes,
      bytes: bytes.slice(0),
      mode: "native"
    };
  }

  private async exportStems() {
    const project = currentProject(this.state);
    const stems = createStemExportPlan(project);
    if (!stems.length) {
      this.state.status = "No stem groups are available for this project.";
      this.render();
      return;
    }
    await this.showExportProgress(`Preparing ${stems.length} stem WAV${stems.length === 1 ? "" : "s"}`, "Loading timeline audio files");
    try {
      const hydration = await this.hydrateTimelineAudioBuffers();
      this.assertNoMissingAudibleAudioBuffers(hydration, "Stem export");
      for (const [index, stem] of stems.entries()) {
        await this.showExportProgress(`Rendering stem ${index + 1} of ${stems.length}`, stem.label);
        const blob = await this.renderWavNativeFirst(projectWithOnlyTracksAudible(project, stem.trackIds));
        await this.showExportProgress(`Preparing stem download ${index + 1} of ${stems.length}`, `${Math.round(blob.size / 1024)} KB rendered`);
        downloadBlob(blob, stem.fileName);
      }
      this.state.exportProgress = null;
      this.state.status = `Exported ${stems.length} stem WAV${stems.length === 1 ? "" : "s"} as sequential downloads.`;
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `Stem export failed: ${error.message}` : "Stem export failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async exportSectionLoops() {
    const project = currentProject(this.state);
    const loops = createSectionLoopMetadata(project);
    if (!loops.length) {
      this.state.status = "No generated section loops are available for export.";
      this.render();
      return;
    }
    await this.showExportProgress(`Preparing ${loops.length} section loop${loops.length === 1 ? "" : "s"}`, "Rendering loop WAVs without export tails");
    try {
      for (const [index, loop] of loops.entries()) {
        await this.showExportProgress(`Rendering section loop ${index + 1} of ${loops.length}`, loop.name);
        const blob = await this.renderWavNativeFirst(projectForSectionLoopRender(project, loop));
        await this.showExportProgress(`Preparing section loop ${index + 1} of ${loops.length}`, `${Math.round(blob.size / 1024)} KB rendered`);
        downloadBlob(blob, loop.fileName);
      }
      const manifestBlob = new Blob([JSON.stringify({ loops }, null, 2)], { type: "application/json" });
      downloadBlob(manifestBlob, safeName(`${project.project.title}-section-loops`, "json"));
      this.state.exportProgress = null;
      this.state.status = `Exported ${loops.length} section loop WAV${loops.length === 1 ? "" : "s"} and a section-loop manifest.`;
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `Section loop export failed: ${error.message}` : "Section loop export failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async exportGamePack(kind: "godot-adaptive-pack" | "web-game-pack") {
    const project = currentProject(this.state);
    const label = kind === "godot-adaptive-pack" ? "Godot" : "web game";
    try {
      await this.showExportProgress(`Preparing ${label} game pack`, "Loading timeline audio files");
      const hydration = await this.hydrateTimelineAudioBuffers();
      this.assertNoMissingAudibleAudioBuffers(hydration, `${label} game-pack export`);
      const result = await createGamePackZipBlob(project, kind, {
        sourceProjectContents: buildPocketDawProjectFile(project),
        renderWav: (renderProject) => this.renderWavNativeFirst(renderProject),
        onProgress: (title, detail) => this.showExportProgress(title, detail)
      });
      await this.showExportProgress(`Preparing ${label} pack download`, `${result.entries.length} files / ${Math.round(result.blob.size / 1024)} KB`);
      downloadBlob(result.blob, safeName(`${project.project.title}-${kind}`, "zip"));
      this.state.exportProgress = null;
      this.state.status = `Exported ${label} game pack ZIP with ${result.entries.length} files${result.manifest.warnings.length ? ` and ${result.manifest.warnings.length} warning${result.manifest.warnings.length === 1 ? "" : "s"}` : ""}.`;
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `${label} game-pack export failed: ${error.message}` : `${label} game-pack export failed.`;
      this.render({ preserveScroll: true });
    }
  }

  private async renderWavNativeFirst(project: PocketDawProject): Promise<Blob> {
    return await renderProjectToNativeWavBlob(project) || await renderProjectToWavBlob(project);
  }

  private exportMediaPlan() {
    const project = currentProject(this.state);
    const plan = createCollectMediaPlan(project);
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    downloadBlob(blob, safeName(`${project.project.title}-collect-media-plan`, "json"));
    this.state.status = `Exported collect-media plan: ${plan.copy.length} copy action${plan.copy.length === 1 ? "" : "s"}, ${plan.blocked.length} blocked item${plan.blocked.length === 1 ? "" : "s"}.`;
    this.render();
  }

  private async collectMedia() {
    const project = currentProject(this.state);
    const plan = createCollectMediaPlan(project);
    if (!this.state.currentFile.path) {
      this.state.status = "Save the project as a .pocketdaw file before collecting media.";
      this.render();
      return;
    }
    if (!plan.copy.length) {
      this.state.status = plan.blocked.length
        ? `No media could be collected yet; ${plan.blocked.length} item${plan.blocked.length === 1 ? "" : "s"} need relink or native import first.`
        : "All media is already project media.";
      this.render();
      return;
    }
    try {
      this.state.status = `Collecting ${plan.copy.length} media item${plan.copy.length === 1 ? "" : "s"}...`;
      this.render();
      const collected = await collectProjectMediaNative(this.state.currentFile.path, plan.copy.map((item) => ({
        id: item.id,
        sourceUri: item.sourceUri || "",
        targetRelativePath: item.targetRelativePath || `project-media/${item.name}`
      })));
      if (!collected) {
        this.state.status = "Collect Media is only available in the installed native app.";
        this.render();
        return;
      }
      let nextProject = currentProject(this.state);
      collected.forEach((item) => {
        nextProject = markMediaPoolItemCollected(nextProject, item);
      });
      this.applyProjectState(commitProject(this.state, nextProject, `Collected ${collected.length} media item${collected.length === 1 ? "" : "s"}.`), {
        audio: "timeline-structure",
        preserveScroll: true,
        reason: "collect-media"
      });
      const saveResult = await saveProjectFile(currentProject(this.state), this.state.currentFile.path, false);
      if (saveResult.file) {
        this.state.currentFile = saveResult.file;
        saveRecentProject(saveResult.file.label, saveResult.file.path);
        this.state.recent = loadRecentProjects();
      }
      this.state.status = `Collected ${collected.length} media item${collected.length === 1 ? "" : "s"} into project-media and saved project refs.`;
      this.saveAutosaveSnapshot(currentProject(this.state));
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.status = error instanceof Error ? `Collect media failed: ${error.message}` : "Collect media failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async buildNativeCache() {
    const projectFilePath = this.state.currentFile.path;
    if (!projectFilePath) {
      this.state.status = "Save the project before building the native WAV cache.";
      this.render({ preserveScroll: true });
      return;
    }
    try {
      this.state.status = "Building native WAV cache...";
      this.render({ preserveScroll: true });
      const result = await this.engine.persistNativeRenderCache(projectFilePath, "manual-build-native-cache", { prune: false });
      if (!result) {
        this.state.status = "No native cache assets were available to build.";
        this.render({ preserveScroll: true });
        return;
      }
      if (result.errors.length || result.skippedAssetCount || result.writtenAssetCount < result.cache.assets.length) {
        this.state.status = [
          "Native cache build incomplete",
          `${result.writtenAssetCount}/${result.cache.assets.length} asset${result.cache.assets.length === 1 ? "" : "s"} written`,
          result.skippedAssetCount ? `${result.skippedAssetCount} skipped` : "",
          result.errors.length ? `${result.errors.length} error${result.errors.length === 1 ? "" : "s"}` : ""
        ].filter(Boolean).join(", ") + ". Project refs were not saved and no stale cache files were pruned.";
        this.render({ preserveScroll: true });
        return;
      }
      const project = mergeNativeRenderCacheItems(currentProject(this.state), result.renderCacheItems);
      const saveResult = await saveProjectFile(project, projectFilePath, false);
      if (saveResult.mode !== "native") {
        this.state.status = `Native cache assets were written, but project save did not complete: ${saveResult.message} Project refs were not committed and no stale cache files were pruned.`;
        this.render({ preserveScroll: true });
        return;
      }
      this.state = commitProject(this.state, project, `Built native WAV cache with ${result.writtenAssetCount} asset${result.writtenAssetCount === 1 ? "" : "s"}.`);
      if (saveResult.file) this.state.currentFile = saveResult.file;
      this.saveAutosaveSnapshot(project);
      const prune = await prunePersistedNativeRenderCacheAssets(projectFilePath, result.renderCacheItems);
      this.state.status = [
        `Built native WAV cache: ${result.writtenAssetCount} asset${result.writtenAssetCount === 1 ? "" : "s"}`,
        prune?.deletedCount ? `${prune.deletedCount} stale pruned` : "",
        prune?.skippedCount ? `${prune.skippedCount} kept/skipped` : "",
        prune?.errors.length ? `${prune.errors.length} prune error${prune.errors.length === 1 ? "" : "s"}` : "",
        saveResult.message
      ].filter(Boolean).join(", ") + ".";
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.status = error instanceof Error ? `Native cache build failed: ${error.message}` : "Native cache build failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async hydrateTimelineAudioBuffers(): Promise<{ total: number; loaded: number; cached: number; missing: string[] }> {
    const project = currentProject(this.state);
    const ids = Array.from(new Set(project.timeline.clips
      .filter((clip) => clip.type === "audio" && clip.mediaPoolItemId)
      .map((clip) => clip.mediaPoolItemId as string)));
    let loaded = 0;
    let cached = 0;
    const missing: string[] = [];
    for (const id of ids) {
      if (getCachedAudioBuffer(id)) {
        cached += 1;
        continue;
      }
      const item = findMediaPoolItem(project, id);
      const path = String(item?.metadata?.projectRelativePath || item?.uri || "");
      if (!item || !path) {
        missing.push(id);
        continue;
      }
      try {
        const source = await loadAudioMediaNative(path, this.state.currentFile.path);
        if (!source) {
          missing.push(item.name || id);
          continue;
        }
        const decoded = await this.decodeAudioSource(source);
        setCachedAudioBuffer(id, decoded.buffer, sourceCacheOptions(source));
        loaded += 1;
      } catch {
        missing.push(item.name || id);
      }
    }
    return { total: ids.length, loaded, cached, missing };
  }

  private assertNoMissingAudibleAudioBuffers(hydration: { missing: string[] }, label: string) {
    if (!hydration.missing.length) return;
    const project = currentProject(this.state);
    const missing = new Set(hydration.missing);
    const hasAudibleMissingClip = project.timeline.clips.some((clip) => {
      if (clip.type !== "audio" || !clip.mediaPoolItemId || clip.muted || getCachedAudioBuffer(clip.mediaPoolItemId)) return false;
      const item = findMediaPoolItem(project, clip.mediaPoolItemId);
      const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
      return !!track && trackIsAudible(track, project.tracks) && (!item || missing.has(item.name) || missing.has(item.id));
    });
    if (hasAudibleMissingClip) {
      throw new Error(`${label} needs audio files that are not loaded. Use Reload/Relink or check the saved file paths.`);
    }
  }

  private exportDiagnostics() {
    const project = currentProject(this.state);
    const diagnostics = this.buildDiagnosticsPayload();
    const blob = new Blob([diagnosticsJson(diagnostics)], { type: "application/json" });
    downloadBlob(blob, safeName(`${project.project.title}-diagnostics`, "json"));
    this.state.status = "Exported diagnostics JSON.";
    this.render();
  }

  private async copyDiagnostics() {
    const text = diagnosticsJson(this.buildDiagnosticsPayload());
    const copied = await this.copyTextOrDownloadDiagnostics(text);
    this.state.status = copied ? "Copied diagnostics to clipboard." : "Clipboard unavailable; downloaded diagnostics JSON instead.";
    this.render({ preserveScroll: true });
  }

  private async copyTextOrDownloadDiagnostics(text: string): Promise<boolean> {
    if (await this.copyPlainText(text)) return true;
    const project = currentProject(this.state);
    const blob = new Blob([text], { type: "application/json" });
    downloadBlob(blob, safeName(`${project.project.title}-diagnostics`, "json"));
    return false;
  }

  private async copyPlainText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!this.copyTextFallback(text)) {
        throw new Error("Clipboard API is not available.");
      }
      return true;
    } catch {
      return false;
    }
  }

  private copyTextFallback(text: string): boolean {
    if (typeof document.execCommand !== "function") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    return copied;
  }

  private buildDiagnosticsPayload() {
    const audioDiagnostics = this.engine.getDiagnostics();
    return buildTesterDiagnosticsPayload(this.state, audioDiagnostics, {
      runtime: runtimeLabel(),
      platform: runtimePlatform(),
      performance: this.performanceDiagnosticsReport(false, undefined, audioDiagnostics)
    });
  }

  private performanceDiagnosticsReport(recordSample: boolean, maxSamples?: number, audioDiagnostics = this.engine.getDiagnostics()) {
    return this.performanceDiagnostics.report(this.state, audioDiagnostics, this.uiPerformanceCounters(), { recordSample, maxSamples });
  }

  private uiPerformanceCounters(): UiPerformanceCounters {
    return {
      renderCount: this.renderCount,
      renderCountDuringPlayback: this.renderCountDuringPlayback,
      liveUpdateCount: this.liveUpdateCount
    };
  }

  private async copyMcpSetup(kind: string) {
    const text = pocketDawMcpCopyText(kind);
    if (!text) {
      this.state.status = "Unknown MCP setup snippet.";
      this.render({ preserveScroll: true });
      return;
    }
    const copied = await this.copyPlainText(text);
    this.state.status = copied ? "Copied MCP setup snippet to clipboard." : "Clipboard unavailable; select and copy the MCP setup text manually.";
    this.render({ preserveScroll: true });
  }

  private async testAiBridgeConnection() {
    const bridge = this.state.aiBridge;
    if (!bridge.statusUrl || !bridge.enabled) {
      this.state.aiBridge = {
        ...bridge,
        testMessage: bridge.runtimeAvailable ? "Enable the live app bridge before testing." : "Live app bridge is only available in the installed app."
      };
      this.render({ preserveScroll: true });
      return;
    }
    try {
      const session = await setAiBridgeEnabled(true);
      const response = await fetch(session?.statusUrl || bridge.statusUrl, {
        headers: {
          Authorization: `Bearer ${session?.token || ""}`
        }
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; project?: { title?: string } } | null;
      this.state.aiBridge = uiStatusFromSession(session, {
        enabled: !!session?.enabled,
        testMessage: response.ok && payload?.ok
          ? `Live bridge OK: ${payload.project?.title || "current project"} is reachable.`
          : payload?.message || `Live bridge test returned HTTP ${response.status}.`,
        lastError: response.ok ? null : payload?.message || `HTTP ${response.status}`
      });
    } catch (error) {
      this.state.aiBridge = {
        ...bridge,
        lastError: error instanceof Error ? error.message : String(error || "Live bridge test failed."),
        testMessage: "Live bridge test failed."
      };
    }
    this.render({ preserveScroll: true });
  }

  private async sendFeedbackEmail() {
    const diagnostics = this.buildDiagnosticsPayload();
    const text = diagnosticsJson(diagnostics);
    const draft = buildFeedbackEmailDraft({
      feedback: this.state.feedbackText,
      diagnostics,
      diagnosticsJson: text
    });
    let copied = false;
    if (!draft.diagnosticsIncludedInBody) copied = await this.copyTextOrDownloadDiagnostics(text);
    this.openExternalUrl(draft.mailtoUrl);
    this.state.status = draft.diagnosticsIncludedInBody
      ? "Opened feedback email with diagnostics included."
      : copied
        ? "Opened feedback email. Full diagnostics copied to clipboard."
        : "Opened feedback email. Full diagnostics downloaded as JSON.";
    this.render({ preserveScroll: true });
  }

  private openExternalUrl(url: string) {
    if (url.startsWith("mailto:")) {
      window.location.href = url;
      return;
    }
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  }

  private async refreshAudioDevices() {
    this.state.audioProbeStatus = "Probing audio devices...";
    this.render();
    const project = cloneProject(currentProject(this.state));
    const probe = await probeAudioDevices(project.audioDeviceSettings);
    project.audioDeviceSettings = {
      ...project.audioDeviceSettings,
      host: probe.host,
      inputDeviceId: project.audioDeviceSettings.inputDeviceId || probe.defaultInputId,
      outputDeviceId: project.audioDeviceSettings.outputDeviceId || probe.defaultOutputId,
      devices: probe.devices,
      notes: probe.notes,
      lastProbeAt: new Date().toISOString()
    };
    this.state.audioProbeStatus = `Found ${probe.devices.length} device${probe.devices.length === 1 ? "" : "s"}.`;
    this.applyProjectState(commitProject(this.state, project, this.state.audioProbeStatus));
    void this.syncArmedInputPreview();
  }

  loadDemo() {
    this.loadDemoProject("Loaded an editable demo copy. Edits autosave to this copy.");
  }

  private reloadDemoTemplate() {
    this.loadDemoProject("Reloaded the demo template into a fresh editable copy. Previous demo copy edits were discarded.");
  }

  private loadDemoProject(status: string) {
    this.cancelNativeInputPreviewForProjectReset();
    const project = createDemoProject();
    this.state.undoStack = createUndoStack(project);
    this.state.selectedClipId = project.timeline.clips[0]?.id || null;
    this.state.selectedTrackId = "drums";
    this.state.currentFile = { path: null, label: "Editable demo copy" };
    this.state.status = status;
    this.state.playheadBar = 1;
    this.state.cursorBar = 1;
    this.state.meterLevels = {};
    this.state.recording = createRecordingUiState();
    this.engine.setProject(project);
    this.saveAutosaveSnapshot(project);
    this.render();
  }

  private newProject() {
    this.engine.stop();
    this.cancelNativeInputPreviewForProjectReset();
    const project = createEmptyPocketDawProject();
    project.project.title = "Untitled Project";
    this.state.undoStack = createUndoStack(project);
    this.state.selectedClipId = project.timeline.clips[0]?.id || null;
    this.state.selectedTrackId = "drums";
    this.state.currentFile = { path: null, label: "Untitled project" };
    this.state.status = "New project created from the starter template.";
    this.state.playheadBar = 1;
    this.state.cursorBar = 1;
    this.state.meterLevels = {};
    this.state.recording = createRecordingUiState();
    this.engine.setProject(project);
    this.saveAutosaveSnapshot(project);
    this.render();
  }

  private saveAutosaveSnapshot(project = currentProject(this.state)) {
    saveAutosave(buildPocketDawProjectFile(project), this.state.currentFile);
  }

  private cancelNativeInputPreviewForProjectReset() {
    this.recordingStartToken += 1;
    this.inputPreviewKey = null;
    this.stopRecordingTimer();
    if (isNativeRecordingAvailable()) void stopNativeRecordingPreview().catch(() => {});
  }

  private savePreImportRecoverySnapshot(reason: string): string {
    const project = currentProject(this.state);
    const snapshot = savePreImportRecovery(buildPocketDawProjectFile(project), this.state.currentFile, reason);
    return snapshot ? `Previous project recovery snapshot saved as ${snapshot.file.label}.` : "";
  }
}

function sourceCacheOptions(source: ImportedAudioBytes): Parameters<typeof setCachedAudioBuffer>[2] {
  const sourceBytes = sourceBytesForNativeRuntime(source);
  return sourceBytes ? {
    sourceBytes,
    sourceMimeType: source.mimeType,
    sourceUri: source.uri,
    sourceName: source.name
  } : {};
}

function sourceBytesForNativeRuntime(source: ImportedAudioBytes): ArrayBuffer | undefined {
  const bytes = new Uint8Array(source.bytes);
  if (bytes.length < 12) return undefined;
  const mime = (source.mimeType || "").toLowerCase();
  const label = `${source.name || ""} ${source.uri || ""}`.toLowerCase();
  const looksLikeWav = mime.includes("wav") || /\.wav(?:$|[?#])/i.test(label);
  if (!looksLikeWav) return undefined;
  if (!hasAscii(bytes, 0, "RIFF") || !hasAscii(bytes, 8, "WAVE")) return undefined;
  return source.bytes.slice(0);
}

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function stringInput(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value;
}

function numberInput(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

function nativeCacheStatusFromDiagnostics(diagnostics: ReturnType<AudioEngine["getDiagnostics"]>): NativeCacheUiStatus {
  return {
    assetRegionCount: diagnostics.nativeRenderCache.assetRegionCount,
    cachedClipCount: diagnostics.nativeRenderCache.cachedClipCount,
    generatedRegionCount: diagnostics.nativeRenderCache.generatedRegionCount,
    runtimeAudioRegionCount: diagnostics.nativeRenderCache.runtimeAudioRegionCount,
    proceduralFallbackEventCount: diagnostics.nativeRenderCache.proceduralFallbackEventCount,
    buildPending: diagnostics.nativeRenderCache.buildPending,
    prewarmScheduled: diagnostics.nativeRenderCache.prewarmScheduled,
    bypassedForLiveEdits: diagnostics.nativeRenderCache.nativeRenderCacheBypassedForLiveEdits,
    lastBuildReason: diagnostics.nativeRenderCache.lastBuildReason,
    lastError: diagnostics.nativeRenderCache.lastError,
    generatedStemRenderFailureCount: diagnostics.nativeRenderCache.generatedStemRenderFailureCount,
    lastGeneratedStemRenderError: diagnostics.nativeRenderCache.lastGeneratedStemRenderError
  };
}

function findDataElement<T extends HTMLElement>(root: ParentNode, attr: string, value: string): T | null {
  return findDataElements<T>(root, attr, value)[0] || null;
}

function findDataElements<T extends HTMLElement>(root: ParentNode, attr: string, value: string): T[] {
  return Array.from(root.querySelectorAll<T>(`[${attr}]`)).filter((node) => node.getAttribute(attr) === value);
}

function formatRecordingDuration(seconds: number | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(s / 60);
  return `${minutes}:${String(s % 60).padStart(2, "0")}`;
}

function recordingStatusMessage(trackName: string, monitoring: boolean, outputDeviceName?: string | null): string {
  if (!monitoring) return `Recording ${trackName}.`;
  return outputDeviceName ? `Recording ${trackName}; monitor on via ${outputDeviceName}.` : `Recording ${trackName}; monitor on.`;
}

function inputPreviewStatusMessage(trackName: string, monitoring: boolean, outputDeviceName?: string | null): string {
  if (!monitoring) return `Metering ${trackName} input.`;
  return outputDeviceName ? `Monitoring ${trackName} input via ${outputDeviceName}.` : `Monitoring ${trackName} input.`;
}

function monotonicNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
