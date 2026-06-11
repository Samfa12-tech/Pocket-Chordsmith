import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyseRenderedBuffer, buildPocketAudioTimeline, normalisePocketChordsmithProject, renderPocketAudioBuffer } from "../src/index.js";

const fixturesDir = new URL("./fixtures/", import.meta.url);
const goldenDir = new URL("./golden/", import.meta.url);

const fixtureIndex = JSON.parse(await readFile(new URL("index.json", fixturesDir), "utf8"));

for (const fixture of fixtureIndex) {
  test(`golden event trace: ${fixture.name}`, async () => {
    const raw = JSON.parse(await readFile(new URL(fixture.raw, fixturesDir), "utf8"));
    const expected = JSON.parse(await readFile(new URL(`${fixture.name}.events.json`, goldenDir), "utf8"));
    const project = normalisePocketChordsmithProject(raw);
    assert.deepEqual(simplifyEvents(buildPocketAudioTimeline(project).events), expected);
  });
}

for (const fixture of fixtureIndex) {
  test(`audio metrics: ${fixture.name}`, async () => {
    const raw = JSON.parse(await readFile(new URL(fixture.raw, fixturesDir), "utf8"));
    const expected = JSON.parse(await readFile(new URL(`${fixture.name}.audio-metrics.json`, goldenDir), "utf8"));
    const project = normalisePocketChordsmithProject(raw);
    const metrics = analyseRenderedBuffer(renderPocketAudioBuffer(project, { sampleRate: expected.sampleRate }));
    assert.equal(metrics.durationSeconds, expected.durationSeconds);
    assert.equal(metrics.sampleRate, expected.sampleRate);
    assert.equal(metrics.channelCount, expected.channelCount);
    assert.equal(metrics.eventCount, expected.eventCount);
    assert.equal(metrics.quantizedSampleHash, expected.quantizedSampleHash);
  });
}

test("fixture index covers required parity scenarios", () => {
  const names = new Set(fixtureIndex.map((fixture) => fixture.name));
  [
    "basic-4-4-major",
    "three-four",
    "swing-groove",
    "drum-tuplets",
    "melody-holds",
    "melody-slides",
    "manual-bass",
    "guitar-patterns",
    "multi-melody",
    "section-sequence",
    "build-drop-fx",
    "legacy-minimal"
  ].forEach((name) => assert.ok(names.has(name), `${name} missing`));
});

function simplifyEvents(events) {
  return events.map((event) => {
    const out = {
      sectionId: event.sectionId,
      arrangementIndex: event.arrangementIndex,
      bar: event.bar,
      beat: event.beat,
      step: event.step,
      time: round(event.time),
      duration: round(event.duration),
      tick: event.tick,
      stem: event.stem,
      type: event.type,
      velocity: round(event.velocity),
      accent: Boolean(event.accent),
      tuplet: Boolean(event.tuplet)
    };
    ["midi", "midiNotes", "instrument", "articulation", "pan", "slideMidi", "slideOffset", "direction"].forEach((key) => {
      if (event[key] !== undefined) out[key] = Array.isArray(event[key]) ? event[key].slice() : event[key];
    });
    return out;
  });
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}
