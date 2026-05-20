@tool
extends Node
class_name PocketChordsmithConductor

signal beat(bar: int, beat: int)
signal bar_started(bar_index: int)
signal section_started(section_id: String)
signal section_ended(section_id: String)
signal marker_hit(marker_name: String)
signal accent_hit(track_type: String, track_index: int, strength: float)
signal event_triggered(event: Dictionary)
signal loop_completed(loop_name: String)
signal intensity_changed(tag: String)
signal track_mute_changed(track_type: String, track_index: int, muted: bool)
signal stem_volume_changed(stem_name: String, volume_db: float)
signal layer_volume_changed(layer_name: String, volume_db: float)
signal layer_mute_changed(layer_name: String, muted: bool)
signal music_state_changed(old_state: String, new_state: String)
signal music_state_queued(state_name: String, boundary: int)
signal transition_started(from_state: String, to_state: String)
signal transition_completed(new_state: String)
signal stinger_started(name: String)
signal stinger_finished(name: String)

enum TransitionBoundary {
	IMMEDIATE,
	NEXT_BEAT,
	NEXT_BAR,
	NEXT_SECTION,
	NEXT_LOOP,
	NEXT_MARKER,
}

@export var chart: PCSChartResource
@export var playback_profile: PCSPlaybackProfile
@export var autoplay := false
@export var loop_enabled := false
@export var native_audio_router_path: NodePath
@export var current_music_state := ""
@export var queued_music_state := ""
@export var previous_music_state := ""
@export var current_sequence: Array[String] = []
@export var current_loop := ""
@export var transition_boundary: TransitionBoundary = TransitionBoundary.NEXT_BAR
@export var transition_marker_name := "safe_transition"

@export var current_section := ""
@export var current_tick := 0
@export var current_bar := 1
@export var current_beat := 1
@export var current_arrangement_index := 0

var _playing := false
var _paused := false
var _tick_float := 0.0
var _event_cursor := 0
var _last_beat_index := -1
var _last_bar_index := -1
var _last_section_id := ""
var _queued_section := ""
var _active_intensity := ""
var _track_mutes := {}
var _stem_volumes := {}
var _layer_volumes := {}
var _layer_mutes := {}
var _base_bus_volumes := {}
var _queued_transition := {}
var _current_sequence_index := 0
var _sequence_should_loop := true
var _pending_stinger := {}
var _stem_player: AudioStreamPlayer
var _stinger_player: AudioStreamPlayer
var _stinger_playback: AudioStreamPlaybackPolyphonic
var _polyphonic_players := {}
var _polyphonic_playbacks := {}
var _active_stinger_ids := {}
var _stinger_return_states := {}
var _active_sample_ids := {}
var _events_emitted_this_frame := 0
var _events_late_this_frame := 0
var _events_deferred_this_frame := 0
var _events_emitted_total := 0
var _events_late_total := 0
var _events_deferred_total := 0
var _process_previous_tick := 0
var _clock_anchor_tick := 0
var _clock_anchor_usec := 0
var _last_playback_warning_signature := ""
var _sample_play_requests_total := 0
var _sample_play_failures_total := 0
var _stinger_play_requests_total := 0
var _stinger_play_failures_total := 0
var _audio_stream_cache := {}
var _last_stinger_stream_key := ""


func _ready() -> void:
	if playback_profile == null:
		playback_profile = PCSPlaybackProfile.new()
	_setup_native_audio_players()
	_apply_safe_default_buses()
	set_process(true)
	if autoplay and chart != null:
		play()


func _exit_tree() -> void:
	_stop_polyphonic_streams()
	_active_stinger_ids.clear()
	_stinger_return_states.clear()
	_active_sample_ids.clear()
	_audio_stream_cache.clear()
	_last_stinger_stream_key = ""
	_stinger_playback = null
	if is_instance_valid(_stem_player):
		_stem_player.stop()
		_stem_player.stream = null
		if _stem_player.get_parent() == self:
			remove_child(_stem_player)
		_stem_player.free()
		_stem_player = null
	if is_instance_valid(_stinger_player):
		_stinger_player.stop()
		_stinger_player.stream = null
		_stinger_player = null
	for player in _polyphonic_players.values():
		if is_instance_valid(player):
			(player as AudioStreamPlayer).stop()
			(player as AudioStreamPlayer).stream = null
			if (player as AudioStreamPlayer).get_parent() == self:
				remove_child(player)
			(player as AudioStreamPlayer).free()
	_polyphonic_players.clear()
	_polyphonic_playbacks.clear()


func _stop_polyphonic_streams() -> void:
	for stream_key in _active_stinger_ids.keys():
		var info: Dictionary = _active_stinger_ids[stream_key]
		var playback := _polyphonic_playbacks.get(str(info.get("bus", "")), null) as AudioStreamPlaybackPolyphonic
		if playback != null:
			playback.stop_stream(int(info.get("id", -1)))
	for stream_key in _active_sample_ids.keys():
		var info: Dictionary = _active_sample_ids[stream_key]
		var playback := _polyphonic_playbacks.get(str(info.get("bus", "")), null) as AudioStreamPlaybackPolyphonic
		if playback != null:
			playback.stop_stream(int(info.get("id", -1)))


func play() -> void:
	if chart == null:
		return
	_warn_playback_profile_once()
	_playing = true
	_paused = false
	_reset_wall_clock_anchor()
	_initialize_music_state()
	_prepare_stem_sync_for_current_state()
	if current_sequence.is_empty():
		seek_tick(0)
	else:
		_seek_to_sequence_index(0)
	_emit_current_section_started()


func stop() -> void:
	if _playing and not _last_section_id.is_empty():
		section_ended.emit(_last_section_id)
	_playing = false
	_paused = false
	current_tick = 0
	_tick_float = 0.0
	_event_cursor = 0
	_last_beat_index = -1
	_last_bar_index = -1
	_last_section_id = ""
	current_section = ""
	current_bar = 1
	current_beat = 1
	current_arrangement_index = 0
	_stop_native_stems()


func pause() -> void:
	_paused = true


func resume() -> void:
	if chart != null:
		_playing = true
		_paused = false
		_reset_wall_clock_anchor()


func seek_tick(tick: int) -> void:
	if chart == null:
		return
	current_tick = clamp(tick, 0, max(0, chart.get_length_ticks()))
	_tick_float = float(current_tick)
	_reset_wall_clock_anchor()
	_event_cursor = _find_event_cursor(current_tick)
	_last_beat_index = int(floor(float(current_tick) / float(chart.ticks_per_quarter))) - 1
	_last_bar_index = int(floor(float(current_tick) / float(max(1, chart.time_signature * chart.ticks_per_quarter)))) - 1
	_update_position_fields()
	_last_section_id = current_section


func jump_to_section(section_id: String) -> void:
	if chart == null:
		return
	var target_tick := chart.first_section_start_tick(section_id)
	if target_tick < 0:
		push_warning("PocketChordsmithConductor could not find section '%s' in the arrangement." % section_id)
		return
	seek_tick(target_tick)
	_emit_current_section_started()
	_sync_sequence_index_to_section(section_id)
	_start_native_stems_from_current_tick()


func queue_section(section_id: String, boundary := TransitionBoundary.NEXT_BAR) -> void:
	_queued_section = section_id
	_queue_transition({
		"type": "section",
		"section_id": section_id,
		"boundary": boundary,
		"loop": true,
	})


func queue_transition(section_id: String) -> void:
	queue_section(section_id)


func set_intensity(tag: String) -> void:
	_active_intensity = tag
	intensity_changed.emit(tag)
	if chart == null:
		return
	var sections = chart.intensity_tags.get(tag, [])
	if sections is Array and not sections.is_empty():
		queue_sequence(_string_array(sections), TransitionBoundary.NEXT_BAR)


func set_track_muted(track_type: String, track_index: int, muted: bool) -> void:
	_track_mutes["%s:%d" % [track_type, track_index]] = muted
	track_mute_changed.emit(track_type, track_index, muted)


func set_stem_volume(stem_name: String, volume_db: float) -> void:
	_stem_volumes[stem_name] = volume_db
	stem_volume_changed.emit(stem_name, volume_db)
	if playback_profile == null:
		return
	var bus_name := str(playback_profile.stem_bus_names.get(stem_name, stem_name))
	var bus_index := AudioServer.get_bus_index(bus_name)
	if bus_index >= 0:
		AudioServer.set_bus_volume_db(bus_index, volume_db)


func set_layer_volume(layer_name: String, db: float) -> void:
	_layer_volumes[layer_name] = db
	layer_volume_changed.emit(layer_name, db)
	var bus_name := _bus_for_layer(layer_name)
	_set_bus_volume_smooth(bus_name, db, 0.0)
	_set_sync_stream_volume(layer_name, db)


func mute_layer(layer_name: String, muted: bool) -> void:
	_layer_mutes[layer_name] = muted
	layer_mute_changed.emit(layer_name, muted)
	var bus_index := AudioServer.get_bus_index(_bus_for_layer(layer_name))
	if bus_index >= 0:
		AudioServer.set_bus_mute(bus_index, muted)


func duck_music(enabled: bool, amount := 0.5, transition_time := 0.25) -> void:
	var bus_name := _safe_bus_name(playback_profile.master_music_bus if playback_profile != null else "Music_Master")
	var bus_index := AudioServer.get_bus_index(bus_name)
	if bus_index < 0:
		return
	if not _base_bus_volumes.has(bus_name):
		_base_bus_volumes[bus_name] = AudioServer.get_bus_volume_db(bus_index)
	var base_db := float(_base_bus_volumes[bus_name])
	var target_db: float = base_db - clamp(amount, 0.0, 1.0) * 18.0 if enabled else base_db
	_set_bus_volume_smooth(bus_name, target_db, transition_time)


func lowpass_music(amount: float, transition_time := 0.25) -> void:
	var bus_name := _safe_bus_name(playback_profile.master_music_bus if playback_profile != null else "Music_Master")
	var cutoff := lerp(20000.0, 650.0, clamp(amount, 0.0, 1.0))
	_set_bus_effect_property_smooth(bus_name, "lowpass", "cutoff_hz", cutoff, transition_time)


func highpass_music(amount: float, transition_time := 0.25) -> void:
	var bus_name := _safe_bus_name(playback_profile.master_music_bus if playback_profile != null else "Music_Master")
	var cutoff := lerp(20.0, 1200.0, clamp(amount, 0.0, 1.0))
	_set_bus_effect_property_smooth(bus_name, "highpass", "cutoff_hz", cutoff, transition_time)


func set_bus_effect_amount(bus_name: String, effect_name: String, amount: float) -> void:
	var property_name := _default_property_for_effect(effect_name)
	if property_name.is_empty():
		return
	var value: Variant = _amount_to_effect_value(effect_name, amount)
	_set_bus_effect_property_smooth(_safe_bus_name(bus_name), effect_name, property_name, value, 0.0)


func trigger_stinger(name: String, return_to_state := "") -> void:
	stinger_started.emit(name)
	_pending_stinger = {"name": name, "return_to_state": return_to_state}
	var stream_id := _play_stinger_stream(name)
	if stream_id < 0:
		stinger_finished.emit(name)
		if not return_to_state.is_empty():
			queue_music_state(return_to_state, TransitionBoundary.NEXT_BAR)
		return
	if not return_to_state.is_empty():
		_stinger_return_states[_last_stinger_stream_key] = return_to_state


func duck_for_dialogue(amount := 0.55, transition_time := 0.2) -> void:
	duck_music(true, amount, transition_time)


func restore_after_dialogue(transition_time := 0.35) -> void:
	duck_music(false, 0.0, transition_time)


func muffle_for_pause(amount := 0.75, transition_time := 0.2) -> void:
	lowpass_music(amount, transition_time)
	duck_music(true, 0.18, transition_time)


func restore_menu_muffle(transition_time := 0.35) -> void:
	lowpass_music(0.0, transition_time)
	duck_music(false, 0.0, transition_time)


func set_music_state(state_name: String, boundary := TransitionBoundary.NEXT_BAR) -> void:
	_queue_music_state_internal(state_name, boundary, true)


func queue_music_state(state_name: String, boundary := TransitionBoundary.NEXT_SECTION) -> void:
	_queue_music_state_internal(state_name, boundary, false)


func queue_sequence(section_ids: Array[String], boundary := TransitionBoundary.NEXT_SECTION) -> void:
	_queue_transition({
		"type": "sequence",
		"sequence": section_ids,
		"boundary": boundary,
		"loop": true,
	})


func return_to_previous_state(boundary := TransitionBoundary.NEXT_BAR) -> void:
	if not previous_music_state.is_empty():
		queue_music_state(previous_music_state, boundary)


func set_default_state(state_name: String) -> void:
	if chart != null:
		chart.default_music_state = state_name
	if current_music_state.is_empty():
		set_music_state(state_name, TransitionBoundary.IMMEDIATE)


func cancel_queued_transition() -> void:
	_queued_transition.clear()
	_queued_section = ""
	queued_music_state = ""


func get_current_music_state() -> String:
	return current_music_state


func get_queued_music_state() -> String:
	return queued_music_state


func is_playing() -> bool:
	return _playing and not _paused


func get_active_intensity() -> String:
	return _active_intensity


func get_diagnostics() -> Dictionary:
	var backend := "none"
	var stem_status := "inactive"
	if playback_profile != null:
		backend = PCSPlaybackProfile.PlaybackBackend.keys()[playback_profile.playback_backend]
	if is_instance_valid(_stem_player) and _stem_player.stream != null:
		stem_status = "playing" if _stem_player.playing else "ready"
	return {
		"backend": backend,
		"chart": chart.resource_path if chart != null else "",
		"event_cursor": _event_cursor,
		"event_count": chart.compiled_events.size() if chart != null else 0,
		"events_emitted_this_frame": _events_emitted_this_frame,
		"events_late_this_frame": _events_late_this_frame,
		"events_deferred_this_frame": _events_deferred_this_frame,
		"events_emitted_total": _events_emitted_total,
		"events_late_total": _events_late_total,
		"events_deferred_total": _events_deferred_total,
		"active_stingers": _active_stinger_ids.size(),
		"active_samples": _active_sample_ids.size(),
		"active_polyphony": _active_stinger_ids.size() + _active_sample_ids.size(),
		"max_polyphony": playback_profile.max_polyphony if playback_profile != null else 0,
		"sample_play_requests_total": _sample_play_requests_total,
		"sample_play_failures_total": _sample_play_failures_total,
		"stinger_play_requests_total": _stinger_play_requests_total,
		"stinger_play_failures_total": _stinger_play_failures_total,
		"stem_sync_status": stem_status,
		"current_state": current_music_state,
		"queued_state": queued_music_state,
		"current_section": current_section,
		"current_bar": current_bar,
		"current_beat": current_beat,
		"current_tick": current_tick,
		"playback_warnings": get_playback_warnings(),
	}


func get_playback_warnings() -> Array[String]:
	return _validate_playback_profile()


func _process(delta: float) -> void:
	if not _playing or _paused or chart == null:
		return
	if chart.compiled_events.is_empty() and chart.get_length_ticks() <= 0:
		return

	var previous_tick := current_tick
	if _use_wall_clock_timing():
		var elapsed_seconds := float(Time.get_ticks_usec() - _clock_anchor_usec) / 1000000.0
		_tick_float = float(_clock_anchor_tick) + elapsed_seconds * _ticks_per_second()
	else:
		_tick_float += delta * _ticks_per_second()
	current_tick = int(floor(_tick_float))
	_process_previous_tick = previous_tick

	var transitioned := _process_queued_transition(previous_tick, current_tick)
	if not transitioned:
		_process_sequence_progression(previous_tick, current_tick)
	_handle_end_of_chart()
	_update_stinger_finishes()
	_update_position_fields()
	_emit_timing_signals()
	_emit_section_changes()
	_emit_due_events()


func _process_queued_transition(previous_tick: int, next_tick: int) -> bool:
	if _queued_transition.is_empty() or chart == null:
		return false
	var boundary := int(_queued_transition.get("boundary", TransitionBoundary.NEXT_BAR))
	if boundary == TransitionBoundary.NEXT_MARKER:
		return false
	if not _boundary_reached(previous_tick, next_tick, boundary):
		return false
	_apply_queued_transition()
	return true


func _handle_end_of_chart() -> void:
	var length_ticks := chart.get_length_ticks()
	if length_ticks <= 0 or current_tick < length_ticks:
		return
	if loop_enabled:
		loop_completed.emit("arrangement")
		seek_tick(posmod(current_tick, length_ticks))
		_emit_current_section_started()
	else:
		stop()


func _update_position_fields() -> void:
	if chart == null:
		return
	var beat_ticks := max(1, chart.ticks_per_quarter)
	var bar_ticks := max(1, chart.time_signature * chart.ticks_per_quarter)
	var beat_index := int(floor(float(current_tick) / float(beat_ticks)))
	var bar_index := int(floor(float(current_tick) / float(bar_ticks)))
	current_bar = bar_index + 1
	current_beat = posmod(beat_index, max(1, chart.time_signature)) + 1
	var section_info := chart.find_section_at_tick(current_tick)
	current_section = str(section_info.get("id", ""))
	current_arrangement_index = int(section_info.get("arrangement_index", 0))


func _emit_timing_signals() -> void:
	var beat_ticks := max(1, chart.ticks_per_quarter)
	var bar_ticks := max(1, chart.time_signature * chart.ticks_per_quarter)
	var beat_index := int(floor(float(current_tick) / float(beat_ticks)))
	var bar_index := int(floor(float(current_tick) / float(bar_ticks)))
	if beat_index > _last_beat_index:
		for index in range(_last_beat_index + 1, beat_index + 1):
			var bar_number := int(floor(float(index * beat_ticks) / float(bar_ticks))) + 1
			var beat_number := posmod(index, max(1, chart.time_signature)) + 1
			beat.emit(bar_number, beat_number)
		_last_beat_index = beat_index
	if bar_index > _last_bar_index:
		for index in range(_last_bar_index + 1, bar_index + 1):
			bar_started.emit(index + 1)
		_last_bar_index = bar_index


func _emit_section_changes() -> void:
	if current_section == _last_section_id:
		return
	if not _last_section_id.is_empty():
		section_ended.emit(_last_section_id)
	if not current_section.is_empty():
		section_started.emit(current_section)
	_last_section_id = current_section


func _emit_current_section_started() -> void:
	_update_position_fields()
	if not current_section.is_empty():
		section_started.emit(current_section)
	_last_section_id = current_section


func _emit_due_events() -> void:
	_events_emitted_this_frame = 0
	_events_late_this_frame = 0
	_events_deferred_this_frame = 0
	var max_events := 128
	if playback_profile != null:
		max_events = max(1, playback_profile.max_events_per_frame)
	var emitted := 0
	while _event_cursor < chart.compiled_events.size() and emitted < max_events:
		var event: Dictionary = chart.compiled_events[_event_cursor]
		var event_tick := int(event.get("tick", 0))
		if event_tick > current_tick:
			break
		_event_cursor += 1
		emitted += 1
		_events_emitted_this_frame += 1
		_events_emitted_total += 1
		if event_tick < _process_previous_tick:
			_events_late_this_frame += 1
			_events_late_total += 1
		if _event_is_suppressed(event):
			continue
		event_triggered.emit(event)
		var flags: Dictionary = event.get("flags", {})
		if str(event.get("track_type", "")) == "marker":
			marker_hit.emit(str(event.get("instrument_id", "")))
			_process_marker_transition(str(event.get("instrument_id", "")))
		if bool(flags.get("accent", false)):
			accent_hit.emit(
				str(event.get("track_type", "")),
				int(event.get("track_index", 0)),
				clamp(float(event.get("velocity", 0)) / 127.0, 0.0, 1.0)
			)
		_route_native_audio_event(event)
		_route_sample_preview_event(event)
	if emitted >= max_events and _event_cursor < chart.compiled_events.size():
		var index := _event_cursor
		while index < chart.compiled_events.size() and int(chart.compiled_events[index].get("tick", 0)) <= current_tick:
			_events_deferred_this_frame += 1
			index += 1
		_events_deferred_total += _events_deferred_this_frame
		push_warning("PocketChordsmithConductor reached max_events_per_frame; consider increasing the playback profile limit.")


func _initialize_music_state() -> void:
	if chart == null:
		return
	if playback_profile == null:
		playback_profile = PCSPlaybackProfile.new()
	if not current_music_state.is_empty():
		_apply_state_definition(current_music_state, false)
		return
	if not chart.default_music_state.is_empty():
		current_music_state = chart.default_music_state
		_apply_state_definition(current_music_state, false)
	elif not chart.arrangement.is_empty():
		current_sequence = chart.arrangement.duplicate()
		current_loop = "arrangement"
	else:
		current_sequence = ["A"]
		current_loop = "A"
	_current_sequence_index = 0


func _queue_music_state_internal(state_name: String, boundary: int, apply_now: bool) -> void:
	if state_name.is_empty():
		return
	if apply_now and boundary == TransitionBoundary.IMMEDIATE:
		_apply_music_state(state_name)
		return
	_queue_transition({
		"type": "state",
		"state": state_name,
		"boundary": boundary,
	})


func _queue_transition(transition: Dictionary) -> void:
	var boundary := int(transition.get("boundary", TransitionBoundary.NEXT_BAR))
	if boundary == TransitionBoundary.IMMEDIATE:
		_queued_transition = transition
		_apply_queued_transition()
		return
	_queued_transition = transition
	transition_boundary = boundary
	if str(transition.get("type", "")) == "state":
		queued_music_state = str(transition.get("state", ""))
		music_state_queued.emit(queued_music_state, boundary)
	else:
		queued_music_state = ""


func _apply_queued_transition() -> void:
	if _queued_transition.is_empty():
		return
	var transition := _queued_transition.duplicate(true)
	_queued_transition.clear()
	_queued_section = ""
	queued_music_state = ""
	var transition_type := str(transition.get("type", ""))
	match transition_type:
		"state":
			_apply_music_state(str(transition.get("state", "")))
		"section":
			var section_id := str(transition.get("section_id", ""))
			if not section_id.is_empty():
				current_sequence = [section_id]
				current_loop = section_id
				_sequence_should_loop = bool(transition.get("loop", true))
				_current_sequence_index = 0
				_seek_to_sequence_index(0)
		"sequence":
			var sequence := _string_array(transition.get("sequence", []))
			if not sequence.is_empty():
				current_sequence = sequence
				current_loop = "-".join(current_sequence)
				_sequence_should_loop = bool(transition.get("loop", true))
				_current_sequence_index = 0
				_seek_to_sequence_index(0)


func _apply_music_state(state_name: String) -> void:
	if chart == null or state_name.is_empty():
		return
	var old_state := current_music_state
	transition_started.emit(old_state, state_name)
	if old_state != state_name:
		previous_music_state = old_state
	current_music_state = state_name
	_apply_state_definition(state_name, true)
	_prepare_stem_sync_for_current_state()
	_start_native_stems_from_current_tick()
	music_state_changed.emit(old_state, state_name)
	transition_completed.emit(state_name)


func _apply_state_definition(state_name: String, seek_to_entry: bool) -> void:
	var state_def := _state_definition(state_name)
	var stinger := str(state_def.get("stinger", ""))
	if not stinger.is_empty():
		trigger_stinger(stinger, str(state_def.get("then_return_to", "")))
	var entry := str(state_def.get("entry", ""))
	var loop_sections := _string_array(state_def.get("loop_sections", []))
	var sequence := _string_array(state_def.get("sequence", []))
	var one_section := str(state_def.get("section", ""))
	if loop_sections.is_empty() and not sequence.is_empty():
		loop_sections = sequence
	if loop_sections.is_empty() and not one_section.is_empty():
		loop_sections = [one_section]
	if loop_sections.is_empty() and not entry.is_empty():
		loop_sections = [entry]
	if loop_sections.is_empty():
		loop_sections = chart.arrangement.duplicate() if not chart.arrangement.is_empty() else ["A"]
	current_sequence = loop_sections
	current_loop = str(state_def.get("loop", state_name))
	_sequence_should_loop = bool(state_def.get("loop", true))
	var target_section := entry if not entry.is_empty() else str(current_sequence[0])
	_current_sequence_index = max(0, current_sequence.find(target_section))
	if seek_to_entry:
		_seek_to_sequence_index(_current_sequence_index)


func _state_definition(state_name: String) -> Dictionary:
	if chart == null:
		return {}
	var states: Dictionary = chart.music_states
	if states.has(state_name) and states[state_name] is Dictionary:
		return states[state_name]
	var sections = chart.intensity_tags.get(state_name, [])
	if sections is Array and not sections.is_empty():
		return {"loop_sections": _string_array(sections)}
	return {}


func _process_sequence_progression(previous_tick: int, next_tick: int) -> void:
	if current_sequence.is_empty() or chart == null:
		return
	var section_info := chart.find_section_at_tick(previous_tick)
	if section_info.is_empty():
		return
	var end_tick := int(section_info.get("start_tick", 0)) + int(section_info.get("length_ticks", 0))
	if previous_tick < end_tick and next_tick >= end_tick:
		var next_index := _current_sequence_index + 1
		if next_index >= current_sequence.size():
			if not _sequence_should_loop:
				return
			next_index = 0
			loop_completed.emit(current_loop)
		_seek_to_sequence_index(next_index)


func _boundary_reached(previous_tick: int, next_tick: int, boundary: int) -> bool:
	match boundary:
		TransitionBoundary.IMMEDIATE:
			return true
		TransitionBoundary.NEXT_BEAT:
			var beat_ticks := max(1, chart.ticks_per_quarter)
			return int(floor(float(previous_tick) / float(beat_ticks))) != int(floor(float(next_tick) / float(beat_ticks)))
		TransitionBoundary.NEXT_BAR:
			var bar_ticks := max(1, chart.time_signature * chart.ticks_per_quarter)
			return int(floor(float(previous_tick) / float(bar_ticks))) != int(floor(float(next_tick) / float(bar_ticks)))
		TransitionBoundary.NEXT_SECTION:
			var section_info := chart.find_section_at_tick(previous_tick)
			if section_info.is_empty():
				return false
			var end_tick := int(section_info.get("start_tick", 0)) + int(section_info.get("length_ticks", 0))
			return previous_tick < end_tick and next_tick >= end_tick
		TransitionBoundary.NEXT_LOOP:
			if current_sequence.is_empty():
				return _boundary_reached(previous_tick, next_tick, TransitionBoundary.NEXT_SECTION)
			var section_info := chart.find_section_at_tick(previous_tick)
			if section_info.is_empty():
				return false
			var end_tick := int(section_info.get("start_tick", 0)) + int(section_info.get("length_ticks", 0))
			return _current_sequence_index >= current_sequence.size() - 1 and previous_tick < end_tick and next_tick >= end_tick
		_:
			return false


func _process_marker_transition(marker_name: String) -> void:
	if _queued_transition.is_empty():
		return
	if int(_queued_transition.get("boundary", TransitionBoundary.NEXT_BAR)) != TransitionBoundary.NEXT_MARKER:
		return
	var wanted_marker := str(_queued_transition.get("marker", transition_marker_name))
	if wanted_marker.is_empty() or marker_name == wanted_marker:
		_apply_queued_transition()


func _seek_to_sequence_index(index: int) -> void:
	if current_sequence.is_empty():
		return
	_current_sequence_index = posmod(index, current_sequence.size())
	var section_id := str(current_sequence[_current_sequence_index])
	var target_tick := chart.first_section_start_tick(section_id) if chart != null else -1
	if target_tick < 0:
		push_warning("PocketChordsmithConductor could not find section '%s' for sequence playback." % section_id)
		return
	seek_tick(target_tick)
	_emit_current_section_started()
	_start_native_stems_from_current_tick()


func _sync_sequence_index_to_section(section_id: String) -> void:
	var index := current_sequence.find(section_id)
	if index >= 0:
		_current_sequence_index = index


func _string_array(value) -> Array[String]:
	var out: Array[String] = []
	if not (value is Array):
		return out
	for item in value:
		out.append(str(item))
	return out


func _event_is_suppressed(event: Dictionary) -> bool:
	var flags: Dictionary = event.get("flags", {})
	if playback_profile != null:
		if bool(flags.get("muted", false)) and not playback_profile.emit_muted_events:
			return true
		if bool(flags.get("generated", false)) and not playback_profile.emit_generated_events:
			return true
	else:
		if bool(flags.get("muted", false)):
			return true
	var mute_key := "%s:%d" % [str(event.get("track_type", "")), int(event.get("track_index", 0))]
	return bool(_track_mutes.get(mute_key, false))


func _route_native_audio_event(event: Dictionary) -> void:
	if native_audio_router_path.is_empty():
		return
	var router := get_node_or_null(native_audio_router_path)
	if router == null or not router.has_method("handle_pcs_event"):
		return
	router.call("handle_pcs_event", event, self)


func _route_sample_preview_event(event: Dictionary) -> void:
	if playback_profile == null or not playback_profile.sample_preview_enabled:
		return
	if not playback_profile.is_event_mode_enabled():
		return
	var track_type := str(event.get("track_type", ""))
	var instrument_id := str(event.get("instrument_id", ""))
	if _sample_audio_is_too_late(event):
		return
	if track_type == "marker":
		var stinger_name := str(playback_profile.marker_stingers.get(instrument_id, ""))
		if not stinger_name.is_empty():
			trigger_stinger(stinger_name)
		return
	if track_type == "chord":
		if not playback_profile.sample_preview_tonal_enabled:
			return
		_route_sample_preview_chord(event)
		return
	if (track_type == "bass" or track_type == "melody") and not playback_profile.sample_preview_tonal_enabled:
		return
	if not ["drum", "accent", "bass", "melody"].has(track_type):
		return
	var sample_key := _sample_key_for_event(event)
	var stream := _sample_stream_for_key(sample_key)
	if stream == null:
		return
	var velocity := clamp(float(event.get("velocity", 100)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-18.0, 0.0, velocity) if playback_profile.sample_preview_velocity_scale else 0.0
	var layer := _sample_preview_layer_for_event(event)
	volume_db += _sample_preview_gain_db(layer, sample_key)
	var pitch_scale := _sample_pitch_scale_for_event(event)
	_play_polyphonic_sample(stream, _bus_for_layer(layer), sample_key, volume_db, pitch_scale)


func _route_sample_preview_chord(event: Dictionary) -> void:
	if playback_profile == null:
		return
	var sample_key := _sample_key_for_event(event)
	var stream := _sample_stream_for_key(sample_key)
	if stream == null:
		return
	var flags: Dictionary = event.get("flags", {})
	var notes: Array = flags.get("midi_notes", [int(event.get("midi_note", 60))])
	if playback_profile.sample_preview_max_chord_notes > 0 and notes.size() > playback_profile.sample_preview_max_chord_notes:
		notes = notes.slice(0, playback_profile.sample_preview_max_chord_notes)
	var velocity := clamp(float(event.get("velocity", 76)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-28.0, -18.0, velocity) if playback_profile.sample_preview_velocity_scale else -22.0
	volume_db += _sample_preview_gain_db("chords", sample_key)
	for note in notes:
		var midi_note := int(note)
		var pitch_scale := pow(2.0, float(midi_note - 60) / 12.0)
		_play_polyphonic_sample(stream, _bus_for_layer("chords"), "chord:%d" % midi_note, volume_db, pitch_scale)


func _warn_playback_profile_once() -> void:
	var warnings := _validate_playback_profile()
	var signature := JSON.stringify(warnings)
	if signature == _last_playback_warning_signature:
		return
	_last_playback_warning_signature = signature
	for warning in warnings:
		push_warning(warning)


func _validate_playback_profile() -> Array[String]:
	var warnings: Array[String] = []
	if playback_profile == null:
		warnings.append("PocketChordsmithConductor has no playback profile; timing signals will work, but native audio routing will use defaults.")
		return warnings
	if playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.STEM_SYNC:
		var has_profile_stems := not playback_profile.stem_paths.is_empty() or not playback_profile.stem_sets.is_empty()
		var has_chart_stems := chart != null and not chart.stem_sets.is_empty()
		if not has_profile_stems and not has_chart_stems:
			warnings.append("Pocket Chordsmith playback profile is STEM_SYNC, but no stems are assigned.")
	if playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.HYBRID:
		if playback_profile.stem_paths.is_empty() and playback_profile.stem_sets.is_empty() and playback_profile.drum_kit.is_empty() and playback_profile.accent_streams.is_empty() and playback_profile.event_sample_streams.is_empty():
			warnings.append("Pocket Chordsmith playback profile is HYBRID, but no stems, drum kit, accent samples, or event samples are assigned.")
		warnings.append_array(_missing_drum_sample_warnings())
	return warnings


func _missing_drum_sample_warnings() -> Array[String]:
	var warnings: Array[String] = []
	if chart == null or chart.compiled_events.is_empty():
		return warnings
	var required := {}
	for event in chart.compiled_events:
		if str(event.get("track_type", "")) != "drum":
			continue
		var instrument_id := str(event.get("instrument_id", ""))
		if instrument_id.is_empty():
			continue
		var flags: Dictionary = event.get("flags", {})
		var accent_key := "%s_accent" % instrument_id
		if bool(flags.get("accent", false)) and playback_profile.drum_kit.has(accent_key):
			required[accent_key] = true
		else:
			required[instrument_id] = true
	for key in required.keys():
		if not playback_profile.drum_kit.has(str(key)) or str(playback_profile.drum_kit.get(str(key), "")).is_empty():
			warnings.append("Pocket Chordsmith drum event '%s' has no sample assigned in playback_profile.drum_kit." % str(key))
	return warnings


func _setup_native_audio_players() -> void:
	if not is_inside_tree():
		return
	if _stem_player == null:
		_stem_player = AudioStreamPlayer.new()
		_stem_player.name = "ChordsmithStemSyncPlayer"
		_stem_player.bus = _safe_bus_name(playback_profile.master_music_bus if playback_profile != null else "Music_Master")
		add_child(_stem_player)


func _setup_stinger_player() -> void:
	if not is_inside_tree():
		return
	var stinger_bus := _safe_bus_name(playback_profile.stingers_bus if playback_profile != null else "Music_Stingers")
	_stinger_playback = _get_polyphonic_playback(stinger_bus)
	_stinger_player = _polyphonic_players.get(stinger_bus, null)


func _apply_safe_default_buses() -> void:
	if playback_profile == null:
		return
	if is_instance_valid(_stem_player):
		_stem_player.bus = _safe_bus_name(playback_profile.master_music_bus)
	if is_instance_valid(_stinger_player):
		_stinger_player.bus = _safe_bus_name(playback_profile.stingers_bus)


func _get_polyphonic_playback(bus_name: String) -> AudioStreamPlaybackPolyphonic:
	if not is_inside_tree():
		return null
	var safe_bus := _safe_bus_name(bus_name)
	if _polyphonic_playbacks.has(safe_bus):
		var existing := _polyphonic_playbacks[safe_bus] as AudioStreamPlaybackPolyphonic
		if existing != null:
			return existing
	var player := AudioStreamPlayer.new()
	player.name = "ChordsmithPolyphonic_%s" % safe_bus.replace(" ", "_")
	player.bus = safe_bus
	var polyphonic := AudioStreamPolyphonic.new()
	polyphonic.set_polyphony(playback_profile.max_polyphony if playback_profile != null else 32)
	player.stream = polyphonic
	add_child(player)
	player.play()
	var playback := player.get_stream_playback() as AudioStreamPlaybackPolyphonic
	_polyphonic_players[safe_bus] = player
	_polyphonic_playbacks[safe_bus] = playback
	return playback


func _safe_bus_name(preferred: String, fallback := "Master") -> String:
	return preferred if AudioServer.get_bus_index(preferred) >= 0 else fallback


func _bus_for_layer(layer_name: String) -> String:
	if playback_profile == null:
		return "Master"
	return _safe_bus_name(playback_profile.get_bus_for_layer(layer_name))


func _set_bus_volume_smooth(bus_name: String, volume_db: float, transition_time: float) -> void:
	var safe_bus := _safe_bus_name(bus_name)
	var bus_index := AudioServer.get_bus_index(safe_bus)
	if bus_index < 0:
		return
	if transition_time <= 0.0 or not is_inside_tree():
		AudioServer.set_bus_volume_db(bus_index, volume_db)
		return
	var start_db := AudioServer.get_bus_volume_db(bus_index)
	var tween := create_tween()
	tween.tween_method(func(value: float) -> void:
		var index := AudioServer.get_bus_index(safe_bus)
		if index >= 0:
			AudioServer.set_bus_volume_db(index, value)
	, start_db, volume_db, transition_time)


func _find_or_create_effect(bus_name: String, effect_name: String) -> AudioEffect:
	var bus_index := AudioServer.get_bus_index(_safe_bus_name(bus_name))
	if bus_index < 0:
		return null
	var wanted := effect_name.to_lower()
	for effect_index in range(AudioServer.get_bus_effect_count(bus_index)):
		var effect := AudioServer.get_bus_effect(bus_index, effect_index)
		if effect != null and effect.get_class().to_lower().find(wanted) >= 0:
			return effect
	var effect: AudioEffect = null
	match wanted:
		"lowpass", "low_pass", "low-pass":
			effect = AudioEffectLowPassFilter.new()
		"highpass", "high_pass", "high-pass":
			effect = AudioEffectHighPassFilter.new()
		"reverb":
			effect = AudioEffectReverb.new()
		"delay":
			effect = AudioEffectDelay.new()
		"compressor", "ducking":
			effect = AudioEffectCompressor.new()
	if effect != null:
		AudioServer.add_bus_effect(bus_index, effect, AudioServer.get_bus_effect_count(bus_index))
	return effect


func _set_bus_effect_property_smooth(bus_name: String, effect_name: String, property_name: String, target_value, transition_time: float) -> void:
	var effect := _find_or_create_effect(bus_name, effect_name)
	if effect == null or not _property_names(effect).has(property_name):
		return
	if transition_time <= 0.0 or not is_inside_tree():
		effect.set(property_name, target_value)
		return
	var start_value = effect.get(property_name)
	if not (start_value is int or start_value is float) or not (target_value is int or target_value is float):
		effect.set(property_name, target_value)
		return
	var tween := create_tween()
	tween.tween_method(func(value: float) -> void:
		if effect != null:
			effect.set(property_name, value)
	, float(start_value), float(target_value), transition_time)


func _property_names(object: Object) -> Array[String]:
	var names: Array[String] = []
	for property in object.get_property_list():
		names.append(str(property.get("name", "")))
	return names


func _default_property_for_effect(effect_name: String) -> String:
	var effect := effect_name.to_lower()
	if effect.find("low") >= 0 or effect.find("high") >= 0:
		return "cutoff_hz"
	if effect.find("reverb") >= 0:
		return "wet"
	if effect.find("delay") >= 0:
		return "tap1_level_db"
	if effect.find("compressor") >= 0 or effect.find("duck") >= 0:
		return "mix"
	return ""


func _amount_to_effect_value(effect_name: String, amount: float):
	var safe_amount := clamp(amount, 0.0, 1.0)
	var effect := effect_name.to_lower()
	if effect.find("low") >= 0:
		return lerp(20000.0, 650.0, safe_amount)
	if effect.find("high") >= 0:
		return lerp(20.0, 1200.0, safe_amount)
	if effect.find("delay") >= 0:
		return lerp(-80.0, -6.0, safe_amount)
	return safe_amount


func _prepare_stem_sync_for_current_state() -> void:
	if playback_profile == null or not playback_profile.use_audio_stream_synchronized:
		return
	if playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.PROCEDURAL_PREVIEW:
		return
	_setup_native_audio_players()
	var stem_map := _stem_map_for_current_state()
	if stem_map.is_empty():
		return
	var sync_stream := AudioStreamSynchronized.new()
	var layers := stem_map.keys()
	layers.sort()
	sync_stream.set_stream_count(layers.size())
	for index in range(layers.size()):
		var layer_name := str(layers[index])
		var stream := _load_audio_stream(stem_map[layer_name])
		if stream != null:
			sync_stream.set_sync_stream(index, stream)
			sync_stream.set_sync_stream_volume(index, float(_layer_volumes.get(layer_name, 0.0)))
	_stem_player.bus = _safe_bus_name(playback_profile.master_music_bus)
	_stem_player.stream = sync_stream


func _start_native_stems_from_current_tick() -> void:
	if _stem_player == null or _stem_player.stream == null or chart == null:
		return
	if playback_profile != null and playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.PROCEDURAL_PREVIEW:
		return
	_stem_player.play(float(current_tick) * chart.get_seconds_per_tick())


func _stem_map_for_current_state() -> Dictionary:
	if playback_profile == null:
		return {}
	if not current_music_state.is_empty() and playback_profile.state_stem_sets.has(current_music_state):
		var state_key := str(playback_profile.state_stem_sets[current_music_state])
		if playback_profile.stem_sets.has(state_key) and playback_profile.stem_sets[state_key] is Dictionary:
			return playback_profile.stem_sets[state_key]
	if not current_music_state.is_empty() and playback_profile.stem_sets.has(current_music_state) and playback_profile.stem_sets[current_music_state] is Dictionary:
		return playback_profile.stem_sets[current_music_state]
	if not playback_profile.stem_paths.is_empty():
		return playback_profile.stem_paths
	if chart != null and not current_music_state.is_empty() and chart.stem_sets.has(current_music_state) and chart.stem_sets[current_music_state] is Dictionary:
		return chart.stem_sets[current_music_state]
	return {}


func _load_audio_stream(value) -> AudioStream:
	if value is AudioStream:
		return value
	if value is String and ResourceLoader.exists(value):
		var path := str(value)
		if _audio_stream_cache.has(path):
			return _audio_stream_cache[path]
		var resource := load(path)
		if resource is AudioStream:
			_audio_stream_cache[path] = resource
			return resource
		return null
	return null


func _stop_native_stems() -> void:
	if is_instance_valid(_stem_player):
		_stem_player.stop()


func _play_stinger_stream(name: String) -> int:
	_stinger_play_requests_total += 1
	if playback_profile == null or not playback_profile.use_audio_stream_polyphonic_for_accents:
		_stinger_play_failures_total += 1
		return -1
	if not is_inside_tree() or _is_headless_display():
		_stinger_play_failures_total += 1
		return -1
	var safe_bus := _safe_bus_name(playback_profile.stingers_bus)
	var playback := _get_polyphonic_playback(safe_bus)
	if playback == null:
		_stinger_play_failures_total += 1
		return -1
	var stream := _load_audio_stream(playback_profile.accent_streams.get(name, null))
	if stream == null:
		_stinger_play_failures_total += 1
		return -1
	var bus := StringName(safe_bus)
	var stream_id := playback.play_stream(stream, 0.0, _sample_preview_gain_db("stingers", name), 1.0, 0, bus)
	if stream_id >= 0:
		_last_stinger_stream_key = _stream_key(safe_bus, stream_id)
		_active_stinger_ids[_last_stinger_stream_key] = {"id": stream_id, "bus": safe_bus, "name": name}
		return stream_id
	_stinger_play_failures_total += 1
	return -1


func _play_polyphonic_sample(stream: AudioStream, bus_name: String, sample_name: String, volume_db := 0.0, pitch_scale := 1.0) -> int:
	_sample_play_requests_total += 1
	if playback_profile == null or not playback_profile.use_audio_stream_polyphonic_for_accents:
		_sample_play_failures_total += 1
		return -1
	if stream == null or not is_inside_tree() or _is_headless_display():
		_sample_play_failures_total += 1
		return -1
	var safe_bus := _safe_bus_name(bus_name)
	var playback := _get_polyphonic_playback(safe_bus)
	if playback == null:
		_sample_play_failures_total += 1
		return -1
	var stream_id := playback.play_stream(stream, 0.0, volume_db, max(0.05, pitch_scale), 0, StringName(safe_bus))
	if stream_id >= 0:
		_active_sample_ids[_stream_key(safe_bus, stream_id)] = {"id": stream_id, "bus": safe_bus, "name": sample_name}
	else:
		_sample_play_failures_total += 1
	return stream_id


func _update_stinger_finishes() -> void:
	for stream_key in _active_stinger_ids.keys().duplicate():
		var info: Dictionary = _active_stinger_ids[stream_key]
		var playback := _polyphonic_playbacks.get(str(info.get("bus", "")), null) as AudioStreamPlaybackPolyphonic
		if playback == null or not playback.is_stream_playing(int(info.get("id", -1))):
			var stinger_name := str(info.get("name", ""))
			_active_stinger_ids.erase(stream_key)
			stinger_finished.emit(stinger_name)
			var return_state := str(_stinger_return_states.get(stream_key, ""))
			_stinger_return_states.erase(stream_key)
			if not return_state.is_empty():
				queue_music_state(return_state, TransitionBoundary.NEXT_BAR)
	for stream_key in _active_sample_ids.keys().duplicate():
		var info: Dictionary = _active_sample_ids[stream_key]
		var playback := _polyphonic_playbacks.get(str(info.get("bus", "")), null) as AudioStreamPlaybackPolyphonic
		if playback == null or not playback.is_stream_playing(int(info.get("id", -1))):
			_active_sample_ids.erase(stream_key)


func _stream_key(bus_name: String, stream_id: int) -> String:
	return "%s:%d" % [bus_name, stream_id]


func _sample_key_for_event(event: Dictionary) -> String:
	var track_type := str(event.get("track_type", ""))
	var instrument_id := str(event.get("instrument_id", ""))
	var flags: Dictionary = event.get("flags", {})
	var accent := bool(flags.get("accent", false))
	if track_type == "drum" and accent:
		var accent_key := "%s_accent" % instrument_id
		if playback_profile != null and playback_profile.drum_kit.has(accent_key):
			return accent_key
	if track_type == "accent":
		var full_key := "accent:%s" % instrument_id
		if playback_profile != null and playback_profile.event_sample_streams.has(full_key):
			return full_key
	if track_type == "bass":
		var bass_key := "bass:%s" % instrument_id
		if playback_profile != null and playback_profile.event_sample_streams.has(bass_key):
			return bass_key
		return "bass"
	if track_type == "chord":
		if playback_profile != null and playback_profile.event_sample_streams.has("chord:tone"):
			return "chord:tone"
		return "chord"
	if track_type == "melody":
		var melody_key := "melody:%s" % instrument_id
		if playback_profile != null and playback_profile.event_sample_streams.has(melody_key):
			return melody_key
		return "melody"
	return instrument_id


func _sample_preview_layer_for_event(event: Dictionary) -> String:
	match str(event.get("track_type", "")):
		"drum":
			return "drums"
		"bass":
			return "bass"
		"chord":
			return "chords"
		"melody":
			return "melody"
		_:
			return "stingers"


func _sample_pitch_scale_for_event(event: Dictionary) -> float:
	var midi_note := int(event.get("midi_note", -1))
	if midi_note < 0:
		return 1.0
	var track_type := str(event.get("track_type", ""))
	var root_note := 60
	if track_type == "bass":
		root_note = 36
	elif track_type == "melody":
		root_note = 60
	elif track_type == "chord":
		root_note = 60
	return pow(2.0, float(midi_note - root_note) / 12.0)


func _sample_preview_gain_db(layer_name: String, sample_key: String) -> float:
	if playback_profile == null:
		return 0.0
	var gains: Dictionary = playback_profile.sample_preview_gain_db
	if gains.has(sample_key):
		return float(gains[sample_key])
	if gains.has(layer_name):
		return float(gains[layer_name])
	return 0.0


func _sample_audio_is_too_late(event: Dictionary) -> bool:
	if playback_profile == null or playback_profile.sample_preview_skip_late_audio_ticks <= 0:
		return false
	var event_tick := int(event.get("tick", current_tick))
	return current_tick - event_tick > playback_profile.sample_preview_skip_late_audio_ticks


func _use_wall_clock_timing() -> bool:
	return playback_profile != null and playback_profile.sample_preview_wall_clock_timing


func _reset_wall_clock_anchor() -> void:
	_clock_anchor_tick = current_tick
	_clock_anchor_usec = Time.get_ticks_usec()


func _sample_stream_for_key(sample_key: String) -> AudioStream:
	if playback_profile == null:
		return null
	if playback_profile.drum_kit.has(sample_key):
		return _load_audio_stream(playback_profile.drum_kit[sample_key])
	if playback_profile.event_sample_streams.has(sample_key):
		return _load_audio_stream(playback_profile.event_sample_streams[sample_key])
	if playback_profile.accent_streams.has(sample_key):
		return _load_audio_stream(playback_profile.accent_streams[sample_key])
	return null


func _is_headless_display() -> bool:
	return DisplayServer.get_name().to_lower() == "headless"


func _set_sync_stream_volume(layer_name: String, volume_db: float) -> void:
	if _stem_player == null or not (_stem_player.stream is AudioStreamSynchronized):
		return
	var sync_stream := _stem_player.stream as AudioStreamSynchronized
	var stem_map := _stem_map_for_current_state()
	var layers := stem_map.keys()
	layers.sort()
	var index := layers.find(layer_name)
	if index >= 0 and index < sync_stream.get_stream_count():
		sync_stream.set_sync_stream_volume(index, volume_db)


func _find_event_cursor(tick: int) -> int:
	if chart == null:
		return 0
	var low := 0
	var high := chart.compiled_events.size()
	while low < high:
		var mid := int((low + high) / 2)
		var event_tick := int(chart.compiled_events[mid].get("tick", 0))
		if event_tick < tick:
			low = mid + 1
		else:
			high = mid
	return low


func _ticks_per_second() -> float:
	if chart == null:
		return 0.0
	return float(chart.bpm) / 60.0 * float(chart.ticks_per_quarter)
