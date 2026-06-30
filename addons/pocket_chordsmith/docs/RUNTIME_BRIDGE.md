# Runtime Bridge Pattern

Pocket Chordsmith should usually sit under a game-owned music autoload, not replace it.

Use `PocketChordsmithConductor` as the clock, chart event cursor, adaptive state machine, and Godot-native audio controller. Your game autoload can translate generic conductor signals into game-specific signals:

```gdscript
signal on_beat(bar, beat)
signal trap_cue(name, event)

@onready var conductor: PocketChordsmithConductor = $PocketChordsmithConductor

func _ready() -> void:
	conductor.beat.connect(func(bar, beat): on_beat.emit(bar, beat))
	conductor.event_triggered.connect(_route_music_event)
	conductor.play()

func _route_music_event(event: Dictionary) -> void:
	if event.get("track_type") == "marker" and event.get("instrument_id") == "trap_window":
		trap_cue.emit("trap_window", event)
```

The addon includes `res://addons/pocket_chordsmith/examples/pcs_game_music_bridge.gd` as a starter bridge. It exposes:

- `on_beat`
- `on_bar`
- `on_music_step`
- `trap_cue`
- `auto_flipper_cue`
- `cooldown_suggested`
- beat accuracy via `get_beat_accuracy()`
- conductor diagnostics via `get_diagnostics()`

Keep game policy in your bridge: horde pressure, boss phase choice, trap rules, scoring windows, cooldowns, and pause/menu behavior.

