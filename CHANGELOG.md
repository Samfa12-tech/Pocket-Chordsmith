# Pocket Chordsmith Godot Addon Changelog

## 0.9.0-rc1

Release-candidate hardening pass for the Godot addon.

Added:

- Pocket Chordsmith web-kit WAV generator and generated HYBRID playback profile.
- Godot-native audio playback extension points for stems, buses, samples, stingers, ducking, and filter/effect automation.
- Adaptive music state and boundary-aware transition APIs on `PocketChordsmithConductor`.
- Batch JSON compiler and runtime validator command-line tools.
- Runtime diagnostics for event cursor, emitted/late/skipped events, state, section, beat, tick, sample requests, and playback warnings.
- Integration docs, stem workflow docs, sample preview docs, UID/cache recovery notes, shipping checklist, and AI `SKILL.md`.

Changed:

- The addon author is now `Samfa12`.
- The editor toolbar is horizontally scrollable and includes button tooltips.
- The plugin can import from file, pasted JSON, or pasted `PCS1:` share code text.
- `PocketChordsmithPlayer.gd` is documented as legacy editor/demo preview rather than the shipped runtime playback layer.

Known RC limits:

- Generated samples are close Pocket Chordsmith-style recreations, not bit-identical WebAudio exports.
- Stem playback is prepared around Godot-native streams; projects still need to provide final rendered stems for shipped music beds.
- Full visual sequence editing still belongs in the web app for this RC.
