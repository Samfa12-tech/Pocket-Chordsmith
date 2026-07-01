export function createSilentWavBlob({ durationSeconds = 0.25, sampleRate = 44100, channels = 2 } = {}) {
  const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  return encodePcm16WavBlob({
    channels: Array.from({ length: channels }, () => new Float32Array(frameCount)),
    sampleRate
  });
}

export function encodePcm16WavBlob({ channels, sampleRate = 44100 }) {
  return new Blob([encodePcm16WavBytes({ channels, sampleRate })], { type: "audio/wav" });
}

export function encodePcm16WavBytes({ channels, sampleRate = 44100 }) {
  return encodePcmWavBytes({ channels, sampleRate, bitDepth: 16 });
}

export function encodePcm24WavBlob({ channels, sampleRate = 44100 }) {
  return new Blob([encodePcm24WavBytes({ channels, sampleRate })], { type: "audio/wav" });
}

export function encodePcm24WavBytes({ channels, sampleRate = 44100 }) {
  return encodePcmWavBytes({ channels, sampleRate, bitDepth: 24 });
}

export function encodePcmWavBlob({ channels, sampleRate = 44100, bitDepth = 16, dither = "off" }) {
  return new Blob([encodePcmWavBytes({ channels, sampleRate, bitDepth, dither })], { type: "audio/wav" });
}

export function encodePcmWavBytes({ channels, sampleRate = 44100, bitDepth = 16, dither = "off" }) {
  const channelCount = Math.max(1, channels.length);
  const frameCount = Math.max(1, channels[0]?.length || 1);
  const depth = normaliseBitDepth(bitDepth);
  const bytesPerSample = depth / 8;
  const dataLength = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, depth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  const ditherNoise = dither === "tpdf" && depth === 16 ? createTpdfDither(0x51a7e) : null;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = channels[channel] || channels[0];
      const raw = Number.isFinite(data[frame]) ? data[frame] : 0;
      const sample = Math.max(-1, Math.min(1, raw + (ditherNoise ? ditherNoise() / 0x7fff : 0)));
      writePcmSample(view, offset, sample, depth);
      offset += bytesPerSample;
    }
  }
  return new Uint8Array(buffer);
}

export function decodePcmWavBytes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Expected a RIFF/WAVE file.");
  }
  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + size > bytes.byteLength) throw new Error("Invalid WAV chunk size.");
    if (id === "fmt ") {
      fmt = {
        audioFormat: view.getUint16(payloadOffset, true),
        channels: view.getUint16(payloadOffset + 2, true),
        sampleRate: view.getUint32(payloadOffset + 4, true),
        bitsPerSample: view.getUint16(payloadOffset + 14, true)
      };
    } else if (id === "data") {
      dataOffset = payloadOffset;
      dataSize = size;
      break;
    }
    offset = payloadOffset + size + (size % 2);
  }
  if (!fmt || dataOffset < 0) throw new Error("WAV file is missing fmt or data chunks.");
  if (fmt.audioFormat !== 1 || ![16, 24].includes(fmt.bitsPerSample)) {
    throw new Error(`Unsupported WAV format: format=${fmt.audioFormat} bits=${fmt.bitsPerSample}.`);
  }
  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / (fmt.channels * bytesPerSample));
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      const sampleOffset = dataOffset + (frame * fmt.channels + channel) * bytesPerSample;
      channels[channel][frame] = readPcmSample(view, sampleOffset, fmt.bitsPerSample);
    }
  }
  return {
    channels,
    sampleRate: fmt.sampleRate,
    duration: frameCount / fmt.sampleRate,
    bitDepth: fmt.bitsPerSample
  };
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function readAscii(view, offset, length) {
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(view.getUint8(offset + index));
  return text;
}

function normaliseBitDepth(value) {
  return Number(value) === 24 ? 24 : 16;
}

function writePcmSample(view, offset, sample, bitDepth) {
  if (bitDepth === 24) {
    const scaled = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
    const value = Math.max(-0x800000, Math.min(0x7fffff, scaled));
    const unsigned = value < 0 ? value + 0x1000000 : value;
    view.setUint8(offset, unsigned & 0xff);
    view.setUint8(offset + 1, (unsigned >> 8) & 0xff);
    view.setUint8(offset + 2, (unsigned >> 16) & 0xff);
    return;
  }
  const scaled = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  view.setInt16(offset, Math.max(-0x8000, Math.min(0x7fff, scaled)), true);
}

function readPcmSample(view, offset, bitDepth) {
  if (bitDepth === 24) {
    const raw = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
    return signed / (signed < 0 ? 0x800000 : 0x7fffff);
  }
  const signed = view.getInt16(offset, true);
  return signed / (signed < 0 ? 0x8000 : 0x7fff);
}

function createTpdfDither(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  return () => next() - next();
}
