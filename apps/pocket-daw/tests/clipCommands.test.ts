import { describe, expect, it } from "vitest";
import {
  adoptMidiMeterMapCommand,
  adoptMidiTempoMapAutomationCommand,
  adoptMidiTempoMapStartCommand,
  branchGeneratedDrumsCommand,
  collapseGeneratedDrumBranchesCommand,
  convertMidiBassToGeneratedOverlaysCommand,
  convertMidiChordsToGeneratedOverlaysCommand,
  convertMidiDrumsToBranchOverlaysCommand,
  convertMidiArrangementToGeneratedOverlaysCommand,
  convertMidiMelodyToGeneratedOverlaysCommand,
  copySelectedClip,
  copySelectedClipRangeCommand,
  deleteSelectedClip,
  duplicateSelectedClip,
  cropSelectedClipToTimelineSelectionCommand,
  cutSelectedClip,
  cutSelectedClipRangeCommand,
  cycleDrumBranchStepCommand,
  moveClipToBarCommand,
  pasteClipAtPlayhead,
  rippleDeleteSelectedClipRangeCommand,
  setSelectedGeneratedClipStemMuteCommand,
  setTimelineSelectionRangeCommand,
  splitTimelineSelectionCommand,
  toggleSelectedClipMute,
  toggleDrumBranchGroupCollapsedCommand,
  undoCommand
} from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { DRUM_LANE_DEFS, drumBranchGroupCollapsed, generatedDrumBranchLane, getDrumBranchStepLevel } from "../src/daw/drumLanes";
import { bassOverlayCount } from "../src/daw/bassOverlays";
import { chordOverlayCount } from "../src/daw/chordOverlays";
import { melodyOverlayCount } from "../src/daw/melodyOverlays";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import type { Clip } from "../src/daw/schema";
import { createUndoStack } from "../src/daw/undo";
import { clipSourceStartBar } from "../src/daw/clips";
import { metalArrangementMidiBytes, multiTrackChannelMidiBytes, tempoMapMidiBytes } from "./midiFixtures";

describe("generated clip edit commands", () => {
  it("branches and collapses generated drums through the undoable command path", () => {
    const state = createInitialState();

    const branched = branchGeneratedDrumsCommand(state);
    expect(branched.undoStack.present.tracks.filter((track) => generatedDrumBranchLane(track))).toHaveLength(DRUM_LANE_DEFS.length);
    expect(branched.undoStack.past.length).toBe(state.undoStack.past.length + 1);
    expect(branched.status).toContain("Branched generated drums");

    const collapsed = collapseGeneratedDrumBranchesCommand(branched);
    expect(collapsed.undoStack.present.tracks.some((track) => generatedDrumBranchLane(track))).toBe(false);
    expect(collapsed.undoStack.past.length).toBe(branched.undoStack.past.length + 1);
    expect(collapsed.status).toContain(`Collapsed ${DRUM_LANE_DEFS.length} generated drum branch`);
  });

  it("hides and shows generated drum branch rows without deleting branch tracks", () => {
    const branched = branchGeneratedDrumsCommand(createInitialState());

    const hidden = toggleDrumBranchGroupCollapsedCommand(branched);
    expect(hidden.undoStack.present.tracks.filter((track) => generatedDrumBranchLane(track))).toHaveLength(DRUM_LANE_DEFS.length);
    expect(drumBranchGroupCollapsed(hidden.undoStack.present)).toBe(true);
    expect(hidden.undoStack.past.length).toBe(branched.undoStack.past.length + 1);
    expect(hidden.status).toContain("Hid generated drum branch rows");

    const shown = toggleDrumBranchGroupCollapsedCommand(hidden);
    expect(shown.undoStack.present.tracks.filter((track) => generatedDrumBranchLane(track))).toHaveLength(DRUM_LANE_DEFS.length);
    expect(drumBranchGroupCollapsed(shown.undoStack.present)).toBe(false);
    expect(shown.status).toContain("Showed generated drum branch rows");
  });

  it("edits DAW-only drum branch overlay steps through the undoable command path", () => {
    const branched = branchGeneratedDrumsCommand(createInitialState());

    const edited = cycleDrumBranchStepCommand(branched, "A", "tomhi", 6);

    expect(getDrumBranchStepLevel(edited.undoStack.present, "A", "tomhi", 6)).toBe(1);
    expect(edited.undoStack.past.length).toBe(branched.undoStack.past.length + 1);
    expect(edited.status).toContain("tomhi branch drum");
  });

  it("maps selected MIDI drum clips into generated drum branch overlays through the command path", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";

    const edited = convertMidiDrumsToBranchOverlaysCommand(state);

    expect(getDrumBranchStepLevel(edited.undoStack.present, "A", "kick", 0)).toBeGreaterThan(0);
    expect(getDrumBranchStepLevel(edited.undoStack.present, "A", "snare", 4)).toBeGreaterThan(0);
    expect(getDrumBranchStepLevel(edited.undoStack.present, "A", "hat", 8)).toBeGreaterThan(0);
    expect(edited.undoStack.present.tracks.some((track) => generatedDrumBranchLane(track) === "kick")).toBe(true);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Mapped");
    expect(edited.status).toContain("MIDI drum");
  });

  it("maps selected MIDI melodic clips into generated melody overlays through the command path", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";

    const edited = convertMidiMelodyToGeneratedOverlaysCommand(state);

    expect(melodyOverlayCount(edited.undoStack.present, "A", 0)).toBeGreaterThanOrEqual(3);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Mapped");
    expect(edited.status).toContain("MIDI melodic");
  });

  it("maps selected MIDI bass clips into generated bass overlays through the command path", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";

    const edited = convertMidiBassToGeneratedOverlaysCommand(state);

    expect(bassOverlayCount(edited.undoStack.present, "A")).toBe(2);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Mapped");
    expect(edited.status).toContain("MIDI bass");
  });

  it("maps selected MIDI bass clips from a chosen source track through the command path", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(multiTrackChannelMidiBytes()), "band.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";
    state.midiConversionSourceMode = "source-track";
    state.midiConversionSourceValue = 2;

    const edited = convertMidiBassToGeneratedOverlaysCommand(state);

    expect(bassOverlayCount(edited.undoStack.present, "A")).toBe(1);
    expect(edited.status).toContain("source track 3");
    expect(edited.status).toContain("Mapped");
  });

  it("maps selected MIDI chord groups into generated chord overlays through the command path", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";

    const edited = convertMidiChordsToGeneratedOverlaysCommand(state);

    expect(chordOverlayCount(edited.undoStack.present, "A")).toBe(2);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Mapped");
    expect(edited.status).toContain("MIDI chord");
  });

  it("maps selected MIDI clips into a full generated arrangement without replacing the raw clip", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";

    const edited = convertMidiArrangementToGeneratedOverlaysCommand(state);
    const sourceClip = edited.undoStack.present.timeline.clips.find((clip) => clip.id === imported.clipId) as Clip | undefined;

    expect(getDrumBranchStepLevel(edited.undoStack.present, "A", "kick", 0)).toBeGreaterThan(0);
    expect(bassOverlayCount(edited.undoStack.present, "A")).toBe(2);
    expect(chordOverlayCount(edited.undoStack.present, "A")).toBe(2);
    expect(melodyOverlayCount(edited.undoStack.present, "A", 0)).toBeGreaterThanOrEqual(3);
    expect(sourceClip?.type).toBe("midi");
    expect(sourceClip?.mediaPoolItemId).toBe(imported.item.id);
    expect(sourceClip?.muted).not.toBe(true);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Mapped MIDI arrangement from metal.mid");
    expect(edited.status).toContain("drums");
    expect(edited.status).toContain("bass");
    expect(edited.status).toContain("chords");
    expect(edited.status).toContain("melody");
  });

  it("can remove the raw MIDI reference clip after successful arrangement mapping", () => {
    const state = createInitialState();
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";
    state.midiConversionKeepRawReference = false;

    const edited = convertMidiArrangementToGeneratedOverlaysCommand(state);

    expect(edited.undoStack.present.timeline.clips.some((clip) => clip.id === imported.clipId)).toBe(false);
    expect(edited.undoStack.present.mediaPool.some((item) => item.id === imported.item.id)).toBe(true);
    expect(bassOverlayCount(edited.undoStack.present, "A")).toBe(2);
    expect(edited.selectedClipId).not.toBe(imported.clipId);
    expect(edited.status).toContain("Raw MIDI reference removed from the timeline");
  });

  it("uses the selected melody target when mapping MIDI melody and arrangements", () => {
    const steps = 16;
    const twoMelodyProject = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({
      title: "Two Melody MIDI Target",
      sectionBars: { A: 1 },
      songSequence: ["A"],
      melodyTracksA: [new Array<number | null>(steps).fill(null), new Array<number | null>(steps).fill(null)],
      melodyInstrumentsA: ["pulse", "distorted_lead_guitar"],
      melodyOctavesA: [0, 0],
      melodyMuteA: [false, false],
      melodySoloA: [false, false],
      melodyPanA: [0, 0.1],
      melodyHoldA: [new Array<boolean>(steps).fill(false), new Array<boolean>(steps).fill(false)],
      melodySlideA: [new Array<boolean>(steps).fill(false), new Array<boolean>(steps).fill(false)],
      melodyTupletsA: [new Array<boolean>(steps).fill(false), new Array<boolean>(steps).fill(false)]
    }));
    const state = createInitialState();
    const imported = importMidiFileToProject(twoMelodyProject, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.chordsmithEditorSectionId = "A";
    state.chordsmithEditorMelodyTrackIndex = 1;

    const melody = convertMidiMelodyToGeneratedOverlaysCommand(state);
    const arrangement = convertMidiArrangementToGeneratedOverlaysCommand(state);

    expect(melodyOverlayCount(melody.undoStack.present, "A", 1)).toBeGreaterThanOrEqual(3);
    expect(melody.status).toContain("Melody 2");
    expect(melody.chordsmithEditorMelodyTrackIndex).toBe(1);
    expect(melodyOverlayCount(arrangement.undoStack.present, "A", 1)).toBeGreaterThanOrEqual(3);
    expect(arrangement.chordsmithEditorMelodyTrackIndex).toBe(1);
  });

  it("adopts imported MIDI start tempo and supported meter through the command path", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 100;
    state.undoStack.present.project.timeSig = 5;
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = adoptMidiTempoMapStartCommand(state);

    expect(edited.undoStack.present.project.bpm).toBe(120);
    expect(edited.undoStack.present.project.timeSig).toBe(4);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Adopted MIDI start 120 BPM and 4/4");
  });

  it("converts imported MIDI tempo maps into project tempo automation", () => {
    const state = createInitialState();
    state.undoStack.present.project.bpm = 100;
    state.undoStack.present.project.timeSig = 5;
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = adoptMidiTempoMapAutomationCommand(state);
    const lane = edited.undoStack.present.automation.lanes.find((item) => item.targetPath === "project.tempo")!;
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(edited.undoStack.present.project.bpm).toBe(120);
    expect(lane.points).toEqual([
      { bar: 1, value: 120, curve: "hold" },
      { bar: 1.25, value: 140, curve: "hold" }
    ]);
    expect(clip.type).toBe("midi");
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Converted 2 MIDI tempo events");
  });

  it("converts imported MIDI meter maps into project meter-map points", () => {
    const state = createInitialState();
    state.undoStack.present.project.timeSig = 5;
    const imported = importMidiFileToProject(state.undoStack.present, parseStandardMidiFile(tempoMapMidiBytes()), "tempo-map.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = adoptMidiMeterMapCommand(state);

    expect(edited.undoStack.present.project.timeSig).toBe(4);
    expect(edited.undoStack.present.project.meterMap).toEqual([
      expect.objectContaining({ id: "meter_1", bar: 1, numerator: 4, denominator: 4, source: "midi-import", sourceClipId: imported.clipId, sourceTick: 0 }),
      expect.objectContaining({ id: "meter_2", bar: 1.25, numerator: 3, denominator: 4, source: "midi-import", sourceClipId: imported.clipId, sourceTick: 480 })
    ]);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.status).toContain("Converted 2 MIDI meter events");
  });

  it("applies generated clip stem mutes through the undoable command path", () => {
    const state = createInitialState();
    const clip = state.undoStack.present.timeline.clips.find((item) => item.type === "generated-section")!;
    state.selectedClipId = clip.id;
    state.selectedTrackId = clip.trackId;

    const muted = setSelectedGeneratedClipStemMuteCommand(state, clip.id, "guitar", true);
    const updated = muted.undoStack.present.timeline.clips.find((item) => item.id === clip.id)!;

    expect(updated.transforms.stemMutes.guitar).toBe(true);
    expect(muted.undoStack.past.length).toBe(state.undoStack.past.length + 1);
    expect(muted.selectedClipId).toBe(clip.id);
    expect(muted.selectedTrackId).toBe(clip.trackId);
    expect(muted.status).toContain("Muted guitar");
  });

  it("guards stem mutes to generated section clips", () => {
    const state = createInitialState();
    const audioLikeClip = {
      ...state.undoStack.present.timeline.clips[0],
      id: "audio-like",
      type: "audio" as const
    };
    state.undoStack.present.timeline.clips.push(audioLikeClip);

    const result = setSelectedGeneratedClipStemMuteCommand(state, audioLikeClip.id, "bass", true);

    expect(result.undoStack.present).toBe(state.undoStack.present);
    expect(result.status).toBe("Choose a generated section before editing stem mutes.");
  });

  it("edits generated-pattern clip ranges through the undoable command path", () => {
    const state = createInitialState();
    const track = state.undoStack.present.tracks.find((item) => item.id === "drums")!;
    const pattern: Clip = {
      id: "pattern-command",
      type: "generated-pattern",
      trackId: track.id,
      startBar: 2,
      barLength: 4,
      name: "Command Pattern",
      muted: false,
      color: track.colour,
      linked: true,
      transforms: { transpose: 0, octave: 0, gain: 1, stemMutes: {} },
      metadata: { sourceStartBar: 6, patternId: "cmd-a" }
    };
    const later: Clip = {
      ...JSON.parse(JSON.stringify(pattern)),
      id: "pattern-command-later",
      startBar: 8,
      barLength: 2,
      name: "Command Pattern Later",
      metadata: { sourceStartBar: 16, patternId: "cmd-b" }
    };
    state.undoStack.present.timeline.clips = [pattern, later];
    state.selectedClipId = pattern.id;
    state.selectedTrackId = track.id;

    const ranged = setTimelineSelectionRangeCommand(state, 3, 5);
    const split = splitTimelineSelectionCommand(ranged);
    const splitSegments = split.undoStack.present.timeline.clips
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    expect(split.status).toBe("Split 2 clip boundaries at edit range.");
    expect(splitSegments.map((clip) => [clip.startBar, clip.barLength, clip.metadata?.sourceStartBar])).toEqual([
      [2, 1, 6],
      [3, 2, 7],
      [5, 1, 9],
      [8, 2, 16]
    ]);

    const cropped = cropSelectedClipToTimelineSelectionCommand(ranged);
    const croppedClip = cropped.undoStack.present.timeline.clips.find((clip) => clip.id === pattern.id)!;
    expect(cropped.status).toBe("Cropped Command Pattern to edit range.");
    expect([croppedClip.startBar, croppedClip.barLength, croppedClip.metadata?.sourceStartBar]).toEqual([3, 2, 7]);

    const rippled = rippleDeleteSelectedClipRangeCommand(ranged);
    const rippleSegments = rippled.undoStack.present.timeline.clips
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    expect(rippled.status).toBe("Ripple deleted range from Command Pattern; moved 2 clips.");
    expect(rippleSegments.map((clip) => [clip.startBar, clip.barLength, clip.metadata?.sourceStartBar])).toEqual([
      [2, 1, 6],
      [3, 1, 9],
      [6, 2, 16]
    ]);
  });
});

describe("selected clip clipboard commands", () => {
  it("moves multiple selected clips as a group when one selected clip is dragged to a bar", () => {
    const state = createInitialState();
    const selected = state.undoStack.present.timeline.clips.slice(0, 2).sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    const anchor = selected[1];
    state.selectedClipId = anchor.id;
    state.selectedClipIds = selected.map((clip) => clip.id);
    const delta = 9 - anchor.startBar;

    const moved = moveClipToBarCommand(state, anchor.id, 9);
    const movedClips = selected.map((clip) => moved.undoStack.present.timeline.clips.find((item) => item.id === clip.id)!);

    expect(moved.status).toBe("Moved 2 selected clips to Bar 9.");
    expect(moved.undoStack.past).toHaveLength(state.undoStack.past.length + 1);
    expect(moved.selectedClipId).toBe(anchor.id);
    expect(moved.selectedClipIds).toEqual(selected.map((clip) => clip.id));
    expect(movedClips.map((clip) => clip.startBar)).toEqual(selected.map((clip) => clip.startBar + delta));
  });

  it("duplicates multiple selected clips as one undoable arrangement group", () => {
    const state = createInitialState();
    const selected = state.undoStack.present.timeline.clips.slice(0, 2).sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    state.selectedClipId = selected[0].id;
    state.selectedClipIds = selected.map((clip) => clip.id);
    const span = Math.max(...selected.map((clip) => clip.startBar + clip.barLength)) - Math.min(...selected.map((clip) => clip.startBar));

    const duplicated = duplicateSelectedClip(state);
    const duplicatedClips = (duplicated.selectedClipIds || [])
      .map((id) => duplicated.undoStack.present.timeline.clips.find((clip) => clip.id === id)!)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));

    expect(duplicated.status).toBe("Duplicated 2 selected clips.");
    expect(duplicated.undoStack.past).toHaveLength(state.undoStack.past.length + 1);
    expect(duplicated.selectedClipIds).toHaveLength(2);
    expect(duplicatedClips.map((clip) => clip.name)).toEqual(selected.map((clip) => `${clip.name} copy`));
    expect(duplicatedClips.map((clip) => clip.startBar)).toEqual(selected.map((clip) => clip.startBar + span));
  });

  it("mutes and deletes multiple selected clips through one command", () => {
    const state = createInitialState();
    const selected = state.undoStack.present.timeline.clips.slice(0, 2);
    state.selectedClipId = selected[0].id;
    state.selectedClipIds = selected.map((clip) => clip.id);

    const muted = toggleSelectedClipMute(state);
    expect(muted.status).toBe("Muted 2 selected clips.");
    expect(selected.every((clip) => muted.undoStack.present.timeline.clips.find((item) => item.id === clip.id)?.muted)).toBe(true);
    expect(muted.selectedClipIds).toEqual(selected.map((clip) => clip.id));

    const unmuted = toggleSelectedClipMute(muted);
    expect(unmuted.status).toBe("Unmuted 2 selected clips.");
    expect(selected.every((clip) => unmuted.undoStack.present.timeline.clips.find((item) => item.id === clip.id)?.muted === false)).toBe(true);

    const deleted = deleteSelectedClip(state);
    expect(deleted.status).toBe("Deleted 2 selected clips.");
    expect(selected.some((clip) => deleted.undoStack.present.timeline.clips.some((item) => item.id === clip.id))).toBe(false);
    expect(deleted.undoStack.past).toHaveLength(state.undoStack.past.length + 1);
    expect(deleted.selectedClipIds).toEqual(deleted.selectedClipId ? [deleted.selectedClipId] : []);
  });

  it("copies, cuts and pastes multiple selected clips while preserving relative timing", () => {
    const state = createInitialState();
    const selected = state.undoStack.present.timeline.clips.slice(0, 2).sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    state.selectedClipId = selected[0].id;
    state.selectedClipIds = selected.map((clip) => clip.id);
    const baseStart = Math.min(...selected.map((clip) => clip.startBar));

    const copied = copySelectedClip(state);
    expect(copied.status).toBe("Copied 2 selected clips.");
    expect(copied.clipClipboard).toBeNull();
    expect(copied.clipClipboardGroup).toHaveLength(2);

    const pasted = pasteClipAtPlayhead({ ...copied, playheadBar: 12 });
    const pastedClips = (pasted.selectedClipIds || [])
      .map((id) => pasted.undoStack.present.timeline.clips.find((clip) => clip.id === id)!)
      .sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id));
    expect(pasted.status).toBe("Pasted 2 clips at playhead.");
    expect(pastedClips.map((clip) => clip.startBar)).toEqual(selected.map((clip) => 12 + (clip.startBar - baseStart)));
    expect(pastedClips.map((clip) => clip.name)).toEqual(selected.map((clip) => `${clip.name} pasted`));

    const cut = cutSelectedClip(state);
    expect(cut.status).toBe("Cut 2 selected clips.");
    expect(cut.clipClipboardGroup).toHaveLength(2);
    expect(selected.some((clip) => cut.undoStack.present.timeline.clips.some((item) => item.id === clip.id))).toBe(false);
  });

  it("cuts the selected clip as one undoable edit and keeps it pasteable", () => {
    const state = createInitialState();
    const originalClip = state.undoStack.present.timeline.clips.find((clip) => clip.id === state.selectedClipId)!;
    const originalCount = state.undoStack.present.timeline.clips.length;

    const cut = cutSelectedClip(state);

    expect(cut.status).toBe(`Cut ${originalClip.name}.`);
    expect(cut.clipClipboard).toMatchObject({
      id: originalClip.id,
      name: originalClip.name,
      trackId: originalClip.trackId,
      startBar: originalClip.startBar,
      barLength: originalClip.barLength
    });
    expect(cut.undoStack.present.timeline.clips).toHaveLength(originalCount - 1);
    expect(cut.undoStack.present.timeline.clips.some((clip) => clip.id === originalClip.id)).toBe(false);
    expect(cut.undoStack.past).toHaveLength(state.undoStack.past.length + 1);

    const undone = undoCommand(cut);
    expect(undone.undoStack.present.timeline.clips.some((clip) => clip.id === originalClip.id)).toBe(true);

    const pasted = pasteClipAtPlayhead({ ...cut, playheadBar: originalClip.startBar + 2 });
    const pastedClip = pasted.undoStack.present.timeline.clips.find((clip) => clip.id === pasted.selectedClipId)!;

    expect(pasted.status).toBe("Pasted clip at playhead.");
    expect(pastedClip.id).not.toBe(originalClip.id);
    expect(pastedClip.name).toBe(`${originalClip.name} pasted`);
    expect(pastedClip.trackId).toBe(originalClip.trackId);
    expect(pastedClip.startBar).toBe(originalClip.startBar + 2);
  });

  it("does not mutate the project when no clip is selected for cutting", () => {
    const state = { ...createInitialState(), selectedClipId: null };

    const cut = cutSelectedClip(state);

    expect(cut.undoStack.present).toBe(state.undoStack.present);
    expect(cut.clipClipboard).toBeNull();
    expect(cut.status).toBe("Select a clip to cut.");
  });

  it("copies and cuts selected clip ranges through the normal clipboard", () => {
    const state = createInitialState();
    const clip = state.undoStack.present.timeline.clips.find((item) => item.id === state.selectedClipId)!;
    const ranged = setTimelineSelectionRangeCommand(state, clip.startBar + 1, clip.startBar + 3);

    const copied = copySelectedClipRangeCommand(ranged);

    expect(copied.status).toBe(`Copied range from ${clip.name}.`);
    expect(copied.undoStack).toBe(ranged.undoStack);
    expect(copied.clipClipboard?.barLength).toBe(2);
    expect(copied.clipClipboard ? clipSourceStartBar(copied.clipClipboard) : -1).toBe(1);

    const pasted = pasteClipAtPlayhead({ ...copied, playheadBar: clip.startBar + 8 });
    const pastedClip = pasted.undoStack.present.timeline.clips.find((item) => item.id === pasted.selectedClipId)!;
    expect(pastedClip.barLength).toBe(2);
    expect(clipSourceStartBar(pastedClip)).toBe(1);

    const cut = cutSelectedClipRangeCommand(ranged);
    const rightClip = cut.selectedClipId
      ? cut.undoStack.present.timeline.clips.find((item) => item.id === cut.selectedClipId)
      : null;
    const remaining = cut.undoStack.present.timeline.clips
      .filter((item) => item.id === clip.id || item.id === rightClip?.id)
      .sort((a, b) => a.startBar - b.startBar);

    expect(cut.status).toBe(`Cut range from ${clip.name}.`);
    expect(cut.clipClipboard?.barLength).toBe(2);
    expect(cut.clipClipboard ? clipSourceStartBar(cut.clipClipboard) : -1).toBe(1);
    expect(cut.undoStack.past).toHaveLength(ranged.undoStack.past.length + 1);
    expect(remaining.map((item) => [item.startBar, item.barLength, clipSourceStartBar(item)])).toEqual([
      [clip.startBar, 1, 0],
      [clip.startBar + 3, clip.barLength - 3, 3]
    ]);
  });
});
