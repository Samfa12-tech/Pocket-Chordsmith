import { NOTES } from "../constants.js";

export function noteIndex(note) {
  const index = NOTES.indexOf(note);
  return index >= 0 ? index : 0;
}

export function scalePitchClasses(key = "C", scale = "major") {
  const root = noteIndex(key);
  const intervals = scale === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return intervals.map((interval) => (root + interval) % 12);
}

export function scaleDegreeToMidi(project, degree, octaveBase = 60) {
  const pcs = scalePitchClasses(project?.meta?.key, project?.meta?.scale);
  const safe = Math.max(0, Math.min(13, Number.parseInt(degree, 10) || 0));
  return octaveBase + pcs[safe % 7] + Math.floor(safe / 7) * 12;
}
