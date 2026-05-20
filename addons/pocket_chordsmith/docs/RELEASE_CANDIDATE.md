# Pocket Chordsmith Release Candidate Guide

## You Do

- Choose the public version label and release name.
- Confirm the license and any third-party sample/stem licensing language.
- Test in the Godot versions you want to officially support.
- Test one real exported build target, especially Web or mobile if that is part of the promise.
- Record or capture a short demo showing JSON import, generated sound kit, conductor signals, and adaptive state switching.
- Write the itch/GitHub release description in your own voice.

## Codex/Addon Automation Does

- Compile JSON or share-code exports into `PCSChartResource`.
- Generate the web-style sample kit and HYBRID playback profile.
- Validate chart/profile runtime readiness.
- Export an integration report.
- Package the clean addon zip.
- Keep runtime playback chart-driven and free of JSON parsing.

## RC Smoke Test

From a project containing the addon:

```text
godot --headless --path <project> --editor --quit
godot --headless --path <project> res://addons/pocket_chordsmith/demos/demo_music_level.tscn --quit-after 2
```

Validate a compiled chart:

```text
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart res://path/to/chart.tres --profile res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres --report res://pocket_chordsmith_integration_report.md
```

For Godot Asset Library submission, rely on the repository `.gitattributes` export-ignore rules. The generated Asset Library download should include `addons/pocket_chordsmith/` only.

## RC Exit Criteria

- Addon enables without editor errors.
- Demo scene opens and runs.
- A v58 JSON/share code compiles.
- A compiled chart validates with no errors.
- Runtime conductor emits beat/bar/section/marker/accent/event signals.
- Generated HYBRID profile triggers sample hits.
- STEM_SYNC warns clearly when stems are missing.
- No runtime gameplay code parses Pocket Chordsmith JSON.
