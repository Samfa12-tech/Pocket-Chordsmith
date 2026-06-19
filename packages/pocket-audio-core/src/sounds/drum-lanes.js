export const POCKET_DRUM_LANES = Object.freeze([
  { id: "kick", label: "Kick", short: "K", chordsmithPad: "kick", chordsmithPadName: "Kick", chordsmithPadMeta: "A - writes Kick", chordsmithPadKey: "a", chordsmithPadClass: "kick", chordsmithRecordTrack: "kick", chordsmithRecordLevel: 1, sequenced: true, defaultVolume: 1, defaultPan: 0 },
  { id: "snare", label: "Snare", short: "S", chordsmithPad: "snare", chordsmithPadName: "Snare", chordsmithPadMeta: "S - writes Snare", chordsmithPadKey: "s", chordsmithPadClass: "snare", chordsmithRecordTrack: "snare", chordsmithRecordLevel: 1, sequenced: true, defaultVolume: 1, defaultPan: 0 },
  { id: "clap", label: "Clap", short: "Cl", chordsmithPad: "clap", chordsmithPadName: "Clap", chordsmithPadMeta: "D - snare accent", chordsmithPadKey: "d", chordsmithPadClass: "snare", chordsmithRecordTrack: "snare", chordsmithRecordLevel: 2, sequenced: false, defaultVolume: 0.82, defaultPan: 0.05 },
  { id: "hat", label: "Hi-hat", short: "H", chordsmithPad: "hat", chordsmithPadName: "Hat", chordsmithPadMeta: "F - writes Hat", chordsmithPadKey: "f", chordsmithPadClass: "hat", chordsmithRecordTrack: "hat", chordsmithRecordLevel: 1, sequenced: true, defaultVolume: 1, defaultPan: 0 },
  { id: "openhat", label: "Open Hat", short: "OH", chordsmithPad: "openhat", chordsmithPadName: "Open Hat", chordsmithPadMeta: "G - hat accent", chordsmithPadKey: "g", chordsmithPadClass: "hat", chordsmithRecordTrack: "hat", chordsmithRecordLevel: 2, sequenced: false, defaultVolume: 0.9, defaultPan: 0.18 },
  { id: "tomlow", label: "Low Tom", short: "LT", chordsmithPad: "tomlow", chordsmithPadName: "Low Tom", chordsmithPadMeta: "J - live only", chordsmithPadKey: "j", chordsmithPadClass: "tom", chordsmithRecordTrack: null, chordsmithRecordLevel: 0, sequenced: false, defaultVolume: 0.86, defaultPan: -0.18 },
  { id: "tommid", label: "Mid Tom", short: "MT", chordsmithPad: "tommid", chordsmithPadName: "Mid Tom", chordsmithPadMeta: "K - live only", chordsmithPadKey: "k", chordsmithPadClass: "tom", chordsmithRecordTrack: null, chordsmithRecordLevel: 0, sequenced: false, defaultVolume: 0.84, defaultPan: 0 },
  { id: "tomhi", label: "High Tom", short: "HT", chordsmithPad: "tomhi", chordsmithPadName: "High Tom", chordsmithPadMeta: "L - live only", chordsmithPadKey: "l", chordsmithPadClass: "tom", chordsmithRecordTrack: null, chordsmithRecordLevel: 0, sequenced: false, defaultVolume: 0.82, defaultPan: 0.18 },
  { id: "crash", label: "Crash", short: "Cr", chordsmithPad: "crash", chordsmithPadName: "Crash", chordsmithPadMeta: "; - live only", chordsmithPadKey: ";", chordsmithPadClass: "fx", chordsmithRecordTrack: null, chordsmithRecordLevel: 0, sequenced: false, defaultVolume: 0.72, defaultPan: 0.24 },
  { id: "ride", label: "Ride", short: "Rd", chordsmithPad: "ride", chordsmithPadName: "Ride", chordsmithPadMeta: "' - live only", chordsmithPadKey: "'", chordsmithPadClass: "fx", chordsmithRecordTrack: null, chordsmithRecordLevel: 0, sequenced: false, defaultVolume: 0.78, defaultPan: 0.28 }
]);

export const POCKET_DRUM_LANE_IDS = Object.freeze(POCKET_DRUM_LANES.map((lane) => lane.id));

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
