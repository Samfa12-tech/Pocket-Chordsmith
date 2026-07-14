import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/app/state";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { getPrimaryChordsmithSource, setSectionChord } from "../src/daw/chordsmithEditor";
import { chordOverlayCount, getChordOverlayEvents } from "../src/daw/chordOverlays";
import {
  chooseMidiConversionResolution,
  createMidiFaithfulConversionPreview,
  convertMidiClipFaithfully,
  inferMidiRoleAssignments,
  manualMidiRoleAssignment,
  packMidiBarsIntoSections
} from "../src/daw/midiFaithfulConversion";
import { melodyOverlayCount } from "../src/daw/melodyOverlays";
import { importMidiFileToProject, midiDataFromClip } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { faithfulVocalChordGuideMidiBytes } from "./midiFixtures";

describe("faithful MIDI to Chordsmith conversion", () => {
  it("infers independent named melody and chord sources without inventing accompaniment", () => {
    const { project, clipId } = importedFixture();
    const clip = project.timeline.clips.find((item) => item.id === clipId)!;
    const data = midiDataFromClip(clip);
    const assignments = inferMidiRoleAssignments(data, data.metadata);

    expect(assignments.melody?.filter).toEqual({ mode: "source-track", value: 1 });
    expect(assignments.chords?.filter).toEqual({ mode: "source-track", value: 2 });
    expect(assignments.melody?.confidence).toBe("high");
    expect(assignments.chords?.confidence).toBe("high");
    expect(assignments.bass).toBeNull();
    expect(assignments.drums).toBeNull();
    expect(assignments.guitar).toBeNull();
  });

  it("packs every source bar once across A-H and chooses sixteenth resolution", () => {
    expect(packMidiBarsIntoSections(40)).toEqual({
      sectionBars: { A: 16, B: 16, C: 8 },
      songSequence: ["A", "B", "C"],
      sourceBars: 40,
      destinationBars: 40,
      paddingBars: 0,
      heuristicSubstitutions: 0
    });
    expect(packMidiBarsIntoSections(129).supported).toBe(false);
    expect(chooseMidiConversionResolution([0, 240, 480], [240, 1920], 960)).toEqual({
      resolution: 4,
      exact: true,
      maximumErrorTicks: 0
    });
  });

  it("previews exact counts and converts the long source atomically", () => {
    const { project, clipId } = importedFixture();
    const preview = createMidiFaithfulConversionPreview(project, clipId);

    expect(preview?.intent).toBe("faithful-transcription");
    expect(preview?.fidelity).toBe("lossless within supported model");
    expect(preview?.sourceBars).toBe(40);
    expect(preview?.destinationBars).toBe(40);
    expect(preview?.resolution).toBe(4);
    expect(preview?.roles.melody.sourceNoteAttacks).toBe(80);
    expect(preview?.roles.chords.sourceNoteAttacks).toBe(297);
    expect(preview?.roles.chords.destinationEvents).toBe(80);
    expect(preview?.generated).toEqual({ bass: 0, drums: 0, guitar: 0, harmony: 0 });

    const result = convertMidiClipFaithfully(project, clipId);
    const pcs = getPrimaryChordsmithSource(result.project)!;
    expect(result.applied).toBe(true);
    expect(result.report.fidelity).toBe("lossless within supported model");
    expect(pcs.songSequence).toEqual(["A", "B", "C"]);
    expect(pcs.songSequence.reduce((sum, id) => sum + pcs.sectionBars[id], 0)).toBe(40);
    expect(result.report.melodyWritten).toBe(80);
    expect(result.report.chordEventsWritten).toBe(80);
    expect(result.report.chordNotesWritten).toBe(297);
    expect(["A", "B", "C"].reduce((sum, id) => sum + melodyOverlayCount(result.project, id, 0), 0)).toBe(80);
    expect(["A", "B", "C"].reduce((sum, id) => sum + chordOverlayCount(result.project, id), 0)).toBe(80);
    const finalEvents = getChordOverlayEvents(result.project, "C", 7 * 16 + 8);
    expect(finalEvents.at(-1)?.midiNotes).toEqual([54, 58, 61]);
    expect(result.project.timeline.clips.some((clip) => clip.id === clipId)).toBe(true);
    const generatedClipIds = new Set(result.project.timeline.clips.filter((clip) => clip.type === "generated-section").map((clip) => clip.id));
    const generatedEvents = renderTimelineEvents(result.project).filter((event) => generatedClipIds.has(event.clipId));
    expect(generatedEvents.filter((event) => event.role === "melody")).toHaveLength(80);
    expect(generatedEvents.filter((event) => event.role === "chords")).toHaveLength(80);
    expect(generatedEvents.some((event) => event.role === "bass" || event.role === "drums" || event.role === "guitar")).toBe(false);
    expect(Math.max(...generatedEvents.filter((event) => event.role === "melody").map((event) => event.duration))).toBeGreaterThan(1.5);
  });

  it("blocks unsupported faithful role lanes instead of silently approximating them", () => {
    const { project, clipId } = importedFixture();
    const preview = createMidiFaithfulConversionPreview(project, clipId, {
      assignments: {
        bass: manualMidiRoleAssignment("bass", { mode: "source-track", value: 1 })
      }
    });

    expect(preview?.roles.bass.sourceNoteAttacks).toBe(80);
    expect(preview?.roles.bass.destinationEvents).toBe(0);
    expect(preview?.fidelity).toBe("simplified");
    expect(preview?.applyAllowed).toBe(false);
    expect(preview?.warnings.some((warning) => warning.includes("will not silently approximate"))).toBe(true);
    expect(convertMidiClipFaithfully(project, clipId, {
      assignments: {
        bass: manualMidiRoleAssignment("bass", { mode: "source-track", value: 1 })
      }
    }).applied).toBe(false);
  });

  it("uses the trimmed clip window consistently in preview and apply", () => {
    const { project, clipId } = importedFixture();
    const clip = project.timeline.clips.find((item) => item.id === clipId)!;
    clip.barLength = 4;

    const preview = createMidiFaithfulConversionPreview(project, clipId)!;
    const result = convertMidiClipFaithfully(project, clipId);

    expect(preview.sourceBars).toBe(4);
    expect(preview.roles.melody.sourceNoteAttacks).toBe(8);
    expect(preview.roles.melody.outOfRangeNotes).toBe(72);
    expect(result.report.melodyWritten).toBe(8);
    expect(result.report.chordEventsWritten).toBe(8);
  });

  it("blocks timing maps and overlay storage losses that cannot be called faithful", () => {
    const timing = importedFixture();
    const timingMidi = timing.project.timeline.clips.find((item) => item.id === timing.clipId)!.metadata!.midi as unknown as {
      metadata: { tempoEvents: Array<Record<string, unknown>>; timeSignatureEvents: Array<Record<string, unknown>> };
    };
    timingMidi.metadata.tempoEvents.push({ tick: 960, bpm: 92 });
    timingMidi.metadata.timeSignatureEvents[0] = { tick: 0, numerator: 6, denominator: 8 };
    const timingPreview = createMidiFaithfulConversionPreview(timing.project, timing.clipId)!;
    expect(timingPreview.applyAllowed).toBe(false);
    expect(timingPreview.warnings.join(" ")).toContain("tempo map");
    expect(timingPreview.warnings.join(" ")).toContain("denominator");

    const collision = importedFixture();
    const collisionMidi = collision.project.timeline.clips.find((item) => item.id === collision.clipId)!.metadata!.midi as unknown as {
      notes: Array<Record<string, unknown>>;
    };
    const melodyNote = collisionMidi.notes.find((note) => note.trackIndex === 1)!;
    collisionMidi.notes.push({ ...melodyNote, id: "duplicate-melody-attack" });
    const collisionPreview = createMidiFaithfulConversionPreview(collision.project, collision.clipId)!;
    expect(collisionPreview.applyAllowed).toBe(false);
    expect(collisionPreview.warnings.join(" ")).toContain("melody attack");
  });

  it("clears stale accompaniment overlays and lets later progression edits leave overlay-only mode", () => {
    const { project, clipId } = importedFixture();
    const bass = project.tracks.find((track) => track.role === "bass")!;
    const drums = project.tracks.find((track) => track.role === "drums")!;
    bass.metadata = { ...(bass.metadata || {}), bassOverlayEvents: { A: [{ step: 0, midi: 36 }] } };
    drums.metadata = { ...(drums.metadata || {}), drumBranchEvents: { A: { kick: [0] } } };

    const result = convertMidiClipFaithfully(project, clipId);
    expect(result.project.tracks.find((track) => track.role === "bass")?.metadata?.bassOverlayEvents).toEqual({});
    expect(result.project.tracks.find((track) => track.role === "drums")?.metadata?.drumBranchEvents).toEqual({});
    expect(result.project.tracks.find((track) => track.role === "chords")?.metadata?.midiFaithfulOverlayOnly).toBe(true);

    const manuallyEdited = setSectionChord(result.project, "A", 0, 4);
    expect(manuallyEdited.tracks.find((track) => track.role === "chords")?.metadata?.midiFaithfulOverlayOnly).toBe(false);
  });
});

function importedFixture() {
  const state = createInitialState();
  const parsed = parseStandardMidiFile(faithfulVocalChordGuideMidiBytes());
  const imported = importMidiFileToProject(state.undoStack.present, parsed, "faithful-long.mid");
  return { project: imported.project, clipId: imported.clipId };
}
