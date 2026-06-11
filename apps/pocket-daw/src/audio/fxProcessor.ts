import type { FxChain, FxPluginInstance } from "../daw/schema";

const impulseBuffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

export interface ConnectedFxChain {
  cleanup: () => void;
}

export function connectFxChain(ctx: BaseAudioContext, source: AudioNode, destination: AudioNode, chain: FxChain | null | undefined): ConnectedFxChain {
  let current: AudioNode = source;
  const cleanup: Array<() => void> = [];
  (chain?.slots || []).forEach((slot) => {
    if (!slot.enabled) return;
    const connected = connectFxSlot(ctx, current, slot);
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

function connectFxSlot(ctx: BaseAudioContext, source: AudioNode, slot: FxPluginInstance): { output: AudioNode; cleanup: Array<() => void> } {
  if (slot.type === "utility-gain") {
    const gain = ctx.createGain();
    gain.gain.value = num(slot, "gain", 1);
    source.connect(gain);
    return { output: gain, cleanup: [] };
  }
  if (slot.type === "high-pass" || slot.type === "low-pass") {
    const filter = ctx.createBiquadFilter();
    filter.type = slot.type === "high-pass" ? "highpass" : "lowpass";
    filter.frequency.value = num(slot, "frequency", slot.type === "high-pass" ? 80 : 12000);
    filter.Q.value = num(slot, "q", 0.7);
    source.connect(filter);
    return { output: filter, cleanup: [] };
  }
  if (slot.type === "three-band-eq") {
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 180;
    low.gain.value = num(slot, "lowGain", 0);
    mid.type = "peaking";
    mid.frequency.value = num(slot, "midFrequency", 1200);
    mid.Q.value = 1;
    mid.gain.value = num(slot, "midGain", 0);
    high.type = "highshelf";
    high.frequency.value = 5200;
    high.gain.value = num(slot, "highGain", 0);
    source.connect(low);
    low.connect(mid);
    mid.connect(high);
    return { output: high, cleanup: [] };
  }
  if (slot.type === "compressor" || slot.type === "limiter") {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = num(slot, "threshold", slot.type === "limiter" ? -4 : -20);
    comp.knee.value = slot.type === "limiter" ? 0 : 12;
    comp.ratio.value = num(slot, "ratio", slot.type === "limiter" ? 18 : 3);
    comp.attack.value = num(slot, "attack", 0.004);
    comp.release.value = num(slot, "release", 0.12);
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
    return { output: wetDry(ctx, source, shaper, shaper, num(slot, "mix", slot.type === "saturation" ? 0.65 : 0.45)), cleanup: [] };
  }
  if (slot.type === "delay" || slot.type === "ping-pong-delay") {
    const delay = ctx.createDelay(2);
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const pan = "createStereoPanner" in ctx && slot.type === "ping-pong-delay" ? ctx.createStereoPanner() : null;
    delay.delayTime.value = num(slot, "time", 0.24);
    feedback.gain.value = clamp(num(slot, "feedback", 0.3), 0, 0.82);
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay);
    if (pan) {
      pan.pan.value = 0.42;
      filter.connect(pan);
      return { output: wetDry(ctx, source, delay, pan, num(slot, "mix", 0.3)), cleanup: [] };
    }
    return { output: wetDry(ctx, source, delay, filter, num(slot, "mix", 0.3)), cleanup: [] };
  }
  if (slot.type === "reverb") {
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse(ctx, num(slot, "decay", 1.8));
    return { output: wetDry(ctx, source, convolver, convolver, num(slot, "mix", 0.24)), cleanup: [] };
  }
  if (slot.type === "chorus" || slot.type === "phaser") {
    const delay = ctx.createDelay(0.08);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    delay.delayTime.value = slot.type === "chorus" ? 0.018 : 0.006;
    lfo.frequency.value = num(slot, "rate", slot.type === "chorus" ? 0.8 : 0.45);
    depth.gain.value = slot.type === "chorus" ? num(slot, "depth", 0.012) : num(slot, "depth", 650) / 100000;
    lfo.connect(depth);
    depth.connect(delay.delayTime);
    lfo.start(ctx.currentTime);
    return {
      output: wetDry(ctx, source, delay, delay, num(slot, "mix", 0.34)),
      cleanup: [() => safelyStop(lfo)]
    };
  }
  if (slot.type === "tremolo-autopan") {
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = num(slot, "rate", 4);
    depth.gain.value = clamp(num(slot, "depth", 0.38), 0, 0.9);
    gain.gain.value = 1 - depth.gain.value * 0.5;
    lfo.connect(depth);
    depth.connect(gain.gain);
    source.connect(gain);
    lfo.start(ctx.currentTime);
    return { output: gain, cleanup: [() => safelyStop(lfo)] };
  }
  return { output: source, cleanup: [] };
}

function wetDry(ctx: BaseAudioContext, source: AudioNode, effectInput: AudioNode, effectOutput: AudioNode, mix: number): AudioNode {
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const out = ctx.createGain();
  const safeMix = clamp(mix, 0, 1);
  dry.gain.value = 1 - safeMix;
  wet.gain.value = safeMix;
  source.connect(dry);
  source.connect(effectInput);
  effectOutput.connect(wet);
  dry.connect(out);
  wet.connect(out);
  return out;
}

function num(slot: FxPluginInstance, key: string, fallback: number) {
  const value = Number(slot.parameters[key]);
  return Number.isFinite(value) ? value : fallback;
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
