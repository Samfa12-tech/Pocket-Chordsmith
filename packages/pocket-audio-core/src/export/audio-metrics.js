export function analyseRenderedBuffer(rendered) {
  const channels = rendered.channels || [];
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  let zeroCrossings = 0;
  let clippedSamples = 0;
  let nanSamples = 0;
  let infiniteSamples = 0;
  const sums = channels.map(() => 0);
  const startThreshold = dbToAmp(-60);
  let firstAudibleFrame = null;
  let lastAudibleFrame = null;
  const hash = createFnv1a();
  channels.forEach((channel, channelIndex) => {
    let previous = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const raw = channel[index];
      if (Number.isNaN(raw)) nanSamples += 1;
      if (raw === Infinity || raw === -Infinity) infiniteSamples += 1;
      const finite = Number.isFinite(raw) ? raw : 0;
      const abs = Math.abs(finite);
      if (abs >= 1) clippedSamples += 1;
      const sample = Math.max(-1, Math.min(1, finite));
      peak = Math.max(peak, abs);
      sumSquares += finite * finite;
      sums[channelIndex] += finite;
      count += 1;
      if (index > 0 && Math.sign(sample) !== Math.sign(previous)) zeroCrossings += 1;
      previous = sample;
      if (abs >= startThreshold) {
        if (firstAudibleFrame === null || index < firstAudibleFrame) firstAudibleFrame = index;
        if (lastAudibleFrame === null || index > lastAudibleFrame) lastAudibleFrame = index;
      }
      hash.update(Math.round(sample * 32767));
    }
  });
  const rms = Math.sqrt(sumSquares / Math.max(1, count));
  const sampleRate = rendered.sampleRate || 44100;
  const frameCount = Math.max(0, channels[0]?.length || 0);
  const truePeak = estimateTruePeak(channels, peak, nanSamples + infiniteSamples > 0);
  const spectralBalance = estimateSpectralBalance(channels, sampleRate);
  const left = channels[0] || new Float32Array(0);
  const right = channels[1] || left;
  const stereoCorrelation = estimateStereoCorrelation(left, right);
  const durationSeconds = Number.isFinite(rendered.duration) ? rendered.duration : frameCount / sampleRate;
  return {
    durationSeconds: round(durationSeconds),
    sampleRate,
    channelCount: channels.length,
    eventCount: rendered.eventCount,
    peak: round(peak),
    samplePeakDbfs: ampToDb(peak),
    truePeakDbtp: ampToDb(truePeak),
    estimatedTruePeakDbtp: ampToDb(truePeak),
    truePeakMethod: "estimated_blackman_sinc_4x32_v3",
    intersampleRisk: truePeak > peak + dbToAmp(-60),
    rms: round(rms),
    rmsDbfs: ampToDb(rms),
    integratedLufs: estimateIntegratedLufs(channels, sampleRate),
    lufsMethod: "estimated_bs1770_k_weighted_gated_v3",
    meteringStatus: "estimated_pending_external_calibration",
    crestFactorDb: rms > 0 ? round(ampToDb(peak / rms)) : null,
    clippedSamples,
    nanSamples,
    infiniteSamples,
    nonFiniteSamples: nanSamples + infiniteSamples,
    dcOffsetL: round(sums[0] / Math.max(1, left.length)),
    dcOffsetR: round((sums[1] ?? sums[0] ?? 0) / Math.max(1, right.length)),
    stereoCorrelation,
    silenceAtStartMs: firstAudibleFrame === null ? round(durationSeconds * 1000) : round((firstAudibleFrame / sampleRate) * 1000),
    tailSeconds: lastAudibleFrame === null ? 0 : round(Math.max(0, durationSeconds - lastAudibleFrame / sampleRate)),
    spectralBalance,
    zeroCrossingRate: round(zeroCrossings / Math.max(1, count)),
    quantizedSampleHash: hash.digest()
  };
}

export function analyseAudioChannels({ channels, sampleRate = 44100, duration, eventCount = 0 }) {
  return analyseRenderedBuffer({ channels, sampleRate, duration: duration ?? ((channels?.[0]?.length || 0) / sampleRate), eventCount });
}

function round(value) {
  if (value === null || value === undefined) return value;
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1000000) / 1000000;
}

function ampToDb(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return round(20 * Math.log10(value));
}

function dbToAmp(db) {
  return Math.pow(10, db / 20);
}

const TRUE_PEAK_RADIUS = 16;
const TRUE_PEAK_KERNELS = [0.25, 0.5, 0.75].map(fraction => {
  const coefficients = Float64Array.from({ length: TRUE_PEAK_RADIUS * 2 }, (_, tap) => {
    const distance = fraction - (tap + 1 - TRUE_PEAK_RADIUS);
    if (Math.abs(distance) >= TRUE_PEAK_RADIUS) return 0;
    const sinc = Math.abs(distance) < 1e-12 ? 1 : Math.sin(Math.PI * distance) / (Math.PI * distance);
    const window = 0.42 + 0.5 * Math.cos(Math.PI * distance / TRUE_PEAK_RADIUS) + 0.08 * Math.cos(2 * Math.PI * distance / TRUE_PEAK_RADIUS);
    return sinc * window;
  });
  const sum = coefficients.reduce((total, coefficient) => total + coefficient, 0);
  return coefficients.map(coefficient => coefficient / sum);
});

function estimateTruePeak(channels, samplePeak, hasNonFinite) {
  let peak = samplePeak;
  for (const channel of channels) {
    if (!channel.length) continue;
    for (let index = 0; index < channel.length; index += 1) {
      const interior = index >= TRUE_PEAK_RADIUS - 1 && index + TRUE_PEAK_RADIUS < channel.length;
      for (const coefficients of TRUE_PEAK_KERNELS) {
        let interpolated = 0;
        for (let tap = 0; tap < coefficients.length; tap += 1) {
          const sourceIndex = index + tap + 1 - TRUE_PEAK_RADIUS;
          const value = channel[interior ? sourceIndex : mirrorIndex(sourceIndex, channel.length)];
          interpolated += (hasNonFinite && !Number.isFinite(value) ? 0 : value) * coefficients[tap];
        }
        peak = Math.max(peak, Math.abs(interpolated));
      }
    }
  }
  return peak;
}

function mirrorIndex(index, length) {
  if (length <= 1) return 0;
  const period = 2 * (length - 1);
  const folded = ((index % period) + period) % period;
  return folded < length ? folded : period - folded;
}

function estimateIntegratedLufs(channels, sampleRate) {
  const weighted = channels.map((channel) => applyKWeighting(channel, sampleRate));
  const blockSize = Math.max(1, Math.round(sampleRate * 0.4));
  const hopSize = Math.max(1, Math.round(sampleRate * 0.1));
  const blockPowers = [];
  const frameCount = weighted[0]?.length || 0;
  if (frameCount < blockSize) return null;
  for (let start = 0; start <= frameCount - blockSize; start += hopSize) {
    let channelPowerSum = 0;
    weighted.forEach((channel, channelIndex) => {
      const channelWeight = channelIndex >= 3 ? 1.41 : 1;
      let sum = 0;
      for (let index = start; index < start + blockSize; index += 1) {
        const sample = Number.isFinite(channel[index]) ? channel[index] : 0;
        sum += sample * sample;
      }
      channelPowerSum += channelWeight * (sum / blockSize);
    });
    const lufs = loudnessFromPower(channelPowerSum);
    if (lufs >= -70) blockPowers.push(channelPowerSum);
  }
  if (!blockPowers.length) return null;
  const ungated = blockPowers.reduce((sum, value) => sum + value, 0) / blockPowers.length;
  const relativeGate = loudnessFromPower(ungated) - 10;
  const gated = blockPowers.filter((value) => loudnessFromPower(value) >= relativeGate);
  const mean = (gated.length ? gated : blockPowers).reduce((sum, value) => sum + value, 0) / Math.max(1, (gated.length ? gated : blockPowers).length);
  return round(loudnessFromPower(mean));
}

function loudnessFromPower(power) {
  return -0.691 + 10 * Math.log10(Math.max(1e-20, power));
}

function applyKWeighting(channel, sampleRate) {
  const highShelf = kWeightingShelf(sampleRate);
  const highPass = designHighPass(sampleRate, 38.13547087613982, 0.5003270373238773);
  return applyBiquad(applyBiquad(channel, highShelf), highPass);
}

function applyBiquad(channel, coeffs) {
  const out = new Float32Array(channel.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const x0 = Number.isFinite(channel[index]) ? channel[index] : 0;
    const y0 = coeffs.b0 * x0 + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    out[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function kWeightingShelf(sampleRate) {
  // ITU-R BS.1770-5 Annex1/Table1 coefficient facts at48kHz. Re-express
  // the transfer polynomial through a prewarped bilinear rate transform.
  // This is measurement filtering, not a shelf inserted into rendered audio.
  const b = [1.53512485958697, -2.69169618940638, 1.19839281085285];
  const a = [1, -1.69065929318241, 0.73248077421585];
  const hz = 1681.974450955533;
  const ratio = Math.tan(Math.PI * hz / 48000) / Math.tan(Math.PI * hz / sampleRate);
  const transform = ([c0, c1, c2]) => {
    const constant = c0 + c1 + c2;
    const linear = 2 * (c0 - c2) * ratio;
    const square = (c0 - c1 + c2) * ratio * ratio;
    return [constant + linear + square, 2 * constant - 2 * square, constant - linear + square];
  };
  const [b0, b1, b2] = transform(b);
  const [a0, a1, a2] = transform(a);
  return normalizeBiquad({ b0, b1, b2, a0, a1, a2 });
}

function designHighPass(sampleRate, hz, q) {
  const k = Math.tan(Math.PI * hz / sampleRate);
  const denominator = 1 + k / q + k * k;
  // RLB weighting retains its [1,-2,1] numerator; a unity-gain audio
  // high-pass normalization changes the loudness measurement.
  return { b0: 1, b1: -2, b2: 1, a1: 2 * (k * k - 1) / denominator, a2: (1 - k / q + k * k) / denominator };
}

function normalizeBiquad({ b0, b1, b2, a0, a1, a2 }) {
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0
  };
}

function estimateStereoCorrelation(left, right) {
  const length = Math.min(left.length, right.length);
  if (!length) return null;
  let sumL = 0;
  let sumR = 0;
  let sumLL = 0;
  let sumRR = 0;
  let sumLR = 0;
  for (let index = 0; index < length; index += 1) {
    const l = Number.isFinite(left[index]) ? left[index] : 0;
    const r = Number.isFinite(right[index]) ? right[index] : 0;
    sumL += l;
    sumR += r;
    sumLL += l * l;
    sumRR += r * r;
    sumLR += l * r;
  }
  const cov = sumLR - (sumL * sumR) / length;
  const varL = sumLL - (sumL * sumL) / length;
  const varR = sumRR - (sumR * sumR) / length;
  const denom = Math.sqrt(Math.max(0, varL * varR));
  return denom > 0 ? round(cov / denom) : null;
}

function estimateSpectralBalance(channels, sampleRate) {
  const mono = channels[0] || new Float32Array(0);
  const length = Math.min(mono.length, 8192);
  if (!length) return {};
  const start = Math.max(0, Math.floor((mono.length - length) / 2));
  const centers = {
    sub: 50,
    bass: 120,
    lowMid: 350,
    mid: 1000,
    presence: 3500,
    air: 9000
  };
  const out = {};
  for (const [band, hz] of Object.entries(centers)) {
    const power = goertzelPower(mono, start, length, hz, sampleRate);
    out[band] = ampToDb(Math.sqrt(power));
  }
  return out;
}

function goertzelPower(data, start, length, hz, sampleRate) {
  const k = Math.round((length * hz) / sampleRate);
  const omega = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = Number.isFinite(data[start + index]) ? data[start + index] : 0;
    q0 = coeff * q1 - q2 + sample;
    q2 = q1;
    q1 = q0;
  }
  return Math.max(0, (q1 * q1 + q2 * q2 - q1 * q2 * coeff) / (length * length));
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
