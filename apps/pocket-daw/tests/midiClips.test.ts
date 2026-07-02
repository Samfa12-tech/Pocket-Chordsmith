import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { MIDI_GROOVE_TEMPLATES, addMidiAftertouch, addMidiController, addMidiNote, addMidiPitchBend, addMidiProgramChange, applyMidiGrooveTemplate, createMidiTempoMapSummary, cropMidiClipToRange, deleteMidiAftertouch, deleteMidiClipRange, deleteMidiController, deleteMidiNote, deleteMidiPitchBend, deleteMidiProgramChange, duplicateMidiAftertouch, duplicateMidiController, duplicateMidiNote, duplicateMidiPitchBend, duplicateMidiProgramChange, importMidiFileToProject, importMidiFileToProjectWithPlacement, midiDataFromClip, moveMidiNote, quantizeMidiClip, quantizeMidiClipDurations, resizeMidiNote, rippleDeleteMidiClipRange, rippleDeleteMidiTimelineRange, setMidiAftertouchField, setMidiClipBarLength, setMidiControllerField, setMidiNoteField, setMidiNoteVelocity, setMidiPitchBendField, setMidiProgramChangeField, splitMidiClipsAtRange, swingMidiClip, transformMidiClipPitch, transformMidiClipVelocity, transposeMidiNote } from "../src/daw/midiClips";
import { createMidiChordsmithConversionPreview } from "../src/daw/midiConversionPreview";
import { parseStandardMidiFile, type ParsedMidiFile } from "../src/daw/midiParser";
import { aftertouchMidiBytes, formatOneTempoAndPianoMidiBytes, metalArrangementMidiBytes, metadataRichMidiBytes, multiTrackChannelMidiBytes, pitchBendMidiBytes, programChangeMidiBytes, simpleMidiBytes, tempoMapMidiBytes } from "./midiFixtures";

describe("MIDI clips", () => {
  it("imports MIDI as a media-pool item and timeline clip", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Test" }));
    const parsed = parseStandardMidiFile(simpleMidiBytes());
    const result = importMidiFileToProject(project, parsed, "lead.mid", "file:///lead.mid", 128);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId);

    expect(result.item.kind).toBe("midi");
    expect(result.item.metadata?.noteCount).toBe(1);
    expect(clip?.type).toBe("midi");
    expect(clip?.mediaPoolItemId).toBe(result.item.id);
    expect(result.project.tracks.find((track) => track.id === result.trackId)?.trackType).toBe("midi");
    expect(midiDataFromClip(clip!).notes[0]).toMatchObject({ pitch: 60, durationTicks: 480 });
  });

  it("previews explicit MIDI to Chordsmith conversion without mutating the imported clip", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Preview" }));
    const imported = importMidiFileToProject(project, parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    const before = JSON.stringify(imported.project);

    const preview = createMidiChordsmithConversionPreview(imported.project, imported.clipId, "A");

    expect(preview).toMatchObject({
      clipId: imported.clipId,
      sectionId: "A",
      rawMidiClip: "preserved",
      sourceNoteCount: expect.any(Number),
      mappings: {
        drums: expect.objectContaining({ written: expect.any(Number) }),
        bass: expect.objectContaining({ written: expect.any(Number) }),
        chords: expect.objectContaining({ written: expect.any(Number) }),
        melody: expect.objectContaining({ written: expect.any(Number) })
      }
    });
    expect(preview?.mappings.drums.written).toBeGreaterThan(0);
    expect(preview?.mappings.bass.written).toBeGreaterThan(0);
    expect(preview?.mappings.chords.written).toBeGreaterThan(0);
    expect(preview?.mappings.melody.written).toBeGreaterThan(0);
    expect(JSON.stringify(imported.project)).toBe(before);
  });

  it("imports MIDI controller events into editable clip metadata", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Test" }));
    const parsed = parseStandardMidiFile(simpleMidiBytes(true));
    const result = importMidiFileToProject(project, parsed, "lead-with-cc.mid", "file:///lead-with-cc.mid", 140);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.item.metadata?.controllerCount).toBe(1);
    expect(data.controllers).toEqual([
      expect.objectContaining({ controller: 1, value: 64, tick: 480, channel: 0 })
    ]);
  });

  it("imports MIDI program changes into preserving clip metadata", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Program Test" }));
    const parsed = parseStandardMidiFile(programChangeMidiBytes());
    const result = importMidiFileToProject(project, parsed, "program-change.mid", "file:///program-change.mid", 150);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.item.metadata?.programChangeCount).toBe(2);
    expect(data.programChanges).toEqual([
      expect.objectContaining({ program: 24, tick: 0, channel: 2 }),
      expect.objectContaining({ program: 40, tick: 720, channel: 2 })
    ]);
    expect(clip.barLength).toBe(1);
  });

  it("authors, edits, duplicates and deletes MIDI program changes", () => {
    const { result } = importSimpleMidi();

    const added = addMidiProgramChange(result.project, result.clipId, 240);
    const addedClip = added.timeline.clips.find((item) => item.id === result.clipId)!;
    const programId = midiDataFromClip(addedClip).programChanges[0].id;
    const edited = setMidiProgramChangeField(
      setMidiProgramChangeField(
        setMidiProgramChangeField(added, result.clipId, programId, "program", 41),
        result.clipId,
        programId,
        "channel",
        3
      ),
      result.clipId,
      programId,
      "tick",
      480
    );
    const duplicated = duplicateMidiProgramChange(edited, result.clipId, programId);
    const duplicateClip = duplicated.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(midiDataFromClip(duplicateClip).programChanges).toEqual([
      expect.objectContaining({ id: programId, program: 41, tick: 480, channel: 3 }),
      expect.objectContaining({ program: 41, tick: 960, channel: 3 })
    ]);

    const deleted = deleteMidiProgramChange(duplicated, result.clipId, programId);
    const deletedClip = deleted.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(midiDataFromClip(deletedClip).programChanges).toEqual([
      expect.objectContaining({ program: 41, tick: 960, channel: 3 })
    ]);
  });

  it("extends clips when edited MIDI controller and program ticks move beyond the current end", () => {
    const { result } = importSimpleMidi();
    const withController = addMidiController(result.project, result.clipId, 240);
    const withProgram = addMidiProgramChange(withController, result.clipId, 480);
    const clip = withProgram.timeline.clips.find((item) => item.id === result.clipId)!;
    const controllerId = midiDataFromClip(clip).controllers[0].id;
    const programId = midiDataFromClip(clip).programChanges[0].id;

    const editedController = setMidiControllerField(withProgram, result.clipId, controllerId, "tick", 4800);
    const editedProgram = setMidiProgramChangeField(editedController, result.clipId, programId, "tick", 5280);
    const editedClip = editedProgram.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(editedClip.barLength).toBeGreaterThanOrEqual(3);
    expect(midiDataFromClip(editedClip).controllers[0]).toMatchObject({ tick: 4800 });
    expect(midiDataFromClip(editedClip).programChanges[0]).toMatchObject({ tick: 5280 });
  });

  it("imports MIDI pitch bends into preserving clip metadata", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Bend Test" }));
    const parsed = parseStandardMidiFile(pitchBendMidiBytes());
    const result = importMidiFileToProject(project, parsed, "pitch-bend.mid", "file:///pitch-bend.mid", 150);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.item.metadata?.pitchBendCount).toBe(2);
    expect(data.pitchBends).toEqual([
      expect.objectContaining({ value: 8192, tick: 0, channel: 1 }),
      expect.objectContaining({ value: 12288, tick: 720, channel: 1 })
    ]);
    expect(clip.barLength).toBe(1);
  });

  it("authors, edits, duplicates and deletes MIDI pitch bends", () => {
    const { result } = importSimpleMidi();

    const added = addMidiPitchBend(result.project, result.clipId, 240);
    const addedClip = added.timeline.clips.find((item) => item.id === result.clipId)!;
    const bendId = midiDataFromClip(addedClip).pitchBends[0].id;
    const edited = setMidiPitchBendField(
      setMidiPitchBendField(
        setMidiPitchBendField(added, result.clipId, bendId, "value", 10240),
        result.clipId,
        bendId,
        "channel",
        5
      ),
      result.clipId,
      bendId,
      "tick",
      5280
    );
    const duplicated = duplicateMidiPitchBend(edited, result.clipId, bendId);
    const duplicateClip = duplicated.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(duplicateClip.barLength).toBeGreaterThanOrEqual(3);
    expect(midiDataFromClip(duplicateClip).pitchBends).toEqual([
      expect.objectContaining({ id: bendId, value: 10240, tick: 5280, channel: 5 }),
      expect.objectContaining({ value: 10240, tick: 5760, channel: 5 })
    ]);

    const deleted = deleteMidiPitchBend(duplicated, result.clipId, bendId);
    const deletedClip = deleted.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(midiDataFromClip(deletedClip).pitchBends).toEqual([
      expect.objectContaining({ value: 10240, tick: 5760, channel: 5 })
    ]);
  });

  it("imports MIDI aftertouch into preserving clip metadata", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Aftertouch Test" }));
    const parsed = parseStandardMidiFile(aftertouchMidiBytes());
    const result = importMidiFileToProject(project, parsed, "aftertouch.mid", "file:///aftertouch.mid", 150);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.item.metadata?.aftertouchCount).toBe(4);
    expect(data.aftertouch).toEqual([
      expect.objectContaining({ kind: "poly", note: 60, value: 50, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 64, tick: 0, channel: 3 }),
      expect.objectContaining({ kind: "poly", note: 60, value: 32, tick: 720, channel: 3 }),
      expect.objectContaining({ kind: "channel", value: 48, tick: 720, channel: 3 })
    ]);
    expect(clip.barLength).toBe(1);
  });

  it("authors, edits, duplicates and deletes MIDI aftertouch", () => {
    const { result } = importSimpleMidi();

    const added = addMidiAftertouch(result.project, result.clipId, 240);
    const addedClip = added.timeline.clips.find((item) => item.id === result.clipId)!;
    const aftertouchId = midiDataFromClip(addedClip).aftertouch[0].id;
    const edited = setMidiAftertouchField(
      setMidiAftertouchField(
        setMidiAftertouchField(added, result.clipId, aftertouchId, "value", 96),
        result.clipId,
        aftertouchId,
        "channel",
        6
      ),
      result.clipId,
      aftertouchId,
      "tick",
      5280
    );
    const duplicated = duplicateMidiAftertouch(edited, result.clipId, aftertouchId);
    const duplicateClip = duplicated.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(duplicateClip.barLength).toBeGreaterThanOrEqual(3);
    expect(midiDataFromClip(duplicateClip).aftertouch).toEqual([
      expect.objectContaining({ id: aftertouchId, kind: "channel", value: 96, tick: 5280, channel: 6 }),
      expect.objectContaining({ kind: "channel", value: 96, tick: 5760, channel: 6 })
    ]);

    const deleted = deleteMidiAftertouch(duplicated, result.clipId, aftertouchId);
    const deletedClip = deleted.timeline.clips.find((item) => item.id === result.clipId)!;

    expect(midiDataFromClip(deletedClip).aftertouch).toEqual([
      expect.objectContaining({ kind: "channel", value: 96, tick: 5760, channel: 6 })
    ]);
  });

  it("imports format 1 MIDI metadata from separate tempo and note tracks", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Test" }));
    const parsed = parseStandardMidiFile(formatOneTempoAndPianoMidiBytes());
    const result = importMidiFileToProject(project, parsed, "zelda-shape.mid", "file:///zelda-shape.mid", 256);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.item.metadata).toMatchObject({
      format: 1,
      ppq: 1024,
      tempoBpm: 136,
      parsedTrackCount: 2,
      noteCount: 1
    });
    expect(data.notes[0]).toMatchObject({ pitch: 60, durationTicks: 1024, trackIndex: 1 });
    expect(data.metadata?.trackSummaries).toEqual([
      expect.objectContaining({ name: "Tempo", noteCount: 0 }),
      expect.objectContaining({ name: "Acoustic Grand Piano", noteCount: 1 })
    ]);
  });

  it("keeps rich MIDI import metadata on media-pool items and clips", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Metadata Test" }));
    const parsed = parseStandardMidiFile(metadataRichMidiBytes());
    const result = importMidiFileToProject(project, parsed, "metadata.mid", "file:///metadata.mid", 320);
    const clip = result.project.timeline.clips.find((item) => item.id === result.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.item.metadata).toMatchObject({
      tempoBpm: 120,
      timeSig: 3,
      keySignatureCount: 1,
      lyricCount: 1,
      sysexCount: 1
    });
    expect(data.metadata?.keySignatures).toEqual([expect.objectContaining({ sharpsFlats: -1, minor: true })]);
    expect(data.metadata?.lyrics).toEqual([expect.objectContaining({ text: "hello" })]);
  });

  it("warns about preserved tempo and meter maps that are not yet rendered as lanes", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Tempo Map Test" }));
    const parsed = parseStandardMidiFile(tempoMapMidiBytes());
    const result = importMidiFileToProject(project, parsed, "tempo-map.mid", "file:///tempo-map.mid", 384);

    expect(result.item.metadata?.importWarnings).toEqual([
      expect.stringContaining("2 tempo events"),
      expect.stringContaining("2 time-signature events")
    ]);
    expect(result.item.metadata?.tempoEvents).toEqual([
      expect.objectContaining({ bpm: 120 }),
      expect.objectContaining({ bpm: 140 })
    ]);
    expect(result.item.metadata?.timeSignatureEvents).toEqual([
      expect.objectContaining({ numerator: 4, denominator: 4 }),
      expect.objectContaining({ numerator: 3, denominator: 4 })
    ]);
  });

  it("summarizes imported MIDI tempo and meter maps with positions", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Tempo Summary", bpm: 100 }));
    const parsed = parseStandardMidiFile(tempoMapMidiBytes());
    const result = importMidiFileToProject(project, parsed, "tempo-map.mid", "file:///tempo-map.mid", 384);
    const summary = createMidiTempoMapSummary(result.item.metadata, { fallbackBpm: project.project.bpm, fallbackTimeSig: project.project.timeSig });

    expect(summary?.hasTempoChanges).toBe(true);
    expect(summary?.hasMeterChanges).toBe(true);
    expect(summary?.tempoEvents).toEqual([
      expect.objectContaining({ bpm: 120, seconds: 0, position: { bar: 1, beat: 1, tick: 0 } }),
      expect.objectContaining({ bpm: 140, seconds: 0.5, position: { bar: 1, beat: 2, tick: 0 } })
    ]);
    expect(summary?.timeSignatureEvents).toEqual([
      expect.objectContaining({ numerator: 4, denominator: 4, position: { bar: 1, beat: 1, tick: 0 } }),
      expect.objectContaining({ numerator: 3, denominator: 4, seconds: 0.5, position: { bar: 1, beat: 2, tick: 0 } })
    ]);
  });

  it("keeps default MIDI import as one media-pool item and one clip", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Default Placement" }));
    const parsed = parseStandardMidiFile(multiTrackChannelMidiBytes());
    const result = importMidiFileToProject(project, parsed, "band.mid", "file:///band.mid", 640);
    const midiClips = result.project.timeline.clips.filter((clip) => clip.type === "midi");

    expect(result.project.mediaPool.filter((item) => item.kind === "midi")).toHaveLength(1);
    expect(midiClips).toHaveLength(1);
    expect(result.item.metadata?.importPlacementMode).toBe("single-clip");
    expect(midiDataFromClip(midiClips[0]).notes.map((note) => note.channel).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 9]);
  });

  it("imports MIDI as one clip per source track while sharing source media", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Track Placement" }));
    const parsed = parseStandardMidiFile(multiTrackChannelMidiBytes());
    const result = importMidiFileToProjectWithPlacement(project, parsed, "band.mid", {
      uri: "file:///band.mid",
      sizeBytes: 640,
      placementMode: "per-source-track"
    });
    const clips = result.clipIds.map((clipId) => result.project.timeline.clips.find((clip) => clip.id === clipId)!);
    const tracks = result.trackIds.map((trackId) => result.project.tracks.find((track) => track.id === trackId)!);

    expect(result.project.mediaPool.filter((item) => item.kind === "midi")).toHaveLength(1);
    expect(result.clipIds).toHaveLength(3);
    expect(new Set(clips.map((clip) => clip.mediaPoolItemId))).toEqual(new Set([result.item.id]));
    expect(tracks.map((track) => track.name)).toEqual(["Piano", "Bass", "Drums"]);
    expect(clips.map((clip) => midiDataFromClip(clip).notes.map((note) => note.trackIndex))).toEqual([[1], [2], [3]]);
    expect(midiDataFromClip(clips[0]).controllers).toEqual([expect.objectContaining({ controller: 7, trackIndex: 1 })]);
    expect(midiDataFromClip(clips[1]).programChanges).toEqual([expect.objectContaining({ program: 32, trackIndex: 2 })]);
    expect(midiDataFromClip(clips[2]).aftertouch).toEqual([expect.objectContaining({ kind: "channel", channel: 9, trackIndex: 3 })]);
    expect(midiDataFromClip(clips[0]).metadata).toMatchObject({
      importPlacementMode: "per-source-track",
      importPlacementLabel: "Piano",
      sourceNoteCount: 3,
      noteCount: 1
    });
  });

  it("imports MIDI as one clip per channel while preserving expression data", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Channel Placement" }));
    const parsed = parseStandardMidiFile(multiTrackChannelMidiBytes());
    const result = importMidiFileToProjectWithPlacement(project, parsed, "band.mid", { placementMode: "per-channel" });
    const clips = result.clipIds.map((clipId) => result.project.timeline.clips.find((clip) => clip.id === clipId)!);
    const tracks = result.trackIds.map((trackId) => result.project.tracks.find((track) => track.id === trackId)!);

    expect(result.clipIds).toHaveLength(3);
    expect(tracks.map((track) => track.name)).toEqual(["Channel 1", "Channel 2", "Channel 10"]);
    expect(clips.map((clip) => midiDataFromClip(clip).notes.map((note) => note.channel))).toEqual([[0], [1], [9]]);
    expect(midiDataFromClip(clips[0]).controllers).toEqual([expect.objectContaining({ controller: 7, channel: 0 })]);
    expect(midiDataFromClip(clips[1]).pitchBends).toEqual([expect.objectContaining({ value: 10240, channel: 1 })]);
    expect(midiDataFromClip(clips[2]).aftertouch).toEqual([expect.objectContaining({ value: 64, channel: 9 })]);
    expect(midiDataFromClip(clips[2]).metadata).toMatchObject({
      importPlacementMode: "per-channel",
      importPlacementLabel: "Channel 10",
      noteCount: 1
    });
  });

  it("imports MIDI with a raw drum-channel split without converting to Chordsmith drums", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Drum Split" }));
    const parsed = parseStandardMidiFile(metalArrangementMidiBytes());
    const result = importMidiFileToProjectWithPlacement(project, parsed, "metal.mid", { placementMode: "drum-channel-split" });
    const clips = result.clipIds.map((clipId) => result.project.timeline.clips.find((clip) => clip.id === clipId)!);
    const tracks = result.trackIds.map((trackId) => result.project.tracks.find((track) => track.id === trackId)!);

    expect(tracks.map((track) => track.name)).toEqual(["Kick (Ch 10)", "Snare (Ch 10)", "Closed Hat (Ch 10)", "Other MIDI Channels"]);
    expect(clips.map((clip) => midiDataFromClip(clip).notes.map((note) => note.pitch))).toEqual([[36], [38], [42], [48, 55, 60, 50, 57, 65]]);
    expect(clips.every((clip) => clip.type === "midi")).toBe(true);
    expect(result.project.tracks.find((track) => track.id === "drums")?.trackType).toBe("generated");
    expect(new Set(clips.map((clip) => clip.mediaPoolItemId))).toEqual(new Set([result.item.id]));
    expect(midiDataFromClip(clips[0]).metadata).toMatchObject({
      importPlacementMode: "drum-channel-split",
      importPlacementLabel: "Kick (Ch 10)",
      sourceNoteCount: 9,
      noteCount: 1
    });
  });

  it("crops MIDI clip note and expression data to a timeline edit range", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Range Crop" }));
    const parsed = rangeMidiFixture();
    const imported = importMidiFileToProject(project, parsed, "range.mid");

    const result = cropMidiClipToRange(imported.project, imported.clipId, 2, 3);
    const clip = result.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const data = midiDataFromClip(clip);

    expect(result.changed).toBe(true);
    expect(result.status).toContain("Cropped range.mid MIDI to edit range");
    expect(clip.startBar).toBe(2);
    expect(clip.barLength).toBe(1);
    expect(data.notes.map((note) => [note.id, note.startTick, note.durationTicks])).toEqual([
      ["overlap-left", 0, 480],
      ["inside", 480, 480],
      ["overlap-right", 1440, 480]
    ]);
    expect(data.controllers).toEqual([expect.objectContaining({ id: "cc-in", tick: 480 })]);
    expect(data.programChanges).toEqual([expect.objectContaining({ id: "program-in", tick: 0 })]);
    expect(data.pitchBends).toEqual([expect.objectContaining({ id: "bend-in", tick: 960 })]);
    expect(data.aftertouch).toEqual([expect.objectContaining({ id: "after-in", tick: 1080 })]);
    expect(data.metadata?.lastRangeCropBars).toEqual({ startBar: 2, endBar: 3 });
  });

  it("splits MIDI clips at edit-range boundaries without dropping held notes", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Range Split" }));
    const imported = importMidiFileToProject(project, rangeMidiFixture(), "range.mid");

    const result = splitMidiClipsAtRange(imported.project, 2, 3);
    const clips = result.project.timeline.clips
      .filter((clip) => clip.type === "midi")
      .sort((a, b) => a.startBar - b.startBar);

    expect(result.splitCount).toBe(2);
    expect(clips.map((clip) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(midiDataFromClip(clips[0]).notes.map((note) => [note.id, note.startTick, note.durationTicks])).toEqual([
      ["before", 0, 480],
      ["overlap-left", 1440, 480]
    ]);
    expect(midiDataFromClip(clips[1]).notes.map((note) => [note.id, note.startTick, note.durationTicks])).toEqual([
      ["overlap-left", 0, 480],
      ["inside", 480, 480],
      ["overlap-right", 1440, 480]
    ]);
    expect(midiDataFromClip(clips[2]).notes.map((note) => [note.id, note.startTick, note.durationTicks])).toEqual([
      ["overlap-right", 0, 480]
    ]);
  });

  it("deletes a MIDI range while keeping outside note tails and expression data", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Range Delete" }));
    const imported = importMidiFileToProject(project, rangeMidiFixture(), "range.mid");

    const result = deleteMidiClipRange(imported.project, imported.clipId, 2, 3);
    const clips = result.project.timeline.clips
      .filter((clip) => clip.type === "midi")
      .sort((a, b) => a.startBar - b.startBar);

    expect(result.changed).toBe(true);
    expect(result.rightClipId).toBeTruthy();
    expect(clips.map((clip) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [3, 1]]);
    expect(midiDataFromClip(clips[0]).notes.map((note) => [note.id, note.startTick, note.durationTicks])).toEqual([
      ["before", 0, 480],
      ["overlap-left", 1440, 480]
    ]);
    expect(midiDataFromClip(clips[0]).controllers).toEqual([]);
    expect(midiDataFromClip(clips[1]).notes.map((note) => [note.id, note.startTick, note.durationTicks])).toEqual([
      ["overlap-right", 0, 480]
    ]);
    expect(midiDataFromClip(clips[1]).controllers).toEqual([expect.objectContaining({ id: "cc-out", tick: 960 })]);
  });

  it("ripple deletes a MIDI range and closes the same-track gap", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Range Ripple" }));
    const imported = importMidiFileToProject(project, rangeMidiFixture(), "range.mid");

    const result = rippleDeleteMidiClipRange(imported.project, imported.clipId, 2, 3);
    const clips = result.project.timeline.clips
      .filter((clip) => clip.type === "midi")
      .sort((a, b) => a.startBar - b.startBar || a.name.localeCompare(b.name));

    expect(result.changed).toBe(true);
    expect(result.rippleBars).toBe(1);
    expect(clips.map((clip) => [clip.startBar, clip.barLength])).toEqual([[1, 1], [2, 1]]);
    expect(midiDataFromClip(clips[1]).notes).toEqual([expect.objectContaining({ id: "overlap-right", startTick: 0, durationTicks: 480 })]);
  });

  it("ripple deletes a MIDI edit range across all MIDI clips", () => {
    const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Timeline Ripple" }));
    const first = importMidiFileToProject(project, rangeMidiFixture(), "range.mid");
    const later = importMidiFileToProject(first.project, parseStandardMidiFile(simpleMidiBytes()), "later.mid");
    later.project.timeline.clips.find((clip) => clip.id === later.clipId)!.startBar = 5;

    const result = rippleDeleteMidiTimelineRange(later.project, 2, 3);
    const clips = result.project.timeline.clips
      .filter((clip) => clip.type === "midi")
      .sort((a, b) => a.startBar - b.startBar || a.name.localeCompare(b.name));

    expect(result.changed).toBe(true);
    expect(result.affectedClipIds).toEqual([first.clipId]);
    expect(result.movedClipIds).toEqual([later.clipId]);
    expect(clips.map((clip) => [clip.name, clip.startBar, clip.barLength])).toEqual([
      ["range.mid", 1, 1],
      ["range.mid ripple", 2, 1],
      ["later.mid", 4, 1]
    ]);
    expect(midiDataFromClip(clips[1]).notes).toEqual([expect.objectContaining({ id: "overlap-right", startTick: 0, durationTicks: 480 })]);
  });

  it("round-trips MIDI note edits through clip metadata", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 960);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;

    project = moveMidiNote(project, clipId, noteId, -480);
    project = transposeMidiNote(project, clipId, noteId, 7);
    project = resizeMidiNote(project, clipId, noteId, 240);
    project = setMidiNoteVelocity(project, clipId, noteId, 32);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const edited = midiDataFromClip(clip).notes.find((note) => note.id === noteId)!;

    expect(edited).toMatchObject({ pitch: 67, startTick: 480, durationTicks: 720, velocity: 32 });

    project = deleteMidiNote(project, clipId, noteId);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.some((note) => note.id === noteId)).toBe(false);
  });

  it("sets precise MIDI note fields through clip metadata", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 960);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;

    project = setMidiNoteField(project, clipId, noteId, "pitch", 200);
    project = setMidiNoteField(project, clipId, noteId, "startTick", 119);
    project = setMidiNoteField(project, clipId, noteId, "durationTicks", -8);
    project = setMidiNoteField(project, clipId, noteId, "velocity", 0);
    project = setMidiNoteField(project, clipId, noteId, "channel", 21);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const edited = midiDataFromClip(clip).notes.find((note) => note.id === noteId)!;

    expect(edited).toMatchObject({ pitch: 127, startTick: 119, durationTicks: 1, velocity: 1, channel: 15 });
    expect(midiDataFromClip(clip).notes.map((note) => note.startTick)).toEqual([0, 119]);
  });

  it("duplicates MIDI notes after the source note end without changing note expression", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 240);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;
    project = setMidiNoteField(project, clipId, noteId, "pitch", 72);
    project = setMidiNoteField(project, clipId, noteId, "durationTicks", 360);
    project = setMidiNoteField(project, clipId, noteId, "velocity", 81);
    project = setMidiNoteField(project, clipId, noteId, "channel", 2);

    project = duplicateMidiNote(project, clipId, noteId);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const notes = midiDataFromClip(clip).notes;
    const duplicate = notes.find((note) => note.id !== noteId && note.pitch === 72)!;

    expect(duplicate).toMatchObject({ pitch: 72, startTick: 600, durationTicks: 360, velocity: 81, channel: 2 });
    expect(duplicate.id).not.toBe(noteId);
    expect(notes.map((note) => note.startTick)).toEqual([...notes.map((note) => note.startTick)].sort((a, b) => a - b));
  });

  it("edits MIDI controller lane points through clip metadata", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiController(imported.result.project, clipId, 960);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const controllerId = midiDataFromClip(clip).controllers[0].id;

    project = setMidiControllerField(project, clipId, controllerId, "controller", 74);
    project = setMidiControllerField(project, clipId, controllerId, "value", 200);
    project = setMidiControllerField(project, clipId, controllerId, "tick", 240);
    project = setMidiControllerField(project, clipId, controllerId, "channel", 19);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).controllers[0]).toMatchObject({ controller: 74, value: 127, tick: 240, channel: 15 });

    project = deleteMidiController(project, clipId, controllerId);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).controllers).toEqual([]);
  });

  it("duplicates MIDI controller points one quarter note later without changing controller expression", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiController(imported.result.project, clipId, 240);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const controllerId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, clipId, controllerId, "controller", 74);
    project = setMidiControllerField(project, clipId, controllerId, "value", 91);
    project = setMidiControllerField(project, clipId, controllerId, "channel", 2);

    project = duplicateMidiController(project, clipId, controllerId);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const controllers = midiDataFromClip(clip).controllers;
    const duplicate = controllers.find((point) => point.id !== controllerId)!;

    expect(duplicate).toMatchObject({ controller: 74, value: 91, tick: 720, channel: 2 });
    expect(duplicate.id).not.toBe(controllerId);
    expect(controllers.map((point) => point.tick)).toEqual([240, 720]);
  });

  it("quantizes MIDI note starts to a musical grid without changing duration or velocity", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 181);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;

    project = resizeMidiNote(project, clipId, noteId, -120);
    project = setMidiNoteVelocity(project, clipId, noteId, 37);
    project = quantizeMidiClip(project, clipId, "1/16");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const edited = midiDataFromClip(clip).notes.find((note) => note.id === noteId)!;

    expect(edited.startTick).toBe(240);
    expect(edited.durationTicks).toBe(360);
    expect(edited.velocity).toBe(37);
  });

  it("quantizes MIDI note durations to a musical grid without moving starts or expression", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 181);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const noteId = midiDataFromClip(clip).notes.at(-1)!.id;

    project = setMidiNoteField(project, clipId, noteId, "durationTicks", 181);
    project = setMidiNoteField(project, clipId, noteId, "velocity", 37);
    project = setMidiNoteField(project, clipId, noteId, "channel", 2);
    project = quantizeMidiClipDurations(project, clipId, "1/16");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const edited = midiDataFromClip(clip).notes.find((note) => note.id === noteId)!;

    expect(edited.startTick).toBe(181);
    expect(edited.durationTicks).toBe(240);
    expect(edited.velocity).toBe(37);
    expect(edited.channel).toBe(2);
    expect(midiDataFromClip(clip).metadata?.lastDurationQuantizeGrid).toBe("1/16");
  });

  it("supports common MIDI quantize grids", () => {
    const eighth = importSimpleMidi();
    let eighthProject = addMidiNote(eighth.result.project, eighth.result.clipId, 181);
    eighthProject = quantizeMidiClip(eighthProject, eighth.result.clipId, "1/8");
    const eighthStarts = midiDataFromClip(eighthProject.timeline.clips.find((item) => item.id === eighth.result.clipId)!).notes.map((note) => note.startTick);
    expect(eighthStarts).toContain(240);

    const thirtySecond = importSimpleMidi();
    let thirtySecondProject = addMidiNote(thirtySecond.result.project, thirtySecond.result.clipId, 91);
    thirtySecondProject = quantizeMidiClip(thirtySecondProject, thirtySecond.result.clipId, "1/32");
    const thirtySecondStarts = midiDataFromClip(thirtySecondProject.timeline.clips.find((item) => item.id === thirtySecond.result.clipId)!).notes.map((note) => note.startTick);
    expect(thirtySecondStarts).toContain(120);
  });

  it("keeps quantized MIDI note starts non-negative and sorted", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 1);
    project = addMidiNote(project, clipId, 239);

    project = quantizeMidiClip(project, clipId, "1/16");
    const clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const starts = midiDataFromClip(clip).notes.map((note) => note.startTick);

    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts.every((tick) => tick >= 0)).toBe(true);
    expect(starts).toContain(0);
    expect(starts).toContain(240);
  });

  it("applies eighth-note swing without changing MIDI note duration or velocity", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 240);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const offbeatNoteId = midiDataFromClip(clip).notes.at(-1)!.id;

    project = resizeMidiNote(project, clipId, offbeatNoteId, -120);
    project = setMidiNoteVelocity(project, clipId, offbeatNoteId, 41);
    project = swingMidiClip(project, clipId, 60);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const edited = midiDataFromClip(clip).notes.find((note) => note.id === offbeatNoteId)!;

    expect(edited.startTick).toBe(288);
    expect(edited.durationTicks).toBe(360);
    expect(edited.velocity).toBe(41);
    expect(midiDataFromClip(clip).metadata?.lastSwingPercent).toBe(60);
  });

  it("applies reusable MIDI groove templates without changing pitch, duration or channel", () => {
    expect(MIDI_GROOVE_TEMPLATES.map((template) => template.id)).toEqual(["straight-16", "pocket-16", "shuffle-8"]);

    const straight = importSimpleMidi();
    let straightProject = addMidiNote(straight.result.project, straight.result.clipId, 181);
    let straightClip = straightProject.timeline.clips.find((item) => item.id === straight.result.clipId)!;
    const straightNoteId = midiDataFromClip(straightClip).notes.at(-1)!.id;
    straightProject = setMidiNoteField(straightProject, straight.result.clipId, straightNoteId, "velocity", 40);
    straightProject = applyMidiGrooveTemplate(straightProject, straight.result.clipId, "straight-16");
    straightClip = straightProject.timeline.clips.find((item) => item.id === straight.result.clipId)!;
    const straightNote = midiDataFromClip(straightClip).notes.find((note) => note.id === straightNoteId)!;
    expect(straightNote).toMatchObject({ pitch: 60, startTick: 240, durationTicks: 480, velocity: 40, channel: 0 });
    expect(midiDataFromClip(straightClip).metadata).toMatchObject({
      lastGrooveTemplate: "straight-16",
      lastGrooveTemplateName: "Straight 16",
      lastQuantizeGrid: "1/16",
      lastSwingPercent: 50
    });

    const pocket = importSimpleMidi();
    let pocketProject = addMidiNote(pocket.result.project, pocket.result.clipId, 181);
    let pocketClip = pocketProject.timeline.clips.find((item) => item.id === pocket.result.clipId)!;
    const pocketNoteId = midiDataFromClip(pocketClip).notes.at(-1)!.id;
    pocketProject = setMidiNoteField(pocketProject, pocket.result.clipId, pocketNoteId, "velocity", 40);
    pocketProject = applyMidiGrooveTemplate(pocketProject, pocket.result.clipId, "pocket-16");
    pocketClip = pocketProject.timeline.clips.find((item) => item.id === pocket.result.clipId)!;
    const pocketNote = midiDataFromClip(pocketClip).notes.find((note) => note.id === pocketNoteId)!;
    expect(pocketNote).toMatchObject({ pitch: 60, startTick: 235, durationTicks: 480, velocity: 46, channel: 0 });
    expect(midiDataFromClip(pocketClip).metadata?.lastGrooveTemplate).toBe("pocket-16");

    const shuffle = importSimpleMidi();
    let shuffleProject = addMidiNote(shuffle.result.project, shuffle.result.clipId, 240);
    let shuffleClip = shuffleProject.timeline.clips.find((item) => item.id === shuffle.result.clipId)!;
    const shuffleNoteId = midiDataFromClip(shuffleClip).notes.at(-1)!.id;
    shuffleProject = resizeMidiNote(shuffleProject, shuffle.result.clipId, shuffleNoteId, -120);
    shuffleProject = setMidiNoteField(shuffleProject, shuffle.result.clipId, shuffleNoteId, "velocity", 41);
    shuffleProject = applyMidiGrooveTemplate(shuffleProject, shuffle.result.clipId, "shuffle-8");
    shuffleClip = shuffleProject.timeline.clips.find((item) => item.id === shuffle.result.clipId)!;
    const shuffleNote = midiDataFromClip(shuffleClip).notes.find((note) => note.id === shuffleNoteId)!;
    expect(shuffleNote).toMatchObject({ pitch: 60, startTick: 288, durationTicks: 360, velocity: 39, channel: 0 });
    expect(midiDataFromClip(shuffleClip).metadata).toMatchObject({
      lastGrooveTemplate: "shuffle-8",
      lastQuantizeGrid: "1/8",
      lastSwingPercent: 60
    });
  });

  it("applies clip-level MIDI velocity transforms without changing timing or pitch", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 240);
    project = addMidiNote(project, clipId, 480);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const before = midiDataFromClip(clip).notes.map((note) => ({ id: note.id, pitch: note.pitch, startTick: note.startTick, durationTicks: note.durationTicks }));

    project = transformMidiClipVelocity(project, clipId, "level-96");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.map((note) => note.velocity)).toEqual([96, 96, 96]);
    expect(midiDataFromClip(clip).notes.map((note) => ({ id: note.id, pitch: note.pitch, startTick: note.startTick, durationTicks: note.durationTicks }))).toEqual(before);
    expect(midiDataFromClip(clip).metadata?.lastVelocityTransform).toBe("level-96");

    project = transformMidiClipVelocity(project, clipId, "humanize-12");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.map((note) => note.velocity)).toEqual([84, 96, 108]);
    expect(midiDataFromClip(clip).notes.map((note) => ({ id: note.id, pitch: note.pitch, startTick: note.startTick, durationTicks: note.durationTicks }))).toEqual(before);
    expect(midiDataFromClip(clip).metadata?.lastVelocityTransform).toBe("humanize-12");
  });

  it("applies clip-level MIDI pitch transforms without changing timing or velocity", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 240);
    project = addMidiNote(project, clipId, 480);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const noteIds = midiDataFromClip(clip).notes.map((note) => note.id);
    project = transposeMidiNote(project, clipId, noteIds[0], 67);
    project = transposeMidiNote(project, clipId, noteIds[1], -60);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const before = midiDataFromClip(clip).notes.map((note) => ({ id: note.id, startTick: note.startTick, durationTicks: note.durationTicks, velocity: note.velocity }));

    project = transformMidiClipPitch(project, clipId, "octave-up");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.map((note) => note.pitch)).toEqual([127, 12, 72]);
    expect(midiDataFromClip(clip).notes.map((note) => ({ id: note.id, startTick: note.startTick, durationTicks: note.durationTicks, velocity: note.velocity }))).toEqual(before);
    expect(midiDataFromClip(clip).metadata?.lastPitchTransform).toBe("octave-up");

    project = transformMidiClipPitch(project, clipId, "octave-down");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.map((note) => note.pitch)).toEqual([115, 0, 60]);
    expect(midiDataFromClip(clip).metadata?.lastPitchTransform).toBe("octave-down");

    project = transformMidiClipPitch(project, clipId, "semitone-up");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.map((note) => note.pitch)).toEqual([116, 1, 61]);
    expect(midiDataFromClip(clip).metadata?.lastPitchTransform).toBe("semitone-up");

    project = transformMidiClipPitch(project, clipId, "semitone-down");
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(midiDataFromClip(clip).notes.map((note) => note.pitch)).toEqual([115, 0, 60]);
    expect(midiDataFromClip(clip).metadata?.lastPitchTransform).toBe("semitone-down");
  });

  it("keeps downbeats on-grid when applying swing", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 480);

    project = swingMidiClip(project, clipId, 65);
    const clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const starts = midiDataFromClip(clip).notes.map((note) => note.startTick);

    expect(starts).toContain(0);
    expect(starts).toContain(480);
  });

  it("edits MIDI clip bar length without deleting note metadata", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = addMidiNote(imported.result.project, clipId, 1920);

    project = setMidiClipBarLength(project, clipId, 2.37);
    const clip = project.timeline.clips.find((item) => item.id === clipId)!;

    expect(clip.barLength).toBe(2.25);
    expect(midiDataFromClip(clip).notes.map((note) => note.startTick)).toContain(1920);
    expect(project.timeline.bars).toBeGreaterThanOrEqual(3);
  });

  it("extends authored MIDI clips when new notes or controller points land beyond the current end", () => {
    const imported = importSimpleMidi();
    const clipId = imported.result.clipId;
    let project = setMidiClipBarLength(imported.result.project, clipId, 1);

    project = addMidiNote(project, clipId, 1920);
    let clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(clip.barLength).toBe(1.25);
    expect(midiDataFromClip(clip).notes.at(-1)).toMatchObject({ startTick: 1920, durationTicks: 480 });

    project = addMidiController(project, clipId, 3840);
    clip = project.timeline.clips.find((item) => item.id === clipId)!;
    expect(clip.barLength).toBe(2.25);
    expect(midiDataFromClip(clip).controllers.at(-1)).toMatchObject({ tick: 3840 });
  });

  it("renders MIDI clips as audible preview synth events", () => {
    const { result } = importSimpleMidi();
    const events = renderTimelineEvents(result.project).filter((event) => event.kind === "midi");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      clipId: result.clipId,
      trackId: result.trackId,
      midi: 60,
      instrument: "midi_preview"
    });
    expect(events[0].duration).toBeGreaterThan(0);
    expect(events[0].velocity).toBeGreaterThan(0.5);
  });
});

function importSimpleMidi() {
  const project = createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Test" }));
  const parsed = parseStandardMidiFile(simpleMidiBytes());
  return { parsed, result: importMidiFileToProject(project, parsed, "lead.mid") };
}

function rangeMidiFixture(): ParsedMidiFile {
  return {
    format: 1,
    ppq: 480,
    tempoBpm: 120,
    timeSig: 4,
    trackNames: ["Range MIDI"],
    notes: [
      { id: "before", pitch: 60, startTick: 0, durationTicks: 480, velocity: 90, channel: 0, trackIndex: 0 },
      { id: "overlap-left", pitch: 62, startTick: 1440, durationTicks: 960, velocity: 88, channel: 0, trackIndex: 0 },
      { id: "inside", pitch: 64, startTick: 2400, durationTicks: 480, velocity: 80, channel: 0, trackIndex: 0 },
      { id: "overlap-right", pitch: 65, startTick: 3360, durationTicks: 960, velocity: 70, channel: 0, trackIndex: 0 }
    ],
    controllers: [
      { id: "cc-in", controller: 1, value: 64, tick: 2400, channel: 0, trackIndex: 0 },
      { id: "cc-out", controller: 7, value: 100, tick: 4800, channel: 0, trackIndex: 0 }
    ],
    programChanges: [{ id: "program-in", program: 12, tick: 1920, channel: 0, trackIndex: 0 }],
    pitchBends: [{ id: "bend-in", value: 8192, tick: 2880, channel: 0, trackIndex: 0 }],
    aftertouch: [{ id: "after-in", kind: "channel", value: 45, tick: 3000, channel: 0, trackIndex: 0 }],
    metadata: { source: "range-fixture" }
  };
}
