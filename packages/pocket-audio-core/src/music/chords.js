import { scalePitchClasses } from "./scales.js";

export function chordQuality(scale, degree) {
  const safe = Math.max(0, Math.min(6, Number.parseInt(degree, 10) || 0));
  return scale === "minor"
    ? ["min", "dim", "maj", "min", "min", "maj", "maj"][safe]
    : ["maj", "min", "min", "maj", "maj", "min", "dim"][safe];
}

export function chordIntervals(type = "triad", quality = "maj") {
  if (type === "sus2") return [0, 2, 7];
  if (type === "sus4") return [0, 5, 7];
  if (type === "seventh") {
    if (quality === "maj") return [0, 4, 7, 11];
    if (quality === "min") return [0, 3, 7, 10];
    return [0, 3, 6, 10];
  }
  if (quality === "min") return [0, 3, 7];
  if (quality === "dim") return [0, 3, 6];
  return [0, 4, 7];
}

export function chordMidiNotes(project, degree, octave = 0) {
  const pcs = scalePitchClasses(project?.meta?.key, project?.meta?.scale);
  const safeDegree = Math.max(0, Math.min(6, Number.parseInt(degree, 10) || 0));
  const quality = chordQuality(project?.meta?.scale, safeDegree);
  const root = 48 + pcs[safeDegree] + octave * 12;
  return chordIntervals(project?.sections?.A?.chords?.type || "triad", quality).map((interval, index) => root + interval + (index === 0 ? 0 : 12));
}
