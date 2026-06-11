import { mkdir, writeFile } from "node:fs/promises";

const distDir = new URL("../dist/", import.meta.url);
await mkdir(distDir, { recursive: true });

const esm = `export * from "../src/index.js";\n`;

const iife = `(() => {
  const api = {};
  api.version = "0.1.0-scaffold";
  api.PCS_SHARE_PREFIX = "PCS1:";
  api.SECTION_IDS = Object.freeze(["A","B","C","D","E","F","G","H"]);
  api.STEM_IDS = Object.freeze(["drums","bass","chords","melody","guitar"]);
  api.parsePocketChordsmithInput = (input) => {
    if (typeof input === "string") {
      const trimmed = input.trim();
      if (trimmed.startsWith(api.PCS_SHARE_PREFIX)) {
        const payload = trimmed.slice(api.PCS_SHARE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
        const padded = payload + "=".repeat((4 - (payload.length % 4 || 4)) % 4);
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))));
      }
      return JSON.parse(trimmed);
    }
    if (input && typeof input === "object" && !Array.isArray(input)) return input;
    throw new Error("Pocket Audio Core needs a project JSON object, JSON string, or PCS1 share code.");
  };
  api.normalisePocketChordsmithProject = (raw) => ({
    app: "PocketAudioProject",
    coreProjectVersion: 1,
    source: { sourceType: "pocket-chordsmith", sourceSchemaVersion: Number(raw.projectVersion || raw.schemaVersion || 16), original: raw, normalizedAt: new Date().toISOString() },
    meta: { title: raw.title || raw.name || "Pocket Chordsmith Project", key: raw.key || "C", scale: raw.scale || "major", bpm: Number(raw.bpm || 96), timeSig: Number(raw.timeSig || 4), resolution: Number(raw.resolution || raw.lastAdvancedResolution || 4), swing: Number(raw.swing || 0), ppq: 480 },
    mixer: { stems: {}, fx: {} },
    sections: {},
    sequence: Array.isArray(raw.songSequence) && raw.songSequence.length ? raw.songSequence : ["A"],
    markers: [],
    compatibility: { coreVersion: "0.1.0-scaffold", limitations: ["IIFE scaffold normalizer is minimal."] }
  });
  api.PocketAudio = class PocketAudio {
    constructor(options = {}) { this.options = options; this.profile = options.profile || "composer"; this.project = null; this.playing = false; this.listeners = new Map(); this.musicStates = new Map(Object.entries(options.musicStates || options.stateMap || {})); this.currentMusicState = null; this.intensity = Number(options.intensity || 0); this.ducking = { enabled:false, amount:0, releaseMs:0 }; }
    async loadProject(input) { const raw = api.parsePocketChordsmithInput(input); this.project = raw.app === "PocketAudioProject" ? raw : api.normalisePocketChordsmithProject(raw); return this.project; }
    async resume() {}
    async resumeFromUserGesture() { return this.resume(); }
    play() { if (!this.project) throw new Error("Load a project before play."); this.playing = true; }
    stop() { this.playing = false; }
    queueSection(sectionId, options = {}) { if (this.musicStates.has(sectionId)) return this.queueMusicState(sectionId, options); if (this.project) this.project.sequence = [sectionId]; this.emit("sectionQueued", { sectionId, quantize: options.quantize || "bar" }); }
    defineMusicStates(states = {}) { Object.entries(states).forEach(([name, definition]) => this.musicStates.set(name, definition)); return this; }
    setMusicState(name, options = {}) { const definition = this.musicStates.get(name); if (!definition) throw new Error("Unknown music state: " + name); this.currentMusicState = name; if (definition.sequence && this.project) this.project.sequence = definition.sequence.slice(); if (definition.section) this.queueSection(definition.section, options); if (definition.intensity !== undefined) this.setIntensity(definition.intensity); if (definition.fx) this.setFx(definition.fx); if (definition.stinger) this.triggerStinger(name); this.emit("musicState", { name, definition, quantize: options.quantize || "instant" }); return definition; }
    queueMusicState(name, options = {}) { this.emit("musicStateQueued", { name, quantize: options.quantize || "bar" }); return this.setMusicState(name, options); }
    triggerStinger(name) { const definition = this.musicStates.get(name) || {}; const payload = { name, stinger: definition.stinger || name, thenReturnTo: definition.thenReturnTo || null }; this.emit("stinger", payload); return payload; }
    setIntensity(value) { this.intensity = Math.max(0, Math.min(1, Number(value) || 0)); this.emit("intensity", { intensity:this.intensity }); return this.intensity; }
    duck(enabled = true, options = {}) { this.ducking = { enabled:!!enabled, amount:Math.max(0, Math.min(1, Number(options.amount ?? 0.45))), releaseMs:Math.max(0, Number(options.releaseMs || 0)) }; this.emit("duck", this.ducking); return this.ducking; }
    lowpass(amount = 1) { this.setFx({ filter:Math.max(0, Math.min(1, Number(amount) || 0)) }); this.emit("lowpass", { amount }); return amount; }
    setStemVolume(stem, volume) { if (this.project) this.project.mixer.stems[stem] = { ...(this.project.mixer.stems[stem] || {}), volume }; }
    setStemMute(stem, mute) { if (this.project) this.project.mixer.stems[stem] = { ...(this.project.mixer.stems[stem] || {}), mute:!!mute }; }
    setFx(patch = {}) { if (this.project) this.project.mixer.fx = { ...this.project.mixer.fx, ...patch }; }
    getDiagnostics() { return { profile:this.profile, projectLoaded:!!this.project, currentMusicState:this.currentMusicState, intensity:this.intensity, ducking:this.ducking, timelineEventCount:0, missedSchedulerTickCount:0 }; }
    async renderWav() { return new Blob([], { type: "audio/wav" }); }
    on(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); return () => this.off(type, callback); }
    off(type, callback) { this.listeners.get(type)?.delete(callback); }
    emit(type, payload) { this.listeners.get(type)?.forEach(callback => callback(payload)); }
  };
  globalThis.PocketAudioCore = api;
})();\n`;

await writeFile(new URL("pocket-audio-core.esm.js", distDir), esm);
await writeFile(new URL("pocket-audio-core.iife.js", distDir), iife);
await writeFile(new URL("README.md", distDir), "Generated by `npm run build`. The IIFE build is a scaffold and exposes `globalThis.PocketAudioCore`.\\n");
console.log("Built dist/pocket-audio-core.esm.js and dist/pocket-audio-core.iife.js");
