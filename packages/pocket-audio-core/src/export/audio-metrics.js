export function analyseRenderedBuffer(rendered) {
  const channels = rendered.channels || [];
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  let zeroCrossings = 0;
  let previous = 0;
  const hash = createFnv1a();
  channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index] || 0));
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      count += 1;
      if (index > 0 && Math.sign(sample) !== Math.sign(previous)) zeroCrossings += 1;
      previous = sample;
      hash.update(Math.round(sample * 32767));
    }
  });
  return {
    durationSeconds: round(rendered.duration),
    sampleRate: rendered.sampleRate,
    channelCount: channels.length,
    eventCount: rendered.eventCount,
    peak: round(peak),
    rms: round(Math.sqrt(sumSquares / Math.max(1, count))),
    zeroCrossingRate: round(zeroCrossings / Math.max(1, count)),
    quantizedSampleHash: hash.digest()
  };
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

function createFnv1a() {
  let hash = 0x811c9dc5;
  return {
    update(value) {
      hash ^= value & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash ^= (value >> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    },
    digest() {
      return hash.toString(16).padStart(8, "0");
    }
  };
}
