import { renderPocketAudioStemBuffers } from "../engine/offline-renderer.js";
import { encodePcm16WavBlob } from "./wav.js";

export async function renderStemPlaceholders({ stems = [], sampleRate = 44100 } = {}) {
  const out = {};
  stems.forEach((stem) => {
    out[stem] = encodePcm16WavBlob({ channels: [new Float32Array(Math.ceil(sampleRate * 0.25)), new Float32Array(Math.ceil(sampleRate * 0.25))], sampleRate });
  });
  return out;
}

export async function renderPocketAudioStems(project, options = {}) {
  const sampleRate = options.sampleRate || 44100;
  const buffers = renderPocketAudioStemBuffers(project, options);
  const out = {};
  Object.entries(buffers).forEach(([stem, buffer]) => {
    out[stem] = encodePcm16WavBlob({ channels: buffer.channels, sampleRate });
  });
  return out;
}
