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
import { pocketAudioDrumLaneFallback } from "../sounds/drum-lanes.js";

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
  const funk = event.audioProfile === "funk_groove" ? funkParameters(event) : null;
  const pocketOffset = funk && Number(event.step || 0) % 2 !== 0 ? (funk.pocket - 0.5) * 0.03 : 0;
  const durationScale = funk && event.type === "chord" ? 1 - funk.stabTightness * 0.68 : 1;
  const start = Math.max(0, Math.floor((Number(event.time || 0) + pocketOffset) * sampleRate));
  const length = Math.max(1, Math.floor(Math.max(0.02, (event.duration || 0.08) * durationScale) * sampleRate));
  const pan = Math.max(-1, Math.min(1, Number(event.pan || 0)));
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  const ghostScale = funk && ["snare", "rim", "clap"].includes(String(event.type || event.lane)) && !event.accent
    ? 0.46 + funk.ghostNotes * 0.5
    : 1;
  const gain = Math.min(0.9, Math.max(0, Number(event.velocity || 0.5))) * stemScale(event.stem) * ghostScale;
  const freq = eventFrequency(event);
  const voice = eventVoice(event, freq);
  const state = createVoiceRenderState(voice, sampleRate);
  for (let index = 0; index < length && start + index < left.length; index += 1) {
    const t = index / sampleRate;
    const env = voiceEnvelope(voice, index / length);
    if (voice.stereo) {
      const sample = stereoWaveform(voice, t, start + index, state, sampleRate);
      left[start + index] += sample[0] * gain * env * leftGain;
      right[start + index] += sample[1] * gain * env * rightGain;
    } else {
      const sample = waveform(voice, t, start + index, index, state, sampleRate) * gain * env;
      left[start + index] += sample * leftGain;
      right[start + index] += sample * rightGain;
    }
  }
}

function eventVoice(event, freq) {
  const drumType = canonicalDrumVoice(event.type || event.lane);
  if (drumType === "kick") return kickVoice(event);
  if (drumType === "snare") return snareVoice(event);
  if (drumType === "hat") return hatVoice(event);
  if (drumType === "tom") return tomVoice(event);
  if (drumType === "cymbal") return cymbalVoice(event);
  if (drumType === "percussion") return percussionVoice(event);
  if (isChipEvent(event)) return chipVoice(event, freq);
  if (event.type === "guitar") return guitarVoice(event);
  if (event.type === "bass") return bassVoice(event, freq);
  if (event.type === "chord") return chordVoice(event);
  if (event.type === "melody") return melodyVoice(event, freq);
  return { type: "basic", freq };
}

function waveform(voice, t, seed, index, state, sampleRate) {
  if (voice.type === "kick") return kickSample(voice, t);
  if (voice.type === "snare") return snareSample(voice, t, seed);
  if (voice.type === "hat") return hatSample(voice, seed);
  if (voice.type === "tom") return tomSample(voice, t);
  if (voice.type === "cymbal") return cymbalSample(voice, t, seed);
  if (voice.type === "percussion") return percussionSample(voice, t, seed);
  if (voice.type === "guitar") return guitarSample(voice, t);
  if (voice.type === "bass") return bassSample(voice, t);
  if (voice.type === "metal-bass") return metalBassSample(voice, t, seed);
  if (voice.type === "funk-bass") return funkBassSample(voice, t, seed);
  if (voice.type === "chip") return chipSample(voice, t, index, sampleRate);
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

function tomVoice(event) {
  const lane = String(event.lane || event.type || "tom_mid");
  const frequency = lane.includes("high") ? 218 : lane.includes("low") ? 118 : 158;
  return { type: "tom", frequency, endFrequency: frequency * 0.58, sweepSeconds: 0.22, gain: event.articulation === "ghost" ? 0.46 : 0.72 };
}

function tomSample(voice, t) {
  const progress = Math.min(1, t / voice.sweepSeconds);
  const frequency = voice.frequency + (voice.endFrequency - voice.frequency) * progress;
  return Math.sin(2 * Math.PI * frequency * t) * voice.gain;
}

function cymbalVoice(event) {
  const lane = String(event.lane || event.type || "crash");
  return { type: "cymbal", gain: lane === "ride" ? 0.34 : lane === "china" ? 0.52 : 0.46, bell: lane === "ride" ? 980 : 620 };
}

function cymbalSample(voice, t, seed) {
  return deterministicNoise(seed) * voice.gain + Math.sin(2 * Math.PI * voice.bell * t) * 0.09;
}

function percussionVoice(event) {
  const fallback = pocketAudioDrumLaneFallback(event.lane || event.type);
  return { type: "percussion", gain: fallback === "clap" ? 0.48 : 0.36, body: fallback === "snare" ? 420 : 760 };
}

function percussionSample(voice, t, seed) {
  return deterministicNoise(seed) * voice.gain + Math.sin(2 * Math.PI * voice.body * t) * 0.12;
}

function bassVoice(event, freq) {
  const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(event.bassTone)] || POCKET_BASS_TONE_CONFIGS.classic;
  if (event.audioProfile === "heavy_metal") {
    const texture = metalTexture(event);
    return {
      type: "metal-bass",
      freq,
      mainWave: cfg.mainWave || "sawtooth",
      cleanGain: Number(cfg.subPeak || 0.35) * 0.62,
      gritGain: Number(cfg.mainPeak || 1) * 0.56,
      drive: 1.5 + texture.drive * 5,
      tightness: texture.lowTightness,
      presence: texture.presence,
      pickAttack: texture.pickAttack
    };
  }
  if (event.audioProfile === "funk_groove") {
    const parameters = funkParameters(event);
    return {
      type: "funk-bass",
      mainWave: cfg.mainWave || "triangle",
      mainFreq: freq,
      mainPeak: Number(cfg.mainPeak || 1) * 0.68,
      subWave: cfg.subWave || "sine",
      subFreq: freq * 0.5,
      subPeak: Number(cfg.subPeak || 0.35) * 0.42,
      articulation: event.articulation || "finger",
      slapAmount: parameters.slapAmount,
      popBrightness: parameters.popBrightness,
      muteDepth: parameters.muteDepth
    };
  }
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

function metalBassSample(voice, t, seed) {
  const clean = Math.sin(2 * Math.PI * voice.freq * t) * voice.cleanGain;
  const picked = oscSample(voice.mainWave, voice.freq, t) * (0.65 + voice.presence * 0.35);
  const grit = Math.tanh(picked * voice.drive) * voice.gritGain;
  const pick = deterministicNoise(seed) * Math.exp(-t * 110) * voice.pickAttack * 0.28;
  return clean * (0.82 + voice.tightness * 0.18) + grit * (0.72 - voice.tightness * 0.18) + pick;
}

function funkBassSample(voice, t, seed) {
  const body = bassSample(voice, t);
  if (voice.articulation === "mute" || voice.articulation === "ghost") {
    return body * (0.16 + (1 - voice.muteDepth) * 0.18) + deterministicNoise(seed) * Math.exp(-t * 95) * 0.2;
  }
  if (voice.articulation === "slap") {
    return body * 0.86 + deterministicNoise(seed) * Math.exp(-t * 125) * (0.15 + voice.slapAmount * 0.3) + Math.sin(2 * Math.PI * voice.mainFreq * 2 * t) * 0.08;
  }
  if (voice.articulation === "pop") {
    return body * 0.78 + deterministicNoise(seed + 17) * Math.exp(-t * 150) * (0.12 + voice.popBrightness * 0.28) + oscSample("triangle", voice.mainFreq * 2, t) * voice.popBrightness * 0.16;
  }
  if (voice.articulation === "hammer" || voice.articulation === "pull") {
    const progress = Math.min(1, t * 24);
    const startSemitones = voice.articulation === "hammer" ? -2 : 2;
    const ratio = Math.pow(2, (startSemitones * (1 - progress)) / 12);
    const connected = oscSample(voice.mainWave, voice.mainFreq * ratio, t) * voice.mainPeak +
      oscSample(voice.subWave, voice.subFreq * ratio, t) * voice.subPeak;
    const directionColour = voice.articulation === "hammer" ? progress * 0.08 : (1 - progress) * 0.08;
    return connected * (0.78 + progress * 0.22) + oscSample("triangle", voice.mainFreq * 2, t) * directionColour;
  }
  return body;
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

function chipVoice(event, freq) {
  const technique = event.technique?.chip || {};
  const parameters = event.soundProfile?.parameters || event.chipTexture || {};
  const requestedChannel = String(technique.channel || (event.stem === "bass" ? "triangle" : event.stem === "drums" ? "noise" : "pulse1")).toLowerCase();
  const channel = ["pulse1", "pulse2", "triangle", "noise", "wave"].includes(requestedChannel) ? requestedChannel : "pulse2";
  const commandValues = Array.isArray(technique.commands)
    ? Object.fromEntries(technique.commands.filter((item) => item && typeof item === "object" && item.command).map((item) => [item.command, item.value]))
    : (technique.commands && typeof technique.commands === "object" ? technique.commands : {});
  const duty = clamp01(commandValues.duty ?? technique.duty ?? parameters.pulseWidth ?? 0.5);
  return {
    type: "chip",
    channel,
    freq,
    duty: Math.max(0.08, Math.min(0.92, duty)),
    envelope: commandValues.envelope ?? technique.envelope ?? "pluck",
    pitchSlide: Number(commandValues.pitchSlide ?? technique.pitchSlide ?? technique.sweep ?? 0),
    vibrato: Number(commandValues.vibrato ?? technique.vibrato ?? 0),
    arpeggio: Array.isArray(commandValues.arpeggio ?? technique.arpeggio) ? (commandValues.arpeggio ?? technique.arpeggio).map(Number) : [],
    retrigger: Math.max(0, Number(commandValues.retrigger ?? technique.retrigger ?? 0)),
    saturation: clamp01(parameters.saturation),
    crush: clamp01(parameters.sampleRateCrush),
    bitDepth: clamp01(parameters.bitDepth)
  };
}

function chipSample(voice, t, index, sampleRate) {
  const retriggerTime = voice.retrigger > 0 ? t % voice.retrigger : t;
  const arpIndex = voice.arpeggio.length ? Math.floor(retriggerTime * 32) % voice.arpeggio.length : 0;
  const semitones = (voice.arpeggio[arpIndex] || 0) + voice.pitchSlide * Math.min(1, retriggerTime * 8);
  const vibrato = voice.vibrato ? Math.sin(2 * Math.PI * 6.2 * retriggerTime) * voice.vibrato : 0;
  const frequency = voice.freq * Math.pow(2, (semitones + vibrato) / 12);
  const heldIndex = voice.crush > 0 ? Math.floor(index / Math.max(1, Math.round(1 + voice.crush * 18))) : index;
  const heldTime = heldIndex / sampleRate;
  let sample;
  if (voice.channel === "noise") sample = deterministicNoise(heldIndex + 71);
  else if (voice.channel === "triangle") sample = oscSample("triangle", frequency, heldTime);
  else if (voice.channel === "wave") sample = oscSample("sine", frequency, heldTime) * 0.7 + oscSample("triangle", frequency * 2, heldTime) * 0.3;
  else sample = pulseSample(frequency, heldTime, voice.duty);
  if (voice.bitDepth > 0) {
    const levels = Math.max(8, Math.round(256 * (1 - voice.bitDepth * 0.9)));
    sample = Math.round(sample * levels) / levels;
  }
  return Math.tanh(sample * (1 + voice.saturation * 3));
}

function pulseSample(freq, t, duty) {
  return (freq * t) % 1 < duty ? 1 : -1;
}

function guitarVoice(event) {
  const cfg = findPocketGuitarTone(event.instrument);
  const notes = event.midiNotes?.length ? event.midiNotes : [event.midi || 45];
  const drive = Number(cfg.drive || 1);
  const articulationScale = event.articulation === "chug" ? 0.72 : event.articulation === "scratch" ? 0.46 : 1;
  if (event.audioProfile === "heavy_metal") {
    const texture = metalTexture(event);
    const technique = event.technique?.metal || {};
    const palmMute = clamp01(technique.palmMute ?? (event.articulation === "palm_mute" || event.articulation === "chug" ? texture.palmMute : texture.palmMute * 0.3));
    return {
      type: "metal-guitar",
      stereo: true,
      freqs: notes.map(midiToFreq),
      drive: 1.4 + texture.drive * 8.2,
      input: Number(cfg.input || 0.88),
      peak: Number(cfg.peak || 0.078) * 6.4 * articulationScale,
      palmMute,
      lowTightness: texture.lowTightness,
      presence: texture.presence,
      roomSize: texture.roomSize,
      pickAttack: texture.pickAttack,
      cabLowpass: 2200 + texture.presence * 2100 - palmMute * 620,
      preampHighpass: 68 + texture.lowTightness * 150,
      dualTakeSeed: Number(technique.dualTakeSeed ?? event.step ?? 0),
      spread: 0.004 + Number(cfg.spread || 0.007) + texture.presence * 0.003
    };
  }
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

function stereoWaveform(voice, t, seed, state, sampleRate) {
  if (voice.type !== "metal-guitar") {
    const mono = waveform(voice, t, seed, Math.floor(t * sampleRate), state, sampleRate);
    return [mono, mono];
  }
  const leftRaw = metalGuitarTake(voice, t, seed, -1);
  const rightRaw = metalGuitarTake(voice, t, seed + 31, 1);
  const roomDelay = 0.011 + voice.roomSize * 0.023;
  const leftRoom = t > roomDelay ? metalGuitarTake(voice, t - roomDelay, seed + 47, 1) * voice.roomSize * 0.24 : 0;
  const rightRoom = t > roomDelay * 1.13 ? metalGuitarTake(voice, t - roomDelay * 1.13, seed + 53, -1) * voice.roomSize * 0.24 : 0;
  return [
    applyCabFilter(leftRaw + leftRoom, state.left, voice, sampleRate),
    applyCabFilter(rightRaw + rightRoom, state.right, voice, sampleRate)
  ];
}

function metalGuitarTake(voice, t, seed, side) {
  const variation = 1 + side * voice.spread + stableVariation(voice.dualTakeSeed + side * 11) * 0.0018;
  const sum = voice.freqs.reduce((total, freq, index) => {
    const hz = freq * variation;
    const fundamental = oscSample("sawtooth", hz, t, side * 2.5);
    const upper = oscSample("square", hz * 2, t, -side * 1.7) * (0.08 + voice.presence * 0.18);
    return total + fundamental * 0.58 + upper + Math.sin(2 * Math.PI * hz * 3 * t) * voice.presence * 0.055;
  }, 0) / Math.max(1, voice.freqs.length);
  const transient = deterministicNoise(seed) * Math.exp(-t * (92 + voice.palmMute * 55)) * voice.pickAttack * 0.32;
  return Math.tanh((sum * voice.input + transient) * voice.drive) * voice.peak;
}

function createVoiceRenderState(voice, sampleRate) {
  if (voice.type !== "metal-guitar") return {};
  return { left: filterState(), right: filterState(), sampleRate };
}

function filterState() {
  return { previousInput: 0, highpass: 0, lowpass: 0 };
}

function applyCabFilter(input, state, voice, sampleRate) {
  const dt = 1 / sampleRate;
  const hpRc = 1 / (2 * Math.PI * voice.preampHighpass);
  const hpAlpha = hpRc / (hpRc + dt);
  state.highpass = hpAlpha * (state.highpass + input - state.previousInput);
  state.previousInput = input;
  const lpRc = 1 / (2 * Math.PI * voice.cabLowpass);
  const lpAlpha = dt / (lpRc + dt);
  state.lowpass += lpAlpha * (state.highpass - state.lowpass);
  return state.lowpass;
}

function drumKitConfig(event) {
  const kit = resolvePocketDrumKitId(event.drumKit, event.audioProfile, event.metalPreset || event.funkPreset || event.westernPreset || event.chipPreset || event.lofiPreset);
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

function voiceEnvelope(voice, position) {
  if (voice.type === "metal-guitar") {
    const attack = position < 0.025 ? position / 0.025 : 1;
    return attack * Math.pow(1 - position, 1.15 + voice.palmMute * 5.4);
  }
  if (voice.type === "funk-bass") {
    if (voice.articulation === "mute" || voice.articulation === "ghost") return Math.pow(1 - position, 6.5);
    if (voice.articulation === "slap" || voice.articulation === "pop") return Math.pow(1 - position, 2.8);
    if (voice.articulation === "hammer" || voice.articulation === "pull") return Math.min(1, position * 18) * Math.pow(1 - position, 1.5);
  }
  if (voice.type === "chip") {
    if (Array.isArray(voice.envelope) && voice.envelope.length) {
      const index = Math.min(voice.envelope.length - 1, Math.floor(position * voice.envelope.length));
      return clamp01(Number(voice.envelope[index]) / (Number(voice.envelope[index]) > 1 ? 15 : 1));
    }
    if (voice.envelope === "sustain") return position < 0.03 ? position / 0.03 : Math.pow(1 - position, 0.35);
    if (voice.envelope === "gate") return position < 0.85 ? 1 : (1 - position) / 0.15;
    return position < 0.02 ? position / 0.02 : Math.pow(1 - position, 2.4);
  }
  return envelope(position);
}

function canonicalDrumVoice(type) {
  const lane = String(type || "").toLowerCase();
  if (lane === "kick") return "kick";
  if (["snare", "rim", "clap"].includes(lane)) return "snare";
  if (["hat", "openhat", "hat_closed", "hat_open"].includes(lane)) return "hat";
  if (["tomhi", "tommid", "tomlow", "tom_high", "tom_mid", "tom_low"].includes(lane)) return "tom";
  if (["ride", "crash", "china"].includes(lane)) return "cymbal";
  if (lane === "percussion") return "percussion";
  return "";
}

function isChipEvent(event) {
  return (event.audioProfile === "chip_arcade" || event.audioProfile === "chip_tune") && ["bass", "chord", "melody"].includes(event.type);
}

function metalTexture(event) {
  const source = event.metalTexture || event.soundProfile?.parameters || {};
  return {
    drive: clamp01(source.drive ?? 0.48),
    palmMute: clamp01(source.palmMute ?? 0.78),
    lowTightness: clamp01(source.lowTightness ?? 0.86),
    presence: clamp01(source.presence ?? 0.58),
    roomSize: clamp01(source.roomSize ?? 0.12),
    pickAttack: clamp01(source.pickAttack ?? 0.72)
  };
}

function funkParameters(event) {
  const source = event.soundProfile?.parameters || {};
  return {
    pocket: clamp01(source.pocket ?? 0.72),
    ghostNotes: clamp01(source.ghostNotes ?? 0.42),
    slapAmount: clamp01(source.slapAmount ?? 0.68),
    popBrightness: clamp01(source.popBrightness ?? 0.62),
    muteDepth: clamp01(source.muteDepth ?? 0.74),
    stabTightness: clamp01(source.stabTightness ?? 0.76)
  };
}

function stableVariation(seed) {
  return deterministicNoise(Number(seed || 0) + 193) * 0.5;
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
