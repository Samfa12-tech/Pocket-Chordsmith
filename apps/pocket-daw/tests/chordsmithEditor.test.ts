import { describe, expect, it } from "vitest";
import { renderTimelineEvents } from "../src/audio/eventRenderer";
import { createDemoProject } from "../src/demo/demoProject";
import { buildPocketDawProjectFile, createEmptyPocketDawProject, parsePocketDawProjectFile } from "../src/daw/dawProject";
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
  appendChordsmithSection,
  applyDrumPreset,
  setSectionChord,
  toggleBassAccent,
  toggleBassHold,
  toggleBassSlide,
  toggleMelodyHold,
  toggleMelodySlide,
  toggleMelodyTuplet
} from "../src/daw/chordsmithEditor";
import { DEFAULT_MASTER_VOLUME, DEFAULT_STEM_MIX } from "../../../packages/pocket-audio-core/src/constants.js";

describe("Chordsmith visual sequencer edits", () => {
  it("starts new Pocket DAW projects with an editable Chordsmith source and Section A clip", () => {
    let project = createEmptyPocketDawProject();

    expect(getPrimaryChordsmithSource(project)?.sections.A.active).toBe(true);
    expect(project.timeline.clips[0]).toMatchObject({
      type: "generated-section",
      sectionId: "A",
      sourceRefId: project.sourceRefs[0].id,
      barLength: 4
    });
    expect(project.tracks.find((track) => track.id === "master")?.volume).toBe(DEFAULT_MASTER_VOLUME);
    expect(project.tracks.find((track) => track.id === "chords")?.volume).toBe(DEFAULT_STEM_MIX.chords.volume);
    expect(project.tracks.find((track) => track.id === "melody")?.volume).toBe(DEFAULT_STEM_MIX.melody.volume);
    expect(project.tracks.find((track) => track.id === "guitar")?.volume).toBe(DEFAULT_STEM_MIX.guitar.volume);
    expect(getPrimaryChordsmithSource(project)).toMatchObject({
      masterVolume: DEFAULT_MASTER_VOLUME,
      chordVolume: DEFAULT_STEM_MIX.chords.volume,
      leadVolume: DEFAULT_STEM_MIX.melody.volume,
      guitarVolume: DEFAULT_STEM_MIX.guitar.volume
    });

    project = cycleDrumStep(project, "A", "kick", 0);

    expect(renderTimelineEvents(project).some((event) => event.kind === "kick" && event.clipId === "clip_001")).toBe(true);
  });

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

  it("appends Chordsmith sections and syncs timeline markers", () => {
    let project = createDemoProject();
    project = appendChordsmithSection(project, "B");

    const pcs = getPrimaryChordsmithSource(project);
    const sectionClips = project.timeline.clips.filter((clip) => clip.type === "generated-section");
    const lastClip = sectionClips.at(-1)!;

    expect(pcs?.songSequence.at(-1)).toBe("B");
    expect(lastClip).toMatchObject({ sectionId: "B", name: "Section B", barLength: pcs?.sections.B.bars });
    expect(project.timeline.markers.at(-1)).toMatchObject({ bar: lastClip.startBar, name: "Section B" });
    expect((project.sourceRefs[0].original as Record<string, unknown>).songSequence).toEqual(pcs?.songSequence);
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

  it("keeps live guitar edits audible when the source re-enables a stale muted guitar track", () => {
    let project = createDemoProject();
    const guitar = project.tracks.find((track) => track.role === "guitar")!;
    guitar.active = false;
    guitar.mute = true;
    guitar.volume = 0.31;

    project = cycleGuitarStep(project, "A", 1);

    const guitarTrack = project.tracks.find((track) => track.role === "guitar");
    expect(getPrimaryChordsmithSource(project)?.guitarEnabled).toBe(true);
    expect(guitarTrack).toMatchObject({
      active: true,
      mute: false,
      volume: 0.31
    });
    expect(guitarTrack?.metadata).toMatchObject({ chordsmithInstrument: getPrimaryChordsmithSource(project)?.guitarTone });
  });

  it("applies Chordsmith drum presets to kick, snare and hat while preserving bass", () => {
    let project = createDemoProject();
    project = cycleDrumTuplet(project, "A", "hat", 1);
    project = cycleBassStep(project, "A", 2);
    project = applyDrumPreset(project, "A", "lofi_backbeat_76");

    const pcs = getPrimaryChordsmithSource(project);
    const section = pcs?.sections.A;
    const original = project.sourceRefs[0].original as Record<string, unknown>;

    expect(section?.grid.kick.slice(0, 16)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
    expect(section?.grid.snare.slice(0, 16)).toEqual([0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1]);
    expect(section?.grid.hat.slice(0, 16)).toEqual([2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0]);
    expect(section?.gridTuplets.hat.slice(0, 16).some(Boolean)).toBe(false);
    expect(section?.bassNotes[2]).toBe(0);
    expect(((original.gridA as Record<string, number[]>).kick).slice(0, 16)).toEqual(section?.grid.kick.slice(0, 16));
    expect(((original.gridTupletsA as Record<string, boolean[]>).hat).slice(0, 16).some(Boolean)).toBe(false);
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

  it("validates edited melody instruments against the shared Pocket Audio registry", () => {
    let project = createDemoProject();
    project.tracks.find((track) => track.id === "melody")!.metadata = { chordsmithMelodyTrackIndex: 0 };

    project = setMelodyInstrument(project, "A", 0, "tape_bell");
    let pcs = getPrimaryChordsmithSource(project);
    let original = project.sourceRefs[0].original as Record<string, unknown>;
    expect(pcs?.sections.A.melodyInstruments[0]).toBe("tape_bell");
    expect((original.melodyInstrumentsA as string[])[0]).toBe("tape_bell");
    expect(project.tracks.find((track) => track.id === "melody")?.metadata?.chordsmithInstrument).toBe("tape_bell");
    expect(renderTimelineEvents(project).some((event) => event.kind === "melody" && event.instrument === "tape_bell")).toBe(true);

    project = setMelodyInstrument(project, "A", 0, "definitely not a shared voice");
    pcs = getPrimaryChordsmithSource(project);
    original = project.sourceRefs[0].original as Record<string, unknown>;
    expect(pcs?.sections.A.melodyInstruments[0]).toBe("pulse");
    expect((original.melodyInstrumentsA as string[])[0]).toBe("pulse");
    expect(project.tracks.find((track) => track.id === "melody")?.metadata?.chordsmithInstrument).toBe("pulse");
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
    project = setChordsmithGlobals(project, { key: "D", scale: "minor", bpm: 132, swing: 0.12, timeSig: 3, resolution: 8 });
    project = setBassMode(project, "manual");
    project = setMelodyOctave(project, "A", 0, 1);
    project = setMelodyPan(project, "A", 0, -0.35);
    project = setMelodyMute(project, "A", 0, true);
    project = setMelodySolo(project, "A", 0, true);
    project = setGuitarSettings(project, { guitarEnabled: true, guitarTone: "crunch", guitarRegister: "high", guitarStrumMode: "alternate", guitarVolume: 0.42 });

    const pcs = getPrimaryChordsmithSource(project);
    const original = project.sourceRefs[0].original as Record<string, unknown>;
    const guitarTrack = project.tracks.find((track) => track.role === "guitar");

    expect(project.project).toMatchObject({ key: "D", scale: "minor", bpm: 132, swing: 0.12, timeSig: 3, resolution: 8 });
    expect(pcs).toMatchObject({ key: "D", scale: "minor", bpm: 132, swing: 0.12, timeSig: 3, resolution: 8, bassMode: "manual", guitarTone: "crunch", guitarRegister: "high", guitarStrumMode: "alternate", guitarVolume: 0.42 });
    expect(pcs?.sections.A.melodyOctaves[0]).toBe(1);
    expect(pcs?.sections.A.melodyPan[0]).toBe(-0.35);
    expect(pcs?.sections.A.melodyMute[0]).toBe(true);
    expect(pcs?.sections.A.melodySolo[0]).toBe(true);
    expect(guitarTrack?.active).toBe(true);
    expect(guitarTrack?.mute).toBe(false);
    expect(guitarTrack?.volume).toBe(0.42);
    expect(guitarTrack?.metadata).toMatchObject({ chordsmithInstrument: "crunch" });
    expect(original).toMatchObject({ key: "D", scale: "minor", bpm: 132, swing: 0.12, timeSig: 3, resolution: 8, bassMode: "manual", guitarTone: "crunch", guitarRegister: "high", guitarStrumMode: "alternate", guitarVolume: 0.42 });
    expect((original.melodyMuteA as boolean[])[0]).toBe(true);
    expect((original.melodySoloA as boolean[])[0]).toBe(true);
  });
});
