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
  const bytes = identities.size * bytesPerNote;
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
  const stopAll = (releaseSeconds = 0.005) => {
    if (!Number.isFinite(releaseSeconds) || releaseSeconds < 0 || releaseSeconds > 0.1) throw new RangeError("Campfire stop release must be from zero to 0.1 seconds.");
    for (const voice of active) {
      if (voice.stopped) continue;
      voice.stopped = true;
      const now = context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.level, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + releaseSeconds);
      voice.source.stop(now + releaseSeconds);
    }
  };
  return {
    getDiagnostics: () => ({ entries: buffers.size, bytes: disposed ? 0 : bytes, maxBytes, activeVoices: active.size }),
    schedule(event, when, { gain = 1, pan = event.pan ?? 0 } = {}) {
      if (disposed) throw new Error("Campfire note bank has been disposed.");
      if (!Number.isFinite(when) || !Number.isFinite(gain) || gain < 0 || !Number.isFinite(pan) || pan < -1 || pan > 1) throw new RangeError("Invalid Campfire scheduling time, gain or pan.");
      const voices = campfireAcousticEventVoices(event, { sampleRate: context.sampleRate });
      const prepared = voices.map((voice) => {
        const buffer = buffers.get(campfireAcousticNoteKey(voice.identity));
        if (!buffer) throw new Error("Campfire note identity was not prepared. Stop and prepare the updated project before playing.");
        return { ...voice, buffer };
      });
      const start = Math.max(context.currentTime, when);
      for (const item of prepared) {
        const source = context.createBufferSource();
        const output = context.createGain();
        const panner = context.createStereoPanner();
        const level = item.gain * gain;
        source.buffer = item.buffer;
        output.gain.setValueAtTime(level, start + item.offsetSeconds);
        panner.pan.setValueAtTime(pan, start);
        source.connect(output);
        output.connect(panner);
        panner.connect(options.destination || context.destination);
        const voice = { source, gain: output, level, when: start + item.offsetSeconds, stopped: false };
        source.onended = () => {
          active.delete(voice);
          source.disconnect();
          output.disconnect();
          panner.disconnect();
        };
        active.add(voice);
        source.start(start + item.offsetSeconds);
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
      const voice = { source, gain, stopped: false };
      source.onended = () => {
        active.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start(when);
      active.add(voice);
      return { stop: (releaseSeconds) => stopVoice(voice, releaseSeconds) };
    },
    stopAll(releaseSeconds) {
      active.forEach((voice) => stopVoice(voice, releaseSeconds));
    }
  };
}
