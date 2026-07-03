import type { AppState } from "./state";
import { currentProject, isUiSectionCollapsed, type ChordsmithStepSelection, type LowerDockTab, type UiCollapseSection } from "./state";
import { BUILT_IN_FX, getTrackFxChain } from "../daw/fx";
import { DRUM_LANE_DEFS, drumBranchGroupCollapsed, generatedDrumBranchLane, getDrumBranchStepLevel, getDrumLaneFxChain, getDrumLaneMix, type DrumLaneId } from "../daw/drumLanes";
import { bassStepUsesAuto, bassVisibleNoteIndex, getPrimaryChordsmithSource, totalEditorSteps, visibleEditorSteps } from "../daw/chordsmithEditor";
import { bassPresetLabel, visibleBassPresetsForProject } from "../daw/chordsmithBassPresets";
import { drumPresetLabel, visibleDrumPresetsForProject } from "../daw/chordsmithDrumPresets";
import { guitarPresetLabel, visibleGuitarPresetsForProject } from "../daw/chordsmithGuitarPresets";
import { GAME_STATE_MARKERS, POCKET_DAW_VERSION, type AutomationLane, type AutomationPoint, type Clip, type FxChain, type FxPluginInstance, type GameStateMarkerId, type Track } from "../daw/schema";
import { POCKET_PRO_EQ_BANDS, POCKET_PRO_EQ_PRESETS, POCKET_PRO_EQ_TYPE } from "../../../../packages/pocket-audio-core/src/fx/pro-eq.js";
import { POCKET_GUITAR_REGISTERS, POCKET_GUITAR_STRUM_MODES, POCKET_GUITAR_TONES } from "../../../../packages/pocket-audio-core/src/sounds/guitar.js";
import { POCKET_CHORD_INSTRUMENTS, POCKET_MELODY_INSTRUMENTS } from "../../../../packages/pocket-audio-core/src/sounds/instruments.js";
import { DEFAULT_STEM_MIX } from "../../../../packages/pocket-audio-core/src/constants.js";
import { SECTION_IDS, type SanitizedPcsProject, type SanitizedPcsSection, type SectionId } from "../compatibility/pcsSanitizer";
import { barFloatToDisplayPosition, barsToSeconds, effectiveMeterAtBar, gameStateMarkerLabel, sortClips, timelineSecondsAtBar } from "../daw/timeline";
import { createAudioMediaAnalysisSummary, createCollectMediaPlan, createPortableMediaProject, createRenderCacheSummary, mediaPoolStatus, renderCacheItemsForMedia, verifyMediaPortability, verifySharedMediaPortability } from "../daw/mediaPool";
import { MIDI_GROOVE_TEMPLATES, MIDI_IMPORT_PLACEMENT_MODES, createMidiTempoMapSummary, midiDataFromClip, type MidiTempoMapPosition, type MidiTempoMapSummary } from "../daw/midiClips";
import { clipHasAutomation, getClipAutomationLane, getFxParameterAutomationLane, getProjectAutomationLane, getTrackAutomationLane, getTrackSendAutomationLane, interpolateAutomationValue, trackHasAutomation, type ClipAutomationField } from "../daw/automation";
import { availableTrackOutputs, createRoutingExportSummary, trackSendLevel, trackSendMode } from "../daw/routing";
import { recordingLatencyOffsetSeconds } from "../daw/tracks";
import { createGamePackDeliveryTargets, createSectionLoopMetadata, createStemExportPlan } from "../daw/exportJobs";
import { validateExportProfile } from "../daw/exportProfiles";
import { createPocketDjSourceSummary, type PocketDjSourceSummary } from "../daw/pocketDjSources";
import { createMidiChordsmithConversionPreview, type MidiChordsmithConversionPreview } from "../daw/midiConversionPreview";
import { normalizeMidiConversionSourceFilter, type MidiConversionSourceFilter, type MidiConversionSourceOption } from "../daw/midiConversionFilter";
import { getCachedAudioBuffer } from "../audio/audioBufferCache";
import { audioClipTakeSummary, clipSourceStartBar } from "../daw/clips";
import { createAudioTakeDiagnosticsSummary, runtimeBuildId, runtimeCommit, runtimeLabel } from "./diagnostics";
import { FUNCTION_ACTION_CATALOG_DOC, FUNCTION_ACTION_REFERENCE, FUNCTION_GUIDE_SECTIONS, FUNCTION_REFERENCE_DOC } from "./functionGuide";
import { pocketDawMcpClaudeConfig, pocketDawMcpCodexConfig, pocketDawMcpCommandLine, POCKET_DAW_MCP_WORKSPACE } from "./mcpSetup";
import { projectTitleFromFileState } from "../native/fileBridge";
import {
  escapeAttr,
  escapeHtml,
  safeClipColour,
  safeTrackColour,
  sanitizeCssColor,
  sanitizeCssLengthOrNumber,
  sanitizeDataAttr,
  sanitizeDomId
} from "./renderSafety";

interface ProEqBand {
  id: string;
  label: string;
  frequencyParam: string;
  enabledParam: string;
  defaultEnabled: boolean;
  defaultFrequency: number;
  minFrequency: number;
  maxFrequency: number;
  gainParam?: string;
  defaultGain?: number;
  minGain?: number;
  maxGain?: number;
  qParam?: string;
  defaultQ?: number;
  minQ?: number;
  maxQ?: number;
}

const UI_COLLAPSE_LABELS: Record<UiCollapseSection, string> = {
  "timeline-tools": "Timeline tools",
  "inspector-clip": "Clip section",
  "inspector-track": "Track section",
  "lower-dock": "Lower dock",
  "media-pool": "Media pool"
};

const PRO_EQ_BANDS = POCKET_PRO_EQ_BANDS as unknown as readonly ProEqBand[];
const CHORD_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII"];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASS_LABELS = ["R", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"];
const GUITAR_LABELS: Record<string, string> = {
  off: "-",
  chug: "Ch",
  accent: "Ac",
  hold: "Ho",
  scratch: "Sc"
};

export function renderAppShell(state: AppState): string {
  const project = currentProject(state);
  const selectedClip = project.timeline.clips.find((clip) => clip.id === state.selectedClipId) || null;
  const selectedTrack = project.tracks.find((track) => track.id === state.selectedTrackId) || null;
  return `
    <div class="app-shell" data-layout-shell="true" data-scroll-key="app-shell" data-ui-preset="${escapeAttr(state.uiCreationPreset)}" style="--studio-height:${sanitizeCssLengthOrNumber(state.timelineHeightPx, 430, 260, 760)}px;--inspector-width:${sanitizeCssLengthOrNumber(state.inspectorWidthPx, 420, 280, 620)}px;">
      ${renderMenuStrip(state)}
      ${renderStudioRail(state)}
      ${renderTransport(state)}
      ${renderQuickStart(state)}
      <main class="studio ${state.inspectorVisible ? "" : "inspector-hidden"}" data-layout-zone="studio">
        ${renderTimeline(state)}
        ${state.inspectorVisible ? `<div class="inspector-resize-handle" data-inspector-resize-handle="true" title="Drag to resize inspector"></div>${renderInspector(state, project, selectedClip, selectedTrack)}` : ""}
      </main>
      <div class="studio-resize-handle" data-timeline-resize-handle="true" title="Drag to resize timeline and push mixer lower"><span></span></div>
      ${renderMixer(state)}
      ${renderMediaPool(state)}
      ${state.showFilePanel ? renderFilePanel(state) : ""}
      ${state.showControls ? renderControlsPanel(state) : ""}
      ${state.showAddTrack ? renderAddTrackPanel() : ""}
      ${state.showAudioSettings ? renderAudioSettingsPanel(state) : ""}
      ${state.showUpdaterPanel ? renderUpdaterPanel(state) : ""}
      ${state.showMcpSetupPanel ? renderMcpSetupPanel(state) : ""}
      ${state.showFunctionGuidePanel ? renderFunctionGuidePanel() : ""}
      ${state.showFeedbackPanel ? renderFeedbackPanel(state) : ""}
    </div>
  `;
}

function renderStudioRail(state: AppState): string {
  const items = [
    {
      key: "library",
      code: "Li",
      label: "Library",
      action: "add-track-open",
      description: "Open track and source choices for live audio, MIDI, Chordsmith roles, buses and returns.",
      active: state.showAddTrack
    },
    {
      key: "project",
      code: "Pr",
      label: "Project",
      action: "file-window-open",
      description: "Open project, import, export and media actions.",
      active: state.showFilePanel
    },
    {
      key: "clips",
      code: "Cl",
      label: "Clips",
      action: "studio-focus-timeline",
      description: "Jump to the timeline and clip editing surface.",
      active: false
    },
    {
      key: "media",
      code: "Me",
      label: "Media",
      action: "media-pool-focus",
      description: "Jump to imported media, cache and portability details.",
      active: false
    },
    {
      key: "mixer",
      code: "Mx",
      label: "Mixer",
      action: "lower-dock-mixer",
      description: "Open the lower-dock mixer.",
      active: state.lowerDockTab === "mixer"
    },
    {
      key: "midi",
      code: "Mi",
      label: "MIDI",
      action: "lower-dock-piano-roll",
      description: "Open MIDI piano-roll editing.",
      active: state.lowerDockTab === "piano-roll"
    },
    {
      key: "audio",
      code: "Au",
      label: "Audio",
      action: "lower-dock-audio-editor",
      description: "Open selected audio-clip editing.",
      active: state.lowerDockTab === "audio-editor"
    },
    {
      key: "export",
      code: "Ex",
      label: "Export",
      action: "lower-dock-export-details",
      description: "Open export profiles, warnings and package details.",
      active: state.lowerDockTab === "export-details" && state.uiCreationPreset !== "game-music"
    },
    {
      key: "godot",
      code: "Gd",
      label: "Godot",
      action: "studio-focus-godot",
      description: "Show game music focus and Godot/web pack controls.",
      active: state.uiCreationPreset === "game-music" && state.lowerDockTab === "export-details"
    },
    {
      key: "pocket",
      code: "Po",
      label: "Pocket",
      action: "import-focus",
      description: "Open Pocket Chordsmith, Pocket DJ and handoff import tools.",
      active: false
    },
    {
      key: "diagnostics",
      code: "Dx",
      label: "Diag",
      action: "controls-open",
      description: "Open diagnostics, cache, routing and support status.",
      active: state.showControls
    },
    {
      key: "help",
      code: "?",
      label: "Help",
      action: "function-guide-open",
      description: "Open human and AI counterpart help.",
      active: state.showFunctionGuidePanel
    }
  ];
  return `
    <nav class="studio-rail" data-layout-zone="studio-rail" aria-label="Studio rail">
      ${items.map((item) => `
        <button
          type="button"
          class="${item.active ? "active" : ""}"
          data-action="${escapeAttr(item.action)}"
          data-studio-rail-target="${sanitizeDataAttr(item.key)}"
          aria-pressed="${item.active ? "true" : "false"}"
          aria-label="${escapeAttr(`${item.label}: ${item.description}`)}"
          title="${escapeAttr(item.description)}">
          <strong>${escapeHtml(item.code)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderMenuStrip(state: AppState): string {
  const loopOn = currentProject(state).timeline.loop.enabled;
  return `
    <nav class="menu-strip" data-layout-zone="menu" aria-label="Desktop menu">
      ${renderMenuGroup("File", [
        ["New", "new-project"],
        ["Open", "open-project"],
        ["Save", "save-project"],
        ["Save As", "save-project-as"],
        ["Imports / Exports...", "file-window-open"],
        ["Audio Settings", "audio-settings-open"]
      ])}
      ${renderMenuGroup("Edit", [
        ["Undo", "undo"],
        ["Redo", "redo"],
        ["Cut Clip", "clip-cut"],
        ["Copy Clip", "clip-copy"],
        ["Paste Clip", "clip-paste"],
        ["Duplicate Clip", "clip-duplicate"],
        ["Split Clip", "clip-split"],
        ["Range Clip", "range-selected"],
        ["Copy Range", "range-copy"],
        ["Cut Range", "range-cut"],
        ["Split Range", "range-split"],
        ["Crop Range", "range-crop"],
        ["Delete Range", "range-delete"],
        ["Ripple Delete", "range-ripple-delete"],
        ["Ripple All", "range-ripple-all"],
        ["Clear Range", "range-clear"],
        ["Delete Clip", "clip-delete"],
        ["Mute Clip", "clip-mute"]
      ])}
      ${renderMenuGroup("View", [
        ["Zoom In", "zoom-in"],
        ["Zoom Out", "zoom-out"],
        ["About / Diagnostics", "controls-open"],
        ["Show Audio Settings", "audio-settings-open"],
        ["Media Pool", "media-pool-focus"]
      ])}
      ${renderMenuGroup("Track", [["Add Track", "add-track-open"]])}
      ${renderMenuGroup("Transport", [
        [state.playing ? "Pause" : "Play", state.playing ? "pause" : "play"],
        ["Stop", "stop"],
        ["Restart", "restart"],
        ["MIDI Panic", "midi-panic"],
        [`Loop ${loopOn ? "Off" : "On"}`, "toggle-loop"],
        ["Loop Selected", "loop-selected"],
        ["Clear Loop", "loop-clear"],
        ["Add Marker", "marker-add"]
      ])}
      ${renderMenuGroup("Help", [
        ["Function Guide", "function-guide-open"],
        ["Check for Updates", "updater-open"],
        ["AI / MCP Bridge", "mcp-setup-open"],
        ["Send Feedback", "feedback-open"],
        ["More by Samfa12", "more-by-samfa12"],
        ["About / Diagnostics", "controls-open"],
        ["Export Diagnostics", "export-diagnostics"]
      ])}
    </nav>
  `;
}

function renderMenuGroup(label: string, actions: Array<[string, string]>): string {
  return `
    <div class="menu-group">
      <button class="menu-root" type="button">${escapeHtml(label)}</button>
      <div class="menu-popover">
        ${actions.map(([name, action]) => `<button type="button" data-action="${escapeAttr(action)}">${escapeHtml(name)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderTransport(state: AppState): string {
  const project = currentProject(state);
  const env = runtimeLabel();
  const displayTitle = projectDisplayTitle(state);
  const metronome = project.project.metronome || { enabled: false, countInBars: 1, volume: 0.55 };
  const recordingActive = state.recording.status === "preparing" || state.recording.status === "count-in" || state.recording.status === "recording" || state.recording.status === "stopping";
  const recordingLabel = state.recording.status === "recording"
    ? `Recording ${formatDuration(state.recording.elapsedSeconds)}`
    : state.recording.status === "preparing"
      ? state.recording.message || "Preparing"
    : state.recording.status === "count-in"
      ? state.recording.message || "Count-in"
      : state.recording.status === "stopping"
        ? "Stopping recording"
        : "Record";
  const barBeat = formatBarBeatParts(project, state.playheadBar);
  const recordingPrimary = state.recording.status === "recording" ? "Recording" : recordingLabel;
  const recordingSecondary = state.recording.status === "recording" ? formatDuration(state.recording.elapsedSeconds) : "";
  const metroDetail = metronome.enabled ? `${metronome.countInBars} bar` : "off";
  return `
    <header class="transport" data-layout-zone="transport">
      <div class="brand">
        <div class="mark">PD</div>
        <div>
          <h1>Pocket DAW</h1>
          <p>${escapeHtml(displayTitle)}</p>
          <small>v${escapeHtml(POCKET_DAW_VERSION)} / ${escapeHtml(env)} / ${escapeHtml(state.currentFile.path || state.currentFile.label)}</small>
        </div>
      </div>
      <div class="transport-buttons">
        <button class="primary" data-transport-toggle="true" data-action="${state.playing ? "pause" : "play"}">${state.playing ? "Pause" : "Play"}</button>
        <button class="${recordingActive ? "record on" : "record"}" data-action="record-toggle" data-ui-scope="recording">${recordingActive ? "Stop Rec" : "Record"}</button>
        <button class="${metronome.enabled ? "on" : ""}" data-action="metronome-toggle" title="Metronome and one-bar recording count-in">Metro</button>
        <button data-action="stop">Stop</button>
        <button data-action="restart">Restart</button>
        <button data-action="midi-panic" title="Immediately stop preview playback and clear stuck notes">Panic</button>
        <button data-action="seek-start">Bar 1</button>
        <button data-action="add-track-open">Add Track</button>
        <button data-action="undo">Undo</button>
        <button data-action="redo">Redo</button>
        ${renderCreationPresets(state)}
      </div>
      <div class="transport-readout">
        <span data-playing-state="true" class="${state.playing ? "playing" : ""}"><strong>${state.playing ? "Playing" : "Stopped"}</strong></span>
        <span data-recording-state="true" data-ui-scope="recording" class="${recordingActive ? "recording" : ""}"><strong>${escapeHtml(recordingPrimary)}</strong>${recordingSecondary ? `<small>${escapeHtml(recordingSecondary)}</small>` : ""}</span>
        <span><strong>${Math.round(project.project.bpm)}</strong><small>BPM</small></span>
        <span><strong>Metro</strong><small>${escapeHtml(metroDetail)}</small></span>
        <span><strong>${escapeHtml(project.project.key)}</strong><small>${escapeHtml(project.project.scale)}</small></span>
        <span data-playhead-readout="true"><strong>${escapeHtml(barBeat.bar)}</strong><small>${escapeHtml(barBeat.beat)}</small></span>
      </div>
      <div class="status" data-transport-status="true" role="status" aria-live="polite" title="${escapeAttr(state.status)}">${escapeHtml(state.status)}</div>
      ${state.busyMessage ? `
        <div class="transport-busy" role="status" aria-live="polite">
          <span>${escapeHtml(state.busyMessage)}</span>
          <i></i>
        </div>
      ` : ""}
    </header>
  `;
}

function renderCreationPresets(state: AppState): string {
  const musicActive = state.uiCreationPreset === "music";
  const gameActive = state.uiCreationPreset === "game-music";
  return `
    <span class="creation-presets" role="group" aria-label="Creation focus preset">
      <span class="creation-presets-label">Focus</span>
      <button type="button" class="${musicActive ? "on" : ""}" data-action="preset-music" aria-pressed="${musicActive ? "true" : "false"}" title="Music preset: keep the timeline primary and tuck deeper edit, mix, media and game-export surfaces away">Music</button>
      <button type="button" class="${gameActive ? "on" : ""}" data-action="preset-game-music" aria-pressed="${gameActive ? "true" : "false"}" title="Game music preset: keep timeline/game cues prominent and open game-pack export controls">Game music</button>
    </span>
  `;
}

function renderUiSectionToggle(state: AppState, section: UiCollapseSection, label = UI_COLLAPSE_LABELS[section]): string {
  const collapsed = isUiSectionCollapsed(state, section);
  const action = collapsed ? "Show" : "Hide";
  return `<button type="button" class="section-collapse-toggle" data-action="toggle-ui-section" data-ui-section="${sanitizeDataAttr(section)}" aria-expanded="${collapsed ? "false" : "true"}" title="${action} ${escapeAttr(label.toLowerCase())}">${action}</button>`;
}

function renderCollapsedNotice(summary: string): string {
  return `<div class="collapsed-section-notice"><span>${escapeHtml(summary)}</span></div>`;
}

function projectDisplayTitle(state: AppState): string {
  const project = currentProject(state);
  const title = project.project.title || "";
  if (!isUntitledProjectTitle(title)) return title;
  return projectTitleFromFileState(state.currentFile) || title || "Untitled Project";
}

function isUntitledProjectTitle(title: string): boolean {
  return /^untitled(?:\s+project)?$/i.test(title.trim());
}

function renderQuickStart(state: AppState): string {
  const project = currentProject(state);
  if (state.currentFile.path) return "";
  const isStarter = state.currentFile.label === "Editable demo copy" || state.currentFile.label === "Untitled project";
  if (!isStarter && project.timeline.clips.length > 0) return "";
  return `
    <section class="quick-start" data-layout-zone="quickstart" aria-label="First run actions">
      <div>
        <strong>${project.timeline.clips.length ? "Demo is ready" : "Start a project"}</strong>
        <span>${project.timeline.clips.length ? "Press Play, import Chordsmith data, or open a saved project." : "Load the demo, import Chordsmith data, or open a saved project."}</span>
      </div>
      <button class="primary" data-action="${project.timeline.clips.length ? "play" : "load-demo"}">${project.timeline.clips.length ? "Play Demo" : "Load Demo"}</button>
      <button data-action="load-demo">Load Demo</button>
      <button data-action="import-focus">Import Chordsmith</button>
      <button data-action="open-project">Open .pocketdaw</button>
    </section>
  `;
}

function renderTimeline(state: AppState): string {
  const project = currentProject(state);
  const pcs = getPrimaryChordsmithSource(project);
  const zoom = state.zoom;
  const width = Math.max(1100, 176 + (project.timeline.bars + 1) * zoom);
  const playheadLeft = (state.playheadBar - 1) * zoom;
  const cursorLeft = (state.cursorBar - 1) * zoom;
  const selection = project.timeline.selection || null;
  const rangeStart = selection?.startBar ?? project.timeline.loop.startBar;
  const rangeEnd = selection?.endBar ?? project.timeline.loop.endBar;
  const toolsCollapsed = isUiSectionCollapsed(state, "timeline-tools");
  const toolsLabel = toolsCollapsed ? "Timeline" : "Timeline tools";
  return `
    <section class="timeline-wrap">
      <div class="timeline-toolbar ${toolsCollapsed ? "collapsed" : ""}" data-ui-collapse-section="timeline-tools">
        <div class="section-collapse-head timeline-tools-head">
          <div>
            <strong>${toolsLabel}</strong>
            <span>${escapeHtml(state.snapMode === "off" ? "Snap off" : `${modeLabel(state.snapMode)} snap`)} / ${Math.round(zoom)} px/bar</span>
          </div>
          ${renderUiSectionToggle(state, "timeline-tools")}
        </div>
        ${
          toolsCollapsed
            ? renderCompactTimelineTools(state, project, zoom, rangeStart, rangeEnd)
            : `
              <div class="edit-tools">
                <button data-action="clip-left" title="Move the selected clip one snap step earlier">Move Left</button>
                <button data-action="clip-right" title="Move the selected clip one snap step later">Move Right</button>
                <button data-action="clip-cut" title="Cut the selected clip to the clipboard">Cut</button>
                <button data-action="clip-copy" title="Copy the selected clip to the clipboard">Copy</button>
                <button data-action="clip-paste" title="Paste the copied clip at the cursor">Paste</button>
                <button data-action="clip-duplicate" title="Duplicate the selected clip after itself">Duplicate</button>
                <button data-action="clip-split" title="Split the selected clip at the playhead">Split</button>
                <button data-action="trim-start-right" title="Trim the selected clip start later by one snap step">Trim Start</button>
                <button data-action="trim-end-left" title="Trim the selected clip end earlier by one snap step">Trim End</button>
                <button data-action="clip-delete" title="Delete the selected clip">Delete</button>
                <button data-action="clip-mute" title="Mute or unmute the selected clip without deleting it">Mute Clip</button>
              </div>
              ${renderTimelineSongSettings(pcs)}
              <div class="timeline-options">
                <button data-action="toggle-inspector" title="${state.inspectorVisible ? "Hide" : "Show"} the selected clip and track inspector">${state.inspectorVisible ? "Hide Inspector" : "Show Inspector"}</button>
                <label>Snap
                  <select id="snapMode">
                    ${(["bar", "beat", "off"] as const).map((mode) => `<option value="${mode}" ${state.snapMode === mode ? "selected" : ""}>${modeLabel(mode)}</option>`).join("")}
                  </select>
                </label>
                <button data-action="zoom-out" title="Zoom the timeline out">Zoom -</button>
                <button data-action="zoom-in" title="Zoom the timeline in">Zoom +</button>
                <label class="timeline-zoom-control">Zoom
                  <input id="timelineZoom" type="range" min="48" max="360" step="2" value="${sanitizeCssLengthOrNumber(zoom, 240, 48, 360)}">
                  <span data-zoom-readout="true">${Math.round(zoom)} px/bar</span>
                </label>
                <label><input type="checkbox" id="loopEnabled" ${project.timeline.loop.enabled ? "checked" : ""}> Loop</label>
                <input class="bar-input" id="loopStart" type="number" min="1" value="${project.timeline.loop.startBar}">
                <input class="bar-input" id="loopEnd" type="number" min="2" value="${project.timeline.loop.endBar}">
                <button data-action="loop-selected" title="Set the loop region to the selected clip">Loop Clip</button>
                <button data-action="loop-clear" title="Clear the active loop region">Clear</button>
                <span class="range-controls" aria-label="Edit range controls">
                  <span class="range-label">Range</span>
                  <input class="bar-input" id="rangeStart" type="number" min="1" step="0.25" value="${sanitizeCssLengthOrNumber(rangeStart, 1, 1, 4096)}" aria-label="Edit range start bar">
                  <input class="bar-input" id="rangeEnd" type="number" min="1.125" step="0.25" value="${sanitizeCssLengthOrNumber(rangeEnd, 2, 1.125, 4097)}" aria-label="Edit range end bar">
                  <button data-action="range-selected" title="Select the current clip as the edit range">Range Clip</button>
                  <button data-action="range-loop" title="Set the active edit range to the current loop">Range Loop</button>
                  <button data-action="range-copy" ${selection ? "" : "disabled"} title="Copy the selected clip material inside the edit range">Copy Range</button>
                  <button data-action="range-cut" ${selection ? "" : "disabled"} title="Cut the selected clip material inside the edit range">Cut Range</button>
                  <button data-action="range-split" ${selection ? "" : "disabled"} title="Split clips at the edit range boundaries">Split Range</button>
                  <button data-action="range-crop" ${selection ? "" : "disabled"} title="Keep only the selected range inside affected clips">Crop Range</button>
                  <button data-action="range-delete" ${selection ? "" : "disabled"} title="Delete material inside the selected range">Delete Range</button>
                  <button data-action="range-ripple-delete" ${selection ? "" : "disabled"} title="Delete the selected range and close the gap on selected tracks">Ripple Delete</button>
                  <button data-action="range-ripple-all" ${selection ? "" : "disabled"} title="Delete the selected range and close the gap across all tracks">Ripple All</button>
                  <button data-action="range-clear" ${selection ? "" : "disabled"} title="Clear the active edit range">Clear Range</button>
                </span>
                <button data-action="marker-add" title="Add a timeline marker at the playhead">Marker</button>
                <span class="game-cue-controls" data-ui-scope="game" aria-label="Game cue controls">
                  <select id="gameStateMarker" aria-label="Game-state marker" title="Choose the adaptive game-state label for the next cue">
                    ${GAME_STATE_MARKERS.map((state) => `<option value="${escapeAttr(state)}">${escapeHtml(gameStateMarkerLabel(state))}</option>`).join("")}
                  </select>
                  <button data-action="game-state-marker-add" title="Add a game-state cue marker at the playhead">Game Cue</button>
                </span>
              </div>
            `
        }
      </div>
      <div class="timeline-scroll" data-scroll-key="timeline-scroll">
        <div class="timeline" data-timeline-surface="true" title="Click the grid to seek by bar" style="width:${width}px; --bar:${zoom}px; --track-header:176px;">
          ${renderBarRuler(project)}
          ${renderMarkers(state)}
          <div class="cursor-line" data-cursor="true" style="left:${barLeftPx(cursorLeft)}"></div>
          <div class="playhead" data-playhead="true" style="left:${barLeftPx(playheadLeft)}"></div>
          <div class="loop-region ${project.timeline.loop.enabled ? "on" : ""}" style="left:${barLeftPx((project.timeline.loop.startBar - 1) * zoom)};width:${Math.max(1, project.timeline.loop.endBar - project.timeline.loop.startBar) * zoom}px"></div>
          ${selection ? `<div class="range-region ${sanitizeDataAttr(selection.source)}" data-range-region="true" style="left:${barLeftPx((selection.startBar - 1) * zoom)};width:${Math.max(1, selection.endBar - selection.startBar) * zoom}px"></div>` : ""}
          ${renderTimelineRows(state)}
        </div>
      </div>
    </section>
  `;
}

function renderCompactTimelineTools(
  state: AppState,
  project: ReturnType<typeof currentProject>,
  zoom: number,
  rangeStart: number,
  rangeEnd: number
): string {
  const selection = project.timeline.selection || null;
  const loopSummary = project.timeline.loop.enabled
    ? `Loop ${formatBarNumber(project.timeline.loop.startBar)}-${formatBarNumber(project.timeline.loop.endBar)}`
    : "Loop off";
  const rangeSummary = selection
    ? `Range ${formatBarNumber(rangeStart)}-${formatBarNumber(rangeEnd)}`
    : "No range";
  return `
    <div class="timeline-compact-tools" aria-label="Essential timeline tools">
      <span class="timeline-compact-status">${escapeHtml(loopSummary)} / ${escapeHtml(rangeSummary)}</span>
      <button data-action="clip-split" title="Split the selected clip at the playhead">Split</button>
      <button data-action="clip-duplicate" title="Duplicate the selected clip after itself">Duplicate</button>
      <button data-action="clip-mute" title="Mute or unmute the selected clip without deleting it">Mute</button>
      <button data-action="clip-delete" title="Delete the selected clip">Delete</button>
      <button data-action="zoom-out" title="Zoom the timeline out">Zoom -</button>
      <button data-action="zoom-in" title="Zoom the timeline in">Zoom +</button>
      <button data-action="toggle-inspector" title="${state.inspectorVisible ? "Hide" : "Show"} the selected clip and track inspector">${state.inspectorVisible ? "Hide Inspector" : "Inspector"}</button>
      <span class="timeline-compact-readout" data-zoom-readout="true">${Math.round(zoom)} px/bar</span>
    </div>
  `;
}

function formatBarNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function renderTimelineSongSettings(pcs: SanitizedPcsProject | null): string {
  if (!pcs) return "";
  const sectionCounts = new Map<string, number>();
  pcs.songSequence.forEach((id) => sectionCounts.set(id, (sectionCounts.get(id) || 0) + 1));
  const nextUnused = SECTION_IDS.find((id) => !sectionCounts.has(id)) || pcs.songSequence.at(-1) || "A";
  return `
    <div class="song-settings-strip" aria-label="Song settings">
      <label>BPM <input data-chordsmith-global="bpm" type="number" min="40" max="240" value="${sanitizeCssLengthOrNumber(pcs.bpm, 118, 40, 240)}"></label>
      <label>Key
        <select data-chordsmith-global="key">
          ${NOTE_NAMES.map((key) => `<option value="${escapeAttr(key)}" ${pcs.key === key ? "selected" : ""}>${escapeHtml(key)}</option>`).join("")}
        </select>
      </label>
      <label>Scale
        <select data-chordsmith-global="scale">
          ${(["major", "minor"] as const).map((scale) => `<option value="${scale}" ${pcs.scale === scale ? "selected" : ""}>${scale}</option>`).join("")}
        </select>
      </label>
      <label>Time
        <select data-chordsmith-global="timeSig">
          ${[3, 4, 5, 6, 7].map((timeSig) => `<option value="${timeSig}" ${pcs.timeSig === timeSig ? "selected" : ""}>${timeSig}/4</option>`).join("")}
        </select>
      </label>
      <label>Res
        <select data-chordsmith-global="resolution">
          ${[1, 2, 4, 8, 16].map((resolution) => `<option value="${resolution}" ${pcs.resolution === resolution ? "selected" : ""}>${resolution}/beat</option>`).join("")}
        </select>
      </label>
      <label>Add
        <select id="songSectionToAdd">
          ${SECTION_IDS.map((id) => `<option value="${id}" ${id === nextUnused ? "selected" : ""}>Section ${id}${sectionCounts.has(id) ? ` (${sectionCounts.get(id)})` : ""}</option>`).join("")}
        </select>
      </label>
      <button type="button" data-action="section-add">Add Section</button>
    </div>
  `;
}

function renderBarRuler(project: ReturnType<typeof currentProject>): string {
  const barTicks = Array.from({ length: project.timeline.bars + 1 }, (_, i) => {
    const bar = i + 1;
    const seconds = timelineSecondsAtBar(project, bar);
    const meter = effectiveMeterAtBar(project, bar);
    return `<span class="ruler-tick" data-ruler-meter="${bar}:${meter.numerator}/${meter.denominator}" title="${escapeAttr(`Bar ${bar} / ${meter.numerator}/${meter.denominator} / ${formatDuration(seconds)}`)}" style="left:${barLeftCalc(`${i} * var(--bar)`)}"><b>${bar}</b><small>${formatDuration(seconds)}</small></span>`;
  }).join("");
  const beatTicks = Array.from({ length: project.timeline.bars }, (_, barIndex) => {
    const bar = barIndex + 1;
    const meter = effectiveMeterAtBar(project, bar);
    const beatsPerBar = meter.numerator;
    return Array.from({ length: Math.max(0, beatsPerBar - 1) }, (_, beatIndex) => {
      const beat = beatIndex + 2;
      const beatOffset = (beat - 1) / beatsPerBar;
      const barPosition = bar + beatOffset;
      const seconds = timelineSecondsAtBar(project, barPosition);
      const left = sanitizeCssLengthOrNumber(barIndex + beatOffset, 0, 0, 4096);
      return `<span class="ruler-beat-tick" data-ruler-beat="${bar}:${beat}" data-ruler-meter="${bar}:${meter.numerator}/${meter.denominator}" style="left:${barLeftCalc(`${left} * var(--bar)`)}" title="${escapeAttr(`Bar ${bar} beat ${beat} / ${meter.numerator}/${meter.denominator} / ${formatDuration(seconds)}`)}"><small>${beat}</small></span>`;
    }).join("");
  }).join("");
  return `<div class="ruler" data-seek-ruler="true" title="Click to seek by bar or time">${barTicks}${beatTicks}</div>`;
}

function renderMarkers(state: AppState): string {
  const markers = currentProject(state).timeline.markers;
  if (!markers.length) return `<div class="marker-lane" aria-label="Markers"></div>`;
  return `
    <div class="marker-lane" aria-label="Markers">
      ${markers.map((marker) => `
        <div class="marker" style="left:${barLeftCalc(`${sanitizeCssLengthOrNumber(Number(marker.bar) - 1, 0)} * var(--bar)`)};--marker-colour:${sanitizeCssColor(marker.color, "#40d8ff")}">
          <span class="marker-rail" aria-hidden="true"></span>
          <span class="marker-actions">
            <button title="Rename marker" data-marker-rename="${sanitizeDataAttr(marker.id)}">${escapeHtml(markerDisplayName(marker))}</button>
            <button title="Delete marker" data-marker-delete="${sanitizeDataAttr(marker.id)}">x</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function markerDisplayName(marker: { name: string; markerType?: string; gameState?: GameStateMarkerId }): string {
  if (marker.markerType === "game-state" && marker.gameState) return `${gameStateMarkerLabel(marker.gameState)}: ${marker.name}`;
  return marker.name;
}

function renderTimelineRows(state: AppState): string {
  const project = currentProject(state);
  const branchCollapsed = drumBranchGroupCollapsed(project);
  const collapsedFolders = new Set(project.tracks.filter((track) => track.trackType === "folder" && track.metadata?.folderExpanded === false).map((track) => track.id));
  const rows = project.tracks.filter((track) => {
    if (track.trackType === "folder") return true;
    if (track.folderId && collapsedFolders.has(track.folderId)) return false;
    if (!((track.trackType === "generated" || track.trackType === "audio" || track.trackType === "midi") && track.role !== "arrangement")) return false;
    return !(branchCollapsed && generatedDrumBranchLane(track));
  });
  const clips = sortClips(project.timeline.clips);
  const pcs = getPrimaryChordsmithSource(project);
  const selectedClipIds = selectedClipIdSet(state);
  return rows
    .map((track) => {
      const branchLane = generatedDrumBranchLane(track);
      const branchAttrs = branchLane ? ` data-branch-group="drums" data-drum-branch-lane="${sanitizeDataAttr(branchLane)}"` : "";
      const folderChildAttrs = track.folderId ? ` data-folder-child="${sanitizeDataAttr(track.folderId)}"` : "";
      return `
        <div class="timeline-row ${track.trackType === "generated" ? "generated-edit-row" : ""} ${track.trackType === "folder" ? "folder-row" : ""} ${track.folderId ? "folder-child-row" : ""} ${branchLane ? "drum-branch-row" : ""} ${state.selectedTrackId === track.id ? "selected-row" : ""}" data-row="${sanitizeDataAttr(track.id)}"${branchAttrs}${folderChildAttrs}>
          ${renderTimelineTrackHeader(project, track, state.selectedTrackId === track.id, pcs)}
          ${clips.map((clip) => renderClip(project, clip, selectedClipIds.has(clip.id), track, !!pcs)).join("")}
          ${renderRecordingPreview(state, track)}
          ${renderInlineChordsmithEditor(state, pcs, track, clips)}
        </div>
      `;
    })
    .join("");
}

function renderTimelineTrackHeader(project: ReturnType<typeof currentProject>, track: Track, selected: boolean, pcs: SanitizedPcsProject | null): string {
  const lanes = trackHeaderLaneText(project, track, pcs);
  const branchEntry = track.role === "drums" && !generatedDrumBranchLane(track) ? ` data-drum-branch-entry="track" title="Double-click or right-click to branch generated drums"` : "";
  const canMuteSolo = track.role !== "master" && track.role !== "fx-return";
  const canSolo = canMuteSolo;
  const canRecord = !!track.recordKind && track.recordKind !== "none";
  const recordChannelLabel = recordingChannelLabel(track);
  const isFolder = track.trackType === "folder";
  const expanded = track.metadata?.folderExpanded !== false;
  const childCount = isFolder ? project.tracks.filter((item) => item.folderId === track.id).length : 0;
  return `
    <div class="timeline-track-header ${selected ? "selected" : ""} ${track.active === false ? "inactive" : ""}" data-track-id="${sanitizeDataAttr(track.id)}"${branchEntry}>
      <span class="track-colour" style="background:${safeTrackColour(track.colour)}"></span>
      <span class="timeline-track-text">
        <button type="button" class="timeline-track-name" data-track-rename="${sanitizeDataAttr(track.id)}" title="${escapeAttr(`Rename ${track.name}`)}">${escapeHtml(track.name)}</button>
        ${lanes ? `<span class="timeline-track-lanes">${escapeHtml(lanes)}</span>` : ""}
      </span>
      <span class="track-header-controls">
        ${isFolder ? `<button type="button" title="${escapeAttr(`${expanded ? "Collapse" : "Expand"} ${track.name}`)}" class="${expanded ? "on" : ""}" data-folder-toggle="${sanitizeDataAttr(track.id)}">${expanded ? "Collapse" : "Expand"}</button>` : ""}
        ${canMuteSolo ? `<button type="button" title="${escapeAttr(`Mute ${track.name}`)}" class="${track.mute ? "on" : ""}" data-mute-track="${sanitizeDataAttr(track.id)}">M</button>
        ${canSolo ? `<button type="button" title="${escapeAttr(`Solo ${track.name}`)}" class="${track.solo ? "on" : ""}" data-solo-track="${sanitizeDataAttr(track.id)}">S</button>` : ""}` : ""}
        ${canRecord ? `<button type="button" title="${escapeAttr(`Arm ${track.name} for ${recordChannelLabel.toLowerCase()} recording`)}" class="${track.armed ? "on record" : ""}" data-arm-track="${sanitizeDataAttr(track.id)}">R</button>
        <button type="button" title="${escapeAttr(`Monitor ${track.name} input during recording`)}" class="${track.monitorEnabled ? "on" : ""}" data-monitor-track="${sanitizeDataAttr(track.id)}">Mon</button>` : ""}
      </span>
      <span class="track-state">${isFolder ? `${childCount} lanes` : ""}${track.automationLaneIds.length ? "A" : ""}${track.armed ? "R" : ""}${canRecord ? recordChannelLabel.slice(0, 2) : ""}${track.monitorEnabled ? "Mon" : ""}${track.mute ? "M" : ""}${track.solo ? "S" : ""}${track.active === false ? "Off" : ""}</span>
    </div>
  `;
}

function selectedClipIdSet(state: AppState): Set<string> {
  return new Set([state.selectedClipId || "", ...(state.selectedClipIds || [])].filter(Boolean));
}

function trackHeaderLaneText(project: ReturnType<typeof currentProject>, track: Track, pcs: SanitizedPcsProject | null): string {
  const branchLane = generatedDrumBranchLane(track);
  if (branchLane) return `Drum branch: ${drumLaneLabel(branchLane)}`;
  if (track.role === "folder") return "Folder / organizer";
  if (track.folderId) {
    const folder = project.tracks.find((item) => item.id === track.folderId && item.trackType === "folder");
    if (folder) return `In ${folder.name}`;
  }
  if (track.role === "drums") return "Full kit lanes";
  if (track.role === "bass") return "Bass steps";
  if (track.role === "chords") return "Chord bars";
  if (track.role === "guitar") return "Guitar steps";
  if (track.role === "melody") {
    const index = selectedMelodyTrackIndex(track);
    const firstSection = pcs?.songSequence[0] || "A";
    const instrument = pcs?.sections[firstSection]?.melodyInstruments[index] || track.metadata?.chordsmithInstrument;
    return instrument ? instrumentLabel(String(instrument)) : `Melody ${index + 1} steps`;
  }
  return "";
}

function renderInlineChordsmithEditor(
  state: AppState,
  pcs: SanitizedPcsProject | null,
  track: Track,
  clips: Clip[]
): string {
  if (!pcs || track.trackType !== "generated") return "";
  if (!["drums", "bass", "chords", "melody", "guitar"].includes(track.role)) return "";
  return clips
    .filter((clip) => clip.type === "generated-section" && clip.sectionId)
    .map((clip) => renderInlineChordsmithClip(state, pcs, track, clip))
    .join("");
}

function renderInlineChordsmithClip(
  state: AppState,
  pcs: SanitizedPcsProject,
  track: Track,
  clip: Clip
): string {
  const sectionId = clip.sectionId as SectionId;
  const section = pcs.sections[sectionId];
  if (!section) return "";
  const stepsPerBar = Math.max(1, pcs.timeSig * pcs.resolution);
  const sourceStartBar = clipSourceStartBar(clip);
  const sourceStartStep = sourceStartBar * stepsPerBar;
  const sectionSteps = totalEditorSteps(pcs, section);
  const renderSteps = Math.max(0, Math.min(Math.round(clip.barLength * stepsPerBar), sectionSteps - sourceStartStep));
  if (renderSteps <= 0) return "";
  const left = barLeftCalc(`${clip.startBar - 1} * var(--bar)`);
  const width = `calc(${clip.barLength} * var(--bar))`;
  const project = currentProject(state);
  const branchLane = generatedDrumBranchLane(track);
  const body =
    track.role === "drums"
      ? branchLane
        ? renderInlineDrumBranchEditor(project, section, branchLane, sourceStartStep, renderSteps, state.chordsmithStepSelection)
        : renderInlineDrumEditor(section, sourceStartStep, renderSteps, state.chordsmithStepSelection)
      : track.role === "bass"
        ? renderInlineBassEditor(pcs, section, sourceStartStep, renderSteps, state.chordsmithStepSelection)
        : track.role === "chords"
          ? renderInlineChordEditor(section, sourceStartBar, Math.min(clip.barLength, section.bars - sourceStartBar))
          : track.role === "melody"
            ? renderInlineMelodyEditor(section, selectedMelodyTrackIndex(track), sourceStartStep, renderSteps, state.chordsmithStepSelection)
            : track.role === "guitar"
              ? renderInlineGuitarEditor(section, sourceStartStep, renderSteps)
              : "";
  if (!body) return "";
  return `
    <div class="inline-sequencer inline-${sanitizeDomId(track.role, "role")} ${selectedClipIdSet(state).has(clip.id) ? "selected-clip-editor" : ""}" data-inline-sequencer="true" data-inline-clip-id="${sanitizeDataAttr(clip.id)}" data-clip-id="${sanitizeDataAttr(clip.id)}" data-inline-row="${sanitizeDataAttr(track.id)}" data-row="${sanitizeDataAttr(track.id)}" data-inline-sequencer-role="${sanitizeDataAttr(track.role)}" data-inline-section="${sanitizeDataAttr(section.id)}"${track.role === "drums" ? ` data-drum-branch-entry="inline"` : ""} title="Drag empty space to move with snap. Ctrl-click or Cmd-click to select multiple clips. Drag the right handle to repeat the section.${track.role === "drums" ? " Double-click or right-click empty space to branch generated drums." : ""}" style="left:${left};width:${width};--inline-steps:${sanitizeCssLengthOrNumber(renderSteps, 0, 0, 256)};">
      <span class="clip-drag-handle" data-clip-drag-handle="${sanitizeDataAttr(clip.id)}" title="Drag to move this section with snap"></span>
      ${body}
      <span class="clip-loop-handle" data-clip-loop-handle="${sanitizeDataAttr(clip.id)}" title="Drag right to repeat this section"></span>
    </div>
  `;
}

function renderInlineDrumEditor(section: SanitizedPcsSection, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="inline-lane-grid drums-inline" aria-label="Drum steps">
      ${(["kick", "snare", "hat"] as const).map((lane) => `
        <div class="inline-lane" aria-label="${escapeAttr(drumLaneLabel(lane))}">
          <div class="inline-step-grid" style="grid-template-columns:repeat(${steps}, minmax(0, 1fr));">
            ${Array.from({ length: steps }, (_, step) => {
              const actualStep = startStep + step;
              const level = section.grid[lane][actualStep] || 0;
              const tuplet = !!section.gridTuplets[lane][actualStep];
              const selected = selection?.kind === "drums" && selection.sectionId === section.id && selection.lane === lane && selection.step === actualStep;
              return `<button class="step timeline-step step-${level} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="${escapeAttr(`${drumLaneLabel(lane)} step ${actualStep + 1}. Select then press T for tuplet.`)}" data-drum-step="${sanitizeDataAttr(`${section.id}:${lane}:${actualStep}`)}">${level === 2 ? "!" : level === 1 ? "x" : ""}${stepBadges({ tuplet })}</button>`;
            }).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderInlineDrumBranchEditor(project: ReturnType<typeof currentProject>, section: SanitizedPcsSection, lane: DrumLaneId, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="inline-lane-grid drums-inline branch-inline" aria-label="${escapeAttr(`${drumLaneLabel(lane)} branch steps`)}">
      <div class="inline-lane" aria-label="${escapeAttr(drumLaneLabel(lane))}">
        <div class="inline-step-grid" style="grid-template-columns:repeat(${steps}, minmax(0, 1fr));">
          ${Array.from({ length: steps }, (_, step) => {
            const actualStep = startStep + step;
            const level = branchDrumStepLevel(project, section, lane, actualStep);
            const tuplet = sourceDrumLane(lane) ? !!section.gridTuplets[lane][actualStep] : false;
            const selected = selection?.kind === "drums" && selection.sectionId === section.id && selection.lane === lane && selection.step === actualStep;
            const dataAttr = sourceDrumLane(lane) ? "data-drum-step" : "data-drum-branch-step";
            const title = sourceDrumLane(lane)
              ? `${drumLaneLabel(lane)} step ${actualStep + 1}. Select then press T for tuplet.`
              : `${drumLaneLabel(lane)} branch step ${actualStep + 1}. DAW-only source overlay.`;
            return `<button class="step timeline-step step-${level} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="${escapeAttr(title)}" ${dataAttr}="${sanitizeDataAttr(`${section.id}:${lane}:${actualStep}`)}">${level === 2 ? "!" : level === 1 ? "x" : ""}${stepBadges({ tuplet })}</button>`;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderInlineBassEditor(pcs: SanitizedPcsProject, section: SanitizedPcsSection, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="inline-lane single-inline-lane" aria-label="Bass steps">
      <div class="inline-step-grid" style="grid-template-columns:repeat(${steps}, minmax(0, 1fr));">
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const note = bassVisibleNoteIndex(pcs, section, actualStep);
          const auto = bassStepUsesAuto(pcs, section, actualStep);
          const accent = pcs.bassMode === "manual" ? !!section.bassAccent[actualStep] : (section.grid.bass[actualStep] || 0) === 2;
          const tuplet = !!section.gridTuplets.bass[actualStep];
          const selected = selection?.kind === "bass" && selection.sectionId === section.id && selection.step === actualStep;
          const title = auto ? `Auto bass step ${actualStep + 1}. Click to convert auto bass to editable manual notes.` : `Bass note step ${actualStep + 1}. Select then press H, S or T.`;
          return `<button class="step timeline-step note-step ${note === null ? "" : "on"} ${auto ? "auto-bass" : ""} ${accent ? "accent" : ""} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="${escapeAttr(title)}" data-bass-step="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${note === null ? "" : escapeHtml(BASS_LABELS[note] || String(note))}${stepBadges({ hold: !!section.bassHold[actualStep], slide: !!section.bassSlide[actualStep], tuplet })}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderInlineMelodyEditor(section: SanitizedPcsSection, trackIndex: number, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  const track = section.melodyTracks[trackIndex] || [];
  const instrument = section.melodyInstruments[trackIndex] || "synth";
  return `
    <div class="inline-lane single-inline-lane" aria-label="${escapeAttr(`${instrumentLabel(instrument)} steps`)}">
      <div class="inline-step-grid" style="grid-template-columns:repeat(${steps}, minmax(0, 1fr));">
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const note = track[actualStep];
          const tuplet = !!section.melodyTuplets[trackIndex]?.[actualStep];
          const selected = selection?.kind === "melody" && selection.sectionId === section.id && selection.trackIndex === trackIndex && selection.step === actualStep;
          return `<button class="step timeline-step note-step ${note === null || note === undefined ? "" : "on"} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="Melody ${trackIndex + 1} note step ${actualStep + 1}. Select then press H, S or T." data-melody-step="${sanitizeDataAttr(`${section.id}:${trackIndex}:${actualStep}`)}">${note === null || note === undefined ? "" : escapeHtml(BASS_LABELS[note] || String(note))}${stepBadges({ hold: !!section.melodyHold[trackIndex]?.[actualStep], slide: !!section.melodySlide[trackIndex]?.[actualStep], tuplet })}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderInlineGuitarEditor(section: SanitizedPcsSection, startStep: number, steps: number): string {
  return `
    <div class="inline-lane single-inline-lane" aria-label="Guitar steps">
      <div class="inline-step-grid" style="grid-template-columns:repeat(${steps}, minmax(0, 1fr));">
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const art = section.guitarPattern[actualStep] || "off";
          return `<button class="step timeline-step guitar-step ${art !== "off" ? "on" : ""}" title="${escapeAttr(`Guitar ${instrumentLabel(art)} step ${actualStep + 1}`)}" data-guitar-step="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${escapeHtml(GUITAR_LABELS[art] || art.slice(0, 2))}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderInlineChordEditor(section: SanitizedPcsSection, startBar: number, bars: number): string {
  if (bars <= 0) return "";
  return `
    <div class="inline-chord-grid" style="grid-template-columns:repeat(${bars}, minmax(38px, 1fr));">
      ${Array.from({ length: bars }, (_, index) => {
        const bar = startBar + index;
        const degree = section.progression[bar] || 0;
        return `
          <label title="Section ${section.id} bar ${bar + 1} chord">
            <span>${bar + 1}</span>
            <select data-section-chord="${sanitizeDataAttr(`${section.id}:${bar}`)}">
              ${CHORD_LABELS.map((label, value) => `<option value="${value}" ${degree === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderClip(project: ReturnType<typeof currentProject>, clip: Clip, selected: boolean, track: Track, inlineGeneratedEditorAvailable = false): string {
  if (clip.type === "audio" && clip.trackId !== track.id) return "";
  if (clip.type === "midi" && clip.trackId !== track.id) return "";
  if (inlineGeneratedEditorAvailable && clip.type === "generated-section" && track.trackType === "generated") return "";
  if (clip.type !== "audio" && clip.type !== "midi" && track.trackType !== "generated") return "";
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) : null;
  const peaks = Array.isArray(media?.metadata?.waveformPeaks) ? media.metadata.waveformPeaks.slice(0, 48) : [];
  const midi = clip.type === "midi" ? midiDataFromClip(clip) : null;
  const branchEntry = clip.type === "generated-section" && track.role === "drums" ? ` data-drum-branch-entry="clip"` : "";
  const title = `Drag to move with snap. Ctrl-click or Cmd-click to select multiple clips. Drag the right handle to repeat generated sections.${branchEntry ? " Double-click or right-click to branch generated drums." : ""}`;
  return `
    <button class="clip ${selected ? "selected" : ""} ${clip.muted ? "muted" : ""} ${clip.type === "audio" ? "audio-clip" : ""} ${clip.type === "midi" ? "midi-clip" : ""}" data-clip-id="${sanitizeDataAttr(clip.id)}" data-row="${sanitizeDataAttr(track.id)}"${branchEntry} title="${escapeAttr(title)}" style="left:${barLeftCalc(`${sanitizeCssLengthOrNumber(Number(clip.startBar) - 1, 0)} * var(--bar)`)};width:calc(${sanitizeCssLengthOrNumber(clip.barLength, 1, 0.125, 4096)} * var(--bar));border-color:${safeClipColour(clip.color)};background:color-mix(in srgb, ${safeClipColour(clip.color)} 28%, #15192a);">
      <strong>${escapeHtml(clip.sectionId || clip.name)}</strong>
      <span>${escapeHtml(clip.type === "audio" ? media?.name || "Audio" : clip.type === "midi" ? `${midi?.notes.length || 0} MIDI notes` : track.name)}</span>
      ${peaks.length ? `<i class="clip-waveform">${peaks.map((peak) => `<b style="height:${Math.max(2, Math.round(Number(peak) * 18))}px"></b>`).join("")}</i>` : ""}
      ${midi?.notes.length ? `<i class="midi-note-strip">${midi.notes.slice(0, 32).map((note) => `<b style="left:${Math.max(0, Math.min(100, (note.startTick / Math.max(1, midi.ppq * clip.barLength * project.project.timeSig)) * 100))}%;width:${Math.max(3, Math.min(24, (note.durationTicks / Math.max(1, midi.ppq * clip.barLength * project.project.timeSig)) * 100))}%;bottom:${Math.max(2, Math.min(24, (note.pitch - 36) / 3))}px"></b>`).join("")}</i>` : ""}
      ${clip.type === "generated-section" ? `<span class="clip-drag-handle" data-clip-drag-handle="${sanitizeDataAttr(clip.id)}" title="Drag to move this section with snap"></span><span class="clip-loop-handle" data-clip-loop-handle="${sanitizeDataAttr(clip.id)}" title="Drag right to repeat this section"></span>` : ""}
    </button>
  `;
}

function renderRecordingPreview(state: AppState, track: Track): string {
  const project = currentProject(state);
  const recording = state.recording;
  if (recording.trackId !== track.id || !["preparing", "count-in", "recording", "stopping"].includes(recording.status)) return "";
  const startBar = recording.startBar || state.playheadBar || 1;
  const secondsPerBar = Math.max(0.001, project.project.timeSig * (60 / Math.max(1, project.project.bpm)));
  const barLength = recording.status === "preparing" || recording.status === "count-in" ? 0.25 : Math.max(0.25, recording.elapsedSeconds / secondsPerBar);
  const peaks = recording.livePeaks.length ? recording.livePeaks : [recording.inputPeak || 0.05];
  const label = recording.status === "preparing" ? "Preparing" : recording.status === "count-in" ? "Count-in" : recording.status === "stopping" ? "Writing take" : "Recording";
  return `
    <div class="clip recording-preview" data-recording-preview="true" data-timeline-non-seek="true" style="left:${barLeftCalc(`${sanitizeCssLengthOrNumber(startBar - 1, 0)} * var(--bar)`)};width:calc(${sanitizeCssLengthOrNumber(barLength, 0.25, 0.125, 4096)} * var(--bar));border-color:${safeClipColour(track.colour)};">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(recording.inputDeviceName || "Default input")}</span>
      <i class="clip-waveform live-waveform">${peaks.map((peak) => `<b style="height:${Math.max(2, Math.round(Number(peak) * 20))}px"></b>`).join("")}</i>
    </div>
  `;
}

function barLeftPx(px: number): string {
  return `calc(var(--track-header) + ${Math.round(px)}px)`;
}

function barLeftCalc(expression: string): string {
  return `calc(var(--track-header) + (${expression}))`;
}

function renderInspector(state: AppState, project: ReturnType<typeof currentProject>, clip: Clip | null, track: Track | null): string {
  const chain = project && track ? getTrackFxChain(project, track) : null;
  const pcs = getPrimaryChordsmithSource(project);
  const clipMedia = clip?.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null : null;
  const clipMediaStatus = clipMedia ? mediaPoolStatus(clipMedia) : null;
  const clipCollapsed = isUiSectionCollapsed(state, "inspector-clip");
  const trackCollapsed = isUiSectionCollapsed(state, "inspector-track");
  return `
    <aside class="inspector" data-scroll-key="inspector">
      <div class="panel-title">Inspector</div>
      ${
        clip
          ? `<section class="inspector-section ${clipCollapsed ? "collapsed" : ""}" data-ui-collapse-section="inspector-clip">
              <header class="section-collapse-head">
                <div>
                  <h2>${escapeHtml(clip.name)}</h2>
                  <span>${escapeHtml(clip.type)} / Bar ${clip.startBar} / ${clip.barLength} bars</span>
                </div>
                ${renderUiSectionToggle(state, "inspector-clip")}
              </header>
              ${
                clipCollapsed
                  ? renderCollapsedNotice("Selected clip details, mix controls and edit actions are hidden.")
                  : `
                    <dl>
                      <dt>Type</dt><dd>${clip.type}</dd>
                      <dt>Section</dt><dd>${escapeHtml(clip.sectionId || "-")}</dd>
                      <dt>Start</dt><dd>Bar ${clip.startBar}</dd>
                      <dt>Length</dt><dd>${clip.barLength} bars</dd>
                      <dt>Linked</dt><dd>${clip.linked ? "Yes" : "No"}</dd>
                      ${clip.type === "audio" ? `<dt>Media</dt><dd>${escapeHtml(clipMedia?.name || "Missing media")}</dd><dt>Status</dt><dd>${escapeHtml(clipMediaStatus?.label || "Missing")}</dd><dt>Duration</dt><dd>${formatDuration(clipMedia?.durationSeconds)}</dd>` : ""}
                      ${clip.type === "midi" ? renderMidiClipMetadata(clip, clipMedia, clipMediaStatus) : ""}
                    </dl>
                    <div class="inspector-field-group" aria-label="Clip mix controls">
                      <h3>Clip mix</h3>
                      <p class="editor-note">These values affect this selected clip only.</p>
                      <label>Transpose <input data-clip-transform="${sanitizeDataAttr(`${clip.id}:transpose`)}" type="number" min="-48" max="48" step="1" value="${sanitizeCssLengthOrNumber(clip.transforms.transpose, 0, -48, 48)}" ${clip.type === "audio" ? "disabled title=\"Audio clip pitch shifting is not available yet.\"" : "title=\"Transpose this clip in semitones\""}></label>
                      ${clip.type === "audio" ? renderAudioClipProperties(project, clip) : `<label>Gain <input data-clip-transform="${sanitizeDataAttr(`${clip.id}:gain`)}" type="number" min="0" max="4" step="0.05" value="${sanitizeCssLengthOrNumber(clip.transforms.gain, 1, 0, 4)}" title="Scale this clip's playback gain without changing the source material"></label>`}
                    </div>
                    ${clip.type === "generated-section" ? renderGeneratedClipStemMutes(clip) : ""}
                    ${renderClipEditPalette()}
                    <button type="button" data-action="freeze-selected-clip" title="Render the selected clip into a reusable audio asset">Freeze</button>
                    <button type="button" data-action="export-selected-clip-midi" ${clip.type === "audio" ? "disabled title=\"Audio clips do not contain MIDI events.\"" : "title=\"Export the selected clip as a MIDI file\""}>Export Clip MIDI</button>
                    ${clip.type === "midi" ? renderMidiClipEditor(project, state, clip) : ""}
                  `
              }
            </section>`
          : `<p>Select a clip to inspect it.</p>`
      }
      ${
        track
          ? `<section class="inspector-section ${trackCollapsed ? "collapsed" : ""}" data-ui-collapse-section="inspector-track">
              <header class="section-collapse-head">
                <div>
                  <h2>${escapeHtml(track.name)}</h2>
                  <span>${escapeHtml(track.trackType)} / ${escapeHtml(track.role)}</span>
                </div>
                ${renderUiSectionToggle(state, "inspector-track")}
              </header>
              ${
                trackCollapsed
                  ? renderCollapsedNotice("Selected track routing, automation and Chordsmith editors are hidden.")
                  : `
                    <dl>
                      <dt>Type</dt><dd>${track.trackType}</dd>
                      <dt>Role</dt><dd>${track.role}</dd>
                      <dt>Arm</dt><dd>${track.recordKind && track.recordKind !== "none" ? (track.armed ? "Armed" : "Available") : "Not record-capable"}</dd>
                      <dt>Routing</dt><dd>${escapeHtml(track.routing.outputId || "none")}</dd>
                    </dl>
                    ${track.trackType === "folder" ? renderFolderTrackNote(track) : `
                      ${renderTrackFolderSelector(project, track)}
                      ${renderInputSelector(project, track)}
                      ${renderOutputSelector(project, track)}
                      ${renderSendPanel(project, track)}
                      ${(track.trackType === "generated" || track.trackType === "midi") ? `<button type="button" data-action="export-selected-track-midi" title="Export all MIDI-capable clips on this track">Export Track MIDI</button>` : ""}
                      ${renderAutomationPanel(project, track)}
                      ${renderChordsmithSequencer(state, project, pcs, clip, track)}
                      ${track.role === "drums" ? renderDrumLaneMixer(project) : ""}
                      ${renderFxInspector(project, chain)}
                    `}
                  `
              }
            </section>`
          : ""
      }
    </aside>
  `;
}

function renderFolderTrackNote(track: Track): string {
  const expanded = track.metadata?.folderExpanded !== false;
  return `
    <div class="folder-track-note" aria-label="Folder track behavior">
      <p class="editor-note">${escapeHtml(track.name)} organizes timeline lanes and can be renamed like any other track.</p>
      <p class="editor-note">Mute and Solo act as group controls for child lanes. The folder itself still does not process audio, carry FX, route sends, or create export stems.</p>
      <dl>
        <dt>Folder state</dt><dd>${expanded ? "Expanded" : "Collapsed"}</dd>
        <dt>Group mute</dt><dd>${track.mute ? "On" : "Off"}</dd>
        <dt>Group solo</dt><dd>${track.solo ? "On" : "Off"}</dd>
        <dt>Audio routing</dt><dd>None</dd>
      </dl>
    </div>
  `;
}

function renderTrackFolderSelector(project: ReturnType<typeof currentProject>, track: Track): string {
  if (!["generated", "audio", "midi"].includes(track.trackType)) return "";
  const folders = project.tracks.filter((item) => item.trackType === "folder");
  if (!folders.length) return "";
  return `
    <label>Folder
      <select data-track-folder="${sanitizeDataAttr(track.id)}" title="Place this timeline lane inside an organizational folder">
        <option value="">No folder</option>
        ${folders.map((folder) => `<option value="${escapeAttr(folder.id)}" ${track.folderId === folder.id ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderGeneratedClipStemMutes(clip: Clip): string {
  const stems = [
    ["drums", "Drums"],
    ["bass", "Bass"],
    ["chords", "Chords"],
    ["melody", "Melody"],
    ["guitar", "Guitar"]
  ] as const;
  const mutes = clip.transforms.stemMutes || {};
  return `
    <div class="clip-stem-mutes" aria-label="Generated clip stem mutes">
      <div class="inspector-subhead">
        <h3>Section stem mutes</h3>
        <p>Checked roles are muted only for this generated clip. The original Chordsmith source stays unchanged.</p>
      </div>
      ${stems.map(([stem, label]) => `
        <label class="checkbox-row" title="Mute or unmute ${label} in this generated clip only">
          <input type="checkbox" data-clip-stem-mute="${sanitizeDataAttr(`${clip.id}:${stem}`)}" ${mutes[stem] ? "checked" : ""} title="Checked means ${label} is muted in this clip">
          <span>Mute ${label}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderClipEditPalette(): string {
  return `
    <div class="clip-edit-palette" aria-label="Selected clip edit actions">
      <h3>Edit</h3>
      <p class="editor-note">These edit the selected clip or the active edit range and can be undone.</p>
      <div class="clip-edit-grid">
        <button type="button" data-action="clip-copy" title="Copy the selected clip to the clipboard">Copy</button>
        <button type="button" data-action="clip-cut" title="Cut the selected clip to the clipboard">Cut</button>
        <button type="button" data-action="clip-paste" title="Paste the copied clip at the cursor">Paste</button>
        <button type="button" data-action="clip-duplicate" title="Duplicate the selected clip after itself">Duplicate</button>
        <button type="button" data-action="clip-split" title="Split the selected clip at the playhead">Split</button>
        <button type="button" data-action="range-selected" title="Use the selected clip as the edit range">Range Clip</button>
        <button type="button" data-action="range-copy" title="Copy the selected clip material inside the active edit range">Copy Range</button>
        <button type="button" data-action="range-cut" title="Cut the selected clip material inside the active edit range">Cut Range</button>
        <button type="button" data-action="range-split" title="Split clips at the edit range boundaries">Split Range</button>
        <button type="button" data-action="range-crop" title="Keep only the active edit range">Crop Range</button>
        <button type="button" data-action="range-delete" title="Delete material inside the active edit range">Delete Range</button>
        <button type="button" data-action="range-ripple-delete" title="Delete the active range and close the gap on selected tracks">Ripple Delete</button>
        <button type="button" data-action="range-ripple-all" title="Delete the active range and close the gap across all tracks">Ripple All</button>
        <button type="button" data-action="trim-start-left" title="Move the clip start earlier by one snap step">Start left</button>
        <button type="button" data-action="trim-start-right" title="Move the clip start later by one snap step">Start right</button>
        <button type="button" data-action="trim-end-left" title="Move the clip end earlier by one snap step">End left</button>
        <button type="button" data-action="trim-end-right" title="Move the clip end later by one snap step">End right</button>
        <button type="button" data-action="clip-mute" title="Mute or unmute the selected clip without deleting it">Mute</button>
        <button type="button" data-action="clip-delete" title="Delete the selected clip">Delete</button>
      </div>
    </div>
  `;
}

function renderAudioClipProperties(project: ReturnType<typeof currentProject>, clip: Clip): string {
  const metadata = clip.metadata || {};
  const gain = typeof metadata.gain === "number" ? metadata.gain : clip.transforms.gain;
  const sourceOffsetSeconds = typeof metadata.sourceOffsetSeconds === "number" ? metadata.sourceOffsetSeconds : 0;
  const fadeInSeconds = typeof metadata.fadeInSeconds === "number" ? metadata.fadeInSeconds : 0;
  const fadeOutSeconds = typeof metadata.fadeOutSeconds === "number" ? metadata.fadeOutSeconds : 0;
  const playbackRate = typeof metadata.playbackRate === "number" ? metadata.playbackRate : 1;
  const pitchSemitones = typeof metadata.pitchSemitones === "number" ? metadata.pitchSemitones : 0;
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null : null;
  const durationSeconds = typeof metadata.durationSeconds === "number"
    ? metadata.durationSeconds
    : Math.min(
      barsToSeconds(clip.barLength || 0, project.project.bpm, project.project.timeSig),
      Math.max(0, (media?.durationSeconds || barsToSeconds(clip.barLength || 0, project.project.bpm, project.project.timeSig)) - sourceOffsetSeconds)
    );
  return `
    <div class="audio-clip-properties" aria-label="Audio clip properties">
      <p class="editor-note">Audio clip settings are source-safe metadata for this timeline clip only.</p>
      <label>Gain <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:gain`)}" type="number" min="0" max="4" step="0.05" value="${sanitizeCssLengthOrNumber(gain, 1, 0, 4)}" title="Scale this audio clip's playback gain without rewriting the source file."></label>
      <label>Fade in <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:fadeInSeconds`)}" type="number" min="0" max="86400" step="0.01" value="${sanitizeCssLengthOrNumber(fadeInSeconds, 0, 0, 86400)}" title="Fade in from the clip start in seconds."></label>
      <label>Fade out <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:fadeOutSeconds`)}" type="number" min="0" max="86400" step="0.01" value="${sanitizeCssLengthOrNumber(fadeOutSeconds, 0, 0, 86400)}" title="Fade out before the clip end in seconds."></label>
      <label>Source offset <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:sourceOffsetSeconds`)}" type="number" min="0" max="86400" step="0.01" value="${sanitizeCssLengthOrNumber(sourceOffsetSeconds, 0, 0, 86400)}" title="Start playback from this many seconds into the source audio."></label>
      <label>Duration <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:durationSeconds`)}" type="number" min="0" max="86400" step="0.01" value="${sanitizeCssLengthOrNumber(durationSeconds, 0, 0, 86400)}" title="Limit this timeline clip's audio duration in seconds."></label>
      <label>Rate <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:playbackRate`)}" type="number" min="0.25" max="4" step="0.01" value="${sanitizeCssLengthOrNumber(playbackRate, 1, 0.25, 4)}" title="Play this clip faster or slower as source-safe varispeed metadata."></label>
      <label>Pitch <input data-audio-clip-property="${sanitizeDataAttr(`${clip.id}:pitchSemitones`)}" type="number" min="-48" max="48" step="1" value="${sanitizeCssLengthOrNumber(pitchSemitones, 0, -48, 48)}" title="Pitch-as-speed semitone metadata for varispeed playback; pitch-preserving correction is future work."></label>
      ${renderAudioTakePanel(project, clip)}
      <div class="audio-clip-actions" aria-label="Audio clip actions">
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:quick-fade`)}" title="Apply short fade in and fade out to this audio clip">Short fades</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:reset-fades`)}" title="Clear this audio clip's fades">Reset fades</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:normalize-gain`)}" title="Set clip gain from the analyzed peak level">Normalize</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:analyze-transients`)}" title="Analyze likely transient points in this clip">Analyze</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:create-warp-markers`)}" title="Create metadata warp markers from analyzed transients">Warp markers</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:quantize-warp-markers-1/4`)}" title="Snap warp marker targets to the quarter-note grid as metadata; playback stretching is future work">Warp Q 1/4</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:quantize-warp-markers-1/8`)}" title="Snap warp marker targets to the eighth-note grid as metadata; playback stretching is future work">Warp Q 1/8</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:quantize-warp-markers-1/16`)}" title="Snap warp marker targets to the sixteenth-note grid as metadata; playback stretching is future work">Warp Q 1/16</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:quantize-warp-markers-1/32`)}" title="Snap warp marker targets to the thirty-second-note grid as metadata; playback stretching is future work">Warp Q 1/32</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:apply-warp-varispeed`)}" title="Apply a source-safe global varispeed rate from the first and last warp markers; pitch changes with speed">Apply warp rate</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:clear-warp-markers`)}" title="Clear metadata warp markers from this clip">Clear warp</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:crossfade-overlap`)}" title="Create a crossfade with an overlapping neighboring clip">Crossfade</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:create-crossfade-left`)}" title="Create an overlap fade at the left edge of this clip">Overlap fade</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:invert-phase`)}" title="Invert this clip's phase">Invert phase</button>
        <button type="button" data-audio-clip-action="${sanitizeDataAttr(`${clip.id}:reverse`)}" title="Reverse this audio clip nondestructively">Reverse</button>
      </div>
      ${renderAudioWarpMarkerPanel(clip)}
      ${renderAudioClipAutomationPanel(project, clip)}
    </div>
  `;
}

function renderAudioWarpMarkerPanel(clip: Clip): string {
  const markers = audioWarpMarkersForUi(clip);
  const metadata = clip.metadata || {};
  if (!markers.length) return `<div class="audio-warp-panel"><span>Warp: none</span></div>`;
  const mode = typeof metadata.audioWarpPlaybackMode === "string" ? metadata.audioWarpPlaybackMode : "metadata-only";
  return `
    <div class="audio-warp-panel" aria-label="Audio warp markers">
      <span>Warp: ${markers.length} marker${markers.length === 1 ? "" : "s"} / ${escapeHtml(mode)}</span>
      <div class="audio-warp-list">
        ${markers.slice(0, 6).map((marker) => `
          <div class="audio-warp-marker-row" title="${escapeAttr(`${marker.id}: source ${marker.sourceSeconds.toFixed(2)}s targets Bar ${marker.targetBar}`)}">
            <span>${escapeHtml(marker.sourceSeconds.toFixed(2))}s</span>
            <label>Target
              <input
                data-audio-warp-marker-target="${sanitizeDataAttr(`${clip.id}:${marker.id}`)}"
                type="number"
                min="1"
                max="9999"
                step="0.001"
                value="${sanitizeCssLengthOrNumber(marker.targetBar, 1, 1, 9999)}"
                title="Move this warp marker target bar without changing its source audio anchor."
              >
            </label>
            <button
              type="button"
              data-audio-warp-marker-delete="${sanitizeDataAttr(`${clip.id}:${marker.id}`)}"
              title="Delete this warp marker without deleting the source audio."
            >Delete</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAudioTakePanel(project: ReturnType<typeof currentProject>, clip: Clip): string {
  const summary = audioClipTakeSummary(project, clip.id);
  if (!summary || summary.takeCount < 2) return "";
  return `
    <div class="audio-take-panel" aria-label="Audio take lanes" data-ui-scope="recording">
      <h3>Take Lanes</h3>
      <p class="editor-note">${escapeHtml(summary.groupId)} - Take ${summary.takeNumber} of ${summary.takeCount}${summary.active ? " active" : " muted"}</p>
      <div class="audio-take-lane-overview" aria-label="Take lane overview">
        ${summary.lanes.map((lane) => {
          const laneState = lane.archivedClipCount === lane.clipCount ? "archived" : lane.activeClipCount ? "active" : "muted";
          const segmentLabel = lane.clipCount === 1 ? "1 segment" : `${lane.clipCount} segments`;
          const rangeLabel = `${formatBarBeat(project, lane.startBar)} to ${formatBarBeat(project, lane.endBar)}`;
          return `
            <div class="audio-take-lane-card" data-audio-take-lane-summary="${sanitizeDataAttr(`${lane.takeLaneId}:${laneState}`)}" title="${escapeAttr(`${lane.takeLaneId}: ${segmentLabel}, bars ${rangeLabel}`)}">
              <strong>Lane ${lane.takeNumber}</strong>
              <span>${escapeHtml(laneState)} / ${escapeHtml(segmentLabel)} / bars ${escapeHtml(rangeLabel)}</span>
              <small>${lane.activeClipCount} active / ${lane.mutedClipCount} muted / ${lane.archivedClipCount} archived</small>
            </div>
          `;
        }).join("")}
      </div>
      <div class="audio-take-buttons">
        ${summary.siblings.map((take) => `
          <span class="audio-take-row" data-audio-take-status="${sanitizeDataAttr(`${take.clipId}:${take.takeStatus}`)}">
            <button type="button" data-audio-take-activate="${sanitizeDataAttr(take.clipId)}" ${take.clipId === clip.id || take.archived ? "disabled" : ""} title="Make this take the active clip in the take group">
              Take ${take.takeNumber} ${take.archived ? "archived" : take.active ? "active" : "muted"}
            </button>
            <button type="button" data-audio-take-lane-activate="${sanitizeDataAttr(take.clipId)}" ${take.archived ? "disabled" : ""} title="Activate every clip in this take lane for auditioning">Lane</button>
            ${
              take.archived
                ? `<button type="button" data-audio-take-restore="${sanitizeDataAttr(take.clipId)}" title="Restore this archived take to the take group">Restore</button>`
                : `<button type="button" data-audio-take-archive="${sanitizeDataAttr(take.clipId)}" title="Archive this take without deleting the source media">Archive</button>`
            }
          </span>
        `).join("")}
      </div>
      <button type="button" data-action="audio-take-comp-from-playhead" title="Comp this take group starting at the current playhead">Comp from playhead</button>
      <button type="button" data-action="audio-take-comp-range" title="Use this take only inside the active edit range">Comp range</button>
    </div>
  `;
}

function renderAudioClipAutomationPanel(project: ReturnType<typeof currentProject>, clip: Clip): string {
  const fields: Array<{ field: ClipAutomationField; label: string; min: number; max: number; step: number }> = [
    { field: "gain", label: "Gain", min: 0, max: 4, step: 0.01 },
    { field: "fadeInSeconds", label: "Fade in", min: 0, max: 86400, step: 0.01 },
    { field: "fadeOutSeconds", label: "Fade out", min: 0, max: 86400, step: 0.01 },
    { field: "sourceOffsetSeconds", label: "Source offset", min: 0, max: 86400, step: 0.01 }
  ];
  return `
    <div class="automation-panel clip-automation ${clipHasAutomation(project, clip.id) ? "active" : ""}">
      <h3>Clip Automation</h3>
      ${fields.map((config) => renderClipAutomationLane(clip, config, getClipAutomationLane(project, clip.id, config.field))).join("")}
    </div>
  `;
}

function renderClipAutomationLane(
  clip: Clip,
  config: { field: ClipAutomationField; label: string; min: number; max: number; step: number },
  lane: ReturnType<typeof getClipAutomationLane>
): string {
  if (!lane) {
    return `<div class="automation-lane empty"><span>${escapeHtml(config.label)}</span><button type="button" data-clip-automation-create="${sanitizeDataAttr(`${clip.id}:${config.field}`)}" title="Create ${escapeAttr(config.label.toLowerCase())} automation for this audio clip">Create</button></div>`;
  }
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar);
  const label = `${config.label} automation`;
  return `
    <div class="automation-lane">
      <header>
        <label class="inline-toggle"><input data-automation-enabled="${sanitizeDataAttr(lane.id)}" type="checkbox" ${lane.enabled ? "checked" : ""}> ${escapeHtml(config.label)}</label>
        <button type="button" data-clip-automation-add-point="${sanitizeDataAttr(`${clip.id}:${config.field}`)}" title="Add ${escapeAttr(config.label.toLowerCase())} automation at the playhead">Add at Playhead</button>
      </header>
      ${renderAutomationCurveSurface(lane, label)}
      ${
        points.length
          ? `<div class="automation-points">
              ${points.map((point, index) => `
                <div class="automation-point">
                  <label>Bar <input data-automation-point-bar="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="1" step="0.25" value="${sanitizeCssLengthOrNumber(point.bar, 1, 1, 4096)}"></label>
                  <label>Value <input data-automation-point-value="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="${config.min}" max="${config.max}" step="${config.step}" value="${sanitizeCssLengthOrNumber(point.value, config.field === "gain" ? 1 : 0, config.min, config.max)}"></label>
                  ${renderAutomationCurveSelect(lane.id, index, point)}
                  <button type="button" data-automation-delete-point="${sanitizeDataAttr(`${lane.id}:${index}`)}">Delete</button>
                </div>
              `).join("")}
            </div>`
          : `<p class="editor-note">No points yet.</p>`
      }
    </div>
  `;
}

function renderAutomationCurveSelect(laneId: string, index: number, point: AutomationPoint): string {
  const selectedCurve = point.curve || "linear";
  const curves: Array<NonNullable<AutomationPoint["curve"]>> = ["linear", "hold", "ease-in", "ease-out"];
  const labels: Record<NonNullable<AutomationPoint["curve"]>, string> = {
    "linear": "Linear",
    "hold": "Hold",
    "ease-in": "Ease in",
    "ease-out": "Ease out"
  };
  return `
    <label>Curve
      <select data-automation-point-curve="${sanitizeDataAttr(`${laneId}:${index}`)}">
        ${curves.map((curve) => `<option value="${escapeAttr(curve)}" ${selectedCurve === curve ? "selected" : ""}>${escapeHtml(labels[curve])}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderAutomationCurveSurface(lane: AutomationLane, label: string): string {
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar || (a.beat || 0) - (b.beat || 0) || (a.tick || 0) - (b.tick || 0));
  const minValue = Number.isFinite(lane.min) ? Number(lane.min) : Math.min(0, ...points.map((point) => point.value));
  const maxValue = Number.isFinite(lane.max) ? Number(lane.max) : Math.max(1, ...points.map((point) => point.value));
  const minBar = Math.max(1, Math.min(1, ...points.map((point) => point.bar)));
  const maxPointBar = Math.max(minBar + 1, ...points.map((point) => point.bar));
  const maxBar = Math.max(minBar + 4, maxPointBar + 1);
  const width = 240;
  const height = 64;
  const path = automationPathData(points, minBar, maxBar, minValue, maxValue, width, height);
  return `
    <button
      type="button"
      class="automation-curve-surface"
      data-automation-lane-surface="${sanitizeDataAttr(lane.id)}"
      data-automation-lane-start-bar="${escapeAttr(String(minBar))}"
      data-automation-lane-end-bar="${escapeAttr(String(maxBar))}"
      data-automation-lane-min="${escapeAttr(String(minValue))}"
      data-automation-lane-max="${escapeAttr(String(maxValue))}"
      aria-label="${escapeAttr(`${label}: click to add a point`)}"
      title="${escapeAttr(`${label}: click to add a point`)}"
    >
      <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
        <line class="automation-grid-line" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}"></line>
        ${path ? `<path class="automation-curve-line" d="${escapeAttr(path)}"></path>` : ""}
        ${points.map((point) => {
          const { x, y } = automationPointToSvg(point.bar, point.value, minBar, maxBar, minValue, maxValue, width, height);
          return `<circle class="automation-curve-point" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.2"></circle>`;
        }).join("")}
      </svg>
      <span>Draw</span>
    </button>
  `;
}

function automationPathData(points: AutomationPoint[], minBar: number, maxBar: number, minValue: number, maxValue: number, width: number, height: number): string {
  if (!points.length) return "";
  if (points.length === 1) {
    const { x, y } = automationPointToSvg(points[0].bar, points[0].value, minBar, maxBar, minValue, maxValue, width, height);
    return `M ${x.toFixed(2)} ${y.toFixed(2)} L ${width.toFixed(2)} ${y.toFixed(2)}`;
  }
  const samples: Array<{ x: number; y: number }> = [];
  const sorted = points.slice().sort((a, b) => a.bar - b.bar);
  sorted.forEach((point, index) => {
    if (index === sorted.length - 1) {
      samples.push(automationPointToSvg(point.bar, point.value, minBar, maxBar, minValue, maxValue, width, height));
      return;
    }
    const next = sorted[index + 1];
    const steps = point.curve === "hold" ? 1 : point.curve === "linear" || !point.curve ? 1 : 8;
    for (let step = 0; step <= steps; step += 1) {
      const t = steps <= 1 ? step : step / steps;
      const bar = point.bar + (next.bar - point.bar) * t;
      const value = point.curve === "hold" && step > 0 ? point.value : interpolateAutomationValue(point.value, next.value, t, point.curve);
      samples.push(automationPointToSvg(bar, value, minBar, maxBar, minValue, maxValue, width, height));
    }
    if (point.curve === "hold") samples.push(automationPointToSvg(next.bar, next.value, minBar, maxBar, minValue, maxValue, width, height));
  });
  return samples.map((sample, index) => `${index === 0 ? "M" : "L"} ${sample.x.toFixed(2)} ${sample.y.toFixed(2)}`).join(" ");
}

function automationPointToSvg(bar: number, value: number, minBar: number, maxBar: number, minValue: number, maxValue: number, width: number, height: number): { x: number; y: number } {
  const barSpan = Math.max(0.0001, maxBar - minBar);
  const valueSpan = Math.max(0.0001, maxValue - minValue);
  const x = ((bar - minBar) / barSpan) * width;
  const y = height - ((value - minValue) / valueSpan) * height;
  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y))
  };
}

function renderAutomationPanel(project: ReturnType<typeof currentProject>, track: Track): string {
  if (track.role === "master" || track.trackType === "return" || track.trackType === "folder") return "";
  return `
    <div class="automation-panel ${trackHasAutomation(project, track.id) ? "active" : ""}">
      <h3>Automation</h3>
      ${renderAutomationLane(project, track, "volume")}
      ${renderAutomationLane(project, track, "pan")}
    </div>
  `;
}

function renderAutomationLane(project: ReturnType<typeof currentProject>, track: Track, field: "volume" | "pan"): string {
  const lane = getTrackAutomationLane(project, track.id, field);
  const label = field === "volume" ? "Volume multiplier" : "Pan";
  if (!lane) {
    return `<div class="automation-lane empty"><span>${label}</span><button type="button" data-automation-create="${sanitizeDataAttr(`${track.id}:${field}`)}">Create</button></div>`;
  }
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar);
  return `
    <div class="automation-lane">
      <header>
        <label class="inline-toggle"><input data-automation-enabled="${sanitizeDataAttr(lane.id)}" type="checkbox" ${lane.enabled ? "checked" : ""}> ${label}</label>
        <button type="button" data-automation-add-point="${sanitizeDataAttr(`${track.id}:${field}`)}">Add at Playhead</button>
      </header>
      ${renderAutomationCurveSurface(lane, `${label} automation`)}
      ${
        points.length
          ? `<div class="automation-points">
              ${points.map((point, index) => `
                <div class="automation-point">
                  <label>Bar <input data-automation-point-bar="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="1" step="0.25" value="${sanitizeCssLengthOrNumber(point.bar, 1, 1, 4096)}"></label>
                  <label>Value <input data-automation-point-value="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="${sanitizeCssLengthOrNumber(lane.min ?? (field === "pan" ? -1 : 0), field === "pan" ? -1 : 0, -1, 1.2)}" max="${sanitizeCssLengthOrNumber(lane.max ?? (field === "pan" ? 1 : 1.2), field === "pan" ? 1 : 1.2, -1, 1.2)}" step="${field === "pan" ? "0.05" : "0.01"}" value="${sanitizeCssLengthOrNumber(point.value, 0, -1, 1.2)}"></label>
                  ${renderAutomationCurveSelect(lane.id, index, point)}
                  <button type="button" data-automation-delete-point="${sanitizeDataAttr(`${lane.id}:${index}`)}">Delete</button>
                </div>
              `).join("")}
            </div>`
          : `<p class="editor-note">No points yet.</p>`
      }
    </div>
  `;
}

function renderOutputSelector(project: ReturnType<typeof currentProject>, track: Track): string {
  if (track.role === "master" || track.trackType === "folder") return "";
  const outputs = availableTrackOutputs(project, track.id);
  return `
    <label>Output
      <select data-track-output="${sanitizeDataAttr(track.id)}">
        ${outputs.map((output) => `<option value="${escapeAttr(output.id)}" ${track.routing.outputId === output.id || (!track.routing.outputId && output.id === "master") ? "selected" : ""}>${escapeHtml(output.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderSendPanel(project: ReturnType<typeof currentProject>, track: Track): string {
  if (track.role === "master" || track.trackType === "return" || track.trackType === "folder") return "";
  const returns = project.tracks.filter((item) => item.trackType === "return");
  return `
    <div class="send-panel" aria-label="Track sends">
      <h3>Sends</h3>
      ${
        returns.length
          ? returns.map((ret) => {
              const level = trackSendLevel(track, ret.id);
              const mode = trackSendMode(track, ret.id);
              return `
                <div class="send-row">
                  <label>${escapeHtml(ret.name)}
                    <input aria-label="${escapeAttr(`${track.name} send to ${ret.name}`)}" data-track-send-level="${sanitizeDataAttr(`${track.id}:${ret.id}`)}" type="range" min="0" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(level, 0, 0, 1)}">
                    <span>${Math.round(level * 100)}%</span>
                  </label>
                  <label>Mode
                    <select data-track-send-mode="${sanitizeDataAttr(`${track.id}:${ret.id}`)}" aria-label="${escapeAttr(`${track.name} send mode to ${ret.name}`)}">
                      <option value="post-fader" ${mode === "post-fader" ? "selected" : ""}>Post-fader</option>
                      <option value="pre-fader" ${mode === "pre-fader" ? "selected" : ""}>Pre-fader</option>
                    </select>
                  </label>
                  ${renderSendAutomationLane(project, track, ret)}
                </div>
              `;
            }).join("")
          : `<p class="editor-note">Add a return track to use sends.</p>`
      }
    </div>
  `;
}

function renderSendAutomationLane(project: ReturnType<typeof currentProject>, track: Track, ret: Track): string {
  const lane = getTrackSendAutomationLane(project, track.id, ret.id, "level");
  if (!lane) {
    return `<div class="automation-lane empty"><span>Automation</span><button type="button" data-send-automation-create="${sanitizeDataAttr(`${track.id}:${ret.id}:level`)}">Create</button></div>`;
  }
  return `
    <div class="automation-lane">
      <div class="automation-lane-header">
        <label class="inline-toggle"><input data-automation-enabled="${sanitizeDataAttr(lane.id)}" type="checkbox" ${lane.enabled ? "checked" : ""}> Send automation</label>
        <button type="button" data-send-automation-add-point="${sanitizeDataAttr(`${track.id}:${ret.id}:level`)}">Add at Playhead</button>
      </div>
      ${renderAutomationCurveSurface(lane, "Send automation")}
      ${
        lane.points.length
          ? `<div class="automation-points">
              ${lane.points.map((point, index) => `
                <div class="automation-point">
                  <label>Bar <input data-automation-point-bar="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="1" step="0.25" value="${sanitizeCssLengthOrNumber(point.bar, 1, 1, 4096)}"></label>
                  <label>Value <input data-automation-point-value="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="0" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(point.value, 0, 0, 1)}"></label>
                  ${renderAutomationCurveSelect(lane.id, index, point)}
                  <button type="button" data-automation-delete-point="${sanitizeDataAttr(`${lane.id}:${index}`)}">Delete</button>
                </div>
              `).join("")}
            </div>`
          : `<p class="editor-note">No points yet.</p>`
      }
    </div>
  `;
}

function renderMidiClipMetadata(clip: Clip, media: ReturnType<typeof currentProject>["mediaPool"][number] | null, status: ReturnType<typeof mediaPoolStatus> | null): string {
  const midi = midiDataFromClip(clip);
  return `
    <dt>Media</dt><dd>${escapeHtml(media?.name || midi.sourceName || "Inline MIDI")}</dd>
    <dt>Status</dt><dd>${escapeHtml(status?.label || "Stored in project")}</dd>
    <dt>Notes</dt><dd>${midi.notes.length}</dd>
    <dt>Programs</dt><dd>${midi.programChanges.length}</dd>
    <dt>Pitch bends</dt><dd>${midi.pitchBends.length}</dd>
    <dt>Aftertouch</dt><dd>${midi.aftertouch.length}</dd>
    <dt>PPQ</dt><dd>${midi.ppq}</dd>
  `;
}

function renderMidiClipEditor(project: ReturnType<typeof currentProject>, state: AppState, clip: Clip): string {
  const midi = midiDataFromClip(clip);
  const conversionSectionId = SECTION_IDS.includes(state.chordsmithEditorSectionId as SectionId) ? state.chordsmithEditorSectionId as SectionId : "A";
  const pcs = getPrimaryChordsmithSource(project);
  const conversionSection = pcs?.sections[conversionSectionId];
  const conversionMelodyCount = Math.max(1, conversionSection?.melodyTracks.length || 1);
  const conversionMelodyTrackIndex = Math.max(0, Math.min(conversionMelodyCount - 1, Math.round(Number(state.chordsmithEditorMelodyTrackIndex) || 0)));
  const conversionSourceFilter = normalizeMidiConversionSourceFilter(state.midiConversionSourceMode, state.midiConversionSourceValue);
  const conversionPreview = createMidiChordsmithConversionPreview(project, clip.id, conversionSectionId, conversionMelodyTrackIndex, conversionSourceFilter, state.midiConversionKeepRawReference);
  const notes = midi.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  const controllers = midi.controllers.slice().sort((a, b) => a.tick - b.tick || a.controller - b.controller);
  const programs = midi.programChanges.slice().sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || a.program - b.program);
  const pitchBends = midi.pitchBends.slice().sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || a.value - b.value);
  const aftertouch = midi.aftertouch.slice().sort((a, b) => a.tick - b.tick || (a.channel ?? 0) - (b.channel ?? 0) || (a.note ?? -1) - (b.note ?? -1));
  const lastGrid = typeof midi.metadata?.lastQuantizeGrid === "string" ? midi.metadata.lastQuantizeGrid : "";
  const lastDurationGrid = typeof midi.metadata?.lastDurationQuantizeGrid === "string" ? midi.metadata.lastDurationQuantizeGrid : "";
  const lastSwingPercent = typeof midi.metadata?.lastSwingPercent === "number" ? midi.metadata.lastSwingPercent : null;
  const lastGrooveTemplate = typeof midi.metadata?.lastGrooveTemplate === "string" ? midi.metadata.lastGrooveTemplate : "";
  const lastVelocityTransform = typeof midi.metadata?.lastVelocityTransform === "string" ? midi.metadata.lastVelocityTransform : "";
  const lastPitchTransform = typeof midi.metadata?.lastPitchTransform === "string" ? midi.metadata.lastPitchTransform : "";
  const grids = ["1/4", "1/8", "1/16", "1/32"];
  const swings = [50, 55, 60, 65];
  const velocityTransforms: Array<[string, string, string]> = [
    ["level-96", "Level 96", "Set all notes in this MIDI clip to velocity 96"],
    ["humanize-12", "Humanize", "Apply deterministic +/-12 velocity variation"]
  ];
  const pitchTransforms: Array<[string, string, string]> = [
    ["semitone-down", "Semi -", "Transpose every note in this MIDI clip down one semitone"],
    ["semitone-up", "Semi +", "Transpose every note in this MIDI clip up one semitone"],
    ["octave-down", "Oct -", "Transpose every note in this MIDI clip down one octave"],
    ["octave-up", "Oct +", "Transpose every note in this MIDI clip up one octave"]
  ];
  return `
    <div class="midi-editor">
      <header>
        <h3>Piano Roll</h3>
        <label class="midi-clip-length-control">Bars <input data-midi-clip-property="${sanitizeDataAttr(`${clip.id}:barLength`)}" type="number" min="0.25" max="4096" step="0.25" value="${sanitizeCssLengthOrNumber(clip.barLength, 1, 0.25, 4096)}"></label>
        <div class="midi-quantize-actions" aria-label="Quantize">
          ${grids.map((grid) => `<button type="button" class="${lastGrid === grid ? "selected" : ""}" title="Quantize to ${escapeAttr(grid)}" data-midi-quantize="${sanitizeDataAttr(`${clip.id}:${grid}`)}">Q ${escapeHtml(grid)}</button>`).join("")}
        </div>
        <div class="midi-duration-actions" aria-label="Quantize note lengths">
          ${grids.map((grid) => `<button type="button" class="${lastDurationGrid === grid ? "selected" : ""}" title="Quantize note lengths to ${escapeAttr(grid)}" data-midi-duration-quantize="${sanitizeDataAttr(`${clip.id}:${grid}`)}">Len ${escapeHtml(grid)}</button>`).join("")}
        </div>
        <div class="midi-swing-actions" aria-label="Swing">
          ${swings.map((percent) => `<button type="button" class="${lastSwingPercent === percent ? "selected" : ""}" title="${percent === 50 ? "Straight eighth notes" : `Apply ${percent}% eighth-note swing`}" data-midi-swing="${sanitizeDataAttr(`${clip.id}:${percent}`)}">${percent === 50 ? "Straight" : `Swing ${percent}`}</button>`).join("")}
        </div>
        <div class="midi-groove-actions" aria-label="Groove templates">
          ${MIDI_GROOVE_TEMPLATES.map((template) => `<button type="button" class="${lastGrooveTemplate === template.id ? "selected" : ""}" title="${escapeAttr(`Apply ${template.name}: ${template.grid}, ${template.swingPercent}% swing`)}" data-midi-groove="${sanitizeDataAttr(`${clip.id}:${template.id}`)}">${escapeHtml(template.name)}</button>`).join("")}
        </div>
        <div class="midi-velocity-actions" aria-label="Velocity">
          ${velocityTransforms.map(([id, label, title]) => `<button type="button" class="${lastVelocityTransform === id ? "selected" : ""}" title="${escapeAttr(title)}" data-midi-velocity-transform="${sanitizeDataAttr(`${clip.id}:${id}`)}">${escapeHtml(label)}</button>`).join("")}
        </div>
        <div class="midi-pitch-actions" aria-label="Pitch">
          ${pitchTransforms.map(([id, label, title]) => `<button type="button" class="${lastPitchTransform === id ? "selected" : ""}" title="${escapeAttr(title)}" data-midi-pitch-transform="${sanitizeDataAttr(`${clip.id}:${id}`)}">${escapeHtml(label)}</button>`).join("")}
        </div>
        <button type="button" data-midi-controller-add="${sanitizeDataAttr(clip.id)}">Add CC</button>
        <button type="button" data-midi-program-add="${sanitizeDataAttr(clip.id)}">Add Program</button>
        <button type="button" data-midi-pitch-bend-add="${sanitizeDataAttr(clip.id)}">Add Bend</button>
        <button type="button" data-midi-aftertouch-add="${sanitizeDataAttr(clip.id)}">Add Touch</button>
        ${renderMidiConversionTargetControls(conversionSectionId, conversionMelodyTrackIndex, conversionMelodyCount, conversionPreview?.sourceOptions || [], conversionSourceFilter, state.midiConversionKeepRawReference)}
        <button type="button" title="Map General MIDI drum notes into generated drum branch overlays" data-action="convert-midi-drums">Map Drums</button>
        <button type="button" title="Map low non-drum MIDI notes into generated bass overlays" data-action="convert-midi-bass">Map Bass</button>
        <button type="button" title="Map simultaneous non-drum MIDI notes into generated chord overlays" data-action="convert-midi-chords">Map Chords</button>
        <button type="button" title="Map non-drum MIDI notes into generated melody overlays" data-action="convert-midi-melody">Map Melody</button>
        <button type="button" title="Map drums, bass, chords and melody from this MIDI clip into generated overlays while preserving the raw MIDI clip" data-action="convert-midi-arrangement">Map Arrangement</button>
        <button type="button" title="Adopt the imported MIDI start tempo and supported /4 meter as project globals" data-action="adopt-midi-tempo">Adopt Tempo</button>
        <button type="button" title="Convert imported MIDI tempo events into project tempo automation" data-action="adopt-midi-tempo-map">Tempo Lane</button>
        <button type="button" title="Convert imported MIDI time-signature events into the project meter map" data-action="adopt-midi-meter-map">Meter Lane</button>
        <button type="button" data-midi-note-add="${sanitizeDataAttr(clip.id)}">Add Note</button>
      </header>
      ${conversionPreview ? renderMidiChordsmithConversionPreview(conversionPreview) : ""}
      ${
        notes.length
          ? `<div class="midi-note-list">
              ${notes.map((note) => `
                <div class="midi-note-row">
                  <strong>${midiPitchLabel(note.pitch)}</strong>
                  <label>Pitch <input data-midi-note-field="${sanitizeDataAttr(`${clip.id}:${note.id}:pitch`)}" type="number" min="0" max="127" value="${sanitizeCssLengthOrNumber(note.pitch, 60, 0, 127)}"></label>
                  <label>Tick <input data-midi-note-field="${sanitizeDataAttr(`${clip.id}:${note.id}:startTick`)}" type="number" min="0" step="1" value="${sanitizeCssLengthOrNumber(note.startTick, 0, 0)}"></label>
                  <label>Len <input data-midi-note-field="${sanitizeDataAttr(`${clip.id}:${note.id}:durationTicks`)}" type="number" min="1" step="1" value="${sanitizeCssLengthOrNumber(note.durationTicks, midi.ppq, 1)}"></label>
                  <label>Vel <input data-midi-note-field="${sanitizeDataAttr(`${clip.id}:${note.id}:velocity`)}" type="number" min="1" max="127" value="${sanitizeCssLengthOrNumber(note.velocity, 96, 1, 127)}"></label>
                  <label>Ch <input data-midi-note-field="${sanitizeDataAttr(`${clip.id}:${note.id}:channel`)}" type="number" min="0" max="15" value="${sanitizeCssLengthOrNumber(note.channel ?? 0, 0, 0, 15)}"></label>
                  <div class="midi-note-actions">
                    <button type="button" title="Move note earlier" data-midi-note-move="${sanitizeDataAttr(`${clip.id}:${note.id}:-1`)}">&lt;</button>
                    <button type="button" title="Move note later" data-midi-note-move="${sanitizeDataAttr(`${clip.id}:${note.id}:1`)}">&gt;</button>
                    <button type="button" title="Pitch down" data-midi-note-pitch="${sanitizeDataAttr(`${clip.id}:${note.id}:-1`)}">-</button>
                    <button type="button" title="Pitch up" data-midi-note-pitch="${sanitizeDataAttr(`${clip.id}:${note.id}:1`)}">+</button>
                    <button type="button" title="Shorter" data-midi-note-duration="${sanitizeDataAttr(`${clip.id}:${note.id}:-1`)}">Short</button>
                    <button type="button" title="Longer" data-midi-note-duration="${sanitizeDataAttr(`${clip.id}:${note.id}:1`)}">Long</button>
                    <button type="button" title="Duplicate note" data-midi-note-duplicate="${sanitizeDataAttr(`${clip.id}:${note.id}`)}">Dup</button>
                    <button type="button" title="Delete note" data-midi-note-delete="${sanitizeDataAttr(`${clip.id}:${note.id}`)}">Delete</button>
                  </div>
                </div>
              `).join("")}
            </div>`
          : `<p class="editor-note">No notes yet.</p>`
      }
      <section class="midi-controller-lane" aria-label="MIDI controller lane">
        <h4>Controller Lane</h4>
        ${
          controllers.length
            ? `<div class="midi-controller-list">
                ${controllers.map((point) => `
                  <div class="midi-controller-row">
                    <strong>CC ${point.controller}</strong>
                    <label>CC <input data-midi-controller-field="${sanitizeDataAttr(`${clip.id}:${point.id}:controller`)}" type="number" min="0" max="127" value="${sanitizeCssLengthOrNumber(point.controller, 1, 0, 127)}"></label>
                    <label>Tick <input data-midi-controller-field="${sanitizeDataAttr(`${clip.id}:${point.id}:tick`)}" type="number" min="0" step="1" value="${sanitizeCssLengthOrNumber(point.tick, 0, 0)}"></label>
                    <label>Value <input data-midi-controller-field="${sanitizeDataAttr(`${clip.id}:${point.id}:value`)}" type="number" min="0" max="127" value="${sanitizeCssLengthOrNumber(point.value, 64, 0, 127)}"></label>
                    <label>Ch <input data-midi-controller-field="${sanitizeDataAttr(`${clip.id}:${point.id}:channel`)}" type="number" min="0" max="15" value="${sanitizeCssLengthOrNumber(point.channel ?? 0, 0, 0, 15)}"></label>
                    <button type="button" title="Duplicate controller point" data-midi-controller-duplicate="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Dup</button>
                    <button type="button" title="Delete controller point" data-midi-controller-delete="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Delete</button>
                  </div>
                `).join("")}
              </div>`
            : `<p class="editor-note">No controller points yet.</p>`
        }
      </section>
      <section class="midi-pitch-bend-lane" aria-label="MIDI pitch-bend lane">
        <h4>Pitch Bend</h4>
        ${
          pitchBends.length
            ? `<div class="midi-pitch-bend-list">
                ${pitchBends.map((point) => `
                  <div class="midi-controller-row midi-pitch-bend-row">
                    <strong>Bend ${point.value}</strong>
                    <label>Value <input data-midi-pitch-bend-field="${sanitizeDataAttr(`${clip.id}:${point.id}:value`)}" type="number" min="0" max="16383" value="${sanitizeCssLengthOrNumber(point.value, 8192, 0, 16383)}"></label>
                    <label>Tick <input data-midi-pitch-bend-field="${sanitizeDataAttr(`${clip.id}:${point.id}:tick`)}" type="number" min="0" step="1" value="${sanitizeCssLengthOrNumber(point.tick, 0, 0)}"></label>
                    <label>Ch <input data-midi-pitch-bend-field="${sanitizeDataAttr(`${clip.id}:${point.id}:channel`)}" type="number" min="0" max="15" value="${sanitizeCssLengthOrNumber(point.channel ?? 0, 0, 0, 15)}"></label>
                    <button type="button" title="Duplicate pitch bend" data-midi-pitch-bend-duplicate="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Dup</button>
                    <button type="button" title="Delete pitch bend" data-midi-pitch-bend-delete="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Delete</button>
                  </div>
                `).join("")}
              </div>`
            : `<p class="editor-note">No pitch bends yet.</p>`
        }
      </section>
      <section class="midi-aftertouch-lane" aria-label="MIDI aftertouch lane">
        <h4>Aftertouch</h4>
        ${
          aftertouch.length
            ? `<div class="midi-aftertouch-list">
                ${aftertouch.map((point) => `
                  <div class="midi-controller-row midi-aftertouch-row">
                    <strong>${point.kind === "poly" ? `Poly ${midiPitchLabel(point.note ?? 60)}` : "Channel Touch"}</strong>
                    <label>Value <input data-midi-aftertouch-field="${sanitizeDataAttr(`${clip.id}:${point.id}:value`)}" type="number" min="0" max="127" value="${sanitizeCssLengthOrNumber(point.value, 64, 0, 127)}"></label>
                    <label>Tick <input data-midi-aftertouch-field="${sanitizeDataAttr(`${clip.id}:${point.id}:tick`)}" type="number" min="0" step="1" value="${sanitizeCssLengthOrNumber(point.tick, 0, 0)}"></label>
                    <label>Ch <input data-midi-aftertouch-field="${sanitizeDataAttr(`${clip.id}:${point.id}:channel`)}" type="number" min="0" max="15" value="${sanitizeCssLengthOrNumber(point.channel ?? 0, 0, 0, 15)}"></label>
                    ${point.kind === "poly" ? `<label>Note <input data-midi-aftertouch-field="${sanitizeDataAttr(`${clip.id}:${point.id}:note`)}" type="number" min="0" max="127" value="${sanitizeCssLengthOrNumber(point.note ?? 60, 60, 0, 127)}"></label>` : ""}
                    <button type="button" title="Duplicate aftertouch" data-midi-aftertouch-duplicate="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Dup</button>
                    <button type="button" title="Delete aftertouch" data-midi-aftertouch-delete="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Delete</button>
                  </div>
                `).join("")}
              </div>`
            : `<p class="editor-note">No aftertouch yet.</p>`
        }
      </section>
      <section class="midi-program-lane" aria-label="MIDI program lane">
        <h4>Program Changes</h4>
        ${
          programs.length
            ? `<div class="midi-program-list">
                ${programs.map((point) => `
                  <div class="midi-controller-row midi-program-row">
                    <strong>Program ${point.program}</strong>
                    <label>Program <input data-midi-program-field="${sanitizeDataAttr(`${clip.id}:${point.id}:program`)}" type="number" min="0" max="127" value="${sanitizeCssLengthOrNumber(point.program, 0, 0, 127)}"></label>
                    <label>Tick <input data-midi-program-field="${sanitizeDataAttr(`${clip.id}:${point.id}:tick`)}" type="number" min="0" step="1" value="${sanitizeCssLengthOrNumber(point.tick, 0, 0)}"></label>
                    <label>Ch <input data-midi-program-field="${sanitizeDataAttr(`${clip.id}:${point.id}:channel`)}" type="number" min="0" max="15" value="${sanitizeCssLengthOrNumber(point.channel ?? 0, 0, 0, 15)}"></label>
                    <button type="button" title="Duplicate program change" data-midi-program-duplicate="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Dup</button>
                    <button type="button" title="Delete program change" data-midi-program-delete="${sanitizeDataAttr(`${clip.id}:${point.id}`)}">Delete</button>
                  </div>
                `).join("")}
              </div>`
            : `<p class="editor-note">No program changes yet.</p>`
        }
      </section>
    </div>
  `;
}

function renderMidiChordsmithConversionPreview(preview: MidiChordsmithConversionPreview): string {
  const laneSummary = Object.entries(preview.mappings.drums.lanes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lane, count]) => `${lane} ${count}`)
    .join(", ");
  const expressive = [
    preview.preservedControllerCount ? `${preview.preservedControllerCount} CC` : "",
    preview.preservedProgramChangeCount ? `${preview.preservedProgramChangeCount} program` : "",
    preview.preservedPitchBendCount ? `${preview.preservedPitchBendCount} bend` : "",
    preview.preservedAftertouchCount ? `${preview.preservedAftertouchCount} touch` : ""
  ].filter(Boolean).join(", ") || "none";
  const warningText = preview.warnings.length ? preview.warnings.join(" ") : "Ready to map. The raw MIDI clip stays in the project.";
  const ignoredSummary = formatMidiConversionReportRows(preview.ignoredMaterial);
  const ambiguousSummary = formatMidiConversionReportRows(preview.ambiguousMaterial);
  return `
    <section class="midi-conversion-preview" data-midi-conversion-preview="${sanitizeDataAttr(preview.clipId)}" aria-label="MIDI to Chordsmith conversion preview">
      <h4>Chordsmith Mapping Preview</h4>
      <p class="editor-note">${escapeHtml(warningText)}</p>
      <dl>
        <dt>Timing</dt><dd>${preview.timing.bpm} BPM / ${escapeHtml(preview.timing.timeSignature)}${preview.timing.hasTempoChanges || preview.timing.hasMeterChanges ? " map" : ""}</dd>
        <dt>Key</dt><dd>${escapeHtml(preview.key.key)} ${preview.key.scale}${preview.key.source === "pitch-inference" ? " (inferred)" : preview.key.source === "midi-key-signature" ? " (MIDI)" : " (project)"}</dd>
        <dt>Structure</dt><dd>${preview.structure.sourceBars} bars / ${preview.structure.suggestedSectionCount} section${preview.structure.suggestedSectionCount === 1 ? "" : "s"} x ${preview.structure.suggestedSectionBars}</dd>
        <dt>Source</dt><dd>${escapeHtml(preview.sourceFilterLabel)}${preview.filteredOutNoteCount ? ` (${preview.filteredOutNoteCount} filtered out)` : ""}</dd>
        <dt>Confidence</dt><dd>${escapeHtml(preview.confidence)}${ignoredSummary ? ` / ${escapeHtml(ignoredSummary)}` : ""}${ambiguousSummary ? ` / ${escapeHtml(ambiguousSummary)}` : ""}</dd>
        <dt>Visible notes</dt><dd>${preview.visibleNoteCount} / ${preview.sourceNoteCount}${preview.outOfRangeNoteCount ? ` (${preview.outOfRangeNoteCount} outside clip range)` : ""}</dd>
        <dt>Drums</dt><dd>${preview.mappings.drums.written} cells${laneSummary ? ` / ${escapeHtml(laneSummary)}` : ""}</dd>
        <dt>Bass</dt><dd>${preview.mappings.bass.written} notes${preview.mappings.bass.pitches.length ? ` / ${escapeHtml(formatMidiPitchList(preview.mappings.bass.pitches))}` : ""}</dd>
        <dt>Chords</dt><dd>${preview.mappings.chords.written} groups</dd>
        <dt>Melody</dt><dd>${preview.mappings.melody.written} notes${preview.mappings.melody.pitches.length ? ` / ${escapeHtml(formatMidiPitchList(preview.mappings.melody.pitches))}` : ""}</dd>
        <dt>Role hints</dt><dd>${escapeHtml(formatMidiRoleHints(preview.roleHints))}</dd>
        <dt>Preserved</dt><dd>Raw MIDI ${preview.rawMidiClip}; ${escapeHtml(expressive)}; ${escapeHtml(preview.rawReferenceAction.detail)}</dd>
      </dl>
    </section>
  `;
}

function formatMidiConversionReportRows(rows: MidiChordsmithConversionPreview["ignoredMaterial"] | MidiChordsmithConversionPreview["ambiguousMaterial"]): string {
  if (!rows.length) return "";
  return rows.slice(0, 3).map((row) => `${row.reason} ${row.count}`).join(", ") + (rows.length > 3 ? ` +${rows.length - 3}` : "");
}

function renderMidiConversionTargetControls(
  sectionId: SectionId,
  melodyTrackIndex: number,
  melodyTrackCount: number,
  sourceOptions: MidiConversionSourceOption[],
  sourceFilter: MidiConversionSourceFilter,
  keepRawReference: boolean
): string {
  const options = sourceOptions.length ? sourceOptions : [{ mode: "all" as const, value: null, label: "All MIDI notes" }];
  const sourceValue = midiConversionSourceOptionValue(sourceFilter);
  return `
    <div class="midi-conversion-targets" aria-label="MIDI conversion target">
      <label>Source
        <select data-midi-conversion-source-target="true" title="Choose which imported MIDI source track or channel the Chordsmith mapping buttons will read.">
          ${options.map((option) => {
            const value = midiConversionSourceOptionValue(option);
            return `<option value="${escapeAttr(value)}" ${sourceValue === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
          }).join("")}
        </select>
      </label>
      <label>Map to
        <select data-midi-conversion-section-target="true" title="Choose the Chordsmith section that MIDI mapping commands will write into.">
          ${SECTION_IDS.map((id) => `<option value="${id}" ${sectionId === id ? "selected" : ""}>Section ${id}</option>`).join("")}
        </select>
      </label>
      <label>Melody
        <select data-midi-conversion-melody-target="true" title="Choose the generated melody track used by Map Melody and Map Arrangement.">
          ${Array.from({ length: melodyTrackCount }, (_value, index) => `<option value="${index}" ${melodyTrackIndex === index ? "selected" : ""}>Track ${index + 1}</option>`).join("")}
        </select>
      </label>
      <label class="midi-raw-reference-toggle" title="Keep the imported MIDI clip on the timeline after mapping, or remove only that reference clip while leaving the source in the Media Pool.">
        <input type="checkbox" data-midi-conversion-keep-raw-reference="true" ${keepRawReference !== false ? "checked" : ""}>
        Keep raw reference
      </label>
    </div>
  `;
}

function midiConversionSourceOptionValue(option: MidiConversionSourceFilter | MidiConversionSourceOption): string {
  return option.mode === "all" ? "all" : `${option.mode}:${Number(option.value ?? 0)}`;
}

function formatMidiPitchList(pitches: number[]): string {
  const labels = pitches.slice(0, 6).map((pitch) => midiPitchLabel(pitch));
  return `${labels.join(", ")}${pitches.length > labels.length ? ` +${pitches.length - labels.length}` : ""}`;
}

function formatMidiRoleHints(hints: MidiChordsmithConversionPreview["roleHints"]): string {
  return hints.length ? hints.map((hint) => `${hint.role}: ${hint.source}`).join(", ") : "reference: Raw MIDI";
}

function midiPitchLabel(pitch: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const safe = Math.max(0, Math.min(127, Math.round(pitch)));
  return `${names[safe % 12]}${Math.floor(safe / 12) - 1}`;
}

function renderChordsmithSequencer(state: AppState, project: ReturnType<typeof currentProject>, pcs: SanitizedPcsProject | null, clip: Clip | null, selectedTrack: Track | null): string {
  if (!pcs) return "";
  const selectedRole = selectedTrack?.trackType === "generated" ? selectedTrack.role : null;
  const selectedClipSection = clip?.type === "generated-section" ? clip.sectionId || null : null;
  if (!selectedRole) return "";
  const sectionId = (state.chordsmithEditorFollowClip && selectedClipSection ? selectedClipSection : state.chordsmithEditorSectionId || selectedClipSection || "A") as SectionId;
  const section = pcs.sections[sectionId] as SanitizedPcsSection | undefined;
  if (!section) return "";
  const windowSize = visibleEditorSteps(pcs);
  const totalSteps = totalEditorSteps(pcs, section);
  const maxPage = Math.max(0, Math.ceil(totalSteps / windowSize) - 1);
  const page = Math.min(Math.max(0, state.chordsmithEditorStepPage), maxPage);
  const startStep = page * windowSize;
  const body = renderSelectedSequencerBlock(project, pcs, section, selectedTrack, selectedRole, state.chordsmithEditorMelodyTrackIndex, startStep, windowSize, state.chordsmithStepSelection);
  const presetPanel = renderChordsmithPresetPanel(pcs, section, selectedRole);
  return `
    <div class="sequencer-editor">
      <header>
        <div>
          <h3>Section ${escapeHtml(section.id)} Sequencer</h3>
          <p>${section.bars} bar${section.bars === 1 ? "" : "s"} / steps ${startStep + 1}-${Math.min(totalSteps, startStep + windowSize)} of ${totalSteps} / edits feed playback and exports</p>
        </div>
        <label>Bars
          <input data-section-bars="${sanitizeDataAttr(section.id)}" type="number" min="1" max="16" value="${sanitizeCssLengthOrNumber(section.bars, 4, 1, 16)}">
        </label>
      </header>
      <div class="inspector-subhead" aria-label="Track source editor context">
        <h3>Track source editor</h3>
        <p>This edits the Chordsmith section data for the selected generated role. Clip mix changes affect only the selected timeline clip.</p>
      </div>
      ${renderChordsmithScopeControls(state, pcs, section, selectedClipSection, page, maxPage)}
      ${presetPanel}
      ${renderChordsmithGlobals(pcs)}
      ${body}
    </div>
  `;
}

function renderChordsmithPresetPanel(pcs: SanitizedPcsProject, section: SanitizedPcsSection, role: Track["role"] | null): string {
  if (role === "drums") {
    const presets = visibleDrumPresetsForProject(pcs);
    const current = presets.find((preset) => preset.id === pcs.drumGroovePreset);
    return `
      <div class="inspector-preset-panel">
        <h3>Drum Presets</h3>
        <label>Beat preset
          <select data-drum-preset-section="${escapeAttr(section.id)}" title="Choose a Chordsmith beat preset to fill kick, snare and hats for this section.">
            <option value="">Choose beat preset...</option>
            ${renderDrumPresetOptions(pcs, presets)}
          </select>
        </label>
        ${current ? `<span class="preset-current">Imported: ${escapeHtml(drumPresetLabel(current, pcs))}</span>` : ""}
      </div>
    `;
  }
  if (role === "guitar") {
    const presets = visibleGuitarPresetsForProject(pcs);
    const current = presets.find((preset) => preset.id === pcs.guitarPatternPreset);
    return `
      <div class="inspector-preset-panel">
        <h3>Guitar Rhythm</h3>
        <label>Rhythm preset
          <select data-guitar-preset-section="${escapeAttr(section.id)}" title="Choose a Chordsmith guitar rhythm preset to fill this section.">
            <option value="">Choose rhythm preset...</option>
            ${renderGuitarPresetOptions(presets)}
          </select>
        </label>
        ${current ? `<span class="preset-current">Current: ${escapeHtml(guitarPresetLabel(current))}</span>` : ""}
      </div>
    `;
  }
  return "";
}

function renderDrumPresetOptions(pcs: SanitizedPcsProject, presets: ReturnType<typeof visibleDrumPresetsForProject>): string {
  return presets
    .map((preset) => {
      const label = drumPresetLabel(preset, pcs);
      return `<option value="${escapeAttr(preset.id)}" title="${escapeAttr(preset.tip)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderGuitarPresetOptions(presets: ReturnType<typeof visibleGuitarPresetsForProject>): string {
  return presets
    .map((preset) => `<option value="${escapeAttr(preset.id)}" title="${escapeAttr(preset.tip)}">${escapeHtml(guitarPresetLabel(preset))}</option>`)
    .join("");
}

function renderChordsmithScopeControls(state: AppState, pcs: SanitizedPcsProject, section: SanitizedPcsSection, selectedClipSection: string | null, page: number, maxPage: number): string {
  const melodyCount = Math.max(1, section.melodyTracks.length);
  return `
    <div class="editor-controls">
      <label class="inline-toggle" title="Follow the selected generated clip section when possible; turn off to choose a section manually."><input id="chordsmithFollowClip" type="checkbox" ${state.chordsmithEditorFollowClip ? "checked" : ""} ${selectedClipSection ? "" : "disabled"} title="Follow the selected generated clip section when possible; turn off to choose a section manually."> Follow clip</label>
      <label>Section
        <select id="chordsmithSectionSelect">
          ${SECTION_IDS.map((id) => `<option value="${id}" ${section.id === id ? "selected" : ""}>Section ${id}</option>`).join("")}
        </select>
      </label>
      <label>Melody track
        <select id="melodyTrackSelect">
          ${Array.from({ length: melodyCount }, (_, index) => `<option value="${index}" ${state.chordsmithEditorMelodyTrackIndex === index ? "selected" : ""}>Track ${index + 1}</option>`).join("")}
        </select>
      </label>
      <div class="step-page-controls" aria-label="Sequencer step page">
        <strong>Step page</strong>
        <button type="button" data-step-page="-1" ${page <= 0 ? "disabled" : ""} title="Move to the previous visible group of Chordsmith steps.">Prev</button>
        <span>${page + 1} / ${maxPage + 1}</span>
        <button type="button" data-step-page="1" ${page >= maxPage ? "disabled" : ""} title="Move to the next visible group of Chordsmith steps.">Next</button>
      </div>
    </div>
    <p class="editor-note">Time signature ${pcs.timeSig}/4 and resolution ${pcs.resolution} are preserved from Chordsmith in this pass.</p>
  `;
}

function renderChordsmithGlobals(pcs: SanitizedPcsProject): string {
  return `
    <div class="editor-controls globals">
      <label>Key <input data-chordsmith-global="key" value="${escapeAttr(pcs.key)}"></label>
      <label>Scale <input data-chordsmith-global="scale" value="${escapeAttr(pcs.scale)}"></label>
      <label>BPM <input data-chordsmith-global="bpm" type="number" min="40" max="240" value="${sanitizeCssLengthOrNumber(pcs.bpm, 118, 40, 240)}"></label>
      <label>Swing <input data-chordsmith-global="swing" type="number" min="0" max="0.35" step="0.01" value="${sanitizeCssLengthOrNumber(pcs.swing, 0, 0, 0.35)}"></label>
    </div>
  `;
}

function renderSelectedSequencerBlock(
  project: ReturnType<typeof currentProject>,
  pcs: SanitizedPcsProject,
  section: SanitizedPcsSection,
  selectedTrack: Track | null,
  role: Track["role"] | null,
  melodyTrackIndex: number,
  startStep: number,
  steps: number,
  selection: ChordsmithStepSelection | null
): string {
  if (role === "chords") return renderChordEditor(pcs, section);
  if (role === "drums") {
    const branchLane = generatedDrumBranchLane(selectedTrack);
    return branchLane ? renderDrumBranchEditor(project, section, branchLane, startStep, steps, selection) : renderDrumEditor(pcs, section, startStep, steps, selection);
  }
  if (role === "bass") return renderBassEditor(pcs, section, startStep, steps, selection);
  if (role === "melody") return renderMelodyEditor(section, selectedTrack?.role === "melody" ? selectedMelodyTrackIndex(selectedTrack) : melodyTrackIndex, startStep, steps, selection);
  if (role === "guitar") return renderGuitarEditor(project, pcs, section, startStep, steps);
  return "";
}

function renderStepRuler(startStep: number, steps: number): string {
  return `<div class="step-ruler">${Array.from({ length: steps }, (_, i) => `<span>${startStep + i + 1}</span>`).join("")}</div>`;
}

function renderChordEditor(pcs: SanitizedPcsProject, section: SanitizedPcsSection): string {
  const instrument = pcs.chordInstrument || "pocket";
  return `
    <div class="sequencer-block">
      <div class="sequencer-heading">
        <strong>Chords</strong>
        <label>Chord sound
          <select data-chord-instrument="true">
            ${POCKET_CHORD_INSTRUMENTS.map((value) => `<option value="${value}" ${instrument === value ? "selected" : ""}>${escapeHtml(instrumentLabel(value))}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="chord-editor">${Array.from({ length: section.bars }, (_, bar) => renderChordSelect(section, bar)).join("")}</div>
    </div>
  `;
}

function renderChordSelect(section: SanitizedPcsSection, bar: number): string {
  const degree = section.progression[bar] || 0;
  return `
    <label>Bar ${bar + 1}
      <select data-section-chord="${sanitizeDataAttr(`${section.id}:${bar}`)}">
        ${CHORD_LABELS.map((label, value) => `<option value="${value}" ${degree === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderDrumEditor(pcs: SanitizedPcsProject, section: SanitizedPcsSection, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="sequencer-block">
      <div class="sequencer-heading">
        <strong>Drums</strong>
      </div>
      ${renderStepRuler(startStep, steps)}
      ${(["kick", "snare", "hat"] as const)
        .map(
          (lane) => `
            <div class="sequencer-row">
              <span>${drumLaneLabel(lane)}</span>
              ${Array.from({ length: steps }, (_, step) => {
                const actualStep = startStep + step;
                const level = section.grid[lane][actualStep] || 0;
                const tuplet = !!section.gridTuplets[lane][actualStep];
                const selected = selection?.kind === "drums" && selection.sectionId === section.id && selection.lane === lane && selection.step === actualStep;
                return `<button class="step step-${level} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="${escapeAttr(`${drumLaneLabel(lane)} step ${actualStep + 1}. Select then press T for tuplet.`)}" data-drum-step="${sanitizeDataAttr(`${section.id}:${lane}:${actualStep}`)}">${level === 2 ? "!" : level === 1 ? "x" : ""}${stepBadges({ tuplet })}</button>`;
              }).join("")}
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDrumBranchEditor(project: ReturnType<typeof currentProject>, section: SanitizedPcsSection, lane: DrumLaneId, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  const liveOnly = !sourceDrumLane(lane);
  return `
    <div class="sequencer-block">
      <div class="sequencer-heading">
        <strong>${escapeHtml(drumLaneLabel(lane))} Branch</strong>
        ${liveOnly ? `<span class="editor-note">DAW-only source overlay</span>` : ""}
      </div>
      ${renderStepRuler(startStep, steps)}
      <div class="sequencer-row">
        <span>${drumLaneLabel(lane)}</span>
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const level = branchDrumStepLevel(project, section, lane, actualStep);
          const tuplet = sourceDrumLane(lane) ? !!section.gridTuplets[lane][actualStep] : false;
          const selected = selection?.kind === "drums" && selection.sectionId === section.id && selection.lane === lane && selection.step === actualStep;
          const dataAttr = sourceDrumLane(lane) ? "data-drum-step" : "data-drum-branch-step";
          const title = liveOnly
            ? `${drumLaneLabel(lane)} branch step ${actualStep + 1}. Click to write a DAW-only drum source event.`
            : `${drumLaneLabel(lane)} step ${actualStep + 1}. Select then press T for tuplet.`;
          return `<button class="step step-${level} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="${escapeAttr(title)}" ${dataAttr}="${sanitizeDataAttr(`${section.id}:${lane}:${actualStep}`)}">${level === 2 ? "!" : level === 1 ? "x" : ""}${stepBadges({ tuplet })}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderBassEditor(pcs: SanitizedPcsProject, section: SanitizedPcsSection, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="sequencer-block">
      <strong>Bass</strong>
      <label>Bass mode
        <select data-bass-mode="true">
          <option value="auto" ${pcs.bassMode === "manual" ? "" : "selected"}>Auto from chords</option>
          <option value="manual" ${pcs.bassMode === "manual" ? "selected" : ""}>Manual notes</option>
        </select>
      </label>
      <label>Bass rhythm
        <select data-bass-preset-section="${escapeAttr(section.id)}" title="Choose a bass rhythm preset to fill editable manual notes for this section.">
          <option value="">Choose bass preset...</option>
          ${visibleBassPresetsForProject(pcs).map((preset) => `<option value="${escapeAttr(preset.id)}" title="${escapeAttr(preset.tip)}">${escapeHtml(bassPresetLabel(preset))}</option>`).join("")}
        </select>
      </label>
      ${renderStepRuler(startStep, steps)}
      <div class="sequencer-row">
        <span>note</span>
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const note = bassVisibleNoteIndex(pcs, section, actualStep);
          const auto = bassStepUsesAuto(pcs, section, actualStep);
          const accent = pcs.bassMode === "manual" ? !!section.bassAccent[actualStep] : (section.grid.bass[actualStep] || 0) === 2;
          const tuplet = !!section.gridTuplets.bass[actualStep];
          const selected = selection?.kind === "bass" && selection.sectionId === section.id && selection.step === actualStep;
          const title = auto ? `Auto bass step ${actualStep + 1}. Click to convert auto bass to editable manual notes.` : `Bass note step ${actualStep + 1}. Select then press H, S or T.`;
          return `<button class="step note-step ${note === null ? "" : "on"} ${auto ? "auto-bass" : ""} ${accent ? "accent" : ""} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="${escapeAttr(title)}" data-bass-step="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${note === null ? "" : escapeHtml(BASS_LABELS[note] || String(note))}${stepBadges({ hold: !!section.bassHold[actualStep], slide: !!section.bassSlide[actualStep], tuplet })}</button>`;
        }).join("")}
      </div>
      ${renderMetaStepRow("accent", steps, (step) => {
        const actualStep = startStep + step;
        const accent = pcs.bassMode === "manual" ? !!section.bassAccent[actualStep] : (section.grid.bass[actualStep] || 0) === 2;
        return `<button class="step meta-step ${accent ? "on accent" : ""}" title="Bass accent step ${actualStep + 1}" data-bass-accent="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${accent ? "!" : ""}</button>`;
      })}
    </div>
  `;
}

function renderMelodyEditor(section: SanitizedPcsSection, trackIndex: number, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  const track = section.melodyTracks[trackIndex] || [];
  const instrument = section.melodyInstruments[trackIndex] || "synth";
  const octave = section.melodyOctaves[trackIndex] || 0;
  const pan = section.melodyPan[trackIndex] || 0;
  return `
    <div class="sequencer-block">
      <strong>Melody ${trackIndex + 1}</strong>
      <div class="editor-controls lane-controls">
        <label>Instrument
          <select data-melody-instrument="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}">
            ${POCKET_MELODY_INSTRUMENTS.map((value) => `<option value="${value}" ${instrument === value ? "selected" : ""}>${escapeHtml(instrumentLabel(value))}</option>`).join("")}
          </select>
        </label>
        <label>Octave <input data-melody-octave="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="number" min="-3" max="3" value="${sanitizeCssLengthOrNumber(octave, 0, -3, 3)}"></label>
        <label>Pan <input data-melody-pan="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="range" min="-1" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(pan, 0, -1, 1)}"></label>
        <label class="inline-toggle"><input data-melody-mute="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="checkbox" ${section.melodyMute[trackIndex] ? "checked" : ""}> Mute</label>
        <label class="inline-toggle"><input data-melody-solo="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="checkbox" ${section.melodySolo[trackIndex] ? "checked" : ""}> Solo</label>
      </div>
      ${renderStepRuler(startStep, steps)}
      <div class="sequencer-row">
        <span>notes</span>
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const note = track[actualStep];
          const tuplet = !!section.melodyTuplets[trackIndex]?.[actualStep];
          const selected = selection?.kind === "melody" && selection.sectionId === section.id && selection.trackIndex === trackIndex && selection.step === actualStep;
          return `<button class="step note-step ${note === null || note === undefined ? "" : "on"} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="Melody ${trackIndex + 1} note step ${actualStep + 1}. Select then press H, S or T." data-melody-step="${sanitizeDataAttr(`${section.id}:${trackIndex}:${actualStep}`)}">${note === null || note === undefined ? "" : escapeHtml(BASS_LABELS[note] || String(note))}${stepBadges({ hold: !!section.melodyHold[trackIndex]?.[actualStep], slide: !!section.melodySlide[trackIndex]?.[actualStep], tuplet })}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function instrumentLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function selectedMelodyTrackIndex(track: Track | null) {
  const value = track?.metadata?.chordsmithMelodyTrackIndex;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (track?.id === "melody") return 0;
  const suffix = Number(track?.id.match(/-(\d+)$/)?.[1] || 1);
  return Math.max(0, suffix - 1);
}

function renderGuitarEditor(project: ReturnType<typeof currentProject>, pcs: SanitizedPcsProject, section: SanitizedPcsSection, startStep: number, steps: number): string {
  const guitarTrack = project.tracks.find((track) => track.role === "guitar");
  const inactive = !pcs.guitarEnabled || guitarTrack?.active === false;
  return `
    <div class="sequencer-block ${inactive ? "muted-editor" : ""}">
      <strong>Guitar</strong>
      <div class="editor-controls lane-controls">
        <label class="inline-toggle" title="Enable or mute generated guitar playback for this Chordsmith source."><input data-guitar-setting="guitarEnabled" type="checkbox" ${pcs.guitarEnabled ? "checked" : ""} title="Enable or mute generated guitar playback for this Chordsmith source."> Enabled</label>
        <label>Tone
          <select data-guitar-setting="guitarTone">
            ${POCKET_GUITAR_TONES.map((tone) => `<option value="${tone}" ${pcs.guitarTone === tone ? "selected" : ""}>${escapeHtml(instrumentLabel(tone))}</option>`).join("")}
          </select>
        </label>
        <label>Register
          <select data-guitar-setting="guitarRegister">
            ${POCKET_GUITAR_REGISTERS.map((register) => `<option value="${register}" ${pcs.guitarRegister === register ? "selected" : ""}>${escapeHtml(instrumentLabel(register))}</option>`).join("")}
          </select>
        </label>
        <label>Strum
          <select data-guitar-setting="guitarStrumMode">
            ${POCKET_GUITAR_STRUM_MODES.map((mode) => `<option value="${mode}" ${pcs.guitarStrumMode === mode ? "selected" : ""}>${escapeHtml(instrumentLabel(mode))}</option>`).join("")}
          </select>
        </label>
        <label>Volume <input data-guitar-setting="guitarVolume" type="range" min="0" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(pcs.guitarVolume, DEFAULT_STEM_MIX.guitar.volume, 0, 1)}"></label>
      </div>
      ${renderStepRuler(startStep, steps)}
      <div class="sequencer-row">
        <span>pattern</span>
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const art = section.guitarPattern[actualStep] || "off";
          return `<button class="step guitar-step ${art !== "off" ? "on" : ""}" title="${escapeAttr(`Guitar ${instrumentLabel(art)} step ${actualStep + 1}`)}" data-guitar-step="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${escapeHtml(GUITAR_LABELS[art] || art.slice(0, 2))}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderMetaStepRow(label: string, steps: number, render: (step: number) => string): string {
  return `
    <div class="sequencer-row sub-row">
      <span>${escapeHtml(label)}</span>
      ${Array.from({ length: steps }, (_, step) => render(step)).join("")}
    </div>
  `;
}

function stepBadges(flags: { hold?: boolean; slide?: boolean; tuplet?: boolean }): string {
  const badges = [
    flags.hold ? "H" : "",
    flags.slide ? "S" : "",
    flags.tuplet ? "T" : ""
  ].filter(Boolean);
  return badges.length ? `<span class="step-badges">${badges.map((badge) => `<span>${badge}</span>`).join("")}</span>` : "";
}

function drumLaneLabel(lane: string) {
  return DRUM_LANE_DEFS.find((def) => def.id === lane)?.label || lane;
}

function sourceDrumLane(lane: string): lane is "kick" | "snare" | "hat" {
  return lane === "kick" || lane === "snare" || lane === "hat";
}

function branchDrumStepLevel(project: ReturnType<typeof currentProject>, section: SanitizedPcsSection, lane: DrumLaneId, step: number): number {
  return sourceDrumLane(lane) ? section.grid[lane][step] || 0 : getDrumBranchStepLevel(project, section.id, lane, step);
}

function renderMixer(state: AppState): string {
  const project = currentProject(state);
  const selectedTrack = project.tracks.find((track) => track.id === state.selectedTrackId) || null;
  const tab = state.lowerDockTab || "mixer";
  const collapsed = isUiSectionCollapsed(state, "lower-dock");
  return `
    <footer class="${collapsed ? "mixer lower-dock collapsed" : "mixer lower-dock"}" data-layout-zone="mixer" data-scroll-key="mixer" data-lower-dock="${sanitizeDataAttr(tab)}" data-ui-collapse-section="lower-dock">
      <header class="lower-dock-header">
        <div>
          <h2>${escapeHtml(lowerDockTitle(tab))}</h2>
          <p>${escapeHtml(lowerDockSubtitle(tab, selectedTrack))}</p>
        </div>
        <div class="lower-dock-controls">
          <nav class="lower-dock-tabs" aria-label="Lower dock">
            ${(["mixer", "inserts", "sends", "automation", "piano-roll", "audio-editor", "export-details"] as LowerDockTab[]).map((item) => `
              <button type="button" data-action="lower-dock-${item}" class="${tab === item ? "active" : ""}" aria-pressed="${tab === item ? "true" : "false"}">${escapeHtml(lowerDockTitle(item))}</button>
            `).join("")}
          </nav>
          ${renderUiSectionToggle(state, "lower-dock")}
        </div>
      </header>
      ${collapsed ? `<div class="lower-dock-body lower-dock-collapsed">${renderCollapsedNotice(`${lowerDockTitle(tab)} controls are hidden.`)}</div>` : renderLowerDockBody(state, project, selectedTrack, tab)}
    </footer>
  `;
}

function renderLowerDockBody(state: AppState, project: ReturnType<typeof currentProject>, selectedTrack: Track | null, tab: LowerDockTab): string {
  if (tab === "inserts") return renderLowerDockInserts(project, selectedTrack);
  if (tab === "sends") return renderLowerDockSends(project, selectedTrack);
  if (tab === "automation") return renderLowerDockAutomation(project, selectedTrack);
  if (tab === "piano-roll") return renderLowerDockPianoRoll(project, state);
  if (tab === "audio-editor") return renderLowerDockAudioEditor(project, state);
  if (tab === "export-details") return renderLowerDockExportDetails(project);
  return `<div class="lower-dock-body mixer-strips">${project.tracks.map((track) => renderMixerStrip(project, track, state.meterLevels[track.id] || 0, state)).join("")}</div>`;
}

function renderLowerDockInserts(project: ReturnType<typeof currentProject>, selectedTrack: Track | null): string {
  if (!selectedTrack) {
    return `<div class="lower-dock-body lower-dock-empty"><strong>Select a track</strong><span>Inserts show the selected track FX chain and add-FX controls.</span></div>`;
  }
  const chain = getTrackFxChain(project, selectedTrack);
  return `
    <div class="lower-dock-body lower-dock-detail">
      <section class="dock-track-context">
        <h3>${escapeHtml(selectedTrack.name)}</h3>
        <p>${chain?.slots.length || 0} insert${chain?.slots.length === 1 ? "" : "s"} / ${selectedTrack.fxChainId || "no chain"}</p>
        ${selectedTrack.role !== "master" ? renderFxDropdown(selectedTrack) : ""}
      </section>
      ${renderFxInspector(project, chain)}
    </div>
  `;
}

function renderLowerDockSends(project: ReturnType<typeof currentProject>, selectedTrack: Track | null): string {
  if (!selectedTrack || selectedTrack.role === "master" || selectedTrack.trackType === "return") {
    return `<div class="lower-dock-body lower-dock-empty"><strong>Select a source track</strong><span>Sends are edited on generated, audio, MIDI or bus source tracks and routed into return tracks.</span></div>`;
  }
  return `
    <div class="lower-dock-body lower-dock-detail">
      <section class="dock-track-context">
        <h3>${escapeHtml(selectedTrack.name)}</h3>
        ${renderOutputSelector(project, selectedTrack)}
      </section>
      ${renderSendPanel(project, selectedTrack)}
    </div>
  `;
}

function renderLowerDockAutomation(project: ReturnType<typeof currentProject>, selectedTrack: Track | null): string {
  const projectPanel = renderProjectAutomationPanel(project);
  if (!selectedTrack || selectedTrack.role === "master" || selectedTrack.trackType === "return") {
    return `<div class="lower-dock-body lower-dock-detail">${projectPanel}<div class="lower-dock-empty"><strong>Select a source track</strong><span>Track automation lanes are available for volume, pan and selected sends.</span></div></div>`;
  }
  return `
    <div class="lower-dock-body lower-dock-detail">
      ${projectPanel}
      <section class="dock-track-context">
        <h3>${escapeHtml(selectedTrack.name)}</h3>
        <p>${trackHasAutomation(project, selectedTrack.id) ? "Automation lanes are active for this track." : "Create a lane to automate this track."}</p>
      </section>
      ${renderAutomationPanel(project, selectedTrack)}
      ${renderSendPanel(project, selectedTrack)}
    </div>
  `;
}

function renderProjectAutomationPanel(project: ReturnType<typeof currentProject>): string {
  const lane = getProjectAutomationLane(project, "tempo");
  return `
    <section class="dock-panel project-automation-panel" aria-label="Project automation">
      <h3>Project Automation</h3>
      ${renderProjectTempoAutomationLane(project, lane)}
      ${renderProjectMeterMap(project)}
    </section>
  `;
}

function renderProjectTempoAutomationLane(project: ReturnType<typeof currentProject>, lane: ReturnType<typeof getProjectAutomationLane>): string {
  if (!lane) {
    return `<div class="automation-lane empty"><span>Tempo</span><button type="button" data-project-automation-create="tempo">Create</button></div>`;
  }
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar);
  return `
    <div class="automation-lane">
      <header>
        <label class="inline-toggle"><input data-automation-enabled="${sanitizeDataAttr(lane.id)}" type="checkbox" ${lane.enabled ? "checked" : ""}> Tempo</label>
        <button type="button" data-project-automation-add-point="tempo">Add at Playhead</button>
      </header>
      ${renderAutomationCurveSurface(lane, "Tempo automation")}
      <p class="editor-note">Base ${Math.round(project.project.bpm)} BPM / tempo automation drives timeline timing; source-audio warp over ramps is pending.</p>
      ${
        points.length
          ? `<div class="automation-points">
              ${points.map((point, index) => `
                <div class="automation-point">
                  <label>Bar <input data-automation-point-bar="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="1" step="0.25" value="${sanitizeCssLengthOrNumber(point.bar, 1, 1, 4096)}"></label>
                  <label>BPM <input data-automation-point-value="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="40" max="240" step="1" value="${sanitizeCssLengthOrNumber(point.value, project.project.bpm, 40, 240)}"></label>
                  ${renderAutomationCurveSelect(lane.id, index, point)}
                  <button type="button" data-automation-delete-point="${sanitizeDataAttr(`${lane.id}:${index}`)}">Delete</button>
                </div>
              `).join("")}
            </div>`
          : `<p class="editor-note">No tempo points yet.</p>`
      }
    </div>
  `;
}

function renderProjectMeterMap(project: ReturnType<typeof currentProject>): string {
  const points = (project.project.meterMap || []).slice().sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id));
  if (!points.length) {
    return `<div class="automation-lane empty"><span>Meter Map</span><button type="button" data-project-meter-map-add="true">Add at Playhead</button><small>Import MIDI time signatures, then use Meter Lane, or add points manually.</small></div>`;
  }
  return `
    <div class="automation-lane project-meter-map">
      <header>
        <strong>Meter Map</strong>
        <small>${points.length} point${points.length === 1 ? "" : "s"}</small>
        <button type="button" data-project-meter-map-add="true">Add at Playhead</button>
      </header>
      <p class="editor-note">Stored as project timing data; active variable-meter grid/playback is a later timing-engine pass.</p>
      <div class="automation-points">
        ${points.slice(0, 8).map((point) => `
          <div class="automation-point" data-project-meter-map-point="${sanitizeDataAttr(point.id)}">
            <strong>${escapeHtml(`${point.numerator}/${point.denominator}`)}</strong>
            <label>Bar <input data-project-meter-map-field="${sanitizeDataAttr(`${point.id}:bar`)}" type="number" min="1" max="4096" step="0.25" value="${sanitizeCssLengthOrNumber(point.bar, 1, 1, 4096)}"></label>
            <label>Top <input data-project-meter-map-field="${sanitizeDataAttr(`${point.id}:numerator`)}" type="number" min="1" max="32" step="1" value="${sanitizeCssLengthOrNumber(point.numerator, 4, 1, 32)}"></label>
            <label>Bottom <input data-project-meter-map-field="${sanitizeDataAttr(`${point.id}:denominator`)}" type="number" min="1" max="32" step="1" value="${sanitizeCssLengthOrNumber(point.denominator, 4, 1, 32)}"></label>
            <span>${escapeHtml(formatBarBeat(project, point.bar))}</span>
            ${point.source === "midi-import" ? `<small>MIDI${typeof point.sourceTick === "number" ? ` tick ${sanitizeCssLengthOrNumber(point.sourceTick, 0, 0)}` : ""}</small>` : ""}
            <button type="button" data-project-meter-map-delete="${sanitizeDataAttr(point.id)}">Delete</button>
          </div>
        `).join("")}
      </div>
      ${points.length > 8 ? `<p class="editor-note">+${points.length - 8} more meter point${points.length - 8 === 1 ? "" : "s"}</p>` : ""}
    </div>
  `;
}

function renderLowerDockPianoRoll(project: ReturnType<typeof currentProject>, state: AppState): string {
  const clip = selectedClipForDock(project, state, "midi");
  if (!clip) {
    const selectedTrack = project.tracks.find((track) => track.id === state.selectedTrackId);
    return `<div class="lower-dock-body lower-dock-empty"><strong>${selectedTrack?.trackType === "midi" ? "Add a MIDI clip" : "Select a MIDI clip"}</strong><span>The Piano Roll tab edits MIDI notes, controllers, quantize, swing, velocity and pitch transforms for the selected MIDI clip.</span>${selectedTrack?.trackType === "midi" ? `<button type="button" data-action="add-empty-midi-clip">Add MIDI Clip</button>` : ""}</div>`;
  }
  return `
    <div class="lower-dock-body lower-dock-editor">
      <section class="dock-track-context">
        <h3>${escapeHtml(clip.name)}</h3>
        <p>${midiDataFromClip(clip).notes.length} notes / ${midiDataFromClip(clip).controllers.length} CC points</p>
      </section>
      ${renderMidiClipEditor(project, state, clip)}
    </div>
  `;
}

function renderLowerDockAudioEditor(project: ReturnType<typeof currentProject>, state: AppState): string {
  const clip = selectedClipForDock(project, state, "audio");
  if (!clip) {
    return `<div class="lower-dock-body lower-dock-empty"><strong>Select an audio clip</strong><span>The Audio Editor tab edits clip gain, fades, source offset, source-safe actions and clip-gain automation for the selected audio clip.</span></div>`;
  }
  const media = project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) || null;
  return `
    <div class="lower-dock-body lower-dock-editor">
      <section class="dock-track-context">
        <h3>${escapeHtml(clip.name)}</h3>
        <p>${escapeHtml(media?.name || "Audio clip")} / ${formatDuration(media?.durationSeconds || barsToSeconds(clip.barLength || 0, project.project.bpm, project.project.timeSig))}</p>
      </section>
      ${renderAudioClipProperties(project, clip)}
    </div>
  `;
}

function renderLowerDockExportDetails(project: ReturnType<typeof currentProject>): string {
  const stems = createStemExportPlan(project);
  const loops = createSectionLoopMetadata(project);
  const enabledProfiles = project.exportProfiles.filter((profile) => profile.enabled);
  const routing = createRoutingExportSummary(project);
  const portability = verifyMediaPortability(project);
  const sharedPortability = verifySharedMediaPortability(createPortableMediaProject(project));
  const deliveryTargets = createGamePackDeliveryTargets();
  return `
    <div class="lower-dock-body lower-dock-detail lower-dock-export">
      <section class="dock-track-context">
        <h3>${escapeHtml(project.project.title || "Untitled project")}</h3>
        <p>${project.timeline.bars} bars / ${project.project.bpm} BPM / ${project.project.sampleRate} Hz</p>
      </section>
      <section class="dock-export-summary">
        <h3>Export Details</h3>
        <dl>
          <dt>Stems</dt><dd>${stems.length}</dd>
          <dt>Section loops</dt><dd>${loops.length}</dd>
          <dt>Profiles</dt><dd>${enabledProfiles.length}</dd>
          <dt>Media</dt><dd>${project.mediaPool.length}</dd>
          <dt>Buses</dt><dd>${routing.busCount}</dd>
          <dt>Returns</dt><dd>${routing.returnCount}</dd>
          <dt>Sends</dt><dd>${routing.sendCount} (${routing.postFaderSendCount} post / ${routing.preFaderSendCount} pre)</dd>
        </dl>
        <div class="dock-export-portability">
          <h3>Media Portability</h3>
          <p>${portability.embeddedSourceProjectPortable ? "Embedded source project is portable." : `${portability.needsCollectionOrRelinkCount} media item${portability.needsCollectionOrRelinkCount === 1 ? "" : "s"} need collection or relink before the embedded source project is portable.`}</p>
          <dl>
            <dt>Project media</dt><dd>${portability.alreadyProjectCount}</dd>
            <dt>Copyable external</dt><dd>${portability.copyableExternalCount}</dd>
            <dt>Cache-only</dt><dd>${portability.cacheOnlyCount}</dd>
            <dt>Runtime-only</dt><dd>${portability.runtimeOnlyCount}</dd>
            <dt>Missing</dt><dd>${portability.missingOrUnresolvedCount}</dd>
            <dt>Blocked</dt><dd>${portability.blockedCount}</dd>
            <dt>Shared source refs</dt><dd>${sharedPortability.localReferenceFieldCount}</dd>
          </dl>
          ${sharedPortability.portableForSharing ? `<p>Embedded source project is share-safe.</p>` : `<p>${sharedPortability.localReferenceFieldCount} local reference field${sharedPortability.localReferenceFieldCount === 1 ? "" : "s"} remain in the embedded source project.</p>`}
        </div>
        ${routing.warnings.length ? `<div class="dock-routing-warnings">${routing.warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</div>` : ""}
        <div class="dock-export-portability" data-ui-scope="game">
          <h3>Game Delivery</h3>
          <dl>
            ${deliveryTargets.map((target) => `
              <dt>${escapeHtml(target.label)}</dt>
              <dd>
                ${escapeHtml(target.delivery)} / ${escapeHtml(target.supportedAudioFormats.join(", ").toUpperCase())}
                <br>Kind: ${escapeHtml(target.kind)}
                <br>Action: ${escapeHtml(target.action)}
                <br>Verifier: ${escapeHtml(target.verifierCommand)}
                <br>Target smoke: ${escapeHtml(target.targetRuntimeSmoke)}
                ${target.endpointUrl ? `<br>Endpoint: ${escapeHtml(target.endpointUrl)}` : ""}
                ${target.notes.length ? `<ul>${target.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
              </dd>
            `).join("")}
          </dl>
        </div>
        ${renderFullSongWavExportProfileControls(project)}
        ${renderWavZipExportProfileControls(project, "stem-wavs", "Stem WAV ZIP")}
        ${renderWavZipExportProfileControls(project, "section-loops", "Section Loop ZIP")}
        <div class="file-command-grid">
          <button data-action="export-wav" title="Render the full mix as a WAV file">Full WAV</button>
          <button data-action="export-midi" title="Export the full project MIDI arrangement">Full MIDI</button>
          <button data-action="export-stems" ${stems.length ? "" : "disabled"} title="Download a ZIP containing one WAV per stem plus a manifest">Stem WAV ZIP</button>
          <button data-action="export-section-manifest" ${loops.length ? "" : "disabled"} title="Download a ZIP containing one loop WAV per generated section plus a manifest">Section Loop ZIP</button>
          <button data-action="export-godot-manifest" data-ui-scope="game" title="Export a WAV-based adaptive audio pack for Godot">Godot Pack</button>
          <button data-action="push-godot-pack" data-ui-scope="game" title="Try a local Godot receiver first, then save the ZIP if unavailable">Push Godot Pack</button>
          <button data-action="export-web-game-manifest" data-ui-scope="game" title="Export a WAV-based adaptive audio pack for web games">Web Pack</button>
        </div>
      </section>
    </div>
  `;
}

function renderFullSongWavExportProfileControls(project: ReturnType<typeof currentProject>): string {
  const profile = project.exportProfiles.find((item) => item.id === "full-song-wav");
  if (!profile) return "";
  const sampleRate = Number(profile.sampleRate || project.project.sampleRate || 44100);
  const bitDepth = Number(profile.bitDepth || 16) === 32 ? 32 : Number(profile.bitDepth || 16) === 24 ? 24 : 16;
  const tailSeconds = Number(profile.settings?.tailSeconds ?? 1.2);
  const channelMode = profile.settings?.channelMode === "mono" ? "mono" : "stereo";
  const normalize = profile.settings?.normalize === true || profile.settings?.normalize === "peak" ? "peak" : "off";
  const dither = profile.settings?.dither === "tpdf" ? "tpdf" : "off";
  const sampleRates = [44100, 48000, 88200, 96000];
  return `
    <div class="export-profile-controls" data-export-profile="full-song-wav">
      <label>WAV rate
        <select data-export-profile-setting="${sanitizeDataAttr("full-song-wav:sampleRate")}">
          ${sampleRates.map((rate) => `<option value="${rate}" ${Math.round(sampleRate) === rate ? "selected" : ""}>${rate} Hz</option>`).join("")}
        </select>
      </label>
      <label>Tail
        <input type="number" min="0" max="30" step="0.1" value="${sanitizeCssLengthOrNumber(tailSeconds, 1.2, 0, 30)}" data-export-profile-setting="${sanitizeDataAttr("full-song-wav:tailSeconds")}">
      </label>
      <label>Channels
        <select data-export-profile-setting="${sanitizeDataAttr("full-song-wav:channelMode")}">
          <option value="stereo" ${channelMode === "stereo" ? "selected" : ""}>Stereo</option>
          <option value="mono" ${channelMode === "mono" ? "selected" : ""}>Mono</option>
        </select>
      </label>
      <label>Normalize
        <select data-export-profile-setting="${sanitizeDataAttr("full-song-wav:normalize")}">
          <option value="off" ${normalize === "off" ? "selected" : ""}>Off</option>
          <option value="peak" ${normalize === "peak" ? "selected" : ""}>Peak</option>
        </select>
      </label>
      <label>Dither
        <select data-export-profile-setting="${sanitizeDataAttr("full-song-wav:dither")}">
          <option value="off" ${dither === "off" ? "selected" : ""}>Off</option>
          <option value="tpdf" ${dither === "tpdf" ? "selected" : ""}>TPDF</option>
        </select>
      </label>
      <label>Depth
        <select data-export-profile-setting="${sanitizeDataAttr("full-song-wav:bitDepth")}">
          <option value="16" ${bitDepth === 16 ? "selected" : ""}>16-bit PCM</option>
          <option value="24" ${bitDepth === 24 ? "selected" : ""}>24-bit PCM</option>
          <option value="32" ${bitDepth === 32 ? "selected" : ""}>32-bit float</option>
        </select>
      </label>
    </div>
  `;
}

function renderWavZipExportProfileControls(project: ReturnType<typeof currentProject>, profileId: "stem-wavs" | "section-loops", label: string): string {
  const profile = project.exportProfiles.find((item) => item.id === profileId);
  if (!profile) return "";
  const sampleRate = Number(profile.sampleRate || project.project.sampleRate || 44100);
  const bitDepth = Number(profile.bitDepth || 16) === 32 ? 32 : Number(profile.bitDepth || 16) === 24 ? 24 : 16;
  const channelMode = profile.settings?.channelMode === "mono" ? "mono" : "stereo";
  const normalize = profile.settings?.normalize === true || profile.settings?.normalize === "peak" ? "peak" : "off";
  const dither = profile.settings?.dither === "tpdf" ? "tpdf" : "off";
  const sampleRates = [44100, 48000, 88200, 96000];
  return `
    <div class="export-profile-controls" data-export-profile="${sanitizeDataAttr(profileId)}">
      <label>${escapeHtml(label)} rate
        <select data-export-profile-setting="${sanitizeDataAttr(`${profileId}:sampleRate`)}">
          ${sampleRates.map((rate) => `<option value="${rate}" ${Math.round(sampleRate) === rate ? "selected" : ""}>${rate} Hz</option>`).join("")}
        </select>
      </label>
      <label>Channels
        <select data-export-profile-setting="${sanitizeDataAttr(`${profileId}:channelMode`)}">
          <option value="stereo" ${channelMode === "stereo" ? "selected" : ""}>Stereo</option>
          <option value="mono" ${channelMode === "mono" ? "selected" : ""}>Mono</option>
        </select>
      </label>
      <label>Normalize
        <select data-export-profile-setting="${sanitizeDataAttr(`${profileId}:normalize`)}">
          <option value="off" ${normalize === "off" ? "selected" : ""}>Off</option>
          <option value="peak" ${normalize === "peak" ? "selected" : ""}>Peak</option>
        </select>
      </label>
      <label>Dither
        <select data-export-profile-setting="${sanitizeDataAttr(`${profileId}:dither`)}">
          <option value="off" ${dither === "off" ? "selected" : ""}>Off</option>
          <option value="tpdf" ${dither === "tpdf" ? "selected" : ""}>TPDF</option>
        </select>
      </label>
      <label>Depth
        <select data-export-profile-setting="${sanitizeDataAttr(`${profileId}:bitDepth`)}">
          <option value="16" ${bitDepth === 16 ? "selected" : ""}>16-bit PCM</option>
          <option value="24" ${bitDepth === 24 ? "selected" : ""}>24-bit PCM</option>
          <option value="32" ${bitDepth === 32 ? "selected" : ""}>32-bit float</option>
        </select>
      </label>
    </div>
  `;
}

function selectedClipForDock(project: ReturnType<typeof currentProject>, state: AppState, type: "midi" | "audio"): Clip | null {
  const selected = project.timeline.clips.find((clip) => clip.id === state.selectedClipId && clip.type === type);
  if (selected) return selected;
  return project.timeline.clips.find((clip) => clip.type === type && (!state.selectedTrackId || clip.trackId === state.selectedTrackId)) || null;
}

function lowerDockTitle(tab: LowerDockTab): string {
  if (tab === "inserts") return "Inserts";
  if (tab === "piano-roll") return "Piano Roll";
  if (tab === "audio-editor") return "Audio Editor";
  if (tab === "export-details") return "Export";
  if (tab === "sends") return "Sends";
  if (tab === "automation") return "Automation";
  return "Mixer";
}

function lowerDockSubtitle(tab: LowerDockTab, selectedTrack: Track | null): string {
  if (tab === "inserts") return selectedTrack ? `${selectedTrack.name} FX chain` : "Select a track to edit inserts";
  if (tab === "piano-roll") return "Selected MIDI clip editing";
  if (tab === "audio-editor") return "Selected audio clip editing";
  if (tab === "export-details") return "Full mix, stems, loops and game packs";
  if (tab === "sends") return selectedTrack ? `${selectedTrack.name} return routing` : "Select a track to edit return sends";
  if (tab === "automation") return selectedTrack ? `${selectedTrack.name} track automation` : "Select a track to edit automation";
  return "Track levels, pan, mute, solo, record and FX";
}

function renderMediaPool(state: AppState): string {
  const project = currentProject(state);
  const items = project.mediaPool;
  const collectPlan = createCollectMediaPlan(project);
  const portability = verifyMediaPortability(project);
  const collapsed = isUiSectionCollapsed(state, "media-pool");
  return `
    <section class="${collapsed ? "media-pool collapsed" : "media-pool"}" data-layout-zone="media" id="mediaPool" aria-label="Media Pool" data-scroll-key="media-pool" data-ui-collapse-section="media-pool">
      <header>
        <div>
          <h2>Media Pool</h2>
          <p>${items.length ? `${items.length} item${items.length === 1 ? "" : "s"} tracked for audio, MIDI, renders and project-relative media.` : "Imported audio and MIDI appear here with timeline clips and runtime status."}</p>
        </div>
        ${renderUiSectionToggle(state, "media-pool")}
      </header>
      ${
        collapsed
          ? renderCollapsedNotice("Media pool items, render cache and portability details are hidden.")
          : items.length
            ? `<div class="media-grid">
              ${items.map((item) => {
                const status = mediaPoolStatus(item, item.kind === "audio" && !!getCachedAudioBuffer(item.id));
                const cacheItems = renderCacheItemsForMedia(project, item.id);
                const analysisLabel = item.kind === "audio" ? mediaItemAnalysisLabel(item) : "";
                const warnings = mediaItemWarnings(item);
                const tempoMap = item.kind === "midi" ? createMidiTempoMapSummary(item.metadata, { fallbackBpm: project.project.bpm, fallbackTimeSig: project.project.timeSig }) : null;
                return `
                  <article class="media-item ${status.missing ? "missing" : ""} ${status.runtimeAvailable ? "runtime-available" : ""}">
                    <div class="media-name">
                      <strong>${escapeHtml(item.name)}</strong>
                      <span>${escapeHtml(item.kind)} / ${escapeHtml(status.label)}</span>
                    </div>
                    <dl>
                      <dt>Duration</dt><dd>${formatDuration(item.durationSeconds)}</dd>
                      <dt>Sample rate</dt><dd>${item.sampleRate ? `${item.sampleRate} Hz` : "-"}</dd>
                      <dt>Channels</dt><dd>${item.channels ?? "-"}</dd>
                      <dt>Size</dt><dd>${formatBytes(item.sizeBytes)}</dd>
                      <dt>URI</dt><dd title="${escapeAttr(item.uri || "")}">${escapeHtml(item.uri || "-")}</dd>
                      <dt>Persistence</dt><dd title="${escapeAttr(mediaPersistenceDetail(status, cacheItems.length))}">${escapeHtml(mediaPersistenceLabel(status, cacheItems.length))}</dd>
                      ${analysisLabel ? `<dt>Analysis</dt><dd>${escapeHtml(analysisLabel)}</dd>` : ""}
                      ${tempoMap ? `<dt>Tempo Map</dt><dd>${renderMidiTempoMapSummary(tempoMap)}</dd>` : ""}
                      ${warnings.length ? `<dt>Warnings</dt><dd>${warnings.map(escapeHtml).join(" / ")}</dd>` : ""}
                      <dt>Cache</dt><dd>${cacheItems.length ? cacheItems.map((cache) => `${escapeHtml(cache.id)}${cache.invalidated ? " invalid" : ""}`).join(", ") : "-"}</dd>
                    </dl>
                    ${renderMediaWaveform(item)}
                    <div class="media-item-actions">
                      ${status.reloadable ? `<button type="button" data-reload-media="${sanitizeDataAttr(item.id)}" title="Reload this audio file into the runtime buffer cache">Reload</button>` : ""}
                      ${status.relinkable ? `<button type="button" data-relink-media="${sanitizeDataAttr(item.id)}" title="Choose a replacement file for this media item">Relink</button>` : ""}
                      ${item.kind === "audio" ? `<button type="button" data-place-audio="${sanitizeDataAttr(item.id)}">Place on Timeline</button>` : ""}
                      ${item.kind === "midi" ? `<span>MIDI clips are created from the selected import placement</span>` : ""}
                    </div>
                  </article>
                `;
              }).join("")}
            </div>`
            : `<div class="media-empty">
              <strong>No media pool items yet.</strong>
              <span>Import Audio adds decoded runtime buffers and timeline-placeable clips. Import MIDI adds a media-pool item, MIDI clip and piano-roll note editor.</span>
            </div>`
      }
      ${
        collapsed
          ? ""
          : `<aside class="render-cache-summary">
              <strong>Render Cache</strong>
              <span>${project.renderCache.length ? project.renderCache.map((item) => `${escapeHtml(item.id)}${item.mediaPoolItemId ? ` -> ${escapeHtml(item.mediaPoolItemId)}` : ""}${item.invalidated ? " (invalidated)" : ""}`).join(" / ") : "No render cache entries yet. Freeze, stem and game-pack renders will link cache entries to media pool items here."}</span>
              <strong>Native Playback</strong>
              <span>${escapeHtml(nativeCacheStatusText(state))}</span>
              <strong>Collect Plan</strong>
              <span>${collectPlan.copy.length} copy / ${collectPlan.alreadyProject.length} project / ${collectPlan.blocked.length} blocked</span>
              <strong>Portability Check</strong>
              <span>${portability.embeddedSourceProjectPortable ? "Embedded source portable" : `${portability.needsCollectionOrRelinkCount} need action${portability.cacheOnlyCount ? ` / ${portability.cacheOnlyCount} cache-only` : ""}`}</span>
            </aside>`
      }
    </section>
  `;
}

function nativeCacheStatusText(state: AppState): string {
  const status = state.nativeCacheStatus;
  if (status.lastError) return `Cache error: ${status.lastError}`;
  if (status.buildPending) return "Building native cache...";
  if (status.bypassedForLiveEdits) return "Native event playback after live edit; rebuild cache to restore cached generated stems.";
  if (status.generatedStemRenderFailureCount > 0) {
    const detail = status.lastGeneratedStemRenderError ? `: ${status.lastGeneratedStemRenderError}` : ".";
    return `Native cache-stem render failed for ${status.generatedStemRenderFailureCount} generated stem${status.generatedStemRenderFailureCount === 1 ? "" : "s"}${detail}`;
  }
  if (status.assetRegionCount > 0) {
    const parts = [
      `${status.assetRegionCount} cached region${status.assetRegionCount === 1 ? "" : "s"}`,
      `${status.cachedClipCount} cached clip${status.cachedClipCount === 1 ? "" : "s"}`,
      `${status.generatedRegionCount} generated`,
      `${status.runtimeAudioRegionCount} audio`,
      `${status.proceduralFallbackEventCount} native event fallback${status.proceduralFallbackEventCount === 1 ? "" : "s"}`
    ];
    const reason = status.lastBuildReason ? ` / ${status.lastBuildReason}` : "";
    return `${parts.join(" / ")}${reason}`;
  }
  if (status.prewarmScheduled) return "Native cache prewarm scheduled.";
  const cacheItems = currentProject(state).renderCache.filter((item) => String(item.metadata?.cacheKind || "").startsWith("native-"));
  if (cacheItems.length) return `${cacheItems.length} native cache metadata item${cacheItems.length === 1 ? "" : "s"} saved; build or reopen to activate cached playback.`;
  if (status.proceduralFallbackEventCount > 0) return `No native cache active; ${status.proceduralFallbackEventCount} native event${status.proceduralFallbackEventCount === 1 ? "" : "s"} ready.`;
  return "No native cache active.";
}

function mediaItemWarnings(item: ReturnType<typeof currentProject>["mediaPool"][number]): string[] {
  const warnings = item.metadata?.importWarnings;
  return Array.isArray(warnings) ? warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0) : [];
}

function renderMidiTempoMapSummary(summary: MidiTempoMapSummary): string {
  const tempoRows = summary.tempoEvents.slice(0, 4).map((event) => `${event.bpm} BPM @ ${midiPositionLabel(event.position)} (${formatDuration(event.seconds)})`);
  const meterRows = summary.timeSignatureEvents.slice(0, 4).map((event) => `${event.numerator}/${event.denominator} @ ${midiPositionLabel(event.position)} (${formatDuration(event.seconds)})`);
  const parts = [
    tempoRows.length ? `Tempo ${tempoRows.join(" / ")}${summary.tempoEvents.length > tempoRows.length ? ` / +${summary.tempoEvents.length - tempoRows.length}` : ""}` : "",
    meterRows.length ? `Meter ${meterRows.join(" / ")}${summary.timeSignatureEvents.length > meterRows.length ? ` / +${summary.timeSignatureEvents.length - meterRows.length}` : ""}` : "",
    summary.hasTempoChanges || summary.hasMeterChanges ? "preserved from MIDI; playback still follows project tempo/meter" : "preserved from MIDI"
  ].filter(Boolean);
  return escapeHtml(parts.join(" / "));
}

function midiPositionLabel(position: MidiTempoMapPosition): string {
  return `${position.bar}.${position.beat}.${position.tick}`;
}

function renderFilePanel(state: AppState): string {
  const project = currentProject(state);
  const stems = createStemExportPlan(project);
  const loops = createSectionLoopMetadata(project);
  const collectPlan = createCollectMediaPlan(project);
  const progress = state.exportProgress;
  const futureExportButtons = renderFutureExportButtons(project);
  const pocketDjSummary = createPocketDjSourceSummary(project);
  return `
    <div class="modal-backdrop" data-file-backdrop="true">
      <section class="controls-panel file-panel" role="dialog" aria-modal="true" aria-labelledby="file-window-title">
      <header>
        <div>
          <h2 id="file-window-title">File</h2>
          <p>${escapeHtml(project.project.title || "Untitled project")} / ${escapeHtml(state.currentFile.path || state.currentFile.label || "Unsaved")}</p>
        </div>
        <button data-action="file-window-close">Close</button>
      </header>
      <div class="file-window-body">
        <section class="file-window-section" aria-labelledby="file-project-title">
          <div>
            <h3 id="file-project-title">Project</h3>
            <p>Open, save, or reset the current .pocketdaw session.</p>
          </div>
          <div class="file-command-grid">
            <button data-action="new-project">New</button>
            <button data-action="open-project">Open .pocketdaw</button>
            <button data-action="save-project">Save .pocketdaw</button>
            <button data-action="save-project-as">Save As</button>
            <button data-action="load-demo">Load Demo Copy</button>
            <button data-action="reset-demo-template">Reload Demo Template</button>
          </div>
        </section>
        <section class="file-window-section" aria-labelledby="file-import-title">
          <div>
            <h3 id="file-import-title">Import</h3>
            <p>Bring in Chordsmith text, project files, audio, or MIDI without keeping import controls on the mixer page.</p>
          </div>
          <textarea id="importText" class="file-import-text" spellcheck="false" placeholder="Paste PCS1 share code, raw Pocket Chordsmith JSON, Pocket DJ source session, or .pocketdaw JSON">${escapeHtml(state.importText)}</textarea>
          <label class="file-inline-control">MIDI placement
            <select id="midiImportPlacementMode" title="Choose how imported MIDI files are placed on DAW tracks">
              ${MIDI_IMPORT_PLACEMENT_MODES.map((mode) => `<option value="${mode.id}" ${state.midiImportPlacementMode === mode.id ? "selected" : ""}>${escapeHtml(mode.name)}</option>`).join("")}
            </select>
          </label>
          <div class="file-command-grid">
            <button data-action="import-text">Import Paste</button>
            <button data-action="open-file">Open File</button>
            <button data-action="import-audio" title="Import an audio file into the media pool">Import Audio</button>
            <button data-action="import-midi" title="Import a .mid or .midi file as a MIDI clip">Import MIDI</button>
          </div>
          ${pocketDjSummary ? renderPocketDjSourceSummary(pocketDjSummary) : ""}
        </section>
        <section class="file-window-section" aria-labelledby="file-export-title">
          <div>
            <h3 id="file-export-title">Export</h3>
            <p>${stems.length} stem group${stems.length === 1 ? "" : "s"} / ${loops.length} section loop${loops.length === 1 ? "" : "s"} ready.</p>
          </div>
          <div class="file-command-grid">
            <button data-action="export-wav" title="Render the full mix as a WAV file">Full WAV</button>
            <button data-action="export-midi" title="Export the full project MIDI arrangement">Full MIDI</button>
            <button data-action="export-stems" ${stems.length ? "" : "disabled"} title="Downloads a ZIP containing one WAV per stem plus a manifest">Stem WAV ZIP</button>
            <button data-action="export-section-manifest" ${loops.length ? "" : "disabled"} title="Downloads a ZIP containing one loop WAV per generated section plus a manifest">Section Loop ZIP</button>
            <button data-action="export-godot-manifest" data-ui-scope="game" title="Export a WAV-based adaptive audio pack for Godot">Godot Game Pack</button>
            <button data-action="push-godot-pack" data-ui-scope="game" title="Try a local Godot receiver first, then save the ZIP if unavailable">Push Godot Pack</button>
            <button data-action="export-web-game-manifest" data-ui-scope="game" title="Export a WAV-based adaptive audio pack for web games">Web Game Pack</button>
            <button data-action="export-media-plan" title="Export a JSON plan for collecting project media">Collect Media Plan</button>
            <button data-action="export-diagnostics">Diagnostics JSON</button>
          </div>
          ${futureExportButtons}
          ${progress ? `
            <div class="export-progress" role="status" aria-live="polite">
              <div>
                <strong>${escapeHtml(progress.message)}</strong>
                ${progress.detail ? `<span>${escapeHtml(progress.detail)}</span>` : ""}
              </div>
              <i></i>
            </div>
          ` : ""}
          <p class="file-note">Full mix, stem, section-loop and game-pack exports render real audio into deterministic pack paths.</p>
        </section>
        <section class="file-window-section" aria-labelledby="file-media-title">
          <div>
            <h3 id="file-media-title">Media</h3>
            <p>${project.mediaPool.length} media item${project.mediaPool.length === 1 ? "" : "s"} / ${collectPlan.copy.length} copy action${collectPlan.copy.length === 1 ? "" : "s"} / ${collectPlan.blocked.length} blocked.</p>
          </div>
          <div class="file-command-grid">
            <button data-action="collect-media" title="Copy reloadable native media beside the saved .pocketdaw project">Collect Media</button>
            <button data-action="build-native-cache" title="Render generated sections and runtime audio into project-cache/native-audio WAV assets">Build Native Cache</button>
            <button data-action="media-pool-focus">Show Media Pool</button>
            <button data-action="audio-settings-open">Audio Settings</button>
          </div>
        </section>
      </div>
      </section>
    </div>
  `;
}

function renderFutureExportButtons(project: ReturnType<typeof currentProject>): string {
  const futureExportActions: Record<string, string> = {
    "full-song-flac": "export-full-flac",
    "stem-flacs": "export-stem-flacs",
    "full-song-mp3": "export-full-mp3",
    "godot-ogg-pack": "export-godot-ogg-pack",
    "web-ogg-pack": "export-web-ogg-pack",
    "aiff-interchange": "export-aiff-interchange"
  };
  const plannedIds = ["full-song-flac", "stem-flacs", "godot-ogg-pack", "web-ogg-pack", "full-song-mp3", "aiff-interchange"];
  const profiles = plannedIds
    .map((id) => project.exportProfiles.find((profile) => profile.id === id))
    .filter(Boolean);
  if (!profiles.length) return "";
  return `
    <div class="file-command-grid future-export-grid" aria-label="Planned export formats">
      ${profiles.map((profile) => {
        const validation = validateExportProfile(profile!);
        const title = [...validation.errors, ...validation.warnings].join(" ") || `${profile!.name} is planned for a later codec-enabled build.`;
        const action = futureExportActions[profile!.id] || "export-wav";
        return `<button data-action="${action}" disabled title="${escapeAttr(title)}">${escapeHtml(profile!.name)} planned</button>`;
      }).join("")}
    </div>
    <p class="file-note">FLAC, Ogg, MP3 and AIFF exports are visible as future profiles only; this build exports WAV-based game packs until encoders and target-runtime smoke are proven.</p>
  `;
}

function renderPocketDjSourceSummary(summary: PocketDjSourceSummary): string {
  const sequence = summary.sequence.length ? summary.sequence.join(" -> ") : "No saved sequence";
  const muteCount = Object.values(summary.stemMutes).filter(Boolean).length;
  const stemVolumeRows = Object.entries(summary.stemVolumes)
    .slice(0, 5)
    .map(([stem, value]) => `${stem} ${Math.round(value * 100)}%`);
  const fxRows = Object.entries(summary.fx)
    .filter(([, value]) => value > 0)
    .slice(0, 5)
    .map(([name, value]) => `${name} ${Math.round(value * 100)}%`);
  const statusParts = [
    summary.currentSection ? `Current ${summary.currentSection}` : "",
    summary.queuedSection ? `Queued ${summary.queuedSection}` : "",
    summary.launchQuantize ? `Launch ${summary.launchQuantize}` : "",
    summary.loopCurrentSection ? "Hold on" : "",
    summary.sequencePlaying ? "Sequence playing" : "",
    summary.buildActive ? "Build active" : ""
  ].filter(Boolean);
  return `
    <div class="file-note pocket-dj-source-summary">
      <strong>Pocket DJ metadata preserved:</strong>
      <span>${escapeHtml(summary.title)} / ${escapeHtml(summary.sourcePrefix)}${summary.djVersion ? ` v${summary.djVersion}` : ""} / ${escapeHtml(statusParts.join(" / ") || "No active DJ transport state")}</span>
      <span>Sequence: ${escapeHtml(sequence)}${summary.sequenceRepeat ? " / repeat" : ""}${summary.dropTarget ? ` / drop ${escapeHtml(summary.dropTarget)}` : ""}</span>
      <span>Mixer: ${summary.masterVolume === null ? "master n/a" : `master ${Math.round(summary.masterVolume * 100)}%`} / ${muteCount} muted stem${muteCount === 1 ? "" : "s"}${stemVolumeRows.length ? ` / ${escapeHtml(stemVolumeRows.join(", "))}` : ""}</span>
      <span>FX metadata: ${escapeHtml(fxRows.length ? fxRows.join(", ") : "none active")}. DJ state is preserved for future handoff/export and is not silently applied to the DAW mix.</span>
    </div>
  `;
}

function mediaItemAnalysisLabel(item: { metadata?: Record<string, unknown> }): string {
  const peaks = mediaWaveformPeaks(item);
  const stale = item.metadata?.analysisInvalidated === true || item.metadata?.waveformNeedsRefresh === true;
  const cache = typeof item.metadata?.nativeDecodedCacheRelativePath === "string" && item.metadata.nativeDecodedCacheRelativePath.trim() ? " / decoded cache" : "";
  const transients = mediaTransientMarkers(item);
  const transientLabel = transients.length ? ` / ${transients.length} transients` : "";
  if (!peaks.length) return `Waveform missing${stale ? " / stale flag" : ""}${cache}${transientLabel}`;
  const maxPeak = peaks.reduce((peak, value) => Math.max(peak, value), 0);
  return `Waveform ready (${peaks.length} peaks, max ${Math.round(maxPeak * 100)}%)${stale ? " / stale flag" : ""}${cache}${transientLabel}`;
}

function renderMediaWaveform(item: { durationSeconds?: number; metadata?: Record<string, unknown> }): string {
  const peaks = mediaWaveformPeaks(item).slice(0, 64);
  if (!peaks.length) return "";
  const duration = Number(item.durationSeconds || 0);
  const markerHtml = duration > 0
    ? mediaTransientMarkers(item)
      .filter((marker) => marker <= duration)
      .slice(0, 64)
      .map((marker) => `<i class="media-transient-marker" title="Transient ${escapeAttr(`${marker.toFixed(2)}s`)}" style="left:${sanitizeCssLengthOrNumber((marker / duration) * 100, 0, 0, 100)}%"></i>`)
      .join("")
    : "";
  return `<div class="media-waveform${markerHtml ? " has-transients" : ""}">${peaks.map((peak) => `<span style="height:${sanitizeCssLengthOrNumber(Math.max(2, Math.round(peak * 28)), 2, 2, 28)}px"></span>`).join("")}${markerHtml}</div>`;
}

function mediaWaveformPeaks(item: { metadata?: Record<string, unknown> }): number[] {
  const peaks = item.metadata?.waveformPeaks;
  if (!Array.isArray(peaks)) return [];
  return peaks
    .map((peak) => Number(peak))
    .filter((peak) => Number.isFinite(peak) && peak >= 0)
    .map((peak) => Math.min(1, peak));
}

function mediaTransientMarkers(item: { metadata?: Record<string, unknown> }): number[] {
  const markers = item.metadata?.audioTransientMarkersSeconds;
  if (!Array.isArray(markers)) return [];
  return markers
    .map((marker) => Number(marker))
    .filter((marker) => Number.isFinite(marker) && marker >= 0);
}

function audioWarpMarkersForUi(clip: Clip): Array<{ id: string; sourceSeconds: number; targetBar: number; targetSeconds: number }> {
  const markers = clip.metadata?.audioWarpMarkers;
  if (!Array.isArray(markers)) return [];
  return markers
    .map((marker, index) => {
      if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
      const data = marker as Record<string, unknown>;
      const sourceSeconds = Number(data.sourceSeconds);
      const targetBar = Number(data.targetBar);
      const targetSeconds = Number(data.targetSeconds);
      if (!Number.isFinite(sourceSeconds) || !Number.isFinite(targetBar) || !Number.isFinite(targetSeconds)) return null;
      return { id: typeof data.id === "string" ? data.id : `warp_${index + 1}`, sourceSeconds, targetBar, targetSeconds };
    })
    .filter((marker): marker is { id: string; sourceSeconds: number; targetBar: number; targetSeconds: number } => !!marker)
    .slice(0, 128);
}

function renderMixerStrip(project: ReturnType<typeof currentProject>, track: Track, meterLevel: number, state: AppState): string {
  if (track.trackType === "folder") return renderFolderMixerStrip(track);
  const panLabel = panReadout(track.pan);
  const volumeLabel = `${Math.round(track.volume * 100)}%`;
  const chain = getTrackFxChain(project, track);
  const isMaster = track.role === "master";
  const isReturn = track.role === "fx-return";
  const canMuteSolo = !isMaster && !isReturn;
  const canSolo = canMuteSolo;
  const canArm = !!track.recordKind && track.recordKind !== "none";
  const inputPreviewActive = track.id === state.recording.trackId && (track.armed || state.recording.status === "recording");
  const displayMeterLevel = inputPreviewActive ? state.recording.inputPeak : meterLevel;
  const meterLabel = `${Math.round(displayMeterLevel * 100)}%`;
  return `
    <div class="strip ${canArm ? "record-capable" : ""} ${track.active === false ? "inactive" : ""}">
      <div class="strip-name">
        <button type="button" data-track-rename="${sanitizeDataAttr(track.id)}" title="${escapeAttr(`Rename ${track.name}`)}">${escapeHtml(track.name)}</button>
        <small>${isMaster ? "Output" : track.active === false ? "Inactive" : track.solo ? "Solo" : track.mute ? "Muted" : "Active"}</small>
      </div>
      ${canArm ? renderMixerInputSelector(project, track, state) : ""}
      <div class="meter" data-meter="${sanitizeDataAttr(track.id)}" aria-label="${escapeAttr(`${track.name} peak meter ${meterLabel}`)}" title="Live peak meter">
        <span data-meter-fill="${sanitizeDataAttr(track.id)}" style="height:${sanitizeCssLengthOrNumber(Math.round(displayMeterLevel * 100), 0, 0, 100)}%"></span>
      </div>
      <label class="strip-control">
        <span>Volume <strong>${volumeLabel}</strong></span>
        <input aria-label="${escapeAttr(`${track.name} volume`)}" aria-valuetext="${escapeAttr(volumeLabel)}" data-volume="${sanitizeDataAttr(track.id)}" data-mixer-control="volume" data-mixer-live="true" type="range" min="0" max="1.2" step="0.01" value="${sanitizeCssLengthOrNumber(track.volume, 1, 0, 1.2)}">
      </label>
      ${renderPanControl(track, isMaster, isReturn, panLabel)}
      <div class="strip-buttons">
        ${
          isMaster
            ? `<span class="strip-note">Limiter ${track.metadata?.limiter === false ? "Off" : "On"}</span>`
            : `${canMuteSolo ? `<button type="button" title="${escapeAttr(`Mute ${track.name}`)}" class="${track.mute ? "on" : ""}" data-mute-track="${sanitizeDataAttr(track.id)}">Mute</button>
               ${canSolo ? `<button type="button" title="${escapeAttr(`Solo ${track.name}`)}" class="${track.solo ? "on" : ""}" data-solo-track="${sanitizeDataAttr(track.id)}">Solo</button>` : ""}` : `<span class="strip-note">Return channel</span>`}
               ${canArm ? `<button type="button" title="${escapeAttr(`Arm ${track.name} for mono recording`)}" class="${track.armed ? "on record" : ""}" data-arm-track="${sanitizeDataAttr(track.id)}">Arm</button>
               <button type="button" title="${escapeAttr(`Monitor ${track.name} input while armed or recording`)}" class="${track.monitorEnabled ? "on" : ""}" data-monitor-track="${sanitizeDataAttr(track.id)}">Monitor</button>` : ""}`
        }
      </div>
      ${renderMixerFxArea(track, chain, isMaster)}
    </div>
  `;
}

function renderFolderMixerStrip(track: Track): string {
  return `
    <div class="strip folder-strip ${track.solo ? "solo" : ""} ${track.mute ? "muted" : ""}">
      <div class="strip-name">
        <button type="button" data-track-rename="${sanitizeDataAttr(track.id)}" title="${escapeAttr(`Rename ${track.name}`)}">${escapeHtml(track.name)}</button>
        <small>${track.solo ? "Solo group" : track.mute ? "Muted group" : "Folder group"}</small>
      </div>
      <div class="strip-buttons">
        <button type="button" title="${escapeAttr(`Mute child lanes in ${track.name}`)}" class="${track.mute ? "on" : ""}" data-mute-track="${sanitizeDataAttr(track.id)}">Mute</button>
        <button type="button" title="${escapeAttr(`Solo child lanes in ${track.name}`)}" class="${track.solo ? "on" : ""}" data-solo-track="${sanitizeDataAttr(track.id)}">Solo</button>
      </div>
      <div class="strip-note folder-strip-note">Group Mute/Solo controls child lanes.</div>
      <div class="strip-note">No fader, pan, sends, FX or folder stem yet.</div>
    </div>
  `;
}

function renderMixerInputSelector(project: ReturnType<typeof currentProject>, track: Track, state: AppState): string {
  const inputs = (project.audioDeviceSettings.devices || []).filter((device) => device.kind === "input" || device.kind === "duplex");
  const active = state.recording.trackId === track.id && (track.armed || state.recording.status === "recording");
  const inputLabel = active
    ? state.recording.inputDeviceName || "Default input"
    : inputs.find((device) => device.id === track.inputDeviceId)?.name || inputs.find((device) => device.id === project.audioDeviceSettings.inputDeviceId)?.name || "Default input";
  const compactLabel = compactInputLabel(inputLabel);
  const channelMode = track.recordingChannelMode === "stereo" ? "stereo" : "mono";
  const peak = active ? state.recording.inputPeak : 0;
  const channelOptions = recordingInputChannelOptions(project, track);
  const selectedChannel = recordingInputChannelValue(track);
  const latencyOffsetMs = Math.round(recordingLatencyOffsetSeconds(track) * 1000);
  return `
    <label class="strip-control strip-input">
      <span>Input <strong title="${escapeAttr(inputLabel)}">${escapeHtml(compactLabel)}</strong></span>
      <select data-track-input="${sanitizeDataAttr(track.id)}" aria-label="${escapeAttr(`Recording input for ${track.name}`)}">
        <option value="">Default input</option>
        ${inputs.map((device) => `<option value="${escapeAttr(device.id)}" ${track.inputDeviceId === device.id ? "selected" : ""}>${escapeHtml(device.name)}</option>`).join("")}
      </select>
      <i class="input-activity" title="Armed input activity"><b data-input-activity-fill="${sanitizeDataAttr(track.id)}" style="width:${sanitizeCssLengthOrNumber(Math.round(peak * 100), 0, 0, 100)}%"></b></i>
    </label>
    <label class="strip-control strip-input">
      <span>Record <strong>${recordingChannelLabel(track)}</strong></span>
      <select data-track-record-channel-mode="${sanitizeDataAttr(track.id)}" aria-label="${escapeAttr(`Recording channel mode for ${track.name}`)}">
        <option value="mono" ${channelMode === "mono" ? "selected" : ""}>Mono</option>
        <option value="stereo" ${channelMode === "stereo" ? "selected" : ""}>Stereo</option>
      </select>
    </label>
    <label class="strip-control strip-input">
      <span>Channel <strong>${escapeHtml(recordingInputChannelLabel(selectedChannel))}</strong></span>
      <select data-track-record-channel="${sanitizeDataAttr(track.id)}" aria-label="${escapeAttr(`Recording input channel for ${track.name}`)}" title="Choose the hardware input channel or stereo pair for this live track.">
        ${channelOptions.map((option) => `<option value="${escapeAttr(option.value)}" ${option.value === selectedChannel ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
      <small title="Current native recording alpha only captures default channels.">Current native recording supports Mono Ch 1 or Stereo Ch 1-2 only; other choices are preflighted and blocked until channel routing lands.</small>
    </label>
    <label class="strip-control strip-input">
      <span>Latency <strong>${latencyOffsetMs} ms</strong></span>
      <input
        data-track-recording-latency="${sanitizeDataAttr(track.id)}"
        type="number"
        min="-500"
        max="500"
        step="1"
        value="${latencyOffsetMs}"
        aria-label="${escapeAttr(`Manual recording latency offset for ${track.name}`)}"
        title="Positive values place new recordings earlier; negative values place them later. Raw recorded media is not changed."
      />
      <small title="Manual and opt-in: Pocket DAW stores the requested and applied offset on each placed take.">Manual take placement offset.</small>
    </label>
  `;
}

function recordingChannelLabel(track: Track): "Mono" | "Stereo" {
  return track.recordingChannelMode === "stereo" ? "Stereo" : "Mono";
}

function recordingInputChannelOptions(project: ReturnType<typeof currentProject>, track: Track): Array<{ value: string; label: string }> {
  const channelCount = recordingInputChannelCount(project, track);
  const monoOptions = Array.from({ length: channelCount }, (_, index) => ({
    value: `mono:${index}`,
    label: `Mono Ch ${index + 1}`
  }));
  const stereoOptions = Array.from({ length: Math.floor(channelCount / 2) }, (_, pairIndex) => {
    const left = pairIndex * 2;
    const right = left + 1;
    return {
      value: `stereo:${left}:${right}`,
      label: `Stereo Ch ${left + 1}-${right + 1}`
    };
  });
  return [...monoOptions, ...stereoOptions];
}

function recordingInputChannelCount(project: ReturnType<typeof currentProject>, track: Track): number {
  const deviceId = track.recordingInput?.deviceId ?? track.inputDeviceId ?? project.audioDeviceSettings.inputDeviceId ?? "";
  const device = (project.audioDeviceSettings.devices || []).find((item) => item.id === deviceId);
  const supported = (device?.supportedChannels || []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const deviceChannels = supported.length ? Math.max(...supported) : 0;
  const fallback = Number(project.audioDeviceSettings.inputChannels || 0);
  return Math.max(1, Math.min(32, Math.floor(deviceChannels || fallback || 2)));
}

function recordingInputChannelValue(track: Track): string {
  const assignment = track.recordingInput;
  if (assignment?.mode === "stereo") {
    const pair = assignment.channelPair || [0, 1];
    return `stereo:${pair[0]}:${pair[1]}`;
  }
  const channelIndex = assignment?.mode === "mono" ? assignment.channelIndex ?? 0 : 0;
  return `mono:${channelIndex}`;
}

function recordingInputChannelLabel(value: string): string {
  const [mode, first, second] = value.split(":");
  const channelA = Math.max(0, Number(first) || 0);
  const channelB = Math.max(0, Number(second) || 1);
  if (mode === "stereo") return `Stereo Ch ${channelA + 1}-${channelB + 1}`;
  return `Mono Ch ${channelA + 1}`;
}

function compactInputLabel(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim() || "Default input";
  if (clean.toLowerCase() === "default input") return "Default";
  return clean.length > 20 ? `${clean.slice(0, 17)}...` : clean;
}

function renderPanControl(track: Track, isMaster: boolean, isReturn: boolean, panLabel: string): string {
  if (isReturn) return "";
  return `
    <label class="strip-control">
      <span>${isMaster ? "Output" : "Pan"} <strong>${isMaster ? "Main" : panLabel}</strong></span>
      ${
        isMaster
          ? `<input aria-label="${escapeAttr(`${track.name} output`)}" type="range" min="0" max="1" step="1" value="1" disabled>`
          : `<input aria-label="${escapeAttr(`${track.name} pan`)}" aria-valuetext="${escapeAttr(panLabel)}" data-pan="${sanitizeDataAttr(track.id)}" data-mixer-control="pan" data-mixer-live="true" type="range" min="-1" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(track.pan, 0, -1, 1)}">`
      }
    </label>
  `;
}

function renderMixerFxArea(track: Track, chain: FxChain | null, isMaster: boolean): string {
  return `
    <div class="strip-fx-area">
      ${renderMixerFxSummary(chain)}
      ${!isMaster ? renderFxDropdown(track) : ""}
    </div>
  `;
}

function renderMixerFxSummary(chain: FxChain | null): string {
  if (!chain?.slots.length) return `<div class="strip-fx-empty">No FX</div>`;
  const visible = chain.slots.slice(0, 3);
  const hiddenCount = Math.max(0, chain.slots.length - visible.length);
  return `
    <div class="strip-fx-list" aria-label="${escapeAttr(`${chain.name} selected FX`)}">
      ${visible.map((slot) => `
        <button type="button" class="strip-fx-chip ${slot.enabled ? "" : "bypassed"}" data-fx-toggle="${sanitizeDataAttr(`${chain.id}:${slot.id}`)}" title="${escapeAttr(`${slot.enabled ? "Bypass" : "Enable"} ${slot.name}`)}">
          ${escapeHtml(compactFxName(slot.name))}
        </button>
      `).join("")}
      ${hiddenCount ? `<span class="strip-fx-more" title="${escapeAttr(`${hiddenCount} more FX slot${hiddenCount === 1 ? "" : "s"}`)}">+${hiddenCount}</span>` : ""}
    </div>
  `;
}

function compactFxName(name: string): string {
  return name
    .replace(/\bPocket\b/gi, "")
    .replace(/\bPro\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18) || "FX";
}

function renderFxDropdown(track: Track): string {
  return `
    <label class="strip-control">
      <span>FX</span>
      <select data-add-fx="${sanitizeDataAttr(track.id)}" aria-label="${escapeAttr(`Add FX to ${track.name}`)}">
        <option value="">Add FX...</option>
        ${BUILT_IN_FX.map((fx) => `<option value="${fx.type}">${escapeHtml(fx.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderDrumLaneMixer(project: ReturnType<typeof currentProject>): string {
  const branchCount = project.tracks.filter((track) => generatedDrumBranchLane(track)).length;
  const branchesHidden = drumBranchGroupCollapsed(project);
  return `
    <div class="drum-lane-mixer">
      <header class="drum-lane-heading">
        <h3>Drum Kit Lanes</h3>
        <div>
          <button type="button" data-action="branch-generated-drums">Branch Drums</button>
          <button type="button" data-action="toggle-drum-branch-group" ${branchCount ? "" : "disabled"}>${branchesHidden ? "Show Branch Rows" : "Hide Branch Rows"}</button>
          <button type="button" data-action="collapse-generated-drum-branches" ${branchCount ? "" : "disabled"}>Collapse Branches</button>
        </div>
      </header>
      <div class="drum-lane-list">
        ${DRUM_LANE_DEFS.map((lane) => {
          const mix = getDrumLaneMix(project, lane.id);
          const chain = getDrumLaneFxChain(project, lane.id);
          return `
            <div class="drum-lane-row ${mix.mute ? "muted-editor" : ""}">
              <header>
                <strong>${escapeHtml(lane.label)}</strong>
                <span>${lane.sequenced ? "Sequenced" : "Live pad"}</span>
                <label class="inline-toggle"><input data-drum-lane-mute="${escapeAttr(lane.id)}" type="checkbox" ${mix.mute ? "checked" : ""}> Mute</label>
              </header>
              <label>Volume
                <input data-drum-lane-volume="${escapeAttr(lane.id)}" type="range" min="0" max="1.2" step="0.01" value="${sanitizeCssLengthOrNumber(mix.volume, 1, 0, 1.2)}">
                <span>${Math.round(mix.volume * 100)}%</span>
              </label>
              <label>Pan
                <input data-drum-lane-pan="${escapeAttr(lane.id)}" type="range" min="-1" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(mix.pan, 0, -1, 1)}">
                <span>${escapeHtml(panReadout(mix.pan))}</span>
              </label>
              <label>Gate
                <input data-drum-lane-gate="${escapeAttr(lane.id)}" type="range" min="0.2" max="1.5" step="0.01" value="${sanitizeCssLengthOrNumber(mix.gate, 1, 0.2, 1.5)}">
                <span>${Math.round(mix.gate * 100)}%</span>
              </label>
              <label>FX
                <select data-drum-lane-add-fx="${escapeAttr(lane.id)}" aria-label="${escapeAttr(`Add FX to ${lane.label}`)}">
                  <option value="">Add FX...</option>
                  ${BUILT_IN_FX.map((fx) => `<option value="${fx.type}">${escapeHtml(fx.name)}</option>`).join("")}
                </select>
              </label>
              ${renderDrumLaneFxInspector(project, chain)}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderDrumLaneFxInspector(project: ReturnType<typeof currentProject>, chain: FxChain | null): string {
  if (!chain?.slots.length) return `<p class="editor-note">No lane FX.</p>`;
  return `
    <div class="drum-lane-fx">
      ${chain.slots.map((slot) => renderFxSlot(project, chain, slot, "data-drum-lane-fx-toggle", "data-drum-lane-fx-remove")).join("")}
    </div>
  `;
}

function renderFxInspector(project: ReturnType<typeof currentProject>, chain: FxChain | null): string {
  if (!chain) return "";
  return `
    <div class="fx-inspector">
      <h3>FX Chain</h3>
      ${chain.slots.length ? chain.slots.map((slot) => renderFxSlot(project, chain, slot, "data-fx-toggle", "data-fx-remove")).join("") : `<p>No FX yet.</p>`}
    </div>
  `;
}

function renderFxSlot(project: ReturnType<typeof currentProject>, chain: FxChain, slot: FxPluginInstance, toggleAttr: string, removeAttr: string): string {
  const genericControls = slot.type === POCKET_PRO_EQ_TYPE ? "" : renderGenericFxParameterControls(project, chain.id, slot);
  return `
    <div class="fx-slot ${slot.enabled ? "" : "bypassed"}">
      <div class="fx-slot-heading">
        <span>${escapeHtml(slot.name)}</span>
        <div>
          <button ${toggleAttr}="${sanitizeDataAttr(`${chain.id}:${slot.id}`)}">${slot.enabled ? "Bypass" : "Enable"}</button>
          <button ${removeAttr}="${sanitizeDataAttr(`${chain.id}:${slot.id}`)}">Remove</button>
        </div>
      </div>
      ${slot.type === POCKET_PRO_EQ_TYPE ? renderPocketProEqControls(project, chain.id, slot) : ""}
      ${genericControls}
    </div>
  `;
}

function renderGenericFxParameterControls(project: ReturnType<typeof currentProject>, chainId: string, slot: FxPluginInstance): string {
  const entries = Object.entries(slot.parameters || {}).filter(([, value]) => typeof value === "number");
  if (!entries.length) return "";
  return `
    <div class="fx-param-automation-list" aria-label="FX parameter automation">
      ${entries.map(([parameter, value]) => `
        <div class="fx-param-row">
          <span>${escapeHtml(parameter)} ${escapeHtml(formatFxParameterValue(Number(value)))}</span>
          ${renderFxAutomationControls(project, chainId, slot, parameter, Number(value))}
        </div>
      `).join("")}
    </div>
  `;
}

function renderPocketProEqControls(project: ReturnType<typeof currentProject>, chainId: string, slot: FxPluginInstance): string {
  return `
    <div class="pro-eq-editor">
      <label>Preset
        <select data-fx-eq-preset="${sanitizeDataAttr(`${chainId}:${slot.id}`)}">
          ${POCKET_PRO_EQ_PRESETS.map((preset) => `<option value="${escapeAttr(preset.id)}" ${slot.presetId === preset.id ? "selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}
        </select>
      </label>
      ${PRO_EQ_BANDS.map((band) => {
        const enabled = boolParam(slot, band.enabledParam, band.defaultEnabled);
        const defaultGain = band.defaultGain ?? 0;
        const minGain = band.minGain ?? -12;
        const maxGain = band.maxGain ?? 12;
        const defaultQ = band.defaultQ ?? 1;
        const minQ = band.minQ ?? 0.1;
        const maxQ = band.maxQ ?? 8;
        return `
          <fieldset class="pro-eq-band ${enabled ? "" : "bypassed"}">
            <legend>
              <label><input data-fx-param="${sanitizeDataAttr(`${chainId}:${slot.id}:${band.enabledParam}`)}" type="checkbox" ${enabled ? "checked" : ""}> ${escapeHtml(band.label)}</label>
            </legend>
            <label>Freq
              <input data-fx-param="${sanitizeDataAttr(`${chainId}:${slot.id}:${band.frequencyParam}`)}" type="range" min="${band.minFrequency}" max="${band.maxFrequency}" step="1" value="${sanitizeCssLengthOrNumber(numParam(slot, band.frequencyParam, band.defaultFrequency), band.defaultFrequency, band.minFrequency, band.maxFrequency)}">
              <span>${Math.round(numParam(slot, band.frequencyParam, band.defaultFrequency))} Hz</span>
              ${renderFxAutomationControls(project, chainId, slot, band.frequencyParam, numParam(slot, band.frequencyParam, band.defaultFrequency))}
            </label>
            ${band.gainParam ? `
              <label>Gain
                <input data-fx-param="${sanitizeDataAttr(`${chainId}:${slot.id}:${band.gainParam}`)}" type="range" min="${minGain}" max="${maxGain}" step="0.1" value="${sanitizeCssLengthOrNumber(numParam(slot, band.gainParam, defaultGain), defaultGain, minGain, maxGain)}">
                <span>${numParam(slot, band.gainParam, defaultGain).toFixed(1)} dB</span>
                ${renderFxAutomationControls(project, chainId, slot, band.gainParam, numParam(slot, band.gainParam, defaultGain))}
              </label>
            ` : ""}
            ${band.qParam ? `
              <label>Q
                <input data-fx-param="${sanitizeDataAttr(`${chainId}:${slot.id}:${band.qParam}`)}" type="range" min="${minQ}" max="${maxQ}" step="0.1" value="${sanitizeCssLengthOrNumber(numParam(slot, band.qParam, defaultQ), defaultQ, minQ, maxQ)}">
                <span>${numParam(slot, band.qParam, defaultQ).toFixed(1)}</span>
                ${renderFxAutomationControls(project, chainId, slot, band.qParam, numParam(slot, band.qParam, defaultQ))}
              </label>
            ` : ""}
          </fieldset>
        `;
      }).join("")}
    </div>
  `;
}

function renderFxAutomationControls(project: ReturnType<typeof currentProject>, chainId: string, slot: FxPluginInstance, parameter: string, value: number): string {
  const lane = getFxParameterAutomationLane(project, chainId, slot.id, parameter);
  const packed = sanitizeDataAttr(`${chainId}:${slot.id}:${parameter}`);
  return `
    <span class="fx-automation-controls ${lane ? "active" : ""}" data-fx-automation-state="${packed}">
      <button type="button" title="${escapeAttr(`Enable automation for ${parameter}`)}" data-fx-automation-create="${packed}">${lane ? "Auto" : "Auto"}</button>
      <button type="button" title="${escapeAttr(`Add ${parameter} point at the playhead from ${value}`)}" data-fx-automation-add-point="${packed}">Add</button>
    </span>
  `;
}

function formatFxParameterValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function numParam(slot: FxPluginInstance, key: string, fallback: number): number {
  const value = Number(slot.parameters[key]);
  return Number.isFinite(value) ? value : fallback;
}

function boolParam(slot: FxPluginInstance, key: string, fallback: boolean): boolean {
  const value = slot.parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

function renderInputSelector(project: ReturnType<typeof currentProject> | null, track: Track): string {
  if (!project || !track.recordKind || track.recordKind === "none") return "";
  const inputs = (project.audioDeviceSettings.devices || []).filter((device) => device.kind === "input" || device.kind === "duplex");
  const channelMode = track.recordingChannelMode === "stereo" ? "stereo" : "mono";
  return `
    <label>Input
      <select data-track-input="${sanitizeDataAttr(track.id)}">
        <option value="">No input selected</option>
        ${inputs.map((device) => `<option value="${escapeAttr(device.id)}" ${track.inputDeviceId === device.id ? "selected" : ""}>${escapeHtml(device.name)}</option>`).join("")}
      </select>
    </label>
    <label>Record
      <select data-track-record-channel-mode="${sanitizeDataAttr(track.id)}">
        <option value="mono" ${channelMode === "mono" ? "selected" : ""}>Mono</option>
        <option value="stereo" ${channelMode === "stereo" ? "selected" : ""}>Stereo</option>
      </select>
    </label>
  `;
}

function renderAddTrackPanel(): string {
  return `
    <div class="modal-backdrop" data-add-track-backdrop="true">
      <section class="controls-panel add-track-panel" role="dialog" aria-modal="true" aria-labelledby="add-track-title">
        <header>
          <div>
            <h2 id="add-track-title">Library / Add Track</h2>
            <p>Choose a track source. Recording input and mono/stereo mode appear on record-capable mixer strips after the track is created.</p>
          </div>
          <button data-action="add-track-close">Close</button>
        </header>
        <div class="add-track-library">
          <section class="add-track-group" aria-label="Audio recording tracks">
            <h3>Audio Recording</h3>
            <p>Creates record-capable audio tracks. Set input device and mono/stereo mode on the mixer strip.</p>
            <div class="add-track-grid">
              <button data-add-track-kind="live-vocals" data-ui-scope="recording" title="Add an audio track intended for vocal recording"><strong>Live Vocals</strong><span>Record-capable vocal audio track</span></button>
              <button data-add-track-kind="live-instrument" data-ui-scope="recording" title="Add an audio track intended for instrument recording"><strong>Live Instrument</strong><span>Record-capable instrument audio track</span></button>
            </div>
          </section>
          <section class="add-track-group" aria-label="Instrument and MIDI tracks">
            <h3>Instrument / MIDI</h3>
            <p>Creates editable MIDI material for piano-roll composition.</p>
            <div class="add-track-grid">
              <button data-add-track-kind="midi-instrument" title="Add an empty MIDI instrument track for piano-roll clips"><strong>MIDI Instrument</strong><span>Empty MIDI track for piano-roll clips</span></button>
            </div>
          </section>
          <section class="add-track-group" aria-label="Organization tracks">
            <h3>Organization</h3>
            <p>Adds project structure without pretending to process audio. Folder-bus routing can build on this later.</p>
            <div class="add-track-grid">
              <button data-add-track-kind="folder" title="Add a folder track for organizing timeline lanes"><strong>Folder</strong><span>Timeline organizer; no audio routing yet</span></button>
            </div>
          </section>
          <section class="add-track-group" aria-label="Chordsmith generated role tracks">
            <h3>Chordsmith Roles</h3>
            <p>Selects or reactivates generated source roles while preserving imported Chordsmith data.</p>
            <div class="add-track-grid">
              <button data-add-track-kind="chordsmith-drums" title="Select or enable the generated Chordsmith drums track"><strong>Chordsmith Drums</strong><span>Select or enable generated drums</span></button>
              <button data-add-track-kind="chordsmith-bass" title="Select or enable the generated Chordsmith bass track"><strong>Chordsmith Bass</strong><span>Select or enable generated bass</span></button>
              <button data-add-track-kind="chordsmith-chords" title="Select or enable the generated Chordsmith chords track"><strong>Chordsmith Chords</strong><span>Select or enable generated chords</span></button>
              <button data-add-track-kind="chordsmith-melody" title="Select or enable the generated Chordsmith melody track"><strong>Chordsmith Melody</strong><span>Select or enable generated melody</span></button>
              <button data-add-track-kind="chordsmith-guitar" title="Select or reactivate the generated Chordsmith guitar track"><strong>Chordsmith Guitar</strong><span>Select or reactivate guitar</span></button>
            </div>
          </section>
          <section class="add-track-group" aria-label="Routing tracks">
            <h3>Routing</h3>
            <p>Adds project routing tracks for grouped outputs and return-effect workflows.</p>
            <div class="add-track-grid">
              <button data-action="add-bus-track" title="Add a bus track for grouped routing"><strong>Bus</strong><span>Route tracks through a grouped output</span></button>
              <button data-action="add-return-track" title="Add a return track for send effects"><strong>Return</strong><span>FX return scaffold; sends stay guarded</span></button>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderAudioSettingsPanel(state: AppState): string {
  const project = currentProject(state);
  const devices = project.audioDeviceSettings.devices || [];
  return `
    <div class="modal-backdrop" data-audio-settings-backdrop="true">
      <section class="controls-panel audio-settings-panel" role="dialog" aria-modal="true" aria-labelledby="audio-settings-title">
        <header>
          <h2 id="audio-settings-title">Audio Settings</h2>
          <button data-action="audio-settings-close">Close</button>
        </header>
        <div class="control-guide">
          <p><strong>Host</strong><span>${escapeHtml(project.audioDeviceSettings.host)} (${escapeHtml(state.audioProbeStatus)})</span></p>
          <p><strong>Recording</strong><span>Installed app only: refresh devices, choose an input and Mono/Stereo mode, save the project, arm one live track, then Record writes WAV takes to project-media/recordings.</span></p>
        </div>
        <button data-action="audio-refresh">Refresh Devices</button>
        <div class="device-list">
          ${devices.length ? devices.map((device) => `
            <div class="device-row">
              <strong>${escapeHtml(device.name)}</strong>
              <span>${escapeHtml(device.kind)} / ${escapeHtml(device.host || "unknown")}${device.isDefaultInput ? " / default input" : ""}${device.isDefaultOutput ? " / default output" : ""}</span>
            </div>
          `).join("") : `<p>No devices listed yet.</p>`}
        </div>
      </section>
    </div>
  `;
}

function renderUpdaterPanel(state: AppState): string {
  const hasUpdate = state.updaterStatus === "available";
  const busy = state.updaterStatus === "checking" || state.updaterStatus === "downloading" || state.updaterStatus === "installing";
  const readyToRestart = state.updaterStatus === "ready-to-restart";
  const progressLabel = state.updaterDownloadProgress === null ? "" : `${Math.round(state.updaterDownloadProgress * 100)}%`;
  return `
    <div class="modal-backdrop" data-updater-backdrop="true">
      <section class="controls-panel updater-panel" role="dialog" aria-modal="true" aria-labelledby="updater-title">
        <header>
          <h2 id="updater-title">Pocket DAW Updates</h2>
          <button data-action="updater-close">Close</button>
        </header>
        <div class="control-guide">
          <p><strong>Current version</strong><span>v${escapeHtml(state.updaterCurrentVersion)}</span></p>
          <p><strong>Status</strong><span>${escapeHtml(updaterStatusText(state))}</span></p>
          ${state.updaterAvailableVersion ? `<p><strong>Available version</strong><span>v${escapeHtml(state.updaterAvailableVersion)}</span></p>` : ""}
          <p><strong>Source</strong><span>Signed GitHub Releases packages for the installed desktop app.</span></p>
        </div>
        ${state.updaterReleaseNotes ? `
          <div class="updater-notes">
            <strong>Release notes</strong>
            <p>${escapeHtml(releaseNotesSummary(state.updaterReleaseNotes))}</p>
          </div>
        ` : ""}
        ${state.updaterDownloadProgress !== null ? `
          <div class="updater-progress" aria-label="Update download progress">
            <span style="width:${sanitizeCssLengthOrNumber(Math.round(state.updaterDownloadProgress * 100), 0, 0, 100)}%"></span>
            <strong>${escapeHtml(progressLabel)}</strong>
          </div>
        ` : ""}
        <label class="inline-toggle updater-toggle">
          <input type="checkbox" data-updater-auto-check="true" ${state.updaterAutoCheckOnStartup ? "checked" : ""}>
          Check on startup and notify when updates are available
        </label>
        <div class="updater-actions">
          <button data-action="updater-check" ${busy ? "disabled" : ""}>Check for Updates</button>
          <button class="primary" data-action="updater-download-install" ${hasUpdate ? "" : "disabled"}>Download and Install</button>
          <button data-action="updater-restart" ${readyToRestart ? "" : "disabled"}>Restart Pocket DAW</button>
          <button data-action="updater-close">Close</button>
        </div>
      </section>
    </div>
  `;
}

function renderControlsPanel(state: AppState): string {
  const project = currentProject(state);
  const recent = state.recent.slice(0, 3).map((item) => item.path || item.label).join(" / ") || "No recent projects saved in this environment.";
  const devices = project.audioDeviceSettings.devices || [];
  const defaultOutput = devices.find((device) => device.id === project.audioDeviceSettings.outputDeviceId) || devices.find((device) => device.isDefaultOutput);
  const statuses = project.mediaPool.map((item) => mediaPoolStatus(item, item.kind === "audio" && !!getCachedAudioBuffer(item.id)));
  const mediaSummary = `${project.mediaPool.length} media / ${statuses.filter((status) => status.runtimeOnly).length} runtime-only / ${statuses.filter((status) => status.external).length} external / ${statuses.filter((status) => status.missing || status.unresolved).length} missing`;
  const renderCache = createRenderCacheSummary(project);
  const cacheSummary = `${renderCache.totalCount} total / ${renderCache.freezeRenderCount} freeze / ${renderCache.nativeGeneratedStemCount} native stems / ${renderCache.nativeRuntimeAudioCount} runtime audio / ${renderCache.invalidatedCount} invalidated`;
  const mediaAnalysis = createAudioMediaAnalysisSummary(project);
  const analysisSummary = `${mediaAnalysis.waveformReadyCount}/${mediaAnalysis.audioMediaCount} waveform-ready media / ${mediaAnalysis.normalizeReadyClipCount}/${mediaAnalysis.audioClipCount} normalize-ready clips / ${mediaAnalysis.transientMarkerCount} transient markers / ${mediaAnalysis.staleAnalysisCount} stale`;
  const routing = createRoutingExportSummary(project);
  const routingSummary = `${routing.busCount} buses / ${routing.returnCount} returns / ${routing.sendCount} sends (${routing.postFaderSendCount} post-fader, ${routing.preFaderSendCount} pre-fader) / ${routing.routedTrackCount} routed tracks${routing.warnings.length ? ` / ${routing.warnings.length} warning${routing.warnings.length === 1 ? "" : "s"}: ${routing.warnings.join(" ")}` : ""}`;
  const takeSummary = createAudioTakeDiagnosticsSummary(project);
  const takeSummaryText = `${takeSummary.groupedClipCount} grouped clips / ${takeSummary.groupCount} groups / ${takeSummary.activeCount} active / ${takeSummary.archivedCount} archived`;
  return `
    <div class="modal-backdrop" data-controls-backdrop="true">
      <section class="controls-panel" role="dialog" aria-modal="true" aria-labelledby="controls-title">
        <header>
          <h2 id="controls-title">About / Diagnostics</h2>
          <button type="button" data-action="controls-close" aria-label="Close About and Diagnostics" title="Close About and Diagnostics">Close</button>
        </header>
        <div class="control-guide">
          <p><strong>App</strong><span>Pocket DAW v${escapeHtml(POCKET_DAW_VERSION)} / build ${escapeHtml(runtimeBuildId())} / commit ${escapeHtml(runtimeCommit())}</span></p>
          <p><strong>Runtime</strong><span>${escapeHtml(runtimeLabel())}</span></p>
          <p><strong>Distribution</strong><span>Installed app only / installerOnly: true</span></p>
          <p><strong>Project</strong><span>${escapeHtml(project.project.title || "Untitled")} / ${escapeHtml(state.currentFile.path || state.currentFile.label || "Unsaved")}</span></p>
          <p><strong>Audio</strong><span>${escapeHtml(project.audioDeviceSettings.host)} / ${devices.length} device${devices.length === 1 ? "" : "s"}${defaultOutput ? ` / output ${escapeHtml(defaultOutput.name)}` : ""}</span></p>
          <p><strong>Updater</strong><span>${escapeHtml(updaterStatusText(state))} / startup check ${state.updaterAutoCheckOnStartup ? "on" : "off"}</span></p>
          <p><strong>Handoff</strong><span>${escapeHtml(handoffStatusText(state))}</span></p>
          <p><strong>Routing</strong><span>${escapeHtml(routingSummary)}</span></p>
          <p><strong>Take Lanes</strong><span>${escapeHtml(takeSummaryText)}</span></p>
          <p><strong>Media</strong><span>${escapeHtml(mediaSummary)} / render cache ${escapeHtml(cacheSummary)}</span></p>
          <p><strong>Analysis</strong><span>${escapeHtml(analysisSummary)}</span></p>
          <p><strong>Native Cache</strong><span>${escapeHtml(nativeCacheStatusText(state))}</span></p>
          <p><strong>Storage</strong><span>${escapeHtml(state.currentFile.path ? "Project media/cache folders sit beside the saved .pocketdaw file." : "Unsaved project; autosave/recent data uses the installed app or browser runtime store.")}</span></p>
          <p><strong>Import</strong><span>Paste a PCS1 code, Chordsmith JSON, Pocket DJ source session, or .pocketdaw file.</span></p>
          <p><strong>Demo</strong><span>Load Demo Copy creates an editable autosaved copy. Reload Demo Template discards copy edits and starts fresh from the built-in demo.</span></p>
          <p><strong>Transport</strong><span>Play, Stop, Restart, Panic, or return to Bar 1 from the top bar.</span></p>
          <p><strong>Shortcuts</strong><span>Space play/pause, Home Bar 1, L loop, P loop selected, X split, G marker, Ctrl+X/C/V clip cut/copy/paste, Ctrl+Shift+X/C range cut/copy, M mute, S solo, R arm, D duplicate, Delete remove, arrows move clips, plus/minus zoom.</span></p>
          <p><strong>Timeline</strong><span>Select a clip, click or drag the ruler/grid to seek and scrub, choose Bar or Beat snap, then use Move, Copy, Paste, Split, Trim, Loop Clip, Marker and Zoom controls.</span></p>
          <p><strong>Media Pool</strong><span>Import Audio decodes supported files into a runtime cache. Import MIDI parses .mid files into editable clips played by the preview synth.</span></p>
          <p><strong>Mixer</strong><span>Use Volume and Pan sliders. Meters show live peak audio. Mute silences a track; Solo isolates it.</span></p>
          <p><strong>Recent</strong><span>${escapeHtml(recent)}</span></p>
          <p><strong>Save / Export</strong><span>Save .pocketdaw projects, export full-song WAV, or export multi-track MIDI.</span></p>
          <p><strong>Recording</strong><span>Installed app only: save the project, arm one live audio track, choose Mono or Stereo and an input if needed, then Record writes a project-media WAV under project-media/recordings.</span></p>
          <p><strong>Alpha testing</strong><span>Recording is one armed track at a time. ASIO, punch-in, comping, latency compensation UI and simultaneous multitrack capture are future work.</span></p>
        </div>
        <div class="diagnostic-actions">
          <button data-action="copy-diagnostics">Copy Diagnostics</button>
          <button data-action="export-diagnostics">Export Diagnostics JSON</button>
        </div>
      </section>
    </div>
  `;
}

function renderFunctionGuidePanel(): string {
  return `
    <div class="modal-backdrop" data-function-guide-backdrop="true">
      <section class="controls-panel function-guide-panel" role="dialog" aria-modal="true" aria-labelledby="function-guide-title">
        <header>
          <div>
            <h2 id="function-guide-title">Function Guide</h2>
            <p>Plain-language reference for Pocket DAW controls, workflows and AI-assisted operation.</p>
          </div>
          <button data-action="function-guide-close">Close</button>
        </header>
        <div class="function-guide-intro">
          <p><strong>Full document</strong><span>${escapeHtml(FUNCTION_REFERENCE_DOC)}</span></p>
          <p><strong>Action catalog</strong><span>${escapeHtml(FUNCTION_ACTION_CATALOG_DOC)}</span></p>
          <p><strong>How to use</strong><span>Find the surface you are using, read what it does, when to use it, and the AI counterpart note before changing project data.</span></p>
        </div>
        <div class="function-guide-body">
          ${FUNCTION_GUIDE_SECTIONS.map((section) => `
            <section class="function-guide-section" aria-label="${escapeAttr(section.title)}">
              <header>
                <h3>${escapeHtml(section.title)}</h3>
                <p>${escapeHtml(section.summary)}</p>
              </header>
              <div class="function-guide-grid">
                ${section.entries.map((entry) => `
                  <article class="function-guide-entry">
                    <h4>${escapeHtml(entry.name)}</h4>
                    <p><strong>Does</strong><span>${escapeHtml(entry.does)}</span></p>
                    <p><strong>Use when</strong><span>${escapeHtml(entry.useWhen)}</span></p>
                    <p class="function-guide-ai-note"><strong>AI note</strong><span>${escapeHtml(entry.aiNote)}</span></p>
                  </article>
                `).join("")}
              </div>
            </section>
          `).join("")}
          ${renderFunctionActionCatalog()}
        </div>
      </section>
    </div>
  `;
}

function renderFunctionActionCatalog(): string {
  const surfaces = Array.from(new Set(FUNCTION_ACTION_REFERENCE.map((entry) => entry.surface)));
  return `
    <section class="function-guide-section function-action-catalog" aria-label="Button and action catalog">
      <header>
        <h3>Button And Action Catalog</h3>
        <p>Explicit map of visible commands, shortcuts and dense data-driven controls. Use this when a human or AI helper needs the exact control purpose.</p>
      </header>
      <div class="function-action-groups">
        ${surfaces.map((surface) => {
          const entries = FUNCTION_ACTION_REFERENCE.filter((entry) => entry.surface === surface);
          return `
            <section class="function-action-group" aria-label="${escapeAttr(surface)}">
              <h4>${escapeHtml(surface)}</h4>
              <div class="function-action-list">
                ${entries.map((entry) => `
                  <article class="function-action-entry">
                    <header>
                      <strong>${escapeHtml(entry.control)}</strong>
                      <span>${escapeHtml([entry.actionId ? `data-action=${entry.actionId}` : "", entry.selector || "", entry.shortcut ? `Shortcut ${entry.shortcut}` : ""].filter(Boolean).join(" / ") || "Context control")}</span>
                    </header>
                    <p><b>Does</b><span>${escapeHtml(entry.does)}</span></p>
                    <p><b>Use when</b><span>${escapeHtml(entry.useWhen)}</span></p>
                    <p><b>AI note</b><span>${escapeHtml(entry.aiNote)}</span></p>
                  </article>
                `).join("")}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderMcpSetupPanel(state: AppState): string {
  const project = currentProject(state);
  const command = pocketDawMcpCommandLine();
  const claudeConfig = pocketDawMcpClaudeConfig();
  const codexConfig = pocketDawMcpCodexConfig();
  const bridge = state.aiBridge;
  const liveStatus = bridge.runtimeAvailable
    ? bridge.enabled ? "Enabled for this app session" : "Disabled"
    : "Installed app runtime unavailable";
  return `
    <div class="modal-backdrop" data-mcp-setup-backdrop="true">
      <section class="controls-panel mcp-setup-panel" role="dialog" aria-modal="true" aria-labelledby="mcp-setup-title">
        <header>
          <h2 id="mcp-setup-title">AI / MCP Bridge</h2>
          <button data-action="mcp-setup-close">Close</button>
        </header>
        <div class="control-guide">
          <p><strong>Project</strong><span>${escapeHtml(project.project.title)} / ${escapeHtml(state.currentFile.path || state.currentFile.label)}</span></p>
          <p><strong>File MCP</strong><span>Local stdio MCP server for reading, validating, creating, editing and export-planning Pocket DAW projects while the app is open or closed.</span></p>
          <p><strong>Live bridge</strong><span>${escapeHtml(liveStatus)}. Live tools can read this running app, control transport, select tracks/clips, apply safe mixer edits and capture bounded performance diagnostics.</span></p>
          <p><strong>Workspace</strong><span>${escapeHtml(POCKET_DAW_MCP_WORKSPACE)}</span></p>
          <p><strong>Writes</strong><span>MCP tools return proposed JSON by default and only write when an output path is provided.</span></p>
          <p><strong>Session file</strong><span>${escapeHtml(bridge.sessionPath || "Created by the installed app at startup.")}</span></p>
          <p><strong>Last live request</strong><span>${escapeHtml(bridge.lastRequestAt || "None this session.")}</span></p>
          <p><strong>Live test</strong><span>${escapeHtml(bridge.lastError || bridge.testMessage)}</span></p>
        </div>
        <div class="control-guide">
          <label class="checkbox-row">
            <input type="checkbox" data-ai-bridge-enabled="true" ${bridge.enabled ? "checked" : ""} ${bridge.runtimeAvailable ? "" : "disabled"}>
            <span>Enable live app bridge</span>
          </label>
          <p><strong>Endpoint</strong><span>${escapeHtml(bridge.url || "http://127.0.0.1:47858")}</span></p>
          <p><strong>Auth</strong><span>Live endpoints require the bearer token from the local session file. File MCP tools do not need the app running.</span></p>
        </div>
        ${renderMcpConfigBlock("Command", "command", command)}
        ${renderMcpConfigBlock("Claude / JSON MCP clients", "claude-json", claudeConfig)}
        ${renderMcpConfigBlock("Codex config.toml", "codex-toml", codexConfig)}
        <div class="diagnostic-actions">
          <button data-action="ai-bridge-test" ${bridge.enabled ? "" : "disabled"}>Test live bridge</button>
          <button data-action="copy-mcp-setup" data-copy-mcp-setup="all">Copy All</button>
          <button data-action="mcp-setup-close">Close</button>
        </div>
      </section>
    </div>
  `;
}

function renderMcpConfigBlock(label: string, copyKind: string, value: string): string {
  return `
    <div class="mcp-config-block">
      <header>
        <strong>${escapeHtml(label)}</strong>
        <button data-action="copy-mcp-setup" data-copy-mcp-setup="${escapeAttr(copyKind)}">Copy</button>
      </header>
      <textarea readonly spellcheck="false">${escapeHtml(value)}</textarea>
    </div>
  `;
}

function renderFeedbackPanel(state: AppState): string {
  return `
    <div class="modal-backdrop" data-feedback-backdrop="true">
      <section class="controls-panel feedback-panel" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <header>
          <h2 id="feedback-title">Send Feedback</h2>
          <button data-action="feedback-close">Close</button>
        </header>
        <div class="feedback-body">
          <label for="feedbackText">Feedback</label>
          <textarea id="feedbackText" data-feedback-text="true" spellcheck="true" placeholder="What happened? What did you expect?">${escapeHtml(state.feedbackText)}</textarea>
          <p>Pocket DAW will open an email to Sam and include diagnostics in the body when it fits. Full diagnostics are also copied or exported for bug reports.</p>
        </div>
        <div class="diagnostic-actions">
          <button data-action="feedback-copy-diagnostics">Copy Diagnostics</button>
          <button data-action="feedback-send">Send Email</button>
        </div>
      </section>
    </div>
  `;
}

function handoffStatusText(state: AppState): string {
  const handoff = state.lastHandoff;
  if (handoff.result === "not-received") return handoff.message;
  const source = handoff.source || "unknown source";
  const kind = handoff.kind ? ` / ${handoff.kind}` : "";
  const time = handoff.receivedAt ? ` / ${handoff.receivedAt}` : "";
  return `${handoff.result} from ${source}${kind}${time}: ${handoff.message}`;
}

function updaterStatusText(state: AppState): string {
  if (state.updaterStatus === "idle") return "Pocket DAW can check GitHub Releases for signed update packages.";
  if (state.updaterStatus === "checking") return "Checking for updates...";
  if (state.updaterStatus === "available") return state.updaterAvailableVersion ? `Pocket DAW ${state.updaterAvailableVersion} is available.` : "An update is available.";
  if (state.updaterStatus === "not-available") return "You're on the latest available version.";
  if (state.updaterStatus === "downloading") return state.updaterMessage || "Downloading update...";
  if (state.updaterStatus === "installing") return "Installing update...";
  if (state.updaterStatus === "ready-to-restart") return "Update installed. Restart Pocket DAW to finish.";
  return state.updaterMessage || "Update check failed.";
}

function releaseNotesSummary(notes: string): string {
  return notes.replace(/\s+/g, " ").trim().slice(0, 420) || "No release notes were provided.";
}

function formatBarBeat(project: ReturnType<typeof currentProject>, barValue: number): string {
  const parts = formatBarBeatParts(project, barValue);
  return `${parts.bar} ${parts.beat}`;
}

function formatBarBeatParts(project: ReturnType<typeof currentProject>, barValue: number): { bar: string; beat: string } {
  const pos = barFloatToDisplayPosition(project, barValue);
  return { bar: `Bar ${pos.bar}`, beat: `Beat ${pos.beat}` };
}

function modeLabel(mode: AppState["snapMode"]): string {
  if (mode === "bar") return "Bar";
  if (mode === "beat") return "Beat";
  return "Off";
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds && seconds !== 0) return "-";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = Math.round(safe % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaPersistenceLabel(status: ReturnType<typeof mediaPoolStatus>, cacheCount: number): string {
  if ((status.missing || status.unresolved) && status.cacheReloadable) return "Missing source - decoded cache available";
  if (status.missing || status.unresolved) return "Missing - relink required";
  if (status.runtimeOnly) return "Runtime-only";
  if (status.external && status.runtimeAvailable) return "External reference loaded";
  if (status.external) return "External reference";
  if (status.runtimeAvailable) return "Project media loaded";
  if (cacheCount) return "Cached render metadata";
  return "Project media";
}

function mediaPersistenceDetail(status: ReturnType<typeof mediaPoolStatus>, cacheCount: number): string {
  if ((status.missing || status.unresolved) && status.cacheReloadable) return "The original source path is missing, but a project-relative decoded WAV cache is available. Reload can restore playback from the cache; Relink should still be used to point at the source file.";
  if (status.missing || status.unresolved) return "The project has metadata for this item, but the file is missing or unresolved. Use Relink before playback/export.";
  if (status.runtimeOnly) return "Loaded into memory for this session only. Save/reopen will need re-import or Relink in the installed app before Collect Media can make it durable.";
  if (status.external && status.runtimeAvailable) return "Referenced from an external path and currently loaded into memory. Use Collect Media for project-relative persistence.";
  if (status.external) return "Referenced from an external path. Reload or Collect Media before relying on it after moving the project.";
  if (cacheCount) return "Project metadata has render-cache links. Rebuild cache if the source changes.";
  return "Stored or collected as project-relative media.";
}

function panReadout(pan: number): string {
  if (Math.abs(pan) < 0.01) return "C";
  const side = pan < 0 ? "L" : "R";
  return `${side} ${Math.round(Math.abs(pan) * 100)}`;
}
