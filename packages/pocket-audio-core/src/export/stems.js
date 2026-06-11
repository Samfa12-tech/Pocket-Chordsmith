import { buildPocketAudioTimeline } from "../events/timeline-events.js";
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
  const stems = options.stems || ["drums", "bass", "chords", "melody", "guitar"];
  const timeline = buildPocketAudioTimeline(project, options);
  const duration = timeline.duration + (options.tailSeconds ?? 0.6);
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
  const out = {};
  stems.forEach((stem) => {
    const left = new Float32Array(frameCount);
    const right = new Float32Array(frameCount);
    timeline.events.filter((event) => event.stem === stem).forEach((event) => {
      const start = Math.max(0, Math.floor(event.time * sampleRate));
      const length = Math.max(1, Math.floor(Math.max(0.02, event.duration || 0.08) * sampleRate));
      const freq = 440 * Math.pow(2, ((event.midi || event.midiNotes?.[0] || 60) - 69) / 12);
      const gain = Math.min(0.4, Math.max(0, event.velocity || 0.25)) * 0.16;
      for (let index = 0; index < length && start + index < frameCount; index += 1) {
        const env = 1 - index / length;
        const sample = Math.sin(2 * Math.PI * freq * index / sampleRate) * gain * env;
        left[start + index] += sample;
        right[start + index] += sample;
      }
    });
    out[stem] = encodePcm16WavBlob({ channels: [left, right], sampleRate });
  });
  return out;
}
