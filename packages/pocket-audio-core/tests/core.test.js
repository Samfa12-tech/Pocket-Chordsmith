import test from "node:test";
import assert from "node:assert/strict";
import {
  PocketAudio,
  DEFAULT_FX,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_STEM_MIX,
  LOFI_STYLE_PRESETS,
  CHORDSMITH_CHORD_PLAY_MODES,
  CHORDSMITH_CHORD_RHYTHM,
  CHORDSMITH_CHORD_RHYTHM_MODES,
  CHORDSMITH_DRUM_FEEL,
  CHORDSMITH_PHRASE_GATES,
  CHORDSMITH_LIVE_DRUM_VOICES,
  CHORDSMITH_SEQUENCED_DRUM_LANE_IDS,
  POCKET_DRUM_LANES,
  POCKET_DRUM_KIT_CONFIGS,
  POCKET_BASS_TONE_CONFIGS,
  DEFAULT_CLASSIC_DRUM_KIT,
  DEFAULT_CLASSIC_BASS_TONE,
  DEFAULT_LOFI_DRUM_KIT,
  POCKET_BUILT_IN_FX,
  POCKET_BUILT_IN_FX_TYPES,
  POCKET_GUITAR_TONE_CONFIGS,
  POCKET_GUITAR_STEP_CYCLE,
  POCKET_GUITAR_TONES,
  DEFAULT_GUITAR_REGISTER,
  DEFAULT_GUITAR_STRUM_MODE,
  DEFAULT_GUITAR_TONE,
  CHORDSMITH_GUITAR_GATE_SECONDS,
  DEFAULT_CHORD_INSTRUMENT,
  DEFAULT_MELODY_INSTRUMENT,
  POCKET_CHORD_INSTRUMENTS,
  POCKET_CHORD_INSTRUMENT_CONFIGS,
  POCKET_MELODY_INSTRUMENTS,
  POCKET_LEAD_INSTRUMENT_CONFIGS,
  POCKET_PRO_EQ_BANDS,
  POCKET_PRO_EQ_DEFAULT_PARAMETERS,
  POCKET_PRO_EQ_PRESETS,
  POCKET_PRO_EQ_TYPE,
  POCKET_LOFI_SOUND_REGISTRY,
  POCKET_SOUND_REGISTRY,
  CHORDSMITH_HUMANIZE_TIMING_SECONDS,
  CHORDSMITH_LOFI_TEXTURE_LIVE,
  CHORDSMITH_LOFI_TEXTURE_OFFLINE,
  CHORDSMITH_OFFLINE_RENDER_HEADROOM,
  CHORDSMITH_OFFLINE_STEM_GAIN,
  chordsmithDawSynthFxSlots,
  chordsmithDrumPeak,
  chordsmithLiveDrumPadPeak,
  chordsmithDrumStepDuration,
  chordsmithDrumTupletDuration,
  chordsmithFxParameters,
  chordsmithFeatureSeed,
  chordsmithGuitarStepDuration,
  chordsmithHumanizeOffset,
  chordsmithHumanizePeak,
  chordsmithHumanizeVelocity,
  chordsmithPhraseDuration,
  chordsmithPhraseInfo,
  chordsmithLofiTextureOfflineSample,
  chordsmithOfflineStemOutputGain,
  chordsmithOfflineStemRenderGain,
  chordsmithStableNoiseSample,
  chordsmithLofiTextureLiveCrackleFrequency,
  chordsmithLofiTextureLiveCrackleShouldTrigger,
  chordsmithLofiTextureLiveHissLowpass,
  chordsmithLofiTextureOfflineCrackleWindow,
  SECTION_IDS,
  buildPocketAudioTimeline,
  buildPocketChordsmithShareCode,
  base64UrlToUtf8,
  encodePcm16WavBytes,
  normalisePocketChordsmithProject,
  parsePocketChordsmithInput,
  renderPocketAudioBuffer,
  sidechainDuckCurve,
  sidechainDuckGainAt,
  validatePocketGuitarRegistry,
  validatePocketInstrumentRegistry,
  validatePocketSoundRegistry,
  validateLofiSoundRegistry,
  resolvePocketBassToneId,
  resolvePocketDrumKitId,
  utf8ToBase64Url,
  beatDurationSeconds,
  buildStepTimeline,
  chordsmithAutoBassMidi,
  chordsmithBassIndexToMidi,
  chordsmithChordForStep,
  chordsmithChordMidiNotes,
  chordsmithChordRhythmStarts,
  chordsmithMelodyIndexToMidi,
  chordsmithPowerChordNotes,
  chordsmithPitchedTupletDuration,
  chordsmithPitchedTupletMiddleIndex,
  chordsmithPitchedTupletMiddleMidi,
  chordsmithScalePitchClasses,
  CHORDSMITH_PITCHED_TUPLET,
  spanDurationSeconds,
  stepDurationSeconds,
  tripletTimesForSpan
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
  assert.equal(normalised.meta.audioProfile, "standard");
  assert.equal(normalised.lofi.presetId, "");
  assert.equal(normalised.mixer.fx.lofiTexture.enabled, false);
  assert.equal(normalised.mixer.fx.delay, DEFAULT_FX.delay);
  assert.equal(normalised.mixer.fx.echo, DEFAULT_FX.echo);
  assert.equal(normalised.mixer.fx.reverb, DEFAULT_FX.reverb);
  assert.equal(normalised.mixer.fx.sidechain.amount, DEFAULT_FX.sidechain.amount);
  assert.equal(normalised.mixer.masterVolume, DEFAULT_MASTER_VOLUME);
  assert.equal(normalised.mixer.stems.chords.volume, DEFAULT_STEM_MIX.chords.volume);
  assert.equal(normalised.mixer.stems.melody.volume, DEFAULT_STEM_MIX.melody.volume);
  assert.equal(normalised.mixer.stems.guitar.volume, DEFAULT_STEM_MIX.guitar.volume);
  assert.equal(normalised.sections.A.guitar.volume, DEFAULT_STEM_MIX.guitar.volume);
  assert.equal(normalised.sections.A.bars, 1);
  assert.equal(normalised.sections.A.drums.kick[0], 1);
});

test("normalise missing section progressions with the Chordsmith default loop", () => {
  const normalised = normalisePocketChordsmithProject({
    ...minimalProject,
    songSequence: ["B"],
    sectionBars: { B: 4 },
    gridB: { kick: [1], snare: [], hat: [], bass: [1] }
  });

  assert.deepEqual(normalised.sections.B.progression, [0, 4, 5, 3]);
});

test("normalise active sections from sequence, manual bass, guitar and changed progressions", () => {
  const normalised = normalisePocketChordsmithProject({
    ...minimalProject,
    songSequence: ["B"],
    sectionBars: { B: 1, C: 1, D: 1, E: 1, F: 1 },
    bassMode: "manual",
    bassNotesC: [4, null, null, null],
    progressionD: [1, 4, 5, 3],
    guitarEnabled: true,
    guitarPatternE: ["open", "off", "off", "off"]
  });

  assert.equal(normalised.sections.B.active, true);
  assert.equal(normalised.sections.C.active, true);
  assert.equal(normalised.sections.D.active, true);
  assert.equal(normalised.sections.E.active, true);
  assert.equal(normalised.sections.F.active, false);
});

test("normalise Chordsmith sound IDs through shared core registries", () => {
  const melodyA = [0, null, 2, null];
  const melodyB = [7, null, null, null];
  const shared = normalisePocketChordsmithProject({
    ...minimalProject,
    chordInstrument: "dusty_rhodes",
    melodyTracksA: [melodyA, melodyB],
    melodyInstrumentsA: ["tape_bell", "definitely_not_a_voice"],
    chordPlayMode: "strum_down",
    chordRhythmMode: "quarter",
    guitarEnabled: true,
    guitarTone: "western_twang",
    guitarRegister: "high",
    guitarStrumMode: "alternate",
    guitarPatternA: ["open", "sparkle", "hold", "scratch"]
  });
  const invalid = normalisePocketChordsmithProject({
    ...minimalProject,
    chordInstrument: "definitely_not_a_chord_voice",
    melodyTracksA: [melodyA],
    melodyInstrumentsA: ["definitely_not_a_voice"],
    chordPlayMode: "sideways_strum",
    chordRhythmMode: "everywhere_all_at_once",
    guitarEnabled: true,
    guitarTone: "definitely_not_a_tone",
    guitarRegister: "underwater",
    guitarStrumMode: "sideways"
  });

  assert.equal(shared.sections.A.chords.instrument, "dusty_rhodes");
  assert.deepEqual(CHORDSMITH_CHORD_PLAY_MODES, ["block", "strum_up", "strum_down", "arp_up", "arp_down"]);
  assert.deepEqual(CHORDSMITH_CHORD_RHYTHM_MODES, ["sustain", "quarter", "half"]);
  assert.equal(shared.sections.A.chords.playMode, "strum_down");
  assert.equal(shared.sections.A.chords.rhythmMode, "quarter");
  assert.deepEqual(shared.sections.A.melody.map((track) => track.instrument), ["tape_bell", "pulse"]);
  assert.equal(shared.sections.A.guitar.tone, "western_twang");
  assert.equal(shared.sections.A.guitar.register, "high");
  assert.equal(shared.sections.A.guitar.strumMode, "alternate");
  assert.deepEqual(shared.sections.A.guitar.pattern.slice(0, 4), ["open", "off", "hold", "scratch"]);
  assert.equal(invalid.sections.A.chords.instrument, "pocket");
  assert.equal(invalid.sections.A.chords.playMode, "block");
  assert.equal(invalid.sections.A.chords.rhythmMode, "sustain");
  assert.deepEqual(invalid.sections.A.melody.map((track) => track.instrument), ["pulse"]);
  assert.equal(invalid.sections.A.guitar.tone, "high_gain");
  assert.equal(invalid.sections.A.guitar.register, "low");
  assert.equal(invalid.sections.A.guitar.strumMode, "down");
});

test("normalise lofi metadata without schema bump", () => {
  const normalised = normalisePocketChordsmithProject({
    ...minimalProject,
    audioProfile: "lofi_chill",
    lofiPreset: "lofi_rainy_window",
    lofiTexture: { enabled: true, vinylCrackle: 0.2, tapeHiss: 0.1, wowFlutter: 0.04 },
    drumKit: "lofi_brush",
    drumGroovePreset: "lofi_brush_shuffle",
    bassTone: "soft_upright"
  });
  assert.equal(LOFI_STYLE_PRESETS.lofi_rainy_window.bpm.default, 72);
  assert.equal(normalised.source.sourceSchemaVersion, 16);
  assert.equal(normalised.meta.audioProfile, "lofi_chill");
  assert.equal(normalised.meta.stylePreset, "lofi_rainy_window");
  assert.equal(normalised.lofi.drumKit, "lofi_brush");
  assert.equal(normalised.lofi.drumGroovePreset, "lofi_brush_shuffle");
  assert.equal(normalised.lofi.bassTone, "soft_upright");
  assert.equal(normalised.lofi.texture.enabled, true);
  assert.equal(normalised.mixer.fx.lofiTexture.vinylCrackle, 0.2);
});

test("normalise lofi drum kit, groove and bass IDs through shared preset registries", () => {
  const invalid = normalisePocketChordsmithProject({
    ...minimalProject,
    audioProfile: "lofi_chill",
    lofiPreset: "lofi_koi_pond",
    drumKit: "not_a_real_kit",
    drumGroovePreset: "not_a_real_groove",
    bassTone: "not_a_real_bass"
  });
  const standard = normalisePocketChordsmithProject({
    ...minimalProject,
    drumKit: "lofi_tape_soft",
    drumGroovePreset: "lofi_sparse_clicks",
    bassTone: "rounded_triangle_bass"
  });

  assert.equal(invalid.lofi.drumKit, "lofi_tape_soft");
  assert.equal(invalid.lofi.drumGroovePreset, "lofi_sparse_clicks");
  assert.equal(invalid.lofi.bassTone, "rounded_triangle_bass");
  assert.equal(standard.meta.audioProfile, "standard");
  assert.equal(standard.lofi.drumKit, "");
  assert.equal(standard.lofi.drumGroovePreset, "");
  assert.equal(standard.lofi.bassTone, "classic");
});

test("normalise lofi texture defaults to the Chordsmith preset texture", () => {
  const normalised = normalisePocketChordsmithProject({
    ...minimalProject,
    audioProfile: "lofi_chill",
    lofiPreset: "lofi_rainy_window",
    lofiTexture: { vinylCrackle: 0.2, tapeHiss: 0.1, wowFlutter: 0.04 }
  });

  assert.equal(normalised.lofi.texture.enabled, true);
  assert.equal(normalised.mixer.fx.lofiTexture.enabled, true);
  assert.equal(normalised.mixer.fx.lofiTexture.vinylCrackle, 0.2);
  assert.equal(normalised.mixer.fx.lofiTexture.warmth, LOFI_STYLE_PRESETS.lofi_rainy_window.texture.warmth);
});

test("lofi sound registry covers every public lofi sound id", () => {
  assert.deepEqual(validateLofiSoundRegistry(), {
    missingDrumKits: [],
    missingBassTones: [],
    missingChordInstruments: [],
    missingLeadInstruments: []
  });
  assert.equal(POCKET_LOFI_SOUND_REGISTRY.bassTones.warm_sub.cutoff, 210);
  assert.equal(POCKET_LOFI_SOUND_REGISTRY.chordInstruments.dusty_rhodes.freq, 1550);
  assert.equal(POCKET_LOFI_SOUND_REGISTRY.leadInstruments.tape_bell.extra.freq, 2100);
});

test("shared sound registry includes the classic Chordsmith bass voice", () => {
  assert.deepEqual(validatePocketSoundRegistry(), {
    missingDrumKits: [],
    missingBassTones: [],
    lofi: {
      missingDrumKits: [],
      missingBassTones: [],
      missingChordInstruments: [],
      missingLeadInstruments: []
    }
  });
  assert.deepEqual(Object.keys(POCKET_BASS_TONE_CONFIGS), ["classic", "warm_sub", "soft_upright", "rounded_triangle_bass"]);
  assert.deepEqual(Object.keys(POCKET_DRUM_KIT_CONFIGS), ["classic", "lofi_dusty", "lofi_brush", "lofi_tape_soft"]);
  assert.equal(POCKET_DRUM_KIT_CONFIGS.classic.kick.startFreq, 155);
  assert.equal(POCKET_DRUM_KIT_CONFIGS.lofi_brush.snare.bodyFreq, 150);
  assert.equal(POCKET_BASS_TONE_CONFIGS.classic.cutoff, 420);
  assert.equal(POCKET_BASS_TONE_CONFIGS.classic.subPeak, 0.42);
  assert.equal(POCKET_SOUND_REGISTRY.drumKits.classic.hat.highpassClosed, 5600);
  assert.equal(POCKET_SOUND_REGISTRY.bassTones.classic.mainWave, "sawtooth");
  assert.equal(DEFAULT_CLASSIC_DRUM_KIT, "classic");
  assert.equal(DEFAULT_CLASSIC_BASS_TONE, "classic");
  assert.equal(DEFAULT_LOFI_DRUM_KIT, "lofi_dusty");
  assert.equal(resolvePocketDrumKitId("lofi_tape_soft", "standard", ""), "lofi_tape_soft");
  assert.equal(resolvePocketDrumKitId("classic", "lofi_chill", ""), "classic");
  assert.equal(resolvePocketDrumKitId("", "lofi_chill", ""), DEFAULT_LOFI_DRUM_KIT);
  assert.equal(resolvePocketDrumKitId("unknown_lofi", "standard", "lofi_koi_pond"), DEFAULT_LOFI_DRUM_KIT);
  assert.equal(resolvePocketDrumKitId("unknown_lofi", "standard", ""), DEFAULT_CLASSIC_DRUM_KIT);
  assert.equal(resolvePocketBassToneId("rounded_triangle_bass"), "rounded_triangle_bass");
  assert.equal(resolvePocketBassToneId("missing_bass"), DEFAULT_CLASSIC_BASS_TONE);
});

test("shared drum feel helper mirrors Chordsmith live gates and peaks", () => {
  assert.equal(CHORDSMITH_DRUM_FEEL.peak.kick.normal, 0.95);
  assert.equal(chordsmithDrumPeak("kick", 2), 1.12);
  assert.equal(chordsmithDrumPeak("snare", 1), 0.5);
  assert.equal(chordsmithDrumPeak("hat", 2), 0.24);
  assert.equal(chordsmithDrumStepDuration({ lane: "kick", level: 1, stepDuration: 0.125 }), 0.0875);
  assert.equal(chordsmithDrumStepDuration({ lane: "snare", level: 1, stepDuration: 0.125 }), 0.08);
  assert.equal(chordsmithDrumStepDuration({ lane: "hat", level: 1, stepDuration: 0.125 }), 0.025);
  assert.equal(chordsmithDrumStepDuration({ lane: "hat", level: 2, stepDuration: 0.125 }), 0.09375);
  assert.ok(Math.abs(chordsmithDrumTupletDuration({ lane: "kick", level: 1, spanDuration: 0.25 }) - 0.05833333333333333) < 0.000001);
  assert.ok(Math.abs(chordsmithDrumTupletDuration({ lane: "hat", level: 2, spanDuration: 0.75 }) - 0.12) < 0.000001);
});

test("shared drum lane registry covers Chordsmith live pad recording metadata", () => {
  assert.deepEqual(POCKET_DRUM_LANES.map((lane) => lane.id), ["kick", "snare", "clap", "hat", "openhat", "tomlow", "tommid", "tomhi", "crash", "ride"]);
  assert.deepEqual(CHORDSMITH_SEQUENCED_DRUM_LANE_IDS, ["kick", "snare", "hat"]);
  assert.deepEqual(POCKET_DRUM_LANES.map((lane) => lane.chordsmithPad), POCKET_DRUM_LANES.map((lane) => lane.id));
  assert.deepEqual(
    POCKET_DRUM_LANES.filter((lane) => lane.chordsmithRecordTrack).map((lane) => [lane.id, lane.chordsmithRecordTrack, lane.chordsmithRecordLevel]),
    [
      ["kick", "kick", 1],
      ["snare", "snare", 1],
      ["clap", "snare", 2],
      ["hat", "hat", 1],
      ["openhat", "hat", 2]
    ]
  );
  assert.deepEqual(
    POCKET_DRUM_LANES.filter((lane) => !lane.chordsmithRecordTrack).map((lane) => lane.id),
    ["tomlow", "tommid", "tomhi", "crash", "ride"]
  );
});

test("shared live drum voice constants mirror Chordsmith pad playback", () => {
  assert.equal(chordsmithLiveDrumPadPeak("kick", 1), 0.95);
  assert.equal(chordsmithLiveDrumPadPeak("snare", 1), 0.56);
  assert.equal(chordsmithLiveDrumPadPeak("openhat", 1), 0.25);
  assert.equal(chordsmithLiveDrumPadPeak("tomlow", 1), 0.62);
  assert.deepEqual(CHORDSMITH_LIVE_DRUM_VOICES.clap.burstOffsets, [0, 0.018, 0.036]);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.clap.bandpassBase, 1450);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.clap.bandpassStep, 150);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.tomhi.frequency, 218);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.tomhi.peak, 0.52);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.tomlow.endFrequencyRatio, 0.58);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.crash.durationSeconds, 0.9);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.crash.highpass, 3300);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.ride.durationSeconds, 0.42);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.ride.highpass, 4300);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.ride.bellFrequency, 980);
  assert.equal(CHORDSMITH_LIVE_DRUM_VOICES.ride.bellGain, 0.07);
});

test("shared chord rhythm helper mirrors Chordsmith live gates", () => {
  assert.equal(CHORDSMITH_CHORD_RHYTHM.quarterGate, 0.9);
  assert.deepEqual(
    chordsmithChordRhythmStarts({ mode: "quarter", barStart: 1, beatDuration: 0.5, timeSig: 3 }),
    [[1, 0.45], [1.5, 0.45], [2, 0.45]]
  );
  assert.deepEqual(
    chordsmithChordRhythmStarts({ mode: "half", barStart: 0, beatDuration: 0.5, timeSig: 4 }),
    [[0, 0.9], [1, 0.9]]
  );
  assert.deepEqual(
    chordsmithChordRhythmStarts({ mode: "half", barStart: 0, beatDuration: 0.5, timeSig: 3 }),
    [[0, 0.9], [0.75, 0.6]]
  );
  assert.deepEqual(
    chordsmithChordRhythmStarts({ mode: "sustain", barStart: 0, beatDuration: 0.5, timeSig: 4 }),
    [[0, 1.84]]
  );
});

test("shared timing helper mirrors Chordsmith swing and triplet spans", () => {
  const timing = { bpm: 120, resolution: 4, swing: 0.2 };
  assert.equal(beatDurationSeconds(timing), 0.5);
  assert.equal(stepDurationSeconds(timing, 0), 0.1);
  assert.equal(stepDurationSeconds(timing, 1), 0.15);
  assert.equal(spanDurationSeconds(timing, 0, 2), 0.25);
  assert.deepEqual(tripletTimesForSpan(3, 0.75), [3, 3.25, 3.5]);
  assert.deepEqual(buildStepTimeline({ stepCount: 3, startTime: 2, ...timing }).times, [2, 2.1, 2.25]);
  assert.equal(stepDurationSeconds({ secondsPerBeat: 0.5, resolution: 4, swing: 0.2 }, 1), 0.15);
});

test("shared pitch helper mirrors Chordsmith MIDI mapping", () => {
  assert.deepEqual(chordsmithScalePitchClasses({ key: "D", scale: "minor" }), [2, 4, 5, 7, 9, 10, 0]);
  const chord = chordsmithChordForStep({
    key: "D",
    scale: "minor",
    chordType: "seventh",
    timeSig: 4,
    resolution: 4,
    progression: [0, 4, 5, 3],
    step: 16
  });
  assert.deepEqual(chord, { degree: 4, rootPc: 9, quality: "min", intervals: [0, 3, 7, 10] });
  assert.deepEqual(chordsmithChordMidiNotes({ chord, chordOctave: 1, chordPlayMode: "block" }), [69, 84, 88, 91]);
  assert.deepEqual(chordsmithChordMidiNotes({ chord, chordOctave: 1, chordPlayMode: "strum_down" }), [91, 88, 84, 69]);
  assert.deepEqual(chordsmithPowerChordNotes({ rootPc: 9, guitarRegister: "mid" }), [45, 52, 57]);
  assert.equal(chordsmithMelodyIndexToMidi({ key: "D", scale: "minor", melodyPitchMode: "scale", noteIndex: 8 }), 88);
  assert.equal(chordsmithMelodyIndexToMidi({ melodyPitchMode: "chromatic", noteIndex: 13, octave: -1 }), 73);
  assert.equal(chordsmithBassIndexToMidi({ key: "D", scale: "minor", noteIndex: 8 }), 52);
  assert.equal(chordsmithAutoBassMidi({ rootPc: 9 }), 45);
});

test("shared pitched tuplet helper mirrors Chordsmith bass and melody tuplets", () => {
  assert.equal(CHORDSMITH_PITCHED_TUPLET.gateFloorSeconds, 0.08);
  assert.equal(CHORDSMITH_PITCHED_TUPLET.gateSpanMul, 0.86);
  assert.equal(chordsmithPitchedTupletDuration(0.25), 0.08);
  assert.equal(chordsmithPitchedTupletDuration(0.75), 0.215);
  assert.equal(chordsmithPitchedTupletMiddleMidi(40, 47), 44);
  assert.equal(chordsmithPitchedTupletMiddleMidi(40, null), 40);
  assert.equal(chordsmithPitchedTupletMiddleMidi(null, 47), null);
  assert.equal(chordsmithPitchedTupletMiddleIndex(2, 5), 4);
  assert.equal(chordsmithPitchedTupletMiddleIndex(20, 30, { melodyPitchMode: "chromatic" }), 23);
});

test("shared offline stem mix helper mirrors Chordsmith WAV export staging", () => {
  assert.deepEqual(CHORDSMITH_OFFLINE_STEM_GAIN, {
    drums: 0.68,
    bass: 0.68,
    chords: 0.78,
    melody: 0.82,
    guitar: 0.78
  });
  assert.equal(chordsmithOfflineStemOutputGain("chords"), DEFAULT_STEM_MIX.chords.volume * CHORDSMITH_OFFLINE_STEM_GAIN.chords);
  assert.equal(chordsmithOfflineStemOutputGain("drums"), DEFAULT_STEM_MIX.drums.volume * CHORDSMITH_OFFLINE_STEM_GAIN.drums);
  assert.equal(chordsmithOfflineStemOutputGain("melody"), DEFAULT_STEM_MIX.melody.volume * CHORDSMITH_OFFLINE_STEM_GAIN.melody);
  assert.equal(chordsmithOfflineStemOutputGain("guitar"), DEFAULT_STEM_MIX.guitar.volume * CHORDSMITH_OFFLINE_STEM_GAIN.guitar);
  assert.equal(chordsmithOfflineStemRenderGain("guitar"), DEFAULT_STEM_MIX.guitar.volume * CHORDSMITH_OFFLINE_STEM_GAIN.guitar * CHORDSMITH_OFFLINE_RENDER_HEADROOM);
});

test("shared phrase helper mirrors Chordsmith bass and melody gates", () => {
  assert.equal(CHORDSMITH_PHRASE_GATES.minimumSeconds, 0.18);
  assert.equal(chordsmithPhraseDuration(0.25, "bass"), 0.235);
  assert.equal(chordsmithPhraseDuration(0.25, "melody"), 0.23);
  assert.equal(chordsmithPhraseDuration(0.1, "melody"), 0.18);
  const phrase = chordsmithPhraseInfo({
    step: 0,
    totalSteps: 4,
    role: "bass",
    stepDurationAt: () => 0.25,
    holdAt: (step) => step === 1,
    slideAt: (step) => step === 2
  });
  assert.equal(phrase.rawDuration, 0.75);
  assert.equal(phrase.duration, 0.705);
  assert.equal(phrase.slideStep, 2);
  assert.equal(phrase.slideOffset, 0.5);
});

test("shared guitar tone registry matches Chordsmith tone surface", () => {
  assert.deepEqual(validatePocketGuitarRegistry(), { missingToneConfigs: [] });
  assert.deepEqual(POCKET_GUITAR_TONES, ["clean", "crunch", "high_gain", "metal", "western_twang"]);
  assert.deepEqual(POCKET_GUITAR_STEP_CYCLE, ["off", "chug", "accent", "hold", "scratch"]);
  assert.equal(DEFAULT_GUITAR_TONE, "high_gain");
  assert.equal(DEFAULT_GUITAR_REGISTER, "low");
  assert.equal(DEFAULT_GUITAR_STRUM_MODE, "down");
  assert.ok(POCKET_GUITAR_TONES.includes(DEFAULT_GUITAR_TONE));
  assert.equal(POCKET_GUITAR_TONE_CONFIGS.high_gain.drive, 4.2);
  assert.equal(POCKET_GUITAR_TONE_CONFIGS.metal.lowpass, 3050);
  assert.equal(POCKET_GUITAR_TONE_CONFIGS.western_twang.spread, 0.02);
});

test("shared guitar gate helper mirrors Chordsmith live playback", () => {
  assert.equal(CHORDSMITH_GUITAR_GATE_SECONDS.chugFloor, 0.055);
  assert.equal(chordsmithGuitarStepDuration({ stepDuration: 0.125, articulation: "chug" }), 0.0725);
  assert.equal(chordsmithGuitarStepDuration({ stepDuration: 0.125, articulation: "scratch" }), 0.0525);
  assert.equal(chordsmithGuitarStepDuration({ stepDuration: 0.125, heldDuration: 0.25, articulation: "open" }), 0.23);
  assert.equal(chordsmithGuitarStepDuration({ stepDuration: 0.125, articulation: "accent" }), 0.16);
});

test("shared Chordsmith instrument registry covers chord and melody voices", () => {
  assert.deepEqual(validatePocketInstrumentRegistry(), { missingChordConfigs: [], missingLeadConfigs: [] });
  assert.deepEqual(POCKET_CHORD_INSTRUMENTS, ["pocket", "piano", "saloon_piano", "harp", "warm_pad", "glass", "dusty_rhodes", "felt_piano", "cassette_keys", "muted_jazz_guitar", "lofi_warm_pad"]);
  assert.deepEqual(POCKET_MELODY_INSTRUMENTS, ["pulse", "soft", "synth", "bell", "lead_guitar", "distorted_lead_guitar", "banjo", "harmonica", "cowboy_whistle", "trumpet", "saxophone", "mellow_vibes", "soft_pluck", "mellow_sax", "muted_trumpet", "tape_bell"]);
  assert.equal(DEFAULT_CHORD_INSTRUMENT, "pocket");
  assert.equal(DEFAULT_MELODY_INSTRUMENT, "pulse");
  assert.ok(POCKET_CHORD_INSTRUMENTS.includes(DEFAULT_CHORD_INSTRUMENT));
  assert.ok(POCKET_MELODY_INSTRUMENTS.includes(DEFAULT_MELODY_INSTRUMENT));
  assert.equal(POCKET_CHORD_INSTRUMENT_CONFIGS.piano.peak, 0.23);
  assert.equal(POCKET_CHORD_INSTRUMENT_CONFIGS.lofi_warm_pad.filterSweep, 1180);
  assert.equal(POCKET_LEAD_INSTRUMENT_CONFIGS.harmonica.extras.length, 2);
  assert.equal(POCKET_LEAD_INSTRUMENT_CONFIGS.muted_trumpet.extra.midiOffset, 12);
  assert.equal(POCKET_LEAD_INSTRUMENT_CONFIGS.muted_trumpet.extra.freqMul, 1);
  assert.equal(POCKET_LEAD_INSTRUMENT_CONFIGS.tape_bell.extra.freqMul, 0.997);
});

test("shared Pocket Pro EQ contract exposes editable bands and presets", () => {
  assert.equal(POCKET_PRO_EQ_TYPE, "parametric-eq");
  assert.deepEqual(POCKET_PRO_EQ_BANDS.map((band) => band.id), ["hp", "lowShelf", "lowMid", "highMid", "highShelf", "lp"]);
  assert.equal(POCKET_PRO_EQ_DEFAULT_PARAMETERS.highMidFrequency, 2400);
  assert.ok(POCKET_PRO_EQ_PRESETS.some((preset) => preset.id === "lofi-soft-rolloff"));
  assert.ok(POCKET_PRO_EQ_PRESETS.some((preset) => preset.id === "lofi-drum-softener"));
  assert.ok(POCKET_PRO_EQ_PRESETS.some((preset) => preset.id === "warm-bass-pocket"));
  assert.ok(POCKET_PRO_EQ_PRESETS.some((preset) => preset.id === "soft-chord-bed"));
  assert.ok(POCKET_PRO_EQ_PRESETS.some((preset) => preset.id === "gentle-lead-presence"));
});

test("shared Chordsmith FX mapper mirrors live graph parameters for DAW imports", () => {
  const fx = chordsmithFxParameters({ delay: 0.31, chorus: 0.22, flanger: 0.11, reverb: 0.27, mix: 0.58 });

  assert.equal(fx.dryGain, Math.max(0.52, 1 - 0.58 * 0.48));
  assert.equal(fx.wetMasterGain, 0.58 * 1.45);
  assert.equal(fx.delay.time, 0.1 + 0.31 * 0.42);
  assert.equal(fx.delay.feedback, 0.05 + 0.31 * 0.72);
  assert.equal(fx.delay.mix, 0.31 * 0.95 * 0.58 * 1.45);
  assert.equal(fx.chorus.rate, 0.25 + 0.22 * 1.9);
  assert.equal(fx.chorus.depth, 0.0014 + 0.22 * 0.03);
  assert.equal(fx.flanger.feedback, 0.08 + 0.11 * 0.82);
  assert.equal(fx.reverb.decay, 1.6);
  assert.equal(fx.reverb.impulseDecay, 2.4);

  const slots = chordsmithDawSynthFxSlots({ delay: 0.31, chorus: 0.22, flanger: 0.11, reverb: 0.27, mix: 0.58 });
  assert.deepEqual(slots.map((slot) => slot.id), ["pcs_tone", "pcs_delay", "pcs_chorus", "pcs_reverb"]);
  assert.equal(slots[0].type, "parametric-eq");
  assert.equal(slots[0].parameters.highShelfFrequency, 1800);
  assert.equal(slots[1].parameters.time, fx.delay.time);
  assert.ok(Math.abs(slots[2].parameters.mix - ((0.22 * 0.95 + 0.11 * 0.35) * 0.58 * 1.45)) < 0.0000001);
  assert.equal(slots[3].parameters.mix, fx.reverb.mix);
});

test("shared sidechain helper mirrors the Chordsmith chord pump curve", () => {
  const curve = sidechainDuckCurve({ amount: 0.45, start: 1 });
  assert.deepEqual(curve.map((point) => Math.round(point.time * 1000)), [1000, 1012, 1220]);
  assert.ok(Math.abs(curve[1].gain - 0.676) < 0.000001);
  assert.equal(sidechainDuckGainAt({ amount: 0.45, triggerTime: 1, time: 0.99 }), 1);
  assert.ok(sidechainDuckGainAt({ amount: 0.45, triggerTime: 1, time: 1.012 }) < 0.68);
  assert.equal(sidechainDuckGainAt({ amount: 0.45, triggerTime: 1, time: 1.22 }), 1);
});

test("shared humanise helper mirrors the Chordsmith performance feel", () => {
  assert.equal(CHORDSMITH_HUMANIZE_TIMING_SECONDS, 0.018);
  assert.equal(chordsmithHumanizeOffset(4, 1, false), 0);
  assert.equal(chordsmithHumanizePeak(0.95, 4, 1, false), 0.95);
  assert.equal(chordsmithHumanizeVelocity(100, 4, 1, false), 100);
  assert.ok(chordsmithFeatureSeed(4, 1) >= 0);
  assert.ok(chordsmithFeatureSeed(4, 1) < 1);
  assert.ok(Math.abs(chordsmithHumanizeOffset(4, 1, true)) <= CHORDSMITH_HUMANIZE_TIMING_SECONDS / 2);
  assert.equal(
    chordsmithHumanizePeak(0.95, 4, 1, true),
    0.95 * (0.88 + chordsmithFeatureSeed(4, 100) * 0.2)
  );
  assert.equal(
    chordsmithHumanizeVelocity(100, 4, 1, true),
    Math.round(100 * (0.9 + chordsmithFeatureSeed(4, 200) * 0.18))
  );
});

test("timeline applies Chordsmith humanise timing and peaks when the source flag is enabled", () => {
  const plain = buildPocketAudioTimeline(normalisePocketChordsmithProject({
    ...minimalProject,
    humanizeOn: false,
    melodyTracksA: [[null, 2, null, null]],
    melodyInstrumentsA: ["pulse"]
  })).events;
  const human = buildPocketAudioTimeline(normalisePocketChordsmithProject({
    ...minimalProject,
    humanizeOn: true,
    melodyTracksA: [[null, 2, null, null]],
    melodyInstrumentsA: ["pulse"]
  })).events;

  const byType = (events, type) => events.find((event) => event.type === type);
  const plainKick = byType(plain, "kick");
  const humanKick = byType(human, "kick");
  const plainBass = byType(plain, "bass");
  const humanBass = byType(human, "bass");
  const plainMelody = byType(plain, "melody");
  const humanMelody = byType(human, "melody");

  assert.equal(humanKick.time, Math.max(0, plainKick.time + chordsmithHumanizeOffset(0, 1, true)));
  assert.equal(humanKick.velocity, chordsmithHumanizePeak(plainKick.velocity, 0, 1, true));
  assert.equal(humanBass.velocity, chordsmithHumanizePeak(plainBass.velocity, 0, 4, true));
  assert.equal(humanMelody.time, plainMelody.time + chordsmithHumanizeOffset(1, 10, true));
  assert.equal(humanMelody.velocity, chordsmithHumanizePeak(plainMelody.velocity, 1, 10, true));
});

test("shared lofi texture helper mirrors Chordsmith live and offline constants", () => {
  assert.equal(CHORDSMITH_LOFI_TEXTURE_LIVE.hissSeconds, 0.22);
  assert.equal(CHORDSMITH_LOFI_TEXTURE_LIVE.hissGain, 0.0055);
  assert.equal(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleThreshold, 0.7);
  assert.equal(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleGain, 0.018);
  assert.equal(CHORDSMITH_LOFI_TEXTURE_OFFLINE.hissGain, 0.014);
  assert.equal(CHORDSMITH_LOFI_TEXTURE_OFFLINE.crackleThreshold, 0.22);
  assert.equal(CHORDSMITH_LOFI_TEXTURE_OFFLINE.warmthGainBase, 0.42);
  assert.equal(chordsmithLofiTextureLiveHissLowpass(0.22), 3600 - 0.22 * 1800);
  assert.equal(
    chordsmithLofiTextureLiveCrackleFrequency(8),
    1550 + chordsmithFeatureSeed(8, 44) * 1300
  );
  assert.equal(
    chordsmithLofiTextureLiveCrackleShouldTrigger(8, 0.6),
    chordsmithFeatureSeed(8, 43) < 0.6 * 0.7
  );
  assert.equal(chordsmithLofiTextureOfflineCrackleWindow(8000), 900);
  assert.equal(chordsmithLofiTextureOfflineCrackleWindow(44100), Math.floor(44100 * 0.09));
  assert.equal(chordsmithStableNoiseSample(12, 91), stableNoiseSample(12, 91));
  assert.equal(
    chordsmithLofiTextureOfflineSample(12, { tapeHiss: 0.1, vinylCrackle: 0, bitCrush: 0 }, 900),
    stableNoiseSample(12, 91) * 0.1 * 0.014
  );
});

test("offline renderer adds Chordsmith lofi texture to exported buffers", () => {
  const cleanProject = normalisePocketChordsmithProject(minimalProject);
  const lofiProject = normalisePocketChordsmithProject({
    ...minimalProject,
    audioProfile: "lofi_chill",
    lofiPreset: "lofi_rainy_window",
    lofiTexture: {
      enabled: true,
      vinylCrackle: 0.2,
      tapeHiss: 0.1,
      wowFlutter: 0,
      warmth: 0.14,
      lowPassAge: 0.2,
      bitCrush: 0
    }
  });
  const clean = renderPocketAudioBuffer(cleanProject, { sampleRate: 8000 });
  const lofi = renderPocketAudioBuffer(lofiProject, { sampleRate: 8000 });
  assert.equal(lofi.eventCount, clean.eventCount);
  assert.equal(lofi.duration, clean.duration);
  assert.notEqual(lofi.channels[0][0], clean.channels[0][0]);
  assert.ok(Math.abs(lofi.channels[0][0] - lofi.channels[1][0]) < 0.0000001);
});

test("shared built-in FX catalog exposes DAW effect defaults", () => {
  assert.deepEqual(POCKET_BUILT_IN_FX_TYPES, [
    "utility-gain",
    "high-pass",
    "low-pass",
    "three-band-eq",
    "parametric-eq",
    "compressor",
    "limiter",
    "noise-gate",
    "saturation",
    "bitcrusher",
    "delay",
    "ping-pong-delay",
    "reverb",
    "chorus",
    "phaser",
    "tremolo-autopan"
  ]);
  assert.equal(POCKET_BUILT_IN_FX.find((fx) => fx.type === "parametric-eq").defaultParameters.highMidFrequency, 2400);
  assert.equal(POCKET_BUILT_IN_FX.find((fx) => fx.type === "delay").defaultParameters.feedback, 0.28);
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

test("timeline fallback stem velocities use shared Chordsmith mix defaults", () => {
  const project = normalisePocketChordsmithProject({
    ...richProject(),
    chordVolume: undefined,
    leadVolume: undefined,
    melodyTracksA: [[0, null, 2, null]]
  });
  delete project.mixer.stems.chords.volume;
  delete project.mixer.stems.melody.volume;

  const timeline = buildPocketAudioTimeline(project);
  const chord = timeline.events.find((event) => event.type === "chord");
  const melody = timeline.events.find((event) => event.type === "melody");

  assert.equal(chord.velocity, DEFAULT_STEM_MIX.chords.volume);
  assert.equal(melody.velocity, DEFAULT_STEM_MIX.melody.volume);
});

test("timeline guitar durations mirror Chordsmith live gates", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    bpm: 120,
    guitarEnabled: true,
    guitarPatternA: ["open", "hold", "chug", "scratch", "accent", "off", "off", "off"]
  });
  const guitar = buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" }).events.filter((event) => event.type === "guitar");
  const byArticulation = Object.fromEntries(guitar.map((event) => [event.articulation, event.duration]));

  assert.ok(Math.abs(byArticulation.open - 0.23) < 0.000001);
  assert.ok(Math.abs(byArticulation.chug - 0.0725) < 0.000001);
  assert.ok(Math.abs(byArticulation.scratch - 0.0525) < 0.000001);
  assert.equal(byArticulation.accent, 0.16);
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
  assert.ok(Math.abs(kicks[0].duration - chordsmithDrumTupletDuration({ lane: "kick", level: 1, spanDuration: 60 / minimalProject.bpm / 2 })) < 0.000001);
});

test("bass tuplets mirror Chordsmith middle-note and step metadata", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    bassMode: "manual",
    bassNotesA: [1, 5, null, null],
    bassAccentA: [false, true, false, false],
    gridA: { kick: [], snare: [], hat: [], bass: [1, 2, 0, 0] },
    gridTupletsA: { kick: [], snare: [], hat: [], bass: [true, false, false, false] }
  });
  const bass = buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" }).events.filter((event) => event.type === "bass");
  assert.equal(bass.length, 3);
  assert.deepEqual(bass.map((event) => event.midi), [40, 43, 46]);
  assert.deepEqual(bass.map((event) => event.step), [0, 0, 0]);
  assert.deepEqual(bass.map((event) => event.accent), [false, false, true]);
  assert.ok(bass.every((event) => event.tuplet));
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
  assert.ok(Math.abs(melody.duration - 0.69) < 0.000001);
});

test("held bass uses Chordsmith phrase length", () => {
  const project = normalisePocketChordsmithProject({
    ...minimalProject,
    bpm: 60,
    bassMode: "manual",
    bassNotesA: [0, null, null, null],
    bassHoldA: [false, true, false, false],
    gridA: { kick: [], snare: [], hat: [], bass: [1, 0, 0, 0] }
  });
  const bass = buildPocketAudioTimeline(project, { scope: "section", sectionId: "A" }).events.find((event) => event.type === "bass");
  assert.equal(bass.duration, 0.47);
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

function stableNoiseSample(index, seed = 0) {
  const x = Math.sin((index + 1) * 12.9898 + (seed + 1) * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
