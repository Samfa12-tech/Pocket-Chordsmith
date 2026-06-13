import { AudioEngine, type AudioProjectSyncMode, type TrackMixerControlPatch } from "../audio/audioEngine";
import { audioBufferPeaks, getCachedAudioBuffer, setCachedAudioBuffer } from "../audio/audioBufferCache";
import { exportProjectToMidiBlob } from "../audio/midiExport";
import { mergeNativeRenderCacheItems } from "../audio/nativeRenderCache";
import { renderProjectToWavBlob } from "../audio/offlineRender";
import { createDemoProject } from "../demo/demoProject";
import { buildPocketDawProjectFile, createEmptyPocketDawProject } from "../daw/dawProject";
import { renderTimelineEvents } from "../audio/eventRenderer";
import { listenForDeepLinkHandoffs, readInitialDeepLinkHandoff } from "../native/deepLinkBridge";
import { downloadBlob, openProjectFileNative, safeName, saveProjectFile } from "../native/fileBridge";
import { readPocketDawHandoff, type PocketDawHandoff } from "../native/pocketHandoff";
import {
  loadAutosave,
  loadAutosaveFileState,
  loadRecentProjects,
  loadUpdaterAutoCheckPreference,
  saveAutosave,
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
  moveSelectedClip,
  moveSelectedClipBySnap,
  moveMidiNoteCommand,
  pasteClipAtPlayhead,
  placeAudioClipCommand,
  pitchMidiNoteCommand,
  redoCommand,
  renameMarkerCommand,
  removeTrackFxCommand,
  routeTrackOutputCommand,
  resizeMidiNoteCommand,
  ensureAutomationLaneCommand,
  setBassModeCommand,
  setChordsmithGlobalsCommand,
  setGuitarSettingsCommand,
  setLoopToSelectedClipCommand,
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
  toggleTrackArmedCommand,
  toggleTrackFxCommand,
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
import { createInitialState, currentProject, loadProjectIntoState, type AppState, type ChordsmithStepSelection } from "./state";
import { chordsmithStepDragAction, type ChordsmithStepArticulation } from "./chordsmithStepGestures";
import { renderAppShell } from "./ui";
import { createUndoStack } from "../daw/undo";
import { probeAudioDevices } from "../native/audioDevices";
import { cloneProject } from "../daw/dawProject";
import { POCKET_DAW_VERSION } from "../daw/schema";
import { trackIsAudible, type AddTrackKind } from "../daw/tracks";
import { barFloatToPosition, snapBarValue } from "../daw/timeline";
import { addImportedAudioMedia, updateAudioMediaAnalysis } from "../daw/audioClips";
import { createCollectMediaPlan, findMediaPoolItem, markMediaPoolItemCollected, markMediaPoolItemMissing, markMediaPoolItemRelinked, mediaPoolStatus } from "../daw/mediaPool";
import {
  AUDIO_MEDIA_ACCEPT,
  collectProjectMediaNative,
  importedAudioFromBrowserFile,
  importAudioMediaNative,
  loadAudioMediaNative,
  relinkAudioMediaNative,
  type ImportedAudioBytes
} from "../native/mediaBridge";
import { importMidiFileToProject } from "../daw/midiClips";
import { parseStandardMidiFile } from "../daw/midiParser";
import { MIDI_MEDIA_ACCEPT, importedMidiFromBrowserFile, importMidiNative, type ImportedMidiBytes } from "../native/midiBridge";
import { createGameExportManifest, createSectionLoopMetadata, createStemExportPlan, projectWithOnlyTracksAudible } from "../daw/exportJobs";
import { getPrimaryChordsmithSource } from "../daw/chordsmithEditor";

type MixerControlField = "volume" | "pan";
type RenderSchedule = "none" | "live-dom" | "deferred" | "immediate";
type ScrollSnapshot = Record<string, { top: number; left: number }>;

interface RenderOptions {
  preserveScroll?: boolean;
}

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
  private mixerGestureStarts = new Map<string, number>();
  private deferredRenderTimer: number | null = null;
  private chordsmithDragStart: ChordsmithStepSelection | null = null;
  private suppressNextStepClick = false;
  private chordsmithStepChangedTrack = false;
  private deepLinkUnlisten: (() => void) | null = null;

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
      if (playingChanged) {
        this.render({ preserveScroll: true });
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
    this.root.addEventListener("mousedown", (event) => this.handleMouseDown(event));
    window.addEventListener("keydown", (event) => this.handleKeyboard(event));
  }

  start() {
    const handoff = readPocketDawHandoff();
    if (handoff) {
      this.consumeHandoff(handoff);
    } else {
      const autosave = loadAutosave();
      if (autosave) {
        try {
          const project = loadPocketDawRaw(autosave);
          this.state = loadProjectIntoState(this.state, project, {
            status: "Recovered autosaved Pocket DAW project.",
            currentFile: loadAutosaveFileState() || { path: null, label: `Recovered autosave: ${project.project.title || "Untitled project"}` }
          });
          this.engine.setProject(project);
        } catch {
          this.state.status = "Editable demo copy loaded. Autosave was present but could not be recovered.";
        }
      }
    }
    this.render();
    this.bindDeepLinkHandoffs();
    this.engine.prewarmNativeRenderCache("app-start");
    this.scheduleStartupUpdateCheck();
  }

  private consumeHandoff(handoff: PocketDawHandoff): boolean {
    const imported = this.importText(handoff.code, handoff.status);
    if (imported) handoff.clear();
    return imported;
  }

  private async bindDeepLinkHandoffs() {
    const startupHandoff = await readInitialDeepLinkHandoff();
    if (startupHandoff) this.consumeHandoff(startupHandoff);
    if (this.deepLinkUnlisten) return;
    this.deepLinkUnlisten = await listenForDeepLinkHandoffs((handoff) => {
      this.consumeHandoff(handoff);
    });
  }

  private render(options: RenderOptions = {}) {
    const scroll = options.preserveScroll ? this.captureScrollSnapshot() : null;
    this.renderCount += 1;
    if (this.state.playing || this.engine.isPlaying()) this.renderCountDuringPlayback += 1;
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
    if (readout) readout.textContent = this.formatBarBeat(this.state.playheadBar);

    const cursor = this.root.querySelector<HTMLElement>("[data-cursor]");
    if (cursor) cursor.style.left = this.timelineBarLeftPx((this.state.cursorBar - 1) * this.state.zoom);

    const playing = this.root.querySelector<HTMLElement>("[data-playing-state]");
    if (playing) {
      playing.textContent = this.state.playing ? "Playing" : "Stopped";
      playing.classList.toggle("playing", this.state.playing);
    }

    const toggle = this.root.querySelector<HTMLButtonElement>("[data-transport-toggle]");
    if (toggle) {
      toggle.dataset.action = this.state.playing ? "pause" : "play";
      toggle.textContent = this.state.playing ? "Pause" : "Play";
    }

    project.tracks.forEach((track) => {
      const level = Math.max(0, Math.min(1, this.state.meterLevels[track.id] || 0));
      const percent = Math.round(level * 100);
      const fill = findDataElement<HTMLElement>(this.root, "data-meter-fill", track.id);
      if (fill) fill.style.height = `${percent}%`;
      const meter = findDataElement<HTMLElement>(this.root, "data-meter", track.id);
      if (meter) meter.setAttribute("aria-label", `${track.name} peak meter ${percent}%`);
    });
  }

  private bind() {
    this.root.querySelectorAll<HTMLElement>("[data-clip-id]").forEach((el) => {
      el.addEventListener("click", () => {
        this.state.selectedClipId = el.dataset.clipId || null;
        const row = el.dataset.row || "";
        const rowTrack = currentProject(this.state).tracks.find((track) => track.id === row) || currentProject(this.state).tracks.find((track) => track.role === row);
        if (rowTrack) this.state.selectedTrackId = rowTrack.id;
        this.state.status = `Selected ${this.state.selectedClipId}.`;
        this.render({ preserveScroll: true });
      });
    });
    this.root.querySelectorAll<HTMLElement>("[data-track-id]").forEach((el) => {
      el.addEventListener("click", () => {
        this.state.selectedTrackId = el.dataset.trackId || null;
        this.render({ preserveScroll: true });
      });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-volume]").forEach((input) => this.bindMixerControl(input, "volume", input.dataset.volume || ""));
    this.root.querySelectorAll<HTMLInputElement>("[data-pan]").forEach((input) => this.bindMixerControl(input, "pan", input.dataset.pan || ""));
    this.root.querySelectorAll<HTMLSelectElement>("[data-add-fx]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        this.applyProjectState(addTrackFxCommand(this.state, select.dataset.addFx || "", select.value));
      });
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-input]").forEach((select) => {
      select.addEventListener("change", () => this.applyProjectState(setTrackInputCommand(this.state, select.dataset.trackInput || "", select.value || null)));
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-track-output]").forEach((select) => {
      select.addEventListener("change", () => this.applyProjectState(routeTrackOutputCommand(this.state, select.dataset.trackOutput || "", select.value || "master")));
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-automation-enabled]").forEach((input) => {
      input.addEventListener("change", () => this.applyProjectState(setAutomationLaneEnabledCommand(this.state, input.dataset.automationEnabled || "", input.checked)));
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
      this.render();
    });
    this.root.querySelector<HTMLSelectElement>("#chordsmithSectionSelect")?.addEventListener("change", (event) => {
      this.state.chordsmithEditorSectionId = (event.target as HTMLSelectElement).value;
      this.state.chordsmithEditorStepPage = 0;
      this.state.chordsmithEditorFollowClip = false;
      this.state.status = `Chordsmith editor set to Section ${this.state.chordsmithEditorSectionId}.`;
      this.render();
    });
    this.root.querySelector<HTMLSelectElement>("#melodyTrackSelect")?.addEventListener("change", (event) => {
      this.state.chordsmithEditorMelodyTrackIndex = Number((event.target as HTMLSelectElement).value || 0);
      this.state.status = `Melody editor set to lane ${this.state.chordsmithEditorMelodyTrackIndex + 1}.`;
      this.render();
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
      this.applyProjectState(setLoopEnabled(this.state, (event.target as HTMLInputElement).checked));
    });
    this.root.querySelector<HTMLInputElement>("[data-updater-auto-check]")?.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      this.state.updaterAutoCheckOnStartup = input.checked;
      saveUpdaterAutoCheckPreference(input.checked);
      this.state.updaterMessage = input.checked ? "Pocket DAW will check silently on startup." : "Startup update checks are off.";
      this.render();
    });
    ["loopStart", "loopEnd"].forEach((id) => {
      this.root.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("change", () => {
        const start = Number(this.root.querySelector<HTMLInputElement>("#loopStart")?.value || 1);
        const end = Number(this.root.querySelector<HTMLInputElement>("#loopEnd")?.value || 2);
        this.applyProjectState(setLoopBars(this.state, start, end));
      });
    });
    this.root.querySelector<HTMLTextAreaElement>("#importText")?.addEventListener("input", (event) => {
      this.state.importText = (event.target as HTMLTextAreaElement).value;
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
    this.applyProjectState(next, false);
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
    if (this.beginChordsmithStepDrag(target, "pointerup")) return;
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

  private handleMouseDown(event: MouseEvent) {
    if (this.chordsmithDragStart) return;
    const target = event.target as HTMLElement | null;
    this.beginChordsmithStepDrag(target, "mouseup");
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
    const addTrackButton = target?.closest<HTMLElement>("[data-add-track-kind]");
    if (addTrackButton) {
      this.applyProjectState(addTrackCommand(this.state, addTrackButton.dataset.addTrackKind as AddTrackKind));
      return;
    }
    const armButton = target?.closest<HTMLElement>("[data-arm-track]");
    if (armButton) {
      this.state.status = "Recording arms are disabled until media/device QA, latency setup and reload-safe recording paths are signed off.";
      this.render();
      return;
    }
    const fxToggle = target?.closest<HTMLElement>("[data-fx-toggle]");
    if (fxToggle) {
      const [chainId, slotId] = String(fxToggle.dataset.fxToggle || "").split(":");
      this.applyProjectState(toggleTrackFxCommand(this.state, chainId, slotId));
      return;
    }
    const fxRemove = target?.closest<HTMLElement>("[data-fx-remove]");
    if (fxRemove) {
      const [chainId, slotId] = String(fxRemove.dataset.fxRemove || "").split(":");
      this.applyProjectState(removeTrackFxCommand(this.state, chainId, slotId));
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
      this.render();
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
      void this.dispatch(actionButton.dataset.action || "");
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
      if (target?.closest("button, input, select, textarea")) return;
      this.state.selectedClipId = inlineClip.dataset.inlineClipId || null;
      this.state.selectedTrackId = inlineClip.dataset.inlineRow || this.state.selectedTrackId;
      this.state.status = `Selected ${this.state.selectedClipId}.`;
      this.render({ preserveScroll: true });
      return;
    }
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

  private async dispatch(action: string) {
    if (action === "play") await this.playTransport();
    if (action === "pause") this.engine.pause();
    if (action === "stop") this.engine.stop();
    if (action === "restart") await this.restartTransport();
    if (action === "seek-start") this.seekToBar(1, true);
    if (action === "controls-open") {
      this.state.showControls = true;
      this.render();
    }
    if (action === "controls-close") {
      this.state.showControls = false;
      this.render();
    }
    if (action === "add-track-open") {
      this.state.showAddTrack = true;
      this.render();
    }
    if (action === "add-bus-track") this.applyProjectState(addBusTrackCommand(this.state));
    if (action === "add-return-track") this.applyProjectState(addReturnTrackCommand(this.state));
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
    if (action === "updater-check") await this.checkForUpdates(true);
    if (action === "updater-download-install") await this.downloadAndInstallUpdate();
    if (action === "updater-restart") await this.restartAfterUpdate();
    if (action === "media-pool-focus") {
      this.state.status = "Media Pool visible.";
      this.render();
      this.root.querySelector<HTMLElement>("#mediaPool")?.scrollIntoView({ block: "start", inline: "nearest" });
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
    if (action === "toggle-loop") this.applyProjectState(setLoopEnabled(this.state, !currentProject(this.state).timeline.loop.enabled));
    if (action === "loop-selected") this.applyProjectState(setLoopToSelectedClipCommand(this.state));
    if (action === "loop-clear") this.applyProjectState(clearLoopCommand(this.state));
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
    if (action === "export-stems") await this.exportStems();
    if (action === "export-section-manifest") this.exportSectionLoopManifest();
    if (action === "export-godot-manifest") this.exportGameManifest("godot-adaptive-pack");
    if (action === "export-web-game-manifest") this.exportGameManifest("web-game-pack");
    if (action === "export-media-plan") this.exportMediaPlan();
    if (action === "collect-media") await this.collectMedia();
    if (action === "build-native-cache") await this.buildNativeCache();
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
      if (!showPanel) this.state.showUpdaterPanel = false;
    } else {
      this.state.updaterStatus = "not-available";
      this.state.updaterAvailableVersion = null;
      this.state.updaterReleaseNotes = null;
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
      if (this.state.playing) this.engine.pause();
      else await this.playTransport();
    }
    if (command === "seek-start") {
      this.seekToBar(1, true);
      this.render();
    }
    if (command === "toggle-loop") this.applyProjectState(setLoopEnabled(this.state, !currentProject(this.state).timeline.loop.enabled));
    if (command === "mute-selected-track" && this.state.selectedTrackId) this.toggleTrackMute(this.state.selectedTrackId);
    if (command === "solo-selected-track" && this.state.selectedTrackId) this.toggleTrackSolo(this.state.selectedTrackId);
    if (command === "arm-selected-track" && this.state.selectedTrackId) {
      this.state.status = "Recording arms are disabled until media/device QA, latency setup and reload-safe recording paths are signed off.";
      this.render();
    }
    if (command === "duplicate-clip") this.applyProjectState(duplicateSelectedClip(this.state));
    if (command === "copy-clip") {
      this.state = copySelectedClip(this.state);
      this.render();
    }
    if (command === "paste-clip") this.applyProjectState(pasteClipAtPlayhead(this.state));
    if (command === "delete-clip") this.applyProjectState(deleteSelectedClip(this.state));
    if (command === "split-clip") this.applyProjectState(splitSelectedClipAtPlayhead(this.state));
    if (command === "loop-selected") this.applyProjectState(setLoopToSelectedClipCommand(this.state));
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
    if (!Number.isFinite(value)) return 144;
    return Math.max(48, Math.min(360, Math.round(value)));
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

  private async restartTransport() {
    let showedBusy = false;
    try {
      const prepared = await this.prepareTimelineAudioForPlayback("restart");
      showedBusy = prepared.showedBusy;
      await this.engine.restart();
    } finally {
      if (showedBusy) {
        this.state.busyMessage = null;
        this.render({ preserveScroll: true });
      }
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
    if (schedule === "none") return;
    if (schedule === "live-dom") {
      this.updateLiveDom();
      return;
    }
    if (schedule === "deferred") {
      if (this.deferredRenderTimer !== null) window.clearTimeout(this.deferredRenderTimer);
      this.deferredRenderTimer = window.setTimeout(() => {
        this.deferredRenderTimer = null;
        this.render(options);
      }, 80);
      return;
    }
    this.render(options);
  }

  private toggleTrackMute(trackId: string) {
    const next = toggleTrackMuteCommand(this.state, trackId);
    this.syncTrackAudibilityFromState(next, trackId, "mute");
    this.applyProjectState(next, false);
  }

  private toggleTrackSolo(trackId: string) {
    const next = toggleTrackSoloCommand(this.state, trackId);
    this.syncTrackAudibilityFromState(next, trackId, "solo");
    this.applyProjectState(next, false);
  }

  private syncTrackAudibilityFromState(next: AppState, trackId: string, field: "mute" | "solo") {
    const track = currentProject(next).tracks.find((item) => item.id === trackId);
    if (!track) return;
    this.engine.updateTrackMixerControl(trackId, field === "mute" ? { mute: track.mute } : { solo: track.solo });
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
    const project = currentProject(this.state);
    const pos = barFloatToPosition(barValue, project.project.timeSig, project.project.ppq);
    return `Bar ${pos.bar} Beat ${pos.beat}`;
  }

  private importText(text: string, statusPrefix?: string): boolean {
    try {
      const { project, message } = importTextToProject(text);
      const eventCount = renderTimelineEvents(project).length;
      this.state.undoStack = createUndoStack(project);
      this.state.selectedClipId = project.timeline.clips[0]?.id || null;
      this.state.selectedTrackId = "drums";
      this.state.importText = "";
      this.state.status = `${statusPrefix || message} ${eventCount} events ready.`;
      this.state.currentFile = { path: null, label: project.project.title };
      this.state.playheadBar = 1;
      this.state.cursorBar = 1;
      this.engine.setProject(project);
      this.saveAutosaveSnapshot(project);
      saveRecentProject(project.project.title);
      this.state.recent = loadRecentProjects();
      this.render();
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
      try {
        const project = loadPocketDawRaw(text);
        this.state.undoStack = createUndoStack(project);
        this.state.selectedClipId = project.timeline.clips[0]?.id || null;
        this.state.selectedTrackId = "drums";
        this.state.currentFile = { path: null, label: file.name };
        this.state.status = `Opened ${file.name}.`;
        this.state.playheadBar = 1;
        this.state.cursorBar = 1;
        this.engine.setProject(project);
        saveRecentProject(file.name);
        this.state.recent = loadRecentProjects();
        this.saveAutosaveSnapshot(project);
        this.render();
      } catch (error) {
        this.state.status = error instanceof Error ? error.message : "Open failed.";
        this.render();
      }
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
      setCachedAudioBuffer(result.item.id, decoded.buffer);
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
      setCachedAudioBuffer(item.id, decoded.buffer);
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
      setCachedAudioBuffer(item.id, decoded.buffer);
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
        await this.openRawProjectText(native.contents, native.file.label, native.file.path);
        return;
      }
    } catch (error) {
      this.state.status = error instanceof Error ? `Native open failed: ${error.message}` : "Native open failed. Choose a file in the browser picker.";
      this.render();
    }
    this.fileInput.click();
  }

  private async openRawProjectText(text: string, label: string, path: string | null) {
    try {
      const project = loadPocketDawRaw(text);
      this.state = loadProjectIntoState(this.state, project, {
        status: `Opened ${label}.`,
        currentFile: { path, label }
      });
      this.engine.setProject(project);
      saveRecentProject(label, path);
      this.state.recent = loadRecentProjects();
      this.saveAutosaveSnapshot(project);
      this.render();
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
      saveRecentProject(result.file.label, result.file.path);
      this.state.recent = loadRecentProjects();
    }
    this.state.status = result.message;
    this.saveAutosaveSnapshot(project);
    this.render({ preserveScroll: true });
  }

  private async exportWav() {
    try {
      await this.showExportProgress("Preparing WAV export", "Loading timeline audio files");
      const hydration = await this.hydrateTimelineAudioBuffers();
      this.assertNoMissingAudibleAudioBuffers(hydration, "WAV export");
      await this.showExportProgress("Rendering WAV mix", "Longer songs and imported audio can take a little while");
      const blob = await renderProjectToWavBlob(currentProject(this.state));
      await this.showExportProgress("Preparing WAV download", `${Math.round(blob.size / 1024)} KB rendered`);
      downloadBlob(blob, safeName(currentProject(this.state).project.title, "wav"));
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
        const blob = await renderProjectToWavBlob(projectWithOnlyTracksAudible(project, stem.trackIds));
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

  private exportSectionLoopManifest() {
    const loops = createSectionLoopMetadata(currentProject(this.state));
    const blob = new Blob([JSON.stringify({ loops }, null, 2)], { type: "application/json" });
    downloadBlob(blob, safeName(`${currentProject(this.state).project.title}-section-loops`, "json"));
    this.state.status = `Exported section loop manifest with ${loops.length} loop${loops.length === 1 ? "" : "s"}.`;
    this.render();
  }

  private exportGameManifest(kind: "godot-adaptive-pack" | "web-game-pack") {
    const manifest = createGameExportManifest(currentProject(this.state), kind);
    const suffix = kind === "godot-adaptive-pack" ? "godot-manifest" : "web-game-manifest";
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    downloadBlob(blob, safeName(`${currentProject(this.state).project.title}-${suffix}`, "json"));
    this.state.status = `Exported ${kind === "godot-adaptive-pack" ? "Godot" : "web game"} manifest preview${manifest.warnings.length ? ` with ${manifest.warnings.length} warning${manifest.warnings.length === 1 ? "" : "s"}` : ""}.`;
    this.render();
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
      const result = await this.engine.persistNativeRenderCache(projectFilePath, "manual-build-native-cache");
      if (!result) {
        this.state.status = "No native cache assets were available to build.";
        this.render({ preserveScroll: true });
        return;
      }
      const project = mergeNativeRenderCacheItems(currentProject(this.state), result.renderCacheItems);
      this.state = commitProject(this.state, project, `Built native WAV cache with ${result.writtenAssetCount} asset${result.writtenAssetCount === 1 ? "" : "s"}.`);
      this.saveAutosaveSnapshot(project);
      const saveResult = await saveProjectFile(project, projectFilePath, false);
      if (saveResult.file) this.state.currentFile = saveResult.file;
      this.state.status = [
        `Built native WAV cache: ${result.writtenAssetCount} asset${result.writtenAssetCount === 1 ? "" : "s"}`,
        result.skippedAssetCount ? `${result.skippedAssetCount} skipped` : "",
        result.errors.length ? `${result.errors.length} error${result.errors.length === 1 ? "" : "s"}` : ""
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
        setCachedAudioBuffer(id, decoded.buffer);
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
    const diagnostics = {
      capturedAt: new Date().toISOString(),
      appVersion: POCKET_DAW_VERSION,
      projectVersion: project.dawVersion,
      project: {
        id: project.project.id,
        title: project.project.title,
        bpm: project.project.bpm,
        timeSig: project.project.timeSig,
        bars: project.timeline.bars,
        clipCount: project.timeline.clips.length,
        trackCount: project.tracks.length
      },
      ui: {
        playing: this.state.playing,
        playheadBar: this.state.playheadBar,
        renderCount: this.renderCount,
        renderCountDuringPlayback: this.renderCountDuringPlayback,
        liveUpdateCount: this.liveUpdateCount,
        selectedClipId: this.state.selectedClipId,
        selectedTrackId: this.state.selectedTrackId
      },
      mixer: project.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        role: track.role,
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
        active: track.active !== false,
        meterLevel: this.state.meterLevels[track.id] || 0
      })),
      audio: this.engine.getDiagnostics()
    };
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    downloadBlob(blob, safeName(`${project.project.title}-diagnostics`, "json"));
    this.state.status = "Exported diagnostics JSON.";
    this.render();
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
  }

  loadDemo() {
    this.loadDemoProject("Loaded an editable demo copy. Edits autosave to this copy.");
  }

  private reloadDemoTemplate() {
    this.loadDemoProject("Reloaded the demo template into a fresh editable copy. Previous demo copy edits were discarded.");
  }

  private loadDemoProject(status: string) {
    const project = createDemoProject();
    this.state.undoStack = createUndoStack(project);
    this.state.selectedClipId = project.timeline.clips[0]?.id || null;
    this.state.selectedTrackId = "drums";
    this.state.currentFile = { path: null, label: "Editable demo copy" };
    this.state.status = status;
    this.state.playheadBar = 1;
    this.state.cursorBar = 1;
    this.state.meterLevels = {};
    this.engine.setProject(project);
    this.saveAutosaveSnapshot(project);
    this.render();
  }

  private newProject() {
    this.engine.stop();
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
    this.engine.setProject(project);
    this.saveAutosaveSnapshot(project);
    this.render();
  }

  private saveAutosaveSnapshot(project = currentProject(this.state)) {
    saveAutosave(buildPocketDawProjectFile(project), this.state.currentFile);
  }
}

function findDataElement<T extends HTMLElement>(root: ParentNode, attr: string, value: string): T | null {
  return findDataElements<T>(root, attr, value)[0] || null;
}

function findDataElements<T extends HTMLElement>(root: ParentNode, attr: string, value: string): T[] {
  return Array.from(root.querySelectorAll<T>(`[${attr}]`)).filter((node) => node.getAttribute(attr) === value);
}
