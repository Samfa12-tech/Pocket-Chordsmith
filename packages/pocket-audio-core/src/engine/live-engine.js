import { SECTION_IDS, STEM_IDS } from "../constants.js";
import { buildPocketAudioTimeline } from "../events/timeline-events.js";
import { createAudioContext } from "./audio-context.js";
import { parsePocketChordsmithInput } from "../schema/parse-share-code.js";
import { normalisePocketChordsmithProject } from "../schema/normalise-project.js";
import { renderPocketAudioWav } from "./offline-renderer.js";
import { renderPocketAudioStems } from "../export/stems.js";
import { findPocketChordInstrumentConfig, findPocketLeadInstrumentConfig } from "../sounds/instruments.js";
import { findPocketGuitarTone } from "../sounds/guitar.js";
import { POCKET_BASS_TONE_CONFIGS, POCKET_DRUM_KIT_CONFIGS, resolvePocketBassToneId, resolvePocketDrumKitId } from "../sounds/lofi-registry.js";

export class PocketAudio {
  constructor(options = {}) {
    this.options = options;
    this.profile = options.profile || "composer";
    this.project = null;
    this.timeline = null;
    this.playing = false;
    this.audioContext = null;
    this.schedulerTimer = null;
    this.playStartedAt = 0;
    this.nextEventIndex = 0;
    this.listeners = new Map();
    this.musicStates = new Map();
    this.currentMusicState = null;
    this.queuedMusicState = null;
    this.pendingReturnState = null;
    this.intensity = clamp(Number(options.intensity ?? 0), 0, 1);
    this.ducking = { enabled: false, amount: 0, releaseMs: 0 };
    this.lowpassAmount = 1;
    this.lastSchedulerTickAt = 0;
    this.transport = { sectionId: "A", bar: 1, beat: 1, step: -1, seconds: 0, tick: 0 };
    this.diagnostics = { scheduledEventCount: 0, skippedLateEventCount: 0, schedulerTickCount: 0, missedSchedulerTickCount: 0 };
    this.defineMusicStates(options.musicStates || options.stateMap || {});
  }

  async loadProject(input, options = {}) {
    const raw = input?.app === "PocketAudioProject" ? input.source?.original || input : parsePocketChordsmithInput(input);
    this.project = raw?.app === "PocketAudioProject" ? raw : normalisePocketChordsmithProject(raw, options);
    this.timeline = buildPocketAudioTimeline(this.project, { scope: "sequence" });
    this.transport.sectionId = this.project.transport.currentSection;
    this.emit("project", { project: this.project });
    return this.project;
  }

  async resume() {
    if (this.options.audio !== false && (globalThis.AudioContext || globalThis.webkitAudioContext)) {
      this.audioContext = this.audioContext || await createAudioContext();
    }
    this.emit("resume", {});
  }

  async resumeFromUserGesture() {
    await this.resume();
  }

  async play(options = {}) {
    this.ensureProject();
    if (!this.audioContext && this.options.audio !== false && (globalThis.AudioContext || globalThis.webkitAudioContext)) await this.resume();
    this.playing = true;
    if (options.sectionId) this.transport.sectionId = normaliseSectionId(options.sectionId);
    this.timeline = buildPocketAudioTimeline(this.project, { scope: options.scope || "sequence", sectionId: this.transport.sectionId });
    this.nextEventIndex = 0;
    this.playStartedAt = nowSeconds(this.audioContext);
    this.startTimelineScheduler();
    this.emit("play", this.getTransport());
  }

  pause() {
    this.playing = false;
    this.clearTimelineScheduler();
    this.emit("pause", this.getTransport());
  }

  stop() {
    this.playing = false;
    this.clearTimelineScheduler();
    this.transport = { ...this.transport, bar: 1, beat: 1, step: -1, seconds: 0, tick: 0 };
    this.emit("stop", this.getTransport());
  }

  restart() {
    this.stop();
    this.play();
  }

  queueSection(sectionId, options = {}) {
    this.ensureProject();
    if (!SECTION_IDS.includes(String(sectionId || "").toUpperCase()) && this.musicStates.has(String(sectionId || ""))) {
      return this.queueMusicState(sectionId, options);
    }
    const safe = normaliseSectionId(sectionId);
    this.transport.sectionId = safe;
    this.project.transport.currentSection = safe;
    this.timeline = buildPocketAudioTimeline(this.project, { scope: "section", sectionId: safe });
    this.emit("sectionQueued", { sectionId: safe, quantize: options.quantize || "bar" });
    return { sectionId: safe, quantize: options.quantize || "bar" };
  }

  setSequence(sequence) {
    this.ensureProject();
    this.project.sequence = (Array.isArray(sequence) ? sequence : []).map(normaliseSectionId);
    this.timeline = buildPocketAudioTimeline(this.project, { scope: "sequence" });
    this.emit("sequence", { sequence: this.project.sequence.slice() });
  }

  setLoop(options = {}) {
    this.ensureProject();
    this.loop = { enabled: Boolean(options.enabled), sectionId: options.sectionId ? normaliseSectionId(options.sectionId) : this.transport.sectionId };
    this.emit("loop", this.loop);
  }

  defineMusicStates(states = {}) {
    Object.entries(states || {}).forEach(([name, definition]) => this.musicStates.set(name, { ...definition }));
    return this;
  }

  setMusicState(name, options = {}) {
    this.ensureProject();
    const definition = this.getMusicStateDefinition(name);
    this.currentMusicState = String(name);
    this.queuedMusicState = null;
    if (Array.isArray(definition.sequence)) this.setSequence(definition.sequence);
    if (definition.section) this.queueSection(definition.section, options);
    if (definition.loop !== undefined) this.setLoop({ enabled: Boolean(definition.loop), sectionId: definition.section || this.transport.sectionId });
    if (definition.intensity !== undefined) this.setIntensity(definition.intensity);
    if (definition.fx) this.setFx(definition.fx);
    if (definition.lowpass !== undefined) this.lowpass(definition.lowpass);
    if (definition.duck !== undefined) this.duck(Boolean(definition.duck), typeof definition.duck === "object" ? definition.duck : {});
    if (definition.stems) this.applyStemPatchMap(definition.stems);
    if (definition.stinger) this.triggerStinger(name, { ...options, stateDefinition: definition });
    if (definition.thenReturnTo) this.pendingReturnState = definition.thenReturnTo;
    this.emit("musicState", { name: this.currentMusicState, definition, quantize: options.quantize || "instant" });
    return definition;
  }

  queueMusicState(name, options = {}) {
    const definition = this.getMusicStateDefinition(name);
    this.queuedMusicState = { name: String(name), definition, quantize: options.quantize || "bar" };
    this.emit("musicStateQueued", this.queuedMusicState);
    return this.setMusicState(name, options);
  }

  triggerStinger(name, options = {}) {
    const definition = options.stateDefinition || this.musicStates.get(String(name)) || {};
    const stinger = definition.stinger || name;
    const payload = {
      name: String(name),
      stinger,
      thenReturnTo: definition.thenReturnTo || options.thenReturnTo || null
    };
    this.pendingReturnState = payload.thenReturnTo;
    this.emit("stinger", payload);
    return payload;
  }

  setIntensity(value) {
    this.intensity = clamp(Number(value), 0, 1);
    this.emit("intensity", { intensity: this.intensity });
    return this.intensity;
  }

  duck(enabled = true, options = {}) {
    this.ducking = {
      enabled: Boolean(enabled),
      amount: clamp(Number(options.amount ?? (enabled ? 0.45 : 0)), 0, 1),
      releaseMs: Math.max(0, Number(options.releaseMs ?? 500))
    };
    this.setFx({ sidechain: { enabled: this.ducking.enabled, amount: this.ducking.amount } });
    this.emit("duck", this.ducking);
    return this.ducking;
  }

  lowpass(amount = 1) {
    this.lowpassAmount = clamp(Number(amount), 0, 1);
    this.setFx({ filter: this.lowpassAmount });
    this.emit("lowpass", { amount: this.lowpassAmount });
    return this.lowpassAmount;
  }

  setStemVolume(stem, volume) {
    this.patchStem(stem, { volume: clamp(Number(volume), 0, 1) });
  }

  setStemMute(stem, mute) {
    this.patchStem(stem, { mute: Boolean(mute) });
  }

  setFx(patch = {}) {
    this.ensureProject();
    this.project.mixer.fx = { ...this.project.mixer.fx, ...patch };
    this.emit("fx", { fx: this.project.mixer.fx });
  }

  triggerBuild(options = {}) {
    this.ensureProject();
    this.buildState = { active: true, bars: options.bars || 2 };
    this.setFx({ ...(this.project.mixer.fx || {}), filter: 0.74, echo: 0.01, reverb: 0.18 });
    this.emit("build", this.buildState);
  }

  triggerDrop(options = {}) {
    this.ensureProject();
    const target = options.targetSection ? normaliseSectionId(options.targetSection) : this.transport.sectionId;
    this.buildState = { active: false };
    this.queueSection(target, { quantize: options.quantize || "bar" });
    this.emit("drop", { targetSection: target });
  }

  async renderWav(options = {}) {
    this.ensureProject();
    return renderPocketAudioWav(this.project, options);
  }

  async renderStems(options = {}) {
    this.ensureProject();
    return renderPocketAudioStems(this.project, { stems: options.stems || STEM_IDS, sampleRate: options.sampleRate || 44100 });
  }

  getTransport() {
    return { playing: this.playing, ...this.transport };
  }

  getDiagnostics() {
    return {
      coreStub: true,
      profile: this.profile,
      audioContextState: "not-created",
      timelineEventCount: this.timeline?.events.length || 0,
      currentSection: this.transport.sectionId,
      currentMusicState: this.currentMusicState,
      queuedMusicState: this.queuedMusicState?.name || null,
      intensity: this.intensity,
      ducking: this.ducking,
      projectLoaded: Boolean(this.project),
      ...this.diagnostics
    };
  }

  on(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    return () => this.off(type, callback);
  }

  off(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  emit(type, payload) {
    this.listeners.get(type)?.forEach((callback) => callback(payload));
  }

  dispose() {
    this.stop();
    this.listeners.clear();
  }

  ensureProject() {
    if (!this.project) throw new Error("Load a Pocket Chordsmith project before using Pocket Audio Core transport.");
  }

  startTimelineScheduler() {
    this.clearTimelineScheduler();
    const tick = () => {
      if (!this.playing || !this.timeline) return;
      const tickNow = nowSeconds(this.audioContext);
      this.diagnostics.schedulerTickCount += 1;
      if (this.lastSchedulerTickAt && tickNow - this.lastSchedulerTickAt > 0.18) this.diagnostics.missedSchedulerTickCount += 1;
      this.lastSchedulerTickAt = tickNow;
      const elapsed = nowSeconds(this.audioContext) - this.playStartedAt;
      this.transport.seconds = elapsed;
      while (this.nextEventIndex < this.timeline.events.length && this.timeline.events[this.nextEventIndex].time <= elapsed + 0.12) {
        const event = this.timeline.events[this.nextEventIndex];
        this.dispatchTimelineEvent(event);
        this.nextEventIndex += 1;
      }
      if (elapsed >= this.timeline.duration) {
        if (this.loop?.enabled) {
          this.playStartedAt = nowSeconds(this.audioContext);
          this.nextEventIndex = 0;
        } else {
          this.stop();
        }
      }
    };
    this.schedulerTimer = setInterval(tick, 25);
    tick();
  }

  clearTimelineScheduler() {
    if (this.schedulerTimer !== null) clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
  }

  dispatchTimelineEvent(event) {
    this.transport = {
      ...this.transport,
      sectionId: event.sectionId,
      bar: event.bar,
      beat: event.beat,
      step: event.step,
      tick: event.tick
    };
    this.diagnostics.scheduledEventCount += 1;
    if (event.beat === 1 && event.step % ((this.project?.meta?.resolution || 4) * (this.project?.meta?.timeSig || 4)) === 0) {
      this.emit("bar", event);
      this.emit("section", event);
    }
    this.emit("beat", event);
    this.emit("event", event);
    if (this.audioContext) scheduleSimpleAudioEvent(this.audioContext, event, this.project);
  }

  patchStem(stem, patch) {
    this.ensureProject();
    if (!this.project.mixer.stems[stem]) throw new Error(`Unknown stem: ${stem}`);
    this.project.mixer.stems[stem] = { ...this.project.mixer.stems[stem], ...patch };
    this.emit("stem", { stem, settings: this.project.mixer.stems[stem] });
  }

  applyStemPatchMap(stems = {}) {
    Object.entries(stems || {}).forEach(([stem, patch]) => {
      if (patch.volume !== undefined) this.setStemVolume(stem, patch.volume);
      if (patch.mute !== undefined) this.setStemMute(stem, patch.mute);
    });
  }

  getMusicStateDefinition(name) {
    const safeName = String(name || "");
    const definition = this.musicStates.get(safeName);
    if (!definition) throw new Error(`Unknown music state: ${safeName}`);
    return definition;
  }
}

function nowSeconds(context) {
  return context?.currentTime ?? performance.now() / 1000;
}

function scheduleSimpleAudioEvent(context, event, project) {
  if (project?.mixer?.stems?.[event.stem]?.mute) return;
  const start = Math.max(context.currentTime + 0.005, context.currentTime + Math.max(0, event.time - ((performance.now() / 1000) % Math.max(event.time + 1, 1))));
  if (event.type === "bass") {
    scheduleBassAudioEvent(context, event, project, start);
    return;
  }
  const gain = context.createGain();
  const voice = simpleVoiceRecipe(event);
  const volume = (project?.mixer?.stems?.[event.stem]?.volume ?? 0.7) * Math.min(1, event.velocity || 0.5) * voice.peak;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + voice.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.04, (event.duration || 0.08) * voice.durationScale));
  const filter = context.createBiquadFilter();
  filter.type = voice.filterType;
  filter.frequency.setValueAtTime(voice.filterFrequency, start);
  filter.connect(gain);
  gain.connect(context.destination);
  const osc = context.createOscillator();
  osc.type = voice.wave;
  const midi = event.midi || event.midiNotes?.[0] || (event.type === "kick" ? 36 : event.type === "snare" ? 38 : event.type === "hat" ? 72 : 60);
  osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), start);
  osc.connect(filter);
  osc.start(start);
  osc.stop(start + Math.max(0.04, (event.duration || 0.08) * voice.durationScale) + 0.02);
}

function scheduleBassAudioEvent(context, event, project, start) {
  const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(event.bassTone)] || POCKET_BASS_TONE_CONFIGS.classic;
  const stemVolume = project?.mixer?.stems?.[event.stem]?.volume ?? 0.7;
  const peak = stemVolume * Math.min(1, event.velocity || 0.5) * 0.16;
  const midi = event.midi || event.midiNotes?.[0] || 36;
  const bassDur = Math.max(0.08, event.duration || 0.22);
  scheduleBassLayer(context, start, midi, bassDur, cfg.mainWave || "sawtooth", peak * Number(cfg.mainPeak || 1), cfg.cutoff || 420, cfg.attack || 0.01);
  scheduleBassLayer(context, start, midi - 12, Math.min(0.12, bassDur * 0.82), cfg.subWave || "sine", peak * Number(cfg.subPeak || 0.35), cfg.subCutoff || 220, cfg.attack || 0.01);
}

function scheduleBassLayer(context, start, midi, duration, wave, volume, cutoff, attack) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), start + Math.max(0.002, Number(attack || 0.01)));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.04, duration));
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.max(80, Number(cutoff || 420)), start);
  filter.connect(gain);
  gain.connect(context.destination);
  const osc = context.createOscillator();
  osc.type = wave || "sine";
  osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), start);
  osc.connect(filter);
  osc.start(start);
  osc.stop(start + Math.max(0.04, duration) + 0.02);
}

function simpleVoiceRecipe(event) {
  if (event.type === "chord") {
    const cfg = findPocketChordInstrumentConfig(event.instrument);
    return {
      wave: cfg.wave || "sine",
      peak: Math.max(0.04, Number(cfg.peak || 0.2)),
      attack: Math.max(0.002, Number(cfg.attack || 0.01)),
      durationScale: Math.max(0.35, Number(cfg.durMul || 1)),
      filterType: cfg.filter || "lowpass",
      filterFrequency: Math.max(80, Number(cfg.freq || 1800))
    };
  }
  if (event.type === "melody") {
    const cfg = findPocketLeadInstrumentConfig(event.instrument);
    return {
      wave: cfg.wave || "sine",
      peak: Math.max(0.04, Number(cfg.peak || 0.16)),
      attack: 0.006,
      durationScale: Math.max(0.35, Number(cfg.durMul || 1)),
      filterType: cfg.filter || "lowpass",
      filterFrequency: Math.max(80, Number(cfg.freq || 2200))
    };
  }
  if (event.type === "bass") {
    const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(event.bassTone)] || POCKET_BASS_TONE_CONFIGS.classic;
    return {
      wave: cfg.mainWave || "sawtooth",
      peak: Math.max(0.04, Number(cfg.mainPeak || 1)) * 0.16,
      attack: Math.max(0.002, Number(cfg.attack || 0.01)),
      durationScale: 1,
      filterType: "lowpass",
      filterFrequency: Math.max(80, Number(cfg.cutoff || 420))
    };
  }
  if (event.type === "guitar") {
    const cfg = findPocketGuitarTone(event.instrument);
    return {
      wave: "sawtooth",
      peak: Math.max(0.04, Number(cfg.peak || 0.09)) * Math.max(1, Number(cfg.drive || 1)),
      attack: 0.004,
      durationScale: event.articulation === "chug" ? 0.55 : Math.max(0.35, Number(cfg.sustain || 0.9)),
      filterType: "lowpass",
      filterFrequency: Math.max(80, Number(cfg.lowpass || 3200))
    };
  }
  if (event.type === "kick" || event.type === "snare" || event.type === "hat") {
    const kit = POCKET_DRUM_KIT_CONFIGS[resolvePocketDrumKitId(event.drumKit, event.audioProfile, event.lofiPreset)] || POCKET_DRUM_KIT_CONFIGS.classic;
    const drum = event.type === "kick" ? kit.kick : event.type === "snare" ? kit.snare : kit.hat;
    return {
      wave: event.type === "hat" ? "square" : "sine",
      peak: Math.max(0.04, Number(drum?.gainScale || 1)) * 0.18,
      attack: 0.004,
      durationScale: event.type === "hat" ? 0.65 : 1,
      filterType: event.type === "snare" || event.type === "hat" ? "highpass" : "lowpass",
      filterFrequency: Math.max(80, Number(drum?.filterFreq || drum?.highpass || drum?.highpassClosed || 1200))
    };
  }
  return { wave: "sine", peak: 0.18, attack: 0.01, durationScale: 1, filterType: "lowpass", filterFrequency: 2200 };
}

function normaliseSectionId(value) {
  const safe = String(value || "A").toUpperCase();
  return SECTION_IDS.includes(safe) ? safe : "A";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
