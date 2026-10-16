// Original Pocket Audio implementation of the documented integer-delay pluck
// contract. No Towtal game source is vendored. See the reference contract doc.
export const CAMPFIRE_ACOUSTIC_RECIPE = Object.freeze({
  id: "campfire_acoustic",
  version: 1,
  durationSeconds: 1.5,
  excitationRange: 0.45,
  feedbackPairGain: 0.496,
  seedPitchMultiplier: 311,
  strumSeconds: 0.027,
  noteGain: 0.36,
  minMidi: 36,
  maxMidi: 96,
  minSampleRate: 8000,
  maxSampleRate: 192000,
  tuning: "rounded-integer-period-reference",
  tailPolicy: "reference-cut"
});

export const CAMPFIRE_REFERENCE_CHORDS = Object.freeze([
  Object.freeze({ name: "D", rootPc: 2, quality: "maj", notes: Object.freeze([50, 57, 62, 66]) }),
  Object.freeze({ name: "G", rootPc: 7, quality: "maj", notes: Object.freeze([55, 59, 62, 67]) }),
  Object.freeze({ name: "Bm", rootPc: 11, quality: "min", notes: Object.freeze([47, 54, 59, 62]) }),
  Object.freeze({ name: "A", rootPc: 9, quality: "maj", notes: Object.freeze([45, 57, 61, 64]) })
]);

export function campfireAcousticNoteIdentity(options = {}) {
  const midi = options.midi;
  const sampleRate = options.sampleRate ?? 44100;
  const recipeVersion = options.recipeVersion ?? CAMPFIRE_ACOUSTIC_RECIPE.version;
  const seed = options.seed ?? midi * CAMPFIRE_ACOUSTIC_RECIPE.seedPitchMultiplier;
  const tailPolicy = options.tailPolicy ?? CAMPFIRE_ACOUSTIC_RECIPE.tailPolicy;
  if (recipeVersion !== 1) throw new RangeError(`Unsupported Campfire recipe version: ${recipeVersion}`);
  requireInteger(midi, 36, 96, "MIDI pitch");
  requireInteger(sampleRate, 8000, 192000, "sample rate");
  requireInteger(seed, 0, 0xffffffff, "seed");
  if (!["reference-cut", "fade-5ms"].includes(tailPolicy)) throw new RangeError(`Unsupported Campfire tail policy: ${tailPolicy}`);
  return { recipeVersion, midi, sampleRate, seed, tailPolicy };
}

export function campfireAcousticNoteKey(options = {}) {
  const identity = campfireAcousticNoteIdentity(options);
  return JSON.stringify(["campfire_acoustic", identity.recipeVersion, identity.sampleRate, identity.midi, identity.seed, identity.tailPolicy]);
}

export function renderCampfireAcousticNote(options = {}) {
  const identity = campfireAcousticNoteIdentity(options);
  const frequency = 440 * 2 ** ((identity.midi - 69) / 12);
  const delayFrames = Math.round(identity.sampleRate / frequency);
  const samples = new Float32Array(Math.floor(identity.sampleRate * 1.5));
  let randomState = identity.seed >>> 0;
  for (let frame = 0; frame < delayFrames; frame += 1) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    samples[frame] = (randomState / 0x100000000 - 0.5) * 0.45;
  }
  for (let frame = delayFrames; frame < samples.length; frame += 1) {
    const delayedPair = samples[frame - delayFrames] + samples[frame - delayFrames + 1];
    samples[frame] = delayedPair * 0.496;
  }
  if (identity.tailPolicy === "fade-5ms") {
    const fadeFrames = Math.max(2, Math.round(identity.sampleRate * 0.005));
    for (let frame = 0; frame < fadeFrames; frame += 1) {
      samples[samples.length - fadeFrames + frame] *= 1 - frame / (fadeFrames - 1);
    }
  }
  return samples;
}

export class CampfireAcousticNoteCache {
  #entries = new Map();
  #bytes = 0;
  #hits = 0;
  #misses = 0;
  #maxBytes;
  #maxEntries;

  constructor({ maxBytes = 16 * 1024 * 1024, maxEntries = 64 } = {}) {
    requireInteger(maxBytes, 0, 64 * 1024 * 1024, "cache byte budget");
    requireInteger(maxEntries, 0, 256, "cache entry budget");
    this.#maxBytes = maxBytes;
    this.#maxEntries = maxEntries;
  }

  getNote(options) {
    const key = campfireAcousticNoteKey(options);
    let samples = this.#entries.get(key);
    if (samples) {
      this.#hits += 1;
      this.#entries.delete(key);
      this.#entries.set(key, samples);
    } else {
      this.#misses += 1;
      samples = renderCampfireAcousticNote(options);
      if (samples.byteLength <= this.#maxBytes && this.#maxEntries > 0) {
        while (this.#entries.size >= this.#maxEntries || this.#bytes + samples.byteLength > this.#maxBytes) {
          const oldest = this.#entries.keys().next().value;
          this.#bytes -= this.#entries.get(oldest).byteLength;
          this.#entries.delete(oldest);
        }
        this.#entries.set(key, samples);
        this.#bytes += samples.byteLength;
      }
    }
    // A caller may mutate its buffer without corrupting a later render.
    return samples.slice();
  }

  clear() {
    this.#entries.clear();
    this.#bytes = 0;
  }

  getDiagnostics() {
    return { entries: this.#entries.size, bytes: this.#bytes, hits: this.#hits, misses: this.#misses, maxBytes: this.#maxBytes, maxEntries: this.#maxEntries };
  }
}

export function campfireAcousticVoicing({ rootPc, quality = "maj", register = "low" } = {}) {
  requireInteger(rootPc, 0, 11, "chord root");
  if (!["maj", "min", "dim", "aug"].includes(quality)) throw new RangeError(`Unsupported Campfire chord quality: ${quality}`);
  const octave = { low: 0, mid: 12, high: 24 }[register];
  if (octave === undefined) throw new RangeError(`Unsupported Campfire register: ${register}`);
  const reference = CAMPFIRE_REFERENCE_CHORDS.find((chord) => chord.rootPc === rootPc && chord.quality === quality);
  const root = 45 + ((rootPc - 9 + 12) % 12);
  const third = quality === "min" || quality === "dim" ? 3 : 4;
  const fifth = quality === "dim" ? 6 : quality === "aug" ? 8 : 7;
  return (reference?.notes || [root, root + fifth, root + 12, root + third + 12]).map((note) => note + octave);
}

// Clock-free performance intent shared by Core and native authoring. Hosts keep
// their existing timeline/sample clock and apply only their own clip transforms.
/**
 * @param {{beat:number, rootPc:number, quality?:string, register?:string, direction?:string}} options
 * @returns {{midi?:number, midiNotes?:number[], instrument:string, duration:number, velocity:number, articulation:string, direction:string, technique:{campfire:{recipeVersion:number,strumSeconds:number,tailPolicy:string}}} | null}
 */
export function campfireAcousticPerformanceNote({ beat, rootPc, quality = "maj", register = "low", direction = "down" } = {}) {
  requireInteger(beat, 0, 16383, "performance beat");
  if (!["down", "up"].includes(direction)) throw new RangeError(`Unsupported Campfire direction: ${direction}`);
  if (beat % 4 !== 0 && beat % 2 !== 1) return null;
  const notes = campfireAcousticVoicing({rootPc, quality, register});
  const picked = beat % 2 === 1;
  const midi = picked ? notes[beat % 3 === 1 ? 3 : 2] + 12 : undefined;
  if (picked && midi > CAMPFIRE_ACOUSTIC_RECIPE.maxMidi) throw new RangeError("Campfire strum and pick needs Low or Mid register. High picking exceeds the supported note range.");
  return {
    ...(picked ? {midi} : {midiNotes:notes}),
    instrument:CAMPFIRE_ACOUSTIC_RECIPE.id, duration:1.5,
    velocity:picked ? 0.15 / CAMPFIRE_ACOUSTIC_RECIPE.noteGain : 1,
    articulation:"open", direction,
    technique:{campfire:{recipeVersion:1,strumSeconds:0.027,tailPolicy:"reference-cut"}}
  };
}

function campfireEventParameters(event, { sampleRate = 44100, noteGain = 0.36 } = {}) {
  const notes = event.midiNotes?.length ? [...event.midiNotes] : [event.midi];
  if (notes.length > 12) throw new RangeError("Campfire supports at most 12 ordered notes per event.");
  const performance = event.technique?.campfire || {};
  const strumSeconds = performance.strumSeconds ?? 0.027;
  const velocity = event.velocity ?? 1;
  requireRange(strumSeconds, 0, 0.1, "strum seconds");
  requireRange(velocity, 0, 1.4, "velocity");
  requireRange(noteGain, 0, 1, "note gain");
  if (event.direction !== undefined && !["down", "up"].includes(event.direction)) throw new RangeError(`Unsupported Campfire direction: ${event.direction}`);
  if (event.direction === "up") notes.reverse();
  const identity = campfireAcousticNoteIdentity({ midi: notes[0], sampleRate, seed: performance.seed, recipeVersion: performance.recipeVersion, tailPolicy: performance.tailPolicy });
  notes.forEach((midi) => campfireAcousticNoteIdentity({ ...identity, midi, seed: performance.seed ?? midi * 311 }));
  const frameCount = Math.floor(sampleRate * 1.5) + Math.round((notes.length - 1) * strumSeconds * sampleRate);
  return { notes, identity, performance, strumSeconds, velocity, noteGain, sampleRate, frameCount };
}

export function campfireAcousticEventFrameCount(event, options = {}) {
  return campfireEventParameters(event, options).frameCount;
}

// Small scheduling descriptors share the renderer's validation and rounding.
// PCM preparation belongs outside the transport scheduler.
export function campfireAcousticEventVoices(event, options = {}) {
  const { notes, identity, performance, strumSeconds, velocity, noteGain, sampleRate } = campfireEventParameters(event, options);
  return notes.map((midi, index) => ({
    identity: { ...identity, midi, seed: performance.seed ?? midi * 311 },
    offsetSeconds: Math.round(index * strumSeconds * sampleRate) / sampleRate,
    gain: velocity * noteGain
  }));
}

export function renderCampfireAcousticEvent(event, options = {}) {
  const { notes, identity, performance, strumSeconds, velocity, noteGain, sampleRate, frameCount } = campfireEventParameters(event, options);
  const cache = options.cache || null;
  const output = new Float32Array(frameCount);
  notes.forEach((midi, stringIndex) => {
    // Per-note default seeds remain pitch-dependent, as in the reference.
    const options = { ...identity, midi, seed: performance.seed ?? midi * 311 };
    const samples = cache ? cache.getNote(options) : renderCampfireAcousticNote(options);
    const offset = Math.round(stringIndex * strumSeconds * sampleRate);
    for (let frame = 0; frame < samples.length; frame += 1) output[offset + frame] += samples[frame] * velocity * noteGain;
  });
  return output;
}

export function campfireAcousticReferenceEvents({ bpm = 76 } = {}) {
  requireRange(bpm, 40, 240, "tempo");
  const beatSeconds = 60 / bpm;
  const events = [];
  for (let beat = 0; beat < 32; beat += 1) {
    const chord = CAMPFIRE_REFERENCE_CHORDS[Math.floor(beat / 8)];
    if (beat % 4 === 0) events.push({ type: "guitar", instrument: "campfire_acoustic", time: beat * beatSeconds, duration: 1.5, velocity: 1, direction: "down", midiNotes: [...chord.notes] });
    if (beat % 2 === 1) events.push({ type: "guitar", instrument: "campfire_acoustic", time: beat * beatSeconds, duration: 1.5, velocity: 0.15 / 0.36, midi: chord.notes[beat % 3 === 1 ? 3 : 2] + 12 });
  }
  return events;
}

function requireInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`Campfire ${label} must be an integer from ${minimum} to ${maximum}.`);
}

function requireRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`Campfire ${label} must be from ${minimum} to ${maximum}.`);
}
