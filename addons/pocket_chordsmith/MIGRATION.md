# Migrating To Pocket Chordsmith Godot Addon 0.9.0-rc1

This RC keeps the core architecture stable:

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
