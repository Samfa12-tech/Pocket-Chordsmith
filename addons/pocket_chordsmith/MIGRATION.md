# Migrating To Pocket Chordsmith Godot Addon 1.1.9

This release keeps the core architecture stable:

```text
Pocket Chordsmith JSON/share code -> PCSChartResource -> PocketChordsmithConductor
```

## Unreleased PCS schema-17 profile note

The importer now accepts PCS schema 17 while retaining schema-16 compatibility.
Recompile imported charts so `PCSChartResource` can preserve `sound_profile`,
`format_features`, expressive event counts, articulation, expression,
performance roles, sounds, and namespaced technique diagnostics.

Unsupported preview features are preserved in the imported source and reported
through capability/loss diagnostics. They are not silently removed. Existing
schema-16 projects continue through the compatibility migrator and retain their
legacy profile aliases.

Funk uses `funk_groove`; Western uses `western_frontier`; Chiptune normalizes
to `chip_arcade`; Heavy Metal remains `heavy_metal`. For production audio,
continue to route prepared `STEM_SYNC`/`HYBRID` assets rather than treating the
Web Kit's safe preview aliases as mastered genre parity.

## What To Change In Existing Projects

1. Re-enable the addon after replacing files.
2. Let Godot rebuild script class and import caches.
3. Recompile existing Pocket Chordsmith JSON files into fresh `PCSChartResource` `.tres` files.
4. Assign a `PCSPlaybackProfile` to each conductor.
5. For no-stems-yet projects, use the generated web-kit profile:

```text
res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
```

6. Keep any previous procedural preview player out of shipped gameplay scenes unless it is intentionally used as a temporary fallback.

## 1.1.9 Heavy Metal Profile Note

Version 1.1.9 understands Pocket Audio Heavy Metal profile metadata. Recompile imported JSON/share-code projects after updating; chart resources now preserve `audioProfile == "heavy_metal"`, `metalPreset`, `metalTexture`, metal drum kits, bass tones, chord instruments, melody instruments, guitar tone choices, and groove preset hints for Godot-native routing and adaptive game states.

The bundled web-kit playback profile includes safe preview aliases for the metal drum kits, picked/grind bass tones, metal chord stacks, shred/twin leads, and `tight_metal`/`doom_fuzz` guitar articulations. These are onboarding previews, not external sample packs or final mastered metal stems.

## 1.1.8 Sample Preview Sound-Parity Note

Version 1.1.8 improves Godot sample-preview parity for Pocket Chordsmith charts that use western sounds, live mix controls, performance feel, sidechain pump, pan, and FX. Recompile imported JSON/share-code projects after updating so chart resources include the new performance metadata and event flags, then preview with the bundled web-kit profile.

## 1.1.7 Pocket Audio Sound-Pack Note

Version 1.1.7 understands Pocket Chordsmith lofi/chillhop and chip tune profile metadata. Recompile imported JSON/share-code projects after updating; chart resources now preserve `audioProfile`, `lofiPreset`, `lofiTexture`, `chipPreset`, `chipTexture`, chip/lofi drum kits, bass tones, chord instruments, melody instruments, and groove preset hints for Godot-native routing and adaptive game states.

## 1.1.6 Direct Push-to-Godot Note

Version 1.1.6 adds an editor-only localhost receiver for Pocket Chordsmith browser handoffs. When the addon is enabled in an open editor, Pocket Chordsmith v67 can send a `PCS1:` song code to `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`; the `Chordsmith` tab imports and compiles it immediately. If the receiver is unavailable or browser local-network access is blocked, use the existing clipboard fallback: `Chordsmith` tab > `Paste JSON/Code` > paste > import.

## 1.1.5 Pocket Chordsmith v64 Western Sound Note

Version 1.1.5 understands Pocket Chordsmith v64 western musical sound IDs. Recompile v64 JSON or share-code imports after updating the addon; chord events preserve `flags.chord_instrument == "saloon_piano"`, melody tracks preserve `banjo`, `harmonica`, and `cowboy_whistle`, guitar rhythm events preserve `flags.tone == "western_twang"`, and western guitar preset names are accepted during import.

## 1.1.4 Runtime Sample Preview Stability Note

Version 1.1.4 tightens sample-preview timing behaviour for dense charts. Late preview hits older than `sample_preview_skip_late_audio_ticks` now default to being dropped after 120 ticks instead of being played as catch-up bursts. Keep `sample_preview_log_pitched_events` disabled outside short diagnostics, and leave `sample_preview_load_wavs_uncompressed` enabled for small hit kits unless memory testing says otherwise.

## 1.1 Web Export Note

Version 1.1 adds a web-export compatibility toggle for pitched tonal preview samples. `PCSPlaybackProfile.sample_preview_force_web_stream_for_pitched` defaults to `true`; leave it enabled for Godot web builds that use sample preview or HYBRID melody, bass, and chord playback. It does not affect rendered stems, and desktop/native preview remains on the normal Godot playback path unless you change the profile.

## 1.1.1 Guitar Import Note

Version 1.1.1 understands Pocket Chordsmith v60 rock-guitar projects. Recompile v60 JSON or share-code imports after updating the addon; guitar patterns compile into `track_type == "guitar"` events with power-chord note stacks in `flags.midi_notes`. Existing projects load with guitar disabled unless the exported project explicitly contains guitar settings.

## 1.1.2 Guitar Preview Note

Version 1.1.2 adds a dedicated `Music_Guitar` bus plus generated guitar preview samples. Run `Create Chordsmith Audio Buses` after updating if your project does not already have `Music_Guitar`; the tool creates/reroutes the recommended buses dry by default so Godot's mixer remains the place for guitar tone and ambience. Existing playback profiles still load, but regenerate the web sound kit or use the bundled web-kit profile to get the new guitar sample mappings.

## 1.1.3 Pocket Chordsmith v63 Sound Options Note

Version 1.1.3 understands Pocket Chordsmith v63 chord and melody sound option IDs. Recompile v63 JSON or share-code imports after updating the addon; chord events preserve `flags.chord_instrument`, and the bundled web-kit playback profile maps the new chord and melody sound IDs to safe preview samples.

## API Notes

Preferred runtime calls:

```gdscript
conductor.play()
conductor.queue_music_state("combat", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
conductor.queue_sequence(["A", "B", "C"], PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION)
conductor.trigger_stinger("victory_hit", "exploration")
conductor.duck_music(true, 0.5)
conductor.lowpass_music(0.75)
```

Preferred signals:

```gdscript
beat
bar_started
section_started
marker_hit
accent_hit
event_triggered
music_state_changed
music_state_queued
transition_started
transition_completed
stinger_started
stinger_finished
```

## Clean Rebuild

If Godot reports stale UID or script-class errors after replacing the addon, close Godot and follow:

```text
addons/pocket_chordsmith/docs/UID_CACHE_RECOVERY.md
```

The Asset Library repository uses `.gitattributes` export-ignore rules so downloads contain the portable `addons/pocket_chordsmith/` payload. Godot regenerates local IDs and import metadata when the addon is opened in a project.
