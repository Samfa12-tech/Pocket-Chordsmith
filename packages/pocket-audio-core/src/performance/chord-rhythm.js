export const CHORDSMITH_CHORD_PLAY_MODES = Object.freeze([
  "block",
  "strum_up",
  "strum_down",
  "arp_up",
  "arp_down"
]);

export const CHORDSMITH_CHORD_RHYTHM_MODES = Object.freeze([
  "sustain",
  "quarter",
  "half"
]);

export const CHORDSMITH_CHORD_RHYTHM = Object.freeze({
  quarterGate: 0.9,
  halfGate: 1.8,
  halfThreeFourOffset: 1.5,
  halfThreeFourGate: 1.2,
  sustainGate: 0.92
});

/**
 * @param {{ mode?: string, barStart?: number, beatDuration?: number, timeSig?: number }} options
 * @returns {Array<[number, number]>}
 */
export function chordsmithChordRhythmStarts({ mode = "sustain", barStart = 0, beatDuration = 0, timeSig = 4 } = {}) {
  const start = Number(barStart) || 0;
  const beat = Math.max(0, Number(beatDuration) || 0);
  const beats = Math.max(1, Math.floor(Number(timeSig) || 4));
  if (mode === "quarter") {
    return Array.from({ length: beats }, (_, index) => [
      start + index * beat,
      beat * CHORDSMITH_CHORD_RHYTHM.quarterGate
    ]);
  }
  if (mode === "half") {
    const out = [[start, beat * CHORDSMITH_CHORD_RHYTHM.halfGate]];
    if (beats >= 4) out.push([start + beat * 2, beat * CHORDSMITH_CHORD_RHYTHM.halfGate]);
    else if (beats === 3) {
      out.push([
        start + beat * CHORDSMITH_CHORD_RHYTHM.halfThreeFourOffset,
        beat * CHORDSMITH_CHORD_RHYTHM.halfThreeFourGate
      ]);
    }
    return out;
  }
  return [[start, beat * beats * CHORDSMITH_CHORD_RHYTHM.sustainGate]];
}
