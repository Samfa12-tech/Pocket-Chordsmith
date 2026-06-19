import { chordsmithChordIntervals, chordsmithChordQuality, chordsmithScalePitchClasses } from "./pitches.js";

export function chordQuality(scale, degree) {
  return chordsmithChordQuality(scale, degree);
}

export function chordIntervals(type = "triad", quality = "maj") {
  return chordsmithChordIntervals({ chordType: type, quality });
}

export function chordMidiNotes(project, degree, octave = 0) {
  const pcs = chordsmithScalePitchClasses({ key: project?.meta?.key, scale: project?.meta?.scale });
  const safeDegree = Math.max(0, Math.min(6, Number.parseInt(degree, 10) || 0));
  const quality = chordQuality(project?.meta?.scale, safeDegree);
  const root = 48 + pcs[safeDegree] + octave * 12;
  return chordIntervals(project?.sections?.A?.chords?.type || "triad", quality).map((interval, index) => root + interval + (index === 0 ? 0 : 12));
}
