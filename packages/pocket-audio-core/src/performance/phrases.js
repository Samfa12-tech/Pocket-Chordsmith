export const CHORDSMITH_PHRASE_GATES = Object.freeze({
  minimumSeconds: 0.18,
  bassMul: 0.94,
  melodyMul: 0.92
});

export function chordsmithPhraseDuration(duration, role = "melody") {
  const total = Math.max(0, Number(duration) || 0);
  const mul = role === "bass" ? CHORDSMITH_PHRASE_GATES.bassMul : CHORDSMITH_PHRASE_GATES.melodyMul;
  return Math.max(CHORDSMITH_PHRASE_GATES.minimumSeconds, total * mul);
}

/**
 * @param {{
 *   step?: number,
 *   totalSteps?: number,
 *   role?: string,
 *   stepDurationAt?: (step: number) => number,
 *   holdAt?: (step: number) => boolean,
 *   slideAt?: (step: number) => boolean
 * }} options
 */
export function chordsmithPhraseInfo({
  step = 0,
  totalSteps = 0,
  role = "melody",
  stepDurationAt = () => 0,
  holdAt = () => false,
  slideAt = () => false
} = {}) {
  let duration = 0;
  let index = Math.max(0, Number(step) || 0);
  const maxSteps = Math.max(0, Number(totalSteps) || 0);
  do {
    duration += Math.max(0, Number(stepDurationAt(index)) || 0);
    index += 1;
  } while (index < maxSteps && holdAt(index));

  let slideStep = null;
  let slideOffset = null;
  if (index < maxSteps && slideAt(index)) {
    slideStep = index;
    slideOffset = duration;
    do {
      duration += Math.max(0, Number(stepDurationAt(index)) || 0);
      index += 1;
    } while (index < maxSteps && holdAt(index));
  }

  return {
    duration: chordsmithPhraseDuration(duration, role),
    rawDuration: duration,
    slideStep,
    slideOffset
  };
}
