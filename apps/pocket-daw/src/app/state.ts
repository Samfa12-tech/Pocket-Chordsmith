import { createDemoProject } from "../demo/demoProject";
import type { PocketDawProject } from "../daw/schema";
import type { Clip } from "../daw/schema";
import { POCKET_DAW_VERSION } from "../daw/schema";
import type { SnapMode } from "../daw/timeline";
import { createUndoStack, type UndoStack } from "../daw/undo";
import type { ProjectFileState } from "../native/fileBridge";
import type { PocketHandoffKind, PocketHandoffSource } from "../native/pocketHandoff";
import type { RecentProject } from "../native/recentFiles";
import type { UpdaterState } from "../native/updaterBridge";
import { defaultAiBridgeUiStatus, type AiBridgeUiStatus } from "../native/aiBridge";
import type { DrumLaneId } from "../daw/drumLanes";
import type { MidiConversionSourceMode } from "../daw/midiConversionFilter";
import type { MidiImportPlacementMode } from "../daw/midiClips";

export type ChordsmithStepSelection =
  | { kind: "drums"; sectionId: string; lane: DrumLaneId; step: number }
  | { kind: "bass"; sectionId: string; step: number }
  | { kind: "melody"; sectionId: string; trackIndex: number; step: number };

export interface AppState {
  undoStack: UndoStack<PocketDawProject>;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  selectedTrackId: string | null;
  cursorBar: number;
  snapMode: SnapMode;
  clipClipboard: Clip | null;
  clipClipboardGroup?: Clip[] | null;
  zoom: number;
  timelineHeightPx: number;
  inspectorVisible: boolean;
  inspectorWidthPx: number;
  uiCreationPreset: UiCreationPreset;
  collapsedUiSections: UiCollapsedSections;
  lowerDockTab: LowerDockTab;
  status: string;
  playing: boolean;
  playheadBar: number;
  meterLevels: Record<string, number>;
  importText: string;
  midiImportPlacementMode: MidiImportPlacementMode;
  midiConversionSourceMode: MidiConversionSourceMode;
  midiConversionSourceValue: number | null;
  midiConversionKeepRawReference: boolean;
  currentFile: ProjectFileState;
  busyMessage: string | null;
  exportProgress: { message: string; detail?: string } | null;
  recent: RecentProject[];
  showFilePanel: boolean;
  showControls: boolean;
  showAddTrack: boolean;
  showAudioSettings: boolean;
  showUpdaterPanel: boolean;
  showMcpSetupPanel: boolean;
  showFunctionGuidePanel: boolean;
  showFeedbackPanel: boolean;
  aiBridge: AiBridgeUiStatus;
  feedbackText: string;
  updaterStatus: UpdaterState;
  updaterMessage: string;
  updaterCurrentVersion: string;
  updaterAvailableVersion: string | null;
  updaterReleaseNotes: string | null;
  updaterDownloadProgress: number | null;
  updaterAutoCheckOnStartup: boolean;
  audioProbeStatus: string;
  chordsmithEditorFollowClip: boolean;
  chordsmithEditorSectionId: string;
  chordsmithEditorMelodyTrackIndex: number;
  chordsmithEditorStepPage: number;
  chordsmithStepSelection: ChordsmithStepSelection | null;
  nativeCacheStatus: NativeCacheUiStatus;
  lastHandoff: HandoffStatus;
  recording: RecordingUiState;
}

export type LowerDockTab = "mixer" | "inserts" | "sends" | "automation" | "piano-roll" | "audio-editor" | "export-details";
export type UiCreationPreset = "music" | "game-music";
export const UI_COLLAPSE_SECTIONS = ["timeline-tools", "inspector-clip", "inspector-track", "lower-dock", "media-pool"] as const;
export type UiCollapseSection = typeof UI_COLLAPSE_SECTIONS[number];
export type UiCollapsedSections = Record<UiCollapseSection, boolean>;

export type HandoffResult = "not-received" | "imported" | "ignored" | "failed-parse";
export type HandoffStatusSource = PocketHandoffSource | "project-file";

export interface HandoffStatus {
  source: HandoffStatusSource | null;
  result: HandoffResult;
  kind: PocketHandoffKind | null;
  receivedAt: string | null;
  message: string;
}

export interface NativeCacheUiStatus {
  assetRegionCount: number;
  cachedClipCount: number;
  generatedRegionCount: number;
  runtimeAudioRegionCount: number;
  proceduralFallbackEventCount: number;
  buildPending: boolean;
  prewarmScheduled: boolean;
  bypassedForLiveEdits: boolean;
  lastBuildReason: string | null;
  lastError: string | null;
  generatedStemRenderFailureCount: number;
  lastGeneratedStemRenderError: string | null;
}

export interface RecordingUiState {
  status: "idle" | "preparing" | "count-in" | "recording" | "stopping" | "error";
  sessionId?: number | null;
  trackId: string | null;
  startedAt: string | null;
  startBar: number | null;
  captureStartTransportSeconds?: number | null;
  playbackStartedAtMonotonicMs?: number | null;
  captureRequestedAtMonotonicMs?: number | null;
  playbackCaptureAnchor?: RecordingNativePlaybackAnchor | null;
  playbackStopAnchor?: RecordingNativePlaybackAnchor | null;
  timingSource?: string | null;
  elapsedSeconds: number;
  inputPeak: number;
  inputDeviceName: string | null;
  outputDeviceName: string | null;
  monitoring: boolean;
  livePeaks: number[];
  message: string;
}

export interface RecordingNativePlaybackAnchor {
  source: string;
  snapshotMonotonicMs: number | null;
  active: boolean;
  playing: boolean;
  positionSeconds: number | null;
  renderedFrameCount: number | null;
  startedGeneration: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export const RECORDING_READY_MESSAGE = "Ready to record one armed live track.";

export function createNativeCacheUiStatus(overrides: Partial<NativeCacheUiStatus> = {}): NativeCacheUiStatus {
  return {
    assetRegionCount: 0,
    cachedClipCount: 0,
    generatedRegionCount: 0,
    runtimeAudioRegionCount: 0,
    proceduralFallbackEventCount: 0,
    buildPending: false,
    prewarmScheduled: false,
    bypassedForLiveEdits: false,
    lastBuildReason: null,
    lastError: null,
    generatedStemRenderFailureCount: 0,
    lastGeneratedStemRenderError: null,
    ...overrides
  };
}

export function createRecordingUiState(overrides: Partial<RecordingUiState> = {}): RecordingUiState {
  return {
    status: "idle",
    sessionId: null,
    trackId: null,
    startedAt: null,
    startBar: null,
    captureStartTransportSeconds: null,
    playbackStartedAtMonotonicMs: null,
    captureRequestedAtMonotonicMs: null,
    playbackCaptureAnchor: null,
    playbackStopAnchor: null,
    timingSource: null,
    elapsedSeconds: 0,
    inputPeak: 0,
    inputDeviceName: null,
    outputDeviceName: null,
    monitoring: false,
    livePeaks: [],
    message: RECORDING_READY_MESSAGE,
    ...overrides
  };
}

export function recordingSessionMatches(
  recording: RecordingUiState,
  sessionId: number,
  allowedStatuses: RecordingUiState["status"][]
): boolean {
  return recording.sessionId === sessionId && allowedStatuses.includes(recording.status);
}

export interface LoadProjectIntoStateOptions {
  status: string;
  currentFile?: ProjectFileState;
  clearImportText?: boolean;
}

export function createInitialState(): AppState {
  const project = createDemoProject();
  return {
    undoStack: createUndoStack(project),
    selectedClipId: project.timeline.clips[0]?.id || null,
    selectedClipIds: project.timeline.clips[0]?.id ? [project.timeline.clips[0].id] : [],
    selectedTrackId: "drums",
    cursorBar: 1,
    snapMode: "bar",
    clipClipboard: null,
    clipClipboardGroup: null,
    zoom: 240,
    timelineHeightPx: 620,
    inspectorVisible: false,
    inspectorWidthPx: 420,
    uiCreationPreset: "music",
    collapsedUiSections: createUiCollapsedSections({
      "timeline-tools": true,
      "lower-dock": false,
      "media-pool": true
    }),
    lowerDockTab: "mixer",
    status: "Editable demo copy loaded. Edits autosave to this copy.",
    playing: false,
    playheadBar: 1,
    meterLevels: {},
    importText: "",
    midiImportPlacementMode: "single-clip",
    midiConversionSourceMode: "all",
    midiConversionSourceValue: null,
    midiConversionKeepRawReference: true,
    currentFile: { path: null, label: "Editable demo copy" },
    busyMessage: null,
    exportProgress: null,
    recent: [],
    showFilePanel: false,
    showControls: false,
    showAddTrack: false,
    showAudioSettings: false,
    showUpdaterPanel: false,
    showMcpSetupPanel: false,
    showFunctionGuidePanel: false,
    showFeedbackPanel: false,
    aiBridge: defaultAiBridgeUiStatus(),
    feedbackText: "",
    updaterStatus: "idle",
    updaterMessage: "Updates not checked yet.",
    updaterCurrentVersion: POCKET_DAW_VERSION,
    updaterAvailableVersion: null,
    updaterReleaseNotes: null,
    updaterDownloadProgress: null,
    updaterAutoCheckOnStartup: true,
    audioProbeStatus: "Audio devices not probed yet.",
    chordsmithEditorFollowClip: true,
    chordsmithEditorSectionId: "A",
    chordsmithEditorMelodyTrackIndex: 0,
    chordsmithEditorStepPage: 0,
    chordsmithStepSelection: null,
    nativeCacheStatus: createNativeCacheUiStatus(),
    lastHandoff: {
      source: null,
      result: "not-received",
      kind: null,
      receivedAt: null,
      message: "No Pocket DAW handoff received yet."
    },
    recording: createRecordingUiState()
  };
}

export function createUiCollapsedSections(overrides: Partial<UiCollapsedSections> = {}): UiCollapsedSections {
  return {
    "timeline-tools": false,
    "inspector-clip": false,
    "inspector-track": false,
    "lower-dock": false,
    "media-pool": false,
    ...overrides
  };
}

export function collapsedSectionsForCreationPreset(preset: UiCreationPreset): UiCollapsedSections {
  if (preset === "game-music") {
    return createUiCollapsedSections({
      "timeline-tools": true,
      "inspector-clip": true
    });
  }
  return createUiCollapsedSections({
    "timeline-tools": true,
    "media-pool": true
  });
}

export function lowerDockTabForCreationPreset(preset: UiCreationPreset, current: LowerDockTab): LowerDockTab {
  if (preset === "game-music") return "export-details";
  return current === "export-details" ? "mixer" : current;
}

export function isUiCollapseSection(value: string): value is UiCollapseSection {
  return UI_COLLAPSE_SECTIONS.includes(value as UiCollapseSection);
}

export function isUiSectionCollapsed(state: AppState, section: UiCollapseSection): boolean {
  return state.collapsedUiSections?.[section] === true;
}

export function currentProject(state: AppState): PocketDawProject {
  return state.undoStack.present;
}

export function loadProjectIntoState(
  state: AppState,
  project: PocketDawProject,
  options: LoadProjectIntoStateOptions
): AppState {
  const selectedClip = project.timeline.clips.find((clip) => project.tracks.some((track) => track.id === clip.trackId)) || project.timeline.clips[0] || null;
  return {
    ...state,
    undoStack: createUndoStack(project),
    selectedClipId: selectedClip?.id || null,
    selectedClipIds: selectedClip?.id ? [selectedClip.id] : [],
    selectedTrackId: preferredTrackId(project),
    cursorBar: 1,
    status: options.status,
    playing: false,
    playheadBar: 1,
    meterLevels: {},
    clipClipboardGroup: null,
    importText: options.clearImportText === false ? state.importText : "",
    midiImportPlacementMode: state.midiImportPlacementMode,
    midiConversionSourceMode: state.midiConversionSourceMode,
    midiConversionSourceValue: state.midiConversionSourceValue,
    midiConversionKeepRawReference: state.midiConversionKeepRawReference,
    currentFile: options.currentFile || { path: null, label: project.project.title || "Untitled project" },
    busyMessage: null,
    exportProgress: null,
    nativeCacheStatus: createNativeCacheUiStatus(),
    chordsmithEditorStepPage: 0,
    chordsmithStepSelection: null,
    recording: createRecordingUiState()
  };
}

function preferredTrackId(project: PocketDawProject): string | null {
  if (project.tracks.some((track) => track.id === "drums")) return "drums";
  return project.tracks.find((track) => track.role !== "master")?.id || project.tracks[0]?.id || null;
}
