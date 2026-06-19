export const CHORDSMITH_PITCHED_TUPLET = Object.freeze({
  gateFloorSeconds: 0.08,
  gateSpanMul: 0.86
});

export function chordsmithPitchedTupletDuration(spanDuration = 0) {
  return Math.max(
    CHORDSMITH_PITCHED_TUPLET.gateFloorSeconds,
    (Math.max(0, Number(spanDuration) || 0) / 3) * CHORDSMITH_PITCHED_TUPLET.gateSpanMul
  );
}

export function chordsmithPitchedTupletMiddleMidi(leftMidi, rightMidi) {
  if (leftMidi === null || leftMidi === undefined) return null;
  if (rightMidi === null || rightMidi === undefined) return leftMidi;
  return Math.round((Number(leftMidi) + Number(rightMidi)) / 2);
}

export function chordsmithPitchedTupletMiddleIndex(leftIndex, rightIndex, { melodyPitchMode = "scale" } = {}) {
  const left = Math.max(0, Number(leftIndex) || 0);
  const right = Math.max(0, Number(rightIndex) || 0);
  const midpoint = Math.round((left + right) / 2);
  return Math.max(0, Math.min(melodyPitchMode === "chromatic" ? 23 : 13, midpoint));
}
