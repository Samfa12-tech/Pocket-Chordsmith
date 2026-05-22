# Pocket Chordsmith Godot Addon Changelog

## 1.1.0

Web export compatibility update for sample preview and hybrid playback.

Added:

- A `sample_preview_force_web_stream_for_pitched` playback profile option, enabled by default, so pitched bass, chord, and melody preview samples use Godot stream playback on web exports.
- A `sample_preview_log_pitched_events` debug option for inspecting sample key, MIDI note, pitch scale, bus, and playback type when diagnosing tonal preview playback.

Changed:

- Pitched sample preview now requests `AudioServer.PLAYBACK_TYPE_STREAM` on web builds where needed, avoiding the melody pitch variation issue seen in exported games.
- Tonal sample preview keeps the same behavior on desktop/native exports unless the project explicitly changes profile settings.

## 1.0.0

First stable release of the Godot addon.

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

Known limits:

- Generated samples are close Pocket Chordsmith-style recreations, not bit-identical WebAudio exports.
- Stem playback is prepared around Godot-native streams; projects still need to provide final rendered stems for shipped music beds.
- Full visual sequence editing still belongs in the web app for this release.
