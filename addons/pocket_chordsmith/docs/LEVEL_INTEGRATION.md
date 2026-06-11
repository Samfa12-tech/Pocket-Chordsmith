# Level Integration Recipe

Use this when adding Pocket Chordsmith to a gameplay level or instanced scene.

## Level-Owned Conductor

Best when each level owns its own music.

Scene:

```text
Level01
  PocketChordsmithConductor
  GameplayNodes...
```

Setup:

```gdscript
@onready var conductor: PocketChordsmithConductor = $PocketChordsmithConductor

func _ready() -> void:
	conductor.chart = preload("res://music/charts/level_01_pcs_chart.tres")
	conductor.playback_profile = preload("res://music/profiles/level_01_profile.tres")
	conductor.prewarm_audio()
	conductor.beat.connect(_on_beat)
	conductor.marker_hit.connect(_on_marker)
	conductor.event_triggered.connect(_on_chart_event)
	conductor.play()
```

Use this for:

- small games
- isolated levels
- demos
- scenes where music should reset when the level reloads

## Autoload Bridge

Best when music continues across scenes or when multiple systems listen to it.

Project Settings autoload:

```text
GameMusic -> res://addons/pocket_chordsmith/examples/pcs_game_music_bridge.gd
```

Level setup:

```gdscript
func _ready() -> void:
	GameMusic.set_chart(preload("res://music/charts/level_02_pcs_chart.tres"))
	GameMusic.on_beat.connect(_on_beat)
	GameMusic.music_marker.connect(_on_marker)
	GameMusic.play()
```

Use this for:

- multi-level games
- shared beat timing
- trap/AI/animation systems listening to the same music clock
- global pause/menu ducking

## Instanced Gameplay Objects

Objects should usually not own conductors. They should subscribe to the level conductor or bridge.

```gdscript
func bind_music(conductor: PocketChordsmithConductor) -> void:
	conductor.accent_hit.connect(_on_music_accent)
	conductor.marker_hit.connect(_on_music_marker)
```

This keeps one chart clock per level and avoids drift.

## Cooking And Prewarming

Pocket Chordsmith has two separate preparation steps:

- Compile/cook the chart in the editor or with the headless build tool. This turns Pocket Chordsmith JSON/share codes into a lightweight `PCSChartResource`; gameplay should load this `.tres`, not parse JSON.
- Prewarm audio streams before playback. `PocketChordsmithConductor.prewarm_audio()` loads the playback profile's drum kit, preview notes, and stingers into the conductor cache so the first beat does not pay the load cost.

`PCSPlaybackProfile.sample_preview_prewarm_on_ready` defaults to `true`, so normal level-owned conductors prewarm automatically when they enter the scene. For loading screens or autoload bridges, calling `prewarm_audio()` explicitly after assigning the chart/profile is still useful. Pass `true` only when you also want to prewarm the current stem map:

```gdscript
var report := conductor.prewarm_audio()
print(report)
```

## Common Gameplay Calls

```gdscript
conductor.queue_music_state("tension")
conductor.queue_music_state("combat", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
conductor.duck_for_dialogue()
conductor.restore_after_dialogue()
conductor.muffle_for_pause()
conductor.restore_menu_muffle()
conductor.set_layer_volume("drums", -4.0)
conductor.trigger_stinger("reward_hit")
```

## Shipping Rules

- Do not parse Pocket Chordsmith JSON in gameplay.
- Do not add a conductor to every enemy or trap.
- Use one conductor per active music timeline.
- Use compiled `.tres` chart resources.
- Use Godot stems, samples, buses, and effects for audio playback.
- Keep procedural preview out of shipped runtime unless heavily constrained.
