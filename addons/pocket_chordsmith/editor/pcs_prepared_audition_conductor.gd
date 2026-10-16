@tool
extends "res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd"

# Editor-only finite audition. Keep the production queued-transition, prepared
# player, seek/origin and clock paths; the owner supplies the finite endpoint.
# No automatic sequence wrap/end may restart or truncate the selected tail.
func _process_sequence_progression(_previous_tick: int, _next_tick: int) -> void:
	pass

func _handle_end_of_chart() -> void:
	pass


func prepared_playback_progress() -> Dictionary:
	var players: Array = _stem_layer_players.values() if _has_ready_stem_players() else [_stem_player]
	var position := INF
	var assigned := 0
	var playing := 0
	for value in players:
		var player := value as AudioStreamPlayer
		if not is_instance_valid(player) or player.stream == null:
			continue
		assigned += 1
		if player.playing:
			playing += 1
			position = minf(position, player.get_playback_position())
	# Conservatively use reported mixer positions, without extrapolating a
	# gameplay frame ahead of the PCM. This is not a speaker/device timestamp.
	return {"playing": playing > 0, "assigned": assigned,
		"seconds": chart.tick_to_seconds(float(_prepared_stem_origin_tick)) + position if playing > 0 else 0.0}
