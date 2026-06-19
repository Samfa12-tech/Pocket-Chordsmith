import { describe, expect, it } from "vitest";
import { renderTimelineEvents, resolveClipEvents } from "../src/audio/eventRenderer";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { setDrumLaneMute, setDrumLanePan, setDrumLaneVolume } from "../src/daw/drumLanes";
import type { Clip, ClipType } from "../src/daw/schema";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { buildPocketAudioTimeline, normalisePocketChordsmithProject } from "../../../packages/pocket-audio-core/src/index.js";
import { chordsmithHumanizeOffset, chordsmithHumanizePeak } from "../../../packages/pocket-audio-core/src/performance/humanize.js";

describe("event renderer", () => {
  it("renders audible demo events for generated tracks", () => {
    const events = renderTimelineEvents(createDemoProject());
    const trackIds = new Set(events.map((event) => event.trackId));

    expect(events.length).toBeGreaterThan(0);
    expect(Array.from(trackIds)).toEqual(expect.arrayContaining(["drums", "bass", "chords", "melody", "guitar"]));
    expect(events[0]).toMatchObject({ trackId: "drums", time: 0 });
  });

  it("renders guitar with an explicit tone and usable velocity", () => {
    const events = renderTimelineEvents(createDemoProject());
    const guitarEvents = events.filter((event) => event.trackId === "guitar");

    expect(guitarEvents.length).toBeGreaterThan(0);
    expect(guitarEvents[0].instrument).toBeTruthy();
    expect(guitarEvents[0].velocity).toBeGreaterThan(0.4);
    expect(guitarEvents[0].midiNotes?.length).toBeGreaterThanOrEqual(3);
    expect(guitarEvents[0].midiNotes?.[0]).toBe(45);
    expect(guitarEvents[0].direction).toBe("down");
  });

  it("uses Chordsmith-style bass peaks", () => {
    const events = renderTimelineEvents(createDemoProject());
    const bassEvent = events.find((event) => event.trackId === "bass");

    expect(bassEvent?.velocity).toBeCloseTo(0.34, 5);
  });

  it("carries lofi Chordsmith sound metadata into rendered DAW events", () => {
    const events = renderTimelineEvents(createLofiTemplateProject());

    expect(events.some((event) => event.kind === "texture" && event.audioProfile === "lofi_chill" && event.lofiTexture?.enabled === true)).toBe(true);
    expect(events.some((event) => event.kind === "kick" && event.drumKit === "lofi_dusty")).toBe(true);
    expect(events.some((event) => event.kind === "bass" && event.bassTone === "warm_sub")).toBe(true);
    expect(events.some((event) => event.kind === "chord" && event.instrument === "dusty_rhodes")).toBe(true);
    expect(events.some((event) => event.kind === "melody" && event.instrument === "mellow_vibes")).toBe(true);
    expect(events.some((event) => event.kind === "melody" && event.instrument === "tape_bell")).toBe(true);
  });

  it("applies per-drum lane volume, pan and mute to rendered drum events", () => {
    let project = createDemoProject();
    const before = renderTimelineEvents(project).find((event) => event.kind === "snare");
    project = setDrumLaneVolume(project, "snare", 0.5);
    project = setDrumLanePan(project, "snare", -0.3);
    const mixed = renderTimelineEvents(project).find((event) => event.kind === "snare");
    project = setDrumLaneMute(project, "snare", true);

    expect(before?.velocity).toBeGreaterThan(0);
    expect(mixed?.velocity).toBeCloseTo((before?.velocity || 0) * 0.5, 5);
    expect(mixed?.pan).toBeCloseTo(-0.3);
    expect(mixed?.drumLane).toBe("snare");
    expect(renderTimelineEvents(project).some((event) => event.kind === "snare")).toBe(false);
  });

  it("uses Chordsmith humanise timing and peaks when imported projects request it", () => {
    const plain = renderTimelineEvents(chordsmithFixture(false));
    const human = renderTimelineEvents(chordsmithFixture(true));
    const find = (events: ReturnType<typeof renderTimelineEvents>, kind: string) => {
      const event = events.find((item) => item.kind === kind && item.step === 4);
      expect(event).toBeTruthy();
      return event!;
    };

    const plainKick = find(plain, "kick");
    const humanKick = find(human, "kick");
    const humanBass = find(human, "bass");
    const humanMelody = find(human, "melody");
    const plainGuitar = find(plain, "guitar");
    const humanGuitar = find(human, "guitar");

    expect(humanKick.time).toBeCloseTo(plainKick.time + chordsmithHumanizeOffset(4, 1, true), 6);
    expect(humanKick.velocity).toBeCloseTo(chordsmithHumanizePeak(0.95, 4, 1, true), 6);
    expect(humanBass.velocity).toBeCloseTo(chordsmithHumanizePeak(0.34, 4, 4, true), 6);
    expect(humanMelody.velocity).toBeCloseTo(chordsmithHumanizePeak(1, 4, 10, true), 6);
    expect(humanGuitar.time).toBeCloseTo(plainGuitar.time + chordsmithHumanizeOffset(4, 17, true), 6);
    expect(humanGuitar.velocity).toBe(plainGuitar.velocity);
  });

  it("keeps imported Chordsmith section scheduling aligned with Pocket Audio Core", () => {
    const raw = timelineParityFixture();
    const dawEvents = renderTimelineEvents(createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject(raw)));
    const coreEvents = buildPocketAudioTimeline(normalisePocketChordsmithProject(raw), { scope: "section", sectionId: "A" }).events;

    expect(dawEvents.map(dawSkeleton)).toEqual(coreEvents.map(coreSkeleton));
  });

  it("safely ignores clip types without resolvers or payloads", () => {
    const project = createDemoProject();
    const base = project.timeline.clips[0];
    const futureTypes: ClipType[] = ["generated-pattern", "audio", "automation", "marker"];

    futureTypes.forEach((type) => {
      const clip: Clip = { ...base, id: `future-${type}`, type, muted: false };
      expect(resolveClipEvents(project, clip)).toEqual([]);
    });

    expect(resolveClipEvents(project, { ...base, id: "midi-empty", type: "midi", muted: false, metadata: {} })).toEqual([]);
  });
});

function dawSkeleton(event: ReturnType<typeof renderTimelineEvents>[number]) {
  return cleanSkeleton({
    role: event.role,
    type: event.kind,
    step: event.step,
    time: event.time,
    duration: event.kind === "kick" || event.kind === "snare" || event.kind === "hat" ? undefined : event.duration,
    midi: event.midi,
    midiNotes: event.midiNotes,
    instrument: event.instrument,
    articulation: event.articulation,
    accent: event.accent,
    tuplet: event.kind === "kick" || event.kind === "snare" || event.kind === "hat" ? undefined : event.tuplet,
    slideMidi: event.slideMidi,
    slideOffset: event.slideOffset,
    direction: event.direction,
    drumKit: event.drumKit,
    bassTone: event.bassTone,
    pan: event.role === "drums" ? undefined : event.pan,
    audioProfile: event.audioProfile,
    lofiPreset: event.lofiPreset
  });
}

function coreSkeleton(event: Record<string, unknown>) {
  return cleanSkeleton({
    role: event.stem,
    type: event.type,
    step: event.step,
    time: event.time,
    duration: event.type === "kick" || event.type === "snare" || event.type === "hat" ? undefined : event.duration,
    midi: event.midi,
    midiNotes: event.midiNotes,
    instrument: event.instrument,
    articulation: event.articulation,
    accent: event.accent,
    tuplet: event.type === "kick" || event.type === "snare" || event.type === "hat" ? undefined : event.tuplet,
    slideMidi: event.slideMidi,
    slideOffset: event.slideOffset,
    direction: event.direction,
    drumKit: event.drumKit,
    bassTone: event.bassTone,
    pan: event.pan,
    audioProfile: event.audioProfile,
    lofiPreset: event.lofiPreset
  });
}

function cleanSkeleton(source: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") return;
    out[key] = typeof value === "number" ? round(value) : value;
  });
  return out;
}

function round(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function chordsmithFixture(humanizeOn: boolean) {
  const steps = 16;
  const grid = {
    kick: new Array(steps).fill(0),
    snare: new Array(steps).fill(0),
    hat: new Array(steps).fill(0),
    bass: new Array(steps).fill(0)
  };
  grid.kick[4] = 1;
  grid.bass[4] = 1;
  const melody = new Array<number | null>(steps).fill(null);
  melody[4] = 2;
  const guitarPattern = new Array<string>(steps).fill("off");
  guitarPattern[4] = "accent";
  const blankBool = new Array<boolean>(steps).fill(false);

  return createDawProjectFromChordsmithProject(
    sanitizePocketChordsmithProject({
      projectVersion: 16,
      title: "Humanise Fixture",
      key: "C",
      scale: "major",
      timeSig: 4,
      bpm: 120,
      resolution: 4,
      humanizeOn,
      bassOn: true,
      bassMode: "auto",
      guitarEnabled: true,
      sectionBars: { A: 1 },
      songSequence: ["A"],
      progressionA: [0],
      gridA: grid,
      melodyTracksA: [melody],
      melodyInstrumentsA: ["pulse"],
      melodyOctavesA: [0],
      melodyMuteA: [false],
      melodySoloA: [false],
      melodyPanA: [0],
      melodyHoldA: [blankBool],
      melodySlideA: [blankBool],
      melodyTupletsA: [blankBool],
      bassHoldA: blankBool,
      bassSlideA: blankBool,
      bassAccentA: blankBool,
      guitarPatternA: guitarPattern
    })
  );
}

function timelineParityFixture() {
  const steps = 16;
  const grid = {
    kick: new Array(steps).fill(0),
    snare: new Array(steps).fill(0),
    hat: new Array(steps).fill(0),
    bass: new Array(steps).fill(0)
  };
  grid.kick[0] = 1;
  grid.kick[4] = 2;
  grid.snare[4] = 1;
  grid.snare[8] = 2;
  grid.hat[0] = 1;
  grid.hat[2] = 1;
  grid.hat[10] = 1;
  grid.hat[11] = 2;
  grid.bass[2] = 1;
  grid.bass[10] = 1;
  grid.bass[11] = 2;
  const tuplets = {
    kick: new Array(steps).fill(false),
    snare: new Array(steps).fill(false),
    hat: new Array(steps).fill(false),
    bass: new Array(steps).fill(false)
  };
  tuplets.hat[10] = true;
  tuplets.bass[10] = true;
  const melody = new Array<number | null>(steps).fill(null);
  melody[1] = 2;
  melody[6] = 4;
  melody[7] = 8;
  melody[12] = 5;
  melody[13] = 9;
  const hold = new Array<boolean>(steps).fill(false);
  hold[2] = true;
  const slide = new Array<boolean>(steps).fill(false);
  slide[7] = true;
  const melodyTuplets = new Array<boolean>(steps).fill(false);
  melodyTuplets[12] = true;
  const bassNotes = new Array<number | null>(steps).fill(null);
  bassNotes[2] = 0;
  bassNotes[10] = 3;
  bassNotes[11] = 5;
  const bassHold = new Array<boolean>(steps).fill(false);
  bassHold[3] = true;
  const bassSlide = new Array<boolean>(steps).fill(false);
  const bassAccent = new Array<boolean>(steps).fill(false);
  bassAccent[10] = true;
  const guitarPattern = new Array<string>(steps).fill("off");
  guitarPattern[0] = "open";
  guitarPattern[1] = "hold";
  guitarPattern[6] = "accent";

  return {
    projectVersion: 16,
    title: "Timeline Parity Fixture",
    key: "D",
    scale: "minor",
    timeSig: 4,
    bpm: 120,
    swing: 0.04,
    resolution: 4,
    chordType: "seventh",
    chordInstrument: "warm_pad",
    chordPlayMode: "strum_up",
    chordRhythmMode: "quarter",
    melodyPitchMode: "scale",
    bassOn: true,
    bassMode: "manual",
    guitarEnabled: true,
    guitarTone: "clean",
    guitarRegister: "mid",
    guitarStrumMode: "alternate",
    humanizeOn: false,
    sectionBars: { A: 1 },
    songSequence: ["A"],
    progressionA: [0],
    gridA: grid,
    gridTupletsA: tuplets,
    melodyTracksA: [melody],
    melodyInstrumentsA: ["bell"],
    melodyOctavesA: [0],
    melodyMuteA: [false],
    melodySoloA: [false],
    melodyPanA: [0.25],
    melodyHoldA: [hold],
    melodySlideA: [slide],
    melodyTupletsA: [melodyTuplets],
    bassNotesA: bassNotes,
    bassHoldA: bassHold,
    bassSlideA: bassSlide,
    bassAccentA: bassAccent,
    guitarPatternA: guitarPattern
  };
}
