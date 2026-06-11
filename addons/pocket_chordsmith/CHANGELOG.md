# Pocket Chordsmith Godot Addon Changelog

## 1.1.6

Direct Push-to-Godot browser handoff update.

Added:

- Editor-only localhost receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`.
- Pocket Chordsmith browser app v67 can send `PCS1:` song codes directly to the open Godot addon.
- The `Chordsmith` tab imports and compiles pushed songs immediately, then leaves saving as an explicit `Save Chart Resource` step.

Changed:

- Push-to-Godot docs now describe the direct receiver flow with the existing clipboard/paste fallback.

## 1.1.5

Pocket Chordsmith v64 western sound compatibility update.

Changed:

- Importer schema now preserves v64 western sound IDs from web exports: `saloon_piano`, `banjo`, `harmonica`, `cowboy_whistle`, and `western_twang`.
- Importer schema now preserves v64 western guitar pattern presets: `boom_chick`, `train_chop`, and `western_waltz`.
- The bundled web-kit playback profile maps new western chord and melody IDs to safe preview samples, so v64 charts compile and audition without custom sample packs.
- Generated web-kit playback profiles now include the v63 and v64 chord/melody sample keys.

## 1.1.4

Runtime sample-preview stability update.

Changed:

- Sample preview now drops hits that are more than 120 ticks late instead of playing old notes as catch-up bursts.
- Runtime diagnostics now report `sample_play_skipped_late_total`.
- The bundled web-kit profile and generated web-kit profiles use the tighter late-hit threshold.
- Playback profile warnings now flag pitched-event debug logging, compressed/imported WAV preview loading, and missing `Music_Guitar` buses.

Docs:

- Sample preview docs now call out diagnostic logging as a temporary-only option and list the generated guitar web-kit samples.

## 1.1.3

Sound-option compatibility update for Pocket Chordsmith v63 projects.

Changed:

- Chord events now preserve the browser app's optional `chordInstrument` choice in event flags.
- Sample-preview lookup can route chord-specific keys such as `chord:piano`, `chord:harp`, `chord:warm_pad`, `chord:glass`, and `chord:pocket` when a playback profile provides them.
- The bundled web-kit profile maps new chord and melody sound IDs to safe existing preview samples, so v63 charts compile and audition without custom sample packs.

## 1.1.2

Guitar preview audio update for the v60 rock guitar import path.

Added:

- Dedicated `Music_Guitar` bus support through `PCSPlaybackProfile.guitar_bus`.
- A conservative native guitar preview chain for the recommended bus layout: high-pass, drive, cab-style EQ, low-pass, compression, and limiting.
- Generated web-kit guitar samples for open strums, palm-muted chugs, accents, and scratches.

Changed:

- Guitar sample preview now routes to `Music_Guitar` instead of the chord bus.
- Web-kit guitar event sample keys now point to guitar-specific WAVs instead of `chord_tone.wav`.
- Guitar sample pitch preview uses low-E style source tuning so root/fifth/octave stacks sit in a more useful rhythm-guitar range.

## 1.1.1

Rock guitar import compatibility update for Pocket Chordsmith v60 projects.

Added:

- Importer schema support for optional v60 guitar settings and per-section guitar patterns.
- Chart compiler output for guitar rhythm events, including root/fifth/octave power-chord note stacks, palm-muted chugs, accents, scratches, holds, register, tone, and strum-direction flags.
- HYBRID/sample-preview fallback keys for guitar events so new charts can audition in Godot without custom samples.
- A `guitar` stem layer in generated playback profile templates and stem workflow docs.

Changed:

- Timeline, section list, and import summary views now include guitar event counts when present.
- Sample preview routes guitar through the chord bus and allows three-note power chords while keeping older chord preview limits unchanged.
- Older projects still normalise with guitar disabled and empty per-section guitar patterns.

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
