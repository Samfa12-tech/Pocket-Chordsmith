extends Node
class_name PCSGameMusicBridge

signal on_beat(bar: int, beat: int)
signal on_bar(bar: int)
signal on_music_step(step: int, tick: int)
signal trap_cue(name: String, event: Dictionary)
signal auto_flipper_cue(name: String, event: Dictionary)
signal cooldown_suggested(name: String, beats: int)
signal music_marker(name: String)
signal music_state_changed(old_state: String, new_state: String)

@export var chart: PCSChartResource
@export var playback_profile: PCSPlaybackProfile

var conductor: PocketChordsmithConductor
var last_event: Dictionary = {}


func _ready() -> void:
	conductor = PocketChordsmithConductor.new()
	conductor.name = "PocketChordsmithConductor"
	conductor.chart = chart
	conductor.playback_profile = playback_profile
	add_child(conductor)

	conductor.beat.connect(_on_conductor_beat)
	conductor.bar_started.connect(func(bar: int) -> void: on_bar.emit(bar))
	conductor.marker_hit.connect(func(name: String) -> void: music_marker.emit(name))
	conductor.event_triggered.connect(_on_conductor_event)
	conductor.music_state_changed.connect(func(old_state: String, new_state: String) -> void:
		music_state_changed.emit(old_state, new_state)
	)


func play() -> void:
	conductor.play()


func stop() -> void:
	conductor.stop()


func set_chart(value: PCSChartResource) -> void:
	chart = value
	if conductor != null:
		conductor.chart = value


func set_music_state(state_name: String, boundary := PocketChordsmithConductor.TransitionBoundary.NEXT_BAR) -> void:
	conductor.set_music_state(state_name, boundary)


func queue_music_state(state_name: String, boundary := PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION) -> void:
	conductor.queue_music_state(state_name, boundary)


func trigger_stinger(name: String, return_to_state := "") -> void:
	conductor.trigger_stinger(name, return_to_state)


func get_beat_accuracy(window_ticks := 90) -> float:
	if conductor == null or conductor.chart == null:
		return 0.0
	var beat_ticks: int = max(1, int(conductor.chart.ticks_per_quarter))
	var offset: int = abs(posmod(int(conductor.current_tick), beat_ticks))
	offset = min(offset, beat_ticks - offset)
	return 1.0 - clamp(float(offset) / float(max(1, window_ticks)), 0.0, 1.0)


func get_diagnostics() -> Dictionary:
	return conductor.get_diagnostics() if conductor != null else {}


func _on_conductor_beat(bar: int, beat: int) -> void:
	on_beat.emit(bar, beat)
	var step: int = ((bar - 1) * max(1, int(conductor.chart.time_signature))) + (beat - 1)
	on_music_step.emit(step, conductor.current_tick)


func _on_conductor_event(event: Dictionary) -> void:
	last_event = event
	var instrument := str(event.get("instrument_id", ""))
	var flags: Dictionary = event.get("flags", {})
	var marker_payload: Dictionary = flags.get("marker", {})
	var cue_type := str(marker_payload.get("cue_type", event.get("track_type", "")))
	match cue_type:
		"trap", "trap_cue":
			trap_cue.emit(instrument, event)
		"auto_flipper", "auto_flipper_cue":
			auto_flipper_cue.emit(instrument, event)
		"cooldown":
			cooldown_suggested.emit(instrument, int(marker_payload.get("beats", 1)))
