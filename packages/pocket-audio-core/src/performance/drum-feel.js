export const CHORDSMITH_DRUM_FEEL = Object.freeze({
  peak: Object.freeze({
    kick: Object.freeze({ normal: 0.95, accent: 1.12 }),
    snare: Object.freeze({ normal: 0.5, accent: 0.72 }),
    hat: Object.freeze({ normal: 0.16, accent: 0.24 })
  }),
  gate: Object.freeze({
    kickCeiling: 0.1,
    snareCeiling: 0.08,
    hatClosedCeiling: 0.025,
    hatOpenCeiling: 0.12,
    standardStepMul: 0.7,
    hatAccentStepMul: 0.75,
    tupletCeiling: 0.08,
    hatAccentTupletCeiling: 0.12,
    tupletSpanMul: 0.7
  })
});

export function chordsmithDrumPeak(lane, level = 1) {
  const config = CHORDSMITH_DRUM_FEEL.peak[normaliseDrumLane(lane)];
  return Number(level) > 1 ? config.accent : config.normal;
}

/**
 * @param {{ lane?: string, level?: number, stepDuration?: number }} options
 */
export function chordsmithDrumStepDuration({ lane = "hat", level = 1, stepDuration = 0 } = {}) {
  const drum = normaliseDrumLane(lane);
  const stepDur = Math.max(0, Number(stepDuration) || 0);
  const accent = Number(level) > 1;
  const ceiling = drum === "kick"
    ? CHORDSMITH_DRUM_FEEL.gate.kickCeiling
    : drum === "snare"
      ? CHORDSMITH_DRUM_FEEL.gate.snareCeiling
      : accent
        ? CHORDSMITH_DRUM_FEEL.gate.hatOpenCeiling
        : CHORDSMITH_DRUM_FEEL.gate.hatClosedCeiling;
  const stepMul = drum === "hat" && accent
    ? CHORDSMITH_DRUM_FEEL.gate.hatAccentStepMul
    : CHORDSMITH_DRUM_FEEL.gate.standardStepMul;
  return Math.min(ceiling, stepDur * stepMul);
}

/**
 * @param {{ lane?: string, level?: number, spanDuration?: number }} options
 */
export function chordsmithDrumTupletDuration({ lane = "hat", level = 1, spanDuration = 0 } = {}) {
  const drum = normaliseDrumLane(lane);
  const spanDur = Math.max(0, Number(spanDuration) || 0);
  const ceiling = drum === "hat" && Number(level) > 1
    ? CHORDSMITH_DRUM_FEEL.gate.hatAccentTupletCeiling
    : CHORDSMITH_DRUM_FEEL.gate.tupletCeiling;
  return Math.min(ceiling, spanDur / 3 * CHORDSMITH_DRUM_FEEL.gate.tupletSpanMul);
}

function normaliseDrumLane(lane) {
  if (lane === "kick" || lane === "snare") return lane;
  return "hat";
}
