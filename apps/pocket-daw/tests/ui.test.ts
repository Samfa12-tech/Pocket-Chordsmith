import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/app/state";
import { renderAppShell } from "../src/app/ui";
import { createUndoStack } from "../src/daw/undo";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { addMediaPoolItem, createMediaPoolItem } from "../src/daw/mediaPool";
import { addTrackToProject } from "../src/daw/tracks";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { simpleMidiBytes } from "./midiFixtures";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";

function inspectorHtml(html: string) {
  return html.match(/<aside class="inspector"[\s\S]*?<\/aside>/)?.[0] || "";
}

describe("Pocket DAW UI rendering", () => {
  it("renders song setup and direct generated-track sequencers in a new project", () => {
    const project = createEmptyPocketDawProject();
    const state = createInitialState();
    state.undoStack = createUndoStack(project);
    state.selectedClipId = null;
    state.selectedTrackId = "melody";

    const html = renderAppShell(state);

    expect(html).toContain('data-chordsmith-global="key"');
    expect(html).toContain('data-chordsmith-global="bpm"');
    expect(html).toContain('id="chordsmithSectionSelect"');
    expect(html).toContain('data-melody-step="A:0:0"');
    expect(html).toContain('data-drum-step="A:kick:0"');
    expect(html).toContain('data-inline-sequencer-role="drums"');
    expect(html).toContain('data-inline-sequencer-role="bass"');
    expect(html).toContain('data-inline-sequencer-role="chords"');
    expect(html).toContain('data-inline-sequencer-role="melody"');
    expect(html).toContain('data-inline-sequencer-role="guitar"');
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

  it("renders desktop menu actions through the shared action attributes", () => {
    const html = renderAppShell(createInitialState());

    [
      "new-project",
      "open-project",
      "load-demo",
      "reset-demo-template",
      "save-project",
      "save-project-as",
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
      "collect-media",
      "build-native-cache",
      "export-diagnostics"
    ].forEach((action) => {
      expect(html).toContain(`data-action="${action}"`);
    });
    expect(html).toContain('id="snapMode"');
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

  it("renders the shell as explicit non-overlapping layout zones", () => {
    const html = renderAppShell(createInitialState());
    const zones = [...html.matchAll(/data-layout-zone="([^"]+)"/g)].map((match) => match[1]);

    expect(html).toContain('data-layout-shell="true"');
    expect(zones).toEqual(["menu", "transport", "studio", "mixer", "export", "media", "import"]);
    expect(html.indexOf('class="mixer"')).toBeLessThan(html.indexOf('class="export-panel"'));
    expect(html.indexOf('class="export-panel"')).toBeLessThan(html.indexOf('class="media-pool"'));
    expect(html.indexOf('class="media-pool"')).toBeLessThan(html.indexOf('class="import-panel"'));
  });

  it("renders stable scroll keys for independently scrolling panes", () => {
    const html = renderAppShell(createInitialState());

    [
      'data-scroll-key="app-shell"',
      'data-scroll-key="track-list"',
      'data-scroll-key="timeline-scroll"',
      'data-scroll-key="inspector"',
      'data-scroll-key="mixer"',
      'data-scroll-key="media-pool"'
    ].forEach((scrollKey) => {
      expect(html).toContain(scrollKey);
    });
  });

  it("renders bar and time labels on the timeline ruler", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain('class="ruler-tick"');
    expect(html).toContain("<b>1</b><small>0:00</small>");
    expect(html).toContain("Click to seek by bar or time");
  });

  it("renders transport cooking feedback when the app is busy preparing audio", () => {
    const state = createInitialState();
    state.busyMessage = "Cooking timeline audio for native playback...";

    const html = renderAppShell(state);

    expect(html).toContain('class="transport-busy"');
    expect(html).toContain("Cooking timeline audio for native playback...");
  });

  it("renders export progress feedback in the export panel", () => {
    const state = createInitialState();
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

  it("renders media pool empty state with audio and MIDI import enabled", () => {
    const html = renderAppShell(createInitialState());

    expect(html).toContain("Media Pool");
    expect(html).toContain("No media pool items yet.");
    expect(html).toContain("Import Audio");
    expect(html).toContain("Import MIDI");
    expect(html).toContain("Build Native Cache");
    expect(html).toContain("Godot Manifest Preview");
    expect(html).toContain("Web Manifest Preview");
    expect(html).toContain("Collect Media Plan");
    expect(html).toContain("Collect Media");
    expect(html).toContain("Collect Plan");
    expect(html).toContain('data-action="import-audio"');
    expect(html).toContain('data-action="import-midi"');
    expect(html).toContain('data-action="collect-media"');
    expect(html).toContain('data-action="export-media-plan"');
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

  it("renders version diagnostics and disabled recording arm stubs", () => {
    const state = createInitialState();
    state.showControls = true;
    const live = addTrackToProject(state.undoStack.present, "live-vocals");
    state.undoStack = createUndoStack(live.project);
    state.selectedTrackId = live.trackId;

    const html = renderAppShell(state);

    expect(html).toContain("v0.5.4");
    expect(html).toContain("Browser/dev");
    expect(html).toContain('data-arm-track="live-vocals" disabled');
    expect(html).toContain("Recording coming after");
    expect(html).toContain("media/device QA");
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
    expect(html).toContain('data-bass-step="A:16"');
    expect(html).toContain("Select then press H, S or T.");
    expect(html).not.toContain('data-bass-hold="A:16"');
    expect(html).not.toContain('data-bass-slide="A:16"');
    expect(html).toContain('data-bass-accent="A:16"');
    expect(html).toContain("Page 2 /");
  });
});
