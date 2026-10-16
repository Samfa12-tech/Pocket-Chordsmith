export const CALIBRATION_RATES = [16000, 22050, 44100, 48000, 88200, 96000, 192000];
export const CALIBRATION_TOLERANCES = { integratedLufs: 0.15, truePeakDbtp: 0.2 };

export function meterCalibrationFixtures(sampleRate) {
  const fixture = (id, seconds, count, sample) => ({
    id, sampleRate,
    // Original fixture PCM uses an exact binary grid before hashing, avoiding
    // dependence on insignificant last-bit Math.sin differences across runtimes.
    channels: Array.from({ length: count }, (_, channel) => Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, frame) => {
      const value = Math.round(sample(frame, channel, frame / sampleRate) * 1048576) / 1048576;
      return value === 0 ? 0 : value;
    }))
  });
  const sine = (frequency, time, phase = 0) => Math.sin(2 * Math.PI * frequency * time + phase);
  return [
    fixture("silence", 3, 1, () => 0),
    fixture("short-120ms", 0.12, 1, (_frame, _channel, time) => 0.2 * sine(1000, time)),
    fixture("tone-1khz", 3, 2, (_frame, channel, time) => 0.2 * sine(1000, time, channel * 0.3)),
    fixture("gated-loud-quiet", 4, 2, (_frame, _channel, time) => (time < 1 ? 0 : time < 2 || time >= 3 ? 0.3 : 0.001) * sine(440, time)),
    fixture("intersample-quarter-rate", 3, 2, (_frame, _channel, time) => 0.98 * sine(sampleRate / 4, time, Math.PI / 4)),
    fixture("intersample-overload-interior", 3, 2, (_frame, _channel, time) => 1.2 * Math.max(0, Math.min(1, time / 0.02, (3 - time) / 0.02)) * sine(sampleRate / 4, time, Math.PI / 4)),
    fixture("sparse-transients", 3, 2, (frame, channel) => frame % Math.round(sampleRate * 0.3) === 0 ? (channel ? -0.85 : 0.85) : 0),
    fixture("stereo-antiphase", 3, 2, (_frame, channel, time) => (channel ? -0.25 : 0.25) * sine(220, time)),
    fixture("multiband-phase", 3, 2, (_frame, channel, time) =>
      0.15 * sine(71, time, channel * 0.7) + 0.1 * sine(997, time, 0.21) + 0.09 * sine(Math.min(8501, sampleRate * 0.41), time, channel * 1.2))
  ];
}

export function parseEbur128Summary(text) {
  const index = text.lastIndexOf("Summary:");
  if (index < 0) throw new Error("Reference did not return a final EBU R128 summary.");
  const summary = text.slice(index);
  const integrated = summary.match(/Integrated loudness:\s*I:\s*(-?\d+(?:\.\d+)?)\s+LUFS/);
  const peak = summary.match(/True peak:\s*Peak:\s*(-?(?:inf|\d+(?:\.\d+)?))\s+dBFS/i);
  if (!integrated || !peak) throw new Error("Reference summary is missing integrated loudness or true peak.");
  const integratedLufs = Number(integrated[1]);
  return { integratedLufs: integratedLufs <= -70 ? null : integratedLufs, truePeakDbtp: /inf/i.test(peak[1]) ? null : Number(peak[1]) };
}

export function compareMeterReadings(core, reference) {
  const error = (actual, expected) => actual === null && expected === null ? 0 : Number.isFinite(actual) && Number.isFinite(expected) ? Math.abs(actual - expected) : null;
  const integratedLufsError = error(core.integratedLufs, reference.integratedLufs);
  const truePeakError = error(core.truePeakDbtp, reference.truePeakDbtp);
  return {
    integratedLufsError, truePeakError,
    loudnessPassed: integratedLufsError !== null && integratedLufsError <= CALIBRATION_TOLERANCES.integratedLufs,
    truePeakPassed: truePeakError !== null && truePeakError <= CALIBRATION_TOLERANCES.truePeakDbtp
  };
}

export function parseOversampledPeak(text) {
  const values = [...text.matchAll(/Peak level dB:\s*(-?(?:inf|\d+(?:\.\d+)?))/gi)];
  if (!values.length) throw new Error("Reference is missing the explicit4x oversampled peak.");
  return /inf/i.test(values.at(-1)[1]) ? null : Number(values.at(-1)[1]);
}
