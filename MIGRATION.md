# Migrating To Pocket Chordsmith Godot Addon 1.1.2

This release keeps the core architecture stable:

```text
Pocket Chordsmith JSON/share code -> PCSChartResource -> PocketChordsmithConductor
```

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

## 1.1 Web Export Note

Version 1.1 adds a web-export compatibility toggle for pitched tonal preview samples. `PCSPlaybackProfile.sample_preview_force_web_stream_for_pitched` defaults to `true`; leave it enabled for Godot web builds that use sample preview or HYBRID melody, bass, and chord playback. It does not affect rendered stems, and desktop/native preview remains on the normal Godot playback path unless you change the profile.

## 1.1.1 Guitar Import Note

Version 1.1.1 understands Pocket Chordsmith v60 rock-guitar projects. Recompile v60 JSON or share-code imports after updating the addon; guitar patterns compile into `track_type == "guitar"` events with power-chord note stacks in `flags.midi_notes`. Existing projects load with guitar disabled unless the exported project explicitly contains guitar settings.

## 1.1.2 Guitar Preview Note

Version 1.1.2 adds a dedicated `Music_Guitar` bus plus generated guitar preview samples. Run `Create Chordsmith Audio Buses` after updating if your project does not already have `Music_Guitar`; the tool will add a safe native amp/cab-style preview chain without removing existing buses. Existing playback profiles still load, but regenerate the web sound kit or use the bundled web-kit profile to get the new guitar sample mappings.

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
