# Pocket Chordsmith Godot Addon Skill

Use this guidance when helping a project integrate `addons/pocket_chordsmith`.

This file is intentionally public-safe. Do not add local machine paths, private project names,
personal emails, credentials, tokens, or deployment secrets here.

## AI Assistant Role

Pocket Chordsmith should be treated as a reusable Godot addon, not as project-specific game code.
When helping a user, inspect their current Godot project first and adapt paths to that project.
Keep changes isolated under `res://addons/pocket_chordsmith/` unless the user explicitly asks
for level scripts, autoloads, or game-specific integration code.

If the user is modifying the addon itself, validate against a small Godot project and avoid
committing generated `.godot/`, `.uid`, `.import`, export builds, or local cache files.

## Core Architecture

Pocket Chordsmith is a music intelligence layer:

```text
Pocket Chordsmith JSON/share code
-> importer/schema migrator
-> PCSChartResource
-> PocketChordsmithConductor
-> game signals and Godot-native audio playback
```

Do not recommend runtime gameplay parsing full Pocket Chordsmith JSON. Do not port the browser app into runtime. Do not build a heavy custom synth/audio engine in the addon.

## Preferred Runtime Responsibilities

`PocketChordsmithConductor` should handle:

- integer tick timeline
- beat/bar/section tracking
- compiled event cursor
- markers
- accents
- adaptive music states
- transition boundaries
- stinger triggers
- layer mute/volume requests
- Godot bus/effect control
- diagnostics

Godot should handle:

- actual audio playback
- `AudioStreamPlayer`
- `AudioStreamSynchronized`
- `AudioStreamPolyphonic`
- buses
- effects
- filters
- compression/limiting
- stem/sample import and routing

## User Integration Path

Recommend this path:

1. Enable the addon.
2. Open the `Chordsmith` main screen.
3. Import JSON, paste JSON/share code, or compile a folder.
4. Save a compiled `.tres` chart.
5. Add `PocketChordsmithConductor` to a level or use `PCSGameMusicBridge` as an autoload.
6. Assign `chart`.
7. Assign a `PCSPlaybackProfile`.
8. Connect beat/bar/marker/accent/event signals.
9. Configure stems or sample drum kit.
10. Use `queue_music_state()` and `trigger_stinger()` for adaptive gameplay.

For release-candidate checks, prefer the addon tools:

```text
res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd
res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd
```

## Audio Advice

For shipped games, recommend:

- `STEM_SYNC` for rendered stems.
- `HYBRID` for stems plus sample hits/stingers.
- sample-based drum kits for no-stems-yet development.
- Godot buses for mix control.
- mobile-safe polyphony caps.

Treat `runtime/PocketChordsmithPlayer.gd` as legacy editor/demo preview only.

## Common Code

Minimal level:

```gdscript
@onready var music: PocketChordsmithConductor = $PocketChordsmithConductor

func _ready() -> void:
	music.chart = preload("res://music/charts/level_01_pcs_chart.tres")
	music.beat.connect(_on_beat)
	music.marker_hit.connect(_on_marker)
	music.event_triggered.connect(_on_music_event)
	music.play()
```

Adaptive state:

```gdscript
music.queue_music_state("combat", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
music.trigger_stinger("victory_hit", "exploration")
```

Diagnostics:

```gdscript
print(music.get_diagnostics())
```

## Avoid

- per-frame JSON parsing
- spawning nodes per note/event
- one conductor per enemy/trap
- hardcoding boss terminology into addon core
- editor-only dependencies in runtime scripts
- assuming stems exist when profile backend is `STEM_SYNC`
