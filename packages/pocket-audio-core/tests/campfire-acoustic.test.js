import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CAMPFIRE_ACOUSTIC_RECIPE, CAMPFIRE_REFERENCE_CHORDS, CampfireAcousticNoteCache,
  campfireAcousticNoteKey, campfireAcousticReferenceEvents, campfireAcousticVoicing,
  renderCampfireAcousticEvent, renderCampfireAcousticNote
} from "../src/sounds/campfire-acoustic.js";

const reference = JSON.parse(readFileSync(new URL("./fixtures/campfire-reference-hashes.json", import.meta.url)));
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
  assert.throws(() => campfireAcousticVoicing({ rootPc: 2, quality: "unknown" }), RangeError);
});
