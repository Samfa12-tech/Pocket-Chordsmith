import { describe, expect, it } from "vitest";
import { branchGeneratedDrumsCommand, collapseGeneratedDrumBranchesCommand, convertMidiDrumsToBranchOverlaysCommand, convertMidiMelodyToGeneratedOverlaysCommand, cropSelectedClipToTimelineSelectionCommand, cycleDrumBranchStepCommand, rippleDeleteSelectedClipRangeCommand, setSelectedGeneratedClipStemMuteCommand, setTimelineSelectionRangeCommand, splitTimelineSelectionCommand, toggleDrumBranchGroupCollapsedCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { DRUM_LANE_DEFS, drumBranchGroupCollapsed, generatedDrumBranchLane, getDrumBranchStepLevel } from "../src/daw/drumLanes";
import { melodyOverlayCount } from "../src/daw/melodyOverlays";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import type { Clip } from "../src/daw/schema";
import { createUndoStack } from "../src/daw/undo";
import { metalArrangementMidiBytes } from "./midiFixtures";

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
