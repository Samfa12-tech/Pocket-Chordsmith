import { buildPocketAudioTimeline } from "../events/timeline-events.js";
import { encodePcm16WavBlob } from "../export/wav.js";

export async function renderWav(project, options = {}) {
  return renderPocketAudioWav(project, options);
}

export function renderPocketAudioBuffer(project, options = {}) {
  const sampleRate = options.sampleRate || 44100;
  const timeline = buildPocketAudioTimeline(project, options);
  const tailSeconds = options.tailSeconds ?? 0.6;
  const frameCount = Math.max(1, Math.ceil((timeline.duration + tailSeconds) * sampleRate));
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  timeline.events.forEach((event) => renderEventToChannels(event, left, right, sampleRate));
  return {
    channels: [left, right],
    sampleRate,
    duration: frameCount / sampleRate,
    eventCount: timeline.events.length,
    timeline
  };
}

export function renderPocketAudioWav(project, options = {}) {
  const buffer = renderPocketAudioBuffer(project, options);
  return encodePcm16WavBlob({ channels: buffer.channels, sampleRate: buffer.sampleRate });
}

function renderEventToChannels(event, left, right, sampleRate) {
  const start = Math.max(0, Math.floor(event.time * sampleRate));
  const length = Math.max(1, Math.floor(Math.max(0.02, event.duration || 0.08) * sampleRate));
  const pan = Math.max(-1, Math.min(1, Number(event.pan || 0)));
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  const gain = Math.min(0.9, Math.max(0, Number(event.velocity || 0.5))) * stemScale(event.stem);
  const freq = eventFrequency(event);
  for (let index = 0; index < length && start + index < left.length; index += 1) {
    const t = index / sampleRate;
    const env = envelope(index / length);
    const sample = waveform(event, freq, t, start + index) * gain * env;
    left[start + index] += sample * leftGain;
    right[start + index] += sample * rightGain;
  }
}

function waveform(event, freq, t, seed) {
  if (event.type === "snare") return deterministicNoise(seed) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.2;
  if (event.type === "hat") return deterministicNoise(seed) * 0.65;
  if (event.type === "guitar") return Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.55 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
  if (event.type === "bass") return Math.sin(2 * Math.PI * freq * t) * 0.75 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
  return Math.sin(2 * Math.PI * freq * t);
}

function envelope(position) {
  if (position < 0.08) return position / 0.08;
  return Math.pow(1 - position, 1.8);
}

function eventFrequency(event) {
  const midi = event.midi || event.midiNotes?.[0] || (event.type === "kick" ? 36 : event.type === "snare" ? 38 : event.type === "hat" ? 72 : 60);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function deterministicNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function stemScale(stem) {
  if (stem === "drums") return 0.22;
  if (stem === "bass") return 0.18;
  if (stem === "chords") return 0.08;
  if (stem === "guitar") return 0.12;
  return 0.1;
}
