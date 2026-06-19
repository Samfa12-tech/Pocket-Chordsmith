export const CHORDSMITH_GUITAR_GATE_SECONDS = Object.freeze({
  chugFloor: 0.055,
  chugCeiling: 0.16,
  chugStepMul: 0.58,
  scratchFloor: 0.035,
  scratchCeiling: 0.075,
  scratchStepMul: 0.42,
  sustainFloor: 0.16,
  sustainCeiling: 1.8,
  openMul: 0.92,
  accentMul: 0.98
});

/**
 * @param {{ stepDuration?: number, heldDuration?: number, articulation?: string }} options
 */
export function chordsmithGuitarStepDuration({ stepDuration, heldDuration = stepDuration, articulation = "open" } = {}) {
  const stepDur = Math.max(0, Number(stepDuration) || 0);
  const heldDur = Math.max(0, Number(heldDuration) || stepDur);
  const art = String(articulation || "open");
  if (art === "chug") {
    return clamp(
      stepDur * CHORDSMITH_GUITAR_GATE_SECONDS.chugStepMul,
      CHORDSMITH_GUITAR_GATE_SECONDS.chugFloor,
      CHORDSMITH_GUITAR_GATE_SECONDS.chugCeiling
    );
  }
  if (art === "scratch") {
    return clamp(
      stepDur * CHORDSMITH_GUITAR_GATE_SECONDS.scratchStepMul,
      CHORDSMITH_GUITAR_GATE_SECONDS.scratchFloor,
      CHORDSMITH_GUITAR_GATE_SECONDS.scratchCeiling
    );
  }
  return clamp(
    heldDur * (art === "accent" ? CHORDSMITH_GUITAR_GATE_SECONDS.accentMul : CHORDSMITH_GUITAR_GATE_SECONDS.openMul),
    CHORDSMITH_GUITAR_GATE_SECONDS.sustainFloor,
    CHORDSMITH_GUITAR_GATE_SECONDS.sustainCeiling
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
