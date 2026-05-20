# Shipping Checklist

Before publishing a game or distributing the addon, check these.

## Addon

- Plugin enables without editor errors.
- `Chordsmith` main screen opens.
- Icon appears in plugin settings.
- Toolbar buttons fit or scroll.
- JSON file import works.
- Pasted JSON/share code import works.
- Folder compile works.
- `.tres` chart save/load works.
- Demo scene opens and runs.
- README links to all important docs.

## Runtime

- Levels use `PCSChartResource`, not raw JSON.
- One `PocketChordsmithConductor` per active music timeline.
- Beat/bar/section/marker/accent/event signals are connected.
- Adaptive state transitions are tested.
- `get_diagnostics()` shows no unexpected late/deferred event spikes.
- `max_events_per_frame` is high enough for dense charts.
- No gameplay code depends on editor-only nodes.

## Audio

- Shipped music uses `STEM_SYNC` or `HYBRID`.
- Stems are imported as Godot audio streams.
- Drum/accent/stinger samples are assigned in `PCSPlaybackProfile`.
- `Music_Drums`, `Music_Bass`, `Music_Chords`, `Music_Melody`, and `Music_Stingers` buses exist or profile falls back safely.
- Drum bus has suitable Godot-native compression/limiting if needed.
- Mobile-safe polyphony cap is set.
- Legacy `PocketChordsmithPlayer.gd` is editor/demo only.

## Compatibility

- Test on the minimum supported Godot version.
- Test on the target export platforms.
- For web/mobile, test audio latency and polyphony under load.
- Perform a clean project reopen after deleting stale `.godot` caches if UID warnings appear.

## Documentation

- Include `GETTING_STARTED.md`.
- Include `LEVEL_INTEGRATION.md`.
- Include `STEM_WORKFLOW.md`.
- Include `SAMPLE_PREVIEW.md`.
- Include `CLI_COMPILE.md`.
- Include `UID_CACHE_RECOVERY.md`.
- Include `SKILL.md` for AI-assisted integration.

