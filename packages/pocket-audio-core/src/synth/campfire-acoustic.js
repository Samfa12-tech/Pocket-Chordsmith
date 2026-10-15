import { renderCampfireAcousticEvent } from "../sounds/campfire-acoustic.js";

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
