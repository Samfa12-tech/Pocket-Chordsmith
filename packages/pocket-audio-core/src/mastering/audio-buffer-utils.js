export function cloneRenderedBuffer(buffer) {
  return {
    ...buffer,
    channels: (buffer.channels || []).map((channel) => Float32Array.from(channel))
  };
}

export function applyGainToBuffer(buffer, gain) {
  const out = cloneRenderedBuffer(buffer);
  out.channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) channel[index] *= gain;
  });
  return out;
}

export function sumRenderedBuffers(buffers, { sampleRate = 44100 } = {}) {
  const list = buffers.filter(Boolean);
  const frameCount = Math.max(1, ...list.map((buffer) => buffer.channels?.[0]?.length || 0));
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  list.forEach((buffer) => {
    const channels = buffer.channels || [];
    const sourceLeft = channels[0] || new Float32Array(0);
    const sourceRight = channels[1] || sourceLeft;
    for (let index = 0; index < frameCount; index += 1) {
      left[index] += sourceLeft[index] || 0;
      right[index] += sourceRight[index] || 0;
    }
  });
  return {
    channels: [left, right],
    sampleRate: list[0]?.sampleRate || sampleRate,
    duration: frameCount / (list[0]?.sampleRate || sampleRate),
    eventCount: list.reduce((sum, buffer) => sum + Number(buffer.eventCount || 0), 0)
  };
}

export function finiteSampleReport(buffer) {
  let nanSamples = 0;
  let infiniteSamples = 0;
  (buffer.channels || []).forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) {
      const value = channel[index];
      if (Number.isNaN(value)) nanSamples += 1;
      if (value === Infinity || value === -Infinity) infiniteSamples += 1;
    }
  });
  return {
    nanSamples,
    infiniteSamples,
    nonFiniteSamples: nanSamples + infiniteSamples
  };
}

export function sanitizeFileStem(value, fallback = "track") {
  const safe = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe || fallback;
}

export function round(value, places = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
