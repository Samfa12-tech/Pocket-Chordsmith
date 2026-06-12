import { createDemoProject } from "../demo/demoProject";
import type { PocketDawProject } from "../daw/schema";
import type { Clip } from "../daw/schema";
import type { SnapMode } from "../daw/timeline";
import { createUndoStack, type UndoStack } from "../daw/undo";
import type { ProjectFileState } from "../native/fileBridge";
import type { RecentProject } from "../native/recentFiles";

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
  status: string;
  playing: boolean;
  playheadBar: number;
  meterLevels: Record<string, number>;
  importText: string;
  currentFile: ProjectFileState;
  recent: RecentProject[];
  showControls: boolean;
  showAddTrack: boolean;
  showAudioSettings: boolean;
  audioProbeStatus: string;
  chordsmithEditorFollowClip: boolean;
  chordsmithEditorSectionId: string;
  chordsmithEditorMelodyTrackIndex: number;
  chordsmithEditorStepPage: number;
  chordsmithStepSelection: ChordsmithStepSelection | null;
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
    zoom: 34,
    status: "Editable demo copy loaded. Edits autosave to this copy.",
    playing: false,
    playheadBar: 1,
    meterLevels: {},
    importText: "",
    currentFile: { path: null, label: "Editable demo copy" },
    recent: [],
    showControls: false,
    showAddTrack: false,
    showAudioSettings: false,
    audioProbeStatus: "Audio devices not probed yet.",
    chordsmithEditorFollowClip: true,
    chordsmithEditorSectionId: "A",
    chordsmithEditorMelodyTrackIndex: 0,
    chordsmithEditorStepPage: 0,
    chordsmithStepSelection: null
  };
}

export function currentProject(state: AppState): PocketDawProject {
  return state.undoStack.present;
}
