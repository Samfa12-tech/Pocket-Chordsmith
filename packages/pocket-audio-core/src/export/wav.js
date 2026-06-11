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
  const channelCount = Math.max(1, channels.length);
  const frameCount = Math.max(1, channels[0]?.length || 1);
  const dataLength = frameCount * channelCount * 2;
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
  view.setUint32(28, sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = channels[channel] || channels[0];
      const sample = Math.max(-1, Math.min(1, data[frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}
