import assert from "node:assert/strict";
import test from "node:test";

import {
  FUNK_BASS_PATTERN_GRAMMAR,
  FUNK_DRUM_PATTERN_GRAMMAR,
  FUNK_LEAD_PATTERN_GRAMMAR,
  FUNK_STAB_PATTERN_GRAMMAR,
  POCKET_AUDIO_PROFILE_IDS,
  createPocketAudioRendererCapabilityReport,
  normalisePocketAudioProfileId,
  renderPocketAudioEventBuffer,
  validatePocketAudioProfileRegistry,
} from "../src/index.js";

test("sound-profile registry exposes the six canonical identities and aliases", () => {
  assert.deepEqual(POCKET_AUDIO_PROFILE_IDS, [
    "standard",
    "lofi_chill",
    "chip_arcade",
    "western_frontier",
    "heavy_metal",
    "funk_groove",
  ]);
  assert.equal(normalisePocketAudioProfileId("chip_tune"), "chip_arcade");
  assert.equal(normalisePocketAudioProfileId("western"), "western_frontier");
  assert.deepEqual(validatePocketAudioProfileRegistry(), {
    missingProfiles: [],
    unexpectedProfiles: [],
    invalidRecipeVersions: [],
  });
});

test("Funk content library carries the complete first-slice groove vocabulary", () => {
  assert.ok(Object.keys(FUNK_BASS_PATTERN_GRAMMAR).length >= 8);
  assert.ok(Object.keys(FUNK_DRUM_PATTERN_GRAMMAR).length >= 8);
  assert.equal(Object.keys(FUNK_STAB_PATTERN_GRAMMAR).length, 4);
  assert.equal(Object.keys(FUNK_LEAD_PATTERN_GRAMMAR).length, 3);
  for (const articulation of ["slap", "pop", "mute", "hammer", "pull", "slide"]) {
    assert.ok(Object.values(FUNK_BASS_PATTERN_GRAMMAR).flat().some((event) => event.articulation === articulation));
  }
});

test("every exposed Metal texture parameter measurably changes offline audio", () => {
  const baseline = {
    drive: 0.48,
    palmMute: 0.78,
    lowTightness: 0.86,
    presence: 0.58,
    roomSize: 0.12,
    pickAttack: 0.72,
  };
  const baselineSignature = signature(renderMetal(baseline));

  for (const parameter of Object.keys(baseline)) {
    const changed = { ...baseline, [parameter]: baseline[parameter] > 0.5 ? 0.08 : 0.94 };
    assert.notDeepEqual(signature(renderMetal(changed)), baselineSignature, `${parameter} should alter rendered audio`);
  }

  const rendered = renderMetal(baseline);
  assert.ok(rendered.channels[0].some((sample, index) => sample !== rendered.channels[1][index]), "dual Metal takes should create stereo difference");
  assertSafe(rendered);
});

test("Funk bass articulations create distinct safe transients and bodies", () => {
  const signatures = new Map();
  for (const articulation of ["finger", "slap", "pop", "mute", "hammer", "pull"]) {
    const rendered = renderPocketAudioEventBuffer([
      {
        stem: "bass",
        type: "bass",
        time: 0,
        duration: 0.32,
        velocity: 0.82,
        midi: 40,
        bassTone: "funk_slap_pop",
        audioProfile: "funk_groove",
        articulation,
        soundProfile: {
          id: "funk_groove",
          preset: "funk_classic_pocket",
          recipeVersion: 1,
          parameters: { slapAmount: 0.78, popBrightness: 0.7, muteDepth: 0.82 },
        },
      },
    ], { sampleRate: 8000, tailSeconds: 0 });
    signatures.set(articulation, signature(rendered));
    assertSafe(rendered);
  }
  assert.equal(new Set([...signatures.values()].map(JSON.stringify)).size, signatures.size);
});

test("every Funk profile parameter measurably changes offline audio", () => {
  const baseline = {
    pocket: 0.72,
    ghostNotes: 0.42,
    slapAmount: 0.68,
    popBrightness: 0.62,
    muteDepth: 0.74,
    stabTightness: 0.76,
  };
  const baselineSignature = signature(renderFunk(baseline));

  for (const parameter of Object.keys(baseline)) {
    const changed = { ...baseline, [parameter]: baseline[parameter] > 0.5 ? 0.08 : 0.94 };
    assert.notDeepEqual(signature(renderFunk(changed)), baselineSignature, `${parameter} should alter rendered audio`);
  }
  assertSafe(renderFunk(baseline));
});

test("Chip channel and duty commands are audible instead of metadata-only", () => {
  const pulse25 = renderChip({ channel: "pulse1", duty: 0.25 });
  const pulse75 = renderChip({ channel: "pulse1", duty: 0.75 });
  const triangle = renderChip({ channel: "triangle", duty: 0.5 });
  assert.notDeepEqual(signature(pulse25), signature(pulse75));
  assert.notDeepEqual(signature(pulse25), signature(triangle));
  assertSafe(pulse25);
  assertSafe(pulse75);
  assertSafe(triangle);
});

test("renderer capability reports approximations while preserving unknown technique intent", () => {
  const report = createPocketAudioRendererCapabilityReport({
    projectVersion: 17,
    formatFeatures: ["sound-profile-v1", "vendor-future-v1"],
    soundProfile: { id: "funk_groove" },
    sections: {
      A: {
        tracks: {
          drums: { events: [{ step: 0, sound: "ride", articulation: "roll" }] },
          bass: { events: [{ step: 0, note: 40, articulation: "slap", technique: { funk: { futureGesture: 0.5 } } }] },
        },
      },
    },
  });

  assert.equal(report.supported, true);
  assert.equal(report.exact, false);
  assert.ok(report.entries.some((entry) => entry.feature === "vendor-future-v1" && entry.action === "preserved"));
  assert.ok(report.entries.some((entry) => entry.feature === "articulation:roll" && entry.action === "approximated"));
  assert.ok(report.entries.some((entry) => entry.feature === "drum-lane:ride" && entry.action === "fallback"));
  assert.ok(report.entries.some((entry) => entry.feature === "technique:funk:futureGesture" && entry.action === "preserved"));
});

function renderMetal(metalTexture) {
  return renderPocketAudioEventBuffer([
    {
      stem: "guitar",
      type: "guitar",
      time: 0,
      duration: 0.42,
      velocity: 0.82,
      midiNotes: [40, 47, 52],
      instrument: "tight_metal",
      audioProfile: "heavy_metal",
      articulation: "chug",
      step: 0,
      metalTexture,
      technique: { metal: { dualTakeSeed: 17 } },
    },
  ], { sampleRate: 8000, tailSeconds: 0 });
}

function renderChip(technique) {
  return renderPocketAudioEventBuffer([
    {
      stem: "melody",
      type: "melody",
      time: 0,
      duration: 0.28,
      velocity: 0.76,
      midi: 72,
      instrument: "chip_pulse_lead",
      audioProfile: "chip_arcade",
      soundProfile: { parameters: { bitDepth: 0.22, sampleRateCrush: 0.18, saturation: 0.2 } },
      technique: { chip: technique },
    },
  ], { sampleRate: 8000, tailSeconds: 0 });
}

function renderFunk(parameters) {
  const soundProfile = { id: "funk_groove", preset: "funk_classic_pocket", recipeVersion: 1, parameters };
  return renderPocketAudioEventBuffer([
    { stem: "bass", type: "bass", time: 0.05, step: 1, duration: 0.25, velocity: 0.78, midi: 40, bassTone: "funk_slap_pop", audioProfile: "funk_groove", articulation: "slap", soundProfile },
    { stem: "bass", type: "bass", time: 0.38, step: 2, duration: 0.25, velocity: 0.78, midi: 45, bassTone: "funk_slap_pop", audioProfile: "funk_groove", articulation: "pop", soundProfile },
    { stem: "bass", type: "bass", time: 0.71, step: 4, duration: 0.25, velocity: 0.78, midi: 43, bassTone: "funk_muted_thump", audioProfile: "funk_groove", articulation: "mute", soundProfile },
    { stem: "drums", type: "snare", time: 1.04, step: 7, duration: 0.12, velocity: 0.5, audioProfile: "funk_groove", accent: false, soundProfile },
    { stem: "chords", type: "chord", time: 1.34, step: 8, duration: 0.58, velocity: 0.64, midiNotes: [52, 59, 64], instrument: "funk_clav_stab", audioProfile: "funk_groove", soundProfile },
  ], { sampleRate: 8000, tailSeconds: 0 });
}

function signature(rendered) {
  const left = rendered.channels[0];
  const right = rendered.channels[1];
  let absolute = 0;
  let square = 0;
  let stereo = 0;
  let weightedMoment = 0;
  let zeroCrossings = 0;
  let previous = left[0] || 0;
  for (let index = 0; index < left.length; index += 1) {
    const sample = left[index];
    absolute += Math.abs(sample);
    square += sample * sample;
    stereo += Math.abs(sample - right[index]);
    weightedMoment += Math.abs(sample) * index;
    if ((sample >= 0) !== (previous >= 0)) zeroCrossings += 1;
    previous = sample;
  }
  return [absolute, square, stereo, zeroCrossings, weightedMoment].map((value) => Number(value.toFixed(7)));
}

function assertSafe(rendered) {
  for (const channel of rendered.channels) {
    for (const sample of channel) {
      assert.equal(Number.isFinite(sample), true);
      assert.ok(Math.abs(sample) <= 1);
    }
  }
}
