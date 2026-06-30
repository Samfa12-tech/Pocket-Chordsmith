import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { importMidiFileToProject } from "../src/daw/midiClips";
import { convertMidiClipToMelodyOverlays } from "../src/daw/midiMelodyConversion";
import { getMelodyOverlayEvents, melodyOverlayCount } from "../src/daw/melodyOverlays";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { createDemoProject } from "../src/demo/demoProject";
import { metalArrangementMidiBytes } from "./midiFixtures";

describe("generated melody overlays", () => {
  it("maps imported MIDI melodic notes into generated melody overlays without mutating Chordsmith source data", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal.mid");
    const beforeSource = JSON.stringify(imported.project.sourceRefs);

    const result = convertMidiClipToMelodyOverlays(imported.project, imported.clipId, "A", 0);
    const events = renderTimelineEvents(result.project);

    expect(result.written).toBeGreaterThanOrEqual(3);
    expect(result.skipped).toBeGreaterThanOrEqual(3);
    expect(result.pitches).toEqual(expect.arrayContaining([48, 55, 60]));
    expect(JSON.stringify(result.project.sourceRefs)).toBe(beforeSource);
    expect(melodyOverlayCount(result.project, "A", 0)).toBe(result.written);
    expect(getMelodyOverlayEvents(result.project, "A", 0, 0).map((event) => event.midi)).toEqual(expect.arrayContaining([48, 55, 60]));
    expect(events.some((event) => event.kind === "melody" && event.articulation === "midi-overlay" && event.clipId !== imported.clipId && event.midi === 48)).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("maps only the visible source window of shortened MIDI melody clips", () => {
    const imported = importMidiFileToProject(createDemoProject(), parseStandardMidiFile(metalArrangementMidiBytes()), "metal-window.mid");
    const clip = imported.project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.barLength = 0.25;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 480 };

    const result = convertMidiClipToMelodyOverlays(imported.project, imported.clipId, "A", 0);

    expect(result.written).toBe(3);
    expect(result.skipped).toBeGreaterThan(0);
    expect(getMelodyOverlayEvents(result.project, "A", 0, 0).map((event) => event.midi)).toEqual(expect.arrayContaining([50, 57, 65]));
    expect(getMelodyOverlayEvents(result.project, "A", 0, 1)).toEqual([]);
  });
});
