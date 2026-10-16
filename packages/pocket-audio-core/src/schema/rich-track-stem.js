// Canonical rich-track ownership. Explicit stem takes precedence over role,
// then the track ID; unknown rich roles retain Core's melody fallback.
export function richTrackStem(trackId, track) {
  const requested = String(track?.stem || track?.role || trackId || "").toLowerCase();
  if (["drums", "drum", "kick", "snare", "rim", "clap", "hat", "hat_closed", "hat_open", "ride", "crash", "china", "tom_high", "tom_mid", "tom_low", "percussion"].includes(requested)) return "drums";
  if (requested === "bass") return "bass";
  if (["chord", "chords", "harmony", "stab", "stabs"].includes(requested)) return "chords";
  if (requested === "guitar") return "guitar";
  return "melody";
}
