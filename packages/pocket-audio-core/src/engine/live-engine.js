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
  const funk = event.audioProfile === "funk_groove" ? liveFunkParameters(event) : null;
  const pocketOffset = funk && Number(event.step || 0) % 2 !== 0 ? (funk.pocket - 0.5) * 0.03 : 0;
  const start = Math.max(context.currentTime + 0.005, context.currentTime + Math.max(0, event.time + pocketOffset - ((performance.now() / 1000) % Math.max(event.time + 1, 1))));
  if (event.type === "guitar" && event.audioProfile === "heavy_metal") {
    scheduleMetalGuitarAudioEvent(context, event, project, start);
    return;
  }
  if (event.type === "bass") {
    scheduleBassAudioEvent(context, event, project, start);
    return;
  }
  const gain = context.createGain();
  const voice = simpleVoiceRecipe(event);
  const ghostScale = funk && ["snare", "rim", "clap"].includes(String(event.type || event.lane)) && !event.accent ? 0.46 + funk.ghostNotes * 0.5 : 1;
  const volume = (project?.mixer?.stems?.[event.stem]?.volume ?? 0.7) * Math.min(1, event.velocity || 0.5) * voice.peak * ghostScale;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + voice.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.04, (event.duration || 0.08) * voice.durationScale));
  const filter = context.createBiquadFilter();
  filter.type = voice.filterType;
  filter.frequency.setValueAtTime(voice.filterFrequency, start);
  filter.connect(gain);
  gain.connect(context.destination);
  const osc = context.createOscillator();
  if (voice.pulseDuty !== undefined && typeof osc.setPeriodicWave === "function") osc.setPeriodicWave(createPulseWave(context, voice.pulseDuty));
  else osc.type = voice.wave;
  const midi = event.midi || event.midiNotes?.[0] || (event.type === "kick" ? 36 : event.type === "snare" ? 38 : event.type === "hat" ? 72 : 60);
  osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), start);
  if (voice.pitchSlide) osc.frequency.exponentialRampToValueAtTime(440 * Math.pow(2, (midi + voice.pitchSlide - 69) / 12), start + Math.max(0.04, event.duration || 0.08));
  osc.connect(filter);
  osc.start(start);
  osc.stop(start + Math.max(0.04, (event.duration || 0.08) * voice.durationScale) + 0.02);
}

function scheduleBassAudioEvent(context, event, project, start) {
  const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(event.bassTone)] || POCKET_BASS_TONE_CONFIGS.classic;
  const stemVolume = project?.mixer?.stems?.[event.stem]?.volume ?? 0.7;
  const peak = stemVolume * Math.min(1, event.velocity || 0.5);
  const midi = event.midi || event.midiNotes?.[0] || 36;
  const articulation = event.articulation || "finger";
  const funk = event.audioProfile === "funk_groove" ? (event.soundProfile?.parameters || {}) : null;
  const metal = event.audioProfile === "heavy_metal" ? (event.metalTexture || event.soundProfile?.parameters || {}) : null;
  const bassDur = Math.max(0.05, (event.duration || 0.22) * (articulation === "mute" || articulation === "ghost" ? 0.28 : 1));
  const articulationGain = articulation === "mute" || articulation === "ghost" ? 0.16 + (1 - Number(funk?.muteDepth ?? 0.74)) * 0.18 : articulation === "hammer" || articulation === "pull" ? 0.78 : 1;
  scheduleBassLayer(context, start, midi, bassDur, cfg.mainWave || "sawtooth", peak * Number(cfg.mainPeak || 1) * articulationGain, cfg.cutoff || 420, articulation === "hammer" || articulation === "pull" ? 0.018 : cfg.attack || 0.01, { drive: metal ? 1 + Number(metal.drive || 0) * 4 : 1 });
  scheduleBassLayer(context, start, midi - 12, Math.min(0.16, bassDur * 0.82), cfg.subWave || "sine", peak * Number(cfg.subPeak || 0.35), cfg.subCutoff || 220, cfg.attack || 0.01);
  if (funk && ["slap", "pop", "mute", "ghost"].includes(articulation)) {
    const brightness = articulation === "pop" ? Number(funk.popBrightness ?? 0.62) : Number(funk.slapAmount ?? 0.68);
    scheduleTransientOscillator(context, start, articulation === "pop" ? midi + 12 : midi + 24, 0.035, peak * (0.08 + brightness * 0.16));
  }
  if (metal) scheduleBassLayer(context, start, midi, Math.min(0.18, bassDur), "sawtooth", peak * (0.12 + Number(metal.presence || 0) * 0.16), 900 + Number(metal.presence || 0) * 1500, 0.002, { drive: 2 + Number(metal.drive || 0) * 5 });
}

function scheduleBassLayer(context, start, midi, duration, wave, volume, cutoff, attack, options = {}) {
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
  if (options.drive > 1 && typeof context.createWaveShaper === "function") {
    const shaper = context.createWaveShaper();
    shaper.curve = distortionCurve(options.drive);
    osc.connect(shaper);
    shaper.connect(filter);
  } else osc.connect(filter);
  osc.start(start);
  osc.stop(start + Math.max(0.04, duration) + 0.02);
}

function simpleVoiceRecipe(event) {
  if (event.type === "chord") {
    const cfg = findPocketChordInstrumentConfig(event.instrument);
    const funk = event.audioProfile === "funk_groove" ? liveFunkParameters(event) : null;
    return {
      wave: cfg.wave || "sine",
      peak: Math.max(0.04, Number(cfg.peak || 0.2)),
      attack: Math.max(0.002, Number(cfg.attack || 0.01)),
      durationScale: Math.max(0.08, Number(cfg.durMul || 1) * (funk ? 1 - funk.stabTightness * 0.68 : 1)),
      filterType: cfg.filter || "lowpass",
      filterFrequency: Math.max(80, Number(cfg.freq || 1800))
    };
  }
  if (event.type === "melody") {
    const cfg = findPocketLeadInstrumentConfig(event.instrument);
    const chip = event.audioProfile === "chip_arcade" || event.audioProfile === "chip_tune" ? (event.technique?.chip || {}) : null;
    return {
      wave: chip?.channel === "triangle" ? "triangle" : cfg.wave || "sine",
      peak: Math.max(0.04, Number(cfg.peak || 0.16)),
      attack: 0.006,
      durationScale: Math.max(0.35, Number(cfg.durMul || 1)),
      filterType: cfg.filter || "lowpass",
      filterFrequency: Math.max(80, Number(cfg.freq || 2200)),
      pulseDuty: chip && String(chip.channel || "pulse1").startsWith("pulse") ? Math.max(0.08, Math.min(0.92, Number(chip.duty ?? event.soundProfile?.parameters?.pulseWidth ?? 0.5))) : undefined,
      pitchSlide: chip ? Number(chip.pitchSlide ?? chip.sweep ?? 0) : 0
    };
  }
  if (event.type === "bass") {
    const cfg = POCKET_BASS_TONE_CONFIGS[resolvePocketBassToneId(event.bassTone)] || POCKET_BASS_TONE_CONFIGS.classic;
    return {
      wave: cfg.mainWave || "sawtooth",
      peak: Math.max(0.04, Number(cfg.mainPeak || 1)),
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
    const kit = POCKET_DRUM_KIT_CONFIGS[resolvePocketDrumKitId(event.drumKit, event.audioProfile, event.metalPreset || event.chipPreset || event.lofiPreset)] || POCKET_DRUM_KIT_CONFIGS.classic;
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

function liveFunkParameters(event) {
  const source = event.soundProfile?.parameters || {};
  const clamp01 = (value, fallback) => Math.max(0, Math.min(1, Number(value ?? fallback)));
  return {
    pocket: clamp01(source.pocket, 0.72),
    ghostNotes: clamp01(source.ghostNotes, 0.42),
    slapAmount: clamp01(source.slapAmount, 0.68),
    popBrightness: clamp01(source.popBrightness, 0.62),
    muteDepth: clamp01(source.muteDepth, 0.74),
    stabTightness: clamp01(source.stabTightness, 0.76)
  };
}

function scheduleMetalGuitarAudioEvent(context, event, project, start) {
  const cfg = findPocketGuitarTone(event.instrument);
  const texture = event.metalTexture || event.soundProfile?.parameters || {};
  const technique = event.technique?.metal || {};
  const palmMute = clamp(technique.palmMute ?? ((event.articulation === "palm_mute" || event.articulation === "chug") ? texture.palmMute : Number(texture.palmMute || 0) * 0.3), 0, 1);
  const drive = 1.4 + clamp(Number(texture.drive || 0), 0, 1) * 8.2;
  const tightness = clamp(Number(texture.lowTightness || 0), 0, 1);
  const presence = clamp(Number(texture.presence || 0), 0, 1);
  const roomSize = clamp(Number(texture.roomSize || 0), 0, 1);
  const pickAttack = clamp(Number(texture.pickAttack || 0), 0, 1);
  const duration = Math.max(0.05, (event.duration || 0.16) * (1 - palmMute * 0.58));
  const peak = (project?.mixer?.stems?.guitar?.volume ?? 0.66) * Math.min(1, event.velocity || 0.5) * Number(cfg.peak || 0.078);
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, start);
  output.gain.linearRampToValueAtTime(Math.max(0.0001, peak), start + 0.004);
  output.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  output.connect(context.destination);
  if (roomSize > 0.005 && typeof context.createDelay === "function") {
    const delay = context.createDelay();
    const room = context.createGain();
    delay.delayTime.setValueAtTime(0.011 + roomSize * 0.023, start);
    room.gain.setValueAtTime(roomSize * 0.24, start);
    output.connect(delay);
    delay.connect(room);
    room.connect(context.destination);
  }
  const notes = event.midiNotes?.length ? event.midiNotes : [event.midi || 45];
  [-1, 1].forEach((side) => notes.forEach((midi, noteIndex) => {
    const osc = context.createOscillator();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const shaper = typeof context.createWaveShaper === "function" ? context.createWaveShaper() : null;
    const pan = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    osc.type = "sawtooth";
    osc.detune.setValueAtTime(side * (4 + presence * 4) + noteIndex, start);
    osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), start);
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(68 + tightness * 150, start);
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(2200 + presence * 2100 - palmMute * 620, start);
    if (shaper) shaper.curve = distortionCurve(drive);
    if (pan) pan.pan.setValueAtTime(side * (0.28 + presence * 0.12), start);
    osc.connect(highpass);
    if (shaper) { highpass.connect(shaper); shaper.connect(lowpass); } else highpass.connect(lowpass);
    if (pan) { lowpass.connect(pan); pan.connect(output); } else lowpass.connect(output);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }));
  scheduleTransientOscillator(context, start, 84 + presence * 12, 0.028, peak * pickAttack * 1.8);
}

function scheduleTransientOscillator(context, start, midi, duration, volume) {
  if (volume <= 0.0001) return;
  const gain = context.createGain();
  const osc = context.createOscillator();
  gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.type = "square";
  osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), start);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(start);
  osc.stop(start + duration + 0.01);
}

function createPulseWave(context, duty) {
  const harmonics = 32;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n += 1) {
    real[n] = 2 * Math.sin(Math.PI * n * duty) * Math.cos(Math.PI * n * duty) / (Math.PI * n);
    imag[n] = 2 * Math.sin(Math.PI * n * duty) * Math.sin(Math.PI * n * duty) / (Math.PI * n);
  }
  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

function distortionCurve(amount) {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const x = index * 2 / (samples - 1) - 1;
    curve[index] = Math.tanh(x * amount);
  }
  return curve;
}

function normaliseSectionId(value) {
  const safe = String(value || "A").toUpperCase();
  return SECTION_IDS.includes(safe) ? safe : "A";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
