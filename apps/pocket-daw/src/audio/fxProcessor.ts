import type { AutomationLane, FxChain, FxPluginInstance, PocketDawProject } from "../daw/schema";
import { evaluateAutomationLane, getFxParameterAutomationLane, interpolateAutomationValue } from "../daw/automation";
import { timelineBarAtSeconds, timelineSecondsAtBar } from "../daw/timeline";
import { POCKET_PRO_EQ_BANDS, POCKET_PRO_EQ_TYPE } from "../../../../packages/pocket-audio-core/src/fx/pro-eq.js";

const impulseBuffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

interface ProEqBand {
  nodeType: BiquadFilterType;
  frequencyParam: string;
  enabledParam: string;
  defaultEnabled: boolean;
  defaultFrequency: number;
  minFrequency: number;
  maxFrequency: number;
  gainParam?: string;
  defaultGain?: number;
  minGain?: number;
  maxGain?: number;
  qParam?: string;
  defaultQ?: number;
  minQ?: number;
  maxQ?: number;
}

const PRO_EQ_BANDS = POCKET_PRO_EQ_BANDS as unknown as readonly ProEqBand[];

export interface ConnectedFxChain {
  cleanup: () => void;
}

export interface FxAutomationPlaybackContext {
  project: PocketDawProject;
  projectStartSeconds?: number;
}

interface FxSlotAutomationContext extends FxAutomationPlaybackContext {
  chainId: string;
}

export function connectFxChain(ctx: BaseAudioContext, source: AudioNode, destination: AudioNode, chain: FxChain | null | undefined, automation?: FxAutomationPlaybackContext): ConnectedFxChain {
  let current: AudioNode = source;
  const cleanup: Array<() => void> = [];
  (chain?.slots || []).forEach((slot) => {
    if (!slot.enabled) return;
    const connected = connectFxSlot(ctx, current, slot, chain && automation ? { ...automation, chainId: chain.id } : undefined);
    current = connected.output;
    cleanup.push(...connected.cleanup);
  });
  current.connect(destination);
  return {
    cleanup: () => {
      cleanup.forEach((fn) => fn());
      safelyDisconnect(source);
      safelyDisconnect(current);
    }
  };
}

function connectFxSlot(ctx: BaseAudioContext, source: AudioNode, slot: FxPluginInstance, automation?: FxSlotAutomationContext): { output: AudioNode; cleanup: Array<() => void> } {
  if (slot.type === "utility-gain") {
    const gain = ctx.createGain();
    setAutomatedAudioParam(ctx, gain.gain, slot, "gain", num(slot, "gain", 1), 0, 4, automation);
    source.connect(gain);
    return { output: gain, cleanup: [] };
  }
  if (slot.type === "high-pass" || slot.type === "low-pass") {
    const filter = ctx.createBiquadFilter();
    filter.type = slot.type === "high-pass" ? "highpass" : "lowpass";
    setAutomatedAudioParam(ctx, filter.frequency, slot, "frequency", num(slot, "frequency", slot.type === "high-pass" ? 80 : 12000), 20, 20000, automation);
    setAutomatedAudioParam(ctx, filter.Q, slot, "q", num(slot, "q", 0.7), 0.1, 20, automation);
    source.connect(filter);
    return { output: filter, cleanup: [] };
  }
  if (slot.type === "three-band-eq") {
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 180;
    setAutomatedAudioParam(ctx, low.gain, slot, "lowGain", num(slot, "lowGain", 0), -24, 24, automation);
    mid.type = "peaking";
    setAutomatedAudioParam(ctx, mid.frequency, slot, "midFrequency", num(slot, "midFrequency", 1200), 20, 20000, automation);
    mid.Q.value = 1;
    setAutomatedAudioParam(ctx, mid.gain, slot, "midGain", num(slot, "midGain", 0), -24, 24, automation);
    high.type = "highshelf";
    high.frequency.value = 5200;
    setAutomatedAudioParam(ctx, high.gain, slot, "highGain", num(slot, "highGain", 0), -24, 24, automation);
    source.connect(low);
    low.connect(mid);
    mid.connect(high);
    return { output: high, cleanup: [] };
  }
  if (slot.type === POCKET_PRO_EQ_TYPE) {
    return connectPocketProEq(ctx, source, slot, automation);
  }
  if (slot.type === "compressor" || slot.type === "limiter") {
    const comp = ctx.createDynamicsCompressor();
    setAutomatedAudioParam(ctx, comp.threshold, slot, "threshold", num(slot, "threshold", slot.type === "limiter" ? -4 : -20), -80, 0, automation);
    comp.knee.value = slot.type === "limiter" ? 0 : 12;
    setAutomatedAudioParam(ctx, comp.ratio, slot, "ratio", num(slot, "ratio", slot.type === "limiter" ? 18 : 3), 1, 30, automation);
    setAutomatedAudioParam(ctx, comp.attack, slot, "attack", num(slot, "attack", 0.004), 0, 2, automation);
    setAutomatedAudioParam(ctx, comp.release, slot, "release", num(slot, "release", 0.12), 0, 2, automation);
    source.connect(comp);
    return { output: comp, cleanup: [] };
  }
  if (slot.type === "noise-gate") {
    const shaper = ctx.createWaveShaper();
    shaper.curve = gateCurve(dbToAmp(num(slot, "threshold", -48)), num(slot, "reduction", 0.18));
    source.connect(shaper);
    return { output: shaper, cleanup: [] };
  }
  if (slot.type === "saturation" || slot.type === "bitcrusher") {
    const shaper = ctx.createWaveShaper();
    shaper.curve = slot.type === "saturation" ? saturationCurve(num(slot, "drive", 1.8)) : bitcrusherCurve(num(slot, "bits", 8));
    return { output: wetDry(ctx, source, shaper, shaper, num(slot, "mix", slot.type === "saturation" ? 0.65 : 0.45), slot, automation), cleanup: [] };
  }
  if (slot.type === "delay" || slot.type === "ping-pong-delay") {
    const delay = ctx.createDelay(2);
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const pan = "createStereoPanner" in ctx && slot.type === "ping-pong-delay" ? ctx.createStereoPanner() : null;
    setAutomatedAudioParam(ctx, delay.delayTime, slot, "time", num(slot, "time", 0.24), 0, 2, automation);
    setAutomatedAudioParam(ctx, feedback.gain, slot, "feedback", clamp(num(slot, "feedback", 0.3), 0, 0.82), 0, 0.82, automation);
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay);
    if (pan) {
      pan.pan.value = 0.42;
      filter.connect(pan);
      return { output: wetDry(ctx, source, delay, pan, num(slot, "mix", 0.3), slot, automation), cleanup: [] };
    }
    return { output: wetDry(ctx, source, delay, filter, num(slot, "mix", 0.3), slot, automation), cleanup: [] };
  }
  if (slot.type === "reverb") {
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse(ctx, num(slot, "decay", 1.8));
    return { output: wetDry(ctx, source, convolver, convolver, num(slot, "mix", 0.24), slot, automation), cleanup: [] };
  }
  if (slot.type === "chorus" || slot.type === "phaser") {
    const delay = ctx.createDelay(0.08);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    delay.delayTime.value = slot.type === "chorus" ? 0.018 : 0.006;
    setAutomatedAudioParam(ctx, lfo.frequency, slot, "rate", num(slot, "rate", slot.type === "chorus" ? 0.8 : 0.45), 0.01, 20, automation);
    setAutomatedAudioParam(ctx, depth.gain, slot, "depth", slot.type === "chorus" ? num(slot, "depth", 0.012) : num(slot, "depth", 650) / 100000, 0, slot.type === "chorus" ? 1 : 0.02, automation);
    lfo.connect(depth);
    depth.connect(delay.delayTime);
    lfo.start(ctx.currentTime);
    return {
      output: wetDry(ctx, source, delay, delay, num(slot, "mix", 0.34), slot, automation),
      cleanup: [() => safelyStop(lfo)]
    };
  }
  if (slot.type === "tremolo-autopan") {
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    setAutomatedAudioParam(ctx, lfo.frequency, slot, "rate", num(slot, "rate", 4), 0.01, 20, automation);
    setAutomatedAudioParam(ctx, depth.gain, slot, "depth", clamp(num(slot, "depth", 0.38), 0, 0.9), 0, 0.9, automation);
    gain.gain.value = 1 - depth.gain.value * 0.5;
    lfo.connect(depth);
    depth.connect(gain.gain);
    source.connect(gain);
    lfo.start(ctx.currentTime);
    return { output: gain, cleanup: [() => safelyStop(lfo)] };
  }
  return { output: source, cleanup: [] };
}

function connectPocketProEq(ctx: BaseAudioContext, source: AudioNode, slot: FxPluginInstance, automation?: FxSlotAutomationContext): { output: AudioNode; cleanup: Array<() => void> } {
  let current = source;
  let hasBand = false;
  PRO_EQ_BANDS.forEach((band) => {
    if (!bool(slot, band.enabledParam, band.defaultEnabled)) return;
    const filter = ctx.createBiquadFilter();
    filter.type = band.nodeType;
    setAutomatedAudioParam(ctx, filter.frequency, slot, band.frequencyParam, clamp(num(slot, band.frequencyParam, band.defaultFrequency), band.minFrequency, band.maxFrequency), band.minFrequency, band.maxFrequency, automation);
    if (band.gainParam) setAutomatedAudioParam(ctx, filter.gain, slot, band.gainParam, clamp(num(slot, band.gainParam, band.defaultGain ?? 0), band.minGain ?? -12, band.maxGain ?? 12), band.minGain ?? -12, band.maxGain ?? 12, automation);
    if (band.qParam) setAutomatedAudioParam(ctx, filter.Q, slot, band.qParam, clamp(num(slot, band.qParam, band.defaultQ ?? 1), band.minQ ?? 0.1, band.maxQ ?? 8), band.minQ ?? 0.1, band.maxQ ?? 8, automation);
    current.connect(filter);
    current = filter;
    hasBand = true;
  });
  return { output: hasBand ? current : source, cleanup: [] };
}

function wetDry(ctx: BaseAudioContext, source: AudioNode, effectInput: AudioNode, effectOutput: AudioNode, mix: number, slot?: FxPluginInstance, automation?: FxSlotAutomationContext): AudioNode {
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const out = ctx.createGain();
  const safeMix = clamp(mix, 0, 1);
  if (slot && automation) {
    setAutomatedAudioParam(ctx, dry.gain, slot, "mix", safeMix, 0, 1, automation, (value) => 1 - value);
    setAutomatedAudioParam(ctx, wet.gain, slot, "mix", safeMix, 0, 1, automation);
  } else {
    dry.gain.value = 1 - safeMix;
    wet.gain.value = safeMix;
  }
  source.connect(dry);
  source.connect(effectInput);
  effectOutput.connect(wet);
  dry.connect(out);
  wet.connect(out);
  return out;
}

function setAutomatedAudioParam(
  ctx: BaseAudioContext,
  param: AudioParam,
  slot: FxPluginInstance,
  parameter: string,
  fallback: number,
  min: number,
  max: number,
  automation?: FxSlotAutomationContext,
  transform: (value: number) => number = (value) => value
) {
  const safeFallback = clamp(fallback, min, max);
  param.value = transform(safeFallback);
  if (!automation) return;
  const lane = getFxParameterAutomationLane(automation.project, automation.chainId, slot.id, parameter);
  if (!lane?.enabled || !lane.points.length) return;
  scheduleAutomationLane(ctx, param, automation, lane, safeFallback, min, max, transform);
}

function scheduleAutomationLane(
  ctx: BaseAudioContext,
  param: AudioParam,
  automation: FxSlotAutomationContext,
  lane: AutomationLane,
  fallback: number,
  min: number,
  max: number,
  transform: (value: number) => number
) {
  const contextNow = ctx.currentTime || 0;
  const projectStartSeconds = Math.max(0, automation.projectStartSeconds || 0);
  const startBar = timelineBarAtSeconds(automation.project, projectStartSeconds);
  const initial = transform(clamp(evaluateAutomationLane(lane, startBar, fallback), min, max));
  param.cancelScheduledValues(contextNow);
  param.setValueAtTime(initial, contextNow);
  const points = lane.points.slice().sort((a, b) => a.bar - b.bar);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (b.bar <= startBar) continue;
    const segmentStartBar = Math.max(a.bar, startBar);
    const segmentStartTime = Math.max(contextNow, contextNow + Math.max(0, timelineSecondsAtBar(automation.project, segmentStartBar) - projectStartSeconds));
    const segmentEndTime = contextNow + Math.max(0, timelineSecondsAtBar(automation.project, b.bar) - projectStartSeconds);
    if (segmentEndTime <= contextNow || segmentEndTime <= segmentStartTime) continue;
    const segmentStartValue = clamp(evaluateAutomationLane(lane, segmentStartBar, fallback), min, max);
    const segmentEndValue = clamp(b.value, min, max);
    if (a.curve === "hold") {
      param.setValueAtTime(transform(segmentStartValue), segmentStartTime);
      param.setValueAtTime(transform(segmentEndValue), segmentEndTime);
    } else if (!a.curve || a.curve === "linear") {
      param.setValueAtTime(transform(segmentStartValue), segmentStartTime);
      param.linearRampToValueAtTime(transform(segmentEndValue), segmentEndTime);
    } else {
      const steps = 12;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const bar = segmentStartBar + (b.bar - segmentStartBar) * t;
        const time = segmentStartTime + (segmentEndTime - segmentStartTime) * t;
        const value = interpolateAutomationValue(segmentStartValue, segmentEndValue, t, a.curve);
        param.setValueAtTime(transform(clamp(value, min, max)), time);
      }
    }
  }
}

function num(slot: FxPluginInstance, key: string, fallback: number) {
  const value = Number(slot.parameters[key]);
  return Number.isFinite(value) ? value : fallback;
}

function bool(slot: FxPluginInstance, key: string, fallback: boolean) {
  const value = slot.parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dbToAmp(db: number) {
  return Math.pow(10, db / 20);
}

function gateCurve(threshold: number, reduction: number) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.abs(x) < threshold ? x * reduction : x;
  }
  return curve;
}

function saturationCurve(drive: number) {
  const curve = new Float32Array(2048);
  const safeDrive = Math.max(0.1, drive);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * safeDrive);
  }
  return curve;
}

function bitcrusherCurve(bits: number) {
  const curve = new Float32Array(2048);
  const steps = Math.max(2, Math.pow(2, clamp(Math.round(bits), 2, 16)));
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function impulse(ctx: BaseAudioContext, decay: number) {
  let buffers = impulseBuffers.get(ctx);
  if (!buffers) {
    buffers = new Map<string, AudioBuffer>();
    impulseBuffers.set(ctx, buffers);
  }
  const safeDecay = clamp(decay, 0.2, 6);
  const key = safeDecay.toFixed(3);
  const existing = buffers.get(key);
  if (existing) return existing;
  const length = Math.max(1, Math.floor(ctx.sampleRate * safeDecay));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const fade = Math.pow(1 - i / length, 2.1);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
  }
  buffers.set(key, buffer);
  return buffer;
}

function safelyStop(node: AudioScheduledSourceNode) {
  try {
    node.stop();
  } catch {
    // Already stopped.
  }
  safelyDisconnect(node);
}

function safelyDisconnect(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}
