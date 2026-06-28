import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createInitialState } from "../src/app/state";
import { renderAppShell } from "../src/app/ui";
import { createUndoStack } from "../src/daw/undo";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { addMediaPoolItem, createMediaPoolItem } from "../src/daw/mediaPool";
import { addTrackToProject } from "../src/daw/tracks";
import { addFxSlot } from "../src/daw/fx";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { simpleMidiBytes } from "./midiFixtures";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { POCKET_DAW_VERSION } from "../src/daw/schema";

function inspectorHtml(html: string) {
  return html.match(/<aside class="inspector"[\s\S]*?<\/aside>/)?.[0] || "";
}

function transportHtml(html: string) {
  return html.match(/<header class="transport"[\s\S]*?<\/header>/)?.[0] || "";
}

function timelineRowHtml(html: string, rowId: string) {
  const marker = `data-row="${rowId}"`;
  const start = html.indexOf(marker);
  if (start === -1) return "";
  const next = html.indexOf('<div class="timeline-row', start + marker.length);
  return html.slice(start, next === -1 ? undefined : next);
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
    expect(html).toContain("Drum Kit Lanes");
    expect(html).toContain('data-drum-lane-volume="kick"');
    expect(html).toContain('data-drum-lane-add-fx="clap"');
    expect(html).toContain("Open Hat");
    expect(html).toContain("Ride");
    expect(html).toContain('data-inline-sequencer-role="drums"');
    expect(html).toContain('data-inline-sequencer-role="bass"');
    expect(html).toContain('data-inline-sequencer-role="chords"');
    expect(html).toContain('data-inline-sequencer-role="melody"');
    expect(html).toContain('data-inline-sequencer-role="guitar"');
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
    expect(transport).toContain('<span data-recording-state="true" class="recording"><strong>Recording</strong><small>0:07</small></span>');
    expect(transport).toContain("<span><strong>118</strong><small>BPM</small></span>");
    expect(transport).toContain("<span><strong>Metro</strong><small>off</small></span>");
    expect(transport).toContain('<span data-playhead-readout="true"><strong>Bar 1</strong><small>Beat 1</small></span>');
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
    expect(inspector).toContain('data-action="freeze-selected-clip"');
    expect(inspector).toContain('data-action="export-selected-clip-midi"');
    expect(inspector).toContain('data-action="export-selected-track-midi"');
    expect(inspector).not.toContain("<button disabled>Freeze</button>");
    expect(inspector).not.toContain("<button disabled>Convert to MIDI</button>");
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
      "clip-copy",
      "clip-paste",
      "clip-duplicate",
      "clip-split",
      "clip-delete",
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
    expect(zones).toEqual(["menu", "transport", "quickstart", "studio", "mixer", "media"]);
    expect(html.indexOf('class="mixer"')).toBeLessThan(html.indexOf('class="media-pool"'));
    expect(html).not.toContain('class="export-panel"');
    expect(html).not.toContain('class="import-panel"');
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
    expect(html).toContain("<b>1</b><small>0:00</small>");
    expect(html).toContain("Click to seek by bar or time");
  });

  it("renders close default zoom and marker rails aligned to bar coordinates", () => {
    const state = createInitialState();
    const html = renderAppShell(state);

    expect(state.zoom).toBe(240);
    expect(html).toContain("--bar:240px");
    expect(html).toContain("--track-header:176px");
    expect(html).toContain('id="timelineZoom"');
    expect(html).toContain("240 px/bar");
    expect(html).toContain('class="marker-rail"');
    expect(html).toContain("--marker-colour:");
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
      metadata: { missing: true }
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
    expect(html).toContain("cache_loop");
    expect(html).toContain(`data-place-audio="${item.id}"`);
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
    let project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "Media Actions" }));
    project = addMediaPoolItem(addMediaPoolItem(addMediaPoolItem(project, external), missing), collected);
    const state = createInitialState();
    state.undoStack = createUndoStack(project);

    const html = renderAppShell(state);

    expect(html).toContain("External unloaded");
    expect(html).toContain("Missing - relink required");
    expect(html).toContain("Project media");
    expect(html).toContain("Stored or collected as project-relative media.");
    expect(html).toContain(`data-reload-media="${external.id}"`);
    expect(html).toContain(`data-relink-media="${external.id}"`);
    expect(html).not.toContain(`data-reload-media="${missing.id}"`);
    expect(html).toContain(`data-relink-media="${missing.id}"`);
    expect(html).toContain(`data-reload-media="${collected.id}"`);
    expect(html).toContain(`data-relink-media="${collected.id}"`);
  });

  it("renders version diagnostics and live recording alpha controls", () => {
    const state = createInitialState();
    state.showControls = true;
    const live = addTrackToProject(state.undoStack.present, "live-vocals");
    state.undoStack = createUndoStack(live.project);
    state.selectedTrackId = live.trackId;

    const html = renderAppShell(state);

    expect(html).toContain(`v${POCKET_DAW_VERSION}`);
    expect(html).toContain("Browser/dev");
    expect(html).toContain("About / Diagnostics");
    expect(html).toContain("Copy Diagnostics");
    expect(html).toContain("Export Diagnostics JSON");
    expect(html).toContain("installerOnly");
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
    expect(css).toContain("align-items: start");
  });

  it("gives record-capable mixer strips enough vertical space for input and FX controls", () => {
    const css = readFileSync("src/styles/mixer.css", "utf8");

    expect(css).toContain("min-height: 452px");
    expect(css).toContain(".strip.record-capable");
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
    const result = importMidiFileToProject(project, parseStandardMidiFile(simpleMidiBytes()), "lead.mid");
    const state = createInitialState();
    state.undoStack = createUndoStack(result.project);
    state.selectedClipId = result.clipId;
    state.selectedTrackId = result.trackId;

    const html = renderAppShell(state);

    expect(html).toContain("Piano Roll");
    expect(html).toContain(`data-midi-note-add="${result.clipId}"`);
    expect(html).toContain("C4");
    expect(html).toContain("MIDI clip created on import");
    expect(html).toContain("midi-note-strip");
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
