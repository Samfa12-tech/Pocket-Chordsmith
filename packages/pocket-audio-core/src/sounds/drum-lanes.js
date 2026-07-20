export const POCKET_DRUM_LANES = Object.freeze([
  { id: "kick", label: "Kick", short: "K", chordsmithPad: "kick", chordsmithPadName: "Kick", chordsmithPadMeta: "A - writes Kick", chordsmithPadKey: "a", chordsmithPadClass: "kick", chordsmithRecordTrack: "kick", chordsmithRecordLane: "kick", chordsmithRecordLevel: 1, sequenced: true, defaultVolume: 1, defaultPan: 0 },
  { id: "snare", label: "Snare", short: "S", chordsmithPad: "snare", chordsmithPadName: "Snare", chordsmithPadMeta: "S - writes Snare", chordsmithPadKey: "s", chordsmithPadClass: "snare", chordsmithRecordTrack: "snare", chordsmithRecordLane: "snare", chordsmithRecordLevel: 1, sequenced: true, defaultVolume: 1, defaultPan: 0 },
  { id: "clap", label: "Clap", short: "Cl", chordsmithPad: "clap", chordsmithPadName: "Clap", chordsmithPadMeta: "D - writes Clap", chordsmithPadKey: "d", chordsmithPadClass: "snare", chordsmithRecordTrack: null, chordsmithRecordLane: "clap", chordsmithRecordLevel: 1, sequenced: false, defaultVolume: 0.82, defaultPan: 0.05 },
  { id: "hat", label: "Hi-hat", short: "H", chordsmithPad: "hat", chordsmithPadName: "Hat", chordsmithPadMeta: "F - writes Closed Hat", chordsmithPadKey: "f", chordsmithPadClass: "hat", chordsmithRecordTrack: "hat", chordsmithRecordLane: "hat_closed", chordsmithRecordLevel: 1, sequenced: true, defaultVolume: 1, defaultPan: 0 },
  { id: "openhat", label: "Open Hat", short: "OH", chordsmithPad: "openhat", chordsmithPadName: "Open Hat", chordsmithPadMeta: "G - writes Open Hat", chordsmithPadKey: "g", chordsmithPadClass: "hat", chordsmithRecordTrack: "hat", chordsmithRecordLane: "hat_open", chordsmithRecordLevel: 2, sequenced: false, defaultVolume: 0.9, defaultPan: 0.18 },
  { id: "tomlow", label: "Low Tom", short: "LT", chordsmithPad: "tomlow", chordsmithPadName: "Low Tom", chordsmithPadMeta: "J - writes Low Tom", chordsmithPadKey: "j", chordsmithPadClass: "tom", chordsmithRecordTrack: null, chordsmithRecordLane: "tom_low", chordsmithRecordLevel: 1, sequenced: false, defaultVolume: 0.86, defaultPan: -0.18 },
  { id: "tommid", label: "Mid Tom", short: "MT", chordsmithPad: "tommid", chordsmithPadName: "Mid Tom", chordsmithPadMeta: "K - writes Mid Tom", chordsmithPadKey: "k", chordsmithPadClass: "tom", chordsmithRecordTrack: null, chordsmithRecordLane: "tom_mid", chordsmithRecordLevel: 1, sequenced: false, defaultVolume: 0.84, defaultPan: 0 },
  { id: "tomhi", label: "High Tom", short: "HT", chordsmithPad: "tomhi", chordsmithPadName: "High Tom", chordsmithPadMeta: "L - writes High Tom", chordsmithPadKey: "l", chordsmithPadClass: "tom", chordsmithRecordTrack: null, chordsmithRecordLane: "tom_high", chordsmithRecordLevel: 1, sequenced: false, defaultVolume: 0.82, defaultPan: 0.18 },
  { id: "crash", label: "Crash", short: "Cr", chordsmithPad: "crash", chordsmithPadName: "Crash", chordsmithPadMeta: "; - writes Crash", chordsmithPadKey: ";", chordsmithPadClass: "fx", chordsmithRecordTrack: null, chordsmithRecordLane: "crash", chordsmithRecordLevel: 1, sequenced: false, defaultVolume: 0.72, defaultPan: 0.24 },
  { id: "ride", label: "Ride", short: "Rd", chordsmithPad: "ride", chordsmithPadName: "Ride", chordsmithPadMeta: "' - writes Ride", chordsmithPadKey: "'", chordsmithPadClass: "fx", chordsmithRecordTrack: null, chordsmithRecordLane: "ride", chordsmithRecordLevel: 1, sequenced: false, defaultVolume: 0.78, defaultPan: 0.28 }
]);

export const POCKET_DRUM_LANE_IDS = Object.freeze(POCKET_DRUM_LANES.map((lane) => lane.id));

export const POCKET_AUDIO_COMMON_DRUM_LANES = Object.freeze([
  { id: "kick", fallback: "kick" },
  { id: "snare", fallback: "snare" },
  { id: "rim", fallback: "snare" },
  { id: "clap", fallback: "clap" },
  { id: "hat_closed", fallback: "hat" },
  { id: "hat_open", fallback: "openhat" },
  { id: "ride", fallback: "ride" },
  { id: "crash", fallback: "crash" },
  { id: "china", fallback: "crash" },
  { id: "tom_high", fallback: "tomhi" },
  { id: "tom_mid", fallback: "tommid" },
  { id: "tom_low", fallback: "tomlow" },
  { id: "percussion", fallback: "clap" }
].map((lane) => Object.freeze(lane)));

export const POCKET_AUDIO_COMMON_DRUM_LANE_IDS = Object.freeze(POCKET_AUDIO_COMMON_DRUM_LANES.map((lane) => lane.id));

export const POCKET_AUDIO_DRUM_LANE_ALIASES = Object.freeze({
  hat: "hat_closed",
  closedhat: "hat_closed",
  openhat: "hat_open",
  tomhi: "tom_high",
  tommid: "tom_mid",
  tomlow: "tom_low"
});

export function normalisePocketAudioDrumLane(value, options = {}) {
  const requested = String(value || options.fallback || "percussion").trim().toLowerCase();
  const canonical = POCKET_AUDIO_DRUM_LANE_ALIASES[requested] || requested;
  if (POCKET_AUDIO_COMMON_DRUM_LANE_IDS.includes(canonical)) return canonical;
  return options.preserveUnknown === false ? (options.fallback || "percussion") : canonical;
}

export function pocketAudioDrumLaneFallback(value) {
  const canonical = normalisePocketAudioDrumLane(value);
  return POCKET_AUDIO_COMMON_DRUM_LANES.find((lane) => lane.id === canonical)?.fallback || "clap";
}

export const CHORDSMITH_SEQUENCED_DRUM_LANE_IDS = Object.freeze(
  POCKET_DRUM_LANES.filter((lane) => lane.sequenced).map((lane) => lane.id)
);

export const CHORDSMITH_LIVE_DRUM_VOICES = Object.freeze({
  kick: Object.freeze({ peak: 0.95 }),
  snare: Object.freeze({ peak: 0.56 }),
  hat: Object.freeze({ peak: 0.17, open: false }),
  openhat: Object.freeze({ peak: 0.25, open: true }),
  clap: Object.freeze({
    peak: 0.34,
    burstOffsets: Object.freeze([0, 0.018, 0.036]),
    noiseSeconds: 0.09,
    bandpassBase: 1450,
    bandpassStep: 150,
    bandpassQ: 0.85,
    gainFloor: 0.05,
    attackSeconds: 0.002,
    releaseSeconds: 0.075
  }),
  tomlow: Object.freeze({ frequency: 118, peak: 0.62, endFrequencyRatio: 0.58, sweepSeconds: 0.22, attackSeconds: 0.004, releaseSeconds: 0.28, stopSeconds: 0.31, gainFloor: 0.05 }),
  tommid: Object.freeze({ frequency: 158, peak: 0.58, endFrequencyRatio: 0.58, sweepSeconds: 0.22, attackSeconds: 0.004, releaseSeconds: 0.28, stopSeconds: 0.31, gainFloor: 0.05 }),
  tomhi: Object.freeze({ frequency: 218, peak: 0.52, endFrequencyRatio: 0.58, sweepSeconds: 0.22, attackSeconds: 0.004, releaseSeconds: 0.28, stopSeconds: 0.31, gainFloor: 0.05 }),
  crash: Object.freeze({ peak: 0.42, durationSeconds: 0.9, highpass: 3300, attackSeconds: 0.006, gainFloor: 0.03 }),
  ride: Object.freeze({ peak: 0.24, durationSeconds: 0.42, highpass: 4300, attackSeconds: 0.006, gainFloor: 0.03, bellFrequency: 980, bellGain: 0.07, bellReleaseSeconds: 0.22, bellStopSeconds: 0.24 })
});

export function chordsmithLiveDrumPadPeak(laneId, velocity = 1) {
  const voice = CHORDSMITH_LIVE_DRUM_VOICES[laneId] || CHORDSMITH_LIVE_DRUM_VOICES.hat;
  const v = Math.max(0.15, Math.min(1.25, Number(velocity) || 1));
  return voice.peak * v;
}

export function findPocketDrumLane(id) {
  return POCKET_DRUM_LANES.find((lane) => lane.id === id) || null;
}
