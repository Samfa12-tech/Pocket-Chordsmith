import { campfireAcousticEventVoices, campfireAcousticNoteKey, renderCampfireAcousticEvent, renderCampfireAcousticNote } from "../sounds/campfire-acoustic.js";

// Prepare every reachable section before starting transport. The fixed budget
// fails explicitly instead of evicting notes and synthesizing inside lookahead.
export async function prepareCampfireAcousticNoteBank(context, events, options = {}) {
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  if (!Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 * 1024) throw new RangeError("Campfire preparation budget must be from zero to 64 MiB.");
  const checkCancelled = () => {
    if (options.signal?.aborted) throw new DOMException("Campfire preparation cancelled", "AbortError");
  };
  const identities = new Map();
  const bytesPerNote = Math.floor(context.sampleRate * 1.5) * 4;
  checkCancelled();
  for (const event of events) {
    for (const voice of campfireAcousticEventVoices(event, { sampleRate: context.sampleRate })) {
      identities.set(campfireAcousticNoteKey(voice.identity), voice.identity);
      if (identities.size * bytesPerNote > maxBytes) throw new RangeError(`Campfire preparation exceeds the configured ${maxBytes} PCM byte budget. Use offline rendering or a smaller set of note identities.`);
    }
  }
  let bytes = identities.size * bytesPerNote;
  const buffers = new Map();
  const yieldTask = options.yieldTask || (() => new Promise((resolve) => setTimeout(resolve, 0)));
  for (const [key, identity] of identities) {
    checkCancelled();
    const pcm = renderCampfireAcousticNote(identity);
    const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
    buffer.copyToChannel(pcm, 0);
    buffers.set(key, buffer);
    // Let Stop, project changes and newer Play requests cancel cold preparation.
    if (buffers.size % 4 === 0) await yieldTask();
  }
  checkCancelled();
  const active = new Set();
  let disposed = false;
  let updateGeneration = 0;
  let updateTail = Promise.resolve();
  let outputGain = 1;
  const rampVoiceGain = (voice, level, seconds) => {
    const now = context.currentTime;
    const param = voice.gain.gain;
    const currentLevel = Number.isFinite(param.value) ? param.value : voice.level;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
    else param.cancelScheduledValues(now);
    // Anchor the ramp at now even after a long constant-gain segment; otherwise
    // a new ramp may interpolate from the voice's original start-time event.
    param.setValueAtTime(currentLevel, now);
    param.linearRampToValueAtTime(level, now + seconds);
    voice.level = level;
  };
  const stopAll = (releaseSeconds = 0.005) => {
    if (!Number.isFinite(releaseSeconds) || releaseSeconds < 0 || releaseSeconds > 0.1) throw new RangeError("Campfire stop release must be from zero to 0.1 seconds.");
    for (const voice of active) {
      if (voice.stopped) continue;
      voice.stopped = true;
      const now = context.currentTime;
      if (voice.when > now) {
        voice.source.stop(now);
        continue;
      }
      rampVoiceGain(voice, 0, releaseSeconds);
      voice.source.stop(now + releaseSeconds);
    }
  };
  return {
    getDiagnostics: () => ({ entries: buffers.size, bytes: disposed ? 0 : bytes, maxBytes, activeVoices: active.size, outputGain }),
    prepareMissingEvents(events, {signal, yieldTask:yieldMore = yieldTask} = {}) {
      const generation = ++updateGeneration;
      const update = updateTail.catch(() => {}).then(async () => {
        const check = () => {
          if(disposed || signal?.aborted || generation !== updateGeneration) throw new DOMException("Campfire preparation cancelled", "AbortError");
        };
        check();
        const missing = new Map();
        for(const event of events) for(const voice of campfireAcousticEventVoices(event, {sampleRate:context.sampleRate})) {
          const key = campfireAcousticNoteKey(voice.identity);
          if(!buffers.has(key)) missing.set(key, voice.identity);
          if(bytes + missing.size * bytesPerNote > maxBytes) throw new RangeError("Campfire live edits exceed the prepared PCM budget. Stop and Play to rebuild the current note set.");
        }
        const pending = new Map();
        try {
          for(const [key, identity] of missing) {
            check();
            const pcm = renderCampfireAcousticNote(identity);
            const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
            buffer.copyToChannel(pcm, 0);
            pending.set(key, buffer);
            if(pending.size % 4 === 0) await yieldMore();
          }
          check();
          for(const [key, buffer] of pending) buffers.set(key, buffer);
          bytes = buffers.size * bytesPerNote;
          return {added:pending.size, bytes};
        } finally {
          pending.clear();
        }
      });
      updateTail = update;
      return update;
    },
    setOutputGain(gain, rampSeconds = 0.005) {
      if (disposed) throw new Error("Campfire note bank has been disposed.");
      if (!Number.isFinite(gain) || gain < 0 || !Number.isFinite(rampSeconds) || rampSeconds < 0 || rampSeconds > 0.1) throw new RangeError("Invalid Campfire output gain or ramp time.");
      outputGain = gain;
      for (const voice of active) if (!voice.stopped) rampVoiceGain(voice, voice.baseLevel * outputGain, rampSeconds);
    },
    schedule(event, when, { gain = 1, pan = event.pan ?? 0 } = {}) {
      if (disposed) throw new Error("Campfire note bank has been disposed.");
      if (!Number.isFinite(when) || !Number.isFinite(gain) || gain < 0 || !Number.isFinite(pan) || pan < -1 || pan > 1) throw new RangeError("Invalid Campfire scheduling time, gain or pan.");
      const voices = campfireAcousticEventVoices(event, { sampleRate: context.sampleRate });
      const prepared = voices.map((voice) => {
        const buffer = buffers.get(campfireAcousticNoteKey(voice.identity));
        if (!buffer) throw new Error("Campfire note identity was not prepared. Stop and prepare the updated project before playing.");
        return { ...voice, buffer };
      });
      // Match offline/native onset placement. Fractional BufferSource start
      // times interpolate the prepared PCM instead of playing its exact samples.
      const startFrame = Math.max(Math.round(context.currentTime * context.sampleRate), Math.floor(when * context.sampleRate));
      const start = startFrame / context.sampleRate;
      for (const item of prepared) {
        const voiceWhen = (startFrame + Math.round(item.offsetSeconds * context.sampleRate)) / context.sampleRate;
        const source = context.createBufferSource();
        const output = context.createGain();
        const panner = context.createStereoPanner();
        const baseLevel = item.gain * gain;
        const level = baseLevel * outputGain;
        source.buffer = item.buffer;
        // Controls may cancel the onset event before this queued string starts.
        // Its intrinsic gain must already be the intended level while silent.
        output.gain.value = level;
        output.gain.setValueAtTime(level, voiceWhen);
        panner.pan.setValueAtTime(pan, start);
        source.connect(output);
        output.connect(panner);
        panner.connect(options.destination || context.destination);
        const voice = { source, gain: output, baseLevel, level, when: voiceWhen, stopped: false };
        source.onended = () => {
          active.delete(voice);
          source.disconnect();
          output.disconnect();
          panner.disconnect();
        };
        active.add(voice);
        source.start(voiceWhen);
      }
    },
    stopAll,
    cancelScheduledFrom(when) {
      // Preserve sounding tails across section changes; remove old lookahead.
      for (const voice of active) if (!voice.stopped && voice.when >= when) {
        voice.stopped = true;
        voice.source.stop(context.currentTime);
      }
    },
    dispose() {
      updateGeneration++;
      stopAll();
      buffers.clear();
      disposed = true;
    }
  };
}

// Prepare outside a scheduler/audio callback. Preparing never starts playback.
// The caller owns routing, musical position and the AudioContext lifecycle.
export function prepareCampfireAcousticPlayback(context, event, options = {}) {
  const pcm = renderCampfireAcousticEvent(event, { ...options, sampleRate: context.sampleRate });
  const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
  buffer.copyToChannel(pcm, 0);
  const active = new Set();
  const destination = options.destination || context.destination;

  const stopVoice = (voice, releaseSeconds = 0.005) => {
    if (voice.stopped) return;
    if (!Number.isFinite(releaseSeconds) || releaseSeconds < 0 || releaseSeconds > 0.1) throw new RangeError("Campfire stop release must be from zero to 0.1 seconds.");
    const now = context.currentTime;
    voice.stopped = true;
    if (voice.when > now) {
      voice.source.stop(now);
      return;
    }
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(1, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + releaseSeconds);
    voice.source.stop(now + releaseSeconds);
  };

  return {
    durationSeconds: buffer.duration,
    sampleRate: buffer.sampleRate,
    getActiveVoiceCount: () => active.size,
    start(when = context.currentTime) {
      if (!Number.isFinite(when) || when < context.currentTime) throw new RangeError("Campfire start must use a current or future AudioContext time.");
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(destination);
      const startFrame = Math.max(Math.round(context.currentTime * context.sampleRate), Math.floor(when * context.sampleRate));
      const voice = { source, gain, when: startFrame / context.sampleRate, stopped: false };
      source.onended = () => {
        active.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start(voice.when);
      active.add(voice);
      return { stop: (releaseSeconds) => stopVoice(voice, releaseSeconds) };
    },
    stopAll(releaseSeconds) {
      active.forEach((voice) => stopVoice(voice, releaseSeconds));
    }
  };
}
