import test from "node:test";
import assert from "node:assert/strict";
import { createGodotExportKit, createGodotManifest, GODOT_EXPORT_PROFILES } from "../src/index.js";

const godotFixture = {
  projectVersion: 16,
  title: "Godot Kit Test",
  key: "A",
  scale: "minor",
  bpm: 120,
  timeSig: 4,
  resolution: 4,
  songSequence: ["A", "B"],
  sectionBars: { A: 1, B: 1 },
  progressionA: [0, 3, 4, 0],
  progressionB: [5, 3, 0, 4],
  gridA: {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
  },
  gridB: {
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    bass: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
  },
  melodyTracksA: [[0, null, 2, null, 3, null, 2, null, 0, null, 2, null, 5, null, 3, null]],
  melodyTracksB: [[5, null, 7, null, 8, null, 7, null, 5, null, 3, null, 2, null, 0, null]]
};

test("Godot manifest includes section durations and loop points", () => {
  const manifest = createGodotManifest(godotFixture, { profile: GODOT_EXPORT_PROFILES.LOOP_KIT, sampleRate: 48000 });
  assert.equal(manifest.app, "PocketAudioCoreGodotKit");
  assert.equal(manifest.profile, "LOOP_KIT");
  assert.equal(manifest.sourceProjectSchema, 16);
  assert.equal(manifest.sections.A.duration, 2);
  assert.equal(manifest.sections.A.loopStart, 0);
  assert.equal(manifest.sections.A.loopEnd, manifest.sections.A.duration);
  assert.ok(manifest.events.some((event) => event.type === "section_start" && event.sectionId === "A"));
});

test("LOOP_KIT renders section mixes and aligned stems", async () => {
  const { manifest, files } = await createGodotExportKit(godotFixture, { profile: "LOOP_KIT", sampleRate: 8000 });
  const expected = ["mix", "drums", "bass", "chords", "melody", "guitar"].map((key) => manifest.sections.A.assets[key]);
  expected.forEach((name) => {
    assert.ok(files.has(name), `${name} should exist`);
    assert.ok(files.get(name).size > 44, `${name} should be a rendered WAV`);
  });
  const sizes = expected.map((name) => files.get(name).size);
  assert.equal(new Set(sizes).size, 1, "section mix and stems should align to the same duration");
});

test("STEM_SYNC renders sequence-level stems and full mix", async () => {
  const { manifest, files } = await createGodotExportKit(godotFixture, { profile: "STEM_SYNC", sampleRate: 8000 });
  assert.equal(manifest.assets.mix, "full_mix.wav");
  assert.ok(files.has("full_mix.wav"));
  ["drums.wav", "bass.wav", "chords.wav", "melody.wav", "guitar.wav"].forEach((name) => assert.ok(files.has(name), `${name} should exist`));
});

test("HYBRID renders beds and stinger/sample placeholders", async () => {
  const { manifest, files } = await createGodotExportKit(godotFixture, { profile: "HYBRID", sampleRate: 8000 });
  assert.ok(files.has("bed_drums.wav"));
  assert.ok(files.has("kick.wav"));
  assert.ok(files.has("victory_stinger.wav"));
  assert.equal(manifest.assets.victory_stinger, "victory_stinger.wav");
});

test("PROCEDURAL_PREVIEW marks manifest as preview only", async () => {
  const { manifest, files } = await createGodotExportKit(godotFixture, { profile: "PROCEDURAL_PREVIEW" });
  assert.equal(manifest.previewOnly, true);
  assert.equal(files.size, 0);
  assert.ok(manifest.notes.some((note) => note.includes("not a parity export")));
});
