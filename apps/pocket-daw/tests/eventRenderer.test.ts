import { describe, expect, it } from "vitest";
import { renderTimelineEvents, resolveClipEvents } from "../src/audio/eventRenderer";
import { createDemoProject, createLofiTemplateProject } from "../src/demo/demoProject";
import { setDrumLaneGate, setDrumLaneMute, setDrumLanePan, setDrumLaneSolo, setDrumLaneVolume } from "../src/daw/drumLanes";
import type { Clip, ClipType } from "../src/daw/schema";
import { sanitizePocketChordsmithProject } from "../src/compatibility/pcsSanitizer";
import { createDawProjectFromChordsmithProject } from "../src/compatibility/pcsToDaw";
import { createAutomationLane } from "../src/daw/automation";
import { addMidiController, addMidiPitchBend, importMidiFileToProject, midiDataFromClip, setMidiControllerField, setMidiNoteField, setMidiPitchBendField } from "../src/daw/midiClips";
import { parseStandardMidiFile } from "../src/daw/midiParser";
import { timelineSecondsAtBar } from "../src/daw/timeline";
import { simpleMidiBytes, tempoMapMidiBytes } from "./midiFixtures";
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

  it("applies per-drum lane gate to generated drum event durations", () => {
    const project = createDemoProject();
    const before = renderTimelineEvents(project).find((event) => event.kind === "snare");
    const gated = renderTimelineEvents(setDrumLaneGate(project, "snare", 0.5)).find((event) => event.kind === "snare");

    expect(before?.duration).toBeGreaterThan(0);
    expect(gated?.duration).toBeCloseTo((before?.duration || 0) * 0.5, 5);
  });

  it("filters generated drums to soloed drum lanes", () => {
    const project = setDrumLaneSolo(createDemoProject(), "kick", true);
    const events = renderTimelineEvents(project);

    expect(events.some((event) => event.kind === "kick")).toBe(true);
    expect(events.some((event) => event.kind === "snare")).toBe(false);
    expect(events.some((event) => event.kind === "hat")).toBe(false);
    expect(events.some((event) => event.trackId === "bass")).toBe(true);
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

  it("applies MIDI CC7 volume and CC10 pan to rendered MIDI preview events", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Render" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let project = addMidiController(imported.project, imported.clipId, 0);
    let clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const volumeId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, imported.clipId, volumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, volumeId, "value", 64);
    project = addMidiController(project, imported.clipId, 0);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const panId = midiDataFromClip(clip).controllers.find((point) => point.id !== volumeId)!.id;
    project = setMidiControllerField(project, imported.clipId, panId, "controller", 10);
    project = setMidiControllerField(project, imported.clipId, panId, "value", 127);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.midi).toBe(60);
    expect(event.channel).toBe(0);
    expect(event.velocity).toBeCloseTo((100 / 127) * (64 / 127), 5);
    expect(event.pan).toBe(1);
  });

  it("applies MIDI CC11 expression alongside CC7 volume to rendered MIDI preview events", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Expression" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let project = addMidiController(imported.project, imported.clipId, 0);
    let clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const volumeId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, imported.clipId, volumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, volumeId, "value", 96);
    project = addMidiController(project, imported.clipId, 0);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const expressionId = midiDataFromClip(clip).controllers.find((point) => point.id !== volumeId)!.id;
    project = setMidiControllerField(project, imported.clipId, expressionId, "controller", 11);
    project = setMidiControllerField(project, imported.clipId, expressionId, "value", 32);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.velocity).toBeCloseTo((100 / 127) * (96 / 127) * (32 / 127), 5);
  });

  it("extends rendered MIDI preview note durations while CC64 sustain is held", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Sustain" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let project = addMidiController(imported.project, imported.clipId, 0);
    let clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const sustainOnId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, imported.clipId, sustainOnId, "controller", 64);
    project = setMidiControllerField(project, imported.clipId, sustainOnId, "value", 127);
    project = addMidiController(project, imported.clipId, 960);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const sustainOffId = midiDataFromClip(clip).controllers.find((point) => point.id !== sustainOnId)!.id;
    project = setMidiControllerField(project, imported.clipId, sustainOffId, "controller", 64);
    project = setMidiControllerField(project, imported.clipId, sustainOffId, "value", 0);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.duration).toBeCloseTo(1.25, 5);
  });

  it("applies active MIDI pitch bend as preview detune cents without changing note pitch", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Pitch Bend Preview" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let project = addMidiPitchBend(imported.project, imported.clipId, 0);
    const clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const bendId = midiDataFromClip(clip).pitchBends[0].id;
    project = setMidiPitchBendField(project, imported.clipId, bendId, "value", 12288);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.midi).toBe(60);
    expect(event.detuneCents).toBeCloseTo(100, 5);
  });

  it("lets MIDI CC7 value zero silence rendered MIDI preview events", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Silence" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let project = addMidiController(imported.project, imported.clipId, 0);
    const clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const volumeId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, imported.clipId, volumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, volumeId, "value", 0);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.velocity).toBe(0);
  });

  it("renders precise MIDI note field edits", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Note Fields" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    const noteId = midiDataFromClip(imported.project.timeline.clips.find((item) => item.id === imported.clipId)!).notes[0].id;
    let project = setMidiNoteField(imported.project, imported.clipId, noteId, "pitch", 72);
    project = setMidiNoteField(project, imported.clipId, noteId, "startTick", 240);
    project = setMidiNoteField(project, imported.clipId, noteId, "durationTicks", 960);
    project = setMidiNoteField(project, imported.clipId, noteId, "velocity", 81);
    project = setMidiNoteField(project, imported.clipId, noteId, "channel", 2);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.midi).toBe(72);
    expect(event.step).toBe(240);
    expect(event.duration).toBeCloseTo((960 / 480) * (60 / project.project.bpm), 5);
    expect(event.velocity).toBeCloseTo(81 / 127, 5);
    expect(event.channel).toBe(2);
  });

  it("uses imported MIDI tempo maps for MIDI note render timing", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Tempo Render", bpm: 120 })),
      parseStandardMidiFile(tempoMapMidiBytes()),
      "tempo-map.mid"
    );

    const event = renderTimelineEvents(imported.project).find((item) => item.kind === "midi")!;

    expect(event.time).toBeCloseTo(0, 5);
    expect(event.duration).toBeCloseTo(0.5 + 60 / 140, 5);
  });

  it("uses project tempo automation for generated and MIDI clip placement", () => {
    let generated = createDemoProject();
    generated.project.bpm = 120;
    generated.project.timeSig = 4;
    generated = createAutomationLane(generated, "project.tempo", {
      min: 40,
      max: 240,
      points: [{ bar: 1, value: 60, curve: "hold" }]
    }).project;
    generated.timeline.clips[0].startBar = 2;
    const generatedEvent = renderTimelineEvents(generated).find((event) => event.clipId === generated.timeline.clips[0].id)!;

    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI Tempo Lane", bpm: 120 })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let midiProject = createAutomationLane(imported.project, "project.tempo", {
      min: 40,
      max: 240,
      points: [{ bar: 1, value: 60, curve: "hold" }]
    }).project;
    midiProject.timeline.clips.find((item) => item.id === imported.clipId)!.startBar = 2;
    const midiEvent = renderTimelineEvents(midiProject).find((event) => event.kind === "midi")!;

    expect(generatedEvent.time).toBeCloseTo(4, 5);
    expect(midiEvent.time).toBeCloseTo(4, 5);
  });

  it("uses project meter maps for generated clip placement without requiring tempo automation", () => {
    const project = createDemoProject();
    project.project.bpm = 120;
    project.project.timeSig = 4;
    project.project.meterMap = [{ id: "meter_7_8", bar: 2, numerator: 7, denominator: 8, source: "manual" }];
    project.timeline.clips[0].startBar = 3;

    const generatedEvent = renderTimelineEvents(project).find((event) => event.clipId === project.timeline.clips[0].id)!;

    expect(generatedEvent.time).toBeCloseTo(timelineSecondsAtBar(project, 3), 5);
  });

  it("matches MIDI controller playback to the note channel", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Channel" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    const noteId = midiDataFromClip(imported.project.timeline.clips.find((item) => item.id === imported.clipId)!).notes[0].id;
    let project = setMidiNoteField(imported.project, imported.clipId, noteId, "channel", 2);
    project = addMidiController(project, imported.clipId, 0);
    let clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const channelZeroVolumeId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, imported.clipId, channelZeroVolumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, channelZeroVolumeId, "value", 12);
    project = setMidiControllerField(project, imported.clipId, channelZeroVolumeId, "channel", 0);
    project = addMidiController(project, imported.clipId, 0);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const channelTwoVolumeId = midiDataFromClip(clip).controllers.find((point) => point.id !== channelZeroVolumeId)!.id;
    project = setMidiControllerField(project, imported.clipId, channelTwoVolumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, channelTwoVolumeId, "value", 96);
    project = setMidiControllerField(project, imported.clipId, channelTwoVolumeId, "channel", 2);

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.channel).toBe(2);
    expect(event.velocity).toBeCloseTo((100 / 127) * (96 / 127), 5);
  });

  it("uses clipped MIDI note start and later same-tick controller values for CC playback", () => {
    const imported = importMidiFileToProject(
      createDawProjectFromChordsmithProject(sanitizePocketChordsmithProject({ title: "MIDI CC Trim" })),
      parseStandardMidiFile(simpleMidiBytes()),
      "lead.mid"
    );
    let project = addMidiController(imported.project, imported.clipId, 0);
    let clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const firstVolumeId = midiDataFromClip(clip).controllers[0].id;
    project = setMidiControllerField(project, imported.clipId, firstVolumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, firstVolumeId, "value", 32);
    project = addMidiController(project, imported.clipId, 240);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const clippedVolumeId = midiDataFromClip(clip).controllers.find((point) => point.id !== firstVolumeId)!.id;
    project = setMidiControllerField(project, imported.clipId, clippedVolumeId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, clippedVolumeId, "value", 64);
    project = addMidiController(project, imported.clipId, 240);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    const laterSameTickId = midiDataFromClip(clip).controllers.find((point) => point.id !== firstVolumeId && point.id !== clippedVolumeId)!.id;
    project = setMidiControllerField(project, imported.clipId, laterSameTickId, "controller", 7);
    project = setMidiControllerField(project, imported.clipId, laterSameTickId, "value", 96);
    clip = project.timeline.clips.find((item) => item.id === imported.clipId)!;
    clip.metadata = { ...(clip.metadata || {}), sourceStartTick: 240 };

    const event = renderTimelineEvents(project).find((item) => item.kind === "midi")!;

    expect(event.step).toBe(0);
    expect(event.velocity).toBeCloseTo((100 / 127) * (96 / 127), 5);
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
