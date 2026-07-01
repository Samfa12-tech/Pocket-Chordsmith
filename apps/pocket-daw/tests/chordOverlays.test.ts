import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { chordOverlayCount, getChordOverlayEvents } from "../src/daw/chordOverlays";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { convertMidiClipToChordOverlays } from "../src/daw/midiChordConversion";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createDemoProject } from "../src/demo/demoProject";
import { metalArrangementMidiBytes, simpleMidiBytes } from "./midiFixtures";

describe("generated chord overlays", () => {
  it("maps simultaneous MIDI note groups into generated chord overlays without mutating Chordsmith source data", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    const beforeSource = JSON.stringify(imported.project.sourceRefs);

    const result = convertMidiClipToChordOverlays(imported.project, imported.clipId, "A");
    const events = renderTimelineEvents(result.project);

    expect(result.written).toBe(2);
    expect(result.merged).toBeGreaterThanOrEqual(4);
    expect(result.chords).toEqual([[48, 55, 60], [50, 57, 65]]);
    expect(JSON.stringify(result.project.sourceRefs)).toBe(beforeSource);
    expect(chordOverlayCount(result.project, "A")).toBe(result.written);
    expect(getChordOverlayEvents(result.project, "A", 0).map((event) => event.midiNotes)).toEqual([[48, 55, 60]]);
    expect(events.some((event) => event.kind === "chord" && event.articulation === "midi-overlay" && event.clipId !== imported.clipId && event.midiNotes?.join(".") === "48.55.60")).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("does not create chord overlays from single-note MIDI clips", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(simpleMidiBytes()), "single.mid");

    const result = convertMidiClipToChordOverlays(imported.project, imported.clipId, "A");

    expect(result.written).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.project).toBe(imported.project);
  });
});
