import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { getBassOverlayEvents, bassOverlayCount } from "../src/daw/bassOverlays";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { convertMidiClipToBassOverlays } from "../src/daw/midiBassConversion";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createDemoProject } from "../src/demo/demoProject";
import { metalArrangementMidiBytes } from "./midiFixtures";

describe("generated bass overlays", () => {
  it("maps imported low MIDI notes into generated bass overlays without mutating Chordsmith source data", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    const beforeSource = JSON.stringify(imported.project.sourceRefs);

    const result = convertMidiClipToBassOverlays(imported.project, imported.clipId, "A");
    const events = renderTimelineEvents(result.project);

    expect(result.written).toBe(2);
    expect(result.merged).toBeGreaterThanOrEqual(2);
    expect(result.pitches).toEqual([48, 50]);
    expect(JSON.stringify(result.project.sourceRefs)).toBe(beforeSource);
    expect(bassOverlayCount(result.project, "A")).toBe(result.written);
    expect(getBassOverlayEvents(result.project, "A", 0).map((event) => event.midi)).toEqual([48]);
    expect(events.some((event) => event.kind === "bass" && event.articulation === "midi-overlay" && event.clipId !== imported.clipId && event.midi === 48)).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("maps only the visible source window of shortened MIDI bass clips", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "bass-window.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.barLength = 0.25;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 480 };

    const result = convertMidiClipToBassOverlays(imported.project, imported.clipId, "A");

    expect(result.written).toBe(1);
    expect(result.skipped).toBeGreaterThan(0);
    expect(getBassOverlayEvents(result.project, "A", 0).map((event) => event.midi)).toEqual([50]);
    expect(getBassOverlayEvents(result.project, "A", 1)).toEqual([]);
  });
});
