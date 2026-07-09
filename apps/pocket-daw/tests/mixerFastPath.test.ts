import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AudioEngine } from "../src/audio/audioEngine";
import { setTrackPanCommand, setTrackVolumeCommand, toggleTrackMuteCommand, toggleTrackSoloCommand } from "../src/app/commands";
import { createInitialState, currentProject } from "../src/app/state";
import { createDemoProject } from "../src/demo/demoProject";

function demoIdentity(project: ReturnType<typeof currentProject>) {
  return {
    title: project.project.title,
    sourceRefTitles: project.sourceRefs.map((ref) => ref.title),
    normalizedSectionBars: project.sourceRefs.map((ref) => {
      const normalized = ref.normalized as { sections?: Record<string, { bars: number }> } | undefined;
      return Object.fromEntries(Object.entries(normalized?.sections || {}).map(([id, section]) => [id, section.bars]));
    }),
    timelineClips: project.timeline.clips.map((clip) => ({
      id: clip.id,
      sectionId: clip.sectionId,
      startBar: clip.startBar,
      barLength: clip.barLength,
      sourceRefId: clip.sourceRefId
    })),
    importHistory: project.importHistory.map((entry) => ({
      sourceRefId: entry.sourceRefId,
      importKind: entry.importKind,
      message: entry.message
    }))
  };
}

describe("mixer fast path", () => {
  it("keeps live mixer previews out of undo history until final commit", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));

    engine.updateTrackMixerControl("bass", { pan: -1 });
    engine.updateTrackMixerControl("bass", { pan: 1 });
    engine.updateTrackMixerControl("bass", { pan: -0.25 });

    expect(state.undoStack.past).toHaveLength(0);
    expect(currentProject(state).tracks.find((track) => track.id === "bass")?.pan).toBe(0);
    expect(engine.getDiagnostics().mixerControls.find((track) => track.id === "bass")?.pan).toBe(-0.25);

    const committed = setTrackPanCommand(state, "bass", -0.25);
    const bass = committed.undoStack.present.tracks.find((track) => track.id === "bass");

    expect(committed.undoStack.past).toHaveLength(1);
    expect(committed.undoStack.future).toHaveLength(0);
    expect(bass?.pan).toBe(-0.25);
  });

  it("commits volume once after live preview changes", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));

    engine.updateTrackMixerControl("bass", { volume: 0.2 });
    engine.updateTrackMixerControl("bass", { volume: 0.95 });

    expect(currentProject(state).tracks.find((track) => track.id === "bass")?.volume).toBe(0.86);
    expect(engine.getDiagnostics().mixerControls.find((track) => track.id === "bass")?.volume).toBe(0.95);

    const committed = setTrackVolumeCommand(state, "bass", 0.95);
    const bass = committed.undoStack.present.tracks.find((track) => track.id === "bass");

    expect(committed.undoStack.past).toHaveLength(1);
    expect(bass?.volume).toBe(0.95);
  });

  it("preserves scroll when committing mixer slider changes", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const commitMixerControl = source.slice(source.indexOf("private commitMixerControl"), source.indexOf("private currentMixerControlValue"));

    expect(commitMixerControl).toContain('audio: "none"');
    expect(commitMixerControl).toContain("preserveScroll: true");
    expect(commitMixerControl).not.toContain("this.applyProjectState(next, false)");
  });

  it("treats track graph edits as mixer graph changes instead of full project loads", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const addTrackHandler = source.slice(source.indexOf("const addTrackButton"), source.indexOf("const muteButton"));

    expect(addTrackHandler).toContain('audio: "mixer-graph"');
    expect(addTrackHandler).toContain('reason: "add-track"');
    expect(addTrackHandler).not.toContain("this.applyProjectState(addTrackCommand(this.state, addTrackButton.dataset.addTrackKind as AddTrackKind));");
  });

  it("syncs metronome toggles through the cached transport path", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const metronomeHandler = source.slice(source.indexOf('if (action === "metronome-toggle")'), source.indexOf('if (action === "seek-start")'));

    expect(metronomeHandler).toContain('audio: "project-load"');
    expect(metronomeHandler).toContain('reason: "metronome-toggle"');
    expect(metronomeHandler).not.toContain("this.applyProjectState(toggleMetronomeCommand(this.state));");
  });

  it("keeps demo identity stable and commits one undo entry after a pan drag", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));
    const beforeProject = currentProject(state);
    const beforeIdentity = demoIdentity(beforeProject);
    const beforeDiagnostics = engine.getDiagnostics();

    engine.updateTrackMixerControl("bass", { pan: -1 });
    engine.updateTrackMixerControl("bass", { pan: 0.5 });
    const committed = setTrackPanCommand(state, "bass", 0.5);
    const afterProject = currentProject(committed);
    const afterDiagnostics = engine.getDiagnostics();

    expect(committed.undoStack.past).toHaveLength(1);
    expect(afterProject.tracks.find((track) => track.id === "bass")?.pan).toBe(0.5);
    expect(demoIdentity(afterProject)).toEqual(beforeIdentity);
    expect(afterDiagnostics.eventCount).toBe(beforeDiagnostics.eventCount);
    expect(afterDiagnostics.sourceRefTitles).toEqual(beforeDiagnostics.sourceRefTitles);
    expect(afterDiagnostics.timelineClipCount).toBe(beforeDiagnostics.timelineClipCount);
    expect(createDemoProject().project.title).toBe(beforeProject.project.title);
  });

  it("keeps demo identity stable and commits one undo entry after a volume drag", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));
    const beforeProject = currentProject(state);
    const beforeIdentity = demoIdentity(beforeProject);
    const beforeDiagnostics = engine.getDiagnostics();

    engine.updateTrackMixerControl("bass", { volume: 0.2 });
    engine.updateTrackMixerControl("bass", { volume: 1.05 });
    const committed = setTrackVolumeCommand(state, "bass", 1.05);
    const afterProject = currentProject(committed);
    const afterDiagnostics = engine.getDiagnostics();

    expect(committed.undoStack.past).toHaveLength(1);
    expect(afterProject.tracks.find((track) => track.id === "bass")?.volume).toBe(1.05);
    expect(demoIdentity(afterProject)).toEqual(beforeIdentity);
    expect(afterDiagnostics.eventCountsByTrack).toEqual(beforeDiagnostics.eventCountsByTrack);
    expect(afterDiagnostics.importHistoryCount).toBe(beforeDiagnostics.importHistoryCount);
    expect(createDemoProject().project.title).toBe(beforeProject.project.title);
  });

  it("keeps mute and solo on the mixer fast path until their single click commits", () => {
    const state = createInitialState();
    const engine = new AudioEngine(currentProject(state));
    const before = engine.getDiagnostics();

    const mutedState = toggleTrackMuteCommand(state, "chords");
    const mutedTrack = currentProject(mutedState).tracks.find((track) => track.id === "chords");
    engine.updateTrackMixerControl("chords", { mute: mutedTrack?.mute === true });
    const afterMute = engine.getDiagnostics();

    expect(currentProject(state).tracks.find((track) => track.id === "chords")?.mute).toBe(false);
    expect(mutedState.undoStack.past).toHaveLength(1);
    expect(afterMute.eventCount).toBe(before.eventCount);
    expect(afterMute.timelineClipCount).toBe(before.timelineClipCount);
    expect(afterMute.sourceRefTitles).toEqual(before.sourceRefTitles);
    expect(afterMute.chordsmithSectionCount).toBe(before.chordsmithSectionCount);
    expect(afterMute.mixerControls.find((track) => track.id === "chords")).toMatchObject({ mute: true, solo: false });

    const soloedState = toggleTrackSoloCommand(mutedState, "bass");
    const soloedTrack = currentProject(soloedState).tracks.find((track) => track.id === "bass");
    engine.updateTrackMixerControl("bass", { solo: soloedTrack?.solo === true });
    const afterSolo = engine.getDiagnostics();

    expect(soloedState.undoStack.past).toHaveLength(2);
    expect(afterSolo.eventCountsByTrack).toEqual(before.eventCountsByTrack);
    expect(afterSolo.projectTitle).toBe("Pocket DAW Demo - Neon Roads");
    expect(afterSolo.mixerControls.find((track) => track.id === "bass")).toMatchObject({ mute: false, solo: true });
  });

  it("forces a full visual refresh for mute and solo while keeping audio on the fast path", () => {
    const source = readFileSync("src/app/App.ts", "utf8");
    const muteHandler = source.slice(source.indexOf("private toggleTrackMute"), source.indexOf("private toggleTrackSolo"));
    const soloHandler = source.slice(source.indexOf("private toggleTrackSolo"), source.indexOf("private async toggleTrackMonitor"));

    expect(muteHandler).toContain('audio: "none"');
    expect(muteHandler).toContain('render: "immediate"');
    expect(muteHandler).toContain("preserveScroll: true");
    expect(soloHandler).toContain('audio: "none"');
    expect(soloHandler).toContain('render: "immediate"');
    expect(soloHandler).toContain("preserveScroll: true");
  });

  it("keeps demo identity stable and commits one undo entry for mute or solo", () => {
    const muteState = createInitialState();
    const muteEngine = new AudioEngine(currentProject(muteState));
    const muteIdentity = demoIdentity(currentProject(muteState));
    const muteBefore = muteEngine.getDiagnostics();
    const muted = toggleTrackMuteCommand(muteState, "chords");
    muteEngine.updateTrackMixerControl("chords", { mute: true });
    const muteAfter = muteEngine.getDiagnostics();

    expect(muted.undoStack.past).toHaveLength(1);
    expect(currentProject(muted).tracks.find((track) => track.id === "chords")?.mute).toBe(true);
    expect(demoIdentity(currentProject(muted))).toEqual(muteIdentity);
    expect(muteAfter.eventCount).toBe(muteBefore.eventCount);
    expect(muteAfter.sourceRefTitles).toEqual(muteBefore.sourceRefTitles);
    expect(muteAfter.chordsmithSectionCount).toBe(muteBefore.chordsmithSectionCount);

    const soloState = createInitialState();
    const soloEngine = new AudioEngine(currentProject(soloState));
    const soloIdentity = demoIdentity(currentProject(soloState));
    const soloBefore = soloEngine.getDiagnostics();
    const soloed = toggleTrackSoloCommand(soloState, "bass");
    soloEngine.updateTrackMixerControl("bass", { solo: true });
    const soloAfter = soloEngine.getDiagnostics();

    expect(soloed.undoStack.past).toHaveLength(1);
    expect(currentProject(soloed).tracks.find((track) => track.id === "bass")?.solo).toBe(true);
    expect(demoIdentity(currentProject(soloed))).toEqual(soloIdentity);
    expect(soloAfter.timelineClipCount).toBe(soloBefore.timelineClipCount);
    expect(soloAfter.importHistoryCount).toBe(soloBefore.importHistoryCount);
    expect(soloAfter.projectTitle).toBe("Pocket DAW Demo - Neon Roads");
  });
});
