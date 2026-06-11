import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { addMidiNote, deleteMidiNote, importMidiFileToProject, midiDataFromClip, moveMidiNote, resizeMidiNote, setMidiNoteVelocity, transposeMidiNote } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { simpleMidiBytes } from "./midiFixtures";

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
