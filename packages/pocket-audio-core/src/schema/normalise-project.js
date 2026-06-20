import {
  CORE_PROJECT_VERSION,
  DEFAULT_BPM,
  DEFAULT_FX,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_PPQ,
  DEFAULT_RESOLUTION,
  DEFAULT_STEM_MIX,
  DEFAULT_TIME_SIG,
  MAX_SEQUENCE_SLOTS,
  NOTES,
  POCKET_AUDIO_CORE_VERSION,
  SECTION_IDS,
  STEM_IDS
} from "../constants.js";
import { normaliseLofiProjectSettings } from "../presets/lofi.js";
import { CHIP_AUDIO_PROFILE_ID, normaliseChipProjectSettings } from "../presets/chip.js";
import { CHORDSMITH_CHORD_PLAY_MODES, CHORDSMITH_CHORD_RHYTHM_MODES } from "../performance/chord-rhythm.js";
import { DEFAULT_CHORD_INSTRUMENT, DEFAULT_MELODY_INSTRUMENT, POCKET_CHORD_INSTRUMENTS, POCKET_MELODY_INSTRUMENTS } from "../sounds/instruments.js";
import { DEFAULT_GUITAR_REGISTER, DEFAULT_GUITAR_STRUM_MODE, DEFAULT_GUITAR_TONE, POCKET_GUITAR_ARTICULATIONS, POCKET_GUITAR_REGISTERS, POCKET_GUITAR_STRUM_MODES, POCKET_GUITAR_TONES } from "../sounds/guitar.js";
import { migratePocketChordsmithProject } from "./migrations.js";

const DEFAULT_PROGRESSION = Object.freeze([0, 4, 5, 3]);

export function normalisePocketChordsmithProject(raw, options = {}) {
  const { project, sourceSchemaVersion, migrationNotes } = migratePocketChordsmithProject(raw);
  const soundProfile = normaliseSoundProfile(project);
  const lofi = soundProfile.lofi;
  const chip = soundProfile.chip;
  const timeSig = safeChoice(asInt(project.timeSig, DEFAULT_TIME_SIG), [3, 4, 5, 6, 7], DEFAULT_TIME_SIG);
  const resolution = sanitizeResolution(project.resolution ?? project.lastAdvancedResolution ?? DEFAULT_RESOLUTION);
  const sectionBars = normaliseSectionBars(project.sectionBars || project.sectionLengths);
  const requestedSequenceIds = normaliseSequenceIds(project.songSequence || project.sectionSequence);
  const sections = {};
  SECTION_IDS.forEach((id) => {
    sections[id] = normaliseSection(project, id, { timeSig, resolution, sectionBars, requestedSequenceIds });
  });
  const sequence = normaliseSequence(project.songSequence || project.sectionSequence, sections);
  const title = String(project.title || project.name || "Pocket Chordsmith Project");

  return {
    app: "PocketAudioProject",
    coreProjectVersion: CORE_PROJECT_VERSION,
    source: {
      sourceType: "pocket-chordsmith",
      sourcePrefix: options.sourcePrefix || "PCS1",
      sourceSchemaVersion,
      original: options.preserveOriginal === false ? undefined : cloneJson(project),
      normalizedAt: new Date().toISOString()
    },
    meta: {
      title,
      key: safeChoice(project.key, NOTES, "C"),
      scale: safeChoice(project.scale, ["major", "minor"], "major"),
      bpm: clamp(asInt(project.bpm, DEFAULT_BPM), 40, 240),
      timeSig,
      resolution,
      swing: clamp(asNumber(project.swing, 0), 0, 0.35),
      ppq: DEFAULT_PPQ,
      melodyPitchMode: safeChoice(project.melodyPitchMode, ["scale", "chromatic"], "scale"),
      humanizeOn: Boolean(project.humanizeOn),
      audioProfile: soundProfile.audioProfile,
      stylePreset: chip.presetId || lofi.presetId || ""
    },
    lofi,
    chip,
    transport: {
      scope: "sequence",
      currentSection: sequence[0] || "A"
    },
    mixer: {
      masterVolume: clamp(asNumber(project.masterVolume ?? project.masterVol, DEFAULT_MASTER_VOLUME), 0, 1),
      stems: normaliseStemMix(project),
      fx: normaliseFx(project)
    },
    sections,
    sequence,
    markers: [],
    compatibility: {
      coreVersion: POCKET_AUDIO_CORE_VERSION,
      sourceSchemaVersion,
      warnings: migrationNotes,
      limitations: ["0.1.0-scaffold normalises data but does not yet provide sound parity."]
    }
  };
}

function normaliseSection(project, id, context) {
  const steps = context.timeSig * context.resolution * context.sectionBars[id];
  const grid = project[`grid${id}`] || {};
  const progressionRaw = project[`progression${id}`];
  const melodyTracks = normaliseMelodyTracks(project[`melodyTracks${id}`] || project[`melody${id}`], steps);
  const guitarPattern = fitArray(project[`guitarPattern${id}`] || project[`rockGuitar${id}`], steps, "off", normaliseGuitarArticulation);
  const bassNotes = fitArray(project[`bassNotes${id}`], steps, null, (value) => normaliseMaybeNote(value, 13));
  const active =
    id === "A" ||
    context.requestedSequenceIds.includes(id) ||
    hasAnyHits(grid) ||
    melodyTracks.some((track) => track.some((note) => note !== null)) ||
    bassNotes.some((note) => note !== null) ||
    (Boolean(project.guitarEnabled) && guitarPattern.some((step) => step !== "off")) ||
    progressionDiffers(progressionRaw);
  return {
    id,
    bars: context.sectionBars[id],
    active,
    progression: fitArray(progressionRaw || DEFAULT_PROGRESSION, Math.max(1, context.sectionBars[id]), 0, (value) => clamp(asInt(value, 0), 0, 6)),
    drums: {
      kick: fitArray(grid.kick, steps, 0, normaliseBeat),
      snare: fitArray(grid.snare, steps, 0, normaliseBeat),
      hat: fitArray(grid.hat, steps, 0, normaliseBeat)
    },
    drumTuplets: normaliseTupletLanes(project[`gridTuplets${id}`], steps),
    bass: {
      mode: safeChoice(project.bassMode, ["auto", "manual"], "auto"),
      grid: fitArray(grid.bass, steps, 0, normaliseBeat),
      notes: bassNotes,
      hold: fitArray(project[`bassHold${id}`], steps, false, Boolean),
      slide: fitArray(project[`bassSlide${id}`], steps, false, Boolean),
      accent: fitArray(project[`bassAccent${id}`], steps, false, Boolean)
    },
    chords: {
      enabled: project.chordsOn !== false,
      instrument: safeChoice(project.chordInstrument, POCKET_CHORD_INSTRUMENTS, DEFAULT_CHORD_INSTRUMENT),
      type: safeChoice(project.chordType, ["triad", "seventh", "sus2", "sus4"], "triad"),
      playMode: safeChoice(project.chordPlayMode, CHORDSMITH_CHORD_PLAY_MODES, "block"),
      rhythmMode: safeChoice(project.chordRhythmMode, CHORDSMITH_CHORD_RHYTHM_MODES, "sustain"),
      octave: clamp(asInt(project.chordOctave, 0), -2, 2)
    },
    melody: melodyTracks.map((notes, index) => ({
      notes,
      instrument: safeChoice((project[`melodyInstruments${id}`] || [])[index], POCKET_MELODY_INSTRUMENTS, DEFAULT_MELODY_INSTRUMENT),
      octave: clamp(asInt((project[`melodyOctaves${id}`] || [])[index], 0), -2, 2),
      mute: Boolean((project[`melodyMute${id}`] || [])[index]),
      solo: Boolean((project[`melodySolo${id}`] || [])[index]),
      pan: clamp(asNumber((project[`melodyPan${id}`] || [])[index], 0), -1, 1),
      hold: fitArray((project[`melodyHold${id}`] || [])[index], steps, false, Boolean),
      slide: fitArray((project[`melodySlide${id}`] || [])[index], steps, false, Boolean),
      tuplets: fitArray((project[`melodyTuplets${id}`] || [])[index], steps, false, Boolean)
    })),
    guitar: {
      enabled: Boolean(project.guitarEnabled),
      tone: safeChoice(project.guitarTone, POCKET_GUITAR_TONES, DEFAULT_GUITAR_TONE),
      register: safeChoice(project.guitarRegister, POCKET_GUITAR_REGISTERS, DEFAULT_GUITAR_REGISTER),
      strumMode: safeChoice(project.guitarStrumMode, POCKET_GUITAR_STRUM_MODES, DEFAULT_GUITAR_STRUM_MODE),
      volume: clamp(asNumber(project.guitarVolume, DEFAULT_STEM_MIX.guitar.volume), 0, 1),
      pattern: guitarPattern
    }
  };
}

function normaliseSoundProfile(project) {
  const explicit = String(project.audioProfile || "").toLowerCase();
  const chipCandidate = normaliseChipProjectSettings(project);
  const lofiCandidate = normaliseLofiProjectSettings(project);
  const chipActive = explicit === CHIP_AUDIO_PROFILE_ID || (!explicit && Boolean(chipCandidate.presetId));
  const lofiActive = !chipActive && (explicit === "lofi_chill" || (!explicit && Boolean(lofiCandidate.presetId)));
  if (chipActive) {
    return {
      audioProfile: CHIP_AUDIO_PROFILE_ID,
      chip: chipCandidate,
      lofi: normaliseLofiProjectSettings({ audioProfile: "standard" })
    };
  }
  if (lofiActive) {
    return {
      audioProfile: "lofi_chill",
      chip: normaliseChipProjectSettings({ audioProfile: "standard" }),
      lofi: lofiCandidate
    };
  }
  return {
    audioProfile: "standard",
    chip: normaliseChipProjectSettings({ audioProfile: "standard" }),
    lofi: normaliseLofiProjectSettings({ audioProfile: "standard" })
  };
}

function normaliseStemMix(project) {
  const out = cloneJson(DEFAULT_STEM_MIX);
  out.drums.volume = clamp(asNumber(project.beatVolume ?? project.beatVol, out.drums.volume), 0, 1);
  out.bass.volume = clamp(asNumber(project.beatVolume ?? project.beatVol, out.bass.volume), 0, 1);
  out.chords.volume = clamp(asNumber(project.chordVolume ?? project.chordVol, out.chords.volume), 0, 1);
  out.melody.volume = clamp(asNumber(project.leadVolume ?? project.leadVol, out.melody.volume), 0, 1);
  out.guitar.volume = clamp(asNumber(project.guitarVolume, out.guitar.volume), 0, 1);
  STEM_IDS.forEach((id) => {
    out[id].mute = id === "bass" ? project.bassOn === false : id === "chords" ? project.chordsOn === false : false;
  });
  return out;
}

function normaliseFx(project) {
  const lofi = normaliseLofiProjectSettings(project);
  return {
    ...cloneJson(DEFAULT_FX),
    delay: clamp(asNumber(project.fxDelay, DEFAULT_FX.delay), 0, 1),
    chorus: clamp(asNumber(project.fxChorus, DEFAULT_FX.chorus), 0, 1),
    flanger: clamp(asNumber(project.fxFlanger, DEFAULT_FX.flanger), 0, 1),
    reverb: clamp(asNumber(project.fxReverb, DEFAULT_FX.reverb), 0, 1),
    mix: clamp(asNumber(project.fxMix, DEFAULT_FX.mix), 0, 1),
    sidechain: {
      enabled: Boolean(project.sidechainOn ?? project.pumpChordsEnabled),
      amount: clamp(asNumber(project.sidechainAmount ?? project.pumpAmount, DEFAULT_FX.sidechain.amount), 0, 1)
    },
    lofiTexture: lofi.texture
  };
}

function normaliseSequence(value, sections) {
  const source = normaliseSequenceIds(value);
  const sequence = (source.length ? source : ["A"]).slice(0, MAX_SEQUENCE_SLOTS);
  return sequence.length ? sequence : SECTION_IDS.filter((id) => sections[id]?.active).slice(0, 1);
}

function normaliseSequenceIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "A").toUpperCase()).filter((id) => SECTION_IDS.includes(id));
}

function normaliseSectionBars(value) {
  const out = {};
  SECTION_IDS.forEach((id) => {
    out[id] = clamp(asInt(value?.[id], 4), 1, 16);
  });
  return out;
}

function normaliseMelodyTracks(value, steps) {
  const source = Array.isArray(value) && value.length ? value : [new Array(steps).fill(null)];
  return source.slice(0, 8).map((track) => fitArray(track, steps, null, (note) => normaliseMaybeNote(note, 23)));
}

function normaliseTupletLanes(value, steps) {
  return {
    kick: fitArray(value?.kick, steps, false, Boolean),
    snare: fitArray(value?.snare, steps, false, Boolean),
    hat: fitArray(value?.hat, steps, false, Boolean),
    bass: fitArray(value?.bass, steps, false, Boolean)
  };
}

function fitArray(value, length, fallback, normaliser = (item) => item) {
  const out = new Array(length).fill(fallback);
  const source = Array.isArray(value) ? value : [];
  for (let index = 0; index < Math.min(length, source.length); index += 1) {
    out[index] = normaliser(source[index]);
  }
  return out;
}

function hasAnyHits(grid) {
  return ["kick", "snare", "hat", "bass"].some((lane) => Array.isArray(grid?.[lane]) && grid[lane].some((value) => normaliseBeat(value) > 0));
}

function progressionDiffers(value) {
  if (!Array.isArray(value)) return false;
  return value.some((item, index) => clamp(asInt(item, DEFAULT_PROGRESSION[index] ?? 0), 0, 6) !== (DEFAULT_PROGRESSION[index] ?? 0));
}

function normaliseBeat(value) {
  return clamp(asInt(value, 0), 0, 2);
}

function normaliseMaybeNote(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const note = asInt(value, -1);
  return note < 0 ? null : clamp(note, 0, max);
}

function normaliseGuitarArticulation(value) {
  const safe = String(value || "off").toLowerCase();
  return safeChoice(safe, POCKET_GUITAR_ARTICULATIONS, "off");
}

function safeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function asInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function asNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeResolution(value) {
  return safeChoice(asInt(value, DEFAULT_RESOLUTION), [1, 2, 3, 4, 6, 8, 12, 16], DEFAULT_RESOLUTION);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
