import { buildPocketAudioTimeline } from "../events/timeline-events.js";
import { encodePcm16WavBlob } from "../export/wav.js";
import {
  CHORDSMITH_LOFI_TEXTURE_OFFLINE,
  chordsmithLofiTextureOfflineCrackleWindow,
  chordsmithLofiTextureOfflineSample
} from "../performance/lofi-texture.js";
import { chordsmithOfflineStemRenderGain } from "../performance/stem-mix.js";

export async function renderWav(project, options = {}) {
  return renderPocketAudioWav(project, options);
}

export function renderPocketAudioBuffer(project, options = {}) {
  const sampleRate = options.sampleRate || 44100;
  const timeline = buildPocketAudioTimeline(project, options);
  return renderPocketAudioEventBuffer(timeline.events, {
    ...options,
    durationSeconds: timeline.duration,
    lofiTexture: project?.lofi?.texture,
    timeline
  });
}

export function renderPocketAudioEventBuffer(events, options = {}) {
  const sampleRate = options.sampleRate || 44100;
  const tailSeconds = options.tailSeconds ?? 0.6;
  const durationSeconds = Number.isFinite(options.durationSeconds)
    ? Math.max(0, Number(options.durationSeconds))
    : events.reduce((duration, event) => Math.max(duration, Number(event.time || 0) + Number(event.duration || 0)), 0);
  const frameCount = Math.max(1, Math.ceil((durationSeconds + tailSeconds) * sampleRate));
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  events.forEach((event) => renderEventToChannels(event, left, right, sampleRate));
  renderLofiTexture({ lofi: { texture: options.lofiTexture } }, left, right, sampleRate);
  return {
    channels: [left, right],
    sampleRate,
    duration: frameCount / sampleRate,
    eventCount: events.length,
    timeline: options.timeline || { events, duration: durationSeconds }
  };
}

function renderLofiTexture(project, left, right, sampleRate) {
  const texture = project?.lofi?.texture;
  if (!texture?.enabled) return;
  const hiss = clamp01(texture.tapeHiss);
  const crackle = clamp01(texture.vinylCrackle);
  if (hiss <= 0.005 && crackle <= 0.005) return;

  const crackleWindow = chordsmithLofiTextureOfflineCrackleWindow(sampleRate);
  const warmthGain = CHORDSMITH_LOFI_TEXTURE_OFFLINE.warmthGainBase +
    clamp01(texture.warmth) * CHORDSMITH_LOFI_TEXTURE_OFFLINE.warmthGainRange;
  const lowpassHz = CHORDSMITH_LOFI_TEXTURE_OFFLINE.lowpassBaseHz -
    clamp01(texture.lowPassAge) * CHORDSMITH_LOFI_TEXTURE_OFFLINE.lowpassAgeHz;
  const state = createTextureFilterState(sampleRate, CHORDSMITH_LOFI_TEXTURE_OFFLINE.highpassHz, lowpassHz);

  for (let index = 0; index < left.length; index += 1) {
    const dry = chordsmithLofiTextureOfflineSample(index, texture, crackleWindow);
    const filtered = filterTextureSample(dry, state) * warmthGain;
    left[index] = clampAudio(left[index] + filtered);
    right[index] = clampAudio(right[index] + filtered);
  }
}

function createTextureFilterState(sampleRate, highpassHz, lowpassHz) {
  const hpRc = 1 / (2 * Math.PI * highpassHz);
  const lpRc = 1 / (2 * Math.PI * lowpassHz);
  const dt = 1 / sampleRate;
  return {
    highpassAlpha: hpRc / (hpRc + dt),
    lowpassAlpha: dt / (lpRc + dt),
    previousInput: 0,
    highpass: 0,
    lowpass: 0
  };
}

function filterTextureSample(input, state) {
  state.highpass = state.highpassAlpha * (state.highpass + input - state.previousInput);
  state.previousInput = input;
  state.lowpass += state.lowpassAlpha * (state.highpass - state.lowpass);
  return state.lowpass;
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

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function clampAudio(value) {
  return Math.max(-1, Math.min(1, value));
}

function stemScale(stem) {
  return chordsmithOfflineStemRenderGain(stem);
}
