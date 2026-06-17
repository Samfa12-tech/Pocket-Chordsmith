import {
  CORE_PROJECT_VERSION,
  DEFAULT_BPM,
  DEFAULT_FX,
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
import { migratePocketChordsmithProject } from "./migrations.js";

export function normalisePocketChordsmithProject(raw, options = {}) {
  const { project, sourceSchemaVersion, migrationNotes } = migratePocketChordsmithProject(raw);
  const lofi = normaliseLofiProjectSettings(project);
  const timeSig = safeChoice(asInt(project.timeSig, DEFAULT_TIME_SIG), [3, 4, 5, 6, 7], DEFAULT_TIME_SIG);
  const resolution = sanitizeResolution(project.resolution ?? project.lastAdvancedResolution ?? DEFAULT_RESOLUTION);
  const sectionBars = normaliseSectionBars(project.sectionBars || project.sectionLengths);
  const sections = {};
  SECTION_IDS.forEach((id) => {
    sections[id] = normaliseSection(project, id, { timeSig, resolution, sectionBars });
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
      audioProfile: lofi.audioProfile,
      stylePreset: lofi.presetId || ""
    },
    lofi,
    transport: {
      scope: "sequence",
      currentSection: sequence[0] || "A"
    },
    mixer: {
      masterVolume: clamp(asNumber(project.masterVolume ?? project.masterVol, 0.82), 0, 1),
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
  const melodyTracks = normaliseMelodyTracks(project[`melodyTracks${id}`] || project[`melody${id}`], steps);
  const guitarPattern = fitArray(project[`guitarPattern${id}`] || project[`rockGuitar${id}`], steps, "off", normaliseGuitarArticulation);
  const active = id === "A" || hasAnyHits(grid) || melodyTracks.some((track) => track.some((note) => note !== null)) || guitarPattern.some((step) => step !== "off");
  return {
    id,
    bars: context.sectionBars[id],
    active,
    progression: fitArray(project[`progression${id}`], Math.max(1, context.sectionBars[id]), 0, (value) => clamp(asInt(value, 0), 0, 6)),
    drums: {
      kick: fitArray(grid.kick, steps, 0, normaliseBeat),
      snare: fitArray(grid.snare, steps, 0, normaliseBeat),
      hat: fitArray(grid.hat, steps, 0, normaliseBeat)
    },
    drumTuplets: normaliseTupletLanes(project[`gridTuplets${id}`], steps),
    bass: {
      mode: safeChoice(project.bassMode, ["auto", "manual"], "auto"),
      grid: fitArray(grid.bass, steps, 0, normaliseBeat),
      notes: fitArray(project[`bassNotes${id}`], steps, null, (value) => normaliseMaybeNote(value, 13)),
      hold: fitArray(project[`bassHold${id}`], steps, false, Boolean),
      slide: fitArray(project[`bassSlide${id}`], steps, false, Boolean),
      accent: fitArray(project[`bassAccent${id}`], steps, false, Boolean)
    },
    chords: {
      enabled: project.chordsOn !== false,
      instrument: String(project.chordInstrument || "pocket"),
      type: safeChoice(project.chordType, ["triad", "seventh", "sus2", "sus4"], "triad"),
      playMode: String(project.chordPlayMode || "block"),
      rhythmMode: String(project.chordRhythmMode || "sustain"),
      octave: clamp(asInt(project.chordOctave, 0), -2, 2)
    },
    melody: melodyTracks.map((notes, index) => ({
      notes,
      instrument: String((project[`melodyInstruments${id}`] || [])[index] || "pulse"),
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
      tone: String(project.guitarTone || "high_gain"),
      register: String(project.guitarRegister || "low"),
      strumMode: String(project.guitarStrumMode || "down"),
      volume: clamp(asNumber(project.guitarVolume, 0.66), 0, 1),
      pattern: guitarPattern
    }
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
  const source = Array.isArray(value) ? value : ["A"];
  const sequence = source.map((item) => String(item || "A").toUpperCase()).filter((id) => SECTION_IDS.includes(id)).slice(0, MAX_SEQUENCE_SLOTS);
  return sequence.length ? sequence : SECTION_IDS.filter((id) => sections[id]?.active).slice(0, 1);
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
  return ["off", "open", "chug", "accent", "hold", "scratch"].includes(safe) ? safe : "off";
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
