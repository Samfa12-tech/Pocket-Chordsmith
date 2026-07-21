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
- Text-only Chordsmith imports are rendered or imported before gameplay; the level runtime does not generate dense tonal streams on the fly.
- `SAMPLE_KIT_PACKAGE_REPORT.md` is current before addon release or Asset Library submission.
- `Music_Drums`, `Music_Bass`, `Music_Chords`, `Music_Guitar`, `Music_Melody`, and `Music_Stingers` buses exist or profile falls back safely.
- Drum bus has suitable Godot-native compression/limiting if needed.
- Mobile-safe polyphony cap is set.
- `sample_preview_log_pitched_events` is disabled outside short diagnostics.
- Small preview WAV kits use `sample_preview_load_wavs_uncompressed` unless memory testing proves otherwise.
- Legacy `PocketChordsmithPlayer.gd` is editor/demo only.

## Compatibility

- Test on the minimum supported Godot version.
- Test on the target export platforms.
- For web/mobile, test audio latency and polyphony under load.
- Perform a clean project reopen after deleting stale `.godot` caches if UID warnings appear.
- Run `HEADLESS_VALIDATION.md` for addon releases or any change touching import, compile, runtime validation, DAW pack import, direct push, or the localhost receiver.

## Documentation

- Include `GETTING_STARTED.md`.
- Include `HEADLESS_VALIDATION.md`.
- Include `LEVEL_INTEGRATION.md`.
- Include `STEM_WORKFLOW.md`.
- Include `SAMPLE_PREVIEW.md`.
- Include `PERFORMANT_AUDIO_ROADMAP.md`.
- Include `SAMPLE_KIT_PACKAGE_REPORT.md`.
- Include `CLI_COMPILE.md`.
- Include `UID_CACHE_RECOVERY.md`.
- Include `SKILL.md` for AI-assisted integration.
