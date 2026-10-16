// Diagnostic acceptance only; mathematical PCM/clock checks are not listening evidence.
export function assertMonitorComparisonEvidence({ maxError, squaredError, clock, switches, rate }) {
  if (!Number.isFinite(maxError) || !Number.isFinite(squaredError) || maxError > 1e-5
      || !Number.isFinite(rate) || rate <= 0 || !Array.isArray(switches) || !switches.length
      || !Array.isArray(clock) || clock.length !== switches.length
      || switches.some(change => !Number.isFinite(change.frame) || !clock.some(item => item.frame === change.frame))
      || clock.some(item => ![item.frame, item.renderedFrameCount, item.positionSeconds, item.generation].every(Number.isFinite)
        || item.frame !== item.renderedFrameCount || Math.abs(item.positionSeconds - item.frame / rate) > 1 / rate || item.generation !== 17)) {
    throw new Error("Monitor lacks finite aligned crossfade/clock evidence");
  }
}
