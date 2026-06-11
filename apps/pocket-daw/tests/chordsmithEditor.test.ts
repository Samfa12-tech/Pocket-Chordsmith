import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { createDemoProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile, parsePocketDawProjectFile } from "../src/daw/dawProject";
import {
  cycleBassStep,
  cycleDrumStep,
  cycleDrumTuplet,
  cycleGuitarStep,
  cycleMelodyStep,
  getPrimaryChordsmithSource,
  setBassMode,
  setChordsmithGlobals,
  setGuitarSettings,
  setMelodyInstrument,
  setMelodyMute,
  setMelodyOctave,
  setMelodyPan,
  setMelodySolo,
  setSectionBars,
  setSectionChord,
  toggleBassAccent,
  toggleBassHold,
  toggleBassSlide,
  toggleMelodyHold,
  toggleMelodySlide,
  toggleMelodyTuplet
} from "../src/daw/chordsmithEditor";

describe("Chordsmith visual sequencer edits", () => {
  it("edits chords and section length while preserving source unknown fields", () => {
    let project = createDemoProject();
    project = setSectionChord(project, "A", 0, 6);
    project = setSectionBars(project, "A", 2);

    const pcs = getPrimaryChordsmithSource(project);
    expect(pcs?.sections.A.progression[0]).toBe(6);
    expect(pcs?.sections.A.bars).toBe(2);
    expect(project.timeline.clips.filter((clip) => clip.sectionId === "A").every((clip) => clip.barLength === 2)).toBe(true);
    expect(project.timeline.markers[0].bar).toBe(1);

    const raw = buildPocketDawProjectFile(project);
    const parsed = parsePocketDawProjectFile(raw);
    expect((parsed.sourceRefs[0].original as Record<string, unknown>).unknownFutureChordsmithField).toBeTruthy();
    expect(((parsed.sourceRefs[0].original as Record<string, unknown>).sectionBars as Record<string, unknown>).A).toBe(2);
  });

  it("feeds drum, bass, melody and guitar grid edits into rendered events", () => {
    let project = createDemoProject();
    project = cycleDrumStep(project, "A", "kick", 1);
    project = cycleDrumStep(project, "A", "kick", 1);
    project = cycleBassStep(project, "A", 1);
    project = cycleMelodyStep(project, "A", 0, 1);
    project = cycleGuitarStep(project, "A", 1);

    const pcs = getPrimaryChordsmithSource(project);
    expect(pcs?.bassMode).toBe("manual");
    expect(pcs?.sections.A.grid.kick[1]).toBe(2);
    expect(pcs?.sections.A.bassNotes[1]).toBe(0);
    expect(pcs?.sections.A.melodyTracks[0][1]).toBe(0);
    expect(pcs?.sections.A.guitarPattern[1]).toBe("chug");

    const events = renderTimelineEvents(project);
    expect(events.some((event) => event.kind === "kick" && event.step === 1 && event.accent)).toBe(true);
    expect(events.some((event) => event.kind === "bass" && event.step === 1)).toBe(true);
    expect(events.some((event) => event.kind === "melody" && event.step === 1)).toBe(true);
    expect(events.some((event) => event.kind === "guitar" && event.step === 1 && event.articulation === "chug")).toBe(true);
  });

  it("changes a source-backed melody lane instrument", () => {
    let project = createDemoProject();
    project.tracks.find((track) => track.id === "melody")!.metadata = { chordsmithMelodyTrackIndex: 0 };

    project = setMelodyInstrument(project, "A", 0, "harmonica");

    const pcs = getPrimaryChordsmithSource(project);
    const original = project.sourceRefs[0].original as Record<string, unknown>;
    expect(pcs?.sections.A.melodyInstruments[0]).toBe("harmonica");
    expect((original.melodyInstrumentsA as string[])[0]).toBe("harmonica");
    expect(project.tracks.find((track) => track.id === "melody")?.name).toBe("Melody 1 - Harmonica");
    expect(renderTimelineEvents(project).some((event) => event.kind === "melody" && event.instrument === "harmonica")).toBe(true);
  });

  it("edits later-page Chordsmith steps and preserves articulations in the original source", () => {
    let project = createDemoProject();
    project = setSectionBars(project, "A", 4);
    project = cycleDrumTuplet(project, "A", "hat", 20);
    project = cycleBassStep(project, "A", 20);
    project = toggleBassHold(project, "A", 21);
    project = toggleBassSlide(project, "A", 22);
    project = toggleBassAccent(project, "A", 20);
    project = cycleMelodyStep(project, "A", 0, 20);
    project = toggleMelodyHold(project, "A", 0, 21);
    project = toggleMelodySlide(project, "A", 0, 22);
    project = toggleMelodyTuplet(project, "A", 0, 20);

    const pcs = getPrimaryChordsmithSource(project);
    const original = project.sourceRefs[0].original as Record<string, unknown>;

    expect(pcs?.sections.A.gridTuplets.hat[20]).toBe(true);
    expect(pcs?.sections.A.bassNotes[20]).toBe(0);
    expect(pcs?.sections.A.bassHold[21]).toBe(true);
    expect(pcs?.sections.A.bassSlide[22]).toBe(true);
    expect(pcs?.sections.A.bassAccent[20]).toBe(true);
    expect(pcs?.sections.A.melodyTracks[0][20]).toBe(0);
    expect(pcs?.sections.A.melodyHold[0][21]).toBe(true);
    expect(pcs?.sections.A.melodySlide[0][22]).toBe(true);
    expect(pcs?.sections.A.melodyTuplets[0][20]).toBe(true);
    expect(((original.gridTupletsA as Record<string, boolean[]>).hat)[20]).toBe(true);
    expect((original.bassHoldA as boolean[])[21]).toBe(true);
    expect(((original.melodyTupletsA as boolean[][])[0])[20]).toBe(true);
  });

  it("updates global, melody and guitar parity settings for playback and source roundtrip", () => {
    let project = createDemoProject();
    project = setChordsmithGlobals(project, { key: "D", scale: "minor", bpm: 132, swing: 0.12 });
    project = setBassMode(project, "manual");
    project = setMelodyOctave(project, "A", 0, 1);
    project = setMelodyPan(project, "A", 0, -0.35);
    project = setMelodyMute(project, "A", 0, true);
    project = setMelodySolo(project, "A", 0, true);
    project = setGuitarSettings(project, { guitarEnabled: true, guitarTone: "crunch", guitarRegister: "high", guitarStrumMode: "alternate", guitarVolume: 0.42 });

    const pcs = getPrimaryChordsmithSource(project);
    const original = project.sourceRefs[0].original as Record<string, unknown>;
    const guitarTrack = project.tracks.find((track) => track.role === "guitar");

    expect(project.project).toMatchObject({ key: "D", scale: "minor", bpm: 132, swing: 0.12 });
    expect(pcs).toMatchObject({ key: "D", scale: "minor", bpm: 132, swing: 0.12, bassMode: "manual", guitarTone: "crunch", guitarRegister: "high", guitarStrumMode: "alternate", guitarVolume: 0.42 });
    expect(pcs?.sections.A.melodyOctaves[0]).toBe(1);
    expect(pcs?.sections.A.melodyPan[0]).toBe(-0.35);
    expect(pcs?.sections.A.melodyMute[0]).toBe(true);
    expect(pcs?.sections.A.melodySolo[0]).toBe(true);
    expect(guitarTrack?.active).toBe(true);
    expect(guitarTrack?.volume).toBe(0.42);
    expect(original).toMatchObject({ key: "D", scale: "minor", bpm: 132, swing: 0.12, bassMode: "manual", guitarTone: "crunch", guitarRegister: "high", guitarStrumMode: "alternate", guitarVolume: 0.42 });
    expect((original.melodyMuteA as boolean[])[0]).toBe(true);
    expect((original.melodySoloA as boolean[])[0]).toBe(true);
  });
});
