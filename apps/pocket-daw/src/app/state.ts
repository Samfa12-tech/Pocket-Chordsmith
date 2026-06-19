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

export type ChordsmithStepSelection =
  | { kind: "drums"; sectionId: string; lane: "kick" | "snare" | "hat"; step: number }
  | { kind: "bass"; sectionId: string; step: number }
  | { kind: "melody"; sectionId: string; trackIndex: number; step: number };

export interface AppState {
  undoStack: UndoStack<PocketDawProject>;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  cursorBar: number;
  snapMode: SnapMode;
  clipClipboard: Clip | null;
  zoom: number;
  timelineHeightPx: number;
  inspectorVisible: boolean;
  inspectorWidthPx: number;
  status: string;
  playing: boolean;
  playheadBar: number;
  meterLevels: Record<string, number>;
  importText: string;
  currentFile: ProjectFileState;
  busyMessage: string | null;
  exportProgress: { message: string; detail?: string } | null;
  recent: RecentProject[];
  showControls: boolean;
  showAddTrack: boolean;
  showAudioSettings: boolean;
  showUpdaterPanel: boolean;
  showMcpSetupPanel: boolean;
  showFeedbackPanel: boolean;
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

export type HandoffResult = "not-received" | "imported" | "ignored" | "failed-parse";

export interface HandoffStatus {
  source: PocketHandoffSource | null;
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
}

export interface RecordingUiState {
  status: "idle" | "count-in" | "recording" | "stopping" | "error";
  trackId: string | null;
  startedAt: string | null;
  startBar: number | null;
  elapsedSeconds: number;
  inputPeak: number;
  inputDeviceName: string | null;
  outputDeviceName: string | null;
  monitoring: boolean;
  livePeaks: number[];
  message: string;
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
    selectedTrackId: "drums",
    cursorBar: 1,
    snapMode: "bar",
    clipClipboard: null,
    zoom: 240,
    timelineHeightPx: 430,
    inspectorVisible: true,
    inspectorWidthPx: 420,
    status: "Editable demo copy loaded. Edits autosave to this copy.",
    playing: false,
    playheadBar: 1,
    meterLevels: {},
    importText: "",
    currentFile: { path: null, label: "Editable demo copy" },
    busyMessage: null,
    exportProgress: null,
    recent: [],
    showControls: false,
    showAddTrack: false,
    showAudioSettings: false,
    showUpdaterPanel: false,
    showMcpSetupPanel: false,
    showFeedbackPanel: false,
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
    nativeCacheStatus: {
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
    },
    lastHandoff: {
      source: null,
      result: "not-received",
      kind: null,
      receivedAt: null,
      message: "No Pocket DAW handoff received yet."
    },
    recording: {
      status: "idle",
      trackId: null,
      startedAt: null,
      startBar: null,
      elapsedSeconds: 0,
      inputPeak: 0,
      inputDeviceName: null,
      outputDeviceName: null,
      monitoring: false,
      livePeaks: [],
      message: "Ready to record one armed live track."
    }
  };
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
    selectedTrackId: preferredTrackId(project),
    cursorBar: 1,
    status: options.status,
    playing: false,
    playheadBar: 1,
    meterLevels: {},
    importText: options.clearImportText === false ? state.importText : "",
    currentFile: options.currentFile || { path: null, label: project.project.title || "Untitled project" },
    busyMessage: null,
    exportProgress: null,
    chordsmithEditorStepPage: 0,
    chordsmithStepSelection: null,
    recording: {
      status: "idle",
      trackId: null,
      startedAt: null,
      startBar: null,
      elapsedSeconds: 0,
      inputPeak: 0,
      inputDeviceName: null,
      outputDeviceName: null,
      monitoring: false,
      livePeaks: [],
      message: "Ready to record one armed live track."
    }
  };
}

function preferredTrackId(project: PocketDawProject): string | null {
  if (project.tracks.some((track) => track.id === "drums")) return "drums";
  return project.tracks.find((track) => track.role !== "master")?.id || project.tracks[0]?.id || null;
}
