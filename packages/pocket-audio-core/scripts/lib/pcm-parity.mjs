// Measurement helper shared by the rendered verifier and its truncation tests.
// Only latency is aligned. Gain, duration and ending content are never fitted.
export function compareCapturedStereoPcm(actual, reference, sampleRate) {
  const referenceFrames = reference[0]?.length || 0;
  if (!referenceFrames || reference.length !== 2 || reference[1].length !== referenceFrames || actual.length !== 2 || actual[0].length !== actual[1].length) throw new Error("PCM comparison requires aligned stereo channels and a nonempty reference.");
  const actualFrames = actual[0].length;
  const prefixFrames = Math.min(1024, referenceFrames);
  const maxAlignmentFrames = Math.round(sampleRate * 0.5);
  const maxLag = Math.min(maxAlignmentFrames, actualFrames - prefixFrames);
  let bestLag = 0, bestError = Infinity;
  for (let lag = 0; lag <= maxLag; lag += 1) {
    let error = 0;
    for (let frame = 0; frame < prefixFrames; frame += 8) {
      const delta = actual[0][frame + lag] - reference[0][frame];
      error += delta * delta;
    }
    if (error < bestError) { bestError = error; bestLag = lag; }
  }
  const frames = Math.max(0, Math.min(actualFrames - bestLag, referenceFrames));
  const coverageComplete = frames === referenceFrames;
  const tailFrames = Math.min(referenceFrames, Math.round(sampleRate * 0.1));
  const tailStart = referenceFrames - tailFrames;
  let maxError = 0, sumError = 0, peak = 0, invalidSampleCount = 0;
  let tailError = 0, referenceTailEnergy = 0, capturedTailEnergy = 0;
  for (let channel = 0; channel < 2; channel += 1) for (let frame = 0; frame < referenceFrames; frame += 1) {
    const expected = reference[channel][frame];
    if (frame >= tailStart) referenceTailEnergy += expected * expected;
    if (frame >= frames) continue;
    const value = actual[channel][frame + bestLag];
    if (!Number.isFinite(value) || !Number.isFinite(expected)) { invalidSampleCount += 1; continue; }
    const error = Math.abs(value - expected);
    maxError = Math.max(maxError, error);
    sumError += error * error;
    peak = Math.max(peak, Math.abs(value));
    if (frame >= tailStart) {
      tailError += error * error;
      capturedTailEnergy += value * value;
    }
  }
  const rmsError = frames ? Math.sqrt(sumError / (frames * 2)) : Infinity;
  const referenceTailRms = Math.sqrt(referenceTailEnergy / (tailFrames * 2));
  const capturedTailRms = Math.sqrt(capturedTailEnergy / (tailFrames * 2));
  const tailRmsError = Math.sqrt(tailError / (tailFrames * 2));
  const maxSampleError = 8 / 32767;
  const maxRmsError = 2 / 32767;
  // Low-level tails remain governed by the PCM16 absolute error bound. An
  // audible reference ending must also retain its energy within 5% + 2 LSB RMS.
  const tailEnergyRequired = referenceTailRms > 4 / 32767;
  const tailPassed = coverageComplete && tailRmsError < maxRmsError && (!tailEnergyRequired || capturedTailRms >= referenceTailRms * 0.95 - maxRmsError);
  return {
    comparedFrames: frames, referenceFrames, missingReferenceFrames: referenceFrames - frames,
    coverageComplete, alignedLatencyFrames: bestLag, maxAlignmentFrames,
    maxError, rmsError, capturedPeak: peak, invalidSampleCount,
    tail: { frames: tailFrames, referenceRms: referenceTailRms, capturedRms: capturedTailRms, rmsError: tailRmsError, energyRequired: tailEnergyRequired, passed: tailPassed },
    tolerances: { maxSampleError, maxRmsError, maxAlignmentSeconds: 0.5, requiredReferenceCoverage: 1, tailWindowSeconds: 0.1 },
    passed: coverageComplete && invalidSampleCount === 0 && peak > 0.001 && maxError < maxSampleError && rmsError < maxRmsError && tailPassed
  };
}
