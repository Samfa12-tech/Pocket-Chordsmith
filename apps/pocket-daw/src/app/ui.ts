import type { AppState } from "./state";
import { currentProject, type ChordsmithStepSelection } from "./state";
import { BUILT_IN_FX, getTrackFxChain } from "../daw/fx";
import { getPrimaryChordsmithSource, totalEditorSteps, visibleEditorSteps } from "../daw/chordsmithEditor";
import { POCKET_DAW_VERSION, type Clip, type FxChain, type Track } from "../daw/schema";
import { SECTION_IDS, type SanitizedPcsProject, type SanitizedPcsSection, type SectionId } from "../compatibility/pcsSanitizer";
import { barFloatToPosition, barsToSeconds, sortClips } from "../daw/timeline";
import { mediaPoolStatus, renderCacheItemsForMedia } from "../daw/mediaPool";
import { midiDataFromClip } from "../daw/midiClips";
import { getTrackAutomationLane, trackHasAutomation } from "../daw/automation";
import { availableTrackOutputs } from "../daw/routing";
import { createSectionLoopMetadata, createStemExportPlan } from "../daw/exportJobs";
import { createCollectMediaPlan } from "../daw/mediaPool";
import { getCachedAudioBuffer } from "../audio/audioBufferCache";
import { clipSourceStartBar } from "../daw/clips";
import { runtimeBuildId, runtimeCommit, runtimeLabel } from "./diagnostics";
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

const CHORD_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII"];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASS_LABELS = ["R", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"];
const MELODY_INSTRUMENTS = [
  "pulse",
  "synth",
  "soft",
  "bell",
  "lead_guitar",
  "distorted_lead_guitar",
  "banjo",
  "harmonica",
  "cowboy_whistle",
  "trumpet",
  "saxophone"
];
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
    <div class="app-shell" data-layout-shell="true" data-scroll-key="app-shell" style="--studio-height:${sanitizeCssLengthOrNumber(state.timelineHeightPx, 430, 260, 760)}px;--inspector-width:${sanitizeCssLengthOrNumber(state.inspectorWidthPx, 420, 280, 620)}px;">
      ${renderMenuStrip(state)}
      ${renderTransport(state)}
      ${renderQuickStart(state)}
      <main class="studio ${state.inspectorVisible ? "" : "inspector-hidden"}" data-layout-zone="studio">
        ${renderTimeline(state)}
        ${state.inspectorVisible ? `<div class="inspector-resize-handle" data-inspector-resize-handle="true" title="Drag to resize inspector"></div>${renderInspector(state, project, selectedClip, selectedTrack)}` : ""}
      </main>
      <div class="studio-resize-handle" data-timeline-resize-handle="true" title="Drag to resize timeline and push mixer lower"><span></span></div>
      ${renderMixer(state)}
      ${renderExportPanel(state)}
      ${renderMediaPool(state)}
      ${state.showControls ? renderControlsPanel(state) : ""}
      ${state.showAddTrack ? renderAddTrackPanel() : ""}
      ${state.showAudioSettings ? renderAudioSettingsPanel(state) : ""}
      ${state.showUpdaterPanel ? renderUpdaterPanel(state) : ""}
      <section class="import-panel" data-layout-zone="import">
        <textarea id="importText" spellcheck="false" placeholder="Paste PCS1 share code, raw Pocket Chordsmith JSON, Pocket DJ source session, or .pocketdaw JSON">${escapeHtml(state.importText)}</textarea>
        <div class="import-actions">
          <button data-action="load-demo">Load Demo Copy</button>
          <button data-action="reset-demo-template">Reload Demo Template</button>
          <button data-action="import-text">Import Paste</button>
          <button data-action="open-file">Open File</button>
          <button data-action="save-project">Save .pocketdaw</button>
          <button data-action="save-project-as">Save As</button>
          <button data-action="audio-settings-open">Audio Settings</button>
          <button data-action="export-wav">Export WAV</button>
          <button data-action="export-midi">Export MIDI</button>
          <button data-action="export-stems">Export Stems</button>
          <button data-action="export-section-manifest">Section Manifest</button>
          <button data-action="export-godot-manifest">Godot Manifest Preview</button>
          <button data-action="export-web-game-manifest">Web Manifest Preview</button>
          <button data-action="export-media-plan">Collect Media Plan</button>
          <button data-action="export-diagnostics">Export Diagnostics</button>
        </div>
      </section>
    </div>
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
        ["Import Chordsmith", "import-text"],
        ["Export WAV", "export-wav"],
        ["Export MIDI", "export-midi"]
      ])}
      ${renderMenuGroup("Edit", [
        ["Undo", "undo"],
        ["Redo", "redo"],
        ["Copy Clip", "clip-copy"],
        ["Paste Clip", "clip-paste"],
        ["Duplicate Clip", "clip-duplicate"],
        ["Split Clip", "clip-split"],
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
        [`Loop ${loopOn ? "Off" : "On"}`, "toggle-loop"],
        ["Loop Selected", "loop-selected"],
        ["Clear Loop", "loop-clear"],
        ["Add Marker", "marker-add"]
      ])}
      ${renderMenuGroup("Help", [
        ["Check for Updates", "updater-open"],
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
  return `
    <header class="transport" data-layout-zone="transport">
      <div class="brand">
        <div class="mark">PD</div>
        <div>
          <h1>Pocket DAW</h1>
          <p>${escapeHtml(project.project.title)}</p>
          <small>v${escapeHtml(POCKET_DAW_VERSION)} / ${escapeHtml(env)} / ${escapeHtml(state.currentFile.path || state.currentFile.label)}</small>
        </div>
      </div>
      <div class="transport-buttons">
        <button class="primary" data-transport-toggle="true" data-action="${state.playing ? "pause" : "play"}">${state.playing ? "Pause" : "Play"}</button>
        <button data-action="stop">Stop</button>
        <button data-action="restart">Restart</button>
        <button data-action="seek-start">Bar 1</button>
        <button data-action="add-track-open">Add Track</button>
        <button data-action="undo">Undo</button>
        <button data-action="redo">Redo</button>
        <button data-action="controls-open">About</button>
      </div>
      <div class="transport-readout">
        <span data-playing-state="true" class="${state.playing ? "playing" : ""}">${state.playing ? "Playing" : "Stopped"}</span>
        <span>${Math.round(project.project.bpm)} BPM</span>
        <span>${escapeHtml(project.project.key)} ${escapeHtml(project.project.scale)}</span>
        <span data-playhead-readout="true">${escapeHtml(formatBarBeat(state.playheadBar, project.project.timeSig, project.project.ppq))}</span>
      </div>
      <div class="status">${escapeHtml(state.status)}</div>
      ${state.busyMessage ? `
        <div class="transport-busy" role="status" aria-live="polite">
          <span>${escapeHtml(state.busyMessage)}</span>
          <i></i>
        </div>
      ` : ""}
    </header>
  `;
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
  return `
    <section class="timeline-wrap">
      <div class="timeline-toolbar">
        <div class="edit-tools">
          <button data-action="clip-left">Move Left</button>
          <button data-action="clip-right">Move Right</button>
          <button data-action="clip-copy">Copy</button>
          <button data-action="clip-paste">Paste</button>
          <button data-action="clip-duplicate">Duplicate</button>
          <button data-action="clip-split">Split</button>
          <button data-action="trim-start-right">Trim Start</button>
          <button data-action="trim-end-left">Trim End</button>
          <button data-action="clip-delete">Delete</button>
          <button data-action="clip-mute">Mute Clip</button>
        </div>
        ${renderTimelineSongSettings(pcs)}
        <div class="timeline-options">
          <button data-action="toggle-inspector">${state.inspectorVisible ? "Hide Inspector" : "Show Inspector"}</button>
          <label>Snap
            <select id="snapMode">
              ${(["bar", "beat", "off"] as const).map((mode) => `<option value="${mode}" ${state.snapMode === mode ? "selected" : ""}>${modeLabel(mode)}</option>`).join("")}
            </select>
          </label>
          <button data-action="zoom-out">Zoom -</button>
          <button data-action="zoom-in">Zoom +</button>
          <label class="timeline-zoom-control">Zoom
            <input id="timelineZoom" type="range" min="48" max="360" step="2" value="${sanitizeCssLengthOrNumber(zoom, 240, 48, 360)}">
            <span data-zoom-readout="true">${Math.round(zoom)} px/bar</span>
          </label>
          <label><input type="checkbox" id="loopEnabled" ${project.timeline.loop.enabled ? "checked" : ""}> Loop</label>
          <input class="bar-input" id="loopStart" type="number" min="1" value="${project.timeline.loop.startBar}">
          <input class="bar-input" id="loopEnd" type="number" min="2" value="${project.timeline.loop.endBar}">
          <button data-action="loop-selected">Loop Clip</button>
          <button data-action="loop-clear">Clear</button>
          <button data-action="marker-add">Marker</button>
        </div>
      </div>
      <div class="timeline-scroll" data-scroll-key="timeline-scroll">
        <div class="timeline" data-timeline-surface="true" title="Click the grid to seek by bar" style="width:${width}px; --bar:${zoom}px; --track-header:176px;">
          ${renderBarRuler(project)}
          ${renderMarkers(state)}
          <div class="cursor-line" data-cursor="true" style="left:${barLeftPx(cursorLeft)}"></div>
          <div class="playhead" data-playhead="true" style="left:${barLeftPx(playheadLeft)}"></div>
          <div class="loop-region ${project.timeline.loop.enabled ? "on" : ""}" style="left:${barLeftPx((project.timeline.loop.startBar - 1) * zoom)};width:${Math.max(1, project.timeline.loop.endBar - project.timeline.loop.startBar) * zoom}px"></div>
          ${renderTimelineRows(state)}
        </div>
      </div>
    </section>
  `;
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
  return `<div class="ruler" data-seek-ruler="true" title="Click to seek by bar or time">${Array.from({ length: project.timeline.bars + 1 }, (_, i) => {
    const bar = i + 1;
    const seconds = barsToSeconds(i, project.project.bpm, project.project.timeSig);
    return `<span class="ruler-tick" style="left:${barLeftCalc(`${i} * var(--bar)`)}"><b>${bar}</b><small>${formatDuration(seconds)}</small></span>`;
  }).join("")}</div>`;
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
            <button title="Rename marker" data-marker-rename="${sanitizeDataAttr(marker.id)}">${escapeHtml(marker.name)}</button>
            <button title="Delete marker" data-marker-delete="${sanitizeDataAttr(marker.id)}">x</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTimelineRows(state: AppState): string {
  const project = currentProject(state);
  const rows = project.tracks.filter((track) => (track.trackType === "generated" || track.trackType === "audio" || track.trackType === "midi") && track.role !== "arrangement");
  const clips = sortClips(project.timeline.clips);
  const pcs = getPrimaryChordsmithSource(project);
  return rows
    .map(
      (track) => `
        <div class="timeline-row ${track.trackType === "generated" ? "generated-edit-row" : ""} ${state.selectedTrackId === track.id ? "selected-row" : ""}" data-row="${sanitizeDataAttr(track.id)}">
          ${renderTimelineTrackHeader(track, state.selectedTrackId === track.id, pcs)}
          ${clips.map((clip) => renderClip(project, clip, state.selectedClipId === clip.id, track)).join("")}
          ${renderInlineChordsmithEditor(state, pcs, track, clips)}
        </div>
      `
    )
    .join("");
}

function renderTimelineTrackHeader(track: Track, selected: boolean, pcs: SanitizedPcsProject | null): string {
  const lanes = trackHeaderLaneText(track, pcs);
  return `
    <button class="timeline-track-header ${selected ? "selected" : ""} ${track.active === false ? "inactive" : ""}" data-track-id="${sanitizeDataAttr(track.id)}">
      <span class="track-colour" style="background:${safeTrackColour(track.colour)}"></span>
      <span class="timeline-track-text">
        <span class="timeline-track-name">${escapeHtml(track.name)}</span>
        ${lanes ? `<span class="timeline-track-lanes">${escapeHtml(lanes)}</span>` : ""}
      </span>
      <span class="track-state">${track.automationLaneIds.length ? "A" : ""}${track.armed ? "R" : ""}${track.mute ? "M" : ""}${track.solo ? "S" : ""}${track.active === false ? "Off" : ""}</span>
    </button>
  `;
}

function trackHeaderLaneText(track: Track, pcs: SanitizedPcsProject | null): string {
  if (track.role === "drums") return "Kick / Snare / Hat";
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
  const body =
    track.role === "drums"
      ? renderInlineDrumEditor(section, sourceStartStep, renderSteps, state.chordsmithStepSelection)
      : track.role === "bass"
        ? renderInlineBassEditor(section, sourceStartStep, renderSteps, state.chordsmithStepSelection)
        : track.role === "chords"
          ? renderInlineChordEditor(section, sourceStartBar, Math.min(clip.barLength, section.bars - sourceStartBar))
          : track.role === "melody"
            ? renderInlineMelodyEditor(section, selectedMelodyTrackIndex(track), sourceStartStep, renderSteps, state.chordsmithStepSelection)
            : track.role === "guitar"
              ? renderInlineGuitarEditor(section, sourceStartStep, renderSteps)
              : "";
  if (!body) return "";
  return `
    <div class="inline-sequencer inline-${sanitizeDomId(track.role, "role")} ${state.selectedClipId === clip.id ? "selected-clip-editor" : ""}" data-inline-sequencer="true" data-inline-clip-id="${sanitizeDataAttr(clip.id)}" data-inline-row="${sanitizeDataAttr(track.id)}" data-inline-sequencer-role="${sanitizeDataAttr(track.role)}" data-inline-section="${sanitizeDataAttr(section.id)}" title="Drag empty space to move with snap. Drag the right handle to repeat the section." style="left:${left};width:${width};--inline-steps:${sanitizeCssLengthOrNumber(renderSteps, 0, 0, 256)};">
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

function renderInlineBassEditor(section: SanitizedPcsSection, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="inline-lane single-inline-lane" aria-label="Bass steps">
      <div class="inline-step-grid" style="grid-template-columns:repeat(${steps}, minmax(0, 1fr));">
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const note = section.bassNotes[actualStep];
          const tuplet = !!section.gridTuplets.bass[actualStep];
          const selected = selection?.kind === "bass" && selection.sectionId === section.id && selection.step === actualStep;
          return `<button class="step timeline-step note-step ${note === null || note === undefined ? "" : "on"} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="Bass note step ${actualStep + 1}. Select then press H, S or T." data-bass-step="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${note === null || note === undefined ? "" : escapeHtml(BASS_LABELS[note] || String(note))}${stepBadges({ hold: !!section.bassHold[actualStep], slide: !!section.bassSlide[actualStep], tuplet })}</button>`;
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

function renderClip(project: ReturnType<typeof currentProject>, clip: Clip, selected: boolean, track: Track): string {
  if (clip.type === "audio" && clip.trackId !== track.id) return "";
  if (clip.type === "midi" && clip.trackId !== track.id) return "";
  if (clip.type !== "audio" && clip.type !== "midi" && track.trackType !== "generated") return "";
  const media = clip.mediaPoolItemId ? project.mediaPool.find((item) => item.id === clip.mediaPoolItemId) : null;
  const peaks = Array.isArray(media?.metadata?.waveformPeaks) ? media.metadata.waveformPeaks.slice(0, 48) : [];
  const midi = clip.type === "midi" ? midiDataFromClip(clip) : null;
  return `
    <button class="clip ${selected ? "selected" : ""} ${clip.muted ? "muted" : ""} ${clip.type === "audio" ? "audio-clip" : ""} ${clip.type === "midi" ? "midi-clip" : ""}" data-clip-id="${sanitizeDataAttr(clip.id)}" data-row="${sanitizeDataAttr(track.id)}" title="Drag to move with snap. Drag the right handle to repeat generated sections." style="left:${barLeftCalc(`${sanitizeCssLengthOrNumber(Number(clip.startBar) - 1, 0)} * var(--bar)`)};width:calc(${sanitizeCssLengthOrNumber(clip.barLength, 1, 0.125, 4096)} * var(--bar));border-color:${safeClipColour(clip.color)};background:color-mix(in srgb, ${safeClipColour(clip.color)} 28%, #15192a);">
      <strong>${escapeHtml(clip.sectionId || clip.name)}</strong>
      <span>${escapeHtml(clip.type === "audio" ? media?.name || "Audio" : clip.type === "midi" ? `${midi?.notes.length || 0} MIDI notes` : track.name)}</span>
      ${peaks.length ? `<i class="clip-waveform">${peaks.map((peak) => `<b style="height:${Math.max(2, Math.round(Number(peak) * 18))}px"></b>`).join("")}</i>` : ""}
      ${midi?.notes.length ? `<i class="midi-note-strip">${midi.notes.slice(0, 32).map((note) => `<b style="left:${Math.max(0, Math.min(100, (note.startTick / Math.max(1, midi.ppq * clip.barLength * project.project.timeSig)) * 100))}%;width:${Math.max(3, Math.min(24, (note.durationTicks / Math.max(1, midi.ppq * clip.barLength * project.project.timeSig)) * 100))}%;bottom:${Math.max(2, Math.min(24, (note.pitch - 36) / 3))}px"></b>`).join("")}</i>` : ""}
      ${clip.type === "generated-section" ? `<span class="clip-drag-handle" data-clip-drag-handle="${sanitizeDataAttr(clip.id)}" title="Drag to move this section with snap"></span><span class="clip-loop-handle" data-clip-loop-handle="${sanitizeDataAttr(clip.id)}" title="Drag right to repeat this section"></span>` : ""}
    </button>
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
  return `
    <aside class="inspector" data-scroll-key="inspector">
      <div class="panel-title">Inspector</div>
      ${
        clip
          ? `<section>
              <h2>${escapeHtml(clip.name)}</h2>
              <dl>
                <dt>Type</dt><dd>${clip.type}</dd>
                <dt>Section</dt><dd>${escapeHtml(clip.sectionId || "-")}</dd>
                <dt>Start</dt><dd>Bar ${clip.startBar}</dd>
                <dt>Length</dt><dd>${clip.barLength} bars</dd>
                <dt>Linked</dt><dd>${clip.linked ? "Yes" : "No"}</dd>
                ${clip.type === "audio" ? `<dt>Media</dt><dd>${escapeHtml(clipMedia?.name || "Missing media")}</dd><dt>Status</dt><dd>${escapeHtml(clipMediaStatus?.label || "Missing")}</dd><dt>Duration</dt><dd>${formatDuration(clipMedia?.durationSeconds)}</dd>` : ""}
                ${clip.type === "midi" ? renderMidiClipMetadata(clip, clipMedia, clipMediaStatus) : ""}
              </dl>
              <label>Transpose <input disabled value="${clip.transforms.transpose}"></label>
              <label>Gain <input disabled value="${clip.transforms.gain}"></label>
              <button disabled>Freeze</button>
              <button disabled>Convert to MIDI</button>
              ${clip.type === "midi" ? renderMidiClipEditor(clip) : ""}
            </section>`
          : `<p>Select a clip to inspect it.</p>`
      }
      ${
        track
          ? `<section>
              <h2>${escapeHtml(track.name)}</h2>
              <dl>
                <dt>Type</dt><dd>${track.trackType}</dd>
                <dt>Role</dt><dd>${track.role}</dd>
                <dt>Arm</dt><dd>${track.recordKind && track.recordKind !== "none" ? (track.armed ? "Armed" : "Available") : "Not record-capable"}</dd>
                <dt>Routing</dt><dd>${escapeHtml(track.routing.outputId || "none")}</dd>
              </dl>
              ${renderInputSelector(project, track)}
              ${renderOutputSelector(project, track)}
              ${renderAutomationPanel(project, track)}
              ${renderChordsmithSequencer(state, project, pcs, clip, track)}
              ${renderFxInspector(chain)}
            </section>`
          : ""
      }
    </aside>
  `;
}

function renderAutomationPanel(project: ReturnType<typeof currentProject>, track: Track): string {
  if (track.role === "master" || track.trackType === "return") return "";
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
      ${
        points.length
          ? `<div class="automation-points">
              ${points.map((point, index) => `
                <div class="automation-point">
                  <label>Bar <input data-automation-point-bar="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="1" step="0.25" value="${sanitizeCssLengthOrNumber(point.bar, 1, 1, 4096)}"></label>
                  <label>Value <input data-automation-point-value="${sanitizeDataAttr(`${lane.id}:${index}`)}" type="number" min="${sanitizeCssLengthOrNumber(lane.min ?? (field === "pan" ? -1 : 0), field === "pan" ? -1 : 0, -1, 1.2)}" max="${sanitizeCssLengthOrNumber(lane.max ?? (field === "pan" ? 1 : 1.2), field === "pan" ? 1 : 1.2, -1, 1.2)}" step="${field === "pan" ? "0.05" : "0.01"}" value="${sanitizeCssLengthOrNumber(point.value, 0, -1, 1.2)}"></label>
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
  if (track.role === "master") return "";
  const outputs = availableTrackOutputs(project, track.id);
  return `
    <label>Output
      <select data-track-output="${sanitizeDataAttr(track.id)}">
        ${outputs.map((output) => `<option value="${escapeAttr(output.id)}" ${track.routing.outputId === output.id || (!track.routing.outputId && output.id === "master") ? "selected" : ""}>${escapeHtml(output.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderMidiClipMetadata(clip: Clip, media: ReturnType<typeof currentProject>["mediaPool"][number] | null, status: ReturnType<typeof mediaPoolStatus> | null): string {
  const midi = midiDataFromClip(clip);
  return `
    <dt>Media</dt><dd>${escapeHtml(media?.name || midi.sourceName || "Inline MIDI")}</dd>
    <dt>Status</dt><dd>${escapeHtml(status?.label || "Stored in project")}</dd>
    <dt>Notes</dt><dd>${midi.notes.length}</dd>
    <dt>PPQ</dt><dd>${midi.ppq}</dd>
  `;
}

function renderMidiClipEditor(clip: Clip): string {
  const midi = midiDataFromClip(clip);
  const notes = midi.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  return `
    <div class="midi-editor">
      <header>
        <h3>Piano Roll</h3>
        <button type="button" data-midi-note-add="${sanitizeDataAttr(clip.id)}">Add Note</button>
      </header>
      ${
        notes.length
          ? `<div class="midi-note-list">
              ${notes.map((note) => `
                <div class="midi-note-row">
                  <strong>${midiPitchLabel(note.pitch)}</strong>
                  <span>${note.startTick} ticks</span>
                  <span>${note.durationTicks} long</span>
                  <label>Vel <input data-midi-note-velocity="${sanitizeDataAttr(`${clip.id}:${note.id}`)}" type="number" min="1" max="127" value="${sanitizeCssLengthOrNumber(note.velocity, 96, 1, 127)}"></label>
                  <div class="midi-note-actions">
                    <button type="button" title="Move note earlier" data-midi-note-move="${sanitizeDataAttr(`${clip.id}:${note.id}:-1`)}">&lt;</button>
                    <button type="button" title="Move note later" data-midi-note-move="${sanitizeDataAttr(`${clip.id}:${note.id}:1`)}">&gt;</button>
                    <button type="button" title="Pitch down" data-midi-note-pitch="${sanitizeDataAttr(`${clip.id}:${note.id}:-1`)}">-</button>
                    <button type="button" title="Pitch up" data-midi-note-pitch="${sanitizeDataAttr(`${clip.id}:${note.id}:1`)}">+</button>
                    <button type="button" title="Shorter" data-midi-note-duration="${sanitizeDataAttr(`${clip.id}:${note.id}:-1`)}">Short</button>
                    <button type="button" title="Longer" data-midi-note-duration="${sanitizeDataAttr(`${clip.id}:${note.id}:1`)}">Long</button>
                    <button type="button" title="Delete note" data-midi-note-delete="${sanitizeDataAttr(`${clip.id}:${note.id}`)}">Delete</button>
                  </div>
                </div>
              `).join("")}
            </div>`
          : `<p class="editor-note">No notes yet.</p>`
      }
    </div>
  `;
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
      ${renderChordsmithScopeControls(state, pcs, section, selectedClipSection, page, maxPage)}
      ${renderChordsmithGlobals(pcs)}
      ${body}
    </div>
  `;
}

function renderChordsmithScopeControls(state: AppState, pcs: SanitizedPcsProject, section: SanitizedPcsSection, selectedClipSection: string | null, page: number, maxPage: number): string {
  const melodyCount = Math.max(1, section.melodyTracks.length);
  return `
    <div class="editor-controls">
      <label class="inline-toggle"><input id="chordsmithFollowClip" type="checkbox" ${state.chordsmithEditorFollowClip ? "checked" : ""} ${selectedClipSection ? "" : "disabled"}> Follow clip</label>
      <label>Section
        <select id="chordsmithSectionSelect">
          ${SECTION_IDS.map((id) => `<option value="${id}" ${section.id === id ? "selected" : ""}>Section ${id}</option>`).join("")}
        </select>
      </label>
      <label>Melody lane
        <select id="melodyTrackSelect">
          ${Array.from({ length: melodyCount }, (_, index) => `<option value="${index}" ${state.chordsmithEditorMelodyTrackIndex === index ? "selected" : ""}>Melody ${index + 1}</option>`).join("")}
        </select>
      </label>
      <div class="step-page-controls">
        <button type="button" data-step-page="-1" ${page <= 0 ? "disabled" : ""}>Prev</button>
        <span>Page ${page + 1} / ${maxPage + 1}</span>
        <button type="button" data-step-page="1" ${page >= maxPage ? "disabled" : ""}>Next</button>
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
  const stepNumbers = Array.from({ length: steps }, (_, i) => `<span>${startStep + i + 1}</span>`).join("");
  if (role === "chords") return `<div class="chord-editor">${Array.from({ length: section.bars }, (_, bar) => renderChordSelect(section, bar)).join("")}</div>`;
  if (role === "drums") return `<div class="step-ruler">${stepNumbers}</div>${renderDrumEditor(section, startStep, steps, selection)}`;
  if (role === "bass") return `<div class="step-ruler">${stepNumbers}</div>${renderBassEditor(pcs, section, startStep, steps, selection)}`;
  if (role === "melody") return `<div class="step-ruler">${stepNumbers}</div>${renderMelodyEditor(section, selectedTrack?.role === "melody" ? selectedMelodyTrackIndex(selectedTrack) : melodyTrackIndex, startStep, steps, selection)}`;
  if (role === "guitar") return `<div class="step-ruler">${stepNumbers}</div>${renderGuitarEditor(project, pcs, section, startStep, steps)}`;
  return "";
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

function renderDrumEditor(section: SanitizedPcsSection, startStep: number, steps: number, selection: ChordsmithStepSelection | null): string {
  return `
    <div class="sequencer-block">
      <strong>Drums</strong>
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
      <div class="sequencer-row">
        <span>note</span>
        ${Array.from({ length: steps }, (_, step) => {
          const actualStep = startStep + step;
          const note = section.bassNotes[actualStep];
          const tuplet = !!section.gridTuplets.bass[actualStep];
          const selected = selection?.kind === "bass" && selection.sectionId === section.id && selection.step === actualStep;
          return `<button class="step note-step ${note === null || note === undefined ? "" : "on"} ${tuplet ? "tuplet" : ""} ${selected ? "selected-step" : ""}" title="Bass note step ${actualStep + 1}. Select then press H, S or T." data-bass-step="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${note === null || note === undefined ? "" : escapeHtml(BASS_LABELS[note] || String(note))}${stepBadges({ hold: !!section.bassHold[actualStep], slide: !!section.bassSlide[actualStep], tuplet })}</button>`;
        }).join("")}
      </div>
      ${renderMetaStepRow("accent", steps, (step) => {
        const actualStep = startStep + step;
        return `<button class="step meta-step ${section.bassAccent[actualStep] ? "on accent" : ""}" title="Bass accent step ${actualStep + 1}" data-bass-accent="${sanitizeDataAttr(`${section.id}:${actualStep}`)}">${section.bassAccent[actualStep] ? "!" : ""}</button>`;
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
            ${MELODY_INSTRUMENTS.map((value) => `<option value="${value}" ${instrument === value ? "selected" : ""}>${escapeHtml(instrumentLabel(value))}</option>`).join("")}
          </select>
        </label>
        <label>Octave <input data-melody-octave="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="number" min="-3" max="3" value="${sanitizeCssLengthOrNumber(octave, 0, -3, 3)}"></label>
        <label>Pan <input data-melody-pan="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="range" min="-1" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(pan, 0, -1, 1)}"></label>
        <label class="inline-toggle"><input data-melody-mute="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="checkbox" ${section.melodyMute[trackIndex] ? "checked" : ""}> Mute</label>
        <label class="inline-toggle"><input data-melody-solo="${sanitizeDataAttr(`${section.id}:${trackIndex}`)}" type="checkbox" ${section.melodySolo[trackIndex] ? "checked" : ""}> Solo</label>
      </div>
      <div class="sequencer-row">
        <span>${escapeHtml(instrumentLabel(instrument))}</span>
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
        <label class="inline-toggle"><input data-guitar-setting="guitarEnabled" type="checkbox" ${pcs.guitarEnabled ? "checked" : ""}> Enabled</label>
        <label>Tone
          <select data-guitar-setting="guitarTone">
            ${["clean", "crunch", "high_gain", "muted", "wide"].map((tone) => `<option value="${tone}" ${pcs.guitarTone === tone ? "selected" : ""}>${escapeHtml(instrumentLabel(tone))}</option>`).join("")}
          </select>
        </label>
        <label>Register
          <select data-guitar-setting="guitarRegister">
            ${["low", "mid", "high"].map((register) => `<option value="${register}" ${pcs.guitarRegister === register ? "selected" : ""}>${escapeHtml(instrumentLabel(register))}</option>`).join("")}
          </select>
        </label>
        <label>Strum
          <select data-guitar-setting="guitarStrumMode">
            ${["down", "up", "alternate"].map((mode) => `<option value="${mode}" ${pcs.guitarStrumMode === mode ? "selected" : ""}>${escapeHtml(instrumentLabel(mode))}</option>`).join("")}
          </select>
        </label>
        <label>Volume <input data-guitar-setting="guitarVolume" type="range" min="0" max="1" step="0.01" value="${sanitizeCssLengthOrNumber(pcs.guitarVolume, 0.72, 0, 1)}"></label>
      </div>
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
  if (lane === "kick") return "Kick";
  if (lane === "snare") return "Snare";
  if (lane === "hat") return "Hi-hat";
  return lane;
}

function renderMixer(state: AppState): string {
  const project = currentProject(state);
  return `
    <footer class="mixer" data-layout-zone="mixer" data-scroll-key="mixer">
      ${project.tracks.map((track) => renderMixerStrip(track, state.meterLevels[track.id] || 0)).join("")}
    </footer>
  `;
}

function renderMediaPool(state: AppState): string {
  const project = currentProject(state);
  const items = project.mediaPool;
  const collectPlan = createCollectMediaPlan(project);
  return `
    <section class="media-pool" data-layout-zone="media" id="mediaPool" aria-label="Media Pool" data-scroll-key="media-pool">
      <header>
        <div>
          <h2>Media Pool</h2>
          <p>${items.length ? `${items.length} item${items.length === 1 ? "" : "s"} tracked for audio, MIDI, renders and project-relative media.` : "Imported audio and MIDI appear here with timeline clips and runtime status."}</p>
        </div>
        <div class="media-actions">
          <button data-action="import-audio" title="Import an audio file into the media pool">Import Audio</button>
          <button data-action="import-midi" title="Import a .mid or .midi file as a MIDI clip">Import MIDI</button>
          <button data-action="collect-media" title="Copy reloadable native media beside the saved .pocketdaw project">Collect Media</button>
          <button data-action="build-native-cache" title="Render generated sections and runtime audio into project-cache/native-audio WAV assets">Build Native Cache</button>
          <button data-action="export-media-plan" title="Export a JSON plan for collecting project media">Collect Plan</button>
        </div>
      </header>
      ${
        items.length
          ? `<div class="media-grid">
              ${items.map((item) => {
                const status = mediaPoolStatus(item, item.kind === "audio" && !!getCachedAudioBuffer(item.id));
                const cacheItems = renderCacheItemsForMedia(project, item.id);
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
                      <dt>Cache</dt><dd>${cacheItems.length ? cacheItems.map((cache) => `${escapeHtml(cache.id)}${cache.invalidated ? " invalid" : ""}`).join(", ") : "-"}</dd>
                    </dl>
                    ${renderMediaWaveform(item)}
                    <div class="media-item-actions">
                      ${status.reloadable ? `<button type="button" data-reload-media="${sanitizeDataAttr(item.id)}" title="Reload this audio file into the runtime buffer cache">Reload</button>` : ""}
                      ${status.relinkable ? `<button type="button" data-relink-media="${sanitizeDataAttr(item.id)}" title="Choose a replacement file for this media item">Relink</button>` : ""}
                      ${item.kind === "audio" ? `<button type="button" data-place-audio="${sanitizeDataAttr(item.id)}">Place on Timeline</button>` : ""}
                      ${item.kind === "midi" ? `<span>MIDI clip created on import</span>` : ""}
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
      <aside class="render-cache-summary">
        <strong>Render Cache</strong>
        <span>${project.renderCache.length ? project.renderCache.map((item) => `${escapeHtml(item.id)}${item.mediaPoolItemId ? ` -> ${escapeHtml(item.mediaPoolItemId)}` : ""}${item.invalidated ? " (invalidated)" : ""}`).join(" / ") : "No render cache entries yet. Freeze, stem and game-pack renders will link cache entries to media pool items here."}</span>
        <strong>Collect Plan</strong>
        <span>${collectPlan.copy.length} copy / ${collectPlan.alreadyProject.length} project / ${collectPlan.blocked.length} blocked</span>
      </aside>
    </section>
  `;
}

function renderExportPanel(state: AppState): string {
  const project = currentProject(state);
  const stems = createStemExportPlan(project);
  const loops = createSectionLoopMetadata(project);
  const progress = state.exportProgress;
  return `
    <section class="export-panel" data-layout-zone="export" aria-label="Export Foundations">
      <header>
        <div>
          <h2>Exports</h2>
          <p>${stems.length} stem group${stems.length === 1 ? "" : "s"} / ${loops.length} section loop${loops.length === 1 ? "" : "s"} available for first-pass export.</p>
        </div>
        <div class="export-actions">
          <button data-action="export-wav">Full WAV</button>
          <button data-action="export-midi">Full MIDI</button>
          <button data-action="export-stems" ${stems.length ? "" : "disabled"} title="Downloads one WAV per stem in sequence">Stem WAVs</button>
          <button data-action="export-section-manifest" ${loops.length ? "" : "disabled"}>Section Manifest</button>
          <button data-action="export-godot-manifest">Godot Manifest Preview</button>
          <button data-action="export-web-game-manifest">Web Manifest Preview</button>
        </div>
      </header>
      ${progress ? `
        <div class="export-progress" role="status" aria-live="polite">
          <div>
            <strong>${escapeHtml(progress.message)}</strong>
            ${progress.detail ? `<span>${escapeHtml(progress.detail)}</span>` : ""}
          </div>
          <i></i>
        </div>
      ` : ""}
      <p class="export-note">Full mix and stem WAVs render real audio. Game manifests now use deterministic pack paths; section-loop audio and ZIP assembly remain planned-render/native follow-up work.</p>
    </section>
  `;
}

function renderMediaWaveform(item: { metadata?: Record<string, unknown> }): string {
  const peaks = Array.isArray(item.metadata?.waveformPeaks) ? item.metadata.waveformPeaks.slice(0, 64) : [];
  if (!peaks.length) return "";
    return `<div class="media-waveform">${peaks.map((peak) => `<span style="height:${sanitizeCssLengthOrNumber(Math.max(2, Math.round(Number(peak) * 28)), 2, 2, 28)}px"></span>`).join("")}</div>`;
}

function renderMixerStrip(track: Track, meterLevel: number): string {
  const panLabel = panReadout(track.pan);
  const volumeLabel = `${Math.round(track.volume * 100)}%`;
  const meterLabel = `${Math.round(meterLevel * 100)}%`;
  const isMaster = track.role === "master";
  const isReturn = track.role === "fx-return";
  const canMuteSolo = !isMaster && !isReturn;
  const canArm = !!track.recordKind && track.recordKind !== "none";
  const recordBlockedTitle = "Recording coming after media/device QA, latency setup, armed-track rules and reload-safe project media.";
  return `
    <div class="strip ${track.active === false ? "inactive" : ""}">
      <div class="strip-name">
        <span>${escapeHtml(track.name)}</span>
        <small>${isMaster ? "Output" : track.active === false ? "Inactive" : track.solo ? "Solo" : track.mute ? "Muted" : "Active"}</small>
      </div>
      <div class="meter" data-meter="${sanitizeDataAttr(track.id)}" aria-label="${escapeAttr(`${track.name} peak meter ${meterLabel}`)}" title="Live peak meter">
        <span data-meter-fill="${sanitizeDataAttr(track.id)}" style="height:${sanitizeCssLengthOrNumber(Math.round(meterLevel * 100), 0, 0, 100)}%"></span>
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
               <button type="button" title="${escapeAttr(`Solo ${track.name}`)}" class="${track.solo ? "on" : ""}" data-solo-track="${sanitizeDataAttr(track.id)}">Solo</button>` : `<span class="strip-note">Return channel</span>`}
               ${canArm ? `<button type="button" title="${escapeAttr(recordBlockedTitle)}" class="${track.armed ? "on record" : ""}" data-arm-track="${sanitizeDataAttr(track.id)}" disabled>Arm</button>` : ""}`
        }
      </div>
      ${!isMaster ? renderFxDropdown(track) : ""}
    </div>
  `;
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

function renderFxInspector(chain: FxChain | null): string {
  if (!chain) return "";
  return `
    <div class="fx-inspector">
      <h3>FX Chain</h3>
      ${chain.slots.length ? chain.slots.map((slot) => `
        <div class="fx-slot ${slot.enabled ? "" : "bypassed"}">
          <span>${escapeHtml(slot.name)}</span>
          <button data-fx-toggle="${sanitizeDataAttr(`${chain.id}:${slot.id}`)}">${slot.enabled ? "Bypass" : "Enable"}</button>
          <button data-fx-remove="${sanitizeDataAttr(`${chain.id}:${slot.id}`)}">Remove</button>
        </div>
      `).join("") : `<p>No FX yet.</p>`}
    </div>
  `;
}

function renderInputSelector(project: ReturnType<typeof currentProject> | null, track: Track): string {
  if (!project || !track.recordKind || track.recordKind === "none") return "";
  const inputs = (project.audioDeviceSettings.devices || []).filter((device) => device.kind === "input" || device.kind === "duplex");
  return `
    <label>Input
      <select data-track-input="${sanitizeDataAttr(track.id)}">
        <option value="">No input selected</option>
        ${inputs.map((device) => `<option value="${escapeAttr(device.id)}" ${track.inputDeviceId === device.id ? "selected" : ""}>${escapeHtml(device.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderAddTrackPanel(): string {
  return `
    <div class="modal-backdrop" data-add-track-backdrop="true">
      <section class="controls-panel add-track-panel" role="dialog" aria-modal="true" aria-labelledby="add-track-title">
        <header>
          <h2 id="add-track-title">Add Track</h2>
          <button data-action="add-track-close">Close</button>
        </header>
        <div class="add-track-grid">
          <button data-add-track-kind="live-vocals"><strong>Live Vocals</strong><span>Disabled recording stub; media/device QA first</span></button>
          <button data-add-track-kind="live-instrument"><strong>Live Instrument</strong><span>Input placeholder only; no capture yet</span></button>
          <button data-add-track-kind="chordsmith-drums"><strong>Chordsmith Drums</strong><span>Select or enable generated drums</span></button>
          <button data-add-track-kind="chordsmith-bass"><strong>Chordsmith Bass</strong><span>Select or enable generated bass</span></button>
          <button data-add-track-kind="chordsmith-chords"><strong>Chordsmith Chords</strong><span>Select or enable generated chords</span></button>
          <button data-add-track-kind="chordsmith-melody"><strong>Chordsmith Melody</strong><span>Select or enable generated melody</span></button>
          <button data-add-track-kind="chordsmith-guitar"><strong>Chordsmith Guitar</strong><span>Select or reactivate guitar</span></button>
          <button data-action="add-bus-track"><strong>Bus</strong><span>Route tracks through a grouped output</span></button>
          <button data-action="add-return-track"><strong>Return</strong><span>FX return scaffold; sends stay guarded</span></button>
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
          <p><strong>Recording</strong><span>Coming after media/device QA, input selection, latency, armed tracks, meters and reload-safe recorded media.</span></p>
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
          Check silently on startup
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
  const cacheSummary = `${project.renderCache.length} metadata item${project.renderCache.length === 1 ? "" : "s"}`;
  return `
    <div class="modal-backdrop" data-controls-backdrop="true">
      <section class="controls-panel" role="dialog" aria-modal="true" aria-labelledby="controls-title">
        <header>
          <h2 id="controls-title">About / Diagnostics</h2>
          <button data-action="controls-close">Close</button>
        </header>
        <div class="control-guide">
          <p><strong>App</strong><span>Pocket DAW v${escapeHtml(POCKET_DAW_VERSION)} / build ${escapeHtml(runtimeBuildId())} / commit ${escapeHtml(runtimeCommit())}</span></p>
          <p><strong>Runtime</strong><span>${escapeHtml(runtimeLabel())}</span></p>
          <p><strong>Distribution</strong><span>Installed app only / installerOnly: true</span></p>
          <p><strong>Project</strong><span>${escapeHtml(project.project.title || "Untitled")} / ${escapeHtml(state.currentFile.path || state.currentFile.label || "Unsaved")}</span></p>
          <p><strong>Audio</strong><span>${escapeHtml(project.audioDeviceSettings.host)} / ${devices.length} device${devices.length === 1 ? "" : "s"}${defaultOutput ? ` / output ${escapeHtml(defaultOutput.name)}` : ""}</span></p>
          <p><strong>Updater</strong><span>${escapeHtml(updaterStatusText(state))} / startup check ${state.updaterAutoCheckOnStartup ? "on" : "off"}</span></p>
          <p><strong>Handoff</strong><span>${escapeHtml(handoffStatusText(state))}</span></p>
          <p><strong>Media</strong><span>${escapeHtml(mediaSummary)} / render cache ${escapeHtml(cacheSummary)}</span></p>
          <p><strong>Storage</strong><span>${escapeHtml(state.currentFile.path ? "Project media/cache folders sit beside the saved .pocketdaw file." : "Unsaved project; autosave/recent data uses the installed app or browser runtime store.")}</span></p>
          <p><strong>Import</strong><span>Paste a PCS1 code, Chordsmith JSON, Pocket DJ source session, or .pocketdaw file.</span></p>
          <p><strong>Demo</strong><span>Load Demo Copy creates an editable autosaved copy. Reload Demo Template discards copy edits and starts fresh from the built-in demo.</span></p>
          <p><strong>Transport</strong><span>Play, Stop, Restart, or return to Bar 1 from the top bar.</span></p>
          <p><strong>Shortcuts</strong><span>Space play/pause, Home Bar 1, L loop, P loop selected, X split, G marker, Ctrl+C/V clip copy/paste, M mute, S solo, R arm, D duplicate, Delete remove, arrows move clips, plus/minus zoom.</span></p>
          <p><strong>Timeline</strong><span>Select a clip, click or drag the ruler/grid to seek and scrub, choose Bar or Beat snap, then use Move, Copy, Paste, Split, Trim, Loop Clip, Marker and Zoom controls.</span></p>
          <p><strong>Media Pool</strong><span>Import Audio decodes supported files into a runtime cache. Import MIDI parses .mid files into editable clips played by the preview synth.</span></p>
          <p><strong>Mixer</strong><span>Use Volume and Pan sliders. Meters show live peak audio. Mute silences a track; Solo isolates it.</span></p>
          <p><strong>Recent</strong><span>${escapeHtml(recent)}</span></p>
          <p><strong>Save / Export</strong><span>Save .pocketdaw projects, export full-song WAV, or export multi-track MIDI.</span></p>
          <p><strong>Alpha testing</strong><span>Recording stays guarded. Native Collect Media can copy external audio beside a saved project; Relink/Reload can refresh audio buffers in the installed app.</span></p>
        </div>
        <div class="diagnostic-actions">
          <button data-action="copy-diagnostics">Copy Diagnostics</button>
          <button data-action="export-diagnostics">Export Diagnostics JSON</button>
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

function formatBarBeat(barValue: number, timeSig: number, ppq: number): string {
  const pos = barFloatToPosition(barValue, timeSig, ppq);
  return `Bar ${pos.bar} Beat ${pos.beat}`;
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
  if (status.missing || status.unresolved) return "Missing - relink required";
  if (status.runtimeOnly) return "Runtime-only";
  if (status.external && status.runtimeAvailable) return "External reference loaded";
  if (status.external) return "External reference";
  if (status.runtimeAvailable) return "Project media loaded";
  if (cacheCount) return "Cached render metadata";
  return "Project media";
}

function mediaPersistenceDetail(status: ReturnType<typeof mediaPoolStatus>, cacheCount: number): string {
  if (status.missing || status.unresolved) return "The project has metadata for this item, but the file is missing or unresolved. Use Relink before playback/export.";
  if (status.runtimeOnly) return "Loaded into memory for this session only. Save/reopen will need re-import or Collect Media in the installed app.";
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
