import { buildPocketAudioTimeline } from "../events/timeline-events.js";
import { encodePcm16WavBlob } from "../export/wav.js";
import {
  CHORDSMITH_LOFI_TEXTURE_OFFLINE,
  chordsmithLofiTextureOfflineCrackleWindow,
  chordsmithLofiTextureOfflineSample
} from "../performance/lofi-texture.js";
import { chordsmithOfflineStemRenderGain } from "../performance/stem-mix.js";
import { findPocketChordInstrumentConfig, findPocketLeadInstrumentConfig, pocketLeadExtraLayers } from "../sounds/instruments.js";
import { findPocketGuitarTone } from "../sounds/guitar.js";
import { POCKET_BASS_TONE_CONFIGS, POCKET_DRUM_KIT_CONFIGS, resolvePocketBassToneId, resolvePocketDrumKitId } from "../sounds/lofi-registry.js";

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

export function renderPocketAudioStemBuffers(project, options = {}) {
  const sampleRate = options.sampleRate || 44100;
  const stems = options.stems || ["drums", "bass", "chords", "melody", "guitar"];
  const timeline = buildPocketAudioTimeline(project, options);
  const out = {};
  stems.forEach((stem) => {
    out[stem] = renderPocketAudioEventBuffer(timeline.events.filter((event) => event.stem === stem), {
      ...options,
      sampleRate,
      durationSeconds: timeline.duration,
      lofiTexture: null,
      timeline: {
        ...timeline,
        events: timeline.events.filter((event) => event.stem === stem)
      }
    });
  });
  return out;
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
  const voice = eventVoice(event, freq);
  for (let index = 0; index < length && start + index < left.length; index += 1) {
    const t = index / sampleRate;
    const env = envelope(index / length);
    const sample = waveform(voice, t, start + index) * gain * env;
    left[start + index] += sample * leftGain;
    right[start + index] += sample * rightGain;
  }
}

function eventVoice(event, freq) {
  if (event.type === "kick") return kickVoice(event);
  if (event.type === "snare") return snareVoice(event);
  if (event.type === "hat") return hatVoice(event);
  if (event.type === "guitar") return guitarVoice(event);
  if (event.type === "bass") return bassVoice(event, freq);
  if (event.type === "chord") return chordVoice(event);
  if (event.type === "melody") return melodyVoice(event, freq);
  return { type: "basic", freq };
}

function waveform(voice, t, seed) {
  if (voice.type === "kick") return kickSample(voice, t);
  if (voice.type === "snare") return snareSample(voice, t, seed);
  if (voice.type === "hat") return hatSample(voice, seed);
  if (voice.type === "guitar") return guitarSample(voice, t);
  if (voice.type === "bass") return bassSample(voice, t);
  if (voice.type === "chord") return chordSample(voice, t);
  if (voice.type === "melody") return melodySample(voice, t);
  return Math.sin(2 * Math.PI * voice.freq * t);
}

function kickVoice(event) {
  const cfg = drumKitConfig(event).kick || {};
  return {
    type: "kick",
    startFreq: Number(cfg.startFreq || 150),
    endFreq: Number(cfg.endFreq || 45),
    sweepSeconds: Math.max(0.02, Number(cfg.sweepSeconds || 0.14)),
    gain: Number(cfg.gainScale || 1) * 0.9 + Number(cfg.gainFloor || 0)
  };
}

function kickSample(voice, t) {
  const progress = Math.min(1, t / voice.sweepSeconds);
  const freq = voice.startFreq + (voice.endFreq - voice.startFreq) * progress;
  return Math.sin(2 * Math.PI * freq * t) * voice.gain;
}

function snareVoice(event) {
  const cfg = drumKitConfig(event).snare || {};
  return {
    type: "snare",
    bodyFreq: Number(cfg.bodyFreq || 190),
    bodyGain: Number(cfg.bodyGain ?? 0.2),
    noiseGain: Number(cfg.gainScale || 1) * 0.72 + Number(cfg.gainFloor || 0)
  };
}

function snareSample(voice, t, seed) {
  const noise = deterministicNoise(seed) * voice.noiseGain;
  return noise + Math.sin(2 * Math.PI * voice.bodyFreq * t) * voice.bodyGain;
}

function hatVoice(event) {
  const cfg = drumKitConfig(event).hat || {};
  const open = event.articulation === "open" || event.type === "openhat" || event.accent;
  const highpass = Number(open ? cfg.highpassOpen : cfg.highpassClosed) || 5600;
  const brightness = Math.max(0.25, Math.min(1.4, highpass / 5600));
  const gainScale = Number(open ? cfg.gainScaleOpen : cfg.gainScaleClosed) || 1;
  return { type: "hat", gain: 0.62 * brightness * gainScale };
}

function hatSample(voice, seed) {
  return deterministicNoise(seed) * voice.gain;
}

function bassVoice(event, freq) {
  const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(event.bassTone)] || POCKET_BASS_TONE_CONFIGS.classic;
  return {
    type: "bass",
    mainWave: cfg.mainWave || "sawtooth",
    mainFreq: freq,
    mainPeak: Number(cfg.mainPeak || 1) * 0.68,
    subWave: cfg.subWave || "sine",
    subFreq: freq * 0.5,
    subPeak: Number(cfg.subPeak || 0.35) * 0.42
  };
}

function bassSample(voice, t) {
  return (
    oscSample(voice.mainWave, voice.mainFreq, t) * voice.mainPeak +
    oscSample(voice.subWave, voice.subFreq, t) * voice.subPeak
  );
}

function chordVoice(event) {
  const cfg = findPocketChordInstrumentConfig(event.instrument);
  const notes = event.midiNotes?.length ? event.midiNotes : [event.midi || 60];
  const layers = cfg.layers?.length ? cfg.layers : [{ wave: cfg.wave || "sine", level: 1 }];
  let count = 0;
  const oscillators = [];
  notes.forEach((midi, noteIndex) => {
    const base = midiToFreq(midi);
    layers.forEach((layer) => {
      const level = Number(layer.level || 1);
      oscillators.push({
        wave: layer.wave || (noteIndex === 0 ? cfg.rootWave : cfg.wave) || "sine",
        freq: base * Number(layer.freqMul || 1),
        detune: Number(layer.detune || 0),
        level
      });
      count += level;
    });
  });
  return {
    type: "chord",
    oscillators,
    count: Math.max(1, count),
    peak: Number(cfg.peak || 0.2) * 4.5
  };
}

function chordSample(voice, t) {
  const sum = voice.oscillators.reduce((total, oscillator) => {
    return total + oscSample(oscillator.wave, oscillator.freq, t, oscillator.detune) * oscillator.level;
  }, 0);
  return (sum / voice.count) * voice.peak;
}

function melodyVoice(event, freq) {
  const cfg = findPocketLeadInstrumentConfig(event.instrument);
  return {
    type: "melody",
    wave: cfg.wave || "sine",
    freq,
    peak: Number(cfg.peak || 0.16) * 4.5,
    extras: pocketLeadExtraLayers(cfg).map((extra) => ({
      wave: extra.wave || "sine",
      freq: freq * Number(extra.freqMul || 1),
      offset: Number(extra.offset || 0),
      peak: Number(extra.peak || 0.02) * 4.5
    }))
  };
}

function melodySample(voice, t) {
  let sum = oscSample(voice.wave, voice.freq, t) * voice.peak;
  voice.extras.forEach((extra) => {
    sum += oscSample(extra.wave, extra.freq, Math.max(0, t - extra.offset)) * extra.peak;
  });
  return sum;
}

function guitarVoice(event) {
  const cfg = findPocketGuitarTone(event.instrument);
  const notes = event.midiNotes?.length ? event.midiNotes : [event.midi || 45];
  const drive = Number(cfg.drive || 1);
  const articulationScale = event.articulation === "chug" ? 0.72 : event.articulation === "scratch" ? 0.46 : 1;
  return {
    type: "guitar",
    freqs: notes.map(midiToFreq),
    drive,
    peak: Number(cfg.peak || 0.09) * 7.5 * articulationScale
  };
}

function guitarSample(voice, t) {
  const sum = voice.freqs.reduce((total, freq) => {
    return total + oscSample("sawtooth", freq, t) * 0.58 + oscSample("square", freq * 2, t) * 0.14;
  }, 0) / Math.max(1, voice.freqs.length);
  return Math.tanh(sum * voice.drive) * voice.peak;
}

function drumKitConfig(event) {
  const kit = resolvePocketDrumKitId(event.drumKit, event.audioProfile, event.lofiPreset);
  return POCKET_DRUM_KIT_CONFIGS[kit] || POCKET_DRUM_KIT_CONFIGS.classic;
}

function oscSample(wave, freq, t, detuneCents = 0) {
  const hz = freq * Math.pow(2, detuneCents / 1200);
  const phase = (hz * t) % 1;
  if (wave === "square") return phase < 0.5 ? 1 : -1;
  if (wave === "sawtooth") return phase * 2 - 1;
  if (wave === "triangle") return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
  return Math.sin(2 * Math.PI * hz * t);
}

function envelope(position) {
  if (position < 0.08) return position / 0.08;
  return Math.pow(1 - position, 1.8);
}

function eventFrequency(event) {
  const midi = event.midi || event.midiNotes?.[0] || (event.type === "kick" ? 36 : event.type === "snare" ? 38 : event.type === "hat" ? 72 : 60);
  return midiToFreq(midi);
}

function midiToFreq(midi) {
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
