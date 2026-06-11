# Getting Started

This is the shortest path from Pocket Chordsmith song to Godot level.

## 1. Enable The Addon

1. Copy `addons/pocket_chordsmith` into your Godot project.
2. Open Godot.
3. Go to `Project > Project Settings > Plugins`.
4. Enable `Pocket Chordsmith`.
5. Open the `Chordsmith` main screen tab.

## 2. Import A Song

Use one of these:

- `Import JSON`: choose an exported Pocket Chordsmith JSON file.
- `Paste JSON/Code`: paste raw JSON or a `PCS1:` share code.
- `Push to Godot` in the browser app: sends a `PCS1:` code directly to the local addon receiver when Godot is open, with clipboard/paste fallback.
- `Compile Folder`: batch compile every supported JSON file in a folder.

After import, inspect:

- import report
- section list
- song sequence
- event count
- timeline preview
- warnings

Then click `Save Chart Resource` and save a `.tres`, for example:

```text
res://music/charts/level_01_pcs_chart.tres
```

## 3. Add The Conductor To A Level

In your level scene:

1. Add a `PocketChordsmithConductor` node.
2. Assign the saved `PCSChartResource` to `chart`.
3. Optional: assign a `PCSPlaybackProfile` to `playback_profile`.
4. Enable `autoplay`, or call `play()` from your script.

Minimal level script:

```gdscript
extends Node2D

@onready var music: PocketChordsmithConductor = $PocketChordsmithConductor

func _ready() -> void:
	music.beat.connect(_on_beat)
	music.bar_started.connect(_on_bar)
	music.marker_hit.connect(_on_marker)
	music.accent_hit.connect(_on_accent)
	music.event_triggered.connect(_on_music_event)
	music.play()

func _on_beat(bar: int, beat: int) -> void:
	print("Beat ", bar, ".", beat)

func _on_bar(bar: int) -> void:
	print("Bar ", bar)

func _on_marker(name: String) -> void:
	if name == "spawn_wave":
		spawn_wave()

func _on_accent(track_type: String, track_index: int, strength: float) -> void:
	if track_type == "drum":
		pulse_camera(strength)

func _on_music_event(event: Dictionary) -> void:
	if event.get("instrument_id") == "kick":
		flash_kick_light()
```

## 4. Use A Game Bridge When You Have Many Levels

For a real game, put `PocketChordsmithConductor` behind your own music autoload or use:

```text
res://addons/pocket_chordsmith/examples/pcs_game_music_bridge.gd
```

The bridge converts generic conductor signals into common game signals:

- `on_beat`
- `on_bar`
- `on_music_step`
- `trap_cue`
- `auto_flipper_cue`
- `cooldown_suggested`
- `music_marker`
- `music_state_changed`

Example level use:

```gdscript
func _ready() -> void:
	GameMusic.set_chart(preload("res://music/charts/level_01_pcs_chart.tres"))
	GameMusic.on_beat.connect(_on_music_beat)
	GameMusic.trap_cue.connect(_on_trap_cue)
	GameMusic.play()
```

## 5. Choose Playback

Pocket Chordsmith should be the music brain. Godot should play audio.

Recommended shipped-game path:

- `STEM_SYNC`: full music stems through Godot audio streams and buses.
- `HYBRID`: stems plus short sample hits/stingers.

No-stems-yet development path:

- `HYBRID` with `drum_kit`, `accent_streams`, and `marker_stingers` on a `PCSPlaybackProfile`.

Avoid using `PocketChordsmithPlayer.gd` for shipped runtime music. It is kept for editor/demo fallback only.

## 6. Switch Music States

If your chart has `music_states`, gameplay can switch music on musical boundaries:

```gdscript
music.set_music_state("exploration")
music.queue_music_state("combat", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
music.queue_music_state("boss_phase_1", PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION)
music.trigger_stinger("victory_hit", "exploration")
```

## 7. Check Runtime Health

Use diagnostics during development:

```gdscript
print(music.get_diagnostics())
```

Useful fields include current backend, chart, event cursor, emitted/late/deferred events, active samples/stingers, current state, queued state, section, bar, beat, and tick.
