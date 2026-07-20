import test from "node:test";
import assert from "node:assert/strict";
import { chordsmithFxParameters, createGodotExportKit, createGodotManifest, GODOT_EXPORT_PROFILES } from "../src/index.js";

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
  melodyTracksB: [[5, null, 7, null, 8, null, 7, null, 5, null, 3, null, 2, null, 0, null]],
  fxDelay: 0.31,
  fxChorus: 0.22,
  fxFlanger: 0.11,
  fxReverb: 0.27,
  fxMix: 0.58,
  sidechainOn: true,
  sidechainAmount: 0.49
};

const lofiGodotFixture = {
  ...godotFixture,
  title: "Lofi Godot Kit Test",
  audioProfile: "lofi_chill",
  lofiPreset: "lofi_koi_pond",
  lofiTexture: { enabled: true, vinylCrackle: 0.035, tapeHiss: 0.045, wowFlutter: 0.02, warmth: 0.18, lowPassAge: 0.16, bitCrush: 0 },
  drumKit: "lofi_tape_soft",
  drumGroovePreset: "lofi_sparse_clicks",
  bassTone: "rounded_triangle_bass",
  chordInstrument: "lofi_warm_pad",
  melodyInstrumentsA: ["tape_bell"],
  melodyInstrumentsB: ["tape_bell"]
};

const chipGodotFixture = {
  ...godotFixture,
  title: "Chip Godot Kit Test",
  audioProfile: "chip_tune",
  chipPreset: "chip_neon_boss",
  chipTexture: { enabled: true, bitDepth: 0.32, sampleRateCrush: 0.22, pulseWidth: 0.36, pitchDrift: 0.02, saturation: 0.4, stereoSpread: 0.18 },
  drumKit: "modern_chip_punch",
  drumGroovePreset: "chip_boss_half_time",
  bassTone: "bitcrush_bass",
  chordInstrument: "modern_chip_poly",
  melodyInstrumentsA: ["chip_pulse_lead"],
  melodyInstrumentsB: ["chip_pulse_lead"]
};

test("Godot manifest includes section durations and loop points", () => {
  const manifest = createGodotManifest(godotFixture, { profile: GODOT_EXPORT_PROFILES.LOOP_KIT, sampleRate: 48000 });
  assert.equal(manifest.app, "PocketAudioCoreGodotKit");
  assert.equal(manifest.profile, "LOOP_KIT");
  assert.equal(manifest.sourceProjectSchema, 16);
  assert.equal(manifest.sections.A.duration, 2);
  assert.equal(manifest.sections.A.loopStart, 0);
  assert.equal(manifest.sections.A.loopEnd, manifest.sections.A.duration);
  const expectedFx = chordsmithFxParameters({ delay: 0.31, chorus: 0.22, flanger: 0.11, reverb: 0.27, mix: 0.58 });
  assert.deepEqual(manifest.fx.source, expectedFx.source);
  assert.equal(manifest.fx.delay.time, expectedFx.delay.time);
  assert.equal(manifest.fx.tone.frequency, 1800);
  assert.equal(manifest.fx.reverb.impulseDecay, 2.4);
  assert.deepEqual(manifest.fx.sidechain, { enabled: true, amount: 0.49 });
  assert.ok(manifest.events.some((event) => event.type === "section_start" && event.sectionId === "A"));
  const firstKick = manifest.events.find((event) => event.stem === "drums" && event.type === "kick" && event.sectionId === "A");
  assert.equal(firstKick.step, 0);
  assert.equal(firstKick.arrangementIndex, 0);
  assert.equal(firstKick.durationTicks, 84);
});

test("Godot manifest preserves lofi sound identity for procedural previews and game-pack exports", () => {
  const manifest = createGodotManifest(lofiGodotFixture, { profile: GODOT_EXPORT_PROFILES.LOOP_KIT, sampleRate: 48000 });
  assert.equal(manifest.audioProfile, "lofi_chill");
  assert.equal(manifest.lofi.presetId, "lofi_koi_pond");
  assert.equal(manifest.lofi.drumKit, "lofi_tape_soft");
  assert.equal(manifest.lofi.bassTone, "rounded_triangle_bass");
  assert.equal(manifest.lofi.texture.tapeHiss, 0.045);
  assert.ok(manifest.soundRegistry.lofi.drumKits.lofi_tape_soft);
  assert.ok(manifest.soundRegistry.lofi.bassTones.rounded_triangle_bass);
  assert.ok(manifest.soundRegistry.lofi.chordInstruments.lofi_warm_pad);
  assert.ok(manifest.soundRegistry.lofi.leadInstruments.tape_bell);

  assert.ok(manifest.events.some((event) => event.stem === "drums" && event.drumKit === "lofi_tape_soft" && event.lofiPreset === "lofi_koi_pond"));
  assert.ok(manifest.events.some((event) => event.stem === "bass" && event.bassTone === "rounded_triangle_bass" && event.audioProfile === "lofi_chill"));
  assert.ok(manifest.events.some((event) => event.stem === "chords" && event.instrument === "lofi_warm_pad" && event.lofiTexture?.enabled));
  assert.ok(manifest.events.some((event) => event.stem === "melody" && event.instrument === "tape_bell"));
});

test("Godot manifest preserves chip sound identity for procedural previews and game-pack exports", () => {
  const manifest = createGodotManifest(chipGodotFixture, { profile: GODOT_EXPORT_PROFILES.LOOP_KIT, sampleRate: 48000 });
  assert.equal(manifest.audioProfile, "chip_arcade");
  assert.equal(manifest.chip.presetId, "chip_neon_boss");
  assert.equal(manifest.chip.drumKit, "modern_chip_punch");
  assert.equal(manifest.chip.drumGroovePreset, "chip_boss_half_time");
  assert.equal(manifest.chip.bassTone, "bitcrush_bass");
  assert.equal(manifest.chip.texture.sampleRateCrush, 0.22);
  assert.ok(manifest.soundRegistry.chip.drumKits.modern_chip_punch);
  assert.ok(manifest.soundRegistry.chip.bassTones.bitcrush_bass);
  assert.ok(manifest.soundRegistry.chip.chordInstruments.modern_chip_poly);
  assert.ok(manifest.soundRegistry.chip.leadInstruments.chip_pulse_lead);

  assert.ok(manifest.events.some((event) => event.stem === "drums" && event.drumKit === "modern_chip_punch" && event.chipPreset === "chip_neon_boss"));
  assert.ok(manifest.events.some((event) => event.stem === "bass" && event.bassTone === "bitcrush_bass" && event.audioProfile === "chip_arcade"));
  assert.ok(manifest.events.some((event) => event.stem === "chords" && event.instrument === "modern_chip_poly" && event.chipTexture?.enabled));
  assert.ok(manifest.events.some((event) => event.stem === "melody" && event.instrument === "chip_pulse_lead"));
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
  assert.equal(manifest.assets.mix, "audio/full/full_mix.wav");
  assert.ok(files.has("audio/full/full_mix.wav"));
  ["drums.wav", "bass.wav", "chords.wav", "melody.wav", "guitar.wav"].forEach((name) => assert.ok(files.has(`audio/stems/${name}`), `${name} should exist`));
});

test("HYBRID renders beds and stinger/sample placeholders", async () => {
  const { manifest, files } = await createGodotExportKit(godotFixture, { profile: "HYBRID", sampleRate: 8000 });
  assert.ok(files.has("audio/stems/bed_drums.wav"));
  assert.ok(files.has("audio/samples/kick.wav"));
  assert.ok(files.has("audio/samples/victory_stinger.wav"));
  assert.equal(manifest.assets.victory_stinger, "audio/samples/victory_stinger.wav");
});

test("PROCEDURAL_PREVIEW marks manifest as preview only", async () => {
  const { manifest, files } = await createGodotExportKit(godotFixture, { profile: "PROCEDURAL_PREVIEW" });
  assert.equal(manifest.previewOnly, true);
  assert.equal(files.size, 0);
  assert.ok(manifest.notes.some((note) => note.includes("not a parity export")));
});
