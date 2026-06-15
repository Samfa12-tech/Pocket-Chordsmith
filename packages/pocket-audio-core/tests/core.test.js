import test from "node:test";
import assert from "node:assert/strict";
import {
  PocketAudio,
  SECTION_IDS,
  buildPocketAudioTimeline,
  buildPocketChordsmithShareCode,
  base64UrlToUtf8,
  encodePcm16WavBytes,
  normalisePocketChordsmithProject,
  parsePocketChordsmithInput,
  renderPocketAudioBuffer,
  utf8ToBase64Url
} from "../src/index.js";

const minimalProject = {
  projectVersion: 16,
  title: "Core Test",
  key: "D",
  scale: "minor",
  bpm: 104,
  timeSig: 4,
  resolution: 4,
  songSequence: ["A"],
  sectionBars: { A: 1 },
  progressionA: [0, 4, 5, 3],
  gridA: {
    kick: [1, 0, 0, 0],
    snare: [0, 0, 1, 0],
    hat: [1, 1, 1, 1],
    bass: [1, 0, 0, 0]
  }
};

test("base64url helpers round trip utf8 text", () => {
  const text = "Pocket Audio Core D minor";
  assert.equal(base64UrlToUtf8(utf8ToBase64Url(text)), text);
});

test("PCS1 parse round trip", () => {
  const code = buildPocketChordsmithShareCode(minimalProject);
  assert.ok(code.startsWith("PCS1:"));
  assert.deepEqual(parsePocketChordsmithInput(code), minimalProject);
});

test("raw JSON string parse", () => {
  assert.deepEqual(parsePocketChordsmithInput(JSON.stringify(minimalProject)), minimalProject);
});

test("normalise minimal project", () => {
  const normalised = normalisePocketChordsmithProject(minimalProject);
  assert.equal(normalised.app, "PocketAudioProject");
  assert.equal(normalised.meta.key, "D");
  assert.equal(normalised.meta.scale, "minor");
  assert.equal(normalised.sections.A.bars, 1);
  assert.equal(normalised.sections.A.drums.kick[0], 1);
});

test("PocketAudio class constructs, loads, plays and stops", async () => {
  const audio = new PocketAudio({ diagnostics: true });
  const events = [];
  audio.on("play", (event) => events.push(event));
  await audio.loadProject(minimalProject);
  await audio.resume();
  audio.play();
  assert.equal(audio.getTransport().playing, true);
  audio.stop();
  assert.equal(audio.getTransport().playing, false);
  assert.equal(events.length, 1);
});

test("timeline includes drums, bass, chords, melody and guitar events", () => {
  const project = normalisePocketChordsmithProject(richProject());
  const timeline = buildPocketAudioTimeline(project);
  const types = new Set(timeline.events.map((event) => event.type));
  assert.ok(types.has("kick"));
  assert.ok(types.has("bass"));
  assert.ok(types.has("chord"));
  assert.ok(types.has("melody"));
  assert.ok(types.has("guitar"));
  assert.ok(timeline.duration > 0);
});

test("swing timing alternates step durations", () => {
  const project = normalisePocketChordsmithProject({ ...minimalProject, swing: 0.2, gridA: { kick: [1, 1, 1, 1], snare: [], hat: [], bass: [] } });
  const timeline = buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" });
  const kicks = timeline.events.filter((event) => event.type === "kick");
  assert.ok(kicks[1].time - kicks[0].time < kicks[2].time - kicks[1].time);
});

test("triplet timing creates three evenly spaced events over two steps", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    gridA: { kick: [1, 1, 0, 0], snare: [], hat: [], bass: [] },
    gridTupletsA: { kick: [true, false, false, false] }
  });
  const kicks = buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" }).events.filter((event) => event.type === "kick");
  assert.equal(kicks.length, 3);
  assert.ok(Math.abs((kicks[1].time - kicks[0].time) - (kicks[2].time - kicks[1].time)) < 0.0001);
});

test("section sequence timing offsets later sections", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    songSequence: ["A", "B"],
    sectionBars: { A: 1, B: 1 },
    gridB: { kick: [1, 0, 0, 0], snare: [], hat: [], bass: [] },
    progressionB: [3, 2, 1, 0]
  });
  const timeline = buildPocketAudioTimeline(project);
  const bKick = timeline.events.find((event) => event.sectionId === "B" && event.type === "kick");
  assert.ok(bKick.time >= 60 / minimalProject.bpm * 4 - 0.000001);
});

test("section scope renders only the requested section", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    songSequence: ["A", "B"],
    sectionBars: { A: 1, B: 1 },
    gridB: { kick: [1, 0, 0, 0], snare: [], hat: [], bass: [] },
    progressionB: [3, 2, 1, 0]
  });
  const timeline = buildPocketAudioTimeline(project, { scope: "section", sectionId: "B" });
  assert.deepEqual(timeline.sectionIds, ["B"]);
  assert.ok(timeline.events.length > 0);
  assert.ok(timeline.events.every((event) => event.sectionId === "B"));
});

test("all scope renders canonical A-H sections instead of the song sequence", () => {
  const sectionBars = Object.fromEntries(SECTION_IDS.map((id) => [id, 1]));
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    songSequence: ["B"],
    sectionBars,
    gridB: { kick: [1, 0, 0, 0], snare: [], hat: [], bass: [] }
  });
  const sequenceTimeline = buildPocketAudioTimeline(project, { scope: "sequence" });
  const allTimeline = buildPocketAudioTimeline(project, { scope: "all" });
  assert.deepEqual(sequenceTimeline.sectionIds, ["B"]);
  assert.deepEqual(allTimeline.sectionIds, SECTION_IDS);
  assert.ok(allTimeline.duration > sequenceTimeline.duration);
});

test("explicit sectionIds scope keeps the requested order", () => {
  const project = normalisePocketChordsmithProject(minimalProject);
  const timeline = buildPocketAudioTimeline(project, { scope: "all", sectionIds: ["H", "E", "B"] });
  assert.deepEqual(timeline.sectionIds, ["H", "E", "B"]);
});

test("held melody extends duration", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    bpm: 60,
    melodyTracksA: [[0, null, null, null]],
    melodyHoldA: [[false, true, true, false]]
  });
  const melody = buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" }).events.find((event) => event.type === "melody");
  assert.ok(melody.duration > 0.5);
});

test("offline render returns buffer metadata and wav blob", async () => {
  const project = normalisePocketChordsmithProject(richProject());
  const rendered = renderPocketAudioBuffer(project, { sampleRate: 8000 });
  assert.ok(rendered.duration > 0);
  assert.ok(rendered.eventCount > 0);
  const audio = new PocketAudio({ audio: false });
  await audio.loadProject(project);
  const wav = await audio.renderWav({ sampleRate: 8000 });
  assert.ok(wav.size > 44);
});

test("wav encoder writes channel metadata", () => {
  const bytes = encodePcm16WavBytes({
    channels: [new Float32Array(8), new Float32Array(8)],
    sampleRate: 8000
  });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(28, true), 32000);
  assert.equal(view.getUint16(32, true), 4);
});

test("game profile supports music states and runtime controls", async () => {
  const audio = new PocketAudio({
    audio: false,
    profile: "game",
    musicStates: {
      exploration: { sequence: ["A"], loop: true },
      combat: { sequence: ["A"], loop: true, intensity: 0.8, stems: { melody: { mute: true } } },
      victory: { section: "A", thenReturnTo: "exploration" },
      danger: { stinger: "crash", thenReturnTo: "combat" }
    }
  });
  const stingers = [];
  audio.on("stinger", (event) => stingers.push(event));
  await audio.loadProject(minimalProject);
  await audio.resumeFromUserGesture();
  audio.setMusicState("exploration");
  audio.queueMusicState("combat", { quantize: "bar" });
  audio.queueSection("victory", { quantize: "section" });
  audio.triggerStinger("danger");
  audio.setIntensity(0.7);
  audio.duck(true, { amount: 0.45, releaseMs: 500 });
  audio.lowpass(0.5);
  audio.setStemVolume("drums", 0.8);
  assert.equal(audio.profile, "game");
  assert.equal(audio.currentMusicState, "victory");
  assert.equal(audio.project.mixer.stems.melody.mute, true);
  assert.equal(audio.project.mixer.stems.drums.volume, 0.8);
  assert.equal(audio.project.mixer.fx.filter, 0.5);
  assert.equal(audio.ducking.enabled, true);
  assert.equal(audio.ducking.amount, 0.45);
  assert.equal(audio.getDiagnostics().profile, "game");
  assert.equal(stingers.at(-1).stinger, "crash");
});

test("live engine emits beat/event callbacks from timeline", async () => {
  const audio = new PocketAudio({ audio: false });
  const events = [];
  audio.on("event", (event) => events.push(event));
  await audio.loadProject({ ...minimalProject, bpm: 240, sectionBars: { A: 1 } });
  await audio.play({ scope: "section", sectionId: "A" });
  await new Promise((resolve) => setTimeout(resolve, 90));
  audio.stop();
  assert.ok(events.length > 0);
});

function richProject() {
  return {
    ...minimalProject,
    guitarEnabled: true,
    guitarTone: "high_gain",
    guitarPatternA: ["open", "hold", "chug", "off"],
    melodyTracksA: [[0, null, 2, null]],
    melodyInstrumentsA: ["pulse"],
    bassMode: "manual",
    bassNotesA: [0, null, 4, null],
    bassAccentA: [true, false, false, false],
    gridA: {
      kick: [1, 0, 0, 0],
      snare: [0, 0, 1, 0],
      hat: [1, 1, 1, 1],
      bass: [0, 0, 0, 0]
    }
  };
}
