import { NOTES } from "../constants.js";

/**
 * @typedef {{ degree: number, rootPc: number, quality: string, intervals: number[] }} ChordsmithChord
 */

export function chordsmithNoteIndex(note = "C") {
  const index = NOTES.indexOf(note);
  return index >= 0 ? index : 0;
}

export function chordsmithScalePitchClasses({ key = "C", scale = "major" } = {}) {
  const root = chordsmithNoteIndex(key);
  const intervals = scale === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return intervals.map((interval) => (root + interval + 12) % 12);
}

export function chordsmithChordQuality(scale = "major", degree = 0) {
  const safe = clampInt(degree, 0, 6);
  return scale === "minor"
    ? ["min", "dim", "maj", "min", "min", "maj", "maj"][safe]
    : ["maj", "min", "min", "maj", "maj", "min", "dim"][safe];
}

export function chordsmithChordIntervals({ chordType = "triad", quality = "maj" } = {}) {
  if (chordType === "sus2") return [0, 2, 7];
  if (chordType === "sus4") return [0, 5, 7];
  if (chordType === "seventh") {
    if (quality === "maj") return [0, 4, 7, 11];
    if (quality === "min") return [0, 3, 7, 10];
    return [0, 3, 6, 10];
  }
  if (quality === "min") return [0, 3, 7];
  if (quality === "dim") return [0, 3, 6];
  return [0, 4, 7];
}

/**
 * @returns {ChordsmithChord}
 */
export function chordsmithChordForStep({
  key = "C",
  scale = "major",
  chordType = "triad",
  timeSig = 4,
  resolution = 4,
  progression = [0, 4, 5, 3],
  step = 0
} = {}) {
  const stepsPerBar = Math.max(1, Number(timeSig) || 4) * Math.max(1, Number(resolution) || 4);
  const bar = Math.floor(Math.max(0, Number(step) || 0) / stepsPerBar);
  const degree = clampInt(progression?.[bar] ?? 0, 0, 6);
  const rootPc = chordsmithScalePitchClasses({ key, scale })[degree];
  const quality = chordsmithChordQuality(scale, degree);
  return {
    degree,
    rootPc,
    quality,
    intervals: chordsmithChordIntervals({ chordType, quality })
  };
}

/**
 * @param {{ chord?: ChordsmithChord, chordOctave?: number, chordPlayMode?: string }} options
 * @returns {number[]}
 */
export function chordsmithChordMidiNotes({ chord, chordOctave = 0, chordPlayMode = "block" } = {}) {
  const root = 48 + clampInt(chord?.rootPc ?? 0, 0, 11) + (Number(chordOctave) || 0) * 12;
  const notes = (Array.isArray(chord?.intervals) ? chord.intervals : [0, 4, 7])
    .map((interval, index) => root + interval + (index === 0 ? 0 : 12));
  return chordPlayMode === "strum_down" || chordPlayMode === "arp_down" ? notes.reverse() : notes;
}

export function chordsmithPowerChordNotes({ rootPc = 0, guitarRegister = "low" } = {}) {
  const min = guitarRegister === "high" ? 52 : guitarRegister === "mid" ? 45 : 35;
  const max = guitarRegister === "high" ? 64 : guitarRegister === "mid" ? 57 : 47;
  let root = 24 + clampInt(rootPc, 0, 11);
  while (root < min) root += 12;
  while (root > max) root -= 12;
  return [root, root + 7, root + 12].map((note) => clampInt(note, 0, 127));
}

export function chordsmithMelodyIndexToMidi({
  key = "C",
  scale = "major",
  melodyPitchMode = "scale",
  noteIndex = 0,
  octave = 0
} = {}) {
  const max = melodyPitchMode === "chromatic" ? 23 : 13;
  const safe = clampInt(noteIndex, 0, max);
  if (melodyPitchMode === "chromatic") return 72 + (safe % 12) + (Math.floor(safe / 12) + (Number(octave) || 0)) * 12;
  const pcs = chordsmithScalePitchClasses({ key, scale });
  return 72 + pcs[safe % 7] + (Math.floor(safe / 7) + (Number(octave) || 0)) * 12;
}

export function chordsmithBassIndexToMidi({ key = "C", scale = "major", noteIndex = 0 } = {}) {
  const safe = clampInt(noteIndex, 0, 13);
  const pcs = chordsmithScalePitchClasses({ key, scale });
  return 36 + pcs[safe % 7] + Math.floor(safe / 7) * 12;
}

export function chordsmithAutoBassMidi({ rootPc = 0 } = {}) {
  return 36 + clampInt(rootPc, 0, 11);
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}
