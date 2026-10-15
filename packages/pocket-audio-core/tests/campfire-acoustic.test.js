import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderPocketAudioBuffer, renderPocketAudioEventBuffer, renderPocketAudioStemBuffers } from "../src/engine/offline-renderer.js";
import { chordsmithOfflineStemRenderGain } from "../src/performance/stem-mix.js";
import { normalisePocketChordsmithProject } from "../src/schema/normalise-project.js";
import { buildPocketAudioTimeline } from "../src/events/timeline-events.js";
import { parsePocketChordsmithInput } from "../src/schema/parse-share-code.js";
import { createPocketAudioRendererCapabilityReport } from "../src/engine/capabilities.js";
import { PocketAudio } from "../src/engine/live-engine.js";
import { prepareCampfireAcousticNoteBank } from "../src/synth/campfire-acoustic.js";
import { findPocketGuitarTone, POCKET_GUITAR_TONES, POCKET_PREPARED_GUITAR_TONES } from "../src/sounds/guitar.js";
import { createGodotExportKit } from "../src/export/godot-kit.js";
import { decodePcmWavBytes } from "../src/export/wav.js";
import {
  CAMPFIRE_ACOUSTIC_RECIPE, CAMPFIRE_REFERENCE_CHORDS, CampfireAcousticNoteCache,
  campfireAcousticNoteKey, campfireAcousticReferenceEvents, campfireAcousticVoicing,
  renderCampfireAcousticEvent, renderCampfireAcousticNote
} from "../src/sounds/campfire-acoustic.js";

const reference = JSON.parse(readFileSync(new URL("./fixtures/campfire-reference-hashes.json", import.meta.url)));
const eventReference = JSON.parse(readFileSync(new URL("./fixtures/campfire-event-reference-hashes.json", import.meta.url)));

test("compact Campfire authoring retains identity and complete D/G/Bm/A voicings without changing amplifier IDs", () => {
  assert.deepEqual(POCKET_PREPARED_GUITAR_TONES, ["campfire_acoustic"]);
  assert.equal(POCKET_GUITAR_TONES.length, 8, "prepared instruments must not acquire an amplifier fallback");
  assert.throws(() => findPocketGuitarTone("campfire_acoustic"), /prepared PCM/);
  for (const register of ["low", "mid", "high"]) {
    const project = normalisePocketChordsmithProject({
      projectVersion: 17, key: "D", scale: "major", bpm: 76, timeSig: 4, resolution: 1,
      guitarEnabled: true, guitarTone: "campfire_acoustic", guitarRegister: register, guitarVolume: 0.2,
      guitarStrumMode: "alternate", songSequence: ["A"], sectionBars: { A: 4 },
      progressionA: [0, 3, 5, 4], guitarPatternA: Array.from({ length: 16 }, (_, index) => index % 4 === 0 ? "open" : "off")
    });
    const events = buildPocketAudioTimeline(project).events.filter(event => event.type === "guitar");
    assert.equal(project.sections.A.guitar.tone, "campfire_acoustic");
    assert.equal(events.length, 4);
    const octave = { low: 0, mid: 12, high: 24 }[register];
    assert.deepEqual(events.map(event => event.midiNotes), CAMPFIRE_REFERENCE_CHORDS.map(chord => chord.notes.map(note => note + octave)));
    for (const event of events) {
      assert.equal(event.instrument, "campfire_acoustic");
      assert.equal(event.velocity, 1, "project volume belongs to the shared mixer, not a second note gain");
      assert.equal(event.technique.campfire.strumSeconds, 0.027);
      assert.equal(event.technique.campfire.recipeVersion, 1);
    }
    for (const input of [JSON.stringify(project.source.original), `PCS1:${Buffer.from(JSON.stringify(project.source.original)).toString("base64url")}`]) {
      const roundTrip = normalisePocketChordsmithProject(parsePocketChordsmithInput(input));
      assert.deepEqual(buildPocketAudioTimeline(roundTrip).events, buildPocketAudioTimeline(project).events);
    }
  }
});

test("compact Campfire major/minor quality survives all keys and old power-chord songs stay unchanged", () => {
  for (const key of ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) for (const scale of ["major", "minor"]) {
    const source = { projectVersion: 17, key, scale, guitarEnabled: true, guitarTone: "campfire_acoustic", guitarPatternA: ["open"], sectionBars: { A: 1 }, songSequence: ["A"] };
    const event = buildPocketAudioTimeline(normalisePocketChordsmithProject(source)).events.find(event => event.type === "guitar");
    const third = scale === "major" ? 4 : 3;
    assert.equal(event.midiNotes.length, 4);
    assert.ok(event.midiNotes.some(note => (note - event.midiNotes[0] + 24) % 12 === third), `${key} ${scale} must retain its third`);
    const old = buildPocketAudioTimeline(normalisePocketChordsmithProject({ ...source, guitarTone: "high_gain" })).events.find(event => event.type === "guitar");
    assert.equal(old.midiNotes.length, 3);
    assert.deepEqual(old.midiNotes.map(note => note - old.midiNotes[0]), [0, 7, 12]);
    assert.equal(old.velocity, 0.66);
    assert.equal(old.technique, undefined);
  }
});

test("Campfire capability reports declare compact extensions and unsupported articulations without changing rich notes", () => {
  const source = { projectVersion: 17, guitarEnabled: true, guitarTone: "campfire_acoustic", chordType: "seventh", guitarPatternA: ["open", "chug", "scratch"], sectionBars: { A: 1 }, songSequence: ["A"] };
  for (const input of [source, normalisePocketChordsmithProject(source)]) {
    const report = createPocketAudioRendererCapabilityReport(input);
    assert.equal(report.exact, false);
    assert.equal(report.losses.length, 3);
    assert.deepEqual(report.capabilities.preparedGuitarTones, ["campfire_acoustic"]);
    assert.ok(report.losses.some(item => item.feature === "campfire-chord:seventh" && item.fallback === "triad"));
    assert.equal(report.losses.filter(item => item.fallback === "natural-pluck").length, 2);
  }
  const rich = [{ type: "guitar", stem: "guitar", instrument: "campfire_acoustic", midiNotes: [50, 57, 61, 66], articulation: "palm_mute" }];
  const copy = structuredClone(rich);
  const report = createPocketAudioRendererCapabilityReport(rich);
  assert.equal(report.exact, false);
  assert.equal(report.losses[0].fallback, "natural-pluck");
  assert.deepEqual(rich, copy, "reporting must retain explicit seventh notes and source technique");
  assert.equal(createPocketAudioRendererCapabilityReport([{ ...rich[0], articulation: "open" }]).exact, true);
});

test("compact Campfire accents carry explicit note velocity independently of mixer volume", () => {
  for (const volume of [0, 0.2, 0.9]) {
    const source = { projectVersion: 17, guitarEnabled: true, guitarTone: "campfire_acoustic", guitarVolume: volume, guitarPatternA: ["open", "accent"], sectionBars: { A: 1 }, songSequence: ["A"] };
    const events = buildPocketAudioTimeline(normalisePocketChordsmithProject(source)).events.filter(event => event.type === "guitar");
    assert.deepEqual(events.map(event => event.velocity), [1, 1.28]);
    assert.equal(createPocketAudioRendererCapabilityReport(normalisePocketChordsmithProject(source)).exact, true);
  }
});

test("compact Campfire suspended chords report approximation in raw and normalized data while rich notes stay exact", () => {
  for (const chordType of ["sus2", "sus4"]) {
    const source = { projectVersion: 17, guitarEnabled: true, guitarTone: "campfire_acoustic", chordType, guitarPatternA: ["open"], sectionBars: { A: 1 }, songSequence: ["A"] };
    const project = normalisePocketChordsmithProject(source);
    for (const input of [source, project]) {
      const report = createPocketAudioRendererCapabilityReport(input);
      assert.equal(report.exact, false);
      assert.equal(report.losses.length, 1);
      assert.equal(report.losses[0].feature, `campfire-chord:${chordType}`);
      assert.equal(report.losses[0].action, "approximated");
      assert.equal(report.losses[0].fallback, "triad");
    }
    assert.equal(project.source.original.chordType, chordType);
    const timeline = buildPocketAudioTimeline(project);
    assert.ok(timeline.lossReport.some(item => item.feature === `campfire-chord:${chordType}`));
    const notes = chordType === "sus2" ? [50, 57, 62, 64] : [50, 57, 62, 67];
    const rich = normalisePocketChordsmithProject({ ...source, guitarPatternA: [], sections: { A: { tracks: { guitar: { events: [
      { tick: 0, durationTicks: 480, notes, sound: "campfire_acoustic", articulation: "open", velocity: 100 }
    ] } } } } });
    const richTimeline = buildPocketAudioTimeline(rich);
    assert.equal(richTimeline.capabilityReport.exact, true);
    assert.deepEqual(richTimeline.events.find(event => event.type === "guitar").midiNotes, notes);
  }
});
const pcmHash = (samples) => {
  const bytes = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, index) => bytes.writeFloatLE(sample, index * 4));
  return createHash("sha256").update(bytes).digest("hex");
};
const peak = (samples) => samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);

for (const fixture of reference.records) {
  test(`Campfire dry reference PCM ${fixture.sampleRate} Hz / MIDI ${fixture.midi}`, () => {
    const samples = renderCampfireAcousticNote(fixture);
    assert.equal(samples.length, fixture.frames);
    assert.equal(pcmHash(samples), fixture.sha256);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(peak(samples) > 0.01 && peak(samples) <= 0.225);
    assert.equal(pcmHash(renderCampfireAcousticNote(fixture)), fixture.sha256);
  });
}

for (const fixture of eventReference.records) {
  test(`canonical cross-engine event PCM ${fixture.sampleRate} Hz / ${fixture.event.direction}`, () => {
    const samples = renderCampfireAcousticEvent(fixture.event, { sampleRate: fixture.sampleRate });
    assert.equal(samples.length, fixture.frames);
    assert.equal(pcmHash(samples), fixture.sha256);
  });
}

test("reference retains exact major/minor voicings and 76 BPM strum/picking positions", () => {
  assert.deepEqual(CAMPFIRE_REFERENCE_CHORDS.map(({ notes }) => [...notes]), [[50, 57, 62, 66], [55, 59, 62, 67], [47, 54, 59, 62], [45, 57, 61, 64]]);
  for (const chord of CAMPFIRE_REFERENCE_CHORDS) {
    assert.deepEqual(campfireAcousticVoicing(chord), [...chord.notes]);
    assert.deepEqual(campfireAcousticVoicing({ ...chord, register: "mid" }), chord.notes.map((note) => note + 12));
  }
  const events = campfireAcousticReferenceEvents();
  assert.equal(events.filter((event) => event.midiNotes).length, 8);
  assert.equal(events.filter((event) => event.midi !== undefined).length, 16);
  assert.equal(events[0].time, 0);
  assert.equal(events.find((event) => event.midi !== undefined).time, 60 / 76);
  assert.equal(CAMPFIRE_ACOUSTIC_RECIPE.strumSeconds, 0.027);
  const minor = campfireAcousticVoicing({ rootPc: 11, quality: "min" });
  const major = campfireAcousticVoicing({ rootPc: 11, quality: "maj" });
  assert.ok(minor.includes(62));
  assert.ok(major.includes(63));
  assert.notDeepEqual(minor, major);
});

test("all roots preserve the third and fifth instead of becoming power chords", () => {
  for (let rootPc = 0; rootPc < 12; rootPc += 1) for (const quality of ["maj", "min"]) {
    const pitches = campfireAcousticVoicing({ rootPc, quality }).map((note) => note % 12);
    assert.ok(pitches.includes(rootPc));
    assert.ok(pitches.includes((rootPc + (quality === "min" ? 3 : 4)) % 12));
    assert.ok(pitches.includes((rootPc + 7) % 12));
  }
});

test("ordered down/up strums begin with the correct string and retain every note's tail", () => {
  for (const sampleRate of [44100, 48000]) {
    const notes = [50, 57, 62, 66];
    const down = renderCampfireAcousticEvent({ midiNotes: notes, direction: "down", velocity: 1 }, { sampleRate });
    const up = renderCampfireAcousticEvent({ midiNotes: notes, direction: "up", velocity: 1 }, { sampleRate });
    const beforeSecondString = Math.round(sampleRate * 0.027);
    const first = renderCampfireAcousticNote({ midi: notes[0], sampleRate });
    const last = renderCampfireAcousticNote({ midi: notes.at(-1), sampleRate });
    for (let frame = 0; frame < beforeSecondString; frame += 1) {
      assert.equal(down[frame], Math.fround(first[frame] * 0.36));
      assert.equal(up[frame], Math.fround(last[frame] * 0.36));
    }
    assert.equal(down.length, sampleRate * 1.5 + Math.round(3 * 0.027 * sampleRate));
    assert.notEqual(pcmHash(down), pcmHash(up));
    assert.ok(down.every(Number.isFinite));
    assert.ok(peak(down) < 0.4);
    assert.ok(peak(down.subarray(sampleRate)) > 0);
    assert.deepEqual(notes, [50, 57, 62, 66]);
  }
});

test("zero gain/velocity is silence and single-note picking is the same recipe", () => {
  const event = { midi: 74, velocity: 1 };
  const dry = renderCampfireAcousticNote({ midi: 74 });
  const picked = renderCampfireAcousticEvent(event, { noteGain: 1 });
  assert.deepEqual(picked, dry);
  assert.equal(peak(renderCampfireAcousticEvent({ ...event, velocity: 0 })), 0);
  assert.equal(peak(renderCampfireAcousticEvent(event, { noteGain: 0 })), 0);
});

test("seed/rate/version/tail identity is explicit and optional fade never silently changes reference PCM", () => {
  const referenceOptions = { midi: 50, sampleRate: 48000 };
  const key = campfireAcousticNoteKey(referenceOptions);
  for (const change of [{ sampleRate: 44100 }, { midi: 51 }, { seed: 123 }, { tailPolicy: "fade-5ms" }]) {
    assert.notEqual(campfireAcousticNoteKey({ ...referenceOptions, ...change }), key);
  }
  const dry = renderCampfireAcousticNote(referenceOptions);
  const faded = renderCampfireAcousticNote({ ...referenceOptions, tailPolicy: "fade-5ms" });
  assert.deepEqual(dry.subarray(0, dry.length - 240), faded.subarray(0, faded.length - 240));
  assert.equal(faded.at(-1), 0);
  assert.notEqual(pcmHash(dry), pcmHash(faded));
  assert.notEqual(pcmHash(dry), pcmHash(renderCampfireAcousticNote({ ...referenceOptions, seed: 123 })));
  assert.throws(() => renderCampfireAcousticNote({ ...referenceOptions, recipeVersion: 2 }), RangeError);
});

test("bounded LRU reuse cannot be poisoned by mutation of a returned buffer", () => {
  const bytesPerNote = 48000 * 1.5 * 4;
  const cache = new CampfireAcousticNoteCache({ maxBytes: bytesPerNote * 2, maxEntries: 2 });
  const options = { midi: 50, sampleRate: 48000 };
  const expected = pcmHash(cache.getNote(options));
  const mutable = cache.getNote(options);
  mutable.fill(0);
  assert.equal(pcmHash(cache.getNote(options)), expected);
  cache.getNote({ ...options, midi: 57 });
  cache.getNote(options); // 50 is now newer than 57.
  cache.getNote({ ...options, midi: 62 });
  assert.equal(cache.getDiagnostics().entries, 2);
  assert.ok(cache.getDiagnostics().bytes <= bytesPerNote * 2);
  const misses = cache.getDiagnostics().misses;
  cache.getNote({ ...options, midi: 57 });
  assert.equal(cache.getDiagnostics().misses, misses + 1);
  cache.clear();
  assert.equal(cache.getDiagnostics().entries, 0);
  assert.equal(cache.getDiagnostics().bytes, 0);
  const disabled = new CampfireAcousticNoteCache({ maxBytes: 0 });
  disabled.getNote(options);
  assert.equal(disabled.getDiagnostics().entries, 0);
});

test("unsupported requests fail explicitly instead of retuning or changing recipe", () => {
  for (const options of [{ midi: 35 }, { midi: 97 }, { midi: 50.5 }, { midi: 50, sampleRate: 0 }, { midi: 50, sampleRate: NaN }, { midi: 50, seed: -1 }, { midi: 50, tailPolicy: "hidden-normalize" }]) {
    assert.throws(() => renderCampfireAcousticNote(options), RangeError);
  }
  assert.throws(() => renderCampfireAcousticEvent({ midi: 50, direction: "random" }), RangeError);
  assert.throws(() => renderCampfireAcousticEvent({ midi: 50, technique: { campfire: { strumSeconds: -0.01 } } }), RangeError);
  assert.throws(() => renderCampfireAcousticEvent({ midiNotes: new Array(13).fill(50) }), RangeError);
  assert.throws(() => renderPocketAudioEventBuffer([{ type: "guitar", instrument: "campfire_acoustic", midi: 50, technique: { campfire: { strumSeconds: 1e12 } } }]), RangeError);
  assert.throws(() => campfireAcousticVoicing({ rootPc: 2, quality: "unknown" }), RangeError);
});

test("Core offline events use the pluck PCM with shared stem gain and complete tails", () => {
  const event = { type: "guitar", stem: "guitar", instrument: "campfire_acoustic", midiNotes: [50, 57, 62, 66], velocity: 0.7, time: 0.1, duration: 0.1, pan: -1 };
  const sampleRate = 48000;
  const rendered = renderPocketAudioEventBuffer([event], { sampleRate });
  const dry = renderCampfireAcousticEvent(event, { sampleRate });
  const offset = 4800;
  const gain = chordsmithOfflineStemRenderGain("guitar");
  assert.ok(rendered.channels[0].length >= dry.length + offset);
  assert.ok(rendered.channels[0].subarray(0, offset).every((sample) => sample === 0));
  dry.forEach((sample, frame) => assert.equal(rendered.channels[0][offset + frame], Math.fround(sample * gain)));
  assert.equal(peak(rendered.channels[1]), 0);
  const silent = renderPocketAudioEventBuffer([{ ...event, velocity: 0 }], { sampleRate });
  assert.equal(peak(silent.channels[0]), 0);
});

test("Core exact-loop policy deliberately crops Campfire tails without changing other loop durations", () => {
  const events = [{ type: "guitar", stem: "guitar", instrument: "campfire_acoustic", midi: 50, time: 0, duration: 0.25, velocity: 1 }];
  const rendered = renderPocketAudioEventBuffer(events, { sampleRate: 48000, durationSeconds: 0.5, tailSeconds: 0 });
  assert.equal(rendered.channels[0].length, 24000);
  assert.ok(peak(rendered.channels[0]) > 0);
});

test("schema-17 JSON/PCS1 preserves explicit Campfire intent and reports live/offline support", async () => {
  const source = { schemaVersion: 17, bpm: 76, key: "D", scale: "major", timeSig: 4, resolution: 4, sectionBars: { A: 1 }, songSequence: ["A"], sections: { A: { tracks: { guitar: { events: [
    { tick: 0, durationTicks: 480, notes: [50, 57, 62, 66], sound: "campfire_acoustic", velocity: 100, articulation: "open", direction: "up", technique: { campfire: { seed: 123, strumSeconds: 0.027 }, future: { retain: "yes" } }, futureField: "preserved" }
  ] } } } } };
  const before = JSON.stringify(source);
  for (const input of [JSON.stringify(source), `PCS1:${Buffer.from(JSON.stringify(source)).toString("base64")}`]) {
    const project = normalisePocketChordsmithProject(parsePocketChordsmithInput(input));
    const timeline = buildPocketAudioTimeline(project);
    const event = timeline.events.find((item) => item.instrument === "campfire_acoustic");
    assert.ok(event);
    assert.deepEqual(event.midiNotes, [50, 57, 62, 66]);
    assert.equal(event.direction, "up");
    assert.equal(event.technique.future.retain, "yes");
    assert.equal(project.source.original.sections.A.tracks.guitar.events[0].futureField, "preserved");
    assert.ok(peak(renderPocketAudioEventBuffer([event]).channels[0]) > 0);
    const live = createPocketAudioRendererCapabilityReport(project, { renderer: "live" });
    assert.equal(live.supported, true);
    assert.ok(!live.entries.some((entry) => entry.feature.startsWith("technique:campfire:")));
    const offline = createPocketAudioRendererCapabilityReport(project, { renderer: "offline" });
    assert.ok(!offline.losses.some((loss) => loss.feature === "instrument:campfire_acoustic"));
    const engine = new PocketAudio();
    await engine.loadProject(input);
    await assert.rejects(() => engine.play(), /needs an AudioContext/);
    assert.equal(engine.playing, false);
    engine.dispose();
  }
  assert.equal(JSON.stringify(source), before);
});

function preparationContext() {
  const param = () => ({ setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), pan: param() });
  return {
    sampleRate: 48000, currentTime: 0, destination: {}, buffers: [], sources: [],
    createBuffer(channels, frames, sampleRate) { const buffer = { frames, sampleRate, copyToChannel() {} }; this.buffers.push(buffer); return buffer; },
    createGain: node, createStereoPanner: node,
    createBufferSource() { const source = { ...node(), starts: [], stops: [], start(when) { this.starts.push(when); }, stop(when) { this.stops.push(when); } }; this.sources.push(source); return source; }
  };
}

test("prepared bank deduplicates PCM, schedules only prepared identities, cancels old lookahead and disconnects ended voices", async () => {
  const context = preparationContext();
  const event = { midiNotes: [50, 57, 62, 66], velocity: 1 };
  const bank = await prepareCampfireAcousticNoteBank(context, [event, event]);
  assert.equal(context.buffers.length, 4);
  assert.equal(context.sources.length, 0);
  bank.schedule(event, 0.1);
  bank.schedule(event, 0.3);
  assert.equal(context.buffers.length, 4, "scheduler must not synthesize or allocate PCM");
  assert.deepEqual(context.sources.slice(0, 4).map((source) => source.starts[0]), [0.1, 0.127, 0.154, 0.181]);
  context.currentTime = 0.2;
  bank.cancelScheduledFrom(0.2);
  assert.ok(context.sources.slice(0, 4).every((source) => source.stops.length === 0), "sounding tails survive section changes");
  assert.ok(context.sources.slice(4).every((source) => source.stops[0] === 0.2));
  assert.throws(() => bank.schedule({ midi: 51 }, 0.4), /not prepared/);
  assert.equal(context.sources.length, 8, "missing identity cannot partly dispatch an event");
  bank.stopAll();
  bank.stopAll();
  assert.ok(context.sources.every((source) => source.stops.length === 1));
  context.sources.forEach((source) => source.onended());
  assert.equal(bank.getDiagnostics().activeVoices, 0);
  bank.dispose();
  assert.equal(bank.getDiagnostics().bytes, 0);
  assert.throws(() => bank.schedule(event, 1), /disposed/);
});

test("cold preparation rejects its memory budget before allocating and accepts cancellation between batches", async () => {
  const context = preparationContext();
  const events = [{ midiNotes: [50, 57, 62, 66, 69] }];
  await assert.rejects(() => prepareCampfireAcousticNoteBank(context, events, { maxBytes: 1 }), /byte budget/);
  assert.equal(context.buffers.length, 0);
  const controller = new AbortController();
  await assert.rejects(() => prepareCampfireAcousticNoteBank(context, events, { signal: controller.signal, yieldTask: async () => controller.abort() }), { name: "AbortError" });
  assert.equal(context.buffers.length, 4);
  assert.equal(context.sources.length, 0);
});

test("prepared live edits add only missing PCM without stopping or retriggering sounding notes", async () => {
  const context = preparationContext();
  const bank = await prepareCampfireAcousticNoteBank(context, [{midi:50}]);
  bank.schedule({midi:50}, 0);
  const starts = [...context.sources[0].starts];
  const added = await bank.prepareMissingEvents([{midiNotes:[50,57,62]}]);
  assert.equal(added.added, 2);
  assert.equal(context.buffers.length, 3);
  assert.equal(bank.getDiagnostics().entries, 3);
  assert.equal(context.sources.length, 1, "preparing an edit never starts a voice");
  assert.deepEqual(context.sources[0].starts, starts);
  assert.deepEqual(context.sources[0].stops, [], "existing natural tails are retained");
  assert.equal((await bank.prepareMissingEvents([{midiNotes:[62,57,50], direction:"up", velocity:0.2}])).added, 0);
  assert.equal(context.buffers.length, 3);
  bank.dispose();
});

test("prepared edit budget and cancellation cannot partially promote stale PCM", async () => {
  const context = preparationContext();
  const noteBytes = 48000 * 1.5 * 4;
  const bank = await prepareCampfireAcousticNoteBank(context, [{midi:50}], {maxBytes:noteBytes * 5});
  await assert.rejects(bank.prepareMissingEvents([{midiNotes:[51,52,53,54,55]}]), /budget/);
  assert.equal(context.buffers.length, 1, "budget failure precedes PCM allocation");
  const controller = new AbortController();
  await assert.rejects(bank.prepareMissingEvents([{midiNotes:[51,52,53,54]}], {signal:controller.signal, yieldTask:async () => controller.abort()}), {name:"AbortError"});
  assert.equal(bank.getDiagnostics().entries, 1);
  assert.equal(bank.getDiagnostics().bytes, noteBytes);
  assert.throws(() => bank.schedule({midi:51}, 0), /not prepared/);
  assert.equal((await bank.prepareMissingEvents([{midi:57}])).added, 1);
  assert.equal(bank.getDiagnostics().entries, 2);
  bank.dispose();
});

test("a newer prepared edit supersedes a yielded update and dispose rejects later promotion", async () => {
  const context = preparationContext();
  const bank = await prepareCampfireAcousticNoteBank(context, [{midi:50}]);
  let release, didYield;
  const yielded = new Promise(resolve => { didYield = resolve; });
  const first = bank.prepareMissingEvents([{midiNotes:[51,52,53,54]}], {yieldTask:async () => { didYield(); await new Promise(resolve => { release = resolve; }); }});
  const cancelled = assert.rejects(first, {name:"AbortError"});
  await yielded;
  const latest = bank.prepareMissingEvents([{midi:57}]);
  release();
  await cancelled;
  assert.equal((await latest).added, 1);
  assert.equal(bank.getDiagnostics().entries, 2);
  assert.throws(() => bank.schedule({midi:51}, 0), /not prepared/);
  await assert.rejects(bank.prepareMissingEvents([{midiNotes:[60,61,62,63]}], {yieldTask:async () => bank.dispose()}), {name:"AbortError"});
  assert.equal(bank.getDiagnostics().bytes, 0);
  assert.equal(bank.getDiagnostics().entries, 0);
});

const liveCampfireSource = {
  schemaVersion: 17, bpm: 76, sectionBars: { A: 1, B: 1 }, songSequence: ["A"],
  sections: Object.fromEntries(["A", "B"].map((sectionId, i) => [sectionId, { tracks: { guitar: { events: [
    { tick: 0, durationTicks: 120, notes: [50 + i, 57 + i, 62 + i, 66 + i], sound: "campfire_acoustic", velocity: 100 }
  ] } } }]))
};

test("Campfire offline mix and aligned stems honor zero/non-default guitar volume and mute", () => {
  for (const volume of [0, 0.2, 0.9]) {
    const project = normalisePocketChordsmithProject({ ...liveCampfireSource, guitarVolume: volume, chordsOn: false, bassOn: false });
    const event = buildPocketAudioTimeline(project).events.find((item) => item.instrument === "campfire_acoustic");
    const rendered = renderPocketAudioBuffer(project, { sampleRate: 8000 });
    const stem = renderPocketAudioStemBuffers(project, { sampleRate: 8000, stems: ["guitar"] }).guitar;
    const pcm = renderCampfireAcousticEvent(event, { sampleRate: 8000 });
    const gain = chordsmithOfflineStemRenderGain("guitar", volume) * Math.SQRT1_2;
    for (let channel = 0; channel < 2; channel += 1) {
      assert.deepEqual(rendered.channels[channel], stem.channels[channel]);
      for (let frame = 0; frame < rendered.channels[channel].length; frame += 1) {
        assert.ok(Math.abs(rendered.channels[channel][frame] - (pcm[frame] || 0) * gain) < 1e-8, `wrong mixer gain at volume ${volume}, frame ${frame}`);
      }
    }
    project.mixer.stems.guitar.mute = true;
    assert.equal(peak(renderPocketAudioBuffer(project, { sampleRate: 8000 }).channels[0]), 0);
    assert.equal(peak(renderPocketAudioStemBuffers(project, { sampleRate: 8000, stems: ["guitar"] }).guitar.channels[0]), 0);
  }
});

test("Campfire decoded STEM_SYNC and HYBRID WAVs retain the source guitar mixer gain", async () => {
  for (const volume of [0, 0.2, 0.9]) {
    const source = { ...liveCampfireSource, guitarVolume: volume, chordsOn: false, bassOn: false };
    const project = normalisePocketChordsmithProject(source);
    const expected = renderPocketAudioBuffer(project, { sampleRate: 8000, tailSeconds: 0 });
    for (const profile of ["STEM_SYNC", "HYBRID"]) {
      const kit = await createGodotExportKit(source, { sampleRate: 8000, profile });
      const mix = decodePcmWavBytes(new Uint8Array(await kit.files.get(kit.manifest.assets.mix).arrayBuffer()));
      const guitar = decodePcmWavBytes(new Uint8Array(await kit.files.get(kit.manifest.assets.guitar).arrayBuffer()));
      assert.equal(mix.channels[0].length, expected.channels[0].length);
      assert.deepEqual(mix.channels, guitar.channels);
      for (let channel = 0; channel < 2; channel += 1) for (let frame = 0; frame < mix.channels[channel].length; frame += 1) {
        assert.ok(Math.abs(mix.channels[channel][frame] - expected.channels[channel][frame]) <= 1 / 32767, `${profile} changed gain at volume ${volume}, frame ${frame}`);
      }
      assert.equal(peak(mix.channels[0]) === 0, volume === 0);
    }
  }
});

test("live Play prepares unsequenced adaptive sections, then Stop and project load cancel scheduled voices", async () => {
  const context = preparationContext();
  const engine = new PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
  await engine.loadProject(liveCampfireSource);
  for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
  await engine.play();
  assert.equal(engine.playing, true);
  assert.equal(engine.getDiagnostics().campfirePrepared.entries, 8);
  assert.equal(context.sources.length, 4);
  engine.queueSection("B", { quantize: "instant" });
  engine.schedulerTick();
  assert.equal(context.sources.length, 8);
  engine.stop();
  assert.ok(context.sources.every((source) => source.stops.length === 1));
  await engine.loadProject({ bpm: 96 });
  assert.equal(engine.getDiagnostics().campfirePrepared, null);
  engine.dispose();
});

test("live Campfire mixer changes reuse prepared voices and reject invalid gain automation", async () => {
  const context = preparationContext();
  const engine = new PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
  await engine.loadProject(liveCampfireSource);
  for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
  await engine.play();
  const buffers = context.buffers.length;
  const starts = context.sources.map((source) => [...source.starts]);
  context.currentTime = 0.01;
  engine.setStemVolume("guitar", 0.2);
  assert.equal(engine.getDiagnostics().campfirePrepared.outputGain, chordsmithOfflineStemRenderGain("guitar", 0.2));
  engine.setStemMute("guitar", true);
  assert.equal(engine.getDiagnostics().campfirePrepared.outputGain, 0);
  engine.setStemMute("guitar", false);
  assert.equal(engine.getDiagnostics().campfirePrepared.outputGain, chordsmithOfflineStemRenderGain("guitar", 0.2));
  assert.equal(context.buffers.length, buffers, "mixer changes must not rebuild PCM");
  assert.deepEqual(context.sources.map((source) => source.starts), starts, "mixer changes must not retrigger or shift existing notes");
  assert.ok(context.sources.every((source) => source.stops.length === 0));
  const bank = engine.campfireNoteBank;
  const gain = bank.getDiagnostics().outputGain;
  for (const invalid of [NaN, Infinity, -1]) assert.throws(() => bank.setOutputGain(invalid), RangeError);
  assert.throws(() => bank.setOutputGain(0.2, 0.5), RangeError);
  assert.equal(bank.getDiagnostics().outputGain, gain);
  engine.dispose();
  assert.throws(() => bank.setOutputGain(0.2), /disposed/);
});

test("compact Campfire muted Play prepares and clocks voices so unmute cannot retrigger or lose their tails", async () => {
  const context = preparationContext();
  const engine = new PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
  await engine.loadProject({ projectVersion: 17, guitarEnabled: true, guitarTone: "campfire_acoustic", guitarPatternA: ["open"], sectionBars: { A: 1 }, songSequence: ["A"] });
  for (const stem of ["drums", "bass", "chords", "melody", "guitar"]) engine.setStemMute(stem, true);
  await engine.play();
  assert.equal(context.sources.length, 4, "muted notes retain their original clock position");
  assert.equal(engine.getDiagnostics().campfirePrepared.outputGain, 0);
  const buffers = context.buffers.length;
  const starts = context.sources.map(source => [...source.starts]);
  context.currentTime = 0.25;
  engine.setStemMute("guitar", false);
  assert.equal(context.buffers.length, buffers);
  assert.deepEqual(context.sources.map(source => source.starts), starts);
  assert.equal(engine.getDiagnostics().campfirePrepared.outputGain, chordsmithOfflineStemRenderGain("guitar", 0.66));
  engine.dispose();
});

test("natural completion preserves the final tail and explicit Stop still cancels it", async () => {
  const context = preparationContext();
  const engine = new PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
  await engine.loadProject(liveCampfireSource);
  for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
  await engine.play();
  context.currentTime = engine.timeline.duration + 0.01;
  engine.schedulerTick();
  assert.equal(engine.playing, false);
  assert.ok(context.sources.every((source) => source.stops.length === 0));
  engine.stop();
  assert.ok(context.sources.every((source) => source.stops.length === 1));
  engine.dispose();
});

test("Stop during cold Play cannot later start transport or promote a stale bank", async () => {
  const context = preparationContext();
  const engine = new PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
  await engine.loadProject(liveCampfireSource);
  const playing = engine.play();
  assert.equal(engine.getDiagnostics().campfirePreparationPending, true);
  engine.stop();
  await playing;
  assert.equal(engine.playing, false);
  assert.equal(engine.getDiagnostics().campfirePrepared, null);
  assert.equal(context.sources.length, 0);
  engine.dispose();
});

test("a newer Play supersedes cold preparation and a project load cannot promote the old bank", async () => {
  const context = preparationContext();
  const engine = new PocketAudio({ audioContext: context, setInterval: () => 1, clearInterval() {} });
  await engine.loadProject(liveCampfireSource);
  for (const stem of ["drums", "bass", "chords", "melody"]) engine.setStemMute(stem, true);
  const first = engine.play();
  const second = engine.play({ sectionId: "B", scope: "section" });
  await Promise.all([first, second]);
  assert.equal(engine.playing, true);
  assert.equal(engine.transport.sectionId, "B");
  assert.equal(context.sources.length, 4);
  engine.stop();
  const third = engine.play();
  await engine.loadProject({ bpm: 96 });
  await third;
  assert.equal(engine.playing, false);
  assert.equal(engine.getDiagnostics().campfirePrepared, null);
  engine.dispose();
});
