import type { RenderedEvent } from "./eventRenderer";
import {
  DEFAULT_CHORD_INSTRUMENT,
  DEFAULT_MELODY_INSTRUMENT,
  findPocketChordInstrumentConfig,
  findPocketLeadInstrumentConfig,
  pocketLeadExtraLayers
} from "../../../../packages/pocket-audio-core/src/sounds/instruments.js";
import { DEFAULT_GUITAR_STRUM_MODE, DEFAULT_GUITAR_TONE, POCKET_GUITAR_TONE_CONFIGS } from "../../../../packages/pocket-audio-core/src/sounds/guitar.js";
import {
  POCKET_DRUM_KIT_CONFIGS,
  POCKET_BASS_TONE_CONFIGS,
  resolvePocketBassToneId,
  resolvePocketDrumKitId
} from "../../../../packages/pocket-audio-core/src/sounds/lofi-registry.js";
import { CHORDSMITH_LIVE_DRUM_VOICES } from "../../../../packages/pocket-audio-core/src/sounds/drum-lanes.js";
import { chordsmithFeatureSeed } from "../../../../packages/pocket-audio-core/src/performance/humanize.js";
import {
  CHORDSMITH_LOFI_TEXTURE_LIVE,
  chordsmithLofiTextureLiveCrackleFrequency,
  chordsmithLofiTextureLiveCrackleShouldTrigger,
  chordsmithLofiTextureLiveHissLowpass
} from "../../../../packages/pocket-audio-core/src/performance/lofi-texture.js";

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
  extra?: LeadExtraConfig;
  extras?: LeadExtraConfig[];
}

interface LeadExtraConfig {
  freqMul: number;
  slideFreqMul?: number;
  midiOffset?: number;
  wave: OscillatorType;
  peak: number;
  peakScale: number;
  filter: BiquadFilterType;
  freq: number;
  offset: number;
  durMul: number;
  maxDur?: number;
}

interface BassConfig {
  mainWave: OscillatorType;
  subWave: OscillatorType;
  mainPeak: number;
  subPeak: number;
  cutoff: number;
  subCutoff: number;
  attack: number;
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
const LIVE_DRUM_VOICES = CHORDSMITH_LIVE_DRUM_VOICES as Record<string, Record<string, number | readonly number[] | boolean>>;

export interface ScheduleInstrumentEventOptions {
  lateGuardSeconds?: number;
  maxLateSeconds?: number;
  onLate?: (latenessSeconds: number) => void;
  onSkippedLate?: (latenessSeconds: number) => void;
}

export function scheduleInstrumentEvent(ctx: BaseAudioContext, destination: AudioNode, event: RenderedEvent, options: ScheduleInstrumentEventOptions = {}): boolean {
  const lateness = ctx.currentTime - event.time;
  const maxLateSeconds = options.maxLateSeconds ?? 0.12;
  if (lateness > maxLateSeconds) {
    options.onLate?.(lateness);
    options.onSkippedLate?.(lateness);
    return false;
  }
  if (lateness > 0) options.onLate?.(lateness);
  const t = lateness > 0 ? ctx.currentTime + (options.lateGuardSeconds ?? 0.005) : event.time;
  const duration = Math.max(0.025, event.duration - Math.max(0, lateness));
  const eventDestination = destinationForEventPan(ctx, destination, event.pan || 0);
  if (event.kind === "kick") {
    if (lateness > 0.045) {
      options.onSkippedLate?.(lateness);
      return false;
    }
    kick(ctx, eventDestination, t, event.velocity, event.drumKit, event.audioProfile, event.lofiPreset);
    return true;
  }
  if (event.kind === "snare") {
    if (lateness > 0.045) {
      options.onSkippedLate?.(lateness);
      return false;
    }
    snare(ctx, eventDestination, t, event.velocity, event.drumKit, event.audioProfile, event.lofiPreset);
    return true;
  }
  if (event.kind === "clap") {
    clap(ctx, eventDestination, t, event.velocity);
    return true;
  }
  if (event.kind === "hat") {
    if (lateness > 0.035) {
      options.onSkippedLate?.(lateness);
      return false;
    }
    hat(ctx, eventDestination, t, event.velocity, !!event.accent, event.drumKit, event.audioProfile, event.lofiPreset);
    return true;
  }
  if (event.kind === "openhat") {
    hat(ctx, eventDestination, t, event.velocity, true, event.drumKit, event.audioProfile, event.lofiPreset);
    return true;
  }
  if (event.kind === "tomlow" || event.kind === "tommid" || event.kind === "tomhi") {
    tom(ctx, eventDestination, t, event.velocity, event.kind);
    return true;
  }
  if (event.kind === "crash" || event.kind === "ride") {
    cymbal(ctx, eventDestination, t, event.velocity, event.kind);
    return true;
  }
  if (event.kind === "texture") {
    lofiTexture(ctx, destination, t, event.duration, event.lofiTexture, event.step);
    return true;
  }
  if (event.kind === "bass" && event.midi !== undefined) {
    bass(ctx, destination, event.midi, t, duration, event.velocity, !!event.accent, event.slideMidi, event.slideOffset, event.bassTone);
    return true;
  }
  if (event.kind === "melody" && event.midi !== undefined) {
    leadPhrase(ctx, destination, event.midi, t, duration, event.instrument || DEFAULT_MELODY_INSTRUMENT, event.pan || 0, event.velocity, event.slideMidi, event.slideOffset);
    return true;
  }
  if (event.kind === "midi" && event.midi !== undefined) {
    leadPhrase(ctx, destination, event.midi, t, duration, "soft", event.pan || 0, event.velocity, undefined, undefined, event.detuneCents);
    return true;
  }
  if (event.kind === "chord" && event.midiNotes) {
    chord(ctx, destination, event.midiNotes, t, duration, event.instrument || DEFAULT_CHORD_INSTRUMENT, event.velocity, event.articulation || "block");
    return true;
  }
  if (event.kind === "guitar" && event.midiNotes) {
    guitar(ctx, destination, event.midiNotes, t, duration, event.articulation || "open", event.instrument || DEFAULT_GUITAR_TONE, event.direction || DEFAULT_GUITAR_STRUM_MODE, event.step);
    return true;
  }
  return false;
}

function destinationForEventPan(ctx: BaseAudioContext, destination: AudioNode, pan: number): AudioNode {
  if (Math.abs(pan) < 0.001 || !("createStereoPanner" in ctx)) return destination;
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(clamp(pan, -1, 1), ctx.currentTime || 0);
  panner.connect(destination);
  return panner;
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

function kick(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.95, drumKit?: string, audioProfile?: string, lofiPreset?: string) {
  const kit = lofiDrumKit(drumKit, audioProfile, lofiPreset);
  const cfg = POCKET_DRUM_KIT_CONFIGS[kit as keyof typeof POCKET_DRUM_KIT_CONFIGS];
  if (cfg) {
    const kickCfg = cfg.kick as Record<string, number>;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let output: AudioNode = osc;
    osc.type = "sine";
    osc.frequency.setValueAtTime(kickCfg.startFreq, start);
    osc.frequency.exponentialRampToValueAtTime(kickCfg.endFreq, start + kickCfg.sweepSeconds);
    if (kickCfg.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(kickCfg.filterFreq, start);
      osc.connect(filter);
      output = filter;
    }
    gain.gain.setValueAtTime(Math.max(kickCfg.gainFloor, peak * kickCfg.gainScale), start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + kickCfg.rampSeconds);
    output.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(start + kickCfg.length);
    return;
  }
}

function snare(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.5, drumKit?: string, audioProfile?: string, lofiPreset?: string) {
  const kit = lofiDrumKit(drumKit, audioProfile, lofiPreset);
  const cfg = POCKET_DRUM_KIT_CONFIGS[kit as keyof typeof POCKET_DRUM_KIT_CONFIGS];
  if (cfg) {
    const snareCfg = cfg.snare as Record<string, number>;
    const noise = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    let output: AudioNode = highpass;
    noise.buffer = getNoise(ctx, snareCfg.noiseSeconds, kit === "classic" ? "snare" : `snare_${kit}`);
    highpass.type = "highpass";
    highpass.frequency.value = snareCfg.highpass;
    if (snareCfg.lowpass) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = snareCfg.lowpass;
      highpass.connect(lowpass);
      output = lowpass;
    }
    gain.gain.setValueAtTime(Math.max(snareCfg.gainFloor, peak * snareCfg.gainScale), start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + snareCfg.rampSeconds);
    noise.connect(highpass);
    output.connect(gain);
    gain.connect(destination);
    noise.start(start);
    noise.stop(start + snareCfg.length);

    if (snareCfg.bodyFreq) {
      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(snareCfg.bodyFreq, start);
      bodyGain.gain.setValueAtTime(snareCfg.bodyGain, start);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, start + snareCfg.bodyRampSeconds);
      body.connect(bodyGain);
      bodyGain.connect(destination);
      body.start(start);
      body.stop(start + snareCfg.bodyLength);
    }
    return;
  }
}

function hat(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.16, open = false, drumKit?: string, audioProfile?: string, lofiPreset?: string) {
  const kit = lofiDrumKit(drumKit, audioProfile, lofiPreset);
  const cfg = POCKET_DRUM_KIT_CONFIGS[kit as keyof typeof POCKET_DRUM_KIT_CONFIGS];
  if (cfg) {
    const hatCfg = cfg.hat as Record<string, number>;
    const hatLen = open ? hatCfg.openLength : hatCfg.closedLength;
    const noise = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    let output: AudioNode = highpass;
    noise.buffer = getNoise(ctx, hatLen, kit === "classic" ? (open ? "hat_open" : "hat_closed") : `${open ? "hat_open" : "hat_closed"}_${kit}`);
    highpass.type = "highpass";
    highpass.frequency.value = open ? hatCfg.highpassOpen : hatCfg.highpassClosed;
    if (hatCfg.lowpass) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = hatCfg.lowpass;
      highpass.connect(lowpass);
      output = lowpass;
    }
    gain.gain.setValueAtTime(
      Math.max(open ? hatCfg.gainFloorOpen : hatCfg.gainFloorClosed, peak * (open ? hatCfg.gainScaleOpen : hatCfg.gainScaleClosed)),
      start
    );
    gain.gain.exponentialRampToValueAtTime(0.001, start + (open ? hatCfg.rampSecondsOpen : hatCfg.rampSecondsClosed));
    noise.connect(highpass);
    output.connect(gain);
    gain.connect(destination);
    noise.start(start);
    noise.stop(start + hatLen);
    return;
  }
}

function clap(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = Number(LIVE_DRUM_VOICES.clap.peak)) {
  const voice = LIVE_DRUM_VOICES.clap;
  const offsets = voice.burstOffsets as readonly number[];
  offsets.forEach((offset, index) => {
    const noise = ctx.createBufferSource();
    const bandpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = getNoise(ctx, Number(voice.noiseSeconds), `clap_${index}`);
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(Number(voice.bandpassBase) + index * Number(voice.bandpassStep), start + offset);
    bandpass.Q.value = Number(voice.bandpassQ);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.linearRampToValueAtTime(Math.max(Number(voice.gainFloor), peak), start + offset + Number(voice.attackSeconds));
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + Number(voice.releaseSeconds));
    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(destination);
    noise.start(start + offset);
    noise.stop(start + offset + Number(voice.noiseSeconds));
  });
}

function tom(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.5, lane: "tomlow" | "tommid" | "tomhi") {
  const voice = LIVE_DRUM_VOICES[lane];
  const freq = Number(voice.frequency);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * Number(voice.endFrequencyRatio), start + Number(voice.sweepSeconds));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(Number(voice.gainFloor), peak), start + Number(voice.attackSeconds));
  gain.gain.exponentialRampToValueAtTime(0.001, start + Number(voice.releaseSeconds));
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + Number(voice.stopSeconds));
}

function cymbal(ctx: BaseAudioContext, destination: AudioNode, start: number, peak = 0.4, lane: "crash" | "ride") {
  const voice = LIVE_DRUM_VOICES[lane];
  const len = Number(voice.durationSeconds);
  const noise = ctx.createBufferSource();
  const highpass = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  noise.buffer = getNoise(ctx, len, lane);
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(Number(voice.highpass), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(Number(voice.gainFloor), peak), start + Number(voice.attackSeconds));
  gain.gain.exponentialRampToValueAtTime(0.001, start + len);
  noise.connect(highpass);
  highpass.connect(gain);
  gain.connect(destination);
  noise.start(start);
  noise.stop(start + len);
  if (lane === "ride") {
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = "triangle";
    bell.frequency.setValueAtTime(Number(voice.bellFrequency), start);
    bellGain.gain.setValueAtTime(Number(voice.bellGain), start);
    bellGain.gain.exponentialRampToValueAtTime(0.001, start + Number(voice.bellReleaseSeconds));
    bell.connect(bellGain);
    bellGain.connect(destination);
    bell.start(start);
    bell.stop(start + Number(voice.bellStopSeconds));
  }
}

function lofiTexture(ctx: BaseAudioContext, destination: AudioNode, start: number, duration: number, texture: Record<string, unknown> | undefined, step: number) {
  if (!texture?.enabled) return;
  const hiss = lofiAmount(texture, "tapeHiss", 0.05);
  const crackle = lofiAmount(texture, "vinylCrackle", 0.04);
  const age = lofiAmount(texture, "lowPassAge", 0.18);
  if (hiss > 0.005) {
    const len = Math.max(0.08, Math.min(CHORDSMITH_LOFI_TEXTURE_LIVE.hissSeconds, duration || CHORDSMITH_LOFI_TEXTURE_LIVE.hissSeconds));
    const noise = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const lowpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = getNoise(ctx, len, `lofi_hiss_${Math.round(hiss * 100)}_${Math.round(age * 100)}`);
    highpass.type = "highpass";
    highpass.frequency.value = CHORDSMITH_LOFI_TEXTURE_LIVE.hissHighpassHz;
    lowpass.type = "lowpass";
    lowpass.frequency.value = chordsmithLofiTextureLiveHissLowpass(age);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(CHORDSMITH_LOFI_TEXTURE_LIVE.hissGain * hiss, start + CHORDSMITH_LOFI_TEXTURE_LIVE.hissAttackSeconds);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.min(CHORDSMITH_LOFI_TEXTURE_LIVE.hissReleaseSeconds, len));
    noise.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(destination);
    noise.start(start);
    noise.stop(start + len);
  }
  if (crackle > 0.01 && chordsmithLofiTextureLiveCrackleShouldTrigger(step, crackle)) {
    const noise = ctx.createBufferSource();
    const bandpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = getNoise(ctx, CHORDSMITH_LOFI_TEXTURE_LIVE.crackleSeconds, `lofi_crackle_${step % 19}`);
    bandpass.type = "bandpass";
    bandpass.frequency.value = chordsmithLofiTextureLiveCrackleFrequency(step);
    bandpass.Q.value = CHORDSMITH_LOFI_TEXTURE_LIVE.crackleBandpassQ;
    gain.gain.setValueAtTime(CHORDSMITH_LOFI_TEXTURE_LIVE.crackleGain * crackle, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + CHORDSMITH_LOFI_TEXTURE_LIVE.crackleDecaySeconds);
    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(destination);
    noise.start(start);
    noise.stop(start + CHORDSMITH_LOFI_TEXTURE_LIVE.crackleStopSeconds);
  }
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
  slideOffset: number | undefined,
  toneName?: string
) {
  if (slideMidi === undefined || slideOffset === undefined) {
    const bassDur = Math.max(0.08, dur);
    const cfg = bassToneConfig(toneName);
    const mainCutoff = accent ? cfg.cutoff * 1.18 : cfg.cutoff;
    tone(ctx, destination, midi, start, accent ? bassDur * 1.35 : bassDur, cfg.mainWave, peak * (accent ? 1.12 : 1) * cfg.mainPeak, "lowpass", mainCutoff);
    tone(ctx, destination, midi - 12, start, bassDur * 0.82, cfg.subWave, peak * cfg.subPeak, "lowpass", cfg.subCutoff);
    return;
  }
  bassSlide(ctx, destination, midi, slideMidi, start, dur, peak, accent, slideOffset, toneName);
}

function bassSlide(ctx: BaseAudioContext, destination: AudioNode, midi: number, targetMidi: number, start: number, dur: number, peak: number, accent: boolean, slideOffset: number, toneName?: string) {
  const cfg = bassToneConfig(toneName);
  const endAt = start + Math.max(0.08, dur) + 0.22;
  const slideAt = Math.max(start + 0.02, start + slideOffset);
  const mainCutoff = accent ? cfg.cutoff * 1.18 : cfg.cutoff;
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
    adsr(gain, start, 0.01, 0.06, 0.7, Math.max(0.08, dur), peak * (accent ? 1.18 : 1) * peakMul);
    osc.start(start);
    osc.stop(endAt);
  };
  makeVoice(midi, targetMidi, cfg.mainWave, cfg.mainPeak, mainCutoff);
  makeVoice(midi - 12, targetMidi - 12, cfg.subWave, cfg.subPeak, cfg.subCutoff);
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
  instrument = DEFAULT_MELODY_INSTRUMENT,
  pan = 0,
  peakMul = 1,
  slideMidi?: number,
  slideOffset?: number,
  detuneCents = 0
) {
  const detuneSemitones = cleanDetuneSemitones(detuneCents);
  if (slideMidi === undefined || slideOffset === undefined) {
    lead(ctx, destination, midi + detuneSemitones, start, dur, instrument, pan, peakMul);
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
    osc.frequency.setValueAtTime(midiToFreq(midi + detuneSemitones) * freqMul, start);
    osc.frequency.linearRampToValueAtTime(midiToFreq(slideMidi + detuneSemitones) * freqMul, Math.min(endAt - 0.03, slideAt + 0.08));
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
  scheduleLeadExtraLayers(makeVoice, cfg);
}

function cleanDetuneSemitones(detuneCents: number): number {
  const cents = Number.isFinite(detuneCents) ? detuneCents : 0;
  return Math.max(-2, Math.min(2, cents / 100));
}

function lead(ctx: BaseAudioContext, destination: AudioNode, midi: number, start: number, dur = 0.28, instrument = DEFAULT_MELODY_INSTRUMENT, pan = 0, peakMul = 1) {
  const cfg = leadInstrumentConfig(instrument);
  tone(ctx, destination, midi, start, dur * cfg.durMul, cfg.wave, cfg.peak * peakMul, cfg.filter, cfg.freq, pan);
  const makeVoice = (freqMul = 1, wave: OscillatorType, peakScale = 1, filterType: BiquadFilterType, filterFreq: number, offset = 0, durMul = 1) => {
    toneFreq(ctx, destination, midiToFreq(midi) * freqMul, start + offset, dur * durMul, wave, peakScale * peakMul, filterType, filterFreq, pan);
  };
  for (const extra of leadExtraLayers(cfg)) {
    const extraMidi = midi + (Number(extra.midiOffset) || 0);
    const extraDur = Math.min(extra.maxDur ?? Number.POSITIVE_INFINITY, dur * extra.durMul);
    toneFreq(ctx, destination, midiToFreq(extraMidi) * extra.freqMul, start + extra.offset, extraDur, extra.wave, extra.peak * peakMul, extra.filter, extra.freq, pan);
  }
}

function scheduleLeadExtraLayers(
  makeVoice: (freqMul?: number, waveOverride?: OscillatorType | null, peakScale?: number, filterType?: BiquadFilterType, filterFreq?: number) => void,
  cfg: LeadConfig
) {
  for (const extra of leadExtraLayers(cfg)) {
    makeVoice(extra.slideFreqMul ?? extra.freqMul, extra.wave, extra.peakScale, extra.filter, extra.freq);
  }
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
    oscA.detune.setValueAtTime((chordsmithFeatureSeed(step, index + 50) - 0.5) * 4, noteStart);
    oscB.detune.setValueAtTime((chordsmithFeatureSeed(step, index + 70) - 0.5) * 5, noteStart);
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
  return {
    ...(POCKET_GUITAR_TONE_CONFIGS[tone as keyof typeof POCKET_GUITAR_TONE_CONFIGS] || POCKET_GUITAR_TONE_CONFIGS[DEFAULT_GUITAR_TONE as keyof typeof POCKET_GUITAR_TONE_CONFIGS])
  };
}

function leadInstrumentConfig(name: string): LeadConfig {
  return leadConfigFromRegistry(findPocketLeadInstrumentConfig(name));
}

function leadConfigFromRegistry(cfg: Record<string, unknown>): LeadConfig {
  return {
    wave: cfg.wave as OscillatorType,
    peak: Number(cfg.peak),
    filter: cfg.filter as BiquadFilterType,
    freq: Number(cfg.freq),
    durMul: Number(cfg.durMul),
    extra: leadExtraFromRegistry(cfg.extra),
    extras: Array.isArray(cfg.extras) ? (cfg.extras as unknown[]).map((extra: unknown) => leadExtraFromRegistry(extra)).filter((extra): extra is LeadExtraConfig => !!extra) : undefined
  };
}

function leadExtraLayers(cfg: LeadConfig): LeadExtraConfig[] {
  return (pocketLeadExtraLayers(cfg as unknown as Record<string, unknown>) as unknown[])
    .map((extra: unknown) => leadExtraFromRegistry(extra))
    .filter((extra): extra is LeadExtraConfig => !!extra);
}

function leadExtraFromRegistry(extra: unknown): LeadExtraConfig | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const item = extra as Record<string, unknown>;
  return {
    freqMul: Number(item.freqMul ?? 1),
    slideFreqMul: item.slideFreqMul === undefined ? undefined : Number(item.slideFreqMul),
    midiOffset: item.midiOffset === undefined ? undefined : Number(item.midiOffset),
    wave: item.wave as OscillatorType,
    peak: Number(item.peak ?? 0),
    peakScale: Number(item.peakScale ?? item.peak ?? 0),
    filter: item.filter as BiquadFilterType,
    freq: Number(item.freq ?? 0),
    offset: Number(item.offset ?? 0),
    durMul: Number(item.durMul ?? 1),
    maxDur: item.maxDur === undefined ? undefined : Number(item.maxDur)
  };
}

function bassToneConfig(name?: string): BassConfig {
  const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(name) as keyof typeof POCKET_BASS_TONE_CONFIGS];
  return {
    ...cfg,
    mainWave: cfg.mainWave as OscillatorType,
    subWave: cfg.subWave as OscillatorType
  };
}

function chordInstrumentConfig(name: string): ChordConfig {
  return chordConfigFromRegistry(findPocketChordInstrumentConfig(name));
}

function chordConfigFromRegistry(cfg: Record<string, unknown>): ChordConfig {
  return {
    ...cfg,
    rootWave: cfg.rootWave as OscillatorType,
    wave: cfg.wave as OscillatorType,
    filter: cfg.filter as BiquadFilterType,
    peak: Number(cfg.peak),
    freq: Number(cfg.freq),
    filterQ: Number(cfg.filterQ),
    attack: Number(cfg.attack),
    decay: Number(cfg.decay),
    sustain: Number(cfg.sustain),
    release: Number(cfg.release),
    durMul: Number(cfg.durMul),
    spreadMul: Number(cfg.spreadMul),
    shimmer: !!cfg.shimmer,
    maxLiveDur: Number(cfg.maxLiveDur),
    filterSweep: cfg.filterSweep === undefined ? undefined : Number(cfg.filterSweep),
    layers: (cfg.layers as Record<string, unknown>[]).map((layer) => ({
      ...layer,
      wave: layer.wave as OscillatorType,
      freqMul: layer.freqMul === undefined ? undefined : Number(layer.freqMul),
      detune: layer.detune === undefined ? undefined : Number(layer.detune),
      level: layer.level === undefined ? undefined : Number(layer.level)
    }))
  };
}

function lofiDrumKit(drumKit?: string, audioProfile?: string, lofiPreset?: string) {
  return resolvePocketDrumKitId(drumKit, audioProfile, lofiPreset);
}

function lofiAmount(texture: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(texture[key] ?? fallback);
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
