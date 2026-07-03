import { AudioEngine, type AudioProjectSyncMode, type TrackMixerControlPatch } from "../audio/audioEngine";
import { audioBufferPeaks, getCachedAudioBuffer, setCachedAudioBuffer } from "../audio/audioBufferCache";
import { buildTransportMetronomeSchedule, countInSeconds, metronomeSettings } from "../audio/metronome";
import { exportProjectToMidiBlob } from "../audio/midiExport";
import { mergeNativeRenderCacheItems, prunePersistedNativeRenderCacheAssets } from "../audio/nativeRenderCache";
import { renderProjectToNativeWavBlob } from "../audio/nativeOfflineRender";
import { renderProjectToWavBlob, type WavBitDepth, type WavChannelMode, type WavDitherMode } from "../audio/offlineRender";
import { createDemoProject } from "../demo/demoProject";
import { buildPocketDawProjectFile, createEmptyPocketDawProject } from "../daw/dawProject";
import { midiConversionSourceLabel, normalizeMidiConversionSourceFilter } from "../daw/midiConversionFilter";
import { createMidiChordsmithConversionPreviews } from "../daw/midiConversionPreview";
import { DRUM_LANE_DEFS, generatedDrumBranchLane, getDrumBranchStepLevel, isDrumLaneId } from "../daw/drumLanes";
import { renderTimelineEvents } from "../audio/eventRenderer";
import { timelineSecondsAtBar } from "../daw/timeline";
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
  saveBlobFileAs,
  saveProjectFile,
  type NativeProjectRecoveryCandidate,
  type OpenProjectFileResult
} from "../native/fileBridge";
import { pushGamePackToGodot } from "../native/gamePackPushBridge";
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
  addAutomationPointToLaneCommand,
  addAutomationPointsToLaneCommand,
  addBusTrackCommand,
  addClipAutomationPointCommand,
  appendChordsmithSectionCommand,
  addTrackCommand,
  addTrackFxCommand,
  addGameStateMarkerAtPlayheadCommand,
  addMarkerAtPlayheadCommand,
  addProjectAutomationPointCommand,
  addProjectMeterMapPointCommand,
  addEmptyMidiClipCommand,
  addMidiAftertouchCommand,
  addMidiControllerCommand,
  addMidiNoteCommand,
  addMidiPitchBendCommand,
  addMidiProgramChangeCommand,
  addReturnTrackCommand,
  addDrumLaneFxCommand,
  addFxAutomationPointCommand,
  addTrackSendAutomationPointCommand,
  activateAudioTakeCommand,
  activateAudioTakeLaneCommand,
  adoptMidiMeterMapCommand,
  adoptMidiTempoMapAutomationCommand,
  adoptMidiTempoMapStartCommand,
  applyMidiGrooveTemplateCommand,
  applySelectedAudioClipActionCommand,
  applyBassPresetCommand,
  branchGeneratedDrumsCommand,
  compAudioTakeFromPlayheadCommand,
  compAudioTakeRangeCommand,
  cycleDrumBranchStepCommand,
  deleteAudioWarpMarkerCommand,
  applyDrumPresetCommand,
  applyGuitarPresetCommand,
  clearLoopCommand,
  clearTimelineSelectionCommand,
  collapseGeneratedDrumBranchesCommand,
  commitProject,
  copySelectedClip,
  copySelectedClipRangeCommand,
  cropSelectedClipToTimelineSelectionCommand,
  cutSelectedClip,
  cutSelectedClipRangeCommand,
  convertMidiBassToGeneratedOverlaysCommand,
  convertMidiChordsToGeneratedOverlaysCommand,
  convertMidiDrumsToBranchOverlaysCommand,
  convertMidiArrangementToGeneratedOverlaysCommand,
  convertMidiMelodyToGeneratedOverlaysCommand,
  cycleDrumTupletCommand,
  cycleBassStepCommand,
  cycleDrumStepCommand,
  cycleGuitarStepCommand,
  cycleMelodyStepCommand,
  deleteSelectedClip,
  deleteSelectedClipRangeCommand,
  deleteMarkerCommand,
  deleteAutomationPointCommand,
  deleteProjectMeterMapPointCommand,
  deleteMidiControllerCommand,
  deleteMidiAftertouchCommand,
  deleteMidiNoteCommand,
  deleteMidiPitchBendCommand,
  deleteMidiProgramChangeCommand,
  duplicateMidiControllerCommand,
  duplicateMidiAftertouchCommand,
  duplicateMidiNoteCommand,
  duplicateMidiPitchBendCommand,
  duplicateMidiProgramChangeCommand,
  duplicateSelectedClip,
  importTextToProject,
  loadPocketDawRaw,
  moveClipToBarCommand,
  moveSelectedClip,
  moveSelectedClipBySnap,
  moveMidiNoteCommand,
  pasteClipAtPlayhead,
  placeAudioClipCommand,
  placePunchRecordingClipFromRangeCommand,
  pitchMidiNoteCommand,
  quantizeMidiClipCommand,
  quantizeMidiDurationsCommand,
  redoCommand,
  renameMarkerCommand,
  renameTrackCommand,
  repeatClipToEndCommand,
  removeDrumLaneFxCommand,
  removeTrackFxCommand,
  rippleDeleteSelectedClipRangeCommand,
  rippleDeleteTimelineSelectionCommand,
  routeTrackOutputCommand,
  resizeMidiNoteCommand,
  ensureAutomationLaneCommand,
  ensureClipAutomationLaneCommand,
  ensureFxAutomationLaneCommand,
  ensureProjectAutomationLaneCommand,
  ensureTrackSendAutomationLaneCommand,
  setBassModeCommand,
  setChordInstrumentCommand,
  setChordsmithGlobalsCommand,
  setDrumLaneGateCommand,
  setDrumLaneMuteCommand,
  setDrumLanePanCommand,
  setDrumLaneVolumeCommand,
  setGuitarSettingsCommand,
  setFxSlotParameterCommand,
  setExportProfileSettingCommand,
  setPocketProEqPresetCommand,
  setLoopToSelectedClipCommand,
  setPunchRangeCommand,
  setTimelineSelectionRangeCommand,
  setTimelineSelectionToLoopCommand,
  setTimelineSelectionToSelectedClipCommand,
  setAudioTakeArchivedCommand,
  setSelectedClipTransformCommand,
  setSelectedGeneratedClipStemMuteCommand,
  setMelodyMuteCommand,
  setMelodyOctaveCommand,
  setMelodyPanCommand,
  setMelodyInstrumentCommand,
  setMelodySoloCommand,
  setTrackFolderCommand,
  setSectionBarsCommand,
  setSectionChordCommand,
  setLoopBars,
  setLoopEnabled,
  recordFxAutomationPointCommand,
  recordClipAutomationPointCommand,
  recordTrackSendAutomationPointCommand,
  recordTrackAutomationPointCommand,
  setTrackInputCommand,
  setTrackRecordingInputChannelCommand,
  setTrackRecordingLatencyOffsetCommand,
  setTrackRecordingChannelModeCommand,
  setTrackPanCommand,
  setTrackSendLevelCommand,
  setTrackSendModeCommand,
  setTrackVolumeCommand,
  setSelectedAudioClipPropertyCommand,
  setAudioWarpMarkerTargetCommand,
  setMidiClipBarLengthCommand,
  setMidiAftertouchFieldCommand,
  setMidiControllerFieldCommand,
  setMidiNoteFieldCommand,
  setMidiPitchBendFieldCommand,
  setMidiProgramChangeFieldCommand,
  setAutomationLaneEnabledCommand,
  swingMidiClipCommand,
  toggleDrumLaneFxCommand,
  toggleTrackArmedCommand,
  toggleTrackFxCommand,
  toggleFolderExpandedCommand,
  toggleTrackMonitorCommand,
  toggleMetronomeCommand,
  toggleSelectedClipMute,
  toggleTrackMuteCommand,
  toggleTrackSoloCommand,
  toggleBassAccentCommand,
  toggleBassHoldCommand,
  toggleBassSlideCommand,
  toggleBassTupletCommand,
  toggleDrumBranchGroupCollapsedCommand,
  toggleMelodyHoldCommand,
  toggleMelodySlideCommand,
  toggleMelodyTupletCommand,
  transformMidiPitchCommand,
  transformMidiVelocityCommand,
  splitSelectedClipAtPlayhead,
  splitTimelineSelectionCommand,
  trimSelectedClipEndCommand,
  trimSelectedClipStartCommand,
  updateAutomationPointCommand,
  updateProjectMeterMapPointCommand,
  undoCommand
} from "./commands";
import { commandFromKeyboardEvent } from "./keyboard";
import { collapsedSectionsForCreationPreset, createInitialState, createRecordingUiState, currentProject, isUiCollapseSection, loadProjectIntoState, lowerDockTabForCreationPreset, recordingSessionMatches, type AppState, type ChordsmithStepSelection, type HandoffResult, type LoadProjectIntoStateOptions, type NativeCacheUiStatus } from "./state";
import { chordsmithStepDragAction, type ChordsmithStepArticulation } from "./chordsmithStepGestures";
import { automationSurfaceAudioSyncMode, automationSurfacePointFromClient } from "./automationSurface";
import { renderAppShell } from "./ui";
import { replacePresent } from "../daw/undo";
import type { ClipAutomationField } from "../daw/automation";
import { probeAudioDevices } from "../native/audioDevices";
import { cloneProject } from "../daw/dawProject";
import { POCKET_DAW_VERSION, type Clip, type JsonObject, type PocketDawProject, type Track } from "../daw/schema";
import { buildGroupedRecordingCapturePlan, buildNativeRecordingAlphaInputPreflight, buildRecordingInputPreflight, nativeRecordingAlphaChannelCompatibilityError } from "../daw/recordingInputs";
import { recordingLatencyOffsetSeconds, trackIsAudible, type AddTrackKind } from "../daw/tracks";
import { barFloatToDisplayPosition, snapProjectBarValue } from "../daw/timeline";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeRecordingClipOnTrack, updateAudioMediaAnalysis, updateAudioMediaReloadAnalysis } from "../daw/audioClips";
import type { AudioClipAction } from "../daw/clips";
import { createCollectMediaPlan, findMediaPoolItem, linkFreezeRenderCacheItem, markMediaPoolItemCollected, markMediaPoolItemMissing, markMediaPoolItemRelinked, mediaPoolReloadCandidates, mediaPoolStatus, updateMediaPoolItemMetadata, verifyMediaPortability } from "../daw/mediaPool";
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
import { importMidiFileToProjectWithPlacement, type MidiGrooveTemplateId, type MidiImportPlacementMode, type MidiPitchTransform, type MidiQuantizeGrid, type MidiSwingPercent, type MidiVelocityTransform } from "../daw/midiClips";
import { parseStandardMidiFile } from "../daw/midiParser";
import { MIDI_MEDIA_ACCEPT, importedMidiFromBrowserFile, importMidiNative, type ImportedMidiBytes } from "../native/midiBridge";
import { isNativeRecordingAvailable, nativeRecordingStatus, startNativeRecording, startNativeRecordingPreview, stopNativeRecording, stopNativeRecordingPreview, updateNativeRecordingMonitor } from "../native/recordingBridge";
import { buildPortableGamePackSourceProjectFile, createGameExportManifest, createGamePackDeliveryTargets, createGamePackZipBlob, createSectionLoopMetadata, createSectionLoopZipBlob, createStemExportPlan, createStemZipBlob, projectForClipRender } from "../daw/exportJobs";
import { assertExportProfileSupported, validateExportProfile } from "../daw/exportProfiles";
import { getPrimaryChordsmithSource } from "../daw/chordsmithEditor";
import { buildTesterDiagnosticsPayload, createAudioTakeDiagnosticsSummary, diagnosticsJson, runtimeLabel, runtimePlatform } from "./diagnostics";
import { buildFeedbackEmailDraft, MORE_BY_SAMFA12_URL } from "./feedback";
import { configureHiddenFileInput } from "./fileInputs";
import { FUNCTION_ACTION_TOOLTIPS } from "./functionGuide";
import { pocketDawMcpCopyText } from "./mcpSetup";
import { PerformanceDiagnosticsRecorder, type UiPerformanceCounters } from "./performanceDiagnostics";
import { beginRecordingSession, buildNativeRecordingDiagnosticsMetadata, buildNativeRecordingTakeMetadata, buildRecordingCompletionMessage, buildRecordingStartupPlan, cancelRecordingSession, recordingStartFailureCleanupPlan, transitionRecordingSession } from "./recordingOrchestration";
import { PlaybackRenderScheduler, type RenderOptions, type RenderSchedule } from "./renderScheduler";
import { revealElementInScroller } from "./scrollReveal";
import { applyUpdaterCheckResult, applyUpdaterInstallResult, applyUpdaterProgress as updaterProgressPatch, applyUpdaterRelaunchResult, beginUpdaterCheck, beginUpdaterDownload } from "./updaterOrchestration";

type MixerControlField = "volume" | "pan";
type ScrollSnapshot = Record<string, { top: number; left: number }>;
type ClipDragMode = "move" | "repeat";
type AiBridgeControlAction = "play" | "pause" | "stop" | "restart" | "midi_panic" | "seek_bar" | "save_current" | "select_track" | "select_clip" | "open_project" | "apply_commands" | "performance_diagnostics";
type AiBridgeLiveCommand =
  | { type: "set_track_volume"; trackId: string; volume: number }
  | { type: "set_track_pan"; trackId: string; pan: number }
  | { type: "set_track_mute"; trackId: string; mute: boolean }
  | { type: "set_track_solo"; trackId: string; solo: boolean }
  | { type: "set_track_input"; trackId: string; inputDeviceId?: string | null }
  | { type: "set_track_armed"; trackId: string; armed: boolean }
  | { type: "set_track_monitor"; trackId: string; monitorEnabled: boolean }
  | { type: "set_recording_latency_offset"; trackId: string; offsetSeconds?: number; milliseconds?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "mono"; channelIndex?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "split-mono"; channelIndex?: number }
  | { type: "set_recording_input_channel"; trackId: string; deviceId?: string | null; mode: "stereo"; channelPair?: [number, number] }
  | { type: "set_punch_range"; startBar: number; endBar: number }
  | { type: "set_timeline_selection"; startBar: number; endBar: number }
  | { type: "set_timeline_selection_to_clip"; clipId: string }
  | { type: "clear_timeline_selection" }
  | { type: "split_timeline_selection" }
  | { type: "crop_clip_to_timeline_selection"; clipId: string }
  | { type: "delete_clip_range"; clipId: string }
  | { type: "ripple_delete_clip_range"; clipId: string }
  | { type: "ripple_delete_timeline_selection" }
  | { type: "apply_audio_clip_action"; clipId: string; action: AudioClipAction }
  | { type: "set_audio_warp_marker_target"; clipId: string; markerId: string; targetBar: number }
  | { type: "delete_audio_warp_marker"; clipId: string; markerId: string }
  | { type: "quantize_midi_clip"; clipId: string; grid: MidiQuantizeGrid }
  | { type: "quantize_midi_durations"; clipId: string; grid: MidiQuantizeGrid }
  | { type: "swing_midi_clip"; clipId: string; percent: MidiSwingPercent }
  | { type: "apply_midi_groove"; clipId: string; templateId: MidiGrooveTemplateId }
  | { type: "transform_midi_velocity"; clipId: string; transform: MidiVelocityTransform }
  | { type: "transform_midi_pitch"; clipId: string; transform: MidiPitchTransform }
  | { type: "activate_audio_take_lane"; clipId: string }
  | { type: "set_audio_take_archived"; clipId: string; archived: boolean }
  | { type: "comp_audio_take_from_bar"; clipId: string; bar: number }
  | { type: "comp_audio_take_range"; clipId: string }
  | { type: "place_punch_recording_clip_from_range"; mediaPoolItemId: string; trackId: string; captureStartBar: number };

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
  private suppressNextAutomationSurfaceClick = false;
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
    this.fileInput = configureHiddenFileInput(document.createElement("input"), {
      accept: ".pocketdaw,.json,text/plain,application/json",
      label: "project-open",
      onChange: () => this.handleFileOpen()
    });
    document.body.appendChild(this.fileInput);
    this.audioFileInput = configureHiddenFileInput(document.createElement("input"), {
      accept: AUDIO_MEDIA_ACCEPT,
      label: "audio-import",
      onChange: () => this.handleAudioFileImport()
    });
    document.body.appendChild(this.audioFileInput);
    this.midiFileInput = configureHiddenFileInput(document.createElement("input"), {
      accept: MIDI_MEDIA_ACCEPT,
      label: "midi-import",
      onChange: () => this.handleMidiFileImport()
    });
    document.body.appendChild(this.midiFileInput);
    this.root.addEventListener("click", (event) => this.handleDelegatedClick(event));
    this.root.addEventListener("dblclick", (event) => this.handleDelegatedDoubleClick(event));
    this.root.addEventListener("contextmenu", (event) => this.handleDelegatedContextMenu(event));
    this.root.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.root.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.root.addEventListener("pointerup", (event) => this.handlePointerEnd(event));
    this.root.addEventListener("pointercancel", (event) => this.handlePointerEnd(event));
    this.root.addEventListener("mousedown", (event) => this.handleMouseDown(event));
    this.root.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
    window.addEventListener("keydown", (event) => this.handleKeyboard(event), { capture: true });
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
          this.resetProjectSessionForProjectLoad(project, {
            status: "Recovered autosaved Pocket DAW project.",
            currentFile: autosaveFile
          });
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
    const exportReadiness = createAiBridgeExportReadiness(project);
    const mediaReadiness = createAiBridgeMediaReadiness(project);
    const selectedClipIds = this.normalizedSelectedClipIds();
    const selectedClips = selectedClipIds
      .map((id) => project.timeline.clips.find((clip) => clip.id === id))
      .filter((clip): clip is Clip => !!clip)
      .map((clip) => ({
        id: clip.id,
        name: clip.name,
        trackId: clip.trackId,
        type: clip.type,
        startBar: clip.startBar,
        barLength: clip.barLength
      }));
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
      timelineSelection: project.timeline.selection || null,
      selection: {
        trackId: this.state.selectedTrackId,
        clipId: this.state.selectedClipId,
        clipIds: selectedClipIds,
        trackName: project.tracks.find((track) => track.id === this.state.selectedTrackId)?.name || null,
        clipName: project.timeline.clips.find((clip) => clip.id === this.state.selectedClipId)?.name || null,
        clips: selectedClips
      },
      recording: {
        ...this.state.recording,
        inputPreflight: buildNativeRecordingAlphaInputPreflight(project),
        futureCapturePlan: buildGroupedRecordingCapturePlan(project, {
          requestedStartBar: 1,
          recordingSessionId: "live-preview",
          takeGroupId: "live-preview-take-group"
        })
      },
      export: exportReadiness,
      media: mediaReadiness,
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
        folderId: track.folderId ?? null,
        outputId: track.routing.outputId,
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
        armed: track.armed,
        monitorEnabled: track.monitorEnabled,
        inputDeviceId: track.inputDeviceId ?? null,
        recordingChannelMode: track.recordingChannelMode ?? null,
        recordingLatencyOffsetSeconds: track.recordKind && track.recordKind !== "none" ? recordingLatencyOffsetSeconds(track) : undefined,
        recordingInput: track.recordingInput ?? null
      })),
      capabilities: {
        read: ["status", "recording_input_preflight", "export_readiness", "media_take_summary"],
        control: ["play", "pause", "stop", "restart", "midi_panic", "seek_bar", "save_current", "select_track", "select_clip", "open_project", "performance_diagnostics"],
        liveCommands: ["set_track_volume", "set_track_pan", "set_track_mute", "set_track_solo", "set_track_input", "set_track_armed", "set_track_monitor", "set_recording_latency_offset", "set_recording_input_channel", "set_punch_range", "set_timeline_selection", "set_timeline_selection_to_clip", "clear_timeline_selection", "split_timeline_selection", "crop_clip_to_timeline_selection", "delete_clip_range", "ripple_delete_clip_range", "ripple_delete_timeline_selection", "apply_audio_clip_action", "set_audio_warp_marker_target", "delete_audio_warp_marker", "quantize_midi_clip", "quantize_midi_durations", "swing_midi_clip", "apply_midi_groove", "transform_midi_velocity", "transform_midi_pitch", "activate_audio_take_lane", "set_audio_take_archived", "comp_audio_take_from_bar", "comp_audio_take_range", "place_punch_recording_clip_from_range"]
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
    if (action === "midi_panic") {
      this.panicMidiPreview();
      return { ok: true, action, status: "midi-panic", transport: this.aiBridgeLiveStatus().transport };
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
      this.state.selectedClipIds = [clipId];
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
      this.applyProjectState(next, { audio: liveCommandAudioSyncMode(command), autosave: "debounced", preserveScroll: true, reason: "ai-bridge-live-command" });
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
    if (command.type === "set_punch_range") {
      return setPunchRangeCommand(this.state, numberInput(command.startBar, "startBar"), numberInput(command.endBar, "endBar"));
    }
    if (command.type === "set_timeline_selection") {
      return setTimelineSelectionRangeCommand(this.state, numberInput(command.startBar, "startBar"), numberInput(command.endBar, "endBar"));
    }
    if (command.type === "set_timeline_selection_to_clip") {
      return setTimelineSelectionToSelectedClipCommand({
        ...this.state,
        selectedClipId: stringInput(command.clipId, "clipId")
      });
    }
    if (command.type === "clear_timeline_selection") {
      return clearTimelineSelectionCommand(this.state);
    }
    if (command.type === "split_timeline_selection") {
      return splitTimelineSelectionCommand(this.state);
    }
    if (command.type === "crop_clip_to_timeline_selection") {
      return cropSelectedClipToTimelineSelectionCommand({
        ...this.state,
        selectedClipId: stringInput(command.clipId, "clipId")
      });
    }
    if (command.type === "delete_clip_range") {
      return deleteSelectedClipRangeCommand({
        ...this.state,
        selectedClipId: stringInput(command.clipId, "clipId")
      });
    }
    if (command.type === "ripple_delete_clip_range") {
      return rippleDeleteSelectedClipRangeCommand({
        ...this.state,
        selectedClipId: stringInput(command.clipId, "clipId")
      });
    }
    if (command.type === "ripple_delete_timeline_selection") {
      return rippleDeleteTimelineSelectionCommand(this.state);
    }
    if (command.type === "apply_audio_clip_action") {
      return applySelectedAudioClipActionCommand(
        this.state,
        stringInput(command.clipId, "clipId"),
        audioClipActionInput(command.action)
      );
    }
    if (command.type === "set_audio_warp_marker_target") {
      return setAudioWarpMarkerTargetCommand(
        this.state,
        stringInput(command.clipId, "clipId"),
        stringInput(command.markerId, "markerId"),
        numberInput(command.targetBar, "targetBar")
      );
    }
    if (command.type === "delete_audio_warp_marker") {
      return deleteAudioWarpMarkerCommand(
        this.state,
        stringInput(command.clipId, "clipId"),
        stringInput(command.markerId, "markerId")
      );
    }
    if (command.type === "quantize_midi_clip") {
      return quantizeMidiClipCommand(this.state, stringInput(command.clipId, "clipId"), midiQuantizeGridInput(command.grid));
    }
    if (command.type === "quantize_midi_durations") {
      return quantizeMidiDurationsCommand(this.state, stringInput(command.clipId, "clipId"), midiQuantizeGridInput(command.grid));
    }
    if (command.type === "swing_midi_clip") {
      return swingMidiClipCommand(this.state, stringInput(command.clipId, "clipId"), midiSwingPercentInput(command.percent));
    }
    if (command.type === "apply_midi_groove") {
      return applyMidiGrooveTemplateCommand(this.state, stringInput(command.clipId, "clipId"), midiGrooveTemplateInput(command.templateId));
    }
    if (command.type === "transform_midi_velocity") {
      return transformMidiVelocityCommand(this.state, stringInput(command.clipId, "clipId"), midiVelocityTransformInput(command.transform));
    }
    if (command.type === "transform_midi_pitch") {
      return transformMidiPitchCommand(this.state, stringInput(command.clipId, "clipId"), midiPitchTransformInput(command.transform));
    }
    if (command.type === "activate_audio_take_lane") {
      return activateAudioTakeLaneCommand(this.state, stringInput(command.clipId, "clipId"));
    }
    if (command.type === "set_audio_take_archived") {
      return setAudioTakeArchivedCommand(this.state, stringInput(command.clipId, "clipId"), Boolean(command.archived));
    }
    if (command.type === "comp_audio_take_from_bar") {
      return compAudioTakeFromPlayheadCommand(
        { ...this.state, playheadBar: numberInput(command.bar, "bar") },
        stringInput(command.clipId, "clipId")
      );
    }
    if (command.type === "comp_audio_take_range") {
      return compAudioTakeRangeCommand(this.state, stringInput(command.clipId, "clipId"));
    }
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
    if (command.type === "set_track_input") {
      return setTrackInputCommand(this.state, trackId, command.inputDeviceId || null);
    }
    if (command.type === "set_track_armed") {
      const track = project.tracks.find((item) => item.id === trackId);
      return track?.armed === Boolean(command.armed) ? { ...this.state, status: "Track arm already matched." } : toggleTrackArmedCommand(this.state, trackId);
    }
    if (command.type === "set_track_monitor") {
      const track = project.tracks.find((item) => item.id === trackId);
      return track?.monitorEnabled === Boolean(command.monitorEnabled) ? { ...this.state, status: "Track monitor already matched." } : toggleTrackMonitorCommand(this.state, trackId);
    }
    if (command.type === "set_recording_latency_offset") {
      return setTrackRecordingLatencyOffsetCommand(
        this.state,
        trackId,
        command.milliseconds !== undefined ? numberInput(command.milliseconds, "milliseconds") : numberInput(command.offsetSeconds, "offsetSeconds") * 1000
      );
    }
    if (command.type === "set_recording_input_channel") {
      return setTrackRecordingInputChannelCommand(
        this.state,
        trackId,
        recordingInputChannelValueFromLiveCommand(command),
        command.deviceId ?? undefined
      );
    }
    if (command.type === "place_punch_recording_clip_from_range") {
      return placePunchRecordingClipFromRangeCommand(
        this.state,
        stringInput(command.mediaPoolItemId, "mediaPoolItemId"),
        trackId,
        numberInput(command.captureStartBar, "captureStartBar")
      );
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
    this.applyButtonTooltips();
    this.bind();
    if (scroll) this.restoreScrollSnapshotSoon(scroll);
  }

  private applyButtonTooltips() {
    this.root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.getAttribute("title")) return;
      const tooltip = tooltipForButton(button);
      if (tooltip) button.setAttribute("title", tooltip);
    });
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

  private revealAppSection(selector: string) {
    const reveal = () => {
      const target = this.root.querySelector<HTMLElement>(selector);
      if (!target) return;
      const scroller = this.root.querySelector<HTMLElement>('[data-scroll-key="app-shell"]');
      if (scroller) revealElementInScroller(scroller, target);
      else target.scrollIntoView({ block: "start", inline: "nearest" });
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(reveal);
    else reveal();
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
      el.addEventListener("click", (event) => {
        if (this.consumeSuppressedClipClick()) return;
        const clipId = el.dataset.clipId || "";
        const row = el.dataset.row || "";
        const rowTrack = currentProject(this.state).tracks.find((track) => track.id === row) || currentProject(this.state).tracks.find((track) => track.role === row);
        this.selectClipFromGesture(clipId, rowTrack?.id || row || null, event.ctrlKey || event.metaKey || event.shiftKey);
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
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-record-channel-mode]").forEach((select) => {
      select.addEventListener("change", () => {
        const trackId = select.dataset.trackRecordChannelMode || "";
        const mode = select.value === "stereo" ? "stereo" : "mono";
        this.applyProjectState(setTrackRecordingChannelModeCommand(this.state, trackId, mode), {
          audio: "none",
          preserveScroll: true,
          reason: "track-record-channel-mode"
        });
        void this.syncActiveOrArmedInputMonitor(trackId);
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-record-channel]").forEach((select) => {
      select.addEventListener("change", () => {
        const trackId = select.dataset.trackRecordChannel || "";
        this.applyProjectState(setTrackRecordingInputChannelCommand(this.state, trackId, select.value), {
          audio: "none",
          preserveScroll: true,
          reason: "track-record-channel"
        });
        void this.syncActiveOrArmedInputMonitor(trackId);
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-track-recording-latency]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setTrackRecordingLatencyOffsetCommand(
        this.state,
        input.dataset.trackRecordingLatency || "",
        Number(input.value)
      ), {
        audio: "none",
        preserveScroll: true,
        reason: "track-recording-latency"
      }));
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-output]").forEach((select) => {
      select.addEventListener("change", () => this.applyProjectState(routeTrackOutputCommand(this.state, select.dataset.trackOutput || "", select.value || "master"), {
        audio: "mixer-graph",
        preserveScroll: true,
        reason: "track-output"
      }));
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-folder]").forEach((select) => {
      select.addEventListener("change", () => this.applyProjectState(setTrackFolderCommand(this.state, select.dataset.trackFolder || "", select.value || null), {
        audio: "none",
        preserveScroll: true,
        reason: "track-folder"
      }));
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-track-send-level]").forEach((input) => {
      input.addEventListener("change", () => {
        const [trackId, returnTrackId] = String(input.dataset.trackSendLevel || "").split(":");
        const value = Number(input.value);
        const recorded = this.recordLiveSendAutomation(trackId, returnTrackId, "level", value);
        this.applyProjectState(recorded || setTrackSendLevelCommand(this.state, trackId, returnTrackId, value), {
          audio: recorded ? "composition-events" : "mixer-graph",
          preserveScroll: true,
          reason: recorded ? "track-send-level-automation-record" : "track-send-level"
        });
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-send-mode]").forEach((select) => {
      select.addEventListener("change", () => {
        const [trackId, returnTrackId] = String(select.dataset.trackSendMode || "").split(":");
        const mode = select.value === "pre-fader" ? "pre-fader" : "post-fader";
        this.applyProjectState(setTrackSendModeCommand(this.state, trackId, returnTrackId, mode), {
          audio: "mixer-graph",
          preserveScroll: true,
          reason: "track-send-mode"
        });
      });
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
    this.root.querySelectorAll<HTMLInputElement>("[data-clip-stem-mute]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, stem] = String(input.dataset.clipStemMute || "").split(":");
        if (stem !== "drums" && stem !== "bass" && stem !== "chords" && stem !== "melody" && stem !== "guitar") return;
        this.applyProjectState(setSelectedGeneratedClipStemMuteCommand(this.state, clipId, stem, input.checked), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `clip-stem-${stem}`
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-audio-clip-property]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, field] = String(input.dataset.audioClipProperty || "").split(":");
        if (field !== "gain" && field !== "sourceOffsetSeconds" && field !== "durationSeconds" && field !== "fadeInSeconds" && field !== "fadeOutSeconds" && field !== "playbackRate" && field !== "pitchSemitones") return;
        const value = Number(input.value);
        const recorded = isClipAutomationField(field) ? this.recordLiveClipAutomation(clipId, field, value) : null;
        this.applyProjectState(recorded || setSelectedAudioClipPropertyCommand(this.state, clipId, field, value), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: recorded ? `clip-${field}-automation-record` : `audio-clip-${field}`
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-export-profile-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        const [profileId, field] = String(input.dataset.exportProfileSetting || "").split(":");
        if (field !== "sampleRate" && field !== "bitDepth" && field !== "tailSeconds" && field !== "channelMode" && field !== "normalize" && field !== "dither") return;
        this.applyProjectState(setExportProfileSettingCommand(this.state, profileId, field, field === "channelMode" || field === "normalize" || field === "dither" ? input.value : Number(input.value)), {
          audio: "none",
          preserveScroll: true,
          reason: `export-profile-${field}`
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-audio-clip-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const [clipId, action] = String(button.dataset.audioClipAction || "").split(":");
        if (action !== "normalize-gain" && action !== "reset-fades" && action !== "quick-fade" && action !== "crossfade-overlap" && action !== "create-crossfade-left" && action !== "invert-phase" && action !== "reverse" && action !== "analyze-transients" && action !== "create-warp-markers" && action !== "quantize-warp-markers" && action !== "quantize-warp-markers-1/4" && action !== "quantize-warp-markers-1/8" && action !== "quantize-warp-markers-1/16" && action !== "quantize-warp-markers-1/32" && action !== "apply-warp-varispeed" && action !== "clear-warp-markers") return;
        this.applyProjectState(applySelectedAudioClipActionCommand(this.state, clipId, action), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: `audio-clip-${action}`
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-audio-warp-marker-target]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, markerId] = String(input.dataset.audioWarpMarkerTarget || "").split(":");
        if (!clipId || !markerId) return;
        this.applyProjectState(setAudioWarpMarkerTargetCommand(this.state, clipId, markerId, Number(input.value)), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: "audio-warp-marker-target"
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-audio-warp-marker-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const [clipId, markerId] = String(button.dataset.audioWarpMarkerDelete || "").split(":");
        if (!clipId || !markerId) return;
        this.applyProjectState(deleteAudioWarpMarkerCommand(this.state, clipId, markerId), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: "audio-warp-marker-delete"
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-audio-take-activate]").forEach((button) => {
      button.addEventListener("click", () => {
        const clipId = String(button.dataset.audioTakeActivate || "");
        this.applyProjectState(activateAudioTakeCommand(this.state, clipId), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: "audio-take-activate"
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-audio-take-lane-activate]").forEach((button) => {
      button.addEventListener("click", () => {
        const clipId = String(button.dataset.audioTakeLaneActivate || "");
        this.applyProjectState(activateAudioTakeLaneCommand(this.state, clipId), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: "audio-take-lane-activate"
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-audio-take-archive], [data-audio-take-restore]").forEach((button) => {
      button.addEventListener("click", () => {
        const clipId = String(button.dataset.audioTakeArchive || button.dataset.audioTakeRestore || "");
        const archived = !!button.dataset.audioTakeArchive;
        this.applyProjectState(setAudioTakeArchivedCommand(this.state, clipId, archived), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: archived ? "audio-take-archive" : "audio-take-restore"
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-automation-point-bar], [data-automation-point-value], [data-automation-point-curve]").forEach((input) => {
      input.addEventListener("change", () => {
        const packed = input.dataset.automationPointBar || input.dataset.automationPointValue || input.dataset.automationPointCurve || "";
        const [laneId, indexText] = packed.split(":");
        const index = Number(indexText);
        const bar = Number(findDataElement<HTMLInputElement>(this.root, "data-automation-point-bar", `${laneId}:${index}`)?.value || 1);
        const value = Number(findDataElement<HTMLInputElement>(this.root, "data-automation-point-value", `${laneId}:${index}`)?.value || 0);
        const curve = findDataElement<HTMLSelectElement>(this.root, "data-automation-point-curve", `${laneId}:${index}`)?.value || "linear";
        this.applyProjectState(updateAutomationPointCommand(this.state, laneId, index, bar, value, curve));
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-project-meter-map-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const [pointId, field] = String(input.dataset.projectMeterMapField || "").split(":");
        if (field !== "bar" && field !== "numerator" && field !== "denominator") return;
        this.applyProjectState(updateProjectMeterMapPointCommand(this.state, pointId, { [field]: Number(input.value) }), {
          audio: "none",
          preserveScroll: true,
          reason: "project-meter-map-edit"
        });
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
    this.root.querySelectorAll<HTMLSelectElement>("[data-midi-conversion-section-target]").forEach((select) => {
      select.addEventListener("change", () => {
        this.state.chordsmithEditorSectionId = select.value;
        this.state.chordsmithEditorStepPage = 0;
        this.state.chordsmithEditorFollowClip = false;
        this.state.status = `MIDI conversion target set to Section ${this.state.chordsmithEditorSectionId}.`;
        this.render({ preserveScroll: true });
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-midi-conversion-melody-target]").forEach((select) => {
      select.addEventListener("change", () => {
        this.state.chordsmithEditorMelodyTrackIndex = Number(select.value || 0);
        this.state.status = `MIDI conversion melody target set to track ${this.state.chordsmithEditorMelodyTrackIndex + 1}.`;
        this.render({ preserveScroll: true });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-conversion-keep-raw-reference]").forEach((input) => {
      input.addEventListener("change", () => {
        this.state.midiConversionKeepRawReference = input.checked;
        this.state.status = input.checked
          ? "MIDI conversion will keep the raw reference clip on the timeline."
          : "MIDI conversion will remove the raw reference clip from the timeline after mapping.";
        this.render({ preserveScroll: true });
      });
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
    ["rangeStart", "rangeEnd"].forEach((id) => {
      this.root.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("change", () => {
        const selection = currentProject(this.state).timeline.selection;
        const start = Number(this.root.querySelector<HTMLInputElement>("#rangeStart")?.value || selection?.startBar || 1);
        const end = Number(this.root.querySelector<HTMLInputElement>("#rangeEnd")?.value || selection?.endBar || start + 1);
        this.applyProjectState(setTimelineSelectionRangeCommand(this.state, start, end), { audio: "transport-controls", reason: "timeline-selection-bars" });
      });
    });
    this.root.querySelector<HTMLTextAreaElement>("#importText")?.addEventListener("input", (event) => {
      this.state.importText = (event.target as HTMLTextAreaElement).value;
    });
    this.root.querySelector<HTMLSelectElement>("#midiImportPlacementMode")?.addEventListener("change", (event) => {
      this.state.midiImportPlacementMode = midiImportPlacementModeFromValue((event.target as HTMLSelectElement).value);
      this.state.status = `MIDI import placement set to ${midiImportPlacementModeLabel(this.state.midiImportPlacementMode)}.`;
      this.render();
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-midi-conversion-source-target]").forEach((select) => {
      select.addEventListener("change", () => {
        const filter = midiConversionSourceFilterFromValue(select.value);
        this.state.midiConversionSourceMode = filter.mode;
        this.state.midiConversionSourceValue = filter.value;
        this.state.status = `MIDI conversion source set to ${midiConversionSourceLabel(filter)}.`;
        this.render({ preserveScroll: true });
      });
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
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-note-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, noteId, field] = String(input.dataset.midiNoteField || "").split(":");
        if (field === "pitch" || field === "startTick" || field === "durationTicks" || field === "velocity" || field === "channel") {
          this.applyProjectState(setMidiNoteFieldCommand(this.state, clipId, noteId, field, Number(input.value)), {
            audio: "composition-events",
            preserveScroll: true,
            reason: `midi-note-${field}`
          });
        }
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-clip-property]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, field] = String(input.dataset.midiClipProperty || "").split(":");
        if (field !== "barLength") return;
        this.applyProjectState(setMidiClipBarLengthCommand(this.state, clipId, Number(input.value)), {
          audio: "timeline-structure",
          preserveScroll: true,
          reason: "midi-clip-bar-length"
        });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-controller-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, controllerId, field] = String(input.dataset.midiControllerField || "").split(":");
        if (field === "controller" || field === "tick" || field === "value" || field === "channel") {
          this.applyProjectState(setMidiControllerFieldCommand(this.state, clipId, controllerId, field, Number(input.value)), {
            audio: "composition-events",
            preserveScroll: true,
            reason: `midi-controller-${field}`
          });
        }
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-program-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, programId, field] = String(input.dataset.midiProgramField || "").split(":");
        if (field === "program" || field === "tick" || field === "channel") {
          this.applyProjectState(setMidiProgramChangeFieldCommand(this.state, clipId, programId, field, Number(input.value)), {
            audio: "composition-events",
            preserveScroll: true,
            reason: `midi-program-${field}`
          });
        }
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-pitch-bend-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, bendId, field] = String(input.dataset.midiPitchBendField || "").split(":");
        if (field === "value" || field === "tick" || field === "channel") {
          this.applyProjectState(setMidiPitchBendFieldCommand(this.state, clipId, bendId, field, Number(input.value)), {
            audio: "composition-events",
            preserveScroll: true,
            reason: `midi-pitch-bend-${field}`
          });
        }
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-midi-aftertouch-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const [clipId, aftertouchId, field] = String(input.dataset.midiAftertouchField || "").split(":");
        if (field === "value" || field === "tick" || field === "channel" || field === "note") {
          this.applyProjectState(setMidiAftertouchFieldCommand(this.state, clipId, aftertouchId, field, Number(input.value)), {
            audio: "composition-events",
            preserveScroll: true,
            reason: `midi-aftertouch-${field}`
          });
        }
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
    this.root.querySelectorAll<HTMLInputElement>("[data-drum-lane-gate]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setDrumLaneGateCommand(this.state, input.dataset.drumLaneGate || "", Number(input.value)), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "drum-lane-gate"
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
    const recorded = typeof value === "number" ? this.recordLiveFxAutomation(chainId, slotId, parameter, value) : null;
    this.applyProjectState(recorded || setFxSlotParameterCommand(this.state, chainId, slotId, parameter, value), {
      audio: "mixer-graph",
      preserveScroll: true,
      reason: recorded ? "fx-parameter-automation-record" : "fx-parameter"
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
    const recorded = this.recordLiveMixerAutomation(trackId, field, value);
    if (recorded) {
      this.applyProjectState(recorded, {
        audio: "composition-events",
        preserveScroll: true,
        reason: `track-${field}-automation-record`
      });
      void this.syncActiveOrArmedInputMonitor(trackId);
      return;
    }
    const next = field === "volume" ? setTrackVolumeCommand(this.state, trackId, value) : setTrackPanCommand(this.state, trackId, value);
    this.applyProjectState(next, {
      audio: "none",
      preserveScroll: true,
      reason: `track-${field}`
    });
    void this.syncActiveOrArmedInputMonitor(trackId);
  }

  private recordLiveMixerAutomation(trackId: string, field: MixerControlField, value: number): AppState | null {
    if (!this.state.playing && !this.engine.isPlaying()) return null;
    const next = recordTrackAutomationPointCommand(this.state, trackId, field, value, this.state.playheadBar || 1);
    return next === this.state ? null : next;
  }

  private recordLiveSendAutomation(trackId: string, returnTrackId: string, field: "level", value: number): AppState | null {
    if (!this.state.playing && !this.engine.isPlaying()) return null;
    const next = recordTrackSendAutomationPointCommand(this.state, trackId, returnTrackId, field, value, this.state.playheadBar || 1);
    return next === this.state ? null : next;
  }

  private recordLiveFxAutomation(chainId: string, slotId: string, parameter: string, value: number): AppState | null {
    if (!this.state.playing && !this.engine.isPlaying()) return null;
    const next = recordFxAutomationPointCommand(this.state, chainId, slotId, parameter, value, this.state.playheadBar || 1);
    return next === this.state ? null : next;
  }

  private recordLiveClipAutomation(clipId: string, field: ClipAutomationField, value: number): AppState | null {
    if (!this.state.playing && !this.engine.isPlaying()) return null;
    const next = recordClipAutomationPointCommand(this.state, clipId, field, value, this.state.playheadBar || 1);
    return next === this.state ? null : next;
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
    if (this.beginAutomationSurfaceDraw(target, event)) return;
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
    const selectedIds = this.normalizedSelectedClipIds();
    const preserveGroup = selectedIds.length > 1 && selectedIds.includes(clipId);
    this.state.selectedClipId = clipId;
    this.state.selectedClipIds = preserveGroup ? selectedIds : [clipId];
    this.state.selectedTrackId = inlineClip?.dataset.inlineRow || visibleClip?.dataset.row || this.state.selectedTrackId;
    this.render({ preserveScroll: true });
    const selectedDragIds = mode === "move" && preserveGroup ? selectedIds : [clipId];
    const dragNodes = () => selectedDragIds.flatMap((id) => [
      ...findDataElements<HTMLElement>(this.root, "data-inline-clip-id", id),
      ...findDataElements<HTMLElement>(this.root, "data-clip-id", id)
    ]);
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
        this.state.status = preserveGroup ? `Dragging ${selectedDragIds.length} clips to Bar ${latestValue}.` : `Dragging ${clip.name} to Bar ${latestValue}.`;
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

  private beginAutomationSurfaceDraw(target: HTMLElement | null, event: PointerEvent): boolean {
    const surface = target?.closest<HTMLElement>("[data-automation-lane-surface]");
    if (!surface) return false;
    event.preventDefault();
    this.suppressNextAutomationSurfaceClick = true;
    const laneId = String(surface.dataset.automationLaneSurface || "");
    const lane = currentProject(this.state).automation.lanes.find((item) => item.id === laneId);
    const audioMode = automationSurfaceAudioSyncMode(lane?.targetPath);
    const points: Array<{ bar: number; value: number; curve: "linear" }> = [];
    const collect = (clientX: number, clientY: number) => {
      const point = this.automationSurfacePoint(surface, clientX, clientY);
      const last = points[points.length - 1];
      if (last && last.bar === point.bar && last.value === point.value) return;
      points.push({ ...point, curve: "linear" });
    };
    collect(event.clientX, event.clientY);
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      collect(moveEvent.clientX, moveEvent.clientY);
    };
    const up = (upEvent: PointerEvent) => {
      cleanup();
      collect(upEvent.clientX, upEvent.clientY);
      this.applyProjectState(addAutomationPointsToLaneCommand(this.state, laneId, points), {
        audio: audioMode,
        preserveScroll: true,
        reason: "automation-surface-draw"
      });
    };
    const cancel = () => cleanup();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return true;
  }

  private automationSurfacePoint(surface: HTMLElement, clientX: number, clientY: number): { bar: number; value: number } {
    const minBar = Number(surface.dataset.automationLaneStartBar || 1);
    const maxBar = Number(surface.dataset.automationLaneEndBar || minBar + 4);
    const minValue = Number(surface.dataset.automationLaneMin || 0);
    const maxValue = Number(surface.dataset.automationLaneMax || 1);
    return automationSurfacePointFromClient(surface.getBoundingClientRect(), minBar, maxBar, minValue, maxValue, clientX, clientY);
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
    if (target?.matches("[data-function-guide-backdrop]")) {
      this.state.showFunctionGuidePanel = false;
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
    const addMidiController = target?.closest<HTMLElement>("[data-midi-controller-add]");
    if (addMidiController) {
      this.applyProjectState(addMidiControllerCommand(this.state, addMidiController.dataset.midiControllerAdd || ""), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-controller-add"
      });
      return;
    }
    const addMidiProgram = target?.closest<HTMLElement>("[data-midi-program-add]");
    if (addMidiProgram) {
      this.applyProjectState(addMidiProgramChangeCommand(this.state, addMidiProgram.dataset.midiProgramAdd || ""), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-program-add"
      });
      return;
    }
    const addMidiPitchBend = target?.closest<HTMLElement>("[data-midi-pitch-bend-add]");
    if (addMidiPitchBend) {
      this.applyProjectState(addMidiPitchBendCommand(this.state, addMidiPitchBend.dataset.midiPitchBendAdd || ""), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-pitch-bend-add"
      });
      return;
    }
    const addMidiAftertouch = target?.closest<HTMLElement>("[data-midi-aftertouch-add]");
    if (addMidiAftertouch) {
      this.applyProjectState(addMidiAftertouchCommand(this.state, addMidiAftertouch.dataset.midiAftertouchAdd || ""), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-aftertouch-add"
      });
      return;
    }
    const quantizeMidi = target?.closest<HTMLElement>("[data-midi-quantize]");
    if (quantizeMidi) {
      const [clipId, grid] = String(quantizeMidi.dataset.midiQuantize || "").split(":");
      if (grid === "1/4" || grid === "1/8" || grid === "1/16" || grid === "1/32") {
        this.applyProjectState(quantizeMidiClipCommand(this.state, clipId, grid), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `midi-quantize-${grid}`
        });
      }
      return;
    }
    const quantizeMidiDurations = target?.closest<HTMLElement>("[data-midi-duration-quantize]");
    if (quantizeMidiDurations) {
      const [clipId, grid] = String(quantizeMidiDurations.dataset.midiDurationQuantize || "").split(":");
      if (grid === "1/4" || grid === "1/8" || grid === "1/16" || grid === "1/32") {
        this.applyProjectState(quantizeMidiDurationsCommand(this.state, clipId, grid), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `midi-duration-quantize-${grid}`
        });
      }
      return;
    }
    const swingMidi = target?.closest<HTMLElement>("[data-midi-swing]");
    if (swingMidi) {
      const [clipId, percentText] = String(swingMidi.dataset.midiSwing || "").split(":");
      const percent = Number(percentText);
      if (percent === 50 || percent === 55 || percent === 60 || percent === 65) {
        this.applyProjectState(swingMidiClipCommand(this.state, clipId, percent), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `midi-swing-${percent}`
        });
      }
      return;
    }
    const grooveMidi = target?.closest<HTMLElement>("[data-midi-groove]");
    if (grooveMidi) {
      const [clipId, templateId] = String(grooveMidi.dataset.midiGroove || "").split(":");
      if (templateId === "straight-16" || templateId === "pocket-16" || templateId === "shuffle-8") {
        this.applyProjectState(applyMidiGrooveTemplateCommand(this.state, clipId, templateId), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `midi-groove-${templateId}`
        });
      }
      return;
    }
    const velocityTransform = target?.closest<HTMLElement>("[data-midi-velocity-transform]");
    if (velocityTransform) {
      const [clipId, transform] = String(velocityTransform.dataset.midiVelocityTransform || "").split(":");
      if (transform === "level-96" || transform === "humanize-12") {
        this.applyProjectState(transformMidiVelocityCommand(this.state, clipId, transform), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `midi-velocity-${transform}`
        });
      }
      return;
    }
    const pitchTransform = target?.closest<HTMLElement>("[data-midi-pitch-transform]");
    if (pitchTransform) {
      const [clipId, transform] = String(pitchTransform.dataset.midiPitchTransform || "").split(":");
      if (transform === "semitone-down" || transform === "semitone-up" || transform === "octave-down" || transform === "octave-up") {
        this.applyProjectState(transformMidiPitchCommand(this.state, clipId, transform), {
          audio: "composition-events",
          preserveScroll: true,
          reason: `midi-pitch-${transform}`
        });
      }
      return;
    }
    const deleteMidiNote = target?.closest<HTMLElement>("[data-midi-note-delete]");
    if (deleteMidiNote) {
      const [clipId, noteId] = String(deleteMidiNote.dataset.midiNoteDelete || "").split(":");
      this.applyProjectState(deleteMidiNoteCommand(this.state, clipId, noteId));
      return;
    }
    const duplicateMidiNote = target?.closest<HTMLElement>("[data-midi-note-duplicate]");
    if (duplicateMidiNote) {
      const [clipId, noteId] = String(duplicateMidiNote.dataset.midiNoteDuplicate || "").split(":");
      this.applyProjectState(duplicateMidiNoteCommand(this.state, clipId, noteId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-note-duplicate"
      });
      return;
    }
    const deleteMidiController = target?.closest<HTMLElement>("[data-midi-controller-delete]");
    if (deleteMidiController) {
      const [clipId, controllerId] = String(deleteMidiController.dataset.midiControllerDelete || "").split(":");
      this.applyProjectState(deleteMidiControllerCommand(this.state, clipId, controllerId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-controller-delete"
      });
      return;
    }
    const duplicateMidiController = target?.closest<HTMLElement>("[data-midi-controller-duplicate]");
    if (duplicateMidiController) {
      const [clipId, controllerId] = String(duplicateMidiController.dataset.midiControllerDuplicate || "").split(":");
      this.applyProjectState(duplicateMidiControllerCommand(this.state, clipId, controllerId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-controller-duplicate"
      });
      return;
    }
    const deleteMidiProgram = target?.closest<HTMLElement>("[data-midi-program-delete]");
    if (deleteMidiProgram) {
      const [clipId, programId] = String(deleteMidiProgram.dataset.midiProgramDelete || "").split(":");
      this.applyProjectState(deleteMidiProgramChangeCommand(this.state, clipId, programId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-program-delete"
      });
      return;
    }
    const duplicateMidiProgram = target?.closest<HTMLElement>("[data-midi-program-duplicate]");
    if (duplicateMidiProgram) {
      const [clipId, programId] = String(duplicateMidiProgram.dataset.midiProgramDuplicate || "").split(":");
      this.applyProjectState(duplicateMidiProgramChangeCommand(this.state, clipId, programId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-program-duplicate"
      });
      return;
    }
    const deleteMidiPitchBend = target?.closest<HTMLElement>("[data-midi-pitch-bend-delete]");
    if (deleteMidiPitchBend) {
      const [clipId, bendId] = String(deleteMidiPitchBend.dataset.midiPitchBendDelete || "").split(":");
      this.applyProjectState(deleteMidiPitchBendCommand(this.state, clipId, bendId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-pitch-bend-delete"
      });
      return;
    }
    const duplicateMidiPitchBend = target?.closest<HTMLElement>("[data-midi-pitch-bend-duplicate]");
    if (duplicateMidiPitchBend) {
      const [clipId, bendId] = String(duplicateMidiPitchBend.dataset.midiPitchBendDuplicate || "").split(":");
      this.applyProjectState(duplicateMidiPitchBendCommand(this.state, clipId, bendId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-pitch-bend-duplicate"
      });
      return;
    }
    const deleteMidiAftertouch = target?.closest<HTMLElement>("[data-midi-aftertouch-delete]");
    if (deleteMidiAftertouch) {
      const [clipId, aftertouchId] = String(deleteMidiAftertouch.dataset.midiAftertouchDelete || "").split(":");
      this.applyProjectState(deleteMidiAftertouchCommand(this.state, clipId, aftertouchId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-aftertouch-delete"
      });
      return;
    }
    const duplicateMidiAftertouch = target?.closest<HTMLElement>("[data-midi-aftertouch-duplicate]");
    if (duplicateMidiAftertouch) {
      const [clipId, aftertouchId] = String(duplicateMidiAftertouch.dataset.midiAftertouchDuplicate || "").split(":");
      this.applyProjectState(duplicateMidiAftertouchCommand(this.state, clipId, aftertouchId), {
        audio: "composition-events",
        preserveScroll: true,
        reason: "midi-aftertouch-duplicate"
      });
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
    const sendAutomationCreate = target?.closest<HTMLElement>("[data-send-automation-create]");
    if (sendAutomationCreate) {
      const [trackId, returnTrackId, field] = String(sendAutomationCreate.dataset.sendAutomationCreate || "").split(":");
      if (field === "level") this.applyProjectState(ensureTrackSendAutomationLaneCommand(this.state, trackId, returnTrackId, field), { audio: "composition-events", preserveScroll: true, reason: "send-automation-create" });
      return;
    }
    const projectAutomationCreate = target?.closest<HTMLElement>("[data-project-automation-create]");
    if (projectAutomationCreate) {
      const field = String(projectAutomationCreate.dataset.projectAutomationCreate || "");
      if (field === "tempo") this.applyProjectState(ensureProjectAutomationLaneCommand(this.state, field), { audio: "composition-events", preserveScroll: true, reason: "project-automation-create" });
      return;
    }
    const clipAutomationCreate = target?.closest<HTMLElement>("[data-clip-automation-create]");
    if (clipAutomationCreate) {
      const [clipId, field] = String(clipAutomationCreate.dataset.clipAutomationCreate || "").split(":");
      if (isClipAutomationField(field)) this.applyProjectState(ensureClipAutomationLaneCommand(this.state, clipId, field), { audio: "composition-events", preserveScroll: true, reason: "clip-automation-create" });
      return;
    }
    const fxAutomationCreate = target?.closest<HTMLElement>("[data-fx-automation-create]");
    if (fxAutomationCreate) {
      const [chainId, slotId, parameter] = String(fxAutomationCreate.dataset.fxAutomationCreate || "").split(":");
      this.applyProjectState(ensureFxAutomationLaneCommand(this.state, chainId, slotId, parameter), { audio: "mixer-graph", preserveScroll: true, reason: "fx-automation-create" });
      return;
    }
    const automationSurface = target?.closest<HTMLElement>("[data-automation-lane-surface]");
    if (automationSurface && event instanceof MouseEvent) {
      const laneId = String(automationSurface.dataset.automationLaneSurface || "");
      if (this.suppressNextAutomationSurfaceClick) {
        this.suppressNextAutomationSurfaceClick = false;
        return;
      }
      const { bar, value } = this.automationSurfacePoint(automationSurface, event.clientX, event.clientY);
      const lane = currentProject(this.state).automation.lanes.find((item) => item.id === laneId);
      this.applyProjectState(addAutomationPointToLaneCommand(this.state, laneId, bar, value), {
        audio: automationSurfaceAudioSyncMode(lane?.targetPath),
        preserveScroll: true,
        reason: "automation-surface-add-point"
      });
      return;
    }
    const automationAddPoint = target?.closest<HTMLElement>("[data-automation-add-point]");
    if (automationAddPoint) {
      const [trackId, field] = String(automationAddPoint.dataset.automationAddPoint || "").split(":");
      this.applyProjectState(addAutomationPointCommand(this.state, trackId, field === "pan" ? "pan" : "volume"));
      return;
    }
    const sendAutomationAddPoint = target?.closest<HTMLElement>("[data-send-automation-add-point]");
    if (sendAutomationAddPoint) {
      const [trackId, returnTrackId, field] = String(sendAutomationAddPoint.dataset.sendAutomationAddPoint || "").split(":");
      if (field === "level") this.applyProjectState(addTrackSendAutomationPointCommand(this.state, trackId, returnTrackId, field), { audio: "composition-events", preserveScroll: true, reason: "send-automation-add-point" });
      return;
    }
    const projectAutomationAddPoint = target?.closest<HTMLElement>("[data-project-automation-add-point]");
    if (projectAutomationAddPoint) {
      const field = String(projectAutomationAddPoint.dataset.projectAutomationAddPoint || "");
      if (field === "tempo") this.applyProjectState(addProjectAutomationPointCommand(this.state, field), { audio: "composition-events", preserveScroll: true, reason: "project-automation-add-point" });
      return;
    }
    const meterMapAddPoint = target?.closest<HTMLElement>("[data-project-meter-map-add]");
    if (meterMapAddPoint) {
      this.applyProjectState(addProjectMeterMapPointCommand(this.state), {
        audio: "none",
        preserveScroll: true,
        reason: "project-meter-map-add"
      });
      return;
    }
    const clipAutomationAddPoint = target?.closest<HTMLElement>("[data-clip-automation-add-point]");
    if (clipAutomationAddPoint) {
      const [clipId, field] = String(clipAutomationAddPoint.dataset.clipAutomationAddPoint || "").split(":");
      if (isClipAutomationField(field)) this.applyProjectState(addClipAutomationPointCommand(this.state, clipId, field), { audio: "composition-events", preserveScroll: true, reason: "clip-automation-add-point" });
      return;
    }
    const fxAutomationAddPoint = target?.closest<HTMLElement>("[data-fx-automation-add-point]");
    if (fxAutomationAddPoint) {
      const [chainId, slotId, parameter] = String(fxAutomationAddPoint.dataset.fxAutomationAddPoint || "").split(":");
      this.applyProjectState(addFxAutomationPointCommand(this.state, chainId, slotId, parameter), { audio: "mixer-graph", preserveScroll: true, reason: "fx-automation-add-point" });
      return;
    }
    const automationDeletePoint = target?.closest<HTMLElement>("[data-automation-delete-point]");
    if (automationDeletePoint) {
      const [laneId, index] = String(automationDeletePoint.dataset.automationDeletePoint || "").split(":");
      this.applyProjectState(deleteAutomationPointCommand(this.state, laneId, Number(index)));
      return;
    }
    const meterMapDeletePoint = target?.closest<HTMLElement>("[data-project-meter-map-delete]");
    if (meterMapDeletePoint) {
      this.applyProjectState(deleteProjectMeterMapPointCommand(this.state, String(meterMapDeletePoint.dataset.projectMeterMapDelete || "")), {
        audio: "none",
        preserveScroll: true,
        reason: "project-meter-map-delete"
      });
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
    const drumBranchStep = target?.closest<HTMLElement>("[data-drum-branch-step]");
    if (drumBranchStep) {
      if (this.consumeSuppressedStepClick()) return;
      const [sectionId, lane, step] = String(drumBranchStep.dataset.drumBranchStep || "").split(":");
      if (!isDrumLaneId(lane)) return;
      const selection: ChordsmithStepSelection = { kind: "drums", sectionId, lane, step: Number(step) };
      this.selectChordsmithStep(selection);
      this.applyChordsmithEditorEdit(cycleDrumBranchStepCommand(this.state, sectionId, lane, Number(step)), "daw-drum-branch-step", { step: selection });
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
    const folderToggle = target?.closest<HTMLElement>("[data-folder-toggle]");
    if (folderToggle) {
      this.applyProjectState(toggleFolderExpandedCommand(this.state, folderToggle.dataset.folderToggle || ""), {
        audio: "none",
        preserveScroll: true,
        reason: "folder-toggle"
      });
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
      const mouse = event as MouseEvent;
      this.selectClipFromGesture(
        inlineClip.dataset.inlineClipId || "",
        inlineClip.dataset.inlineRow || this.state.selectedTrackId,
        mouse.ctrlKey || mouse.metaKey || mouse.shiftKey
      );
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

  private handleDelegatedDoubleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest("button, input, select, textarea, [data-timeline-non-seek]")) return;
    if (this.targetCanBranchGeneratedDrums(target)) {
      event.preventDefault();
      this.branchGeneratedDrumsFromGesture("branch-generated-drums-double-click");
    }
  }

  private handleDelegatedContextMenu(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest("button, input, select, textarea, [data-timeline-non-seek]")) return;
    if (this.targetCanBranchGeneratedDrums(target)) {
      event.preventDefault();
      this.branchGeneratedDrumsFromGesture("branch-generated-drums-context");
    }
  }

  private targetCanBranchGeneratedDrums(target: HTMLElement): boolean {
    const trackHeader = target.closest<HTMLElement>("[data-track-id]");
    if (trackHeader) {
      const track = currentProject(this.state).tracks.find((item) => item.id === trackHeader.dataset.trackId);
      return track?.role === "drums" && !generatedDrumBranchLane(track);
    }
    const clipElement = target.closest<HTMLElement>("[data-clip-id]");
    return !!clipElement && this.isGeneratedDrumsClip(clipElement.dataset.clipId || "");
  }

  private isGeneratedDrumsClip(clipId: string): boolean {
    const project = currentProject(this.state);
    const clip = project.timeline.clips.find((item) => item.id === clipId);
    if (!clip || clip.type !== "generated-section") return false;
    return project.tracks.find((track) => track.id === clip.trackId)?.role === "drums";
  }

  private branchGeneratedDrumsFromGesture(reason: string) {
    this.applyProjectState(branchGeneratedDrumsCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason
    });
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
    if (action === "midi-panic") this.panicMidiPreview();
    if (action === "record-toggle") await this.toggleRecording();
    if (action === "preset-music" || action === "preset-game-music") {
      this.state.uiCreationPreset = action === "preset-game-music" ? "game-music" : "music";
      const presetSections = collapsedSectionsForCreationPreset(this.state.uiCreationPreset);
      this.state.collapsedUiSections = { ...presetSections };
      this.state.lowerDockTab = lowerDockTabForCreationPreset(this.state.uiCreationPreset, this.state.lowerDockTab);
      this.state.inspectorVisible = false;
      this.state.status = this.state.uiCreationPreset === "game-music"
        ? "Game music focus: timeline/game cues stay prominent; game-pack export controls are open and inspector detail is tucked away."
        : "Music focus: the timeline stays primary; deeper editing, mix and media controls are tucked away until opened.";
      this.render({ preserveScroll: true });
    }
    if (action === "toggle-ui-section") {
      const section = actionSource?.dataset.uiSection || "";
      if (isUiCollapseSection(section)) {
        const collapsed = this.state.collapsedUiSections[section] === true;
        this.state.collapsedUiSections = { ...this.state.collapsedUiSections, [section]: !collapsed };
        this.state.status = `${sectionLabelForStatus(section)} ${collapsed ? "expanded" : "collapsed"}.`;
        this.render({ preserveScroll: true });
      }
    }
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
      this.render({ preserveScroll: true });
    }
    if (action === "controls-close") {
      this.state.showControls = false;
      this.render({ preserveScroll: true });
    }
    if (action === "file-window-open") {
      this.state.showFilePanel = true;
      this.render({ preserveScroll: true });
    }
    if (action === "file-window-close") {
      this.state.showFilePanel = false;
      this.render({ preserveScroll: true });
    }
    if (action === "add-track-open") {
      this.state.showAddTrack = true;
      this.render({ preserveScroll: true });
    }
    if (action === "add-bus-track") this.applyProjectState(addBusTrackCommand(this.state), { audio: "mixer-graph", preserveScroll: true, reason: "add-bus-track" });
    if (action === "add-return-track") this.applyProjectState(addReturnTrackCommand(this.state), { audio: "mixer-graph", preserveScroll: true, reason: "add-return-track" });
    if (action === "add-track-close") {
      this.state.showAddTrack = false;
      this.render({ preserveScroll: true });
    }
    if (action === "audio-settings-open") {
      this.state.showAudioSettings = true;
      this.render({ preserveScroll: true });
    }
    if (action === "audio-settings-close") {
      this.state.showAudioSettings = false;
      this.render({ preserveScroll: true });
    }
    if (action === "updater-open") {
      this.state.showUpdaterPanel = true;
      this.render({ preserveScroll: true });
    }
    if (action === "updater-close") {
      this.state.showUpdaterPanel = false;
      this.render({ preserveScroll: true });
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
    if (action === "function-guide-open") {
      this.state.showFunctionGuidePanel = true;
      this.render({ preserveScroll: true });
    }
    if (action === "function-guide-close") {
      this.state.showFunctionGuidePanel = false;
      this.render({ preserveScroll: true });
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
    if (action === "studio-focus-timeline") {
      this.state.showFilePanel = false;
      this.state.showControls = false;
      this.state.showAddTrack = false;
      this.state.showAudioSettings = false;
      this.state.showUpdaterPanel = false;
      this.state.showMcpSetupPanel = false;
      this.state.showFunctionGuidePanel = false;
      this.state.showFeedbackPanel = false;
      this.state.status = "Timeline clips visible.";
      this.render({ preserveScroll: true });
      this.revealAppSection(".timeline-wrap");
    }
    if (action === "media-pool-focus") {
      this.state.status = "Media Pool visible.";
      this.state.showFilePanel = false;
      this.state.collapsedUiSections = { ...this.state.collapsedUiSections, "media-pool": false };
      this.render();
      this.revealAppSection("#mediaPool");
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
    if (action === "lower-dock-mixer" || action === "lower-dock-inserts" || action === "lower-dock-sends" || action === "lower-dock-automation" || action === "lower-dock-piano-roll" || action === "lower-dock-audio-editor" || action === "lower-dock-export-details") {
      this.state.lowerDockTab = action.replace("lower-dock-", "") as typeof this.state.lowerDockTab;
      this.state.collapsedUiSections = { ...this.state.collapsedUiSections, "lower-dock": false };
      this.state.status = `${this.state.lowerDockTab[0].toUpperCase()}${this.state.lowerDockTab.slice(1)} dock selected.`;
      this.render({ preserveScroll: true });
      this.revealAppSection(".mixer.lower-dock");
    }
    if (action === "studio-focus-godot") {
      this.state.showFilePanel = false;
      this.state.showControls = false;
      this.state.showAddTrack = false;
      this.state.showAudioSettings = false;
      this.state.showUpdaterPanel = false;
      this.state.showMcpSetupPanel = false;
      this.state.showFunctionGuidePanel = false;
      this.state.showFeedbackPanel = false;
      this.state.uiCreationPreset = "game-music";
      this.state.inspectorVisible = false;
      this.state.collapsedUiSections = { ...collapsedSectionsForCreationPreset("game-music"), "lower-dock": false };
      this.state.lowerDockTab = "export-details";
      this.state.status = "Godot focus: timeline/game cues stay prominent and game-pack export controls are visible.";
      this.render({ preserveScroll: true });
      this.revealAppSection(".mixer.lower-dock");
    }
    if (action === "import-audio") await this.importAudioMedia();
    if (action === "import-midi") await this.importMidiMedia();
    if (action === "add-empty-midi-clip") this.applyProjectState(addEmptyMidiClipCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "add-empty-midi-clip"
    });
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
    if (action === "clip-cut") this.applyProjectState(cutSelectedClip(this.state));
    if (action === "clip-paste") this.applyProjectState(pasteClipAtPlayhead(this.state));
    if (action === "clip-split") this.applyProjectState(splitSelectedClipAtPlayhead(this.state));
    if (action === "audio-take-comp-from-playhead" && this.state.selectedClipId) {
      this.applyProjectState(compAudioTakeFromPlayheadCommand(this.state, this.state.selectedClipId));
    }
    if (action === "audio-take-comp-range" && this.state.selectedClipId) {
      this.applyProjectState(compAudioTakeRangeCommand(this.state, this.state.selectedClipId));
    }
    if (action === "trim-start-right") this.applyProjectState(trimSelectedClipStartCommand(this.state, 1));
    if (action === "trim-start-left") this.applyProjectState(trimSelectedClipStartCommand(this.state, -1));
    if (action === "trim-end-left") this.applyProjectState(trimSelectedClipEndCommand(this.state, -1));
    if (action === "trim-end-right") this.applyProjectState(trimSelectedClipEndCommand(this.state, 1));
    if (action === "toggle-loop") this.applyProjectState(setLoopEnabled(this.state, !currentProject(this.state).timeline.loop.enabled), { audio: "transport-controls", reason: "loop-toggle" });
    if (action === "loop-selected") this.applyProjectState(setLoopToSelectedClipCommand(this.state), { audio: "transport-controls", reason: "loop-selected" });
    if (action === "loop-clear") this.applyProjectState(clearLoopCommand(this.state), { audio: "transport-controls", reason: "loop-clear" });
    if (action === "range-selected") this.applyProjectState(setTimelineSelectionToSelectedClipCommand(this.state), { audio: "transport-controls", reason: "range-selected" });
    if (action === "range-loop") this.applyProjectState(setTimelineSelectionToLoopCommand(this.state), { audio: "transport-controls", reason: "range-loop" });
    if (action === "range-copy") {
      this.state = copySelectedClipRangeCommand(this.state);
      this.render();
    }
    if (action === "range-cut") this.applyProjectState(cutSelectedClipRangeCommand(this.state), { audio: "transport-controls", reason: "range-cut" });
    if (action === "range-split") this.applyProjectState(splitTimelineSelectionCommand(this.state), { audio: "transport-controls", reason: "range-split" });
    if (action === "range-crop") this.applyProjectState(cropSelectedClipToTimelineSelectionCommand(this.state), { audio: "transport-controls", reason: "range-crop" });
    if (action === "range-delete") this.applyProjectState(deleteSelectedClipRangeCommand(this.state), { audio: "transport-controls", reason: "range-delete" });
    if (action === "range-ripple-delete") this.applyProjectState(rippleDeleteSelectedClipRangeCommand(this.state), { audio: "transport-controls", reason: "range-ripple-delete" });
    if (action === "range-ripple-all") this.applyProjectState(rippleDeleteTimelineSelectionCommand(this.state), { audio: "transport-controls", reason: "range-ripple-all" });
    if (action === "range-clear") this.applyProjectState(clearTimelineSelectionCommand(this.state), { audio: "transport-controls", reason: "range-clear" });
    if (action === "marker-add") this.applyProjectState(addMarkerAtPlayheadCommand(this.state));
    if (action === "game-state-marker-add") {
      const select = this.root.querySelector<HTMLSelectElement>("#gameStateMarker");
      this.applyProjectState(addGameStateMarkerAtPlayheadCommand(this.state, select?.value || "combat"));
    }
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
    if (action === "export-full-flac") this.rejectUnsupportedExportProfile("full-song-flac", "Full Song FLAC");
    if (action === "export-stem-flacs") this.rejectUnsupportedExportProfile("stem-flacs", "Stem FLACs");
    if (action === "export-full-mp3") this.rejectUnsupportedExportProfile("full-song-mp3", "Full Song MP3");
    if (action === "export-aiff-interchange") this.rejectUnsupportedExportProfile("aiff-interchange", "AIFF Interchange");
    if (action === "export-midi") this.exportMidi();
    if (action === "export-selected-clip-midi") this.exportSelectedClipMidi();
    if (action === "export-selected-track-midi") this.exportSelectedTrackMidi();
    if (action === "freeze-selected-clip") await this.freezeSelectedClip();
    if (action === "export-stems") await this.exportStems();
    if (action === "export-section-manifest") void this.exportSectionLoops();
    if (action === "export-godot-manifest") await this.exportGamePack("godot-adaptive-pack");
    if (action === "push-godot-pack") await this.exportGamePack("godot-adaptive-pack", { pushToGodot: true });
    if (action === "export-godot-ogg-pack") this.rejectUnsupportedExportProfile("godot-ogg-pack", "Godot Ogg Pack");
    if (action === "export-web-game-manifest") await this.exportGamePack("web-game-pack");
    if (action === "export-web-ogg-pack") this.rejectUnsupportedExportProfile("web-ogg-pack", "Web Ogg Pack");
    if (action === "export-media-plan") this.exportMediaPlan();
    if (action === "branch-generated-drums") this.applyProjectState(branchGeneratedDrumsCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "branch-generated-drums"
    });
    if (action === "convert-midi-drums") this.applyProjectState(convertMidiDrumsToBranchOverlaysCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "convert-midi-drums"
    });
    if (action === "convert-midi-bass") this.applyProjectState(convertMidiBassToGeneratedOverlaysCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "convert-midi-bass"
    });
    if (action === "convert-midi-chords") this.applyProjectState(convertMidiChordsToGeneratedOverlaysCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "convert-midi-chords"
    });
    if (action === "convert-midi-melody") this.applyProjectState(convertMidiMelodyToGeneratedOverlaysCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "convert-midi-melody"
    });
    if (action === "convert-midi-arrangement") this.applyProjectState(convertMidiArrangementToGeneratedOverlaysCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "convert-midi-arrangement"
    });
    if (action === "adopt-midi-tempo") this.applyProjectState(adoptMidiTempoMapStartCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "adopt-midi-tempo"
    });
    if (action === "adopt-midi-tempo-map") this.applyProjectState(adoptMidiTempoMapAutomationCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "adopt-midi-tempo-map"
    });
    if (action === "adopt-midi-meter-map") this.applyProjectState(adoptMidiMeterMapCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "adopt-midi-meter-map"
    });
    if (action === "collapse-generated-drum-branches") this.applyProjectState(collapseGeneratedDrumBranchesCommand(this.state), {
      audio: "composition-events",
      preserveScroll: true,
      reason: "collapse-generated-drum-branches"
    });
    if (action === "toggle-drum-branch-group") this.applyProjectState(toggleDrumBranchGroupCollapsedCommand(this.state), {
      audio: "none",
      preserveScroll: true,
      reason: "toggle-drum-branch-group"
    });
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
    Object.assign(this.state, beginUpdaterCheck(this.state, showPanel));
    this.render({ preserveScroll: true });

    const result = await checkForPocketDawUpdate();
    Object.assign(this.state, applyUpdaterCheckResult(this.state, result, showPanel));
    this.render({ preserveScroll: true });
  }

  private async downloadAndInstallUpdate() {
    if (this.state.updaterStatus !== "available") return;
    Object.assign(this.state, beginUpdaterDownload(this.state));
    this.render({ preserveScroll: true });

    const result = await downloadAndInstallPocketDawUpdate((progress) => this.applyUpdaterProgress(progress));
    Object.assign(this.state, applyUpdaterInstallResult(this.state, result));
    this.render({ preserveScroll: true });
  }

  private applyUpdaterProgress(progress: PocketDawUpdateProgress) {
    Object.assign(this.state, updaterProgressPatch(this.state, progress));
    this.render({ preserveScroll: true });
  }

  private async restartAfterUpdate() {
    const result = await relaunchPocketDaw();
    Object.assign(this.state, applyUpdaterRelaunchResult(this.state, result));
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
    if (command === "cut-clip") this.applyProjectState(cutSelectedClip(this.state));
    if (command === "copy-range") {
      this.state = copySelectedClipRangeCommand(this.state);
      this.render();
    }
    if (command === "cut-range") this.applyProjectState(cutSelectedClipRangeCommand(this.state), { audio: "transport-controls", reason: "range-cut-keyboard" });
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
    return snapProjectBarValue(project, value, this.state.snapMode);
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

  private panicMidiPreview() {
    this.engine.stop();
    this.stopLiveMetronome();
    this.state.status = "MIDI panic: stopped preview playback and cleared active notes.";
    this.render({ preserveScroll: true });
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
      this.state.recording = cancelRecordingSession(message);
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
    const inputPreflight = buildRecordingInputPreflight(project);
    if (!inputPreflight.ok) {
      this.state.status = inputPreflight.errors[0] || (armedTracks.length ? "Only one live audio track can be armed for this recording alpha." : "Arm one live audio track before recording.");
      this.render({ preserveScroll: true });
      return;
    }
    const capturePlan = inputPreflight.capturePlan[0];
    const alphaChannelError = nativeRecordingAlphaChannelCompatibilityError(capturePlan);
    if (alphaChannelError) {
      this.state.status = alphaChannelError;
      this.render({ preserveScroll: true });
      return;
    }
    const track = project.tracks.find((item) => item.id === capturePlan.trackId) || armedTracks[0];
    const startBar = Math.max(1, this.state.playheadBar || project.timeline.cursor.bar || 1);
    const sessionId = this.recordingStartToken + 1;
    this.recordingStartToken = sessionId;
    const preRollSeconds = countInSeconds(project);
    const captureStartTransportSeconds = timelineSecondsAtBar(project, startBar);
    const shouldStartBackingPlayback = !this.engine.isPlaying();
    const startupPlan = buildRecordingStartupPlan({
      transportAlreadyPlaying: !shouldStartBackingPlayback,
      countInSeconds: preRollSeconds
    });
    this.state.recording = beginRecordingSession({
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
        const countingIn = transitionRecordingSession({
          recording: this.state.recording,
          sessionId,
          allowedStatuses: ["preparing"],
          patch: {
            status: "count-in",
            trackId: track.id,
            startBar,
            captureStartTransportSeconds,
            message: `Count-in ${Math.max(1, Math.round(preRollSeconds))}s.`
          }
        });
        if (!countingIn) return;
        this.state.recording = countingIn;
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
        inputDeviceId: capturePlan.deviceId || track.inputDeviceId || project.audioDeviceSettings.inputDeviceId,
        outputDeviceId: project.audioDeviceSettings.outputDeviceId,
        monitorEnabled: !!track.monitorEnabled && !track.mute,
        monitorVolume: track.mute ? 0 : track.volume,
        monitorPan: track.pan,
        channelMode: capturePlan.mode === "stereo" ? "stereo" : "mono",
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
      const recording = transitionRecordingSession({
        recording: this.state.recording,
        sessionId,
        allowedStatuses: preRollSeconds > 0 ? ["count-in"] : ["preparing"],
        patch: {
          status: "recording",
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
        }
      });
      if (!recording) return;
      this.state.recording = recording;
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
    const recordingTrack = currentProject(this.state).tracks.find((item) => item.id === trackId);
    const startBar = this.state.recording.startBar || this.state.playheadBar || 1;
    const sessionId = this.state.recording.sessionId ?? this.recordingStartToken;
    const captureStartTransportSeconds = this.state.recording.captureStartTransportSeconds;
    const playbackStartedAtMonotonicMs = this.state.recording.playbackStartedAtMonotonicMs;
    const captureRequestedAtMonotonicMs = this.state.recording.captureRequestedAtMonotonicMs;
    const playbackCaptureAnchor = this.state.recording.playbackCaptureAnchor;
    const timingSource = this.state.recording.timingSource || "ui-transport-boundary-estimate";
    const playbackStopAnchor = await this.engine.nativePlaybackRecordingAnchor("stop-request", monotonicNowMs()).catch(() => null);
    if (!recordingSessionMatches(this.state.recording, sessionId, ["recording", "stopping"])) return;
    const stopping = transitionRecordingSession({
      recording: this.state.recording,
      sessionId,
      allowedStatuses: ["recording", "stopping"],
      patch: {
        playbackStopAnchor,
        status: "stopping",
        message: "Stopping recording and writing WAV..."
      }
    });
    if (!stopping) return;
    this.state.recording = stopping;
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
          ...buildNativeRecordingTakeMetadata({
            recordingSessionId: result.recordingSessionId,
            trackId: result.trackId,
            channelMode: decoded?.channels === 2 || result.channels === 2 ? "stereo" : recordingTrack?.recordingChannelMode
          }),
          latencyCompensationRequestedSeconds: recordingLatencyOffsetSeconds(recordingTrack),
          latencyCompensationMode: "manual-track-offset",
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
      this.state.selectedClipIds = this.state.selectedClipId ? [this.state.selectedClipId] : [];
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
    return timelineSecondsAtBar(project, this.state.playheadBar);
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
      if (isDrumLaneId(lane)) return { kind: "drums", sectionId, lane, step: Number(step) };
    }
    const branchDrum = target?.closest<HTMLElement>("[data-drum-branch-step]");
    if (branchDrum) {
      const [sectionId, lane, step] = String(branchDrum.dataset.drumBranchStep || "").split(":");
      if (isDrumLaneId(lane)) return { kind: "drums", sectionId, lane, step: Number(step) };
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
      if (!sourceDrumLane(selection.lane)) {
        this.state.status = "Branch drum overlay steps do not support tuplets yet.";
        this.render({ preserveScroll: true });
        return;
      }
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
      const sourceLane = sourceDrumLane(selection.lane);
      buttons = findDataElements<HTMLElement>(this.root, sourceLane ? "data-drum-step" : "data-drum-branch-step", `${selection.sectionId}:${selection.lane}:${selection.step}`);
      if (!buttons.length) return false;
      let level = 0;
      let tuplet = false;
      if (sourceDrumLane(selection.lane)) {
        const lane = selection.lane;
        level = section.grid[lane][selection.step] || 0;
        tuplet = !!section.gridTuplets[lane][selection.step];
      } else {
        level = getDrumBranchStepLevel(currentProject(this.state), selection.sectionId, selection.lane, selection.step);
      }
      buttons.forEach((button) => {
        button.className = `${this.stepBaseClass(button)} step-${level} ${tuplet ? "tuplet" : ""} selected-step`;
        button.title = sourceLane
          ? `${this.drumLaneLabel(selection.lane)} step ${selection.step + 1}. Select then press T for tuplet.`
          : `${this.drumLaneLabel(selection.lane)} branch step ${selection.step + 1}. DAW-only source overlay.`;
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
    const selectedClipIds = new Set(this.normalizedSelectedClipIds());
    this.root.querySelectorAll<HTMLElement>("[data-clip-id]").forEach((clip) => {
      clip.classList.toggle("selected", selectedClipIds.has(clip.dataset.clipId || ""));
    });
    this.root.querySelectorAll<HTMLElement>("[data-inline-clip-id]").forEach((clip) => {
      clip.classList.toggle("selected-clip-editor", selectedClipIds.has(clip.dataset.inlineClipId || ""));
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
    return DRUM_LANE_DEFS.find((def) => def.id === lane)?.label || lane;
  }

  private applyProjectState(next: AppState, options: ApplyProjectOptions | boolean = {}) {
    const resolved = this.resolveApplyOptions(options);
    this.state = this.normalizeClipSelection(next);
    const project = currentProject(this.state);
    if (resolved.autosave !== "none") this.saveAutosaveSnapshot(project);
    if (resolved.audio && resolved.audio !== "none") this.engine.syncProject(project, resolved.audio, resolved.reason);
    this.scheduleRender(resolved.render || "immediate", { preserveScroll: resolved.preserveScroll });
  }

  private selectClipFromGesture(clipId: string, trackId: string | null, additive: boolean) {
    const project = currentProject(this.state);
    const clip = project.timeline.clips.find((item) => item.id === clipId);
    if (!clip) return;
    const current = this.normalizedSelectedClipIds();
    let selectedClipIds = [clipId];
    if (additive) {
      selectedClipIds = current.includes(clipId)
        ? current.filter((id) => id !== clipId)
        : [...current, clipId];
      if (!selectedClipIds.length) selectedClipIds = [clipId];
    }
    this.state.selectedClipIds = selectedClipIds;
    this.state.selectedClipId = selectedClipIds.includes(clipId) ? clipId : selectedClipIds[0] || null;
    this.state.selectedTrackId = trackId || clip.trackId || this.state.selectedTrackId;
    this.state.status = selectedClipIds.length > 1 ? `${selectedClipIds.length} clips selected.` : `Selected ${this.state.selectedClipId}.`;
  }

  private normalizedSelectedClipIds(state = this.state): string[] {
    if (!state.selectedClipId) return [];
    const project = currentProject(state);
    const validIds = new Set(project.timeline.clips.map((clip) => clip.id));
    const requested = [state.selectedClipId || "", ...(state.selectedClipIds || [])].filter(Boolean);
    return Array.from(new Set(requested)).filter((id) => validIds.has(id));
  }

  private normalizeClipSelection(state: AppState): AppState {
    const selectedClipIds = this.normalizedSelectedClipIds(state);
    const selectedClipId = state.selectedClipId && selectedClipIds.includes(state.selectedClipId)
      ? state.selectedClipId
      : selectedClipIds[0] || null;
    return {
      ...state,
      selectedClipId,
      selectedClipIds: selectedClipIds.length ? selectedClipIds : selectedClipId ? [selectedClipId] : []
    };
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
    const bar = Math.max(1, Math.min(project.timeline.bars + 1, snapProjectBarValue(project, rawBar, this.state.snapMode)));
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
    const pos = barFloatToDisplayPosition(project, barValue);
    return { bar: `Bar ${pos.bar}`, beat: `Beat ${pos.beat}` };
  }

  private importText(text: string, statusPrefix?: string): boolean {
    try {
      const { project, message } = importTextToProject(text);
      const eventCount = renderTimelineEvents(project).length;
      const recoveryMessage = this.savePreImportRecoverySnapshot(statusPrefix ? "Before PocketHandoff import" : "Before text import");
      this.resetProjectSessionForProjectLoad(project, {
        status: `${statusPrefix || message} ${eventCount} events ready.${recoveryMessage ? ` ${recoveryMessage}` : ""}`,
        currentFile: { path: null, label: project.project.title || "Imported Chordsmith Project" }
      });
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
          waveformPeaks: decoded.waveformPeaks,
          ...audioSourceMetadata(source)
        }
      });
      setCachedAudioBuffer(result.item.id, decoded.buffer, sourceCacheOptions(source));
      let project = result.project;
      const cacheMetadata = await this.persistNativeDecodedAudioCache(result.item.id, source);
      if (cacheMetadata) project = updateMediaPoolItemMetadata(project, result.item.id, cacheMetadata);
      this.applyProjectState(commitProject(this.state, project, `Imported audio ${source.name}.`));
      this.root.querySelector<HTMLElement>("#mediaPool")?.scrollIntoView({ block: "nearest" });
    } catch (error) {
      const nativeDetail = source.nativeDecodeError ? ` Native decoder reported: ${source.nativeDecodeError}` : "";
      const detail = error instanceof Error ? ` ${error.message}` : "";
      this.state.status = `Could not decode ${source.name}.${nativeDetail}${detail}`;
      this.render();
    }
  }

  private async persistNativeDecodedAudioCache(mediaPoolItemId: string, source: ImportedAudioBytes): Promise<JsonObject | null> {
    if (source.mode !== "native" || source.decodedMimeType !== "audio/wav" || source.nativeDecodeError) return null;
    if (!this.state.currentFile.path) return null;
    const relativePath = `project-cache/native-audio/imports/${safeName(`${mediaPoolItemId}-${source.name.replace(/\.[a-z0-9]+$/i, "")}`, "wav")}`;
    try {
      const written = await writeNativeCacheAsset(this.state.currentFile.path, {
        assetId: `decoded-${mediaPoolItemId}`,
        relativePath,
        bytes: source.bytes
      });
      if (!written) return null;
      return {
        nativeDecodedCacheRelativePath: written.relativePath,
        nativeDecodedCachePath: written.path,
        nativeDecodedCacheSizeBytes: written.sizeBytes,
        nativeDecodedCacheKind: "symphonia-import-wav",
        nativeDecodedCacheUpdatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        nativeDecodedCacheError: error instanceof Error ? error.message : "Could not write decoded native audio cache."
      };
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
    const candidates = mediaPoolReloadCandidates(item);
    if (!candidates.length) {
      const status = mediaPoolStatus(item);
      this.state.status = status.missing || status.unresolved
        ? `${item.name} is missing or unresolved. Use Relink.`
        : `${item.name} has no reloadable stored path. Use Relink.`;
      this.render();
      return;
    }
    try {
      this.state.status = `Reloading ${item.name}...`;
      this.render();
      let source: ImportedAudioBytes | null = null;
      let loadedFrom = candidates[0]!;
      const errors: string[] = [];
      for (const candidate of candidates) {
        try {
          const loaded = await loadAudioMediaNative(candidate.path, this.state.currentFile.path);
          if (!loaded) {
            this.state.status = "Native media reload is only available in the installed app.";
            this.render();
            return;
          }
          source = loaded;
          loadedFrom = candidate;
          break;
        } catch (error) {
          errors.push(`${candidate.label}: ${error instanceof Error ? error.message : "reload failed"}`);
        }
      }
      if (!source) {
        throw new Error(errors.join(" | ") || "No reload candidate could be loaded.");
      }
      const decoded = await this.decodeAudioSource(source);
      setCachedAudioBuffer(item.id, decoded.buffer, sourceCacheOptions(source));
      const project = updateAudioMediaReloadAnalysis(currentProject(this.state), item.id, {
        name: item.name,
        uri: item.uri,
        mimeType: source.mimeType || item.mimeType,
        durationSeconds: decoded.durationSeconds,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        sizeBytes: source.sizeBytes,
        waveformPeaks: decoded.waveformPeaks,
        metadata: audioSourceMetadata(source)
      }, loadedFrom);
      this.applyProjectState(commitProject(this.state, project, `Reloaded ${item.name} from ${loadedFrom.label}.${this.mediaPortabilityStatus(project)}`), { audio: "timeline-structure", reason: "reload-media" });
    } catch (error) {
      const project = markMediaPoolItemMissing(currentProject(this.state), item.id, true, error instanceof Error ? error.message : "Reload failed.");
      this.applyProjectState(commitProject(this.state, project, `Could not reload ${item.name}. Use Relink.${this.mediaPortabilityStatus(project)}`), { audio: "none", preserveScroll: true, reason: "reload-media-failed" });
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
        waveformPeaks: decoded.waveformPeaks,
        metadata: audioSourceMetadata(source)
      });
      const cacheMetadata = await this.persistNativeDecodedAudioCache(item.id, source);
      if (cacheMetadata) project = updateMediaPoolItemMetadata(project, item.id, cacheMetadata);
      this.applyProjectState(commitProject(this.state, project, `Relinked ${item.name} to ${source.name}.${this.mediaPortabilityStatus(project)}`), { audio: "timeline-structure", reason: "relink-media" });
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
      const result = importMidiFileToProjectWithPlacement(currentProject(this.state), parsed, source.name, {
        uri: source.uri,
        sizeBytes: source.sizeBytes,
        placementMode: this.state.midiImportPlacementMode
      });
      const clipCount = result.clipIds.length;
      const clipLabel = clipCount === 1 ? "clip" : "clips";
      const importWarnings = Array.isArray(result.item.metadata?.importWarnings) ? result.item.metadata.importWarnings.filter((item) => typeof item === "string") as string[] : [];
      const warningSuffix = importWarnings.length ? ` Warning: ${importWarnings.join(" ")}` : "";
      this.applyProjectState({
        ...commitProject(this.state, result.project, `Imported MIDI ${source.name} as ${clipCount} ${clipLabel} with ${parsed.notes.length} note${parsed.notes.length === 1 ? "" : "s"}.${warningSuffix}`),
        selectedClipId: result.primaryClipId,
        selectedClipIds: result.clipIds.length ? result.clipIds : result.primaryClipId ? [result.primaryClipId] : [],
        selectedTrackId: result.primaryTrackId
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
      this.resetProjectSessionForProjectLoad(project, {
        status: options?.status || `Opened ${label}.`,
        currentFile: { path, label }
      });
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
      const wavProfile = project.exportProfiles.find((profile) => profile.id === "full-song-wav");
      if (!wavProfile) throw new Error("Full Song WAV profile is missing.");
      assertExportProfileSupported(wavProfile, "Full Song WAV");
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
      const blob = await this.renderWavNativeFirst(renderTarget.project, { channelMode: "stereo", bitDepth: 16, dither: "off", normalizePeak: false });
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
      const nextProject = linkFreezeRenderCacheItem(placed.project, {
        sourceClipId: clip.id,
        mediaPoolItemId: media.item.id,
        metadata: {
          storageMode: source.mode,
          projectRelativePath: source.mode === "native" ? source.uri || "" : "",
          renderAction: "freeze-selected-clip"
        }
      });
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
        selectedClipIds: [placed.clipId || clip.id],
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
      const stemProfile = project.exportProfiles.find((profile) => profile.id === "stem-wavs");
      if (!stemProfile) throw new Error("Stem WAVs profile is missing.");
      assertExportProfileSupported(stemProfile, "Stem WAVs");
      const hydration = await this.hydrateTimelineAudioBuffers();
      this.assertNoMissingAudibleAudioBuffers(hydration, "Stem export");
      const result = await createStemZipBlob(project, {
        renderWav: async (renderProject) => this.renderWavNativeFirst(renderProject),
        onProgress: async (label, detail) => this.showExportProgress(label, detail)
      });
      await this.showExportProgress("Preparing stem ZIP download", `${result.entries.length} files, ${Math.round(result.blob.size / 1024)} KB`);
      const saveResult = await saveBlobFileAs(result.blob, safeName(`${project.project.title}-stem-wavs`, "zip"));
      this.state.exportProgress = null;
      this.state.status = saveResult.mode === "cancelled"
        ? "Stem ZIP export cancelled."
        : `Exported ${result.manifest.stems.length} stem WAV${result.manifest.stems.length === 1 ? "" : "s"} as one ZIP archive. ${saveResult.message}`;
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
      const sectionProfile = project.exportProfiles.find((profile) => profile.id === "section-loops");
      if (!sectionProfile) throw new Error("Section Loop WAVs profile is missing.");
      assertExportProfileSupported(sectionProfile, "Section Loop WAVs");
      const result = await createSectionLoopZipBlob(project, {
        renderWav: async (renderProject) => this.renderWavNativeFirst(renderProject),
        onProgress: async (label, detail) => this.showExportProgress(label, detail)
      });
      await this.showExportProgress("Preparing section-loop ZIP download", `${result.entries.length} files, ${Math.round(result.blob.size / 1024)} KB`);
      const saveResult = await saveBlobFileAs(result.blob, safeName(`${project.project.title}-section-loops`, "zip"));
      this.state.exportProgress = null;
      this.state.status = saveResult.mode === "cancelled"
        ? "Section-loop ZIP export cancelled."
        : `Exported ${result.manifest.sectionLoops.length} section loop WAV${result.manifest.sectionLoops.length === 1 ? "" : "s"} as one ZIP archive. ${saveResult.message}`;
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `Section loop export failed: ${error.message}` : "Section loop export failed.";
      this.render({ preserveScroll: true });
    }
  }

  private async exportGamePack(kind: "godot-adaptive-pack" | "web-game-pack", options: { pushToGodot?: boolean } = {}) {
    const project = currentProject(this.state);
    const label = kind === "godot-adaptive-pack" ? "Godot" : "web game";
    try {
      const gamePackProfile = project.exportProfiles.find((profile) => profile.id === kind);
      if (!gamePackProfile) throw new Error(`${label} game pack profile is missing.`);
      assertExportProfileSupported(gamePackProfile, `${label} game pack`);
      await this.showExportProgress(`Preparing ${label} game pack`, "Loading timeline audio files");
      const hydration = await this.hydrateTimelineAudioBuffers();
      this.assertNoMissingAudibleAudioBuffers(hydration, `${label} game-pack export`);
      const result = await createGamePackZipBlob(project, kind, {
        sourceProjectContents: buildPortableGamePackSourceProjectFile(project),
        renderWav: (renderProject) => this.renderWavNativeFirst(renderProject, { channelMode: "stereo", bitDepth: 16, dither: "off", normalizePeak: false }),
        onProgress: (title, detail) => this.showExportProgress(title, detail)
      });
      if (options.pushToGodot && kind === "godot-adaptive-pack") {
        await this.showExportProgress("Pushing Godot game pack", `${result.entries.length} files / ${Math.round(result.blob.size / 1024)} KB`);
        const pushResult = await pushGamePackToGodot({
          blob: result.blob,
          fileName: safeName(`${project.project.title}-${kind}`, "zip"),
          manifest: result.manifest
        });
        if (pushResult.ok) {
          this.state.exportProgress = null;
          this.state.status = `${pushResult.message} ${result.manifest.warnings.length ? `${result.manifest.warnings.length} manifest warning${result.manifest.warnings.length === 1 ? "" : "s"} remain.` : "Run target smoke before release claims."}`;
          this.render({ preserveScroll: true });
          return;
        }
        await this.showExportProgress("Godot push unavailable; saving ZIP", pushResult.message);
        const fallbackSave = await saveBlobFileAs(result.blob, safeName(`${project.project.title}-${kind}`, "zip"));
        this.state.exportProgress = null;
        this.state.status = fallbackSave.mode === "cancelled"
          ? `Godot push unavailable and fallback ZIP save was cancelled. ${pushResult.message}`
          : `Godot push unavailable; saved fallback ZIP. ${pushResult.message} ${fallbackSave.message}`;
        this.render({ preserveScroll: true });
        return;
      }
      await this.showExportProgress(`Preparing ${label} pack download`, `${result.entries.length} files / ${Math.round(result.blob.size / 1024)} KB`);
      const saveResult = await saveBlobFileAs(result.blob, safeName(`${project.project.title}-${kind}`, "zip"));
      this.state.exportProgress = null;
      this.state.status = saveResult.mode === "cancelled"
        ? `${label} game pack export cancelled.`
        : `Exported ${label} game pack ZIP with ${result.entries.length} files${result.manifest.warnings.length ? ` and ${result.manifest.warnings.length} warning${result.manifest.warnings.length === 1 ? "" : "s"}` : ""}. ${saveResult.message}`;
      this.render({ preserveScroll: true });
    } catch (error) {
      this.state.exportProgress = null;
      this.state.status = error instanceof Error ? `${label} game-pack export failed: ${error.message}` : `${label} game-pack export failed.`;
      this.render({ preserveScroll: true });
    }
  }

  private rejectUnsupportedExportProfile(profileId: string, label: string) {
    const profile = currentProject(this.state).exportProfiles.find((item) => item.id === profileId);
    if (!profile) {
      this.state.status = `${label} is not available in this build.`;
      this.render({ preserveScroll: true });
      return;
    }
    const validation = validateExportProfile(profile);
    this.state.status = validation.ok
      ? `${label} is guarded until an export implementation is connected.`
      : validation.errors.join(" ");
    this.render({ preserveScroll: true });
  }

  private async renderWavNativeFirst(project: PocketDawProject, options: { channelMode?: WavChannelMode; bitDepth?: WavBitDepth; dither?: WavDitherMode; normalizePeak?: boolean } = {}): Promise<Blob> {
    return await renderProjectToNativeWavBlob(project, undefined, options) || await renderProjectToWavBlob(project, options);
  }

  private mediaPortabilityStatus(project: PocketDawProject): string {
    const portability = verifyMediaPortability(project);
    if (portability.embeddedSourceProjectPortable) return " Media portability: embedded source project is portable.";
    const details = [
      `${portability.needsCollectionOrRelinkCount} item${portability.needsCollectionOrRelinkCount === 1 ? "" : "s"} need collection or relink`,
      portability.cacheOnlyCount ? `${portability.cacheOnlyCount} cache-only` : "",
      portability.runtimeOnlyCount ? `${portability.runtimeOnlyCount} runtime-only` : "",
      portability.missingOrUnresolvedCount ? `${portability.missingOrUnresolvedCount} missing or unresolved` : ""
    ].filter(Boolean);
    return ` Media portability: ${details.join(", ")}.`;
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
      this.state.status = `Collected ${collected.length} media item${collected.length === 1 ? "" : "s"} into project-media and saved project refs.${this.mediaPortabilityStatus(currentProject(this.state))}`;
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
    let project = currentProject(this.state);
    let repairedProjectMetadata = false;
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
      const candidates = item ? mediaPoolReloadCandidates(item) : [];
      if (!item || !candidates.length) {
        missing.push(id);
        continue;
      }
      let hydrated = false;
      for (const candidate of candidates) {
        try {
          const source = await loadAudioMediaNative(candidate.path, this.state.currentFile.path);
          if (!source) {
            missing.push(item.name || id);
            hydrated = true;
            break;
          }
          const decoded = await this.decodeAudioSource(source);
          setCachedAudioBuffer(id, decoded.buffer, sourceCacheOptions(source));
          project = updateAudioMediaReloadAnalysis(project, id, {
            name: item.name,
            uri: item.uri,
            mimeType: source.mimeType || item.mimeType,
            durationSeconds: decoded.durationSeconds,
            sampleRate: decoded.sampleRate,
            channels: decoded.channels,
            sizeBytes: source.sizeBytes,
            waveformPeaks: decoded.waveformPeaks,
            metadata: audioSourceMetadata(source)
          }, candidate);
          repairedProjectMetadata = true;
          loaded += 1;
          hydrated = true;
          break;
        } catch {
          // Try the next candidate, such as a decoded native cache when the original source moved.
        }
      }
      if (!hydrated) {
        missing.push(item.name || id);
      }
    }
    if (repairedProjectMetadata) {
      this.state = {
        ...this.state,
        undoStack: replacePresent(this.state.undoStack, project)
      };
      this.saveAutosaveSnapshot(project);
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
    const project = createDemoProject();
    this.resetProjectSessionForProjectLoad(project, {
      status,
      currentFile: { path: null, label: "Editable demo copy" }
    });
    this.saveAutosaveSnapshot(project);
    this.render();
  }

  private newProject() {
    const project = createEmptyPocketDawProject();
    project.project.title = "Untitled Project";
    this.resetProjectSessionForProjectLoad(project, {
      status: "New project created from the starter template.",
      currentFile: { path: null, label: "Untitled project" }
    });
    this.saveAutosaveSnapshot(project);
    this.render();
  }

  private saveAutosaveSnapshot(project = currentProject(this.state)) {
    saveAutosave(buildPocketDawProjectFile(project), this.state.currentFile);
  }

  private resetProjectSessionForProjectLoad(project: PocketDawProject, options: LoadProjectIntoStateOptions) {
    this.engine.stop();
    this.stopLiveMetronome();
    this.cancelNativeInputForProjectReset();
    this.state = loadProjectIntoState(this.state, project, options);
    this.engine.setProject(project);
  }

  private cancelNativeInputForProjectReset() {
    const shouldStopCapture = this.state.recording.status === "recording" || this.state.recording.status === "stopping";
    this.recordingStartToken += 1;
    this.inputPreviewKey = null;
    this.stopRecordingTimer();
    if (isNativeRecordingAvailable()) {
      if (shouldStopCapture) void stopNativeRecording().catch(() => {});
      void stopNativeRecordingPreview().catch(() => {});
    }
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

function audioSourceMetadata(source: ImportedAudioBytes): JsonObject {
  const metadata: JsonObject = {};
  if (source.sourceMimeType) metadata.sourceMimeType = source.sourceMimeType;
  if (source.sourceSizeBytes) metadata.sourceSizeBytes = source.sourceSizeBytes;
  if (source.sourceEncoding) metadata.sourceEncoding = source.sourceEncoding;
  if (source.decodedMimeType) metadata.decodedMimeType = source.decodedMimeType;
  if (source.decodedSizeBytes) metadata.decodedSizeBytes = source.decodedSizeBytes;
  if (source.sampleRate) metadata.nativeDecodedSampleRate = source.sampleRate;
  if (source.channels) metadata.nativeDecodedChannels = source.channels;
  if (source.durationSeconds) metadata.nativeDecodedDurationSeconds = source.durationSeconds;
  if (source.frameCount) metadata.nativeDecodedFrameCount = source.frameCount;
  if (source.decoder) metadata.nativeDecoder = source.decoder;
  if (source.nativeDecodeError) metadata.nativeDecodeError = source.nativeDecodeError;
  metadata.nativeDecoded = source.mode === "native" && source.decodedMimeType === "audio/wav" && !source.nativeDecodeError;
  return metadata;
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

function audioClipActionInput(value: unknown): AudioClipAction {
  if (
    value === "normalize-gain" ||
    value === "reset-fades" ||
    value === "quick-fade" ||
    value === "crossfade-overlap" ||
    value === "create-crossfade-left" ||
    value === "invert-phase" ||
    value === "reverse" ||
    value === "analyze-transients" ||
    value === "create-warp-markers" ||
    value === "quantize-warp-markers" ||
    value === "quantize-warp-markers-1/4" ||
    value === "quantize-warp-markers-1/8" ||
    value === "quantize-warp-markers-1/16" ||
    value === "quantize-warp-markers-1/32" ||
    value === "apply-warp-varispeed" ||
    value === "clear-warp-markers"
  ) {
    return value;
  }
  throw new Error(`Unsupported audio clip action: ${String(value || "[missing action]")}`);
}

function midiQuantizeGridInput(value: unknown): MidiQuantizeGrid {
  if (value === "1/4" || value === "1/8" || value === "1/16" || value === "1/32") return value;
  throw new Error(`Unsupported MIDI quantize grid: ${String(value || "[missing grid]")}`);
}

function midiSwingPercentInput(value: unknown): MidiSwingPercent {
  const percent = Number(value);
  if (percent === 50 || percent === 55 || percent === 60 || percent === 65) return percent;
  throw new Error(`Unsupported MIDI swing percent: ${String(value || "[missing percent]")}`);
}

function midiGrooveTemplateInput(value: unknown): MidiGrooveTemplateId {
  if (value === "straight-16" || value === "pocket-16" || value === "shuffle-8") return value;
  throw new Error(`Unsupported MIDI groove template: ${String(value || "[missing template]")}`);
}

function midiVelocityTransformInput(value: unknown): MidiVelocityTransform {
  if (value === "level-96" || value === "humanize-12") return value;
  throw new Error(`Unsupported MIDI velocity transform: ${String(value || "[missing transform]")}`);
}

function midiPitchTransformInput(value: unknown): MidiPitchTransform {
  if (value === "semitone-down" || value === "semitone-up" || value === "octave-down" || value === "octave-up") return value;
  throw new Error(`Unsupported MIDI pitch transform: ${String(value || "[missing transform]")}`);
}

function isClipAutomationField(value: string): value is ClipAutomationField {
  return value === "gain" || value === "fadeInSeconds" || value === "fadeOutSeconds" || value === "sourceOffsetSeconds";
}

function numberInput(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

function recordingInputChannelValueFromLiveCommand(command: Extract<AiBridgeLiveCommand, { type: "set_recording_input_channel" }>): string {
  if (command.mode === "stereo") {
    const pair = Array.isArray(command.channelPair) ? command.channelPair : [0, 1];
    return `stereo:${Math.max(0, Math.floor(Number(pair[0]) || 0))}:${Math.max(0, Math.floor(Number(pair[1]) || 1))}`;
  }
  if (command.mode === "split-mono") return `split-mono:${Math.max(0, Math.floor(Number(command.channelIndex) || 0))}`;
  return `mono:${Math.max(0, Math.floor(Number(command.channelIndex) || 0))}`;
}

function createAiBridgeExportReadiness(project: PocketDawProject) {
  const stems = createStemExportPlan(project);
  const sectionLoops = createSectionLoopMetadata(project);
  const godot = createGameExportManifest(project, "godot-adaptive-pack");
  const web = createGameExportManifest(project, "web-game-pack");
  return {
    stemCount: stems.length,
    sectionLoopCount: sectionLoops.length,
    deliveryTargets: createGamePackDeliveryTargets(),
    gamePacks: {
      godot: compactGamePackStatus(godot),
      web: compactGamePackStatus(web)
    }
  };
}

function compactGamePackStatus(manifest: ReturnType<typeof createGameExportManifest>) {
  return {
    kind: manifest.kind,
    manifestFile: manifest.manifestFile,
    fullMix: manifest.fullMix,
    sourceProject: manifest.sourceProject,
    fileCount: manifest.files.length,
    stemCount: manifest.stems.length,
    sectionLoopCount: manifest.sectionLoops.length,
    markerCount: manifest.markers.length,
    warningCount: manifest.warnings.length,
    warnings: manifest.warnings
  };
}

function createAiBridgeMediaReadiness(project: PocketDawProject) {
  const statuses = project.mediaPool.map((item) => mediaPoolStatus(item));
  return {
    poolCount: project.mediaPool.length,
    projectMediaCount: statuses.filter((status) => !status.external && !status.runtimeOnly && !status.missing && !status.unresolved).length,
    externalReferenceCount: statuses.filter((status) => status.external).length,
    runtimeOnlyCount: statuses.filter((status) => status.runtimeOnly).length,
    missingCount: statuses.filter((status) => status.missing || status.unresolved).length,
    audioTakes: createAudioTakeDiagnosticsSummary(project),
    midiChordsmithConversionPreviews: createMidiChordsmithConversionPreviews(project)
  };
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

function sourceDrumLane(lane: string): lane is "kick" | "snare" | "hat" {
  return lane === "kick" || lane === "snare" || lane === "hat";
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

function midiImportPlacementModeFromValue(value: string): MidiImportPlacementMode {
  if (value === "per-source-track" || value === "per-channel" || value === "drum-channel-split") return value;
  return "single-clip";
}

function midiImportPlacementModeLabel(mode: MidiImportPlacementMode): string {
  if (mode === "per-source-track") return "source tracks";
  if (mode === "per-channel") return "channels";
  if (mode === "drum-channel-split") return "drum channel split";
  return "single clip";
}

function midiConversionSourceFilterFromValue(value: string) {
  if (value === "all") return normalizeMidiConversionSourceFilter("all", null);
  const [mode, rawValue] = value.split(":");
  return normalizeMidiConversionSourceFilter(mode, rawValue);
}

const ACTION_BUTTON_TOOLTIPS: Record<string, string> = {
  ...FUNCTION_ACTION_TOOLTIPS,
  "add-bus-track": "Add a bus track for grouped routing.",
  "add-return-track": "Add a return track for send effects.",
  "add-track-close": "Close the add track panel.",
  "add-track-open": "Open the add track panel.",
  "audio-settings-close": "Close audio settings.",
  "audio-settings-open": "Open audio input, output and recording settings.",
  "audio-take-comp-from-playhead": "Create a take comp starting at the playhead.",
  "audio-take-comp-range": "Use the selected take only inside the active edit range.",
  "build-native-cache": "Render generated and runtime audio into the native cache.",
  "clip-copy": "Copy the selected clip or selected clip group to the clipboard.",
  "clip-cut": "Cut the selected clip or selected clip group to the clipboard.",
  "clip-delete": "Delete the selected clip or selected clip group.",
  "clip-duplicate": "Duplicate the selected clip or selected clip group after the selected span.",
  "clip-left": "Move the selected clip or selected clip group one snap step earlier.",
  "clip-mute": "Mute or unmute the selected clip or selected clip group without deleting it.",
  "clip-paste": "Paste the copied clip at the cursor.",
  "clip-right": "Move the selected clip or selected clip group one snap step later.",
  "clip-split": "Split the selected clip at the playhead.",
  "collect-media": "Copy reloadable external media beside the saved project.",
  "controls-close": "Close controls.",
  "controls-open": "Open controls and diagnostics.",
  "export-diagnostics": "Export a diagnostics JSON snapshot.",
  "export-godot-manifest": "Export a WAV-based adaptive audio pack for Godot.",
  "export-media-plan": "Export a JSON plan for collecting project media.",
  "export-midi": "Export the full project MIDI arrangement.",
  "export-section-manifest": "Download a ZIP of generated section loops and manifest.",
  "export-selected-clip-midi": "Export the selected clip as a MIDI file.",
  "export-selected-track-midi": "Export all MIDI-capable clips on this track.",
  "export-stems": "Download a ZIP of stem WAV files and manifest.",
  "export-wav": "Render the full mix as a WAV file.",
  "export-web-game-manifest": "Export a WAV-based adaptive audio pack for web games.",
  "feedback-close": "Close feedback notes.",
  "feedback-open": "Open feedback notes.",
  "file-window-close": "Close the file panel.",
  "file-window-open": "Open imports, exports and project file actions.",
  "freeze-selected-clip": "Render the selected clip into a reusable audio asset.",
  "function-guide-close": "Close the Pocket DAW function guide.",
  "function-guide-open": "Open the Pocket DAW function guide.",
  "game-state-marker-add": "Add a game-state cue marker at the playhead.",
  "import-audio": "Import an audio file into the media pool.",
  "import-focus": "Open the import area.",
  "import-midi": "Import a MIDI file as MIDI clips.",
  "import-text": "Import pasted Pocket Chordsmith, Pocket DJ or Pocket DAW text.",
  "load-demo": "Load the editable demo project.",
  "loop-clear": "Clear the active loop region.",
  "loop-selected": "Set the loop region to the selected clip.",
  "marker-add": "Add a timeline marker at the playhead.",
  "media-pool-focus": "Scroll to the media pool.",
  "metronome-toggle": "Toggle metronome and recording count-in.",
  "midi-panic": "Stop preview playback and clear stuck notes.",
  "new-project": "Start a new unsaved project.",
  "open-file": "Open a supported project, audio or MIDI file.",
  "open-project": "Open a .pocketdaw project.",
  "pause": "Pause playback.",
  "play": "Start playback.",
  "preset-game-music": "Keep timeline/game cues prominent, open game-pack export controls, and tuck inspector detail away.",
  "preset-music": "Keep the timeline primary and tuck deeper edit, mix, media and game-export surfaces away.",
  "push-godot-pack": "Try a local Godot receiver first, then save the ZIP if unavailable.",
  "range-clear": "Clear the active edit range.",
  "range-copy": "Copy the selected clip material inside the active edit range.",
  "range-crop": "Keep only the active edit range.",
  "range-cut": "Cut the selected clip material inside the active edit range.",
  "range-delete": "Delete material inside the active edit range.",
  "range-loop": "Set the active edit range to the current loop.",
  "range-ripple-all": "Delete the active range and close the gap across all tracks.",
  "range-ripple-delete": "Delete the active range and close the gap on selected tracks.",
  "range-selected": "Use the selected clip as the edit range.",
  "range-split": "Split clips at the edit range boundaries.",
  "record-toggle": "Start or stop recording on the armed track.",
  "redo": "Redo the last undone edit.",
  "reset-demo-template": "Reload the demo template.",
  "restart": "Restart playback from the beginning.",
  "save-project": "Save the current .pocketdaw project.",
  "save-project-as": "Save this project to a new .pocketdaw file.",
  "seek-start": "Move the playhead to Bar 1.",
  "stop": "Stop playback.",
  "toggle-inspector": "Show or hide the selected clip and track inspector.",
  "toggle-ui-section": "Show or hide this UI section.",
  "trim-end-left": "Move the clip end earlier by one snap step.",
  "trim-end-right": "Move the clip end later by one snap step.",
  "trim-start-left": "Move the clip start earlier by one snap step.",
  "trim-start-right": "Move the clip start later by one snap step.",
  "undo": "Undo the last edit.",
  "updater-close": "Close updater status.",
  "updater-open": "Open updater status.",
  "zoom-in": "Zoom the timeline in.",
  "zoom-out": "Zoom the timeline out."
};

const AUDIO_CLIP_ACTION_TOOLTIPS: Record<string, string> = {
  "analyze-transients": "Analyze likely transient points in this audio clip.",
  "clear-warp-markers": "Clear metadata warp markers from this audio clip.",
  "create-crossfade-left": "Create an overlap fade at the left edge of this audio clip.",
  "create-warp-markers": "Create metadata warp markers from analyzed transients.",
  "crossfade-overlap": "Create a crossfade with an overlapping neighboring clip.",
  "invert-phase": "Invert this audio clip's phase.",
  "normalize-gain": "Set clip gain from the analyzed peak level.",
  "apply-warp-varispeed": "Apply a source-safe global varispeed rate from warp markers.",
  "quick-fade": "Apply short fade in and fade out to this audio clip.",
  "quantize-warp-markers": "Snap warp marker targets to the 1/16 grid as metadata.",
  "reset-fades": "Clear this audio clip's fades.",
  reverse: "Reverse this audio clip nondestructively."
};

function tooltipForButton(button: HTMLButtonElement): string {
  const ariaLabel = button.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const action = button.dataset.action || "";
  if (action) return ACTION_BUTTON_TOOLTIPS[action] || fallbackButtonTooltip(button, action);

  const audioAction = dataTokenSuffix(button.dataset.audioClipAction || "");
  if (audioAction) return AUDIO_CLIP_ACTION_TOOLTIPS[audioAction] || fallbackButtonTooltip(button, audioAction);

  const addTrackKind = button.dataset.addTrackKind || "";
  if (addTrackKind) return `Add or select ${readableDataToken(addTrackKind)}.`;

  if (button.dataset.audioTakeActivate) return "Make this take active.";
  if (button.dataset.audioTakeLaneActivate) return "Activate this whole take lane.";
  if (button.dataset.audioTakeArchive) return "Archive this take without deleting source media.";
  if (button.dataset.audioTakeRestore) return "Restore this archived take.";
  if (button.dataset.armTrack) return "Arm or disarm this track for recording.";
  if (button.dataset.monitorTrack) return "Toggle input monitoring for this track.";
  if (button.dataset.fxToggle || button.dataset.drumLaneFxToggle) return "Enable or bypass this effect slot.";
  if (button.dataset.fxRemove || button.dataset.drumLaneFxRemove) return "Remove this effect slot.";
  if (button.dataset.midiQuantize) return "Quantize notes in this MIDI clip.";
  if (button.dataset.midiSwing) return "Apply swing timing to this MIDI clip.";
  if (button.dataset.midiGroove) return "Apply a groove template to this MIDI clip.";
  if (button.dataset.midiVelocityTransform) return "Apply a velocity edit to this MIDI clip.";
  if (button.dataset.midiPitchTransform) return "Apply a pitch edit to this MIDI clip.";
  if (button.dataset.midiNoteAdd) return "Add a MIDI note at the playhead.";
  if (button.dataset.midiControllerAdd) return "Add a MIDI controller event.";
  if (button.dataset.midiProgramAdd) return "Add a MIDI program change.";
  if (button.dataset.midiPitchBendAdd) return "Add a MIDI pitch-bend event.";
  if (button.dataset.midiAftertouchAdd) return "Add a MIDI aftertouch event.";
  if (button.dataset.midiNoteDelete || button.dataset.midiControllerDelete || button.dataset.midiProgramDelete || button.dataset.midiPitchBendDelete || button.dataset.midiAftertouchDelete) return "Delete this MIDI event.";
  if (button.dataset.midiNoteDuplicate || button.dataset.midiControllerDuplicate || button.dataset.midiProgramDuplicate || button.dataset.midiPitchBendDuplicate || button.dataset.midiAftertouchDuplicate) return "Duplicate this MIDI event.";
  if (button.dataset.midiNoteMove) return "Move this MIDI note earlier or later.";
  if (button.dataset.midiNotePitch) return "Move this MIDI note up or down.";
  if (button.dataset.midiNoteDuration) return "Shorten or lengthen this MIDI note.";
  if (button.dataset.clipAutomationCreate || button.dataset.automationCreate || button.dataset.sendAutomationCreate || button.dataset.projectAutomationCreate || button.dataset.fxAutomationCreate) return "Create this automation lane.";
  if (button.dataset.clipAutomationAddPoint || button.dataset.automationAddPoint || button.dataset.sendAutomationAddPoint || button.dataset.projectAutomationAddPoint || button.dataset.fxAutomationAddPoint) return "Add an automation point at the playhead.";
  if (button.dataset.automationDeletePoint || button.dataset.projectMeterMapDelete) return "Delete this automation point.";
  if (button.dataset.stepPage) return "Move through this step editor page.";
  if (button.dataset.placeAudio) return "Place this media item on the timeline.";
  if (button.dataset.reloadMedia) return "Reload this media item from its source path.";
  if (button.dataset.relinkMedia) return "Relink this missing media item.";
  if (button.dataset.markerRename) return "Rename this marker.";
  if (button.dataset.trackRename) return "Rename this track.";

  return fallbackButtonTooltip(button);
}

function liveCommandAudioSyncMode(command: AiBridgeLiveCommand): AudioProjectSyncMode {
  if (
    command.type === "activate_audio_take_lane" ||
    command.type === "set_audio_take_archived" ||
    command.type === "comp_audio_take_from_bar" ||
    command.type === "comp_audio_take_range" ||
    command.type === "split_timeline_selection" ||
    command.type === "crop_clip_to_timeline_selection" ||
    command.type === "delete_clip_range" ||
    command.type === "ripple_delete_clip_range" ||
    command.type === "ripple_delete_timeline_selection" ||
    command.type === "apply_audio_clip_action" ||
    command.type === "set_audio_warp_marker_target" ||
    command.type === "delete_audio_warp_marker" ||
    command.type === "quantize_midi_clip" ||
    command.type === "quantize_midi_durations" ||
    command.type === "swing_midi_clip" ||
    command.type === "apply_midi_groove" ||
    command.type === "transform_midi_velocity" ||
    command.type === "transform_midi_pitch" ||
    command.type === "place_punch_recording_clip_from_range"
  ) {
    return "timeline-structure";
  }
  if (
    command.type === "set_punch_range" ||
    command.type === "set_timeline_selection" ||
    command.type === "set_timeline_selection_to_clip" ||
    command.type === "clear_timeline_selection"
  ) {
    return "transport-controls";
  }
  return "mixer-graph";
}

function dataTokenSuffix(value: string): string {
  return value.split(":").filter(Boolean).pop() || "";
}

function readableDataToken(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\s+/g, " ").trim();
}

function fallbackButtonTooltip(button: HTMLButtonElement, token?: string): string {
  const text = button.textContent?.replace(/\s+/g, " ").trim();
  if (text) return text;
  const readable = token ? readableDataToken(token) : "";
  return readable ? `Run ${readable}.` : "Button";
}

function sectionLabelForStatus(section: string): string {
  if (section === "timeline-tools") return "Timeline tools";
  if (section === "inspector-clip") return "Inspector clip section";
  if (section === "inspector-track") return "Inspector track section";
  if (section === "lower-dock") return "Lower dock";
  if (section === "media-pool") return "Media pool";
  return "UI section";
}

function monotonicNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
