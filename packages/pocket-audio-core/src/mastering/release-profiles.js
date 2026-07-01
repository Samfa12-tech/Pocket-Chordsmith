export const RELEASE_PROFILES = Object.freeze({
  spotify_lofi_chill: Object.freeze({
    id: "spotify_lofi_chill",
    label: "Spotify Lofi Chill",
    targetIntegratedLufs: -14,
    targetToleranceLu: 0.7,
    truePeakCeilingDbtp: -1,
    louderThanTargetTruePeakCeilingDbtp: -2,
    channels: 2,
    preferredBitDepth: 24,
    preferredFormat: "wav24",
    optionalFormat: "flac",
    sampleRate: 44100,
    albumConsistency: true,
    preserveDynamics: true,
    maxLimiterGainReductionDb: 3,
    dcBlock: true,
    highPassHz: 24,
    warmth: {
      enabled: true,
      drive: 1.08,
      mix: 0.12
    },
    glueCompression: {
      enabled: true,
      thresholdDb: -18,
      ratio: 1.5,
      attackMs: 25,
      releaseMs: 160,
      maxGainReductionDb: 1.5
    },
    limiter: {
      lookaheadMs: 5,
      releaseMs: 80,
      oversample: 4
    },
    mixAssistant: {
      chordGainDb: -0.6,
      chordReason: "Lofi mastering note: chord stem sits a bit forward in the mix; apply a small non-destructive trim before mastering."
    }
  })
});

export function getReleaseProfile(id = "spotify_lofi_chill") {
  const profile = RELEASE_PROFILES[id];
  if (!profile) throw new Error(`Unknown release profile: ${id}`);
  return JSON.parse(JSON.stringify(profile));
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain) {
  if (!Number.isFinite(gain) || gain <= 0) return null;
  return 20 * Math.log10(gain);
}
