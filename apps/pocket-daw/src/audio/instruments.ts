import type { RenderedEvent } from "./eventRenderer";

interface LayerConfig {
  wave: OscillatorType;
  freqMul?: number;
  detune?: number;
  level?: number;
}

interface ChordConfig {
  rootWave: OscillatorType;
  wave: OscillatorType;
  peak: number;
  filter: BiquadFilterType;
  freq: number;
  filterQ: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  durMul: number;
  spreadMul: number;
  shimmer: boolean;
  maxLiveDur: number;
  filterSweep?: number;
  layers: LayerConfig[];
}

interface LeadConfig {
  wave: OscillatorType;
  peak: number;
  filter: BiquadFilterType;
  freq: number;
  durMul: number;
}

interface GuitarConfig {
  drive: number;
  input: number;
  peak: number;
  lowpass: number;
  highpass: number;
  body: number;
  mid: number;
  spread: number;
  sustain: number;
  mute: number;
  scratch: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const guitarCurves = new Map<string, Float32Array<ArrayBuffer>>();

export function scheduleInstrumentEvent(ctx: BaseAudioContext, destination: AudioNode, event: RenderedEvent): void {
  const t = Math.max(ctx.currentTime, event.time);
  if (event.kind === "kick") return kick(ctx, destination, t, event.velocity);
  if (event.kind === "snare") return snare(ctx, destination, t, event.velocity);
  if (event.kind === "hat") return hat(ctx, destination, t, event.velocity, !!event.accent);
  if (event.kind === "bass" && event.midi !== undefined) return bass(ctx, destination, event.midi, t, event.duration, event.velocity, !!event.accent, event.slideMidi, event.slideOffset);
  if (event.kind === "melody" && event.midi !== undefined) {
    return leadPhrase(ctx, destination, event.midi, t, event.duration, event.instrument || "pulse", event.pan || 0, event.velocity, event.slideMidi, event.slideOffset);
  }
  if (event.kind === "midi" && event.midi !== undefined) {
    return leadPhrase(ctx, destination, event.midi, t, event.duration, "soft", event.pan || 0, event.velocity);
  }
  if (event.kind === "chord" && event.midiNotes) {
    return chord(ctx, destination, event.midiNotes, t, event.duration, event.instrument || "pocket", event.velocity, event.articulation || "block");
  }
  if (event.kind === "guitar" && event.midiNotes) {
    return guitar(ctx, destination, event.midiNotes, t, event.duration, event.articulation || "open", event.instrument || "high_gain", event.direction || "down", event.step);
  }
}

function tone(
  ctx: BaseAudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  dur: number,
  wave: OscillatorType,
  peak: number,
  filterType: BiquadFilterType | null,
  filterFreq: number,
  pan = 0
) {
  toneFreq(ctx, destination, midiToFreq(midi), start, dur, wave, peak, filterType, filterFreq, pan);
}

function toneFreq(
  ctx: BaseAudioContext,
  destination: AudioNode,
  freq: number,
  start: number,
  dur: number,
  wave: OscillatorType,
  peak: number,
  filterType: BiquadFilterType | null,
  filterFreq: number,
  pan = 0
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  let node: AudioNode = osc;
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, start);
  if (filterType) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, start);
    node.connect(filter);
    node = filter;
  }
  node.connect(gain);
  connectWithPan(ctx, gain, destination, pan);
  adsr(gain, start, 0.01, 0.06, 0.7, Math.max(0.02, dur), peak);
  osc.start(start);
  osc.stop(start + Math.max(0.02, dur) + 0.25);
}

function adsr(gain: GainNode, start: number, attack: number, decay: number, sustain: number, releaseAt: number, peak = 1) {
  gain.gain.cancelScheduledValues(start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), start + attack);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak * sustain), start + attack + decay);
  gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), start + releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + releaseAt + 0.2);
}

function connectWithPan(ctx: BaseAudioContext, source: AudioNode, destination: AudioNode, pan = 0) {
  if (Math.abs(pan) < 0.001 || !("createStereoPanner" in ctx)) {
    source.connect(destination);
    return;
  }
  if ("createStereoPanner" in ctx) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -1, 1), ctx.currentTime || 0);
    source.connect(panner);
    panner.connect(destination);
    return;
  }
}

function kick(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.95) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(155, start);
  osc.frequency.exponentialRampToValueAtTime(45, start + 0.14);
  gain.gain.setValueAtTime(Math.max(0.08, peak), start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + 0.17);
}

function snare(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.5) {
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  noise.buffer = getNoise(ctx, 0.12, "snare");
  filter.type = "highpass";
  filter.frequency.value = 1700;
  gain.gain.setValueAtTime(Math.max(0.05, peak), start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  noise.start(start);
  noise.stop(start + 0.13);
}

function hat(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.16, open = false) {
  const hatLen = open ? 0.16 : 0.05;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  noise.buffer = getNoise(ctx, hatLen, open ? "hat_open" : "hat_closed");
  filter.type = "highpass";
  filter.frequency.value = open ? 3800 : 5600;
  gain.gain.setValueAtTime(Math.max(open ? 0.05 : 0.03, peak), start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + (open ? 0.14 : 0.05));
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  noise.start(start);
  noise.stop(start + hatLen);
}

function bass(
  ctx: BaseAudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  dur = 0.22,
  peak = 0.34,
  accent = false,
  slideMidi: number | undefined,
  slideOffset: number | undefined
) {
  if (slideMidi === undefined || slideOffset === undefined) {
    const bassDur = accent ? dur * 1.35 : dur;
    const bassPeak = accent ? peak * 1.18 : peak;
    tone(ctx, destination, midi, start, bassDur, "sawtooth", bassPeak, "lowpass", accent ? 520 : 420);
    tone(ctx, destination, midi - 12, start, bassDur * 0.8, "sine", bassPeak * 0.42, "lowpass", accent ? 260 : 220);
    return;
  }
  bassSlide(ctx, destination, midi, slideMidi, start, dur, peak, accent, slideOffset);
}

function bassSlide(ctx: BaseAudioContext, destination: AudioNode, midi: number, targetMidi: number, start: number, dur: number, peak: number, accent: boolean, slideOffset: number) {
  const endAt = start + Math.max(0.08, dur) + 0.22;
  const slideAt = Math.max(start + 0.02, start + slideOffset);
  const bassPeak = peak * (accent ? 1.18 : 1);
  const makeVoice = (from: number, to: number, wave: OscillatorType, peakMul: number, cutoff: number) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(midiToFreq(from), start);
    osc.frequency.linearRampToValueAtTime(midiToFreq(to), Math.min(endAt - 0.03, slideAt + 0.09));
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, start);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    adsr(gain, start, 0.01, 0.06, 0.7, Math.max(0.08, dur), bassPeak * peakMul);
    osc.start(start);
    osc.stop(endAt);
  };
  makeVoice(midi, targetMidi, "sawtooth", 1, accent ? 520 : 420);
  makeVoice(midi - 12, targetMidi - 12, "sine", 0.42, accent ? 260 : 220);
}

function chord(ctx: BaseAudioContext, destination: AudioNode, notes: number[], start: number, dur: number, instrument: string, velocity: number, playMode: string) {
  const cfg = chordInstrumentConfig(instrument);
  const chordDur = Math.max(0.08, Math.min(dur * cfg.durMul, cfg.maxLiveDur || 1.1));
  if (playMode === "block") {
    notes.forEach((midi, index) => {
      const noteStart = start + index * 0.01 * cfg.spreadMul;
      chordTone(ctx, destination, midiToFreq(midi), noteStart, chordDur, index === 0 ? cfg.rootWave : cfg.wave, cfg.peak * velocity, cfg.filter, cfg.freq, cfg);
      if (cfg.shimmer && index > 0) {
        chordTone(ctx, destination, midiToFreq(midi + 12), noteStart + 0.014, Math.min(0.12, chordDur * 0.35), "sine", cfg.peak * velocity * 0.08, "lowpass", 5200, {
          ...cfg,
          attack: 0.002,
          decay: 0.12,
          sustain: 0.06,
          release: 0.35,
          layers: [{ wave: "sine", level: 1 }]
        });
      }
    });
    return;
  }
  const gap = (playMode.startsWith("strum") ? 0.045 : 0.12) * cfg.spreadMul;
  notes.forEach((midi, index) => {
    const noteStart = start + index * gap;
    const noteDur = playMode.startsWith("strum") ? chordDur : Math.min(0.25, chordDur * 0.45);
    chordTone(ctx, destination, midiToFreq(midi), noteStart, noteDur, index === 0 ? cfg.rootWave : cfg.wave, cfg.peak * velocity * 0.92, cfg.filter, cfg.freq, cfg);
  });
}

function chordTone(
  ctx: BaseAudioContext,
  destination: AudioNode,
  freq: number,
  start: number,
  dur: number,
  wave: OscillatorType,
  peak: number,
  filterType: BiquadFilterType,
  filterFreq: number,
  cfg: ChordConfig,
  pan = 0
) {
  const gain = ctx.createGain();
  let output: AudioNode = gain;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, start);
  filter.Q.setValueAtTime(cfg.filterQ ?? 0.7, start);
  if (cfg.filterSweep) filter.frequency.linearRampToValueAtTime(cfg.filterSweep, start + Math.max(0.04, Math.min(0.22, dur * 0.5)));
  gain.connect(filter);
  output = filter;
  connectWithPan(ctx, output, destination, pan);
  chordEnvelope(gain, start, dur, peak, cfg);

  const layers = cfg.layers || [{ wave, freqMul: 1, detune: 0, level: 1 }];
  layers.forEach((layer) => {
    const osc = ctx.createOscillator();
    const layerGain = ctx.createGain();
    osc.type = layer.wave || wave;
    osc.frequency.setValueAtTime(freq * (layer.freqMul || 1), start);
    osc.detune.setValueAtTime(layer.detune ?? 0, start);
    layerGain.gain.setValueAtTime(layer.level ?? 1, start);
    osc.connect(layerGain);
    layerGain.connect(gain);
    osc.start(start);
    osc.stop(start + dur + cfg.release + 0.03);
  });
}

function chordEnvelope(gain: GainNode, start: number, dur: number, peak: number, cfg: ChordConfig) {
  const attack = Math.max(0.001, cfg.attack ?? 0.01);
  const decay = Math.max(0.001, cfg.decay ?? 0.06);
  const sustain = clamp(cfg.sustain ?? 0.7, 0.001, 1);
  const release = Math.max(0.025, cfg.release ?? 0.2);
  gain.gain.cancelScheduledValues(start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), start + attack);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak * sustain), start + attack + decay);
  gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), start + Math.max(0.02, dur));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.02, dur) + release);
}

function leadPhrase(
  ctx: BaseAudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  dur = 0.28,
  instrument = "pulse",
  pan = 0,
  peakMul = 1,
  slideMidi?: number,
  slideOffset?: number
) {
  if (slideMidi === undefined || slideOffset === undefined) {
    lead(ctx, destination, midi, start, dur, instrument, pan, peakMul);
    return;
  }
  const cfg = leadInstrumentConfig(instrument);
  const slideAt = Math.max(start + 0.02, start + slideOffset * cfg.durMul);
  const endAt = start + Math.max(0.08, dur * cfg.durMul) + 0.22;
  const makeVoice = (freqMul = 1, waveOverride: OscillatorType | null = null, peakScale = 1, filterType = cfg.filter, filterFreq = cfg.freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let node: AudioNode = osc;
    osc.type = waveOverride || cfg.wave;
    osc.frequency.setValueAtTime(midiToFreq(midi) * freqMul, start);
    osc.frequency.linearRampToValueAtTime(midiToFreq(slideMidi) * freqMul, Math.min(endAt - 0.03, slideAt + 0.08));
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, start);
    node.connect(filter);
    node = filter;
    node.connect(gain);
    connectWithPan(ctx, gain, destination, pan);
    adsr(gain, start, 0.01, 0.06, 0.7, Math.max(0.08, dur * cfg.durMul), cfg.peak * peakMul * peakScale);
    osc.start(start);
    osc.stop(endAt);
  };
  makeVoice();
  scheduleLeadExtraLayers(makeVoice, instrument);
}

function lead(ctx: BaseAudioContext, destination: AudioNode, midi: number, start: number, dur = 0.28, instrument = "pulse", pan = 0, peakMul = 1) {
  const cfg = leadInstrumentConfig(instrument);
  tone(ctx, destination, midi, start, dur * cfg.durMul, cfg.wave, cfg.peak * peakMul, cfg.filter, cfg.freq, pan);
  const makeVoice = (freqMul = 1, wave: OscillatorType, peakScale = 1, filterType: BiquadFilterType, filterFreq: number, offset = 0, durMul = 1) => {
    toneFreq(ctx, destination, midiToFreq(midi) * freqMul, start + offset, dur * durMul, wave, peakScale * peakMul, filterType, filterFreq, pan);
  };
  if (instrument === "bell") makeVoice(2, "sine", 0.022, "lowpass", 3200, 0.012, 0.42);
  else if (instrument === "lead_guitar") makeVoice(1.006, "square", 0.035, "lowpass", 2600, 0.006, 0.72);
  else if (instrument === "distorted_lead_guitar") makeVoice(0.996, "square", 0.05, "bandpass", 2100, 0.004, 0.68);
  else if (instrument === "banjo") {
    makeVoice(2.01, "triangle", 0.028, "highpass", 1500, 0.004, Math.min(0.09, dur * 0.38) / dur);
    makeVoice(0.997, "square", 0.018, "bandpass", 2600, 0.012, Math.min(0.13, dur * 0.48) / dur);
  } else if (instrument === "harmonica") {
    makeVoice(1.004, "triangle", 0.035, "bandpass", 860, 0.006, 0.92);
    makeVoice(2, "square", 0.012, "bandpass", 2100, 0.014, 0.42);
  } else if (instrument === "cowboy_whistle") makeVoice(2, "sine", 0.014, "lowpass", 3600, 0.01, 0.65);
  else if (instrument === "trumpet") tone(ctx, destination, midi + 12, start + 0.008, dur * 0.35, "sawtooth", 0.018 * peakMul, "bandpass", 2400, pan);
  else if (instrument === "saxophone") tone(ctx, destination, midi - 12, start + 0.004, dur * 0.42, "sine", 0.03 * peakMul, "lowpass", 760, pan);
}

function scheduleLeadExtraLayers(
  makeVoice: (freqMul?: number, waveOverride?: OscillatorType | null, peakScale?: number, filterType?: BiquadFilterType, filterFreq?: number) => void,
  instrument: string
) {
  if (instrument === "bell") makeVoice(2, "sine", 0.16, "lowpass", 3200);
  else if (instrument === "lead_guitar") makeVoice(1.006, "square", 0.2, "lowpass", 2600);
  else if (instrument === "distorted_lead_guitar") makeVoice(0.996, "square", 0.34, "bandpass", 2100);
  else if (instrument === "banjo") {
    makeVoice(2.01, "triangle", 0.18, "highpass", 1500);
    makeVoice(0.997, "square", 0.13, "bandpass", 2600);
  } else if (instrument === "harmonica") {
    makeVoice(1.004, "triangle", 0.24, "bandpass", 860);
    makeVoice(2, "square", 0.08, "bandpass", 2100);
  } else if (instrument === "cowboy_whistle") makeVoice(2, "sine", 0.14, "lowpass", 3600);
  else if (instrument === "trumpet") makeVoice(2, "sawtooth", 0.13, "bandpass", 2400);
  else if (instrument === "saxophone") makeVoice(0.5, "sine", 0.18, "lowpass", 760);
}

function guitar(ctx: BaseAudioContext, destination: AudioNode, notes: number[], start: number, dur: number, articulation: string, toneName: string, direction: "down" | "up", step: number) {
  if (!notes.length) return;
  const cfg = guitarToneConfig(toneName);
  const isChug = articulation === "chug";
  const isAccent = articulation === "accent";
  const isScratch = articulation === "scratch";
  const playDur = isChug ? Math.min(dur, cfg.mute) : isScratch ? cfg.scratch : Math.max(0.12, dur * cfg.sustain);
  const ordered = direction === "up" ? notes.slice().reverse() : notes.slice();
  const spread = isChug || isScratch ? 0.003 : cfg.spread;

  const bus = ctx.createGain();
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();
  const body = ctx.createBiquadFilter();
  const mid = ctx.createBiquadFilter();
  const out = ctx.createGain();

  input.gain.setValueAtTime(cfg.input * (isAccent ? 1.18 : 1), start);
  shaper.curve = guitarDistortionCurve(cfg.drive * (isAccent ? 1.12 : 1));
  shaper.oversample = "2x";
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(isChug ? Math.max(135, cfg.highpass) : cfg.highpass, start);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(isChug ? Math.min(cfg.lowpass, 2400) : cfg.lowpass, start);
  body.type = "peaking";
  body.frequency.setValueAtTime(isChug ? 170 : 240, start);
  body.Q.value = 0.75;
  body.gain.setValueAtTime(isChug ? 1.5 : cfg.body, start);
  mid.type = "peaking";
  mid.frequency.setValueAtTime(isChug ? 720 : 980, start);
  mid.Q.value = 0.85;
  mid.gain.setValueAtTime(isChug ? Math.max(1.8, cfg.mid) : cfg.mid, start);
  out.gain.setValueAtTime(0.82, start);

  bus.connect(input);
  input.connect(shaper);
  shaper.connect(highpass);
  highpass.connect(body);
  body.connect(mid);
  mid.connect(lowpass);
  lowpass.connect(out);
  out.connect(destination);

  if (isScratch) {
    const noise = ctx.createBufferSource();
    const bandpass = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noise.buffer = getNoise(ctx, playDur, "guitar_scratch");
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(1450, start);
    bandpass.Q.value = 0.9;
    noiseGain.gain.setValueAtTime(0.0001, start);
    noiseGain.gain.linearRampToValueAtTime(0.11, start + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + playDur);
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(bus);
    noise.start(start);
    noise.stop(start + playDur + 0.02);
    return;
  }

  ordered.forEach((midi, index) => {
    const noteStart = start + index * spread;
    const freq = midiToFreq(midi);
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();
    oscA.type = "sawtooth";
    oscB.type = toneName === "clean" ? "triangle" : "square";
    oscA.frequency.setValueAtTime(freq, noteStart);
    oscB.frequency.setValueAtTime(freq * (1.003 + index * 0.0009), noteStart);
    oscA.detune.setValueAtTime((featureSeed(step, index + 50) - 0.5) * 4, noteStart);
    oscB.detune.setValueAtTime((featureSeed(step, index + 70) - 0.5) * 5, noteStart);
    const peak = (cfg.peak * (isAccent ? 1.28 : 1) * (isChug ? 1.05 : 1)) / Math.sqrt(ordered.length);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(peak, noteStart + (isChug ? 0.002 : 0.006));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * (isChug ? 0.1 : 0.52)), noteStart + Math.max(0.025, playDur * (isChug ? 0.45 : 0.35)));
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + playDur + (isChug ? 0.035 : 0.18));
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(bus);
    oscA.start(noteStart);
    oscB.start(noteStart);
    oscA.stop(noteStart + playDur + 0.22);
    oscB.stop(noteStart + playDur + 0.22);
  });
}

function guitarToneConfig(tone: string): GuitarConfig {
  if (tone === "clean") return { drive: 0.65, input: 0.62, peak: 0.086, lowpass: 4300, highpass: 90, body: 1.4, mid: 1.0, spread: 0.016, sustain: 1.08, mute: 0.085, scratch: 0.04 };
  if (tone === "crunch") return { drive: 2.4, input: 0.8, peak: 0.092, lowpass: 3600, highpass: 100, body: 2.8, mid: 2.0, spread: 0.013, sustain: 0.98, mute: 0.074, scratch: 0.044 };
  if (tone === "metal") return { drive: 6.2, input: 0.92, peak: 0.088, lowpass: 3050, highpass: 115, body: 4.5, mid: 3.0, spread: 0.009, sustain: 0.86, mute: 0.06, scratch: 0.04 };
  if (tone === "western_twang") return { drive: 1.25, input: 0.68, peak: 0.082, lowpass: 4700, highpass: 125, body: 1.1, mid: 2.4, spread: 0.02, sustain: 0.72, mute: 0.07, scratch: 0.034 };
  return { drive: 4.2, input: 0.88, peak: 0.09, lowpass: 3250, highpass: 108, body: 3.7, mid: 2.6, spread: 0.01, sustain: 0.91, mute: 0.066, scratch: 0.042 };
}

function leadInstrumentConfig(name: string): LeadConfig {
  if (name === "soft") return { wave: "triangle", peak: 0.16, filter: "lowpass", freq: 1700, durMul: 1 };
  if (name === "synth") return { wave: "sawtooth", peak: 0.18, filter: "lowpass", freq: 1500, durMul: 0.95 };
  if (name === "bell") return { wave: "sine", peak: 0.105, filter: "lowpass", freq: 2600, durMul: 1.05 };
  if (name === "lead_guitar") return { wave: "sawtooth", peak: 0.16, filter: "bandpass", freq: 1800, durMul: 0.92 };
  if (name === "distorted_lead_guitar") return { wave: "sawtooth", peak: 0.13, filter: "lowpass", freq: 2400, durMul: 0.86 };
  if (name === "banjo") return { wave: "triangle", peak: 0.13, filter: "bandpass", freq: 2100, durMul: 0.48 };
  if (name === "harmonica") return { wave: "square", peak: 0.115, filter: "bandpass", freq: 1250, durMul: 1.18 };
  if (name === "cowboy_whistle") return { wave: "sine", peak: 0.1, filter: "lowpass", freq: 3200, durMul: 1.12 };
  if (name === "trumpet") return { wave: "square", peak: 0.14, filter: "bandpass", freq: 1650, durMul: 1.05 };
  if (name === "saxophone") return { wave: "triangle", peak: 0.17, filter: "bandpass", freq: 940, durMul: 1.12 };
  return { wave: "square", peak: 0.2, filter: "lowpass", freq: 2300, durMul: 1 };
}

function chordInstrumentConfig(name: string): ChordConfig {
  if (name === "piano") {
    return {
      rootWave: "triangle",
      wave: "triangle",
      peak: 0.23,
      filter: "lowpass",
      freq: 3100,
      filterQ: 0.9,
      attack: 0.003,
      decay: 0.18,
      sustain: 0.18,
      release: 0.16,
      durMul: 0.72,
      spreadMul: 0.45,
      shimmer: false,
      maxLiveDur: 0.82,
      layers: [{ wave: "triangle", level: 1 }, { wave: "sine", freqMul: 2, level: 0.18, detune: 3 }]
    };
  }
  if (name === "saloon_piano") {
    return {
      rootWave: "triangle",
      wave: "triangle",
      peak: 0.205,
      filter: "lowpass",
      freq: 3600,
      filterQ: 1,
      attack: 0.002,
      decay: 0.13,
      sustain: 0.12,
      release: 0.18,
      durMul: 0.62,
      spreadMul: 0.58,
      shimmer: false,
      maxLiveDur: 0.7,
      layers: [{ wave: "triangle", level: 0.88, detune: -8 }, { wave: "triangle", level: 0.62, detune: 9 }, { wave: "sine", freqMul: 2, level: 0.16, detune: 5 }]
    };
  }
  if (name === "harp") {
    return {
      rootWave: "triangle",
      wave: "sine",
      peak: 0.18,
      filter: "lowpass",
      freq: 4600,
      filterQ: 1.4,
      attack: 0.002,
      decay: 0.1,
      sustain: 0.03,
      release: 0.36,
      durMul: 0.5,
      spreadMul: 1.45,
      shimmer: true,
      maxLiveDur: 0.58,
      layers: [{ wave: "triangle", level: 0.9 }, { wave: "sine", freqMul: 2, level: 0.26, detune: 7 }]
    };
  }
  if (name === "warm_pad") {
    return {
      rootWave: "sine",
      wave: "triangle",
      peak: 0.14,
      filter: "lowpass",
      freq: 1200,
      filterQ: 0.65,
      filterSweep: 1700,
      attack: 0.11,
      decay: 0.24,
      sustain: 0.82,
      release: 0.62,
      durMul: 1.35,
      spreadMul: 0.25,
      shimmer: false,
      maxLiveDur: 1.65,
      layers: [{ wave: "sine", level: 0.95, detune: -5 }, { wave: "triangle", level: 0.48, detune: 6 }]
    };
  }
  if (name === "glass") {
    return {
      rootWave: "sine",
      wave: "sine",
      peak: 0.16,
      filter: "bandpass",
      freq: 1500,
      filterQ: 1.15,
      attack: 0.004,
      decay: 0.2,
      sustain: 0.1,
      release: 0.44,
      durMul: 0.9,
      spreadMul: 0.85,
      shimmer: true,
      maxLiveDur: 0.82,
      layers: [{ wave: "sine", level: 0.36 }, { wave: "sine", freqMul: 2.01, level: 0.64 }, { wave: "sine", freqMul: 4.02, level: 0.34 }, { wave: "triangle", freqMul: 6.01, level: 0.12 }]
    };
  }
  return {
    rootWave: "triangle",
    wave: "sine",
    peak: 0.24,
    filter: "lowpass",
    freq: 1800,
    filterQ: 0.8,
    attack: 0.01,
    decay: 0.06,
    sustain: 0.7,
    release: 0.2,
    durMul: 1,
    spreadMul: 1,
    shimmer: false,
    maxLiveDur: 1.15,
    layers: [{ wave: "triangle", level: 0.82 }, { wave: "sine", level: 0.35 }]
  };
}

function getNoise(ctx: BaseAudioContext, seconds: number, key: string): AudioBuffer {
  let buffers = noiseBuffers.get(ctx);
  if (!buffers) {
    buffers = new Map<string, AudioBuffer>();
    noiseBuffers.set(ctx, buffers);
  }
  const cacheKey = `${key}_${seconds.toFixed(3)}`;
  const existing = buffers.get(cacheKey);
  if (existing) return existing;
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  buffers.set(cacheKey, buffer);
  return buffer;
}

function guitarDistortionCurve(amount = 2.5) {
  const key = amount.toFixed(3);
  const cached = guitarCurves.get(key);
  if (cached) return cached;
  const samples = 2048;
  const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
  const drive = Math.max(0.1, amount);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive);
  }
  guitarCurves.set(key, curve);
  return curve;
}

function featureSeed(step: number, seed = 0) {
  const x = Math.sin((step + 1) * 12.9898 + (seed + 1) * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
