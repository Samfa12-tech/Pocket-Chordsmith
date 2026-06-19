import { DEFAULT_STEM_MIX } from "../constants.js";

export const CHORDSMITH_OFFLINE_STEM_GAIN = Object.freeze({
  drums: 0.68,
  bass: 0.68,
  chords: 0.78,
  melody: 0.82,
  guitar: 0.78
});

export const CHORDSMITH_OFFLINE_RENDER_HEADROOM = 0.34;

export function chordsmithOfflineStemOutputGain(stem, volume = defaultStemVolume(stem)) {
  return clamp01(volume) * offlineStemGain(stem);
}

export function chordsmithOfflineStemRenderGain(stem, volume = defaultStemVolume(stem), headroom = CHORDSMITH_OFFLINE_RENDER_HEADROOM) {
  return chordsmithOfflineStemOutputGain(stem, volume) * clamp01(headroom);
}

function defaultStemVolume(stem) {
  return DEFAULT_STEM_MIX[stem]?.volume ?? DEFAULT_STEM_MIX.melody.volume;
}

function offlineStemGain(stem) {
  return CHORDSMITH_OFFLINE_STEM_GAIN[stem] ?? CHORDSMITH_OFFLINE_STEM_GAIN.melody;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
