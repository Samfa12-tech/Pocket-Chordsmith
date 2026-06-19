import { chordsmithNoteIndex, chordsmithScalePitchClasses } from "./pitches.js";

export function noteIndex(note) {
  return chordsmithNoteIndex(note);
}

export function scalePitchClasses(key = "C", scale = "major") {
  return chordsmithScalePitchClasses({ key, scale });
}

export function scaleDegreeToMidi(project, degree, octaveBase = 60) {
  const pcs = scalePitchClasses(project?.meta?.key, project?.meta?.scale);
  const safe = Math.max(0, Math.min(13, Number.parseInt(degree, 10) || 0));
  return octaveBase + pcs[safe % 7] + Math.floor(safe / 7) * 12;
}
