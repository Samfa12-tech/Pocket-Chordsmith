import { describe, expect, it } from "vitest";
import { addMidiAftertouchCommand, addMidiControllerCommand, addMidiNoteCommand, addMidiPitchBendCommand, addMidiProgramChangeCommand, applyMidiGrooveTemplateCommand, cropSelectedClipToTimelineSelectionCommand, deleteMidiAftertouchCommand, deleteMidiControllerCommand, deleteMidiPitchBendCommand, deleteMidiProgramChangeCommand, deleteSelectedClipRangeCommand, duplicateMidiAftertouchCommand, duplicateMidiControllerCommand, duplicateMidiNoteCommand, duplicateMidiPitchBendCommand, duplicateMidiProgramChangeCommand, quantizeMidiClipCommand, rippleDeleteSelectedClipRangeCommand, setMidiAftertouchFieldCommand, setMidiClipBarLengthCommand, setMidiControllerFieldCommand, setMidiNoteFieldCommand, setMidiPitchBendFieldCommand, setMidiProgramChangeFieldCommand, setTimelineSelectionRangeCommand, splitTimelineSelectionCommand, swingMidiClipCommand, transformMidiPitchCommand, transformMidiVelocityCommand } from "../src/app/commands";
import { createInitialState } from "../src/app/state";
import { createEmptyPocketDawProject } from "../src/daw/dawProject";
import { addMidiNote, importMidiFileToProject, midiDataFromClip } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createUndoStack } from "../src/daw/undo";
import { simpleMidiBytes } from "./midiFixtures";

describe("MIDI edit commands", () => {
  it("quantizes a selected MIDI clip through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLooseNote = addMidiNote(imported.project, imported.clipId, 181);
    state.undoStack = createUndoStack(withLooseNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = quantizeMidiClipCommand(state, imported.clipId, "1/16");
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const notes = midiDataFromClip(clip).notes;

    expect(notes.some((note) => note.startTick === 240)).toBe(true);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Quantized lead.mid to 1/16");
  });

  it("quantizes with a non-default grid through the command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLooseNote = addMidiNote(imported.project, imported.clipId, 181);
    state.undoStack = createUndoStack(withLooseNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = quantizeMidiClipCommand(state, imported.clipId, "1/4");
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const notes = midiDataFromClip(clip).notes;

    expect(notes.some((note) => note.startTick === 0)).toBe(true);
    expect(midiDataFromClip(clip).metadata?.lastQuantizeGrid).toBe("1/4");
    expect(edited.status).toContain("Quantized lead.mid to 1/4");
  });

  it("does not quantize non-MIDI clips", () => {
    const state = createInitialState();

    const edited = quantizeMidiClipCommand(state, "missing", "1/16");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a MIDI clip");
  });

  it("edits MIDI clip length through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLaterNote = addMidiNote(imported.project, imported.clipId, 1920);
    state.undoStack = createUndoStack(withLaterNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = setMidiClipBarLengthCommand(state, imported.clipId, 2.5);
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(clip.barLength).toBe(2.5);
    expect(midiDataFromClip(clip).notes.map((note) => note.startTick)).toContain(1920);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Set lead.mid length to 2.5 bars");
  });

  it("adds MIDI notes at playhead positions relative to the selected clip start", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "late.mid");
    imported.project.timeline.clips.find((item) => item.id === imported.clipId)!.startBar = 5;
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 5.5;

    const edited = addMidiNoteCommand(state, imported.clipId);
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const notes = midiDataFromClip(clip).notes;

    expect(notes.at(-1)).toMatchObject({ startTick: 960, durationTicks: 480 });
    expect(clip.barLength).toBe(1);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Added MIDI note to late.mid");
  });

  it("extends MIDI clip length when Add Note lands past the current clip end", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "extend.mid");
    imported.project.timeline.clips.find((item) => item.id === imported.clipId)!.barLength = 1;
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 2.25;

    const edited = addMidiNoteCommand(state, imported.clipId);
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(clip).notes.at(-1)).toMatchObject({ startTick: 2400, durationTicks: 480 });
    expect(clip.barLength).toBe(1.5);
    expect(edited.undoStack.past).toHaveLength(1);
  });

  it("edits MIDI program changes through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "program.mid");
    imported.project.timeline.clips.find((item) => item.id === imported.clipId)!.startBar = 3;
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 3.5;

    const added = addMidiProgramChangeCommand(state, imported.clipId);
    const addedClip = added.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const programId = midiDataFromClip(addedClip).programChanges[0].id;

    expect(midiDataFromClip(addedClip).programChanges[0]).toMatchObject({ program: 0, tick: 960, channel: 0 });
    expect(added.undoStack.past).toHaveLength(1);
    expect(added.selectedClipId).toBe(imported.clipId);
    expect(added.selectedTrackId).toBe(imported.trackId);
    expect(added.status).toContain("Added program change to program.mid");

    const setProgram = setMidiProgramChangeFieldCommand(added, imported.clipId, programId, "program", 42);
    const setChannel = setMidiProgramChangeFieldCommand(setProgram, imported.clipId, programId, "channel", 2);
    const duplicated = duplicateMidiProgramChangeCommand(setChannel, imported.clipId, programId);
    const duplicatedClip = duplicated.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(duplicatedClip).programChanges).toEqual([
      expect.objectContaining({ id: programId, program: 42, tick: 960, channel: 2 }),
      expect.objectContaining({ program: 42, tick: 1440, channel: 2 })
    ]);
    expect(duplicated.undoStack.past).toHaveLength(4);
    expect(duplicated.status).toContain("Duplicated program.mid program change");

    const deleted = deleteMidiProgramChangeCommand(duplicated, imported.clipId, programId);
    const deletedClip = deleted.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(deletedClip).programChanges).toEqual([
      expect.objectContaining({ program: 42, tick: 1440, channel: 2 })
    ]);
    expect(deleted.undoStack.past).toHaveLength(5);
    expect(deleted.status).toContain("Deleted program.mid program change");
  });

  it("edits MIDI pitch bends through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "bend.mid");
    imported.project.timeline.clips.find((item) => item.id === imported.clipId)!.startBar = 2;
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 2.25;

    const added = addMidiPitchBendCommand(state, imported.clipId);
    const addedClip = added.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const bendId = midiDataFromClip(addedClip).pitchBends[0].id;

    expect(midiDataFromClip(addedClip).pitchBends[0]).toMatchObject({ value: 8192, tick: 480, channel: 0 });
    expect(added.undoStack.past).toHaveLength(1);
    expect(added.status).toContain("Added pitch bend to bend.mid");

    const setValue = setMidiPitchBendFieldCommand(added, imported.clipId, bendId, "value", 10240);
    const setChannel = setMidiPitchBendFieldCommand(setValue, imported.clipId, bendId, "channel", 4);
    const moved = setMidiPitchBendFieldCommand(setChannel, imported.clipId, bendId, "tick", 5280);
    const duplicated = duplicateMidiPitchBendCommand(moved, imported.clipId, bendId);
    const duplicatedClip = duplicated.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(duplicatedClip.barLength).toBeGreaterThanOrEqual(3);
    expect(midiDataFromClip(duplicatedClip).pitchBends).toEqual([
      expect.objectContaining({ id: bendId, value: 10240, tick: 5280, channel: 4 }),
      expect.objectContaining({ value: 10240, tick: 5760, channel: 4 })
    ]);
    expect(duplicated.undoStack.past).toHaveLength(5);
    expect(duplicated.status).toContain("Duplicated bend.mid pitch bend");

    const deleted = deleteMidiPitchBendCommand(duplicated, imported.clipId, bendId);
    const deletedClip = deleted.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(deletedClip).pitchBends).toEqual([
      expect.objectContaining({ value: 10240, tick: 5760, channel: 4 })
    ]);
    expect(deleted.undoStack.past).toHaveLength(6);
    expect(deleted.status).toContain("Deleted bend.mid pitch bend");
  });

  it("edits MIDI aftertouch through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "touch.mid");
    imported.project.timeline.clips.find((item) => item.id === imported.clipId)!.startBar = 2;
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 2.25;

    const added = addMidiAftertouchCommand(state, imported.clipId);
    const addedClip = added.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const aftertouchId = midiDataFromClip(addedClip).aftertouch[0].id;

    expect(midiDataFromClip(addedClip).aftertouch[0]).toMatchObject({ kind: "channel", value: 64, tick: 480, channel: 0 });
    expect(added.undoStack.past).toHaveLength(1);
    expect(added.status).toContain("Added aftertouch to touch.mid");

    const setValue = setMidiAftertouchFieldCommand(added, imported.clipId, aftertouchId, "value", 96);
    const setChannel = setMidiAftertouchFieldCommand(setValue, imported.clipId, aftertouchId, "channel", 5);
    const moved = setMidiAftertouchFieldCommand(setChannel, imported.clipId, aftertouchId, "tick", 5280);
    const duplicated = duplicateMidiAftertouchCommand(moved, imported.clipId, aftertouchId);
    const duplicatedClip = duplicated.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(duplicatedClip.barLength).toBeGreaterThanOrEqual(3);
    expect(midiDataFromClip(duplicatedClip).aftertouch).toEqual([
      expect.objectContaining({ id: aftertouchId, kind: "channel", value: 96, tick: 5280, channel: 5 }),
      expect.objectContaining({ kind: "channel", value: 96, tick: 5760, channel: 5 })
    ]);
    expect(duplicated.undoStack.past).toHaveLength(5);
    expect(duplicated.status).toContain("Duplicated touch.mid aftertouch");

    const deleted = deleteMidiAftertouchCommand(duplicated, imported.clipId, aftertouchId);
    const deletedClip = deleted.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;

    expect(midiDataFromClip(deletedClip).aftertouch).toEqual([
      expect.objectContaining({ kind: "channel", value: 96, tick: 5760, channel: 5 })
    ]);
    expect(deleted.undoStack.past).toHaveLength(6);
    expect(deleted.status).toContain("Deleted touch.mid aftertouch");
  });

  it("applies MIDI swing through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withOffbeatNote = addMidiNote(imported.project, imported.clipId, 240);
    state.undoStack = createUndoStack(withOffbeatNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = swingMidiClipCommand(state, imported.clipId, 60);
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const notes = midiDataFromClip(clip).notes;

    expect(notes.some((note) => note.startTick === 288)).toBe(true);
    expect(midiDataFromClip(clip).metadata?.lastSwingPercent).toBe(60);
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Applied 60% swing to lead.mid");
  });

  it("applies MIDI groove templates through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLooseNote = addMidiNote(imported.project, imported.clipId, 181);
    state.undoStack = createUndoStack(withLooseNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const edited = applyMidiGrooveTemplateCommand(state, imported.clipId, "pocket-16");
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const data = midiDataFromClip(clip);

    expect(data.notes.some((note) => note.startTick === 235)).toBe(true);
    expect(data.metadata).toMatchObject({
      lastGrooveTemplate: "pocket-16",
      lastGrooveTemplateName: "Pocket 16"
    });
    expect(edited.undoStack.past).toHaveLength(1);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Applied Pocket 16 groove to lead.mid");
  });

  it("applies clip-level MIDI velocity transforms through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withNotes = addMidiNote(addMidiNote(imported.project, imported.clipId, 240), imported.clipId, 480);
    state.undoStack = createUndoStack(withNotes);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const leveled = transformMidiVelocityCommand(state, imported.clipId, "level-96");
    const leveledClip = leveled.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(leveledClip).notes.map((note) => note.velocity)).toEqual([96, 96, 96]);
    expect(midiDataFromClip(leveledClip).metadata?.lastVelocityTransform).toBe("level-96");
    expect(leveled.undoStack.past).toHaveLength(1);
    expect(leveled.selectedClipId).toBe(imported.clipId);
    expect(leveled.selectedTrackId).toBe(imported.trackId);
    expect(leveled.status).toContain("Leveled lead.mid velocities");

    const humanized = transformMidiVelocityCommand(leveled, imported.clipId, "humanize-12");
    const humanizedClip = humanized.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(humanizedClip).notes.map((note) => note.velocity)).toEqual([84, 96, 108]);
    expect(midiDataFromClip(humanizedClip).metadata?.lastVelocityTransform).toBe("humanize-12");
    expect(humanized.undoStack.past).toHaveLength(2);
    expect(humanized.status).toContain("Humanized lead.mid velocities");
  });

  it("applies clip-level MIDI pitch transforms through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withNotes = addMidiNote(imported.project, imported.clipId, 240);
    state.undoStack = createUndoStack(withNotes);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const octaveUp = transformMidiPitchCommand(state, imported.clipId, "octave-up");
    const octaveUpClip = octaveUp.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(octaveUpClip).notes.map((note) => note.pitch)).toEqual([72, 72]);
    expect(midiDataFromClip(octaveUpClip).metadata?.lastPitchTransform).toBe("octave-up");
    expect(octaveUp.undoStack.past).toHaveLength(1);
    expect(octaveUp.selectedClipId).toBe(imported.clipId);
    expect(octaveUp.selectedTrackId).toBe(imported.trackId);
    expect(octaveUp.status).toContain("Transposed lead.mid up an octave");

    const octaveDown = transformMidiPitchCommand(octaveUp, imported.clipId, "octave-down");
    const octaveDownClip = octaveDown.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(octaveDownClip).notes.map((note) => note.pitch)).toEqual([60, 60]);
    expect(midiDataFromClip(octaveDownClip).metadata?.lastPitchTransform).toBe("octave-down");
    expect(octaveDown.undoStack.past).toHaveLength(2);
    expect(octaveDown.status).toContain("Transposed lead.mid down an octave");

    const semitoneUp = transformMidiPitchCommand(octaveDown, imported.clipId, "semitone-up");
    const semitoneUpClip = semitoneUp.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(semitoneUpClip).notes.map((note) => note.pitch)).toEqual([61, 61]);
    expect(midiDataFromClip(semitoneUpClip).metadata?.lastPitchTransform).toBe("semitone-up");
    expect(semitoneUp.undoStack.past).toHaveLength(3);
    expect(semitoneUp.status).toContain("Transposed lead.mid up a semitone");
  });

  it("crops the selected MIDI clip through the undoable range command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLaterNote = addMidiNote(imported.project, imported.clipId, 1920);
    withLaterNote.timeline.clips.find((item) => item.id === imported.clipId)!.barLength = 3;
    state.undoStack = createUndoStack(withLaterNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 2, 3);
    const edited = cropSelectedClipToTimelineSelectionCommand(ranged);
    const clip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const data = midiDataFromClip(clip);

    expect(clip.startBar).toBe(2);
    expect(clip.barLength).toBe(1);
    expect(data.notes).toEqual([expect.objectContaining({ startTick: 0, durationTicks: 480 })]);
    expect(data.metadata?.lastRangeCropBars).toEqual({ startBar: 2, endBar: 3 });
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Cropped lead.mid MIDI to edit range");
  });

  it("splits MIDI clips through the undoable range command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const emptyProject = createEmptyPocketDawProject();
    emptyProject.timeline.clips = [];
    state.undoStack = createUndoStack(emptyProject);
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLaterNote = addMidiNote(imported.project, imported.clipId, 1920);
    withLaterNote.timeline.clips.find((item) => item.id === imported.clipId)!.barLength = 3;
    state.undoStack = createUndoStack(withLaterNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 2, 3);
    const edited = splitTimelineSelectionCommand(ranged);
    const clips = edited.undoStack.present.timeline.clips.filter((clip) => clip.type === "midi");

    expect(clips.map((clip) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(edited.undoStack.past).toHaveLength(2);
    expect(edited.status).toContain("Split 2 clip boundaries at edit range");
  });

  it("deletes and ripple-deletes MIDI clip ranges through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const emptyProject = createEmptyPocketDawProject();
    emptyProject.timeline.clips = [];
    state.undoStack = createUndoStack(emptyProject);
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withLaterNote = addMidiNote(imported.project, imported.clipId, 1920);
    withLaterNote.timeline.clips.find((item) => item.id === imported.clipId)!.barLength = 3;
    state.undoStack = createUndoStack(withLaterNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;

    const ranged = setTimelineSelectionRangeCommand(state, 2, 3);
    const deleted = deleteSelectedClipRangeCommand(ranged);
    const deletedClips = deleted.undoStack.present.timeline.clips.filter((clip) => clip.type === "midi").sort((a, b) => a.startBar - b.startBar);

    expect(deletedClips.map((clip) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [3, 1]]);
    expect(deleted.status).toContain("Deleted MIDI range from lead.mid");
    expect(deleted.undoStack.past).toHaveLength(2);

    const rippleState = createInitialState();
    const emptyRippleProject = createEmptyPocketDawProject();
    emptyRippleProject.timeline.clips = [];
    rippleState.undoStack = createUndoStack(emptyRippleProject);
    const rippleImported = importMidiFileToProject(rippleState.undoStack.present, parsed, "lead.mid");
    const rippleProject = addMidiNote(rippleImported.project, rippleImported.clipId, 1920);
    rippleProject.timeline.clips.find((item) => item.id === rippleImported.clipId)!.barLength = 3;
    rippleState.undoStack = createUndoStack(rippleProject);
    rippleState.selectedClipId = rippleImported.clipId;
    rippleState.selectedTrackId = rippleImported.trackId;
    const rippleRanged = setTimelineSelectionRangeCommand(rippleState, 2, 3);
    const rippled = rippleDeleteSelectedClipRangeCommand(rippleRanged);
    const rippledClips = rippled.undoStack.present.timeline.clips.filter((clip) => clip.type === "midi").sort((a, b) => a.startBar - b.startBar);

    expect(rippledClips.map((clip) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [2, 1]]);
    expect(rippled.status).toContain("Ripple deleted MIDI range from lead.mid");
    expect(rippled.undoStack.past).toHaveLength(2);
  });

  it("edits MIDI controller lane points through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 2;

    const added = addMidiControllerCommand(state, imported.clipId);
    const addedClip = added.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const controllerId = midiDataFromClip(addedClip).controllers[0].id;
    expect(midiDataFromClip(addedClip).controllers[0]).toMatchObject({ controller: 1, value: 64, tick: 1920 });
    expect(added.undoStack.past).toHaveLength(1);
    expect(added.selectedClipId).toBe(imported.clipId);
    expect(added.status).toContain("Added CC1 controller point");

    const changed = setMidiControllerFieldCommand(added, imported.clipId, controllerId, "controller", 74);
    const changedValue = setMidiControllerFieldCommand(changed, imported.clipId, controllerId, "value", 91);
    const changedTick = setMidiControllerFieldCommand(changedValue, imported.clipId, controllerId, "tick", 120);
    const changedChannel = setMidiControllerFieldCommand(changedTick, imported.clipId, controllerId, "channel", 2);
    const changedClip = changedChannel.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(changedClip).controllers[0]).toMatchObject({ controller: 74, value: 91, tick: 120, channel: 2 });
    expect(changedChannel.undoStack.past).toHaveLength(5);
    expect(changedChannel.status).toContain("Updated lead.mid controller channel");

    const deleted = deleteMidiControllerCommand(changedChannel, imported.clipId, controllerId);
    const deletedClip = deleted.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    expect(midiDataFromClip(deletedClip).controllers).toEqual([]);
    expect(deleted.undoStack.past).toHaveLength(6);
    expect(deleted.status).toContain("Deleted lead.mid controller point");
  });

  it("duplicates MIDI controller lane points through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    state.undoStack = createUndoStack(imported.project);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    state.playheadBar = 2;

    const added = addMidiControllerCommand(state, imported.clipId);
    const addedClip = added.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const controllerId = midiDataFromClip(addedClip).controllers[0].id;
    const duplicated = duplicateMidiControllerCommand(added, imported.clipId, controllerId);
    const duplicatedClip = duplicated.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const controllers = midiDataFromClip(duplicatedClip).controllers;

    expect(controllers).toEqual([
      expect.objectContaining({ id: controllerId, tick: 1920 }),
      expect.objectContaining({ tick: 2400, controller: 1, value: 64, channel: 0 })
    ]);
    expect(duplicated.undoStack.past).toHaveLength(2);
    expect(duplicated.selectedClipId).toBe(imported.clipId);
    expect(duplicated.selectedTrackId).toBe(imported.trackId);
    expect(duplicated.status).toContain("Duplicated lead.mid controller point");
  });

  it("edits precise MIDI note fields through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withNote = addMidiNote(imported.project, imported.clipId, 480);
    state.undoStack = createUndoStack(withNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    const clip = state.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;

    let edited = setMidiNoteFieldCommand(state, imported.clipId, noteId, "pitch", 72);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "startTick", 240);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "durationTicks", 960);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "velocity", 81);
    edited = setMidiNoteFieldCommand(edited, imported.clipId, noteId, "channel", 2);
    const editedClip = edited.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const note = midiDataFromClip(editedClip).notes.find((item) => item.id === noteId)!;

    expect(note).toMatchObject({ pitch: 72, startTick: 240, durationTicks: 960, velocity: 81, channel: 2 });
    expect(edited.undoStack.past).toHaveLength(5);
    expect(edited.selectedClipId).toBe(imported.clipId);
    expect(edited.selectedTrackId).toBe(imported.trackId);
    expect(edited.status).toContain("Updated lead.mid note channel");
  });

  it("duplicates MIDI notes through the undoable command path", () => {
    const state = createInitialState();
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const imported = importMidiFileToProject(state.undoStack.present, parsed, "lead.mid");
    const withNote = addMidiNote(imported.project, imported.clipId, 480);
    state.undoStack = createUndoStack(withNote);
    state.selectedClipId = imported.clipId;
    state.selectedTrackId = imported.trackId;
    const clip = state.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;

    const duplicated = duplicateMidiNoteCommand(state, imported.clipId, noteId);
    const duplicatedClip = duplicated.undoStack.present.timeline.clips.find((item) => item.id === imported.clipId)!;
    const duplicate = midiDataFromClip(duplicatedClip).notes.find((note) => note.id !== noteId && note.startTick === 960)!;

    expect(duplicate).toMatchObject({ pitch: 60, durationTicks: 480, velocity: 88, channel: 0 });
    expect(duplicated.undoStack.past).toHaveLength(1);
    expect(duplicated.selectedClipId).toBe(imported.clipId);
    expect(duplicated.selectedTrackId).toBe(imported.trackId);
    expect(duplicated.status).toContain("Duplicated lead.mid note");
  });

  it("does not swing non-MIDI clips", () => {
    const state = createInitialState();

    const edited = swingMidiClipCommand(state, "missing", 60);

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a MIDI clip");
  });

  it("does not apply groove templates to non-MIDI clips", () => {
    const state = createInitialState();

    const edited = applyMidiGrooveTemplateCommand(state, "missing", "shuffle-8");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a MIDI clip");
  });

  it("does not transform velocities on non-MIDI clips", () => {
    const state = createInitialState();

    const edited = transformMidiVelocityCommand(state, "missing", "level-96");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a MIDI clip");
  });

  it("does not transform pitch on non-MIDI clips", () => {
    const state = createInitialState();

    const edited = transformMidiPitchCommand(state, "missing", "octave-up");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a MIDI clip");
  });

  it("does not edit controller lane points on non-MIDI clips", () => {
    const state = createInitialState();

    const added = addMidiControllerCommand(state, "missing");
    const changed = setMidiControllerFieldCommand(state, "missing", "cc_1", "value", 64);
    const duplicated = duplicateMidiControllerCommand(state, "missing", "cc_1");
    const deleted = deleteMidiControllerCommand(state, "missing", "cc_1");

    expect(added.undoStack.present).toBe(state.undoStack.present);
    expect(changed.undoStack.present).toBe(state.undoStack.present);
    expect(duplicated.undoStack.present).toBe(state.undoStack.present);
    expect(deleted.undoStack.present).toBe(state.undoStack.present);
    expect(added.status).toContain("Choose a MIDI clip");
    expect(changed.status).toContain("Choose a MIDI clip");
    expect(duplicated.status).toContain("Choose a MIDI clip");
    expect(deleted.status).toContain("Choose a MIDI clip");
  });

  it("does not edit note fields on non-MIDI clips", () => {
    const state = createInitialState();

    const edited = setMidiNoteFieldCommand(state, "missing", "note_1", "pitch", 60);
    const duplicated = duplicateMidiNoteCommand(state, "missing", "note_1");

    expect(edited.undoStack.present).toBe(state.undoStack.present);
    expect(duplicated.undoStack.present).toBe(state.undoStack.present);
    expect(edited.status).toContain("Choose a MIDI clip");
    expect(duplicated.status).toContain("Choose a MIDI clip");
  });
});
