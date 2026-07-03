import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { collapsedSectionsForCreationPreset, createInitialState as createTimelineFirstInitialState, createUiCollapsedSections, lowerDockTabForCreationPreset } from "../src/app/state";
import { renderAppShell } from "../src/app/ui";
import { createUndoStack } from "../src/daw/undo";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { addMediaPoolItem, createMediaPoolItem } from "../src/daw/mediaPool";
import { addTrackToProject } from "../src/daw/tracks";
import { addFxSlot } from "../src/daw/fx";
import { branchGeneratedDrumsToTracks, setDrumBranchGroupCollapsed } from "../src/daw/drumLanes";
import { createAutomationLane, ensureTrackSendAutomationLane } from "../src/daw/automation";
import { addReturnTrack, setTrackSendLevel, setTrackSendMode } from "../src/daw/routing";
import { addMidiAftertouch, addMidiController, addMidiPitchBend, addMidiProgramChange, importMidiFileToProject, midiDataFromClip } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { multiTrackChannelMidiBytes, simpleMidiBytes } from "./midiFixtures";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { POCKET_DAW_VERSION } from "../src/daw/schema";
import { addImportedAudioMedia, placeAudioClipOnTimeline, placeAudioClipOnTrack } from "../src/daw/audioClips";
import { FUNCTION_ACTION_CATALOG_DOC, FUNCTION_ACTION_REFERENCE, FUNCTION_GUIDE_SECTIONS, FUNCTION_REFERENCE_DOC } from "../src/app/functionGuide";
import { addTrackCommand, importTextToProject, setTrackFolderCommand, toggleFolderExpandedCommand } from "../src/app/commands";
import { utf8ToBase64Url } from "../src/compatibility/pcsParser";
import { createPocketDjImportFixture } from "./pocketDjFixtures";

function inspectorHtml(html: string) {
  return html.match(/<aside class="inspector"[\s\S]*?<\/aside>/)?.[0] || "";
}

function lowerDockHtml(html: string) {
  return html.match(/<footer class="mixer lower-dock"[\s\S]*?<\/footer>/)?.[0] || "";
}

function transportHtml(html: string) {
  return html.match(/<header class="transport"[\s\S]*?<\/header>/)?.[0] || "";
}

function timelineToolbarHtml(html: string) {
  return html.match(/<div class="timeline-toolbar[\s\S]*?<div class="timeline-scroll"/)?.[0] || "";
}

function timelineRowHtml(html: string, rowId: string) {
  const marker = `data-row="${rowId}"`;
  const start = html.indexOf(marker);
  if (start === -1) return "";
  const next = html.indexOf('<div class="timeline-row', start + marker.length);
  return html.slice(start, next === -1 ? undefined : next);
}

function createInitialState() {
  const state = createTimelineFirstInitialState();
  state.timelineHeightPx = 430;
  state.inspectorVisible = true;
  state.collapsedUiSections = createUiCollapsedSections();
  return state;
}

describe("Pocket DAW UI rendering", () => {
  it("uses the saved file name for an untitled project and keeps About in Help only", () => {
    const state = createInitialState();
    const project = createEmptyPocketDawProject();
    project.project.title = "Untitled Project";
    state.undoStack = createUndoStack(project);
    state.currentFile = { path: "C:\\Users\\sam_s\\Music\\Sam Jam.pocketdaw", label: "Sam Jam.pocketdaw" };

    const html = renderAppShell(state);
    const transport = transportHtml(html);

    expect(transport).toContain("<p>Sam Jam</p>");
    expect(transport).not.toContain('data-action="controls-open">About</button>');
    expect(html).toContain("About / Diagnostics");
  });

  it("escapes malicious project fields before string-rendering the shell", () => {
    const project = createEmptyPocketDawProject();
    const badName = `<img src=x onerror=alert(1)>`;
    const badId = `drums" onclick=alert(1)`;
    const badClipId = `clip" onclick=alert(1)`;
    const badColour = `red;background:url(javascript:alert(1))`;
    const track = project.tracks.find((item) => item.id === "drums")!;
    track.id = badId;
    track.name = badName;
    track.colour = badColour;
    track.automationLaneIds = [`lane" onclick=alert(1)`];
    project.project.title = badName;
    project.timeline.markers = [{
      id: `marker" onclick=alert(1)`,
      bar: 1,
      name: badName,
      color: badColour,
      markerType: "cue"
    }];
    project.mediaPool.push({
      id: `media" onclick=alert(1)`,
      kind: "audio",
      name: `Loop ${badName}`,
      uri: `C:\\Audio\\Loop ${badName}.wav`,
      durationSeconds: 1,
      sampleRate: 44100,
      channels: 2,
      sizeBytes: 1234,
      metadata: { waveformPeaks: [1, 0.5] }
    });
    project.timeline.clips = [{
      id: badClipId,
      type: "audio",
      trackId: badId,
      startBar: 1,
      barLength: 1,
      name: `Clip ${badName}`,
      muted: false,
      color: badColour,
      linked: false,
      transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} },
      mediaPoolItemId: project.mediaPool[0].id
    }];
    project.automation.lanes = [{
      id: track.automationLaneIds[0],
      trackId: badId,
      targetPath: `volume"><script>alert(1)</script>`,
      points: [{ bar: 1, value: 0.5 }],
      enabled: true
    }];
    project.renderCache.push({
      id: `cache" onclick=alert(1)`,
      mediaPoolItemId: project.mediaPool[0].id,
      createdAt: "2026-06-13T00:00:00.000Z",
      invalidated: false
    });

    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedTrackId = badId;
    state.selectedClipId = badClipId;
    const html = renderAppShell(state);
    const lower = html.toLowerCase();

    expect(lower).not.toContain("<script");
    expect(lower).not.toContain("onerror=");
    expect(lower).not.toContain("onclick=");
    expect(lower).not.toContain("javascript:");
    expect(lower).not.toContain("background:url");
    expect(html).toContain("&lt;img src&#61;x onerror&#61;alert(1)&gt;");
    expect(html).toContain("border-color:#40d8ff");
    expect(html).toContain('data-track-id="drums&quot; onclick&#61;alert(1)"');
  });

  it("renders song setup and direct generated-track sequencers in a new project", () => {
    const project = createEmptyPocketDawProject();
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedClipId = null;
    state.selectedTrackId = "drums";

    const html = renderAppShell(state);

    expect(html).toContain('data-chordsmith-global="key"');
    expect(html).toContain('data-chordsmith-global="bpm"');
    expect(html).toContain('data-chordsmith-global="timeSig"');
    expect(html).toContain('data-chordsmith-global="resolution"');
    expect(html).toContain('id="songSectionToAdd"');
    expect(html).toContain('data-action="section-add"');
    expect(html).toContain('id="chordsmithSectionSelect"');
    expect(html).toContain('data-melody-step="A:0:0"');
    expect(html).toContain('data-drum-step="A:kick:0"');
    expect(html).toContain('data-drum-preset-section="A"');
    expect(html).toContain("Choose beat preset...");
    expect(html).toContain("Lofi backbeat");
    expect(html).toContain('id="gameStateMarker"');
    expect(html).toContain('data-action="game-state-marker-add"');
    expect(html).toContain("Drum Kit Lanes");
    expect(html).toContain('data-drum-lane-volume="kick"');
    expect(html).toContain('data-drum-lane-gate="kick"');
    expect(html).toContain('data-drum-lane-add-fx="clap"');
    expect(html).toContain("Open Hat");
    expect(html).toContain("Ride");
    expect(html).toContain('data-inline-sequencer-role="drums"');
    expect(html).toContain('data-inline-sequencer-role="bass"');
    expect(html).toContain('data-inline-sequencer-role="chords"');
    expect(html).toContain('data-inline-sequencer-role="melody"');
    expect(html).toContain('data-inline-sequencer-role="guitar"');
  });

  it("renders edit range controls, menu actions and timeline overlay", () => {
    const state = createInitialState();
    const project = state.undoStack.present;
    const clip = project.timeline.clips[0];
    project.timeline.selection = {
      startBar: clip.startBar + 1,
      endBar: clip.startBar + 3,
      source: "clip"
    };

    const html = renderAppShell(state);

    expect(html).toContain('data-action="range-selected"');
    expect(html).toContain('data-action="range-loop"');
    expect(html).toContain('data-action="range-copy"');
    expect(html).toContain('data-action="range-cut"');
    expect(html).toContain('data-action="range-split"');
    expect(html).toContain('data-action="range-crop"');
    expect(html).toContain('data-action="range-delete"');
    expect(html).toContain('data-action="range-ripple-delete"');
    expect(html).toContain('data-action="range-ripple-all"');
    expect(html).toContain('data-action="range-clear"');
    expect(html).toContain('id="rangeStart"');
    expect(html).toContain('id="rangeEnd"');
    expect(html).toContain('data-range-region="true"');
    expect(html).toContain('class="range-region clip"');
  });

  it("renders compact transport readouts with contained value and detail text", () => {
    const state = createInitialState();
    state.playheadBar = 1;
    state.recording = {
      ...state.recording,
      status: "recording",
      elapsedSeconds: 7
    };

    const html = renderAppShell(state);
    const transport = html.match(/<div class="transport-readout">[\s\S]*?<\/div>/)?.[0] || "";

    expect(transport).toContain('<span data-playing-state="true" class=""><strong>Stopped</strong></span>');
    expect(transport).toContain('<span data-recording-state="true" data-ui-scope="recording" class="recording"><strong>Recording</strong><small>0:07</small></span>');
    expect(transport).toContain("<span><strong>118</strong><small>BPM</small></span>");
    expect(transport).toContain("<span><strong>Metro</strong><small>off</small></span>");
    expect(transport).toContain('<span data-playhead-readout="true"><strong>Bar 1</strong><small>Beat 1</small></span>');
    expect(html).toContain('data-action="midi-panic"');
    expect(html).toContain(">Panic</button>");
  });

  it("renders creation focus presets with scoped UI clutter controls", () => {
    const state = createInitialState();

    const html = renderAppShell(state);
    const transport = transportHtml(html);

    expect(html).toContain('data-ui-preset="music"');
    expect(transport).toContain('class="creation-presets"');
    expect(transport).toContain('data-action="preset-music" aria-pressed="true"');
    expect(transport).toContain('data-action="preset-game-music" aria-pressed="false"');
    expect(transport).toContain("Music preset: keep the timeline primary");
    expect(transport).toContain("Game music preset: keep timeline/game cues prominent");
    expect(html).toContain('data-ui-scope="recording"');
    expect(html).toContain('class="game-cue-controls" data-ui-scope="game"');

    state.uiCreationPreset = "game-music";
    const gameHtml = renderAppShell(state);
    const gameTransport = transportHtml(gameHtml);

    expect(gameHtml).toContain('data-ui-preset="game-music"');
    expect(gameTransport).toContain('data-action="preset-music" aria-pressed="false"');
    expect(gameTransport).toContain('data-action="preset-game-music" aria-pressed="true"');
  });

  it("opens the default workspace as timeline-first with edit tools tucked away", () => {
    const state = createTimelineFirstInitialState();
    const html = renderAppShell(state);

    expect(html).toContain("--studio-height:620px");
    expect(html).toContain('class="studio inspector-hidden"');
    expect(html).toContain('class="timeline-toolbar collapsed"');
    expect(html).toContain('aria-label="Essential timeline tools"');
    expect(html).toContain("Loop off / No range");
    expect(html).toContain('data-action="toggle-inspector" title="Show the selected clip and track inspector">Inspector</button>');
    expect(html).toContain('class="timeline-compact-tools-button"');
    expect(html).toContain("Show full timeline edit, song, loop, range and marker tools");
    expect(html).toContain('class="mixer lower-dock collapsed"');
    expect(html).toContain("Mixer controls are hidden.");
    expect(html).toContain('class="media-pool collapsed"');
    expect(html).not.toContain('data-inspector-resize-handle="true"');
  });

  it("keeps the collapsed timeline toolbar to primary actions only", () => {
    const html = renderAppShell(createTimelineFirstInitialState());
    const toolbar = timelineToolbarHtml(html);

    expect(toolbar).toContain('class="timeline-compact-tools"');
    expect(toolbar).toContain('data-action="clip-split"');
    expect(toolbar).toContain('data-action="toggle-inspector"');
    expect(toolbar).toContain('data-action="zoom-out"');
    expect(toolbar).toContain('data-action="zoom-in"');
    expect(toolbar).toContain('data-action="toggle-ui-section"');
    expect(toolbar).toContain('data-ui-section="timeline-tools"');
    expect(toolbar).not.toContain('data-action="clip-delete"');
    expect(toolbar).not.toContain('data-action="clip-duplicate"');
    expect(toolbar).not.toContain('data-action="clip-mute"');
    expect(toolbar).not.toContain('data-action="range-delete"');
    expect(toolbar).not.toContain('data-action="range-ripple-delete"');
  });

  it("defines focus preset collapse defaults that genuinely reduce visible clutter", () => {
    expect(collapsedSectionsForCreationPreset("game-music")).toMatchObject({
      "timeline-tools": true,
      "inspector-clip": true,
      "inspector-track": false,
      "lower-dock": false,
      "media-pool": false
    });
    expect(lowerDockTabForCreationPreset("game-music", "mixer")).toBe("export-details");

    expect(collapsedSectionsForCreationPreset("music")).toMatchObject({
      "timeline-tools": true,
      "inspector-clip": false,
      "inspector-track": false,
      "lower-dock": true,
      "media-pool": true
    });
    expect(lowerDockTabForCreationPreset("music", "export-details")).toBe("mixer");
    expect(lowerDockTabForCreationPreset("music", "piano-roll")).toBe("piano-roll");
  });

  it("renders a persistent studio rail for major DAW work areas", () => {
    const state = createInitialState();

    let html = renderAppShell(state);

    expect(html).toContain('class="studio-rail" data-layout-zone="studio-rail" aria-label="Studio rail"');
    [
      ["library", "add-track-open"],
      ["project", "file-window-open"],
      ["clips", "studio-focus-timeline"],
      ["media", "media-pool-focus"],
      ["mixer", "lower-dock-mixer"],
      ["midi", "lower-dock-piano-roll"],
      ["audio", "lower-dock-audio-editor"],
      ["export", "lower-dock-export-details"],
      ["godot", "studio-focus-godot"],
      ["pocket", "import-focus"],
      ["diagnostics", "controls-open"],
      ["help", "function-guide-open"]
    ].forEach(([target, action]) => {
      expect(html).toContain(`data-action="${action}"`);
      expect(html).toContain(`data-studio-rail-target="${target}"`);
    });
    expect(html).toContain("Library: Open track and source choices for live audio, MIDI, Chordsmith roles, buses and returns.");
    expect(html).toContain("Project: Open project, import, export and media actions.");
    expect(html).toContain("Godot: Show game music focus and Godot/web pack controls.");

    state.uiCreationPreset = "game-music";
    state.lowerDockTab = "export-details";
    html = renderAppShell(state);

    expect(html).toContain('data-studio-rail-target="godot"');
    expect(html).toContain('aria-label="Godot: Show game music focus and Godot/web pack controls."');
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders minimisable UI sections with collapsed notices", () => {
    const state = createInitialState();
    const clip = state.undoStack.present.timeline.clips[0];
    state.selectedClipId = clip.id;
    state.selectedTrackId = "bass";

    const html = renderAppShell(state);

    expect(html).toContain('data-ui-collapse-section="timeline-tools"');
    expect(html).toContain('data-ui-section="timeline-tools" aria-expanded="true"');
    expect(html).toContain('data-ui-section="inspector-clip" aria-expanded="true"');
    expect(html).toContain('data-ui-section="inspector-track" aria-expanded="true"');
    expect(html).toContain('data-ui-section="lower-dock" aria-expanded="true"');
    expect(html).toContain('data-ui-section="media-pool" aria-expanded="true"');

    state.collapsedUiSections = createUiCollapsedSections({
      "timeline-tools": true,
      "inspector-clip": true,
      "inspector-track": true,
      "lower-dock": true,
      "media-pool": true
    });
    const collapsedHtml = renderAppShell(state);

    expect(collapsedHtml).toContain('class="timeline-toolbar collapsed"');
    expect(collapsedHtml).toContain('aria-label="Essential timeline tools"');
    expect(collapsedHtml).toContain("Loop off / No range");
    expect(collapsedHtml).toContain('class="inspector-section collapsed" data-ui-collapse-section="inspector-clip"');
    expect(collapsedHtml).toContain("Selected clip details, mix controls and edit actions are hidden.");
    expect(collapsedHtml).toContain("Selected track routing, automation and Chordsmith editors are hidden.");
    expect(collapsedHtml).toContain('class="mixer lower-dock collapsed"');
    expect(collapsedHtml).toContain("Mixer controls are hidden.");
    expect(collapsedHtml).toContain('class="media-pool collapsed"');
    expect(collapsedHtml).toContain("Media pool items, render cache and portability details are hidden.");
    expect(collapsedHtml).toContain('class="timeline-compact-tools-button"');
    expect(collapsedHtml).toContain('data-ui-section="timeline-tools"');
    expect(collapsedHtml).toContain('aria-expanded="false"');
  });

  it("labels generated-role inspector controls as source editing rather than clip gain edits", () => {
    const state = createInitialState();
    state.selectedTrackId = "drums";
    state.selectedClipId = state.undoStack.present.timeline.clips.find((clip) => clip.trackId === "drums")?.id || null;

    const html = renderAppShell(state);

    expect(html).toContain("Track source editor");
    expect(html).toContain("This edits the Chordsmith section data for the selected generated role.");
    expect(html).toContain("Clip mix changes affect only the selected timeline clip.");
    expect(html).toContain('title="Follow the selected generated clip section when possible; turn off to choose a section manually."');
    expect(html).toContain('title="Move to the previous visible group of Chordsmith steps."');
    expect(html).toContain('title="Move to the next visible group of Chordsmith steps."');

    state.selectedTrackId = "guitar";
    state.selectedClipId = state.undoStack.present.timeline.clips.find((clip) => clip.trackId === "guitar")?.id || null;
    const guitarHtml = renderAppShell(state);

    expect(guitarHtml).toContain('title="Enable or mute generated guitar playback for this Chordsmith source."');
  });

  it("renders the Pocket DAW function guide for humans and AI counterparts", () => {
    const state = createInitialState();
    let html = renderAppShell(state);

    expect(html).toContain('data-action="function-guide-open"');
    expect(html).not.toContain('id="function-guide-title"');

    state.showFunctionGuidePanel = true;
    html = renderAppShell(state);

    expect(html).toContain('data-function-guide-backdrop="true"');
    expect(html).toContain('id="function-guide-title">Function Guide</h2>');
    expect(html).toContain(FUNCTION_REFERENCE_DOC);
    expect(html).toContain(FUNCTION_ACTION_CATALOG_DOC);
    expect(html).toContain("AI note");
    expect(html).toContain("Button And Action Catalog");
    expect(html).toContain("data-action&#61;range-cut");
    expect(html).toContain("data-audio-clip-action:normalize-gain");
    expect(html).toContain("Cut / Copy / Paste / Duplicate");
    expect(html).toContain("Copy Range");
    expect(html).toContain("Cut Range");
    expect(html).toContain("Music Focus");
    expect(html).toContain("Godot Game Pack");
    expect(html).toContain("Section Stem Mutes");
    expect(html).toContain("Sets the active edit range to the current playback loop boundaries");
    expect(html).toContain("data-marker-rename");
    expect(html).toContain("data-track-input");
    expect(html).toContain("data-section-chord");
    expect(html).toContain("Studio Rail Navigation");
    expect(html).toContain("Library, Project, Clips, Media, Mixer");
    expect(html).toContain("data-action&#61;studio-focus-godot");
    expect(html).toContain("Add Folder Track");
    expect(html).toContain("data-add-track-kind:folder");
    expect(html).toContain("selected bass step + H/S/T");
    expect(html).toContain("data-automation-enabled");
    expect(FUNCTION_GUIDE_SECTIONS.length).toBeGreaterThan(10);
    expect(FUNCTION_GUIDE_SECTIONS.every((section) => section.entries.length > 0)).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.length).toBeGreaterThan(200);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.actionId === "collect-media")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.actionId === "convert-midi-drums")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.actionId === "convert-midi-arrangement")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.actionId === "audio-take-comp-range")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.selector === "data-audio-take-lane-summary")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.selector === "data-audio-clip-action:quantize-warp-markers-1/4, quantize-warp-markers-1/8, quantize-warp-markers-1/16, quantize-warp-markers-1/32")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.selector === "data-audio-clip-action:apply-warp-varispeed")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.selector === "data-midi-duration-quantize")).toBe(true);
    expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.selector === "data-ai-bridge-enabled")).toBe(true);
    [
      "data-chord-instrument",
      "data-section-chord",
      "data-bass-mode",
      "data-melody-instrument / data-melody-octave / data-melody-pan / data-melody-mute / data-melody-solo",
      "data-guitar-setting",
      "data-step-page",
      "data-marker-rename",
      "data-marker-delete",
      "data-track-input",
      "data-track-output",
      "data-track-record-channel-mode",
      "data-track-record-channel",
      "data-automation-enabled"
    ].forEach((selector) => {
      expect(FUNCTION_ACTION_REFERENCE.some((entry) => entry.selector === selector)).toBe(true);
    });
  });

  it("wires MIDI Panic through the app transport dispatch path", () => {
    const source = readFileSync("src/app/App.ts", "utf8");

    expect(source).toContain('if (action === "midi-panic") this.panicMidiPreview();');
    expect(source).toContain("MIDI panic: stopped preview playback and cleared active notes.");
    expect(source).toContain("this.applyButtonTooltips();");
    expect(source).toContain("function tooltipForButton(button: HTMLButtonElement)");
    expect(source).toContain("FUNCTION_ACTION_TOOLTIPS");
    expect(source).toContain("quantizeMidiDurationsCommand");
    expect(source).toContain("[data-midi-duration-quantize]");
    expect(source).toContain("collapsedSectionsForCreationPreset");
    expect(source).toContain("lowerDockTabForCreationPreset");
    expect(source).toContain('if (action === "toggle-ui-section")');
    expect(source).toContain('if (action === "function-guide-open")');
    expect(source).toContain('if (action === "studio-focus-timeline")');
    expect(source).toContain('if (action === "studio-focus-godot")');
    expect(source).toContain('this.state.lowerDockTab = "export-details";');
    expect(source).toContain('"function-guide-open": "Open the Pocket DAW function guide."');
    expect(source).toContain('"range-loop": "Set the active edit range to the current loop."');
  });

  it("documents Pocket DAW functions for human and AI helpers", () => {
    const doc = readFileSync("docs/POCKET_DAW_FUNCTION_REFERENCE.md", "utf8");
    const catalog = readFileSync("docs/POCKET_DAW_ACTION_CATALOG.md", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(doc).toContain("# Pocket DAW Function Reference");
    expect(doc).toContain("AI counterpart notes");
    expect(doc).toContain("docs/POCKET_DAW_ACTION_CATALOG.md");
    expect(doc).toContain("| Action Catalog |");
    expect(doc).toContain("| Export Profile Controls |");
    expect(doc).toContain("| Cut / Copy / Paste / Duplicate |");
    expect(doc).toContain("Copy/Cut Range");
    expect(doc).toContain("| Godot Game Pack |");
    expect(doc).toContain("| Music Focus |");
    expect(doc).toContain("Keeps the timeline primary");
    expect(doc).toContain("opens Export Details");
    expect(doc).toContain("note-length quantize snaps durations");
    expect(doc).toContain("| Studio Rail |");
    expect(doc).toContain("| Folder Tracks |");
    expect(doc).toContain("| Track Source Editor |");
    expect(doc).toContain("| Live MCP Recording Input Channel |");
    expect(doc).toContain("| Live MCP Edit Range |");
    expect(doc).toContain("| Live MCP Audio Clip Actions |");
    expect(doc).toContain("| Live MCP Arm And Monitor |");
    expect(doc).toContain("| Live MCP Track Input |");
    expect(doc).toContain("| Live MCP Track Setup Status |");
    expect(doc).toContain("| Live MCP Media And Takes |");
    expect(doc).toContain("| Live MCP Export Readiness |");
    expect(doc).toContain("Clip mix controls affect the selected timeline clip; Track source editor controls affect the generated source section.");
    expect(doc).toContain("Current Non-Claims");
    expect(catalog).toContain("# Pocket DAW Action Catalog");
    expect(catalog).toContain("| Studio Rail Navigation | `studio-rail / data-studio-rail-target`");
    expect(catalog).toContain("| Studio Rail Clips | `data-action=studio-focus-timeline`");
    expect(catalog).toContain("| Studio Rail Godot | `data-action=studio-focus-godot`");
    expect(catalog).toContain("tucking deeper edit, mix, media and game-export surfaces");
    expect(catalog).toContain("keeps timeline/game cues prominent");
    expect(catalog).toContain("| Add Folder Track | `data-add-track-kind:folder`");
    expect(catalog).toContain("| Assign Track Folder | `data-track-folder`");
    expect(catalog).toContain("| Toggle Folder Track | `data-folder-toggle`");
    expect(catalog).toContain("| Collect Media | `data-action=collect-media`");
    expect(catalog).toContain("| Map Drums | `data-action=convert-midi-drums`");
    expect(catalog).toContain("| Map Arrangement | `data-action=convert-midi-arrangement`");
    expect(catalog).toContain("| Quantize Note Lengths | `data-midi-duration-quantize`");
    expect(catalog).toContain("| Quantize Warp Markers | `data-audio-clip-action:quantize-warp-markers-1/4, quantize-warp-markers-1/8, quantize-warp-markers-1/16, quantize-warp-markers-1/32`");
    expect(catalog).toContain("| Apply Warp Rate | `data-audio-clip-action:apply-warp-varispeed`");
    expect(catalog).toContain("| Download And Install Update | `data-action=updater-download-install`");
    expect(catalog).toContain("| Enable Live App Bridge | `data-ai-bridge-enabled`");
    expect(catalog).toContain("| Take Lane Activate | `data-audio-take-lane-activate`");
    expect(catalog).toContain("| Take Lane Overview | `data-audio-take-lane-summary`");
    expect(catalog).toContain("| File MCP Recording Latency Offset | `set_recording_latency_offset`");
    expect(catalog).toContain("| Live MCP Recording Latency Offset | `pocket_daw_live_apply_commands:set_recording_latency_offset`");
    expect(catalog).toContain("| Live MCP Recording Input Channel | `pocket_daw_live_apply_commands:set_recording_input_channel`");
    expect(catalog).toContain("| File MCP Take Lane Activation | `activate_audio_take_lane, set_audio_take_archived, comp_audio_take_from_bar, comp_audio_take_range, pocket_daw_live_apply_commands:activate_audio_take_lane, set_audio_take_archived, comp_audio_take_from_bar, comp_audio_take_range`");
    expect(catalog).toContain("| MCP Punch Recording Placement | `place_punch_recording_clip`, `place_punch_recording_clip_from_range`, `pocket_daw_live_apply_commands:place_punch_recording_clip_from_range`");
    expect(catalog).toContain("| Live MCP Edit Range | `pocket_daw_live_apply_commands:set_timeline_selection, set_timeline_selection_to_clip, clear_timeline_selection, split_timeline_selection, crop_clip_to_timeline_selection, delete_clip_range, ripple_delete_clip_range, ripple_delete_timeline_selection`");
    expect(catalog).toContain("| Live MCP Audio Clip Actions | `pocket_daw_live_apply_commands:apply_audio_clip_action`");
    expect(catalog).toContain("| Live MCP Arm And Monitor | `pocket_daw_live_apply_commands:set_track_armed, set_track_monitor`");
    expect(catalog).toContain("| Live MCP Track Input | `pocket_daw_live_apply_commands:set_track_input`");
    expect(catalog).toContain("| Live MCP Track Setup Status | `pocket_daw_live_status:tracks`");
    expect(catalog).toContain("| Live MCP Media And Takes | `pocket_daw_live_status:media`");
    expect(catalog).toContain("| Live MCP Export Readiness | `pocket_daw_live_status:export`");
    expect(catalog).toContain("| Rename Marker | `data-marker-rename`");
    expect(catalog).toContain("| Track Input | `data-track-input`");
    expect(catalog).toContain("| Recording Latency Offset | `data-track-recording-latency`");
    expect(catalog).toContain("| Melody Track Settings | `data-melody-instrument / data-melody-octave / data-melody-pan / data-melody-mute / data-melody-solo`");
    expect(catalog).toContain("| Bass Steps, Holds, Slides, Accents | `data-bass-step / data-bass-accent / selected bass step + H/S/T` | H hold / S slide / T tuplet");
    expect(catalog).toContain("| Enable Automation Lane | `data-automation-enabled`");
    expect(catalog).toContain("| Range Loop | `data-action=range-loop` |  | Sets the active edit range to the current playback loop boundaries.");
    expect(catalog).not.toContain("Sets the playback loop to the active edit range.");
    expect(catalog).not.toContain("data-bass-hold / data-bass-slide");
    expect(catalog).toContain("| Export Profile Controls | `data-export-profile-setting`");
    expect(catalog).toContain("| Future Codec Buttons | `data-action=export-full-flac`");
    expect(catalog).toContain("FUNCTION_ACTION_REFERENCE");
    expect(readme).toContain("docs/POCKET_DAW_FUNCTION_REFERENCE.md");
    expect(readme).toContain("docs/POCKET_DAW_ACTION_CATALOG.md");
  });

  it("renders editable Pocket Pro EQ controls for selected track FX", () => {
    const project = addFxSlot(createEmptyPocketDawProject(), "master", "parametric-eq");
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedTrackId = "master";

    const html = inspectorHtml(renderAppShell(state));

    expect(html).toContain("Pocket Pro EQ");
    expect(html).toContain('data-fx-eq-preset="fx_master:');
    expect(html).toContain("Soft Chord Bed");
    expect(html).toContain("High Pass");
    expect(html).toContain("Low Mid");
    expect(html).toContain('data-fx-param="fx_master:');
    expect(html).toContain(":highMidGain");
    expect(html).toContain(":lpFrequency");
  });

  it("shows selected track FX directly on mixer strips", () => {
    const project = addFxSlot(createEmptyPocketDawProject(), "bass", "delay");
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedTrackId = "bass";

    const html = renderAppShell(state);

    expect(html).toContain('class="strip-fx-list"');
    expect(html).toContain('data-fx-toggle="fx_bass:');
    expect(html).toContain(">Delay<");
    expect(html).toContain("No FX");
  });

  it("renders selected track send controls for return tracks", () => {
    const withReturn = addReturnTrack(createEmptyPocketDawProject(), "Verb Return");
    const sent = setTrackSendLevel(withReturn.project, "bass", withReturn.trackId, 0.35);
    const project = ensureTrackSendAutomationLane(sent, "bass", withReturn.trackId, "level").project;
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedClipId = null;
    state.selectedTrackId = "bass";

    const html = inspectorHtml(renderAppShell(state));

    expect(html).toContain("Sends");
    expect(html).toContain("Verb Return");
    expect(html).toContain(`data-track-send-level="bass:${withReturn.trackId}"`);
    expect(html).toContain(`data-send-automation-add-point="bass:${withReturn.trackId}:level"`);
    expect(html).toContain('value="0.35"');
    expect(html).toContain("35%");
  });

  it("keeps sends honest when no return track exists", () => {
    const project = createEmptyPocketDawProject();
    project.tracks = project.tracks.filter((track) => track.trackType !== "return");
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedClipId = null;
    state.selectedTrackId = "bass";

    const html = inspectorHtml(renderAppShell(state));

    expect(html).toContain("Add a return track to use sends.");
    expect(html).not.toContain("data-track-send-level=");
  });

  it("keeps long transport feedback in a dedicated status region", () => {
    const state = createInitialState();
    state.status = "Monitoring Live Vocals input via Speakers while the transport controls remain usable.";

    const html = renderAppShell(state);

    expect(html).toContain('data-transport-status="true" role="status" aria-live="polite"');
    expect(html).toContain('title="Monitoring Live Vocals input via Speakers while the transport controls remain usable."');
  });

  it("starts inline sequencer boxes at the bar edge without lane-label offsets", () => {
    const html = renderAppShell(createInitialState());
    const inline = html.match(/<div class="inline-sequencer inline-drums[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || "";

    expect(inline).toContain("left:calc(var(--track-header) + (0 * var(--bar)))");
    expect(inline).toContain("--inline-steps:64");
    expect(inline).toContain("grid-template-columns:repeat(64, minmax(0, 1fr))");
    expect(inline).toContain('aria-label="Kick"');
    expect(inline).not.toContain(">K<");
    expect(inline).not.toContain(">S<");
    expect(html).toContain("Full kit lanes");
    expect(html).toContain("Bass steps");
  });

  it("uses the generated inline sequencer as the visible clip surface for bass rows", () => {
    const html = renderAppShell(createInitialState());
    const bassRow = timelineRowHtml(html, "bass");

    expect(bassRow).toContain('data-inline-sequencer-role="bass"');
    expect(bassRow).toContain('data-clip-id="clip_');
    expect(bassRow).toContain('aria-label="Bass steps"');
    expect(bassRow).toContain('data-bass-step="A:');
    expect(bassRow).not.toContain('<button class="clip ');
  });

  it("keeps the selected generated instrument focused in the inspector", () => {
    const state = createInitialState();
    state.selectedTrackId = "bass";

    const html = renderAppShell(state);
    const inspector = inspectorHtml(html);

    expect(html).toContain('data-inline-sequencer-role="drums"');
    expect(html).toContain('data-inline-sequencer-role="bass"');
    expect(inspector).toContain("data-bass-step");
    expect(inspector).toContain("Select then press H, S or T.");
    expect(inspector).not.toContain("data-drum-step");
    expect(inspector).not.toContain("data-melody-step");
    expect(inspector).not.toContain("data-guitar-step");
    expect(inspector).not.toContain("data-section-chord");
  });

  it("renders selected clip inspector actions as working controls", () => {
    const state = createInitialState();
    const clip = state.undoStack.present.timeline.clips[0];
    state.selectedClipId = clip.id;
    state.selectedTrackId = "bass";

    const inspector = inspectorHtml(renderAppShell(state));

    expect(inspector).toContain(`data-clip-transform="${clip.id}:transpose"`);
    expect(inspector).toContain(`data-clip-transform="${clip.id}:gain"`);
    expect(inspector).toContain('aria-label="Generated clip stem mutes"');
    expect(inspector).toContain("Section stem mutes");
    expect(inspector).toContain("Checked roles are muted only for this generated clip.");
    expect(inspector).toContain(`data-clip-stem-mute="${clip.id}:drums"`);
    expect(inspector).toContain(`data-clip-stem-mute="${clip.id}:bass"`);
    expect(inspector).toContain(`data-clip-stem-mute="${clip.id}:chords"`);
    expect(inspector).toContain(`data-clip-stem-mute="${clip.id}:melody"`);
    expect(inspector).toContain(`data-clip-stem-mute="${clip.id}:guitar"`);
    expect(inspector).toContain("Mute Drums");
    expect(inspector).toContain('title="Cut the selected clip to the clipboard"');
    expect(inspector).toContain('title="Copy the selected clip to the clipboard"');
    expect(inspector).toContain('aria-label="Selected clip edit actions"');
    expect(inspector).toContain("These edit the selected clip or the active edit range and can be undone.");
    expect(inspector).toContain('data-action="clip-cut"');
    expect(inspector).toContain('data-action="clip-copy"');
    expect(inspector).toContain('data-action="clip-paste"');
    expect(inspector).toContain('data-action="clip-duplicate"');
    expect(inspector).toContain('data-action="clip-split"');
    expect(inspector).toContain('data-action="range-copy"');
    expect(inspector).toContain('data-action="range-cut"');
    expect(inspector).toContain('data-action="trim-start-left"');
    expect(inspector).toContain('data-action="trim-start-right"');
    expect(inspector).toContain('data-action="trim-end-left"');
    expect(inspector).toContain('data-action="trim-end-right"');
    expect(inspector).toContain('data-action="clip-mute"');
    expect(inspector).toContain('data-action="clip-delete"');
    expect(inspector).toContain('data-action="freeze-selected-clip"');
    expect(inspector).toContain('data-action="export-selected-clip-midi"');
    expect(inspector).toContain('data-action="export-selected-track-midi"');
    expect(inspector).not.toContain("<button disabled>Freeze</button>");
    expect(inspector).not.toContain("<button disabled>Convert to MIDI</button>");
  });

  it("renders audio clip inspector controls for non-destructive gain, fades, source offset and warp markers", () => {
    const state = createInitialState();
    const imported = addImportedAudioMedia(state.undoStack.present, {
      name: "Voice.wav",
      uri: "C:\\Audio\\Voice.wav",
      mimeType: "audio/wav",
      durationSeconds: 10,
      sampleRate: 48000,
      channels: 1
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;

    const inspector = inspectorHtml(renderAppShell(state));

    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:gain"`);
    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:fadeInSeconds"`);
    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:fadeOutSeconds"`);
    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:sourceOffsetSeconds"`);
    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:durationSeconds"`);
    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:playbackRate"`);
    expect(inspector).toContain(`data-audio-clip-property="${placed.clipId}:pitchSemitones"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:quick-fade"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:reset-fades"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:normalize-gain"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:analyze-transients"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:create-warp-markers"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:quantize-warp-markers-1/4"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:quantize-warp-markers-1/8"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:quantize-warp-markers-1/16"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:quantize-warp-markers-1/32"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:apply-warp-varispeed"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:clear-warp-markers"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:crossfade-overlap"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:create-crossfade-left"`);
    expect(inspector).toContain(`data-audio-clip-action="${placed.clipId}:invert-phase"`);
    expect(inspector).toContain(`data-clip-automation-create="${placed.clipId}:gain"`);
    expect(inspector).toContain(`data-clip-automation-create="${placed.clipId}:fadeInSeconds"`);
    expect(inspector).toContain(`data-clip-automation-create="${placed.clipId}:fadeOutSeconds"`);
    expect(inspector).toContain(`data-clip-automation-create="${placed.clipId}:sourceOffsetSeconds"`);
    expect(inspector).toContain("Create fade in automation for this audio clip");
    expect(inspector).toContain("Create source offset automation for this audio clip");
    expect(inspector).toContain("Source offset");
    expect(inspector).toContain("Duration");
  });

  it("renders same-track audio take lane activation controls", () => {
    const state = createInitialState();
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "Lead take 1.wav",
      uri: "project-media/recordings/lead-take-1.wav",
      mimeType: "audio/wav",
      durationSeconds: 16,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lead-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 2);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "Lead take 2.wav",
      uri: "project-media/recordings/lead-take-2.wav",
      mimeType: "audio/wav",
      durationSeconds: 16,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "lead-comp-a", inputMode: "mono", channelMap: [0] }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 2);
    state.undoStack = createUndoStack(secondPlaced.project);
    state.selectedClipId = secondPlaced.clipId;
    state.selectedTrackId = secondPlaced.trackId;

    const inspector = inspectorHtml(renderAppShell(state));

    expect(inspector).toContain("Take Lanes");
    expect(inspector).toContain("lead-comp-a");
    expect(inspector).toContain("Take lane overview");
    expect(inspector).toContain("Lane 1");
    expect(inspector).toContain("Lane 2");
    expect(inspector).toContain("active / 1 segment / bars Bar 2 Beat 1 to Bar 9 Beat 4");
    expect(inspector).toContain("1 active / 0 muted / 0 archived");
    expect(inspector).toContain('data-audio-take-lane-summary="lead-comp-a-lane-1:active"');
    expect(inspector).toContain('data-audio-take-lane-summary="lead-comp-a-lane-2:active"');
    expect(inspector).toContain(`data-audio-take-activate="${firstPlaced.clipId}"`);
    expect(inspector).toContain(`data-audio-take-activate="${secondPlaced.clipId}"`);
    expect(inspector).toContain(`data-audio-take-lane-activate="${firstPlaced.clipId}"`);
    expect(inspector).toContain(`data-audio-take-lane-activate="${secondPlaced.clipId}"`);
    expect(inspector).toContain(`data-audio-take-archive="${firstPlaced.clipId}"`);
    expect(inspector).toContain(`data-audio-take-archive="${secondPlaced.clipId}"`);
    expect(inspector).toContain('data-audio-take-status="');
    expect(inspector).toContain('data-action="audio-take-comp-from-playhead"');
    expect(inspector).toContain('data-action="audio-take-comp-range"');
    expect(inspector).toContain("Use this take only inside the active edit range");
    expect(inspector).toContain("Take 2 of 2");
    const firstButton = inspector.match(new RegExp(`<button[^>]*data-audio-take-activate="${firstPlaced.clipId}"[^>]*>`))?.[0] || "";
    const selectedButton = inspector.match(new RegExp(`<button[^>]*data-audio-take-activate="${secondPlaced.clipId}"[^>]*>`))?.[0] || "";
    expect(firstButton).not.toContain("disabled");
    expect(selectedButton).toContain("disabled");
  });

  it("renders grouped audio take counts in About diagnostics", () => {
    const state = createInitialState();
    const firstImport = addImportedAudioMedia(state.undoStack.present, {
      name: "About take 1.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "about-takes-a" }
    });
    const firstPlaced = placeAudioClipOnTimeline(firstImport.project, firstImport.item.id, 1);
    const secondImport = addImportedAudioMedia(firstPlaced.project, {
      name: "About take 2.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 1,
      metadata: { takeGroupId: "about-takes-a" }
    });
    const secondPlaced = placeAudioClipOnTrack(secondImport.project, secondImport.item.id, firstPlaced.trackId, 1);
    const secondClip = secondPlaced.project.timeline.clips.find((clip) => clip.id === secondPlaced.clipId)!;
    secondClip.muted = true;
    secondClip.metadata = { ...(secondClip.metadata || {}), takeActive: false, takeStatus: "archived-take" };
    state.undoStack = createUndoStack(secondPlaced.project);
    state.showControls = true;

    const html = renderAppShell(state);

    expect(html).toContain("<strong>Take Lanes</strong>");
    expect(html).toContain("2 grouped clips / 1 groups / 1 active / 1 archived");
  });

  it("shows Chordsmith guitar rhythm presets in the selected track inspector", () => {
    const state = createInitialState();
    state.selectedTrackId = "guitar";

    const html = renderAppShell(state);
    const inspector = inspectorHtml(html);

    expect(inspector).toContain("Guitar Rhythm");
    expect(inspector).toContain('data-guitar-preset-section="A"');
    expect(inspector).toContain("Choose rhythm preset...");
    expect(inspector).toContain('<option value="rock_eighths"');
    expect(inspector).toContain(">Rock 8ths</option>");
    expect(inspector).toContain('<option value="train_chop"');
    expect(inspector).toContain(">Train chop</option>");
    expect(inspector).toContain('<option value="western_waltz"');
    expect(inspector).toContain(">Western waltz</option>");
    expect(inspector).toContain("Current: Metal chug");
    expect(inspector).toContain('data-guitar-step="A:0"');
    expect(inspector).not.toContain("data-drum-preset-section");
  });

  it("shows Chordsmith chord sound choices when the chord track is selected", () => {
    const state = createInitialState();
    state.selectedTrackId = "chords";

    const html = renderAppShell(state);
    const inspector = inspectorHtml(html);

    expect(inspector).toContain("Chord sound");
    expect(inspector).toContain('data-chord-instrument="true"');
    expect(inspector).toContain('<option value="pocket" >Pocket</option>');
    expect(inspector).toContain('<option value="warm_pad" selected>Warm Pad</option>');
    expect(inspector).toContain('<option value="dusty_rhodes"');
    expect(inspector).toContain('<option value="chip_square_stack"');
    expect(inspector).toContain('data-section-chord="A:0"');
    expect(inspector).not.toContain('data-melody-instrument=');
  });

  it("does not render an FX Return pan control", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain('data-volume="fx-return"');
    expect(html).not.toContain('data-pan="fx-return"');
  });

  it("marks track volume and pan sliders as live mixer controls", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain('data-volume="bass" data-mixer-control="volume" data-mixer-live="true"');
    expect(html).toContain('data-pan="bass" data-mixer-control="pan" data-mixer-live="true"');
    expect(html).toContain('aria-valuetext="86%"');
    expect(html).toContain('aria-valuetext="C"');
  });

  it("renders mixer mute and solo as explicit button controls", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain('type="button" title="Mute Chords" class="" data-mute-track="chords"');
    expect(html).toContain('type="button" title="Solo Chords" class="" data-solo-track="chords"');
    expect(html).not.toContain('data-mute-track="fx-return"');
    expect(html).not.toContain('data-solo-track="master"');
  });

  it("renders live track input controls compactly and keeps recording previews non-seekable", () => {
    const state = createInitialState();
    const withLiveTrack = addTrackToProject(state.undoStack.present, "live-vocals");
    const liveTrack = withLiveTrack.project.tracks.find((track) => track.id === withLiveTrack.trackId)!;
    withLiveTrack.project.audioDeviceSettings.devices = [{
      id: "interface-4",
      name: "Four Channel Interface",
      kind: "input",
      supportedChannels: [1, 2, 4]
    }];
    liveTrack.inputDeviceId = "interface-4";
    state.undoStack = createUndoStack(withLiveTrack.project);
    state.selectedTrackId = withLiveTrack.trackId;
    state.recording = {
      status: "recording",
      trackId: withLiveTrack.trackId,
      startedAt: "2026-06-14T11:03:00.000Z",
      startBar: 5,
      elapsedSeconds: 2,
      inputPeak: 0.5,
      inputDeviceName: "Default input",
      outputDeviceName: "Main output",
      monitoring: true,
      livePeaks: [0.25, 0.5],
      message: "Recording Live Vocals; monitor on."
    };

    const html = renderAppShell(state);

    expect(liveTrack.name).toBe("Live Vocals");
    expect(html).toContain('class="strip record-capable');
    expect(html).toContain('class="strip-control strip-input"');
    expect(html).toContain('title="Default input">Default</strong>');
    expect(html).toContain(`data-track-input="${withLiveTrack.trackId}"`);
    expect(html).toContain(`data-track-record-channel-mode="${withLiveTrack.trackId}"`);
    expect(html).toContain('option value="mono" selected>Mono</option>');
    expect(html).toContain(`data-track-record-channel="${withLiveTrack.trackId}"`);
    expect(html).toContain('option value="mono:0" selected>Mono Ch 1</option>');
    expect(html).toContain('option value="mono:3" >Mono Ch 4</option>');
    expect(html).toContain('option value="stereo:0:1" >Stereo Ch 1-2</option>');
    expect(html).toContain('option value="stereo:2:3" >Stereo Ch 3-4</option>');
    expect(html).toContain('Current native recording supports Mono Ch 1 or Stereo Ch 1-2 only; other choices are preflighted and blocked until channel routing lands.');
    expect(html).toContain(`data-track-recording-latency="${withLiveTrack.trackId}"`);
    expect(html).toContain('title="Positive values place new recordings earlier; negative values place them later. Raw recorded media is not changed."');
    expect(html).toContain("Manual take placement offset.");
    expect(html).toContain(`data-input-activity-fill="${withLiveTrack.trackId}"`);
    expect(html).toContain('data-recording-preview="true" data-timeline-non-seek="true"');
  });

  it("shows armed input preview level before recording starts", () => {
    const state = createInitialState();
    const withLiveTrack = addTrackToProject(state.undoStack.present, "live-vocals");
    const liveTrack = withLiveTrack.project.tracks.find((track) => track.id === withLiveTrack.trackId)!;
    liveTrack.armed = true;
    liveTrack.monitorEnabled = true;
    state.undoStack = createUndoStack(withLiveTrack.project);
    state.recording = {
      status: "idle",
      trackId: withLiveTrack.trackId,
      startedAt: null,
      startBar: null,
      elapsedSeconds: 0,
      inputPeak: 0.42,
      inputDeviceName: "Default input",
      outputDeviceName: "Main output",
      monitoring: true,
      livePeaks: [0.42],
      message: "Monitoring Live Vocals input."
    };

    const html = renderAppShell(state);

    expect(html).toContain('title="Default input">Default</strong>');
    expect(html).toContain(`data-meter-fill="${withLiveTrack.trackId}" style="height:42%"`);
    expect(html).toContain(`data-input-activity-fill="${withLiveTrack.trackId}" style="width:42%"`);
    expect(html).toContain('title="Monitor Live Vocals input while armed or recording"');
  });

  it("renders desktop menu actions through the shared action attributes", () => {
    const html = renderAppShell(createInitialState());

    [
      "new-project",
      "open-project",
      "save-project",
      "save-project-as",
      "file-window-open",
      "clip-cut",
      "clip-copy",
      "clip-paste",
      "clip-duplicate",
      "clip-split",
      "clip-delete",
      "range-copy",
      "range-cut",
      "loop-selected",
      "loop-clear",
      "marker-add",
      "media-pool-focus",
      "toggle-loop",
      "export-diagnostics"
    ].forEach((action) => {
      expect(html).toContain(`data-action="${action}"`);
    });
    expect(html).toContain('id="snapMode"');
  });

  it("moves imports and exports into the File window", () => {
    const state = createInitialState();
    state.showFilePanel = true;

    const html = renderAppShell(state);

    expect(html).toContain('class="controls-panel file-panel"');
    expect(html).toContain('id="file-window-title"');
    expect(html).toContain('id="importText"');
    [
      "load-demo",
      "reset-demo-template",
      "import-text",
      "open-file",
      "import-audio",
      "import-midi",
      "export-wav",
      "export-midi",
      "export-stems",
      "export-section-manifest",
      "export-godot-manifest",
      "export-web-game-manifest",
      "export-media-plan",
      "collect-media",
      "build-native-cache"
    ].forEach((action) => {
      expect(html).toContain(`data-action="${action}"`);
    });
  });

  it("renders preserved Pocket DJ metadata in the File import window", () => {
    const state = createInitialState();
    const session = createPocketDjImportFixture();
    state.undoStack = createUndoStack(importTextToProject(`PDJ1:${utf8ToBase64Url(JSON.stringify(session))}`).project);
    state.showFilePanel = true;

    const html = renderAppShell(state);

    expect(html).toContain("Pocket DJ metadata preserved");
    expect(html).toContain("Late Night Deck / PDJ1 v1 / Current B / Queued D / Launch bar / Hold on / Sequence playing / Build active");
    expect(html).toContain("Sequence: A -&gt; B -&gt; D / repeat / drop D");
    expect(html).toContain("Mixer: master 72% / 1 muted stem / drums 42%, bass 80%");
    expect(html).toContain("DJ state is preserved for future handoff/export and is not silently applied to the DAW mix.");
  });

  it("describes demo loading as an editable copy with an explicit template reload", () => {
    const state = createInitialState();
    state.showControls = true;

    const html = renderAppShell(state);

    expect(html).toContain("Load Demo Copy");
    expect(html).toContain("Reload Demo Template");
    expect(html).toContain("Editable demo copy");
    expect(html).toContain("Load Demo Copy creates an editable autosaved copy.");
    expect(html).toContain("Reload Demo Template discards copy edits");
  });

  it("renders first-run installed-app actions for demo, Chordsmith import and project open", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain('class="quick-start"');
    expect(html).toContain("Demo is ready");
    expect(html).toContain('data-action="load-demo"');
    expect(html).toContain('data-action="import-focus"');
    expect(html).toContain('data-action="open-project"');
    expect(html).toContain("Open .pocketdaw");
  });

  it("renders the shell as explicit non-overlapping layout zones", () => {
    const html = renderAppShell(createInitialState());
    const zones = [...html.matchAll(/data-layout-zone="([^"]+)"/g)].map((match) => match[1]);

    expect(html).toContain('data-layout-shell="true"');
    expect(zones).toEqual(["menu", "studio-rail", "transport", "quickstart", "studio", "mixer", "media"]);
    expect(html.indexOf('class="mixer lower-dock"')).toBeLessThan(html.indexOf('class="media-pool"'));
    expect(html).not.toContain('class="export-panel"');
    expect(html).not.toContain('class="import-panel"');
  });

  it("renders the lower dock with mixer, sends and automation tabs", () => {
    const html = lowerDockHtml(renderAppShell(createInitialState()));

    expect(html).toContain('data-lower-dock="mixer"');
    expect(html).toContain('data-action="lower-dock-mixer"');
    expect(html).toContain('data-action="lower-dock-inserts"');
    expect(html).toContain('data-action="lower-dock-sends"');
    expect(html).toContain('data-action="lower-dock-automation"');
    expect(html).toContain('data-action="lower-dock-piano-roll"');
    expect(html).toContain('data-action="lower-dock-audio-editor"');
    expect(html).toContain('data-action="lower-dock-export-details"');
    expect(html).toContain('class="lower-dock-body mixer-strips"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders selected-track inserts in the lower dock inserts tab", () => {
    const project = addFxSlot(createEmptyPocketDawProject(), "bass", "delay");
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedTrackId = "bass";
    state.lowerDockTab = "inserts";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain('data-lower-dock="inserts"');
    expect(html).toContain("Bass FX chain");
    expect(html).toContain('data-add-fx="bass"');
    expect(html).toContain('class="fx-inspector"');
    expect(html).toContain(">Delay<");
    expect(html).toContain("FX parameter automation");
    expect(html).toContain("data-fx-automation-create=\"fx_bass:");
    expect(html).toContain(":mix\"");
  });

  it("renders selected-track sends in the lower dock sends tab", () => {
    const withReturn = addReturnTrack(createEmptyPocketDawProject(), "Verb Return");
    const project = setTrackSendLevel(withReturn.project, "bass", withReturn.trackId, 0.35);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedTrackId = "bass";
    state.lowerDockTab = "sends";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain('data-lower-dock="sends"');
    expect(html).toContain("Bass return routing");
    expect(html).toContain("Verb Return");
    expect(html).toContain(`data-track-send-level="bass:${withReturn.trackId}"`);
    expect(html).toContain(`data-track-send-mode="bass:${withReturn.trackId}"`);
    expect(html).toContain("Post-fader");
    expect(html).toContain("Pre-fader");
  });

  it("renders selected-track automation in the lower dock automation tab", () => {
    const laneResult = createAutomationLane(createEmptyPocketDawProject(), "tracks.bass.volume", {
      points: [
        { bar: 1, value: 0.75, curve: "hold" },
        { bar: 5, value: 1, curve: "ease-in" }
      ]
    });
    const state = createInitialState();
    laneResult.project.project.meterMap = [
      { id: "meter_1", bar: 1, numerator: 4, denominator: 4, source: "midi-import", sourceTick: 0 },
      { id: "meter_2", bar: 5.25, numerator: 7, denominator: 8, source: "midi-import", sourceTick: 3840 }
    ];
    state.undoStack = createUndoStack(laneResult.project);
    state.selectedTrackId = "bass";
    state.lowerDockTab = "automation";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain('data-lower-dock="automation"');
    expect(html).toContain("Project Automation");
    expect(html).toContain('data-project-automation-create="tempo"');
    expect(html).toContain("Bass track automation");
    expect(html).toContain('data-automation-add-point="bass:volume"');
    expect(html).toContain('data-automation-create="bass:pan"');
    expect(html).toContain(`data-automation-point-curve="${laneResult.laneId}:0"`);
    expect(html).toContain('<option value="hold" selected>Hold</option>');
    expect(html).toContain('<option value="ease-in" selected>Ease in</option>');
    expect(html).toContain(`data-automation-lane-surface="${laneResult.laneId}"`);
    expect(html).toContain('data-automation-lane-min="0"');
    expect(html).toContain('data-automation-lane-max="1.2"');
    expect(html).toContain("automation-curve-line");
    expect(html).toContain("Meter Map");
    expect(html).toContain('data-project-meter-map-add="true"');
    expect(html).toContain('data-project-meter-map-point="meter_2"');
    expect(html).toContain('data-project-meter-map-field="meter_2:bar"');
    expect(html).toContain('data-project-meter-map-field="meter_2:numerator"');
    expect(html).toContain('data-project-meter-map-field="meter_2:denominator"');
    expect(html).toContain('data-project-meter-map-delete="meter_2"');
    expect(html).toContain("7/8");
    expect(html).toContain("tick 3840");
  });

  it("renders the selected MIDI clip in the lower dock piano-roll tab", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Lower Dock MIDI" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "lead.mid");
    const state = createInitialState();
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.lowerDockTab = "piano-roll";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain('data-lower-dock="piano-roll"');
    expect(html).toContain("Selected MIDI clip editing");
    expect(html).toContain(`data-midi-note-add="${imported.clipId}"`);
    expect(html).toContain(`data-midi-quantize="${imported.clipId}:1/16"`);
  });

  it("renders the selected audio clip in the lower dock audio-editor tab", () => {
    const imported = addImportedAudioMedia(createEmptyPocketDawProject(), {
      name: "Dock Audio.wav",
      durationSeconds: 6,
      sampleRate: 44100,
      channels: 2
    });
    const placed = placeAudioClipOnTimeline(imported.project, imported.item.id, 2);
    const clip = placed.project.timeline.clips.find((item) => item.id === placed.clipId)!;
    clip.metadata = {
      ...(clip.metadata || {}),
      audioWarpMarkers: [{ id: "warp_1", sourceSeconds: 1.5, targetBar: 2.75, targetSeconds: 3.5, source: "transient", locked: true }],
      audioWarpMarkerCount: 1,
      audioWarpPlaybackMode: "metadata-only"
    };
    const state = createInitialState();
    state.undoStack = createUndoStack(placed.project);
    state.selectedClipId = placed.clipId;
    state.selectedTrackId = placed.trackId;
    state.lowerDockTab = "audio-editor";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain('data-lower-dock="audio-editor"');
    expect(html).toContain("Selected audio clip editing");
    expect(html).toContain(`data-audio-clip-property="${placed.clipId}:gain"`);
    expect(html).toContain(`data-clip-automation-create="${placed.clipId}:gain"`);
    expect(html).toContain(`data-audio-clip-action="${placed.clipId}:reverse"`);
    expect(html).toContain(`data-audio-clip-action="${placed.clipId}:create-warp-markers"`);
    expect(html).toContain("Warp: 1 marker / metadata-only");
    expect(html).toContain(`data-audio-warp-marker-target="${placed.clipId}:warp_1"`);
    expect(html).toContain(`data-audio-warp-marker-delete="${placed.clipId}:warp_1"`);
    expect(html).toContain("1.50");
    expect(html).toContain("Move this warp marker target bar without changing its source audio anchor.");
  });

  it("renders export details in the lower dock export tab", () => {
    const state = createInitialState();
    const ret = addReturnTrack(state.undoStack.present, "Verb Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.25);
    state.undoStack = createUndoStack(setTrackSendMode(sent, "bass", ret.trackId, "pre-fader"));
    state.lowerDockTab = "export-details";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain('data-lower-dock="export-details"');
    expect(html).toContain("Full mix, stems, loops and game packs");
    expect(html).toContain("Export Details");
    expect(html).toContain("pre)</dd>");
    expect(html).toContain("Media Portability");
    expect(html).toContain("Game Delivery");
    expect(html).toContain("Push Godot Pack");
    expect(html).toContain("local-loopback-with-zip-fallback");
    expect(html).toContain("npm run verify:game-pack -- &lt;zip&gt; --kind godot-adaptive-pack");
    expect(html).toContain("Web Game Pack ZIP");
    expect(html).toContain("npm run verify:game-pack -- &lt;zip&gt; --kind web-game-pack");
    expect(html).toContain("Target smoke: manual-required-before-release-claim");
    expect(html).toContain("Manual target web-game smoke is required before release claims.");
    expect(html).toContain("Embedded source project is portable.");
    expect(html).toContain("Embedded source project is share-safe.");
    expect(html).not.toContain("current render graphs are post-fader only");
    expect(html).toContain('data-export-profile="full-song-wav"');
    expect(html).toContain('data-export-profile-setting="full-song-wav:sampleRate"');
    expect(html).toContain('data-export-profile-setting="full-song-wav:tailSeconds"');
    expect(html).toContain('data-export-profile-setting="full-song-wav:bitDepth"');
    expect(html).toContain('data-export-profile-setting="full-song-wav:channelMode"');
    expect(html).toContain('data-export-profile-setting="full-song-wav:normalize"');
    expect(html).toContain('data-export-profile-setting="full-song-wav:dither"');
    expect(html).toContain('data-export-profile="stem-wavs"');
    expect(html).toContain('data-export-profile-setting="stem-wavs:sampleRate"');
    expect(html).toContain('data-export-profile-setting="stem-wavs:bitDepth"');
    expect(html).toContain('data-export-profile-setting="stem-wavs:channelMode"');
    expect(html).toContain('data-export-profile-setting="stem-wavs:normalize"');
    expect(html).toContain('data-export-profile-setting="stem-wavs:dither"');
    expect(html).toContain('data-export-profile="section-loops"');
    expect(html).toContain('data-export-profile-setting="section-loops:sampleRate"');
    expect(html).toContain('data-export-profile-setting="section-loops:bitDepth"');
    expect(html).toContain('data-export-profile-setting="section-loops:channelMode"');
    expect(html).toContain('data-export-profile-setting="section-loops:normalize"');
    expect(html).toContain('data-export-profile-setting="section-loops:dither"');
    expect(html).toContain('<option value="mono"');
    expect(html).toContain("16-bit PCM");
    expect(html).toContain("24-bit PCM");
    expect(html).toContain("32-bit float");
    expect(html).toContain("TPDF");
    expect(html).toContain('data-action="export-wav"');
    expect(html).toContain('data-action="export-godot-manifest"');
    expect(html).toContain('data-action="push-godot-pack"');
  });

  it("renders export media portability counts without leaking local source paths", () => {
    const external = createMediaPoolItem({
      kind: "audio",
      name: "Lead Vocal.wav",
      uri: "C:\\Sessions\\Lead Vocal.wav",
      metadata: { external: true }
    });
    const runtimeOnly = createMediaPoolItem({
      kind: "audio",
      name: "Browser Take.wav",
      metadata: { runtimeOnly: true }
    }, [external]);
    const missing = createMediaPoolItem({
      kind: "audio",
      name: "Missing.wav",
      uri: "file:///lost/Missing.wav",
      metadata: { missing: true, unresolved: true }
    }, [external, runtimeOnly]);
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected Loop.wav",
      uri: "project-media/Collected Loop.wav",
      metadata: {
        mediaRefKind: "project",
        projectRelativePath: "project-media/Collected Loop.wav"
      }
    }, [external, runtimeOnly, missing]);
    let project = createEmptyPocketDawProject();
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), runtimeOnly), missing), collected);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.lowerDockTab = "export-details";

    const html = lowerDockHtml(renderAppShell(state));

    expect(html).toContain("Media Portability");
    expect(html).toContain("3 media items need collection or relink before the embedded source project is portable.");
    expect(html).toContain("<dt>Project media</dt><dd>1</dd>");
    expect(html).toContain("<dt>Copyable external</dt><dd>1</dd>");
    expect(html).toContain("<dt>Cache-only</dt><dd>0</dd>");
    expect(html).toContain("<dt>Runtime-only</dt><dd>1</dd>");
    expect(html).toContain("<dt>Missing</dt><dd>1</dd>");
    expect(html).toContain("<dt>Blocked</dt><dd>2</dd>");
    expect(html).toContain("<dt>Shared source refs</dt><dd>2</dd>");
    expect(html).toContain("2 local reference fields remain in the embedded source project.");
    expect(html).not.toContain("C:\\Sessions");
    expect(html).not.toContain("file:///lost");
  });

  it("renders drum branch controls with branch solo enabled", () => {
    const state = createInitialState();
    state.selectedTrackId = "drums";
    state.undoStack = createUndoStack(branchGeneratedDrumsToTracks(state.undoStack.present));

    const html = renderAppShell(state);

    expect(html).toContain('data-action="branch-generated-drums"');
    expect(html).toContain('data-action="collapse-generated-drum-branches"');
    expect(html).toContain('data-drum-branch-entry="track"');
    expect(html).toContain('data-drum-branch-entry="inline"');
    expect(html).toContain("Double-click or right-click empty space to branch generated drums.");
    expect(html).toContain("Drum branch: Kick");
    expect(html).toContain('data-branch-group="drums" data-drum-branch-lane="kick"');
    expect(html).toContain('data-branch-group="drums" data-drum-branch-lane="openhat"');
    expect(html).toContain('data-track-id="drums-openhat"');
    expect(html).toContain('data-track-id="drums-crash"');
    expect(html).toContain('data-drum-branch-step="A:tomlow:0"');
    expect(html).toContain('data-drum-branch-step="A:crash:0"');
    expect(html).toContain('data-mute-track="drums-kick"');
    expect(html).toContain('data-solo-track="drums-kick"');
    expect(html).toContain('data-mute-track="drums-openhat"');
    expect(html).toContain('data-solo-track="drums-crash"');
  });

  it("hides grouped drum branch rows without deleting branch controls", () => {
    const state = createInitialState();
    state.selectedTrackId = "drums";
    state.undoStack = createUndoStack(setDrumBranchGroupCollapsed(branchGeneratedDrumsToTracks(state.undoStack.present), true));

    const html = renderAppShell(state);

    expect(html).toContain('data-action="toggle-drum-branch-group"');
    expect(html).toContain("Show Branch Rows");
    expect(html).not.toContain('data-row="drums-kick" data-branch-group="drums"');
    expect(html).toContain('data-action="collapse-generated-drum-branches"');
  });

  it("renders stable scroll keys for independently scrolling panes", () => {
    const html = renderAppShell(createInitialState());

    [
      'data-scroll-key="app-shell"',
      'data-scroll-key="timeline-scroll"',
      'data-scroll-key="inspector"',
      'data-scroll-key="mixer"',
      'data-scroll-key="media-pool"'
    ].forEach((scrollKey) => {
      expect(html).toContain(scrollKey);
    });
  });

  it("renders resizable timeline workspace controls", () => {
    const state = createInitialState();
    const html = renderAppShell(state);

    expect(html).toContain("--studio-height:430px");
    expect(html).toContain("--inspector-width:420px");
    expect(html).toContain('data-layout-zone="menu"');
    expect(html).toContain('data-timeline-resize-handle="true"');
    expect(html).toContain('data-inspector-resize-handle="true"');
    expect(html).toContain('data-action="toggle-inspector"');
    expect(html).toContain("Hide Inspector");
    expect(html).toContain('data-clip-drag-handle="clip_001"');
    expect(html).toContain('data-clip-loop-handle="clip_001"');
  });

  it("can render the timeline with the inspector hidden", () => {
    const state = createInitialState();
    state.inspectorVisible = false;
    const html = renderAppShell(state);

    expect(html).toContain('class="studio inspector-hidden"');
    expect(html).toContain("Show Inspector");
    expect(html).not.toContain('data-scroll-key="inspector"');
    expect(html).not.toContain('data-inspector-resize-handle="true"');
  });

  it("renders bar and time labels on the timeline ruler", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain('class="ruler-tick"');
    expect(html).toContain('class="ruler-beat-tick"');
    expect(html).toContain('data-ruler-beat="1:2"');
    expect(html).toContain('data-ruler-meter="1:4/4"');
    expect(html).toContain("<b>1</b><small>0:00</small>");
    expect(html).toContain('title="Bar 1 beat 2 / 4/4 / 0:01"');
    expect(html).toContain("Click to seek by bar or time");
  });

  it("renders tempo-automated time labels on the timeline ruler", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    state.undoStack.present.timeline.bars = 2;
    state.undoStack.present = createAutomationLane(state.undoStack.present, "project.tempo", {
      min: 40,
      max: 240,
      points: [{ bar: 1, value: 60, curve: "hold" }]
    }).project;

    const html = renderAppShell(state);

    expect(html).toContain("<b>2</b><small>0:04</small>");
    expect(html).toContain("<b>3</b><small>0:08</small>");
    expect(html).toContain('data-ruler-beat="2:2"');
    expect(html).toContain('title="Bar 2 beat 2 / 4/4 / 0:05"');
  });

  it("renders meter-map-aware ruler ticks without changing timeline timing labels", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 120;
    state.undoStack.present.project.timeSig = 4;
    state.undoStack.present.timeline.bars = 3;
    state.undoStack.present.project.meterMap = [
      { id: "meter_1", bar: 2, numerator: 7, denominator: 8, source: "midi-import" }
    ];
    state.playheadBar = 2 + 6 / 7;

    const html = renderAppShell(state);
    const transport = html.match(/<div class="transport-readout">[\s\S]*?<\/div>/)?.[0] || "";

    expect(html).toContain('data-ruler-meter="2:7/8"');
    expect(html).toContain('data-ruler-beat="2:7"');
    expect(html).not.toContain('data-ruler-beat="2:8"');
    expect(html).toContain('title="Bar 2 beat 7 / 7/8 / 0:04"');
    expect(transport).toContain('<span data-playhead-readout="true"><strong>Bar 2</strong><small>Beat 7</small></span>');
  });

  it("renders close default zoom and marker rails aligned to bar coordinates", () => {
    const state = createInitialState();
    state.undoStack.present.timeline.markers.push({ id: "combat", bar: 5, name: "Combat", markerType: "game-state", gameState: "combat" });
    const html = renderAppShell(state);

    expect(state.zoom).toBe(240);
    expect(html).toContain("--bar:240px");
    expect(html).toContain("--track-header:176px");
    expect(html).toContain('id="timelineZoom"');
    expect(html).toContain("240 px/bar");
    expect(html).toContain('class="marker-rail"');
    expect(html).toContain("--marker-colour:");
    expect(html).toContain("Combat: Combat");
    expect(html).toContain("timeline-track-header");
    expect(html).toContain('data-track-id="drums"');
  });

  it("renders transport cooking feedback when the app is busy preparing audio", () => {
    const state = createInitialState();
    state.busyMessage = "Cooking timeline audio for native playback...";

    const html = renderAppShell(state);

    expect(html).toContain('class="transport-busy"');
    expect(html).toContain("Cooking timeline audio for native playback...");
  });

  it("renders export progress feedback in the File window", () => {
    const state = createInitialState();
    state.showFilePanel = true;
    state.exportProgress = {
      message: "Rendering WAV mix",
      detail: "Longer songs and imported audio can take a little while"
    };

    const html = renderAppShell(state);

    expect(html).toContain('class="export-progress"');
    expect(html).toContain("Rendering WAV mix");
    expect(html).toContain("Longer songs and imported audio can take a little while");
    expect(html).toContain('aria-live="polite"');
  });

  it("renders MIDI import placement choices in the File window", () => {
    const state = createInitialState();
    state.showFilePanel = true;
    state.midiImportPlacementMode = "per-channel";

    const html = renderAppShell(state);

    expect(html).toContain('id="midiImportPlacementMode"');
    expect(html).toContain('<option value="single-clip" >Single clip</option>');
    expect(html).toContain('<option value="per-source-track" >Source tracks</option>');
    expect(html).toContain('<option value="per-channel" selected>Channels</option>');
    expect(html).toContain('<option value="drum-channel-split" >Drum channel split</option>');
  });

  it("wires MIDI import placement through the app import path", () => {
    const source = readFileSync("src/app/App.ts", "utf8");

    expect(source).toContain("#midiImportPlacementMode");
    expect(source).toContain("this.state.midiImportPlacementMode = midiImportPlacementModeFromValue");
    expect(source).toContain("importMidiFileToProjectWithPlacement");
    expect(source).toContain("placementMode: this.state.midiImportPlacementMode");
  });

  it("wires selected MIDI drum, bass, chord and melody mapping through the app action path", () => {
    const source = readFileSync("src/app/App.ts", "utf8");

    expect(source).toContain('action === "convert-midi-drums"');
    expect(source).toContain("convertMidiDrumsToBranchOverlaysCommand");
    expect(source).toContain('action === "convert-midi-bass"');
    expect(source).toContain("convertMidiBassToGeneratedOverlaysCommand");
    expect(source).toContain('action === "convert-midi-chords"');
    expect(source).toContain("convertMidiChordsToGeneratedOverlaysCommand");
    expect(source).toContain('action === "convert-midi-melody"');
    expect(source).toContain("convertMidiMelodyToGeneratedOverlaysCommand");
    expect(source).toContain("[data-midi-conversion-section-target]");
    expect(source).toContain("[data-midi-conversion-melody-target]");
    expect(source).toContain("[data-midi-conversion-source-target]");
    expect(source).toContain("[data-midi-conversion-keep-raw-reference]");
    expect(source).toContain("MIDI conversion source set to");
    expect(source).toContain("MIDI conversion will remove the raw reference clip");
    expect(source).toContain("MIDI conversion target set to Section");
    expect(source).toContain("MIDI conversion melody target set to track");
  });

  it("wires live clip-control moves into prepared clip automation lanes during playback", () => {
    const source = readFileSync("src/app/App.ts", "utf8");

    expect(source).toContain("recordLiveClipAutomation");
    expect(source).toContain("recordClipAutomationPointCommand");
    expect(source).toContain("isClipAutomationField(field)");
    expect(source).toContain("reason: recorded ? `clip-${field}-automation-record`");
  });

  it("wires Godot pack push through the local push bridge with ZIP fallback", () => {
    const source = readFileSync("src/app/App.ts", "utf8");

    expect(source).toContain("pushGamePackToGodot");
    expect(source).toContain('action === "push-godot-pack"');
    expect(source).toContain("pushToGodot: true");
    expect(source).toContain("Godot push unavailable; saved fallback ZIP");
  });

  it("renders media pool empty state without main-page import/export controls", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain("Media Pool");
    expect(html).toContain("No media pool items yet.");
    expect(html).not.toContain('data-action="import-audio"');
    expect(html).not.toContain('data-action="import-midi"');
    expect(html).not.toContain('data-action="collect-media"');
    expect(html).not.toContain('data-action="export-media-plan"');
  });

  it("renders native playback cache status for active cached generated tracks", () => {
    const state = createInitialState();
    state.nativeCacheStatus = {
      assetRegionCount: 5,
      cachedClipCount: 1,
      generatedRegionCount: 5,
      runtimeAudioRegionCount: 0,
      proceduralFallbackEventCount: 0,
      buildPending: false,
      prewarmScheduled: false,
      bypassedForLiveEdits: false,
      lastBuildReason: "manual-build-native-cache",
      lastError: null,
      generatedStemRenderFailureCount: 0,
      lastGeneratedStemRenderError: null
    };
    state.showControls = true;

    const html = renderAppShell(state);

    expect(html).toContain("Native Playback");
    expect(html).toContain("5 cached regions / 1 cached clip / 5 generated / 0 audio / 0 native event fallbacks / manual-build-native-cache");
    expect(html).toContain("Native Cache");
  });

  it("renders MIDI track and empty MIDI clip creation controls", () => {
    const state = createInitialState();
    state.showAddTrack = true;
    const withMidi = addTrackToProject(state.undoStack.present, "midi-instrument");
    state.undoStack = createUndoStack(withMidi.project);
    state.selectedTrackId = withMidi.trackId;
    state.selectedClipId = null;
    state.lowerDockTab = "piano-roll";

    const html = renderAppShell(state);
    const lower = lowerDockHtml(html);

    expect(html).toContain('id="add-track-title">Library / Add Track</h2>');
    expect(html).toContain("Recording input and mono/stereo mode appear on record-capable mixer strips after the track is created.");
    expect(html).toContain('class="add-track-library"');
    expect(html).toContain("Audio Recording");
    expect(html).toContain("Record-capable vocal audio track");
    expect(html).toContain("Record-capable instrument audio track");
    expect(html).toContain("Instrument / MIDI");
    expect(html).toContain("Organization");
    expect(html).toContain('data-add-track-kind="folder"');
    expect(html).toContain("Timeline organizer; no audio routing yet");
    expect(html).toContain("Chordsmith Roles");
    expect(html).toContain("Routing");
    expect(html).toContain('data-add-track-kind="midi-instrument"');
    expect(html).toContain("MIDI Instrument");
    expect(lower).toContain("Add a MIDI clip");
    expect(lower).toContain('data-action="add-empty-midi-clip"');
  });

  it("renders folder tracks as organizational timeline and mixer rows", () => {
    let state = addTrackCommand(createInitialState(), "folder");
    const folderId = state.selectedTrackId || "folder";
    state = setTrackFolderCommand(state, "bass", folderId);

    const bassHtml = renderAppShell(state);
    expect(inspectorHtml(bassHtml)).toContain('data-track-folder="bass"');

    state.selectedTrackId = folderId;
    const html = renderAppShell(state);
    const inspector = inspectorHtml(html);
    const lower = lowerDockHtml(html);

    expect(html).toContain('class="timeline-row  folder-row');
    expect(html).toContain('data-row="folder"');
    expect(html).toContain('data-folder-child="folder"');
    expect(html).toContain("In Folder");
    expect(html).toContain('data-folder-toggle="folder"');
    expect(html).toContain("Folder / organizer");
    expect(inspector).toContain("folder / folder");
    expect(inspector).toContain('class="folder-track-note"');
    expect(inspector).toContain("organizes timeline lanes and can be renamed like any other track");
    expect(inspector).toContain("Mute and Solo act as group controls for child lanes");
    expect(inspector).not.toContain('data-track-output="folder"');
    expect(inspector).not.toContain('data-automation-create="folder:volume"');
    expect(lower).toContain('class="strip folder-strip');
    expect(lower).toContain("Group Mute/Solo controls child lanes.");
    expect(lower).toContain("No fader, pan, sends, FX or folder stem yet.");
    expect(lower).not.toContain('data-volume="folder"');
    expect(lower).not.toContain('data-pan="folder"');
    expect(lower).toContain('data-mute-track="folder"');
    expect(lower).toContain('data-solo-track="folder"');

    const collapsed = toggleFolderExpandedCommand(state, folderId);
    const collapsedHtml = renderAppShell(collapsed);

    expect(collapsedHtml).toContain('data-folder-toggle="folder"');
    expect(collapsedHtml).toContain(">Expand</button>");
    expect(collapsedHtml).not.toContain('data-row="bass"');
  });

  it("renders native cache-stem renderer failures before quiet procedural fallback", () => {
    const state = createInitialState();
    state.nativeCacheStatus = {
      ...state.nativeCacheStatus,
      generatedStemRenderFailureCount: 5,
      lastGeneratedStemRenderError: "cache-stem render crashed"
    };
    state.showControls = true;

    const html = renderAppShell(state);

    expect(html).toContain("Native cache-stem render failed for 5 generated stems: cache-stem render crashed");
  });

  it("warns when native cache is bypassed after a live generated edit", () => {
    const state = createInitialState();
    state.nativeCacheStatus = {
      ...state.nativeCacheStatus,
      proceduralFallbackEventCount: 973,
      bypassedForLiveEdits: true
    };

    const html = renderAppShell(state);

    expect(html).toContain("Native event playback after live edit; rebuild cache to restore cached generated stems.");
  });

  it("renders media pool item metadata and render cache links", () => {
    const item = createMediaPoolItem({
      kind: "audio",
      name: "Battle Loop.wav",
      uri: "file:///music/Battle Loop.wav",
      durationSeconds: 64,
      sampleRate: 48000,
      channels: 2,
      sizeBytes: 2048,
      metadata: {
        missing: true,
        waveformPeaks: [0.2, 0.9, 2],
        waveformNeedsRefresh: true,
        audioTransientMarkersSeconds: [16, 32]
      }
    });
    const project = addMediaPoolItem(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Media Test" })), item);
    project.renderCache.push({ id: "cache_loop", mediaPoolItemId: item.id, createdAt: "2026-06-09T00:00:00.000Z", invalidated: false });
    const state = createInitialState();
    state.undoStack = createUndoStack(project);

    const html = renderAppShell(state);

    expect(html).toContain("Battle Loop.wav");
    expect(html).toContain("Missing");
    expect(html).toContain("Missing - relink required");
    expect(html).toContain("48000 Hz");
    expect(html).toContain("Waveform ready (3 peaks, max 100%) / stale flag / 2 transients");
    expect(html).toContain('class="media-waveform has-transients"');
    expect(html).toContain('class="media-transient-marker"');
    expect(html).toContain("Transient 16.00s");
    expect(html).toContain("cache_loop");
    expect(html).toContain(`data-place-audio="${item.id}"`);
  });

  it("renders MIDI media import warnings safely", () => {
    const item = createMediaPoolItem({
      kind: "midi",
      name: "Tempo Map.mid",
      uri: "file:///music/Tempo Map.mid",
      sizeBytes: 512,
      metadata: {
        ppq: 480,
        tempoBpm: 120,
        timeSig: 4,
        tempoEvents: [
          { tick: 0, trackIndex: 0, bpm: 120, microsecondsPerQuarter: 500000 },
          { tick: 480, trackIndex: 0, bpm: 140, microsecondsPerQuarter: 428571 }
        ],
        timeSignatureEvents: [
          { tick: 0, trackIndex: 0, numerator: 4, denominator: 4 },
          { tick: 480, trackIndex: 0, numerator: 3, denominator: 4 }
        ],
        importWarnings: [
          "MIDI file contains 2 tempo events; Pocket DAW preserves the tempo map metadata.",
          "<script>alert(1)</script>"
        ]
      }
    });
    const project = addMediaPoolItem(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Warnings" })), item);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);

    const html = renderAppShell(state);

    expect(html).toContain("<dt>Warnings</dt>");
    expect(html).toContain("<dt>Tempo Map</dt>");
    expect(html).toContain("120 BPM @ 1.1.0");
    expect(html).toContain("140 BPM @ 1.2.0");
    expect(html).toContain("3/4 @ 1.2.0");
    expect(html).toContain("playback still follows project tempo/meter");
    expect(html).toContain("MIDI file contains 2 tempo events");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders unloaded external media with reload and relink actions", () => {
    const item = createMediaPoolItem({
      kind: "audio",
      name: "External Loop.wav",
      uri: "file:///music/External Loop.wav",
      metadata: { external: true }
    });
    const project = addMediaPoolItem(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Media Test" })), item);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);

    const html = renderAppShell(state);

    expect(html).toContain("External unloaded");
    expect(html).toContain(`data-reload-media="${item.id}"`);
    expect(html).toContain(`data-relink-media="${item.id}"`);
  });

  it("renders media reload and relink actions by persistence state", () => {
    const external = createMediaPoolItem({
      kind: "audio",
      name: "External Loop.wav",
      uri: "file:///music/External Loop.wav",
      metadata: { external: true }
    });
    const missing = createMediaPoolItem({
      kind: "audio",
      name: "Missing Loop.wav",
      uri: "file:///lost/Missing Loop.wav",
      metadata: { missing: true, unresolved: true, missingReason: "Drive missing" }
    }, [external]);
    const collected = createMediaPoolItem({
      kind: "audio",
      name: "Collected Loop.wav",
      uri: "project-media/Collected Loop.wav",
      metadata: { mediaRefKind: "project", projectRelativePath: "project-media/Collected Loop.wav" }
    }, [external, missing]);
    const browserOnly = createMediaPoolItem({
      kind: "audio",
      name: "Browser Only.wav",
      metadata: { runtimeOnly: true }
    }, [external, missing, collected]);
    let project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Media Actions" }));
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), missing), collected), browserOnly);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);

    const html = renderAppShell(state);

    expect(html).toContain("External unloaded");
    expect(html).toContain("Missing - relink required");
    expect(html).toContain("Project media");
    expect(html).toContain("Browser runtime-only");
    expect(html).toContain("Stored or collected as project-relative media.");
    expect(html).toContain("Relink in the installed app");
    expect(html).toContain(`data-reload-media="${external.id}"`);
    expect(html).toContain(`data-relink-media="${external.id}"`);
    expect(html).not.toContain(`data-reload-media="${missing.id}"`);
    expect(html).toContain(`data-relink-media="${missing.id}"`);
    expect(html).toContain(`data-reload-media="${collected.id}"`);
    expect(html).toContain(`data-relink-media="${collected.id}"`);
    expect(html).not.toContain(`data-reload-media="${browserOnly.id}"`);
    expect(html).toContain(`data-relink-media="${browserOnly.id}"`);
  });

  it("renders missing native-decoded media as reloadable from decoded cache", () => {
    const cachedMissing = createMediaPoolItem({
      kind: "audio",
      name: "Cached Missing FLAC.flac",
      uri: "D:\\Lost\\Cached Missing FLAC.flac",
      metadata: {
        external: true,
        missing: true,
        unresolved: true,
        nativeDecodedCacheRelativePath: "project-cache/native-audio/imports/media-001-cached-missing-flac.wav"
      }
    });
    const project = addMediaPoolItem(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Media Cache" })), cachedMissing);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);

    const html = renderAppShell(state);

    expect(html).toContain("Missing source - decoded cache available");
    expect(html).toContain("project-relative decoded WAV cache is available");
    expect(html).toContain(`data-reload-media="${cachedMissing.id}"`);
    expect(html).toContain(`data-relink-media="${cachedMissing.id}"`);
  });

  it("renders version diagnostics and live recording alpha controls", () => {
    const state = createInitialState();
    state.showControls = true;
    const live = addTrackToProject(state.undoStack.present, "live-vocals");
    const ret = addReturnTrack(live.project, "Diagnostics Return");
    const sent = setTrackSendLevel(ret.project, "bass", ret.trackId, 0.3);
    let routed = setTrackSendMode(sent, "bass", ret.trackId, "pre-fader");
    const imported = addImportedAudioMedia(routed, {
      name: "Diagnostics Audio.wav",
      durationSeconds: 4,
      sampleRate: 48000,
      channels: 2,
      metadata: { waveformPeaks: [0.25, 0.75] }
    });
    routed = placeAudioClipOnTimeline(imported.project, imported.item.id, 1).project;
    routed.renderCache.push(
      { id: "freeze_1", createdAt: "2026-06-29T00:00:00.000Z", invalidated: false, metadata: { cacheKind: "freeze-render" } },
      { id: "native_stem_1", createdAt: "2026-06-29T00:01:00.000Z", invalidated: true, metadata: { cacheKind: "native-generated-stem" } }
    );
    state.undoStack = createUndoStack(routed);
    state.selectedTrackId = live.trackId;

    const html = renderAppShell(state);

    expect(html).toContain(`v${POCKET_DAW_VERSION}`);
    expect(html).toContain("Browser/dev");
    expect(html).toContain("About / Diagnostics");
    expect(html).toContain("Copy Diagnostics");
    expect(html).toContain("Export Diagnostics JSON");
    expect(html).toContain('data-action="controls-close"');
    expect(html).toContain('aria-label="Close About and Diagnostics"');
    expect(html).toContain('title="Close About and Diagnostics"');
    expect(html).toContain("installerOnly");
    expect(html).toContain("Routing");
    expect(html).toContain("pre-fader");
    expect(html).not.toContain("current render graphs are post-fader only");
    expect(html).toContain("1/1 waveform-ready media / 1/1 normalize-ready clips / 0 transient markers / 0 stale");
    expect(html).toContain("2 total / 1 freeze / 1 native stems / 0 runtime audio / 1 invalidated");
    expect(html).toContain("No Pocket DAW handoff received yet.");
    expect(html).toContain('data-action="record-toggle"');
    expect(html).toContain('data-action="metronome-toggle"');
    expect(html).toContain('data-arm-track="live-vocals"');
    expect(html).toContain('data-monitor-track="live-vocals"');
    expect(html).toContain("Arm Live Vocals for mono recording");
  });

  it("keeps modal panels above the menu and transport bars", () => {
    const css = readFileSync("src/styles/base.css", "utf8");

    expect(css).toContain(".modal-backdrop");
    expect(css).toContain("z-index: 120");
    expect(css).toContain("var(--menu-strip-height");
    expect(css).toContain("var(--transport-strip-height");
    expect(css).toContain("overflow: auto");
    expect(css).toContain("max(280px");
    expect(css).toContain("align-items: start");
    expect(css).toContain("position: sticky");
    expect(css).toContain("top: 0");
    expect(css).toContain("--studio-rail-width: 68px");
    expect(css).toContain('"studio-rail transport"');
    expect(css).toContain(".studio-rail");
    expect(css).toContain("grid-area: studio-rail");
    expect(css).toContain(".add-track-library");
    expect(css).toContain(".add-track-group");
    expect(css).toContain(".timeline-row.folder-row");
    expect(css).toContain(".timeline-row.folder-child-row");
    expect(css).toContain("[data-folder-toggle]");
    expect(css).toContain(".folder-track-note");
    expect(css).toContain('.app-shell[data-ui-preset="music"] [data-ui-scope~="game"]');
    expect(css).toContain('.app-shell[data-ui-preset="game-music"] [data-ui-scope~="recording"]');
  });

  it("gives record-capable mixer strips enough vertical space for input and FX controls", () => {
    const css = readFileSync("src/styles/mixer.css", "utf8");

    expect(css).toContain("min-height: 452px");
    expect(css).toContain(".strip.record-capable");
    expect(css).toContain(".strip.folder-strip");
    expect(css).toContain("grid-template-rows: 28px 76px 48px 38px 38px 64px minmax(50px, auto)");
    expect(css).toContain("padding: 10px 18px 28px");
  });

  it("keeps mixer track-name rename buttons flat and unclipped", () => {
    const css = readFileSync("src/styles/mixer.css", "utf8");

    expect(css).toContain(".strip-name button");
    expect(css).toContain("border-radius: 0");
    expect(css).toContain("appearance: none");
    expect(css).toContain("line-height: 1.2");
  });

  it("renders the selected MIDI clip piano-roll editor", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI UI" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "lead.mid");
    const withController = addMidiController(imported.project, imported.clipId, 240);
    const withProgram = addMidiProgramChange(withController, imported.clipId, 480);
    const withBend = addMidiPitchBend(withProgram, imported.clipId, 720);
    const withAftertouch = addMidiAftertouch(withBend, imported.clipId, 960);
    const result = { ...imported, project: withAftertouch };
    const midiClip = withAftertouch.timeline.clips.find((item) => item.id === result.clipId)!;
    const controllerId = midiDataFromClip(midiClip).controllers[0].id;
    const programId = midiDataFromClip(midiClip).programChanges[0].id;
    const bendId = midiDataFromClip(midiClip).pitchBends[0].id;
    const aftertouchId = midiDataFromClip(midiClip).aftertouch[0].id;
    const state = createInitialState();
    state.undoStack = createUndoStack(result.project);
    state.selectedClipId = result.clipId;
    state.selectedTrackId = result.trackId;

    const html = renderAppShell(state);

    expect(html).toContain("Piano Roll");
    expect(html).toContain(`data-midi-note-add="${result.clipId}"`);
    expect(html).toContain(`data-midi-clip-property="${result.clipId}:barLength"`);
    const noteId = midiDataFromClip(midiClip).notes[0].id;
    expect(html).toContain(`data-midi-note-field="${result.clipId}:${noteId}:pitch"`);
    expect(html).toContain(`data-midi-note-field="${result.clipId}:${noteId}:startTick"`);
    expect(html).toContain(`data-midi-note-field="${result.clipId}:${noteId}:durationTicks"`);
    expect(html).toContain(`data-midi-note-field="${result.clipId}:${noteId}:velocity"`);
    expect(html).toContain(`data-midi-note-field="${result.clipId}:${noteId}:channel"`);
    expect(html).toContain(`data-midi-note-duplicate="${result.clipId}:${noteId}"`);
    expect(html).toContain(`data-midi-quantize="${result.clipId}:1/4"`);
    expect(html).toContain(`data-midi-quantize="${result.clipId}:1/8"`);
    expect(html).toContain(`data-midi-quantize="${result.clipId}:1/16"`);
    expect(html).toContain(`data-midi-quantize="${result.clipId}:1/32"`);
    expect(html).toContain(`data-midi-duration-quantize="${result.clipId}:1/4"`);
    expect(html).toContain(`data-midi-duration-quantize="${result.clipId}:1/8"`);
    expect(html).toContain(`data-midi-duration-quantize="${result.clipId}:1/16"`);
    expect(html).toContain(`data-midi-duration-quantize="${result.clipId}:1/32"`);
    expect(html).toContain(`data-midi-swing="${result.clipId}:50"`);
    expect(html).toContain(`data-midi-swing="${result.clipId}:55"`);
    expect(html).toContain(`data-midi-swing="${result.clipId}:60"`);
    expect(html).toContain(`data-midi-swing="${result.clipId}:65"`);
    expect(html).toContain(`data-midi-groove="${result.clipId}:straight-16"`);
    expect(html).toContain(`data-midi-groove="${result.clipId}:pocket-16"`);
    expect(html).toContain(`data-midi-groove="${result.clipId}:shuffle-8"`);
    expect(html).toContain(`data-midi-velocity-transform="${result.clipId}:level-96"`);
    expect(html).toContain(`data-midi-velocity-transform="${result.clipId}:humanize-12"`);
    expect(html).toContain(`data-midi-pitch-transform="${result.clipId}:semitone-down"`);
    expect(html).toContain(`data-midi-pitch-transform="${result.clipId}:semitone-up"`);
    expect(html).toContain(`data-midi-pitch-transform="${result.clipId}:octave-down"`);
    expect(html).toContain(`data-midi-pitch-transform="${result.clipId}:octave-up"`);
    expect(html).toContain(`data-midi-controller-add="${result.clipId}"`);
    expect(html).toContain(`data-midi-controller-field="${result.clipId}:${controllerId}:controller"`);
    expect(html).toContain(`data-midi-controller-field="${result.clipId}:${controllerId}:tick"`);
    expect(html).toContain(`data-midi-controller-field="${result.clipId}:${controllerId}:value"`);
    expect(html).toContain(`data-midi-controller-field="${result.clipId}:${controllerId}:channel"`);
    expect(html).toContain(`data-midi-controller-duplicate="${result.clipId}:${controllerId}"`);
    expect(html).toContain(`data-midi-controller-delete="${result.clipId}:${controllerId}"`);
    expect(html).toContain("Controller Lane");
    expect(html).toContain(`data-midi-program-add="${result.clipId}"`);
    expect(html).toContain(`data-midi-program-field="${result.clipId}:${programId}:program"`);
    expect(html).toContain(`data-midi-program-field="${result.clipId}:${programId}:tick"`);
    expect(html).toContain(`data-midi-program-field="${result.clipId}:${programId}:channel"`);
    expect(html).toContain(`data-midi-program-duplicate="${result.clipId}:${programId}"`);
    expect(html).toContain(`data-midi-program-delete="${result.clipId}:${programId}"`);
    expect(html).toContain("Program Changes");
    expect(html).toContain(`data-midi-pitch-bend-add="${result.clipId}"`);
    expect(html).toContain(`data-midi-pitch-bend-field="${result.clipId}:${bendId}:value"`);
    expect(html).toContain(`data-midi-pitch-bend-field="${result.clipId}:${bendId}:tick"`);
    expect(html).toContain(`data-midi-pitch-bend-field="${result.clipId}:${bendId}:channel"`);
    expect(html).toContain(`data-midi-pitch-bend-duplicate="${result.clipId}:${bendId}"`);
    expect(html).toContain(`data-midi-pitch-bend-delete="${result.clipId}:${bendId}"`);
    expect(html).toContain("Pitch Bend");
    expect(html).toContain(`data-midi-aftertouch-add="${result.clipId}"`);
    expect(html).toContain(`data-midi-aftertouch-field="${result.clipId}:${aftertouchId}:value"`);
    expect(html).toContain(`data-midi-aftertouch-field="${result.clipId}:${aftertouchId}:tick"`);
    expect(html).toContain(`data-midi-aftertouch-field="${result.clipId}:${aftertouchId}:channel"`);
    expect(html).toContain(`data-midi-aftertouch-duplicate="${result.clipId}:${aftertouchId}"`);
    expect(html).toContain(`data-midi-aftertouch-delete="${result.clipId}:${aftertouchId}"`);
    expect(html).toContain("Aftertouch");
    expect(html).toContain('data-action="convert-midi-drums"');
    expect(html).toContain("Map Drums");
    expect(html).toContain('data-action="convert-midi-bass"');
    expect(html).toContain("Map Bass");
    expect(html).toContain('data-action="convert-midi-chords"');
    expect(html).toContain("Map Chords");
    expect(html).toContain('data-action="convert-midi-melody"');
    expect(html).toContain("Map Melody");
    expect(html).toContain('data-action="convert-midi-arrangement"');
    expect(html).toContain("Map Arrangement");
    expect(html).toContain('data-midi-conversion-section-target="true"');
    expect(html).toContain('data-midi-conversion-melody-target="true"');
    expect(html).toContain('data-midi-conversion-source-target="true"');
    expect(html).toContain('data-midi-conversion-keep-raw-reference="true" checked');
    expect(html).toContain("Keep raw reference");
    expect(html).toContain("All MIDI notes");
    expect(html).toContain("Map to");
    expect(html).toContain(`data-midi-conversion-preview="${result.clipId}"`);
    expect(html).toContain("Chordsmith Mapping Preview");
    expect(html).toContain("120 BPM / 4/4");
    expect(html).toContain("Structure");
    expect(html).toContain("Role hints");
    expect(html).toContain("Raw MIDI preserved");
    expect(html).toContain('data-action="adopt-midi-tempo"');
    expect(html).toContain("Adopt Tempo");
    expect(html).toContain('data-action="adopt-midi-tempo-map"');
    expect(html).toContain("Tempo Lane");
    expect(html).toContain('data-action="adopt-midi-meter-map"');
    expect(html).toContain("Meter Lane");
    expect(html).toContain("C4");
    expect(html).toContain("<dt>Confidence</dt>");
    expect(html).toContain("Raw MIDI timeline reference will be kept after mapping.");
    expect(html).toContain("MIDI clips are created from the selected import placement");
    expect(html).toContain("midi-note-strip");
  });

  it("renders MIDI conversion source choices from imported track and channel metadata", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Source UI" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(multiTrackChannelMidiBytes()), "band.mid");
    const state = createInitialState();
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.lowerDockTab = "piano-roll";
    state.midiConversionSourceMode = "source-track";
    state.midiConversionSourceValue = 2;

    const html = renderAppShell(state);

    expect(html).toContain('data-midi-conversion-source-target="true"');
    expect(html).toContain('<option value="source-track:2" selected>Track 3: Bass</option>');
    expect(html).toContain('<option value="channel:9" >Channel 10</option>');
    expect(html).toContain("<dt>Source</dt><dd>source track 3");
  });

  it("renders the MIDI conversion raw-reference removal impact before mapping", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Reference UI" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(multiTrackChannelMidiBytes()), "band.mid");
    const state = createInitialState();
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.lowerDockTab = "piano-roll";
    state.midiConversionKeepRawReference = false;

    const html = renderAppShell(state);

    expect(html).toContain("Raw MIDI timeline reference will be removed after a successful mapping");
  });

  it("renders the selected imported melody lane editor", () => {
    const steps = 16;
    const melody1 = new Array<number | null>(steps).fill(null);
    const melody2 = new Array<number | null>(steps).fill(null);
    melody1[0] = 1;
    melody2[1] = 8;
    const blankBool = new Array<boolean>(steps).fill(false);
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({
      title: "Two Melodies",
      sectionBars: { A: 1 },
      songSequence: ["A"],
      melodyTracksA: [melody1, melody2],
      melodyInstrumentsA: ["banjo", "harmonica"],
      melodyOctavesA: [0, 0],
      melodyMuteA: [false, false],
      melodySoloA: [false, false],
      melodyPanA: [0, 0.4],
      melodyHoldA: [blankBool, blankBool],
      melodySlideA: [blankBool, blankBool],
      melodyTupletsA: [blankBool, blankBool]
    }));
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedClipId = project.timeline.clips[0].id;
    state.selectedTrackId = "melody-2";

    const html = renderAppShell(state);

    expect(html).toContain("Melody 2");
    expect(html).toContain("harmonica");
    expect(html).toContain(`data-melody-instrument="A:1"`);
    expect(html).toContain(`<option value="harmonica" selected>Harmonica</option>`);
    const inspector = inspectorHtml(html);
    expect(inspector).toContain(`data-melody-step="A:1:1"`);
    expect(inspector).not.toContain(`data-melody-step="A:0:0"`);
  });

  it("renders Chordsmith section scope, globals and later step pages", () => {
    const state = createInitialState();
    state.selectedTrackId = "bass";
    state.chordsmithEditorFollowClip = false;
    state.chordsmithEditorSectionId = "A";
    state.chordsmithEditorStepPage = 1;

    const html = renderAppShell(state);

    expect(html).toContain('id="chordsmithSectionSelect"');
    expect(html).toContain('id="chordsmithFollowClip"');
    expect(html).toContain('data-chordsmith-global="bpm"');
    expect(html).toContain('data-bass-mode="true"');
    expect(html).toContain('data-bass-preset-section="A"');
    expect(html).toContain("Copy kick");
    expect(html).toContain("Funky groove");
    expect(html).not.toContain('data-bass-fill-auto="true"');
    expect(html).toContain('data-bass-step="A:16"');
    expect(html).toContain("Select then press H, S or T.");
    expect(html).not.toContain('data-bass-hold="A:16"');
    expect(html).not.toContain('data-bass-slide="A:16"');
    expect(html).toContain('data-bass-accent="A:16"');
    expect(html).toContain("Step page");
    expect(html).toContain(">2 /");
  });

  it("binds the bass preset selector to the Chordsmith bass preset command", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const handler = source.slice(source.indexOf("[data-bass-preset-section]"), source.indexOf("[data-chord-instrument]"));

    expect(handler).toMatch(/applyBassPresetCommand\(\s*this\.state/s);
    expect(handler).toContain('"chordsmith-bass-preset"');
  });
});
