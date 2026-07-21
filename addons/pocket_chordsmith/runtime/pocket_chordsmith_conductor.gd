@tool
extends Node
class_name PocketChordsmithConductor

const PlaybackProfile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const SoundProfileContract := preload("res://addons/pocket_chordsmith/import/pcs_sound_profile_contract.gd")

const NATIVE_BASS_SAMPLE_RATE := 44100
const DEFAULT_SAMPLE_PREVIEW_MIX := {
	"master": 0.82,
	"drums": 0.86,
	"bass": 0.86,
	"chords": 0.72,
	"melody": 0.65,
	"guitar": 0.66,
}

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

@export var chart: Resource
@export var playback_profile: Resource
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
var _audio_event_cursor := 0
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
var _stem_layer_players := {}
var _stinger_player: AudioStreamPlayer
var _stinger_playback: AudioStreamPlaybackPolyphonic
var _polyphonic_players := {}
var _polyphonic_playbacks := {}
var _sample_preview_pan_buses := {}
var _sample_preview_created_pan_buses := {}
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
var _sample_play_skipped_late_total := 0
var _sample_preview_native_cache_hits_total := 0
var _sample_preview_native_fallbacks_total := 0
var _sample_preview_native_cache_hits_by_track := {}
var _sample_preview_native_fallbacks_by_track := {}
var _sample_preview_recent_native_fallbacks := []
var _stinger_play_requests_total := 0
var _stinger_play_failures_total := 0
var _audio_stream_cache := {}
var _last_audio_prewarm_signature := ""
var _warned_missing_stem_sections := {}
var _native_bass_stream_cache := {}
var _native_melody_stream_cache := {}
var _native_guitar_stream_cache := {}
var _native_chord_stream_cache := {}
var _last_stinger_stream_key := ""
var _sample_preview_last_kick_tick := -2147483648
var _pending_timer_generation := 0
var _max_events_warning_frames := 0
var _sidechain_generation := 0
var _last_native_cache_signature := ""
var _native_preview_slice_cursor := 0
var _native_preview_slice_seen := {}


func _ready() -> void:
	if playback_profile == null:
		playback_profile = PlaybackProfile.new()
	_setup_native_audio_players()
	_apply_safe_default_buses()
	if playback_profile.sample_preview_prewarm_on_ready:
		prewarm_audio(false, false)
	set_process(true)
	if autoplay and chart != null:
		play()


func _exit_tree() -> void:
	_stop_polyphonic_streams()
	_active_stinger_ids.clear()
	_stinger_return_states.clear()
	_active_sample_ids.clear()
	_audio_stream_cache.clear()
	_last_audio_prewarm_signature = ""
	_clear_native_preview_caches()
	_last_stinger_stream_key = ""
	_stinger_playback = null
	if is_instance_valid(_stem_player):
		_stem_player.stop()
		_stem_player.stream = null
		if _stem_player.get_parent() == self:
			remove_child(_stem_player)
		_stem_player.free()
		_stem_player = null
	for player_value in _stem_layer_players.values():
		var player := player_value as AudioStreamPlayer
		if is_instance_valid(player):
			player.stop()
			player.stream = null
			if player.get_parent() == self:
				remove_child(player)
			player.free()
	_stem_layer_players.clear()
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
	_remove_sample_preview_pan_buses()


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
	_active_stinger_ids.clear()
	_stinger_return_states.clear()
	_active_sample_ids.clear()
	_last_stinger_stream_key = ""


func set_playback_profile(profile: Resource, stop_active_samples := true) -> void:
	if stop_active_samples:
		_stop_polyphonic_streams()
		_remove_sample_preview_pan_buses()
	playback_profile = profile if profile != null else PlaybackProfile.new()
	_audio_stream_cache.clear()
	_clear_native_preview_caches()
	_last_playback_warning_signature = ""
	_setup_native_audio_players()
	_apply_safe_default_buses()
	if playback_profile.sample_preview_prewarm_on_ready:
		prewarm_audio(false, false)
	_warn_playback_profile_once()


func play() -> void:
	if chart == null:
		return
	_warn_playback_profile_once()
	_apply_sample_preview_fx_settings()
	_sync_native_preview_cache_signature()
	if playback_profile != null and playback_profile.sample_preview_prewarm_on_ready:
		prewarm_audio(false, false)
	_reset_preview_diagnostics_counters()
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
	_pending_timer_generation += 1
	_sidechain_generation += 1
	_playing = false
	_paused = false
	current_tick = 0
	_tick_float = 0.0
	_event_cursor = 0
	_audio_event_cursor = 0
	_sample_preview_last_kick_tick = -2147483648
	_last_beat_index = -1
	_last_bar_index = -1
	_last_section_id = ""
	current_section = ""
	current_bar = 1
	current_beat = 1
	current_arrangement_index = 0
	_stop_native_stems()
	_stop_polyphonic_streams()
	_remove_sample_preview_pan_buses()
	_restore_sample_preview_bus_volumes()


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
	_process_previous_tick = current_tick
	_reset_wall_clock_anchor()
	_event_cursor = _find_event_cursor(current_tick)
	_audio_event_cursor = _find_event_cursor(current_tick)
	reset_native_preview_prewarm_cursor(current_tick)
	_sample_preview_last_kick_tick = -2147483648
	_last_beat_index = int(floor(float(current_tick) / float(chart.ticks_per_quarter))) - 1
	_last_bar_index = int(floor(float(current_tick) / float(max(1, chart.time_signature * chart.ticks_per_quarter)))) - 1
	_update_position_fields()
	_last_section_id = current_section


func jump_to_section(section_id: String) -> void:
	if chart == null:
		return
	var canonical_section := _canonical_section_id(section_id)
	var target_tick: int = chart.first_section_start_tick(canonical_section)
	if target_tick < 0:
		push_warning("PocketChordsmithConductor could not find section '%s' in the arrangement." % section_id)
		return
	seek_tick(target_tick)
	_emit_current_section_started()
	_sync_sequence_index_to_section(canonical_section)
	_prepare_stem_sync_for_current_state()
	_start_native_stems_from_current_tick()


func queue_section(section_id: String, boundary := TransitionBoundary.NEXT_BAR) -> void:
	_queued_section = _canonical_section_id(section_id)
	_queue_transition({
		"type": "section",
		"section_id": _queued_section,
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
	var layer_name := normalize_layer_name(stem_name)
	_stem_volumes[layer_name] = volume_db
	stem_volume_changed.emit(layer_name, volume_db)
	set_layer_volume(layer_name, volume_db)


func set_layer_volume(layer_name: String, db: float) -> void:
	var normalized := normalize_layer_name(layer_name)
	_layer_volumes[normalized] = db
	layer_volume_changed.emit(normalized, db)
	var bus_name := _bus_for_layer(normalized)
	_set_bus_volume_smooth(bus_name, db, 0.0)
	_set_sync_stream_volume(normalized, db)


func mute_layer(layer_name: String, muted: bool) -> void:
	var normalized := normalize_layer_name(layer_name)
	_layer_mutes[normalized] = muted
	layer_mute_changed.emit(normalized, muted)
	var bus_index := AudioServer.get_bus_index(_bus_for_layer(normalized))
	if bus_index >= 0:
		AudioServer.set_bus_mute(bus_index, muted)
	if _stem_layer_players.has(normalized):
		var player := _stem_layer_players[normalized] as AudioStreamPlayer
		if is_instance_valid(player):
			player.volume_db = -80.0 if muted else float(_layer_volumes.get(normalized, _stem_volumes.get(normalized, 0.0)))


func mute_stem(stem_name: String, muted: bool) -> void:
	mute_layer(stem_name, muted)


func normalize_layer_name(name: String) -> String:
	if playback_profile != null and playback_profile.has_method("normalize_layer_name"):
		return str(playback_profile.call("normalize_layer_name", name))
	return name.strip_edges().to_lower().replace("-", "_").replace(" ", "_")


func has_section_stems(section_id: String) -> bool:
	return playback_profile != null and playback_profile.has_method("has_section_stems") and bool(playback_profile.call("has_section_stems", section_id))


func active_stem_map() -> Dictionary:
	return _stem_map_for_current_state().duplicate(true)


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


func prewarm_audio(include_stems := true, include_native_preview := false) -> Dictionary:
	var report := {
		"ok": true,
		"loaded": 0,
		"failed": 0,
		"cached_streams": _audio_stream_cache.size(),
		"native_cached_streams": 0,
		"native_prewarmed_events": 0,
		"warnings": [],
	}
	if playback_profile == null:
		report["ok"] = false
		report["warnings"].append("Pocket Chordsmith cannot prewarm audio without a playback profile.")
		return report
	var prewarm_signature := _audio_prewarm_signature(include_stems, include_native_preview)
	if not include_native_preview and not prewarm_signature.is_empty() and prewarm_signature == _last_audio_prewarm_signature:
		report["cached_streams"] = _audio_stream_cache.size()
		report["native_cached_streams"] = _native_bass_stream_cache.size() + _native_melody_stream_cache.size() + _native_guitar_stream_cache.size() + _native_chord_stream_cache.size()
		return report
	var seen := {}
	_prewarm_audio_dictionary(playback_profile.drum_kit, seen, report, true)
	_prewarm_audio_dictionary(playback_profile.event_sample_streams, seen, report, true)
	_prewarm_audio_dictionary(playback_profile.accent_streams, seen, report, true)
	if include_stems:
		for stem_map in _all_stem_maps_for_prewarm():
			_prewarm_audio_dictionary(stem_map, seen, report, false)
	if include_native_preview:
		_sync_native_preview_cache_signature()
		_prewarm_native_preview_streams(report)
	report["cached_streams"] = _audio_stream_cache.size()
	report["native_cached_streams"] = _native_bass_stream_cache.size() + _native_melody_stream_cache.size() + _native_guitar_stream_cache.size() + _native_chord_stream_cache.size()
	report["ok"] = int(report["failed"]) == 0
	if report["ok"] and not include_native_preview:
		_last_audio_prewarm_signature = prewarm_signature
	return report


func prewarm_section(section_id: String) -> bool:
	if playback_profile == null:
		return false
	var report := {
		"ok": true,
		"loaded": 0,
		"failed": 0,
		"warnings": [],
	}
	var seen := {}
	var stem_map := _section_stem_map(section_id)
	if stem_map.is_empty():
		return false
	_prewarm_audio_dictionary(stem_map, seen, report, false)
	return bool(report.get("ok", false)) and int(report.get("failed", 0)) == 0


func prewarm_sections(section_ids: Array) -> Dictionary:
	var out := {}
	for section_value in section_ids:
		var section_id := _canonical_section_id(str(section_value))
		if not section_id.is_empty():
			out[section_id] = prewarm_section(section_id)
	return out


func get_missing_audio_assets() -> Array[String]:
	var missing: Array[String] = []
	if playback_profile == null:
		return missing
	var seen := {}
	for value in _all_audio_asset_values():
		if not (value is String):
			continue
		var path := str(value)
		if path.is_empty() or seen.has(path):
			continue
		seen[path] = true
		var file_path := ProjectSettings.globalize_path(path)
		if not ResourceLoader.exists(path) and not FileAccess.file_exists(file_path):
			missing.append(path)
	missing.sort()
	return missing


func validate_audio_assets() -> Dictionary:
	var missing := get_missing_audio_assets()
	return {
		"ok": missing.is_empty(),
		"missing": missing,
		"missing_count": missing.size(),
		"cached_streams": _audio_stream_cache.size(),
	}


func reset_native_preview_prewarm_cursor(tick := -1) -> void:
	if chart == null:
		_native_preview_slice_cursor = 0
		_native_preview_slice_seen.clear()
		return
	var target_tick := current_tick if tick < 0 else int(tick)
	_native_preview_slice_cursor = _find_event_cursor(clamp(target_tick, 0, max(0, chart.get_length_ticks())))
	_native_preview_slice_seen.clear()


func prewarm_native_preview_slice(max_events := 1, max_milliseconds := 8.0) -> Dictionary:
	var report := {
		"ok": true,
		"checked": 0,
		"warmed": 0,
		"complete": false,
		"over_budget": false,
		"cursor": _native_preview_slice_cursor,
		"cached_native_streams": _native_bass_stream_cache.size() + _native_melody_stream_cache.size() + _native_guitar_stream_cache.size() + _native_chord_stream_cache.size(),
		"elapsed_ms": 0.0,
		"warnings": [],
	}
	if chart == null or playback_profile == null:
		report["ok"] = false
		report["warnings"].append("Pocket Chordsmith cannot prewarm native preview streams without a chart and playback profile.")
		return report
	if not playback_profile.sample_preview_tonal_enabled:
		report["complete"] = true
		return report
	if chart.compiled_events.is_empty():
		report["complete"] = true
		return report
	_sync_native_preview_cache_signature()
	var event_limit := max(1, int(max_events))
	var budget_usec := int(max(0.0, float(max_milliseconds)) * 1000.0)
	var start_usec := Time.get_ticks_usec()
	while _native_preview_slice_cursor < chart.compiled_events.size():
		if int(report["warmed"]) >= event_limit:
			break
		if budget_usec > 0 and Time.get_ticks_usec() - start_usec >= budget_usec and int(report["warmed"]) > 0:
			break
		var event: Dictionary = chart.compiled_events[_native_preview_slice_cursor]
		_native_preview_slice_cursor += 1
		report["checked"] = int(report["checked"]) + 1
		if _event_is_suppressed(event):
			continue
		if not _event_uses_native_preview(event):
			continue
		var key := _native_preview_event_key(event)
		if _native_preview_slice_seen.has(key):
			continue
		_native_preview_slice_seen[key] = true
		_prewarm_native_sample_preview_event(event)
		report["warmed"] = int(report["warmed"]) + 1
	report["complete"] = _native_preview_slice_cursor >= chart.compiled_events.size()
	report["cursor"] = _native_preview_slice_cursor
	report["cached_native_streams"] = _native_bass_stream_cache.size() + _native_melody_stream_cache.size() + _native_guitar_stream_cache.size() + _native_chord_stream_cache.size()
	report["elapsed_ms"] = float(Time.get_ticks_usec() - start_usec) / 1000.0
	report["over_budget"] = budget_usec > 0 and float(report["elapsed_ms"]) > float(max_milliseconds)
	return report


func _prewarm_native_preview_streams(report: Dictionary) -> void:
	if chart == null or playback_profile == null or not playback_profile.sample_preview_tonal_enabled:
		return
	if chart.compiled_events.is_empty():
		return
	_sync_native_preview_cache_signature()
	var seen := {}
	for event in chart.compiled_events:
		var track_type := str(event.get("track_type", ""))
		if track_type != "bass" and track_type != "melody" and track_type != "guitar" and track_type != "chord":
			continue
		var key := _native_preview_event_key(event)
		if seen.has(key):
			continue
		seen[key] = true
		_prewarm_native_sample_preview_event(event)
		report["native_prewarmed_events"] = int(report.get("native_prewarmed_events", 0)) + 1


func _native_preview_cache_signature() -> String:
	if chart == null:
		return ""
	return "%s:%d:%d:%0.9f" % [
		chart.resource_path,
		int(chart.get("ticks_per_quarter")),
		int(chart.get("time_signature")),
		float(chart.call("get_seconds_per_tick")) if chart.has_method("get_seconds_per_tick") else 0.0,
	]


func _sync_native_preview_cache_signature() -> void:
	var signature := _native_preview_cache_signature()
	if signature == _last_native_cache_signature:
		return
	_clear_native_preview_caches()
	_last_native_cache_signature = signature
	reset_native_preview_prewarm_cursor(current_tick)


func _clear_native_preview_caches() -> void:
	_native_bass_stream_cache.clear()
	_native_melody_stream_cache.clear()
	_native_guitar_stream_cache.clear()
	_native_chord_stream_cache.clear()
	_native_preview_slice_cursor = 0
	_native_preview_slice_seen.clear()


func _event_uses_native_preview(event: Dictionary) -> bool:
	if playback_profile == null or not playback_profile.sample_preview_tonal_enabled:
		return false
	var track_type := str(event.get("track_type", ""))
	if track_type == "bass":
		return bool(playback_profile.sample_preview_native_bass_enabled)
	if track_type == "melody":
		return bool(playback_profile.sample_preview_native_melody_enabled)
	if track_type == "guitar":
		return bool(playback_profile.sample_preview_native_guitar_enabled)
	if track_type == "chord":
		return bool(playback_profile.sample_preview_native_chords_enabled)
	return false


func _native_preview_event_key(event: Dictionary) -> String:
	return "%s:%s:%s:%s:%s" % [
		str(event.get("track_type", "")),
		str(event.get("instrument_id", "")),
		str(event.get("midi_note", "")),
		str(event.get("duration_ticks", "")),
		JSON.stringify(_dictionary_or_empty(event.get("flags", {}))),
	]


func get_diagnostics() -> Dictionary:
	var backend := "none"
	var stem_status := "inactive"
	if playback_profile != null:
		backend = PlaybackProfile.PlaybackBackend.keys()[playback_profile.playback_backend]
	if _has_ready_stem_players():
		stem_status = "playing" if _has_playing_stem_players() else "ready"
	var expressive := _expressive_event_diagnostics()
	var capability_report := {}
	if chart != null:
		var capabilities: Dictionary = playback_profile.get_capabilities() if playback_profile != null and playback_profile.has_method("get_capabilities") else {}
		capability_report = SoundProfileContract.negotiate({"soundProfile": chart.sound_profile, "formatFeatures": chart.format_features, "sections": chart.rich_sections}, capabilities)
	return {
		"backend": backend,
		"chart": chart.resource_path if chart != null else "",
		"event_cursor": _event_cursor,
		"audio_event_cursor": _audio_event_cursor,
		"event_count": chart.compiled_events.size() if chart != null else 0,
		"lookahead_ticks": playback_profile.lookahead_ticks if playback_profile != null else 0,
		"sample_preview_wall_clock_timing": playback_profile.sample_preview_wall_clock_timing if playback_profile != null else false,
		"swing": chart.swing if chart != null else 0.0,
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
		"cached_audio_streams": _audio_stream_cache.size(),
		"cached_native_streams": _native_bass_stream_cache.size() + _native_melody_stream_cache.size() + _native_guitar_stream_cache.size() + _native_chord_stream_cache.size(),
		"native_preview_prewarm_cursor": _native_preview_slice_cursor,
		"native_preview_prewarm_complete": chart != null and _native_preview_slice_cursor >= chart.compiled_events.size(),
		"sample_play_requests_total": _sample_play_requests_total,
		"sample_play_failures_total": _sample_play_failures_total,
		"sample_play_skipped_late_total": _sample_play_skipped_late_total,
		"sample_preview_native_cache_hits_total": _sample_preview_native_cache_hits_total,
		"sample_preview_native_fallbacks_total": _sample_preview_native_fallbacks_total,
		"sample_preview_native_cache_hits_by_track": _dictionary_or_empty(_sample_preview_native_cache_hits_by_track).duplicate(true),
		"sample_preview_native_fallbacks_by_track": _dictionary_or_empty(_sample_preview_native_fallbacks_by_track).duplicate(true),
		"sample_preview_recent_native_fallbacks": _array_or_empty(_sample_preview_recent_native_fallbacks).duplicate(true),
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
		"schema_version": chart.schema_version if chart != null else 0,
		"sound_profile": chart.sound_profile.duplicate(true) if chart != null else {},
		"format_features": chart.format_features.duplicate() if chart != null else [],
		"profile_metadata": chart.profile_metadata.duplicate(true) if chart != null else {},
		"expressive_event_count": chart.expressive_event_count if chart != null else 0,
		"expressive_event_diagnostics": expressive,
		"capability_report": capability_report,
	}


func _expressive_event_diagnostics() -> Dictionary:
	var result := {"articulations": {}, "roles": {}, "sounds": {}, "technique_namespaces": {}, "expression_fields": 0}
	if chart == null:
		return result
	for event in chart.compiled_events:
		var articulation := str(event.get("articulation", ""))
		if not articulation.is_empty():
			result["articulations"][articulation] = int(result["articulations"].get(articulation, 0)) + 1
		var role := str(event.get("role", ""))
		if not role.is_empty():
			result["roles"][role] = int(result["roles"].get(role, 0)) + 1
		var sound := str(event.get("sound", ""))
		if not sound.is_empty():
			result["sounds"][sound] = int(result["sounds"].get(sound, 0)) + 1
		var technique: Dictionary = event.get("technique", {}) if event.get("technique", {}) is Dictionary else {}
		for technique_namespace in technique.keys():
			result["technique_namespaces"][str(technique_namespace)] = int(result["technique_namespaces"].get(str(technique_namespace), 0)) + 1
		var expression: Dictionary = event.get("expression", {}) if event.get("expression", {}) is Dictionary else {}
		result["expression_fields"] = int(result["expression_fields"]) + expression.size()
	return result


func _record_sample_preview_native_cache_hit(event: Dictionary) -> void:
	_sample_preview_native_cache_hits_total += 1
	var track_type := str(event.get("track_type", "unknown"))
	_sample_preview_native_cache_hits_by_track = _sample_preview_increment_counter(_sample_preview_native_cache_hits_by_track, track_type)


func _record_sample_preview_native_fallback(event: Dictionary, sample_key: String, reason: String) -> void:
	_sample_preview_native_fallbacks_total += 1
	var track_type := str(event.get("track_type", "unknown"))
	_sample_preview_native_fallbacks_by_track = _sample_preview_increment_counter(_sample_preview_native_fallbacks_by_track, track_type)
	var entry := {
		"tick": int(event.get("tick", current_tick)),
		"track_type": track_type,
		"instrument_id": str(event.get("instrument_id", "")),
		"sample_key": sample_key,
		"midi_note": int(event.get("midi_note", -1)),
		"reason": reason,
	}
	var flags: Dictionary = event.get("flags", {})
	if flags.has("midi_notes") and flags["midi_notes"] is Array:
		entry["midi_notes"] = Array(flags["midi_notes"]).duplicate()
	if flags.has("sound_profile"):
		entry["sound_profile"] = str(flags.get("sound_profile", ""))
	if flags.has("variation"):
		entry["variation"] = str(flags.get("variation", ""))
	if not (_sample_preview_recent_native_fallbacks is Array):
		_sample_preview_recent_native_fallbacks = []
	_sample_preview_recent_native_fallbacks.append(entry)
	while _sample_preview_recent_native_fallbacks.size() > 24:
		_sample_preview_recent_native_fallbacks.pop_front()


func _sample_preview_increment_counter(counter, key: String) -> Dictionary:
	var out: Dictionary = counter if counter is Dictionary else {}
	var safe_key := "unknown" if key.is_empty() else key
	out[safe_key] = int(out.get(safe_key, 0)) + 1
	return out


func _reset_preview_diagnostics_counters() -> void:
	_events_emitted_this_frame = 0
	_events_late_this_frame = 0
	_events_deferred_this_frame = 0
	_events_emitted_total = 0
	_events_late_total = 0
	_events_deferred_total = 0
	_sample_play_requests_total = 0
	_sample_play_failures_total = 0
	_sample_play_skipped_late_total = 0
	_sample_preview_native_cache_hits_total = 0
	_sample_preview_native_fallbacks_total = 0
	_sample_preview_native_cache_hits_by_track = {}
	_sample_preview_native_fallbacks_by_track = {}
	_sample_preview_recent_native_fallbacks = []
	_stinger_play_requests_total = 0
	_stinger_play_failures_total = 0


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
	_route_audio_lookahead_events()
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
	var length_ticks: int = chart.get_length_ticks()
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
	var section_info: Dictionary = chart.find_section_at_tick(current_tick)
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
	if emitted >= max_events and _event_cursor < chart.compiled_events.size():
		var index := _event_cursor
		while index < chart.compiled_events.size() and int(chart.compiled_events[index].get("tick", 0)) <= current_tick:
			_events_deferred_this_frame += 1
			index += 1
		_events_deferred_total += _events_deferred_this_frame
		_max_events_warning_frames += 1
		if _max_events_warning_frames == 1 or _max_events_warning_frames % 60 == 0:
			push_warning("PocketChordsmithConductor reached max_events_per_frame; consider increasing the playback profile limit.")
	else:
		_max_events_warning_frames = 0


func _initialize_music_state() -> void:
	if chart == null:
		return
	if playback_profile == null:
		playback_profile = PlaybackProfile.new()
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
	var section_info: Dictionary = chart.find_section_at_tick(previous_tick)
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
			var section_info: Dictionary = chart.find_section_at_tick(previous_tick)
			if section_info.is_empty():
				return false
			var end_tick := int(section_info.get("start_tick", 0)) + int(section_info.get("length_ticks", 0))
			return previous_tick < end_tick and next_tick >= end_tick
		TransitionBoundary.NEXT_LOOP:
			if current_sequence.is_empty():
				return _boundary_reached(previous_tick, next_tick, TransitionBoundary.NEXT_SECTION)
			var section_info: Dictionary = chart.find_section_at_tick(previous_tick)
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
	var target_tick: int = _sequence_target_tick(_current_sequence_index, section_id)
	if target_tick < 0:
		push_warning("PocketChordsmithConductor could not find section '%s' for sequence playback." % section_id)
		return
	seek_tick(target_tick)
	_emit_current_section_started()
	_prepare_stem_sync_for_current_state()
	_start_native_stems_from_current_tick()


func _sequence_target_tick(index: int, section_id: String) -> int:
	if chart == null:
		return -1
	if _sequence_matches_arrangement() and index < chart.arrangement_positions.size():
		var arrangement_section: String = chart.arrangement_section_id(index)
		if arrangement_section == section_id:
			return chart.arrangement_start_tick(index)
	return chart.first_section_start_tick(section_id)


func _sequence_matches_arrangement() -> bool:
	if chart == null or current_sequence.size() != chart.arrangement.size():
		return false
	for index in range(current_sequence.size()):
		if str(current_sequence[index]) != str(chart.arrangement[index]):
			return false
	return true


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


func _route_audio_lookahead_events() -> void:
	if chart == null or playback_profile == null or not playback_profile.sample_preview_enabled:
		return
	if not playback_profile.is_event_mode_enabled():
		return
	var lookahead_ticks := max(0, int(playback_profile.lookahead_ticks))
	var audio_limit_tick: int = current_tick + lookahead_ticks
	var max_audio_events := max(8, int(playback_profile.max_events_per_frame))
	var routed := 0
	while _audio_event_cursor < chart.compiled_events.size():
		if routed >= max_audio_events:
			break
		var event: Dictionary = chart.compiled_events[_audio_event_cursor]
		var event_tick := int(event.get("tick", 0))
		if event_tick > audio_limit_tick:
			break
		_audio_event_cursor += 1
		if _event_is_suppressed(event):
			continue
		if event_tick < current_tick - int(playback_profile.sample_preview_skip_late_audio_ticks):
			_sample_play_skipped_late_total += 1
			continue
		var delay_ticks := max(0, event_tick - current_tick)
		if _can_build_native_preview_streams_during_playback():
			_prewarm_native_sample_preview_event(event)
		_route_sample_preview_event(event, delay_ticks)
		routed += 1


func _prewarm_native_sample_preview_event(event: Dictionary) -> void:
	if playback_profile == null or not playback_profile.sample_preview_tonal_enabled:
		return
	var track_type := str(event.get("track_type", ""))
	if track_type == "bass" and bool(playback_profile.sample_preview_native_bass_enabled):
		_native_bass_stream_for_event(event, true)
	elif track_type == "melody" and bool(playback_profile.sample_preview_native_melody_enabled):
		_native_melody_stream_for_event(event, true)
	elif track_type == "guitar" and bool(playback_profile.sample_preview_native_guitar_enabled):
		_native_guitar_stream_for_event(event, true)
	elif track_type == "chord" and bool(playback_profile.sample_preview_native_chords_enabled):
		_native_chord_stream_for_event(event, true)


func _can_build_native_preview_streams_during_playback() -> bool:
	if playback_profile == null:
		return false
	return bool(playback_profile.get("sample_preview_build_native_streams_during_playback"))


func _route_sample_preview_event(event: Dictionary, delay_ticks := 0) -> void:
	if playback_profile == null or not playback_profile.sample_preview_enabled:
		return
	if not playback_profile.is_event_mode_enabled():
		return
	if delay_ticks > 0 and _is_headless_display():
		return
	if delay_ticks > 0 and chart != null and is_inside_tree():
		var event_copy := event.duplicate(true)
		var delay_seconds: float = float(delay_ticks) * chart.get_seconds_per_tick()
		var generation := _pending_timer_generation
		get_tree().create_timer(delay_seconds, true).timeout.connect(func() -> void:
			if _playing and not _paused and generation == _pending_timer_generation:
				_route_sample_preview_event(event_copy, 0)
		)
		return
	var track_type := str(event.get("track_type", ""))
	var instrument_id := str(event.get("instrument_id", ""))
	if _sample_audio_is_too_late(event):
		_sample_play_skipped_late_total += 1
		return
	if track_type == "marker":
		var stinger_name := str(playback_profile.marker_stingers.get(instrument_id, ""))
		if not stinger_name.is_empty():
			trigger_stinger(stinger_name)
		return
	var sample_key := _sample_key_for_event(event)
	if track_type == "guitar" and bool(playback_profile.sample_preview_native_guitar_enabled):
		if not playback_profile.sample_preview_tonal_enabled:
			return
		if _route_native_guitar_preview_event(event):
			_record_sample_preview_native_cache_hit(event)
			return
		_record_sample_preview_native_fallback(event, sample_key, "native_guitar_stream_missing")
	if track_type == "chord" and bool(playback_profile.sample_preview_native_chords_enabled):
		if not playback_profile.sample_preview_tonal_enabled:
			return
		if _route_native_chord_preview_event(event):
			_record_sample_preview_native_cache_hit(event)
			return
		_record_sample_preview_native_fallback(event, sample_key, "native_chord_stream_missing")
	if track_type == "chord" or track_type == "guitar":
		if not playback_profile.sample_preview_tonal_enabled:
			return
		_route_sample_preview_chord(event)
		return
	if (track_type == "bass" or track_type == "melody") and not playback_profile.sample_preview_tonal_enabled:
		return
	if not ["drum", "accent", "bass", "melody"].has(track_type):
		return
	var wants_native_bass := track_type == "bass" and bool(playback_profile.sample_preview_native_bass_enabled)
	var wants_native_melody := track_type == "melody" and bool(playback_profile.sample_preview_native_melody_enabled)
	var native_stream: AudioStream = _native_bass_stream_for_event(event, _can_build_native_preview_streams_during_playback()) if wants_native_bass else (_native_melody_stream_for_event(event, _can_build_native_preview_streams_during_playback()) if wants_native_melody else null)
	var uses_native_bass := wants_native_bass and native_stream != null
	var uses_native_melody := wants_native_melody and native_stream != null
	if uses_native_bass or uses_native_melody:
		_record_sample_preview_native_cache_hit(event)
	elif wants_native_bass or wants_native_melody:
		_record_sample_preview_native_fallback(event, sample_key, "native_tonal_stream_missing")
	var stream: AudioStream = native_stream if uses_native_bass or uses_native_melody else _sample_stream_for_key(sample_key)
	if stream == null:
		return
	var velocity := clamp(float(event.get("velocity", 100)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-18.0, 0.0, velocity) if playback_profile.sample_preview_velocity_scale else 0.0
	var layer := _sample_preview_layer_for_event(event)
	if uses_native_bass:
		volume_db += float(playback_profile.sample_preview_native_bass_gain_db) + _chart_mix_gain_db(layer)
	elif uses_native_melody:
		volume_db += float(playback_profile.sample_preview_native_melody_gain_db) + _chart_mix_gain_db(layer)
	else:
		volume_db += _sample_preview_gain_db(layer, sample_key)
	var event_tick := int(event.get("tick", current_tick))
	if track_type == "bass" and _sample_preview_should_duck_bass_for_kick(event_tick):
		volume_db += playback_profile.sample_preview_bass_duck_on_kick_db
	var pitch_scale := 1.0 if uses_native_bass or uses_native_melody else _sample_pitch_scale_for_event(event)
	var playback_type := _playback_type_for_pitched_event(track_type, pitch_scale)
	var debug_path := "native://pocket_chordsmith/bass" if uses_native_bass else ("native://pocket_chordsmith/melody" if uses_native_melody else _sample_path_for_key(sample_key))
	var debug_info := _pitch_debug_info(event, sample_key, debug_path, pitch_scale, track_type, int(event.get("midi_note", -1)))
	var bus_name := _bus_for_layer(layer) if uses_native_melody else _bus_for_sample_preview_event(layer, event)
	var stream_id := _play_polyphonic_sample(stream, bus_name, sample_key, volume_db, pitch_scale, playback_type, debug_info)
	if stream_id >= 0 and track_type == "drum" and instrument_id == "kick":
		_sample_preview_last_kick_tick = event_tick
		_trigger_sample_preview_sidechain()
	if stream_id >= 0 and not uses_native_bass and not uses_native_melody and (track_type == "bass" or track_type == "melody"):
		_schedule_sample_preview_slide(bus_name, stream_id, event, pitch_scale)


func _route_native_guitar_preview_event(event: Dictionary) -> bool:
	var stream := _native_guitar_stream_for_event(event, _can_build_native_preview_streams_during_playback())
	if stream == null:
		return false
	var layer := _sample_preview_layer_for_event(event)
	var velocity := clamp(float(event.get("velocity", 86)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-18.0, 0.0, velocity) if playback_profile.sample_preview_velocity_scale else 0.0
	volume_db += float(playback_profile.sample_preview_native_guitar_gain_db) + _chart_mix_gain_db(layer)
	var sample_key := "native:guitar:%s" % str(event.get("instrument_id", "open"))
	var debug_info := _pitch_debug_info(event, sample_key, "native://pocket_chordsmith/guitar", 1.0, "guitar", int(event.get("midi_note", -1)))
	_play_polyphonic_sample(stream, _bus_for_layer(layer), sample_key, volume_db, 1.0, AudioServer.PLAYBACK_TYPE_DEFAULT, debug_info)
	return true


func _route_native_chord_preview_event(event: Dictionary) -> bool:
	var stream := _native_chord_stream_for_event(event, _can_build_native_preview_streams_during_playback())
	if stream == null:
		return false
	var layer := _sample_preview_layer_for_event(event)
	var velocity := clamp(float(event.get("velocity", 76)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-18.0, 0.0, velocity) if playback_profile.sample_preview_velocity_scale else 0.0
	volume_db += float(playback_profile.sample_preview_native_chords_gain_db) + _chart_mix_gain_db(layer)
	var flags: Dictionary = _dictionary_or_empty(event.get("flags", {}))
	var instrument := str(flags.get("chord_instrument", event.get("instrument_id", "pocket")))
	var sample_key := "native:chord:%s" % instrument
	var debug_info := _pitch_debug_info(event, sample_key, "native://pocket_chordsmith/chord", 1.0, "chord", int(event.get("midi_note", -1)))
	_play_polyphonic_sample(stream, _bus_for_layer(layer), sample_key, volume_db, 1.0, AudioServer.PLAYBACK_TYPE_DEFAULT, debug_info)
	return true


func _route_sample_preview_chord(event: Dictionary) -> void:
	if playback_profile == null:
		return
	var sample_key := _sample_key_for_event(event)
	var stream := _sample_stream_for_key(sample_key)
	if stream == null:
		return
	var flags: Dictionary = event.get("flags", {})
	var notes: Array = flags.get("midi_notes", [int(event.get("midi_note", 60))])
	var track_type := str(event.get("track_type", "chord"))
	if track_type == "guitar":
		notes = _ordered_guitar_notes(notes, str(flags.get("direction", "down")))
	var max_notes: int = playback_profile.sample_preview_max_chord_notes
	if track_type == "guitar":
		max_notes = max(max_notes, 3)
	if max_notes > 0 and notes.size() > max_notes:
		notes = notes.slice(0, max_notes)
	var layer := _sample_preview_layer_for_event(event)
	var velocity := clamp(float(event.get("velocity", 76)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-18.0, 0.0, velocity) if playback_profile.sample_preview_velocity_scale else 0.0
	volume_db += _sample_preview_gain_db(layer, sample_key)
	for note_index in range(notes.size()):
		var midi_note := int(notes[note_index])
		var delay_seconds := _preview_chord_note_delay_seconds(flags, note_index, track_type)
		if delay_seconds > 0.0 and is_inside_tree():
			var event_copy := event.duplicate(true)
			var generation := _pending_timer_generation
			get_tree().create_timer(delay_seconds, true).timeout.connect(func() -> void:
				if _playing and not _paused and generation == _pending_timer_generation:
					_play_sample_preview_chord_note(stream, layer, sample_key, track_type, midi_note, volume_db, event_copy)
			)
		else:
			_play_sample_preview_chord_note(stream, layer, sample_key, track_type, midi_note, volume_db, event)


func _play_sample_preview_chord_note(stream: AudioStream, layer: String, sample_key: String, track_type: String, midi_note: int, volume_db: float, event: Dictionary) -> void:
	var pitch_scale := pow(2.0, float(midi_note - 60) / 12.0)
	var playback_type := _playback_type_for_pitched_event(track_type, pitch_scale)
	var debug_info := _pitch_debug_info(event, sample_key, _sample_path_for_key(sample_key), pitch_scale, track_type, midi_note)
	_play_polyphonic_sample(stream, _bus_for_layer(layer), "%s:%d" % [track_type, midi_note], volume_db, pitch_scale, playback_type, debug_info)


func _ordered_guitar_notes(notes: Array, direction: String) -> Array:
	var ordered := notes.duplicate()
	if direction == "up":
		ordered.reverse()
	return ordered


func _preview_chord_note_delay_seconds(flags: Dictionary, note_index: int, track_type: String) -> float:
	if track_type == "guitar":
		return _guitar_preview_note_delay_seconds(flags, note_index)
	if track_type != "chord":
		return 0.0
	var play_mode := str(flags.get("chord_play_mode", "block"))
	var spread := _chord_preview_spread_multiplier(str(flags.get("chord_instrument", "pocket")))
	if play_mode == "block":
		return float(note_index) * 0.010 * spread
	if play_mode.begins_with("strum"):
		return float(note_index) * 0.045 * spread
	if play_mode.begins_with("arp"):
		return float(note_index) * 0.120 * spread
	return 0.0


func _guitar_preview_note_delay_seconds(flags: Dictionary, note_index: int) -> float:
	var articulation := str(flags.get("articulation", "open"))
	if articulation == "chug" or articulation == "scratch":
		return float(note_index) * 0.003
	return float(note_index) * _guitar_preview_spread_seconds(str(flags.get("tone", "high_gain")))


func _guitar_preview_spread_seconds(tone: String) -> float:
	match tone:
		"clean":
			return 0.016
		"crunch":
			return 0.013
		"metal":
			return 0.009
		"western_twang":
			return 0.020
		_:
			return 0.010


func _chord_preview_spread_multiplier(chord_instrument: String) -> float:
	match chord_instrument:
		"chip_square_stack":
			return 0.16
		"chip_triangle_pad":
			return 0.12
		"chip_arp_keys":
			return 0.72
		"modern_chip_poly":
			return 0.28
		"piano":
			return 0.45
		"saloon_piano":
			return 0.58
		"harp":
			return 1.45
		"warm_pad":
			return 0.25
		"dusty_rhodes":
			return 0.38
		"felt_piano":
			return 0.34
		"cassette_keys":
			return 0.45
		"muted_jazz_guitar":
			return 0.72
		"lofi_warm_pad":
			return 0.22
		"glass":
			return 0.85
	return 1.0


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
	if playback_profile.playback_backend == PlaybackProfile.PlaybackBackend.STEM_SYNC:
		var has_profile_stems: bool = not playback_profile.stem_paths.is_empty() or not playback_profile.stem_sets.is_empty() or (_profile_has_property("section_stem_sets") and not playback_profile.section_stem_sets.is_empty())
		var has_chart_stems: bool = chart != null and not chart.stem_sets.is_empty()
		if not has_profile_stems and not has_chart_stems:
			warnings.append("Pocket Chordsmith playback profile is STEM_SYNC, but no stems are assigned.")
	if playback_profile.playback_backend == PlaybackProfile.PlaybackBackend.HYBRID:
		if playback_profile.stem_paths.is_empty() and playback_profile.stem_sets.is_empty() and (not _profile_has_property("section_stem_sets") or playback_profile.section_stem_sets.is_empty()) and playback_profile.drum_kit.is_empty() and playback_profile.accent_streams.is_empty() and playback_profile.event_sample_streams.is_empty():
			warnings.append("Pocket Chordsmith playback profile is HYBRID, but no stems, drum kit, accent samples, or event samples are assigned.")
		warnings.append_array(_missing_drum_sample_warnings())
	if playback_profile.sample_preview_enabled and playback_profile.sample_preview_log_pitched_events:
		warnings.append("Pocket Chordsmith pitched sample logging is enabled; disable sample_preview_log_pitched_events for normal gameplay to avoid timing stutter from console spam.")
	if playback_profile.sample_preview_enabled and not playback_profile.sample_preview_load_wavs_uncompressed:
		warnings.append("Pocket Chordsmith sample preview is using imported/compressed WAV resources; enable sample_preview_load_wavs_uncompressed for small hit kits to reduce transient crackle.")
	if playback_profile.sample_preview_enabled and not playback_profile.guitar_bus.is_empty() and AudioServer.get_bus_index(playback_profile.guitar_bus) == -1:
		warnings.append("Pocket Chordsmith guitar bus '%s' is missing; guitar preview will fall back to Master without the recommended bus routing." % playback_profile.guitar_bus)
	if playback_profile.sample_preview_enabled and playback_profile.sample_preview_fx_enabled and not playback_profile.fx_bus.is_empty() and AudioServer.get_bus_index(playback_profile.fx_bus) == -1:
		warnings.append("Pocket Chordsmith FX bus '%s' is missing; sample-preview FX are disabled instead of falling back to the master bus so drums stay dry." % playback_profile.fx_bus)
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
	for layer_name in _stem_layer_players.keys():
		var player := _stem_layer_players[layer_name] as AudioStreamPlayer
		if is_instance_valid(player):
			player.bus = _bus_for_layer(str(layer_name))
	if is_instance_valid(_stinger_player):
		_stinger_player.bus = _safe_bus_name(playback_profile.stingers_bus)
	_ensure_guitar_preview_effects()
	_apply_sample_preview_fx_settings()


func _apply_sample_preview_fx_settings() -> void:
	if playback_profile != null:
		_clear_sample_preview_fx_from_bus(str(playback_profile.master_music_bus))
		_clear_sample_preview_fx_from_bus(str(playback_profile.fx_bus))
	if chart == null or playback_profile == null or not playback_profile.sample_preview_enabled or not playback_profile.sample_preview_fx_enabled:
		return
	var fx := _dictionary_or_empty(chart.performance_settings.get("fx", {}))
	if fx.is_empty():
		return
	var bus_name := _sample_preview_fx_bus()
	var bus_index := AudioServer.get_bus_index(bus_name)
	if bus_index < 0:
		return
	var source: Dictionary = _dictionary_or_empty(fx.get("source", {}))
	if _fx_source_is_bypassed(source):
		return
	var dry_gain := clamp(float(fx.get("dry_gain", 1.0)), 0.001, 2.0)
	_apply_fx_tone(bus_name, _dictionary_or_empty(fx.get("tone", {})))
	_apply_fx_delay(bus_name, _dictionary_or_empty(fx.get("delay", {})), dry_gain)
	_apply_fx_chorus(bus_name, _dictionary_or_empty(fx.get("chorus", {})), dry_gain)
	_apply_fx_flanger(bus_name, _dictionary_or_empty(fx.get("flanger", {})), dry_gain)
	_apply_fx_reverb(bus_name, _dictionary_or_empty(fx.get("reverb", {})), dry_gain)


func _clear_sample_preview_fx_from_bus(bus_name: String) -> void:
	var bus_index := AudioServer.get_bus_index(_safe_bus_name(bus_name))
	if bus_index < 0:
		return
	for effect_index in range(AudioServer.get_bus_effect_count(bus_index) - 1, -1, -1):
		var effect := AudioServer.get_bus_effect(bus_index, effect_index)
		if effect == null:
			continue
		if str(effect.resource_name).begins_with("PocketChordsmith_"):
			AudioServer.remove_bus_effect(bus_index, effect_index)


func _sample_preview_fx_bus() -> String:
	if playback_profile == null:
		return ""
	var fx_preferred := str(playback_profile.fx_bus)
	if AudioServer.get_bus_index(fx_preferred) >= 0:
		return fx_preferred
	return ""


func _fx_source_is_bypassed(source: Dictionary) -> bool:
	return float(source.get("delay", 0.0)) <= 0.001 and float(source.get("chorus", 0.0)) <= 0.001 and float(source.get("flanger", 0.0)) <= 0.001 and float(source.get("reverb", 0.0)) <= 0.001 and float(source.get("mix", 0.0)) <= 0.001


func _apply_fx_tone(bus_name: String, tone: Dictionary) -> void:
	var gain := clamp(float(tone.get("gain", 0.0)), -12.0, 12.0)
	var eq := _find_or_create_effect(bus_name, "eq10") as AudioEffectEQ10
	if eq == null:
		return
	for band in range(eq.get_band_count()):
		eq.set_band_gain_db(band, 0.0)
	eq.set_band_gain_db(6, gain * 0.55)
	eq.set_band_gain_db(7, gain)
	eq.set_band_gain_db(8, gain * 0.65)


func _apply_fx_delay(bus_name: String, delay: Dictionary, dry_gain: float) -> void:
	var mix := clamp(float(delay.get("mix", 0.0)), 0.0, 1.0)
	var effect := _find_or_create_effect(bus_name, "delay")
	if effect == null:
		return
	_set_effect_property_if_present(effect, "dry", dry_gain)
	_set_effect_property_if_present(effect, "tap1_active", mix > 0.001)
	_set_effect_property_if_present(effect, "tap1_delay_ms", max(1.0, float(delay.get("time", 0.1)) * 1000.0))
	_set_effect_property_if_present(effect, "tap1_level_db", _linear_to_db_safe(mix))
	_set_effect_property_if_present(effect, "feedback_active", mix > 0.001)
	_set_effect_property_if_present(effect, "feedback_delay_ms", max(1.0, float(delay.get("time", 0.1)) * 1000.0))
	_set_effect_property_if_present(effect, "feedback_level_db", _linear_to_db_safe(clamp(float(delay.get("feedback", 0.05)) * mix, 0.0, 1.0)))
	_set_effect_property_if_present(effect, "feedback_lowpass", 7200.0)


func _apply_fx_chorus(bus_name: String, chorus: Dictionary, dry_gain: float) -> void:
	var mix := clamp(float(chorus.get("mix", 0.0)), 0.0, 1.0)
	var effect := _find_or_create_effect(bus_name, "chorus")
	if effect == null:
		return
	_set_effect_property_if_present(effect, "voice_count", 2)
	_set_effect_property_if_present(effect, "dry", dry_gain)
	_set_effect_property_if_present(effect, "wet", mix)
	_set_effect_property_if_present(effect, "voice/1/delay_ms", 16.0)
	_set_effect_property_if_present(effect, "voice/1/rate_hz", max(0.01, float(chorus.get("rate", 0.25))))
	_set_effect_property_if_present(effect, "voice/1/depth_ms", max(0.1, float(chorus.get("depth", 0.0014)) * 1000.0))
	_set_effect_property_if_present(effect, "voice/1/level_db", _linear_to_db_safe(mix))
	_set_effect_property_if_present(effect, "voice/1/pan", -0.35)
	_set_effect_property_if_present(effect, "voice/2/delay_ms", 20.0)
	_set_effect_property_if_present(effect, "voice/2/rate_hz", max(0.01, float(chorus.get("rate", 0.25)) * 0.83))
	_set_effect_property_if_present(effect, "voice/2/depth_ms", max(0.1, float(chorus.get("depth", 0.0014)) * 820.0))
	_set_effect_property_if_present(effect, "voice/2/level_db", _linear_to_db_safe(mix * 0.72))
	_set_effect_property_if_present(effect, "voice/2/pan", 0.35)


func _apply_fx_flanger(bus_name: String, flanger: Dictionary, dry_gain: float) -> void:
	var mix := clamp(float(flanger.get("mix", 0.0)), 0.0, 1.0)
	var effect := _find_or_create_effect(bus_name, "flanger")
	if effect == null:
		return
	_set_effect_property_if_present(effect, "voice_count", 1)
	_set_effect_property_if_present(effect, "dry", dry_gain)
	_set_effect_property_if_present(effect, "wet", mix)
	_set_effect_property_if_present(effect, "voice/1/delay_ms", 3.0)
	_set_effect_property_if_present(effect, "voice/1/rate_hz", max(0.01, float(flanger.get("rate", 0.1))))
	_set_effect_property_if_present(effect, "voice/1/depth_ms", max(0.05, float(flanger.get("depth", 0.0007)) * 1000.0))
	_set_effect_property_if_present(effect, "voice/1/level_db", _linear_to_db_safe(mix))
	_set_effect_property_if_present(effect, "voice/1/cutoff_hz", 8000.0)
	_set_effect_property_if_present(effect, "voice/1/pan", 0.0)


func _apply_fx_reverb(bus_name: String, reverb: Dictionary, dry_gain: float) -> void:
	var mix := clamp(float(reverb.get("mix", 0.0)), 0.0, 1.0)
	var effect := _find_or_create_effect(bus_name, "reverb")
	if effect == null:
		return
	_set_effect_property_if_present(effect, "dry", dry_gain)
	_set_effect_property_if_present(effect, "wet", mix)
	_set_effect_property_if_present(effect, "room_size", clamp(0.28 + mix * 0.62, 0.0, 1.0))
	_set_effect_property_if_present(effect, "damping", 0.42)
	_set_effect_property_if_present(effect, "spread", 0.78)
	_set_effect_property_if_present(effect, "predelay_msec", 18.0)
	_set_effect_property_if_present(effect, "predelay_feedback", 0.08)


func _linear_to_db_safe(value: float, silence_db := -80.0) -> float:
	if value <= 0.0001:
		return silence_db
	return linear_to_db(value)


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
	if _should_force_web_stream_for_tonal_bus(safe_bus):
		_set_player_playback_type(player, AudioServer.PLAYBACK_TYPE_STREAM)
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


func _bus_for_sample_preview_event(layer_name: String, event: Dictionary) -> String:
	var base_bus := _bus_for_layer(layer_name)
	if playback_profile == null or not playback_profile.sample_preview_pan_buses_enabled:
		return base_bus
	if str(event.get("track_type", "")) != "melody":
		return base_bus
	var pan := clamp(float(event.get("pan", 0.0)), -1.0, 1.0)
	if abs(pan) <= 0.001:
		return base_bus
	return _sample_preview_pan_bus(base_bus, pan)


func _sample_preview_pan_bus(base_bus: String, pan: float) -> String:
	var safe_base := _safe_bus_name(base_bus)
	var rounded_pan := snappedf(clamp(pan, -1.0, 1.0), 0.01)
	var key := "%s:%0.2f" % [safe_base, rounded_pan]
	if _sample_preview_pan_buses.has(key):
		return str(_sample_preview_pan_buses[key])
	var suffix := "C"
	if rounded_pan < 0.0:
		suffix = "L%02d" % int(round(abs(rounded_pan) * 100.0))
	elif rounded_pan > 0.0:
		suffix = "R%02d" % int(round(abs(rounded_pan) * 100.0))
	var bus_name := "%s_Pan_%s" % [safe_base, suffix]
	var bus_index := AudioServer.get_bus_index(bus_name)
	if bus_index == -1:
		AudioServer.add_bus(AudioServer.get_bus_count())
		bus_index = AudioServer.get_bus_count() - 1
		AudioServer.set_bus_name(bus_index, bus_name)
		AudioServer.set_bus_send(bus_index, safe_base)
		var panner := AudioEffectPanner.new()
		_set_effect_property_if_present(panner, "pan", rounded_pan)
		AudioServer.add_bus_effect(bus_index, panner, 0)
		_sample_preview_created_pan_buses[bus_name] = true
	else:
		var panner := _find_or_create_effect(bus_name, "panner")
		if panner != null:
			_set_effect_property_if_present(panner, "pan", rounded_pan)
	_sample_preview_pan_buses[key] = bus_name
	return bus_name


func _remove_sample_preview_pan_buses() -> void:
	for bus_name_value in _sample_preview_created_pan_buses.keys():
		var bus_name := str(bus_name_value)
		var bus_index := AudioServer.get_bus_index(bus_name)
		if bus_index >= 0:
			AudioServer.remove_bus(bus_index)
	_sample_preview_pan_buses.clear()
	_sample_preview_created_pan_buses.clear()


func _restore_sample_preview_bus_volumes() -> void:
	for bus_name_value in _base_bus_volumes.keys():
		var bus_name := str(bus_name_value)
		var bus_index := AudioServer.get_bus_index(bus_name)
		if bus_index >= 0:
			AudioServer.set_bus_volume_db(bus_index, float(_base_bus_volumes[bus_name]))


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
	var wanted_resource_name := "PocketChordsmith_%s" % wanted
	for effect_index in range(AudioServer.get_bus_effect_count(bus_index)):
		var effect := AudioServer.get_bus_effect(bus_index, effect_index)
		if effect != null and str(effect.resource_name) == wanted_resource_name:
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
		"chorus", "mod":
			effect = AudioEffectChorus.new()
		"flanger":
			effect = AudioEffectChorus.new()
		"compressor", "ducking":
			effect = AudioEffectCompressor.new()
		"distortion", "drive":
			effect = AudioEffectDistortion.new()
		"eq10", "cab":
			effect = AudioEffectEQ10.new()
		"limiter":
			effect = AudioEffectLimiter.new()
		"panner", "pan":
			effect = AudioEffectPanner.new()
	if effect != null:
		effect.resource_name = wanted_resource_name
		AudioServer.add_bus_effect(bus_index, effect, AudioServer.get_bus_effect_count(bus_index))
	return effect


func _ensure_guitar_preview_effects() -> void:
	if playback_profile == null or not playback_profile.guitar_preview_effects_enabled:
		return
	var guitar_bus := str(playback_profile.guitar_bus)
	var bus_index := AudioServer.get_bus_index(guitar_bus)
	if bus_index < 0:
		return
	if _bus_has_effect(bus_index, "AudioEffectDistortion"):
		return
	var highpass := AudioEffectHighPassFilter.new()
	_set_effect_property_if_present(highpass, "cutoff_hz", 90.0)
	_set_effect_property_if_present(highpass, "resonance", 0.18)
	AudioServer.add_bus_effect(bus_index, highpass, AudioServer.get_bus_effect_count(bus_index))
	var distortion := AudioEffectDistortion.new()
	_set_effect_property_if_present(distortion, "mode", AudioEffectDistortion.MODE_ATAN)
	_set_effect_property_if_present(distortion, "pre_gain", 3.0)
	_set_effect_property_if_present(distortion, "keep_hf_hz", 3600.0)
	_set_effect_property_if_present(distortion, "drive", 0.42)
	_set_effect_property_if_present(distortion, "post_gain", -8.0)
	AudioServer.add_bus_effect(bus_index, distortion, AudioServer.get_bus_effect_count(bus_index))
	var eq := AudioEffectEQ10.new()
	var gains := [-18.0, -9.0, -4.0, 1.0, 0.0, 1.8, 1.2, -2.5, -8.0, -18.0]
	for band in range(min(eq.get_band_count(), gains.size())):
		eq.set_band_gain_db(band, gains[band])
	AudioServer.add_bus_effect(bus_index, eq, AudioServer.get_bus_effect_count(bus_index))
	var lowpass := AudioEffectLowPassFilter.new()
	_set_effect_property_if_present(lowpass, "cutoff_hz", 5200.0)
	_set_effect_property_if_present(lowpass, "resonance", 0.12)
	AudioServer.add_bus_effect(bus_index, lowpass, AudioServer.get_bus_effect_count(bus_index))
	var limiter := AudioEffectLimiter.new()
	_set_effect_property_if_present(limiter, "ceiling_db", -1.2)
	_set_effect_property_if_present(limiter, "soft_clip_db", 2.0)
	_set_effect_property_if_present(limiter, "soft_clip_ratio", 8.0)
	AudioServer.add_bus_effect(bus_index, limiter, AudioServer.get_bus_effect_count(bus_index))


func _bus_has_effect(bus_index: int, effect_class: String) -> bool:
	for effect_index in range(AudioServer.get_bus_effect_count(bus_index)):
		var effect := AudioServer.get_bus_effect(bus_index, effect_index)
		if effect != null and effect.get_class() == effect_class:
			return true
	return false


func _set_effect_property_if_present(effect: AudioEffect, property_name: String, value) -> void:
	for property in effect.get_property_list():
		if str(property.get("name", "")) == property_name:
			effect.set(property_name, value)
			return


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
	if playback_profile == null:
		return
	if playback_profile.playback_backend == PlaybackProfile.PlaybackBackend.PROCEDURAL_PREVIEW:
		return
	_setup_native_audio_players()
	var stem_map := _stem_map_for_current_state()
	if stem_map.is_empty():
		return
	if not playback_profile.use_audio_stream_synchronized:
		_prepare_layer_stem_players(stem_map)
		return
	_stop_layer_stem_players()
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


func _prepare_layer_stem_players(stem_map: Dictionary) -> void:
	if is_instance_valid(_stem_player):
		_stem_player.stop()
		_stem_player.stream = null
	var active_layers := {}
	var layers := stem_map.keys()
	layers.sort()
	for layer_value in layers:
		var layer_name := normalize_layer_name(str(layer_value))
		var stream := _load_audio_stream(stem_map[layer_name])
		if stream == null:
			continue
		var player := _stem_player_for_layer(layer_name)
		player.stream = stream
		player.bus = _bus_for_layer(layer_name)
		player.volume_db = -80.0 if bool(_layer_mutes.get(layer_name, false)) else float(_layer_volumes.get(layer_name, _stem_volumes.get(layer_name, 0.0)))
		active_layers[layer_name] = true
	for existing_layer in _stem_layer_players.keys():
		if active_layers.has(str(existing_layer)):
			continue
		var stale_player := _stem_layer_players[existing_layer] as AudioStreamPlayer
		if is_instance_valid(stale_player):
			stale_player.stop()
			stale_player.stream = null


func _stem_player_for_layer(layer_name: String) -> AudioStreamPlayer:
	var key := layer_name.strip_edges()
	if key.is_empty():
		key = "music"
	if _stem_layer_players.has(key):
		var existing := _stem_layer_players[key] as AudioStreamPlayer
		if is_instance_valid(existing):
			return existing
	var player := AudioStreamPlayer.new()
	player.name = "ChordsmithStem_%s" % key.replace(" ", "_")
	player.bus = _bus_for_layer(key)
	add_child(player)
	_stem_layer_players[key] = player
	return player


func _start_native_stems_from_current_tick() -> void:
	if chart == null:
		return
	if playback_profile != null and playback_profile.playback_backend == PlaybackProfile.PlaybackBackend.PROCEDURAL_PREVIEW:
		return
	var offset_seconds: float = float(current_tick) * float(chart.get_seconds_per_tick())
	if _has_ready_stem_players():
		for player_value in _stem_layer_players.values():
			var player := player_value as AudioStreamPlayer
			if is_instance_valid(player) and player.stream != null:
				player.play(offset_seconds)
		return
	if _stem_player != null and _stem_player.stream != null:
		_stem_player.play(offset_seconds)


func _stem_map_for_current_state() -> Dictionary:
	if playback_profile == null:
		return {}
	if not current_music_state.is_empty():
		var state_map := _state_stem_map(current_music_state)
		if not state_map.is_empty():
			return state_map
	var section_map := _section_stem_map(current_section)
	if not section_map.is_empty():
		return section_map
	if not current_music_state.is_empty() and playback_profile.stem_sets.has(current_music_state) and playback_profile.stem_sets[current_music_state] is Dictionary:
		return _normalize_stem_map(playback_profile.stem_sets[current_music_state])
	if not playback_profile.stem_paths.is_empty():
		return _normalize_stem_map(playback_profile.stem_paths)
	if chart != null and not current_music_state.is_empty() and chart.stem_sets.has(current_music_state) and chart.stem_sets[current_music_state] is Dictionary:
		return _normalize_stem_map(chart.stem_sets[current_music_state])
	return {}


func _state_stem_map(state_name: String) -> Dictionary:
	if playback_profile == null or state_name.is_empty():
		return {}
	if playback_profile.has_method("get_state_stems"):
		var state_map = playback_profile.call("get_state_stems", state_name)
		if state_map is Dictionary and not (state_map as Dictionary).is_empty():
			return _normalize_stem_map(state_map)
	if playback_profile.state_stem_sets.has(state_name):
		var value = playback_profile.state_stem_sets[state_name]
		if value is Dictionary:
			return _normalize_stem_map(value)
		if value is String and playback_profile.stem_sets.has(str(value)) and playback_profile.stem_sets[str(value)] is Dictionary:
			return _normalize_stem_map(playback_profile.stem_sets[str(value)])
	return {}


func _section_stem_map(section_id: String) -> Dictionary:
	if playback_profile == null:
		return {}
	var canonical := _canonical_section_id(section_id)
	if canonical.is_empty():
		return {}
	if playback_profile.has_method("get_section_stems"):
		var section_map = playback_profile.call("get_section_stems", canonical)
		if section_map is Dictionary and not (section_map as Dictionary).is_empty():
			return _normalize_stem_map(section_map)
	if _profile_has_property("section_stem_sets"):
		var sets: Dictionary = playback_profile.section_stem_sets
		if sets.has(canonical) and sets[canonical] is Dictionary:
			return _normalize_stem_map(sets[canonical])
	if not _warned_missing_stem_sections.has(canonical) and _profile_has_property("section_stem_sets") and not playback_profile.section_stem_sets.is_empty():
		_warned_missing_stem_sections[canonical] = true
		push_warning("PocketChordsmithConductor has no prepared stems for section '%s'; falling back to state or full-song stems." % canonical)
	return {}


func _normalize_stem_map(stem_map: Dictionary) -> Dictionary:
	var out := {}
	for key in stem_map.keys():
		var normalized := normalize_layer_name(str(key))
		if not normalized.is_empty():
			out[normalized] = stem_map[key]
	return out


func _canonical_section_id(section_id: String) -> String:
	if playback_profile != null and playback_profile.has_method("canonical_section_id"):
		return str(playback_profile.call("canonical_section_id", section_id))
	var normalized := section_id.strip_edges().to_upper()
	if normalized.length() == 1:
		return normalized
	for index in range(normalized.length()):
		var letter := normalized.substr(index, 1)
		if letter >= "A" and letter <= "H":
			return letter
	return ""


func _profile_has_property(property_name: String) -> bool:
	if playback_profile == null:
		return false
	for property in playback_profile.get_property_list():
		if str(property.get("name", "")) == property_name:
			return true
	return false


func _load_audio_stream(value, prefer_uncompressed_wav := false) -> AudioStream:
	if value is AudioStream:
		return value
	if value is String:
		var path := str(value)
		var file_path := ProjectSettings.globalize_path(path)
		if not ResourceLoader.exists(path) and not FileAccess.file_exists(file_path):
			return null
		var cache_key := _audio_cache_key(path, prefer_uncompressed_wav)
		if _audio_stream_cache.has(cache_key):
			return _audio_stream_cache[cache_key]
		var should_load_wav_directly: bool = path.get_extension().to_lower() == "wav" and (
			(prefer_uncompressed_wav and playback_profile != null and playback_profile.sample_preview_load_wavs_uncompressed)
			or path.begins_with("user://")
			or not ResourceLoader.exists(path)
		)
		if should_load_wav_directly:
			var wav_stream := AudioStreamWAV.load_from_file(path, {"compress/mode": 0})
			if wav_stream != null:
				_audio_stream_cache[cache_key] = wav_stream
				return wav_stream
		var resource := load(path)
		if resource is AudioStream:
			_audio_stream_cache[cache_key] = resource
			return resource
		return null
	return null


func _audio_cache_key(path: String, prefer_uncompressed_wav := false) -> String:
	var wants_raw_wav: bool = prefer_uncompressed_wav and playback_profile != null and playback_profile.sample_preview_load_wavs_uncompressed and path.get_extension().to_lower() == "wav"
	return "%s:%s" % ["wav_raw" if wants_raw_wav else "resource", path]


func _audio_prewarm_signature(include_stems := false, include_native_preview := false) -> String:
	if playback_profile == null:
		return ""
	var parts := [
		str(include_stems),
		str(include_native_preview),
		str(playback_profile.sample_preview_load_wavs_uncompressed),
	]
	_append_audio_prewarm_map_signature(parts, playback_profile.drum_kit, true)
	_append_audio_prewarm_map_signature(parts, playback_profile.event_sample_streams, true)
	_append_audio_prewarm_map_signature(parts, playback_profile.accent_streams, true)
	if include_stems:
		for stem_map in _all_stem_maps_for_prewarm():
			_append_audio_prewarm_map_signature(parts, stem_map, false)
	return "|".join(parts)


func _all_stem_maps_for_prewarm() -> Array[Dictionary]:
	var maps: Array[Dictionary] = []
	if playback_profile == null:
		return maps
	if not playback_profile.stem_paths.is_empty():
		maps.append(_normalize_stem_map(playback_profile.stem_paths))
	for key in playback_profile.stem_sets.keys():
		if playback_profile.stem_sets[key] is Dictionary:
			maps.append(_normalize_stem_map(playback_profile.stem_sets[key]))
	if _profile_has_property("section_stem_sets"):
		for key in playback_profile.section_stem_sets.keys():
			if playback_profile.section_stem_sets[key] is Dictionary:
				maps.append(_normalize_stem_map(playback_profile.section_stem_sets[key]))
	for key in playback_profile.state_stem_sets.keys():
		var state_map := _state_stem_map(str(key))
		if not state_map.is_empty():
			maps.append(state_map)
	var active_map := _stem_map_for_current_state()
	if not active_map.is_empty():
		maps.append(active_map)
	return maps


func _all_audio_asset_values() -> Array:
	var values := []
	if playback_profile == null:
		return values
	values.append_array(playback_profile.drum_kit.values())
	values.append_array(playback_profile.event_sample_streams.values())
	values.append_array(playback_profile.accent_streams.values())
	values.append_array(playback_profile.marker_stingers.values())
	for stem_map in _all_stem_maps_for_prewarm():
		values.append_array(stem_map.values())
	return values


func _append_audio_prewarm_map_signature(parts: Array, stream_map: Dictionary, prefer_uncompressed_wav := false) -> void:
	var values: Array[String] = []
	for value in stream_map.values():
		if value is String:
			values.append(_audio_cache_key(str(value), prefer_uncompressed_wav))
		elif value is AudioStream:
			values.append("stream:%s" % str(value.get_instance_id()))
	values.sort()
	parts.append(",".join(values))


func _prewarm_audio_dictionary(stream_map: Dictionary, seen: Dictionary, report: Dictionary, prefer_uncompressed_wav := false) -> void:
	for value in stream_map.values():
		_prewarm_audio_value(value, seen, report, prefer_uncompressed_wav)


func _prewarm_audio_value(value, seen: Dictionary, report: Dictionary, prefer_uncompressed_wav := false) -> void:
	if value is AudioStream:
		report["loaded"] = int(report["loaded"]) + 1
		return
	if not (value is String):
		return
	var path := str(value)
	if path.is_empty():
		return
	var key := _audio_cache_key(path, prefer_uncompressed_wav)
	if seen.has(key):
		return
	seen[key] = true
	var stream := _load_audio_stream(path, prefer_uncompressed_wav)
	if stream != null:
		report["loaded"] = int(report["loaded"]) + 1
	else:
		report["failed"] = int(report["failed"]) + 1
		report["warnings"].append("Pocket Chordsmith could not prewarm audio stream: %s" % path)


func _stop_native_stems() -> void:
	if is_instance_valid(_stem_player):
		_stem_player.stop()
	_stop_layer_stem_players()


func _stop_layer_stem_players() -> void:
	for player_value in _stem_layer_players.values():
		var player := player_value as AudioStreamPlayer
		if is_instance_valid(player):
			player.stop()


func _has_ready_stem_players() -> bool:
	for player_value in _stem_layer_players.values():
		var player := player_value as AudioStreamPlayer
		if is_instance_valid(player) and player.stream != null:
			return true
	return false


func _has_playing_stem_players() -> bool:
	for player_value in _stem_layer_players.values():
		var player := player_value as AudioStreamPlayer
		if is_instance_valid(player) and player.playing:
			return true
	return false


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
	var stream := _load_audio_stream(playback_profile.accent_streams.get(name, null), true)
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


func _play_polyphonic_sample(stream: AudioStream, bus_name: String, sample_name: String, volume_db := 0.0, pitch_scale := 1.0, playback_type := AudioServer.PLAYBACK_TYPE_DEFAULT, debug_info := {}) -> int:
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
	var player := _polyphonic_players.get(safe_bus, null) as AudioStreamPlayer
	var player_playback_type := _player_playback_type(player)
	_log_pitched_sample_event(debug_info, sample_name, safe_bus, player_playback_type, playback_type)
	var stream_id := playback.play_stream(stream, 0.0, volume_db, max(0.05, pitch_scale), playback_type, StringName(safe_bus))
	if stream_id >= 0:
		_active_sample_ids[_stream_key(safe_bus, stream_id)] = {"id": stream_id, "bus": safe_bus, "name": sample_name}
	else:
		_sample_play_failures_total += 1
	return stream_id


func _schedule_sample_preview_slide(bus_name: String, stream_id: int, event: Dictionary, start_pitch_scale: float) -> void:
	if chart == null or playback_profile == null or not is_inside_tree():
		return
	var flags: Dictionary = event.get("flags", {})
	if not bool(flags.get("slide", false)):
		return
	var target_midi := int(flags.get("slide_midi", -1))
	if target_midi < 0:
		return
	var track_type := str(event.get("track_type", ""))
	var root_note := _sample_root_note_for_track(track_type)
	var target_pitch_scale: float = pow(2.0, float(target_midi - root_note) / 12.0)
	var slide_offset_ticks: int = max(0, int(flags.get("slide_offset_ticks", 0)))
	var duration_ticks: int = max(slide_offset_ticks + 1, int(event.get("duration_ticks", 1)))
	var slide_ticks: int = max(1, duration_ticks - slide_offset_ticks)
	var seconds_per_tick: float = chart.get_seconds_per_tick()
	var slide_start_seconds: float = float(slide_offset_ticks) * seconds_per_tick
	var slide_duration_seconds: float = float(slide_ticks) * seconds_per_tick
	var steps: int = max(1, int(playback_profile.sample_preview_slide_steps))
	for step in range(1, steps + 1):
		var ratio: float = float(step) / float(steps)
		var delay_seconds: float = slide_start_seconds + slide_duration_seconds * ratio
		var pitch_scale: float = lerp(start_pitch_scale, target_pitch_scale, ratio)
		var generation := _pending_timer_generation
		get_tree().create_timer(delay_seconds, true).timeout.connect(func() -> void:
			if generation == _pending_timer_generation:
				_set_polyphonic_sample_pitch(bus_name, stream_id, pitch_scale)
		)


func _set_polyphonic_sample_pitch(bus_name: String, stream_id: int, pitch_scale: float) -> void:
	var safe_bus := _safe_bus_name(bus_name)
	var playback := _polyphonic_playbacks.get(safe_bus, null) as AudioStreamPlaybackPolyphonic
	if playback == null or not playback.is_stream_playing(stream_id):
		return
	playback.set_stream_pitch_scale(stream_id, max(0.05, pitch_scale))


func _trigger_sample_preview_sidechain() -> void:
	if chart == null or playback_profile == null or not is_inside_tree():
		return
	var sidechain: Dictionary = _dictionary_or_empty(chart.performance_settings.get("sidechain", {}))
	if not bool(sidechain.get("enabled", false)):
		return
	var chords_bus := str(playback_profile.chords_bus)
	var bus_index := AudioServer.get_bus_index(chords_bus)
	if bus_index < 0:
		return
	if not _base_bus_volumes.has(chords_bus):
		_base_bus_volumes[chords_bus] = AudioServer.get_bus_volume_db(bus_index)
	var base_db := float(_base_bus_volumes[chords_bus])
	var amount := clamp(float(sidechain.get("amount", 0.45)), 0.0, 1.0)
	var depth := clamp(float(sidechain.get("depth", 0.72)), 0.0, 1.0)
	var floor_gain := clamp(float(sidechain.get("floor", 0.18)), 0.0001, 1.0)
	var duck_gain := max(floor_gain, 1.0 - amount * depth)
	var attack := max(0.001, float(sidechain.get("attack_seconds", 0.012)))
	var release := max(attack, float(sidechain.get("release_seconds", 0.22)))
	_sidechain_generation += 1
	var generation := _sidechain_generation
	_set_bus_volume_smooth(chords_bus, base_db + linear_to_db(duck_gain), attack)
	get_tree().create_timer(attack, true).timeout.connect(func() -> void:
		if generation == _sidechain_generation and _playing and not _paused:
			_set_bus_volume_smooth(chords_bus, base_db, max(0.001, release - attack))
	)


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
	var sound := str(event.get("sound", flags.get("sound", "")))
	if not sound.is_empty():
		var sound_key := _preview_sample_key_for_sound(track_type, sound)
		if not sound_key.is_empty():
			return sound_key
	var accent := bool(flags.get("accent", false))
	if track_type == "drum":
		var drum_candidates := _drum_sample_key_candidates(instrument_id, flags, accent)
		for sample_key in drum_candidates:
			if playback_profile != null and playback_profile.drum_kit.has(sample_key):
				return sample_key
		return str(drum_candidates[0])
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
		var chord_instrument := str(flags.get("chord_instrument", "pocket"))
		var chord_key := "chord:%s" % chord_instrument
		if playback_profile != null and playback_profile.event_sample_streams.has(chord_key):
			return chord_key
		if playback_profile != null and playback_profile.event_sample_streams.has("chord:tone"):
			return "chord:tone"
		return "chord"
	if track_type == "guitar":
		var tone := str(flags.get("tone", ""))
		if not tone.is_empty():
			var tone_guitar_key := "guitar:%s:%s" % [tone, instrument_id]
			if playback_profile != null and playback_profile.event_sample_streams.has(tone_guitar_key):
				return tone_guitar_key
		var guitar_key := "guitar:%s" % instrument_id
		if playback_profile != null and playback_profile.event_sample_streams.has(guitar_key):
			return guitar_key
		if playback_profile != null and playback_profile.event_sample_streams.has("guitar"):
			return "guitar"
		if playback_profile != null and playback_profile.event_sample_streams.has("chord:tone"):
			return "chord:tone"
		return "chord"
	if track_type == "melody":
		var melody_key := "melody:%s" % instrument_id
		if playback_profile != null and playback_profile.event_sample_streams.has(melody_key):
			return melody_key
		return "melody"
	return instrument_id


func _drum_sample_key_candidates(instrument_id: String, flags: Dictionary, accent: bool) -> Array[String]:
	var lane := "open_hat" if instrument_id == "hat" and accent else instrument_id
	var candidates: Array[String] = []
	if str(flags.get("audio_profile", "")) == "lofi_chill":
		var drum_kit := str(flags.get("drum_kit", ""))
		if drum_kit.is_empty() and chart != null:
			drum_kit = str(chart.get("drum_kit"))
		if not drum_kit.is_empty() and drum_kit != "classic":
			candidates.append("%s:%s" % [drum_kit, lane])
			if lane != instrument_id:
				candidates.append("%s:%s" % [drum_kit, instrument_id])
		candidates.append("lofi_%s" % lane)
		if lane != instrument_id:
			candidates.append("lofi_%s" % instrument_id)
	if accent:
		candidates.append("%s_accent" % instrument_id)
	candidates.append(instrument_id)
	if SoundProfileContract.FALLBACK_DRUM_LANES.has(instrument_id):
		var fallback_lane := str(SoundProfileContract.FALLBACK_DRUM_LANES[instrument_id])
		if accent:
			candidates.append("%s_accent" % fallback_lane)
		candidates.append(fallback_lane)
	return candidates


func _preview_sample_key_for_sound(track_type: String, sound: String) -> String:
	var profile_key := "sound:%s" % sound
	if playback_profile != null and playback_profile.event_sample_streams.has(profile_key):
		return profile_key
	var alias := str(SoundProfileContract.PREVIEW_SAMPLE_KEYS.get(sound, ""))
	if alias.is_empty():
		return ""
	var candidate := alias
	if playback_profile != null and playback_profile.event_sample_streams.has(candidate):
		return candidate
	if playback_profile != null and playback_profile.event_sample_streams.has(alias):
		return alias
	return candidate if not candidate.is_empty() else alias


func _sample_preview_layer_for_event(event: Dictionary) -> String:
	match str(event.get("track_type", "")):
		"drum":
			return "drums"
		"bass":
			return "bass"
		"chord":
			return "chords"
		"guitar":
			return "guitar"
		"melody":
			return "melody"
		_:
			return "stingers"


func _sample_pitch_scale_for_event(event: Dictionary) -> float:
	var track_type := str(event.get("track_type", ""))
	# Drum WAVs are already rendered at their intended pitch; MIDI notes are metadata for cues/export.
	if track_type == "drum":
		return 1.0
	var midi_note := int(event.get("midi_note", -1))
	if midi_note < 0:
		return 1.0
	var root_note := _sample_root_note_for_track(track_type)
	return pow(2.0, float(midi_note - root_note) / 12.0)


func _sample_root_note_for_track(track_type: String) -> int:
	match track_type:
		"bass":
			return 36
		"guitar":
			return 40
		_:
			return 60
	return 60


func _native_bass_stream_for_event(event: Dictionary, allow_build := true) -> AudioStream:
	if chart == null:
		return null
	_sync_native_preview_cache_signature()
	var midi_note := int(event.get("midi_note", -1))
	if midi_note < 0:
		return null
	var flags: Dictionary = _dictionary_or_empty(event.get("flags", {}))
	var tone := str(flags.get("bass_tone", chart.get("bass_tone") if chart != null else "classic"))
	var duration_ticks := max(1, int(event.get("duration_ticks", 1)))
	var slide_midi := int(flags.get("slide_midi", -1)) if bool(flags.get("slide", false)) else -1
	var slide_offset_ticks := max(0, int(flags.get("slide_offset_ticks", 0)))
	var accent := bool(flags.get("accent", false))
	var cache_key := "%s:%d:%d:%d:%d:%s:%s" % [_last_native_cache_signature, midi_note, duration_ticks, slide_midi, slide_offset_ticks, tone, str(accent)]
	if _native_bass_stream_cache.has(cache_key):
		return _native_bass_stream_cache[cache_key]
	if not allow_build:
		return null
	var stream := _build_native_bass_stream(midi_note, duration_ticks, slide_midi, slide_offset_ticks, tone, accent)
	if stream == null:
		return null
	var cache_limit := max(0, int(playback_profile.sample_preview_native_bass_cache_limit))
	if cache_limit > 0:
		while _native_bass_stream_cache.size() >= cache_limit:
			_native_bass_stream_cache.erase(_native_bass_stream_cache.keys()[0])
		_native_bass_stream_cache[cache_key] = stream
	return stream


func _build_native_bass_stream(midi_note: int, duration_ticks: int, slide_midi: int, slide_offset_ticks: int, tone: String, accent: bool) -> AudioStreamWAV:
	var seconds_per_tick: float = chart.get_seconds_per_tick() if chart != null else 0.01
	var note_seconds := max(0.08, float(duration_ticks) * seconds_per_tick)
	var cfg := _native_bass_tone_config(tone)
	var main_duration: float = note_seconds * (1.35 if accent else 1.0)
	var stream_seconds := max(main_duration + 0.25, note_seconds + 0.25)
	var frame_count := max(1, int(ceil(stream_seconds * float(NATIVE_BASS_SAMPLE_RATE))))
	var samples := PackedFloat32Array()
	samples.resize(frame_count)
	var attack := float(cfg.get("attack", 0.01))
	_mix_native_bass_voice(samples, midi_note, slide_midi, slide_offset_ticks, seconds_per_tick, note_seconds, main_duration, str(cfg["main_wave"]), float(cfg["main_peak"]) * (1.12 if accent else 1.0), float(cfg["cutoff"]) * (1.18 if accent else 1.0), attack)
	_mix_native_bass_voice(samples, midi_note - 12, slide_midi - 12 if slide_midi >= 0 else -1, slide_offset_ticks, seconds_per_tick, note_seconds, note_seconds * 0.82, str(cfg["sub_wave"]), float(cfg["sub_peak"]), float(cfg["sub_cutoff"]), attack)
	return _audio_stream_wav_from_mono_samples(samples)


func _native_melody_stream_for_event(event: Dictionary, allow_build := true) -> AudioStream:
	if chart == null:
		return null
	_sync_native_preview_cache_signature()
	var midi_note := int(event.get("midi_note", -1))
	if midi_note < 0:
		return null
	var flags: Dictionary = _dictionary_or_empty(event.get("flags", {}))
	var instrument := str(event.get("instrument_id", "pulse"))
	var duration_ticks := max(1, int(event.get("duration_ticks", 1)))
	var slide_midi := int(flags.get("slide_midi", -1)) if bool(flags.get("slide", false)) else -1
	var slide_offset_ticks := max(0, int(flags.get("slide_offset_ticks", 0)))
	var pan := snappedf(clamp(float(event.get("pan", 0.0)), -1.0, 1.0), 0.01)
	var cache_key := "%s:%d:%d:%d:%d:%s:%0.2f" % [_last_native_cache_signature, midi_note, duration_ticks, slide_midi, slide_offset_ticks, instrument, pan]
	if _native_melody_stream_cache.has(cache_key):
		return _native_melody_stream_cache[cache_key]
	if not allow_build:
		return null
	var stream := _build_native_melody_stream(midi_note, duration_ticks, slide_midi, slide_offset_ticks, instrument, pan)
	if stream == null:
		return null
	var cache_limit := max(0, int(playback_profile.sample_preview_native_melody_cache_limit))
	if cache_limit > 0:
		while _native_melody_stream_cache.size() >= cache_limit:
			_native_melody_stream_cache.erase(_native_melody_stream_cache.keys()[0])
		_native_melody_stream_cache[cache_key] = stream
	return stream


func _build_native_melody_stream(midi_note: int, duration_ticks: int, slide_midi: int, slide_offset_ticks: int, instrument: String, pan: float) -> AudioStreamWAV:
	var seconds_per_tick: float = chart.get_seconds_per_tick() if chart != null else 0.01
	var note_seconds: float = max(0.08, float(duration_ticks) * seconds_per_tick)
	var cfg := _native_melody_instrument_config(instrument)
	var main_duration: float = max(0.035, note_seconds * float(cfg.get("dur_mul", 1.0)))
	var stream_seconds: float = main_duration + 0.25
	for extra in _native_melody_extras(instrument):
		var extra_duration := _native_melody_extra_duration(extra, note_seconds)
		stream_seconds = max(stream_seconds, float(extra.get("offset", 0.0)) + extra_duration + 0.22)
	var frame_count := max(1, int(ceil(stream_seconds * float(NATIVE_BASS_SAMPLE_RATE))))
	var mono := PackedFloat32Array()
	mono.resize(frame_count)
	var slide_offset_seconds: float = float(slide_offset_ticks) * seconds_per_tick
	var slide_ramp_end: float = -1.0
	if slide_midi >= 0:
		slide_ramp_end = min(main_duration + 0.19, max(0.02, slide_offset_seconds * float(cfg.get("dur_mul", 1.0))) + 0.08)
	_mix_native_melody_voice(mono, midi_note, slide_midi, slide_ramp_end, 0.0, main_duration, str(cfg.get("wave", "square")), float(cfg.get("peak", 0.2)), str(cfg.get("filter", "lowpass")), float(cfg.get("freq", 2300.0)), 1.0)
	for extra in _native_melody_extras(instrument):
		var offset := float(extra.get("offset", 0.0))
		var extra_duration := _native_melody_extra_duration(extra, note_seconds)
		var extra_slide_midi := slide_midi
		var freq_mul := float(extra.get("freq_mul", 1.0))
		var extra_midi := float(midi_note) + float(extra.get("midi_offset", 0.0))
		var peak := float(extra.get("peak", 0.0))
		var extra_ramp_end := -1.0
		if slide_midi >= 0:
			extra_midi = float(midi_note)
			freq_mul = float(extra.get("slide_freq_mul", freq_mul))
			peak = float(cfg.get("peak", 0.2)) * float(extra.get("peak_scale", 1.0))
			extra_ramp_end = max(0.0001, slide_ramp_end - offset)
		_mix_native_melody_voice(mono, int(round(extra_midi)), extra_slide_midi, extra_ramp_end, offset, extra_duration, str(extra.get("wave", "sine")), peak, str(extra.get("filter", "lowpass")), float(extra.get("freq", 2400.0)), freq_mul)
	return _audio_stream_wav_from_stereo_panned_samples(mono, pan)


func _native_melody_extra_duration(extra: Dictionary, note_seconds: float) -> float:
	var duration := max(0.025, note_seconds * float(extra.get("dur_mul", 1.0)))
	var max_duration := float(extra.get("max_dur", -1.0))
	if max_duration > 0.0:
		duration = min(duration, max_duration)
	return duration


func _mix_native_melody_voice(samples: PackedFloat32Array, start_midi: int, slide_midi: int, slide_ramp_end: float, offset: float, voice_seconds: float, wave: String, peak: float, filter_type: String, filter_freq: float, freq_mul: float) -> void:
	var dt := 1.0 / float(NATIVE_BASS_SAMPLE_RATE)
	var safe_filter := str(filter_type)
	var safe_cutoff := max(1.0, float(filter_freq))
	var rc: float = 1.0 / max(1.0, TAU * safe_cutoff)
	var filter_alpha: float = dt / (rc + dt)
	var low_state := 0.0
	var high_low_state := 0.0
	var start_index := max(0, int(floor(offset * float(NATIVE_BASS_SAMPLE_RATE))))
	var end_index := min(samples.size(), int(ceil((offset + voice_seconds + 0.22) * float(NATIVE_BASS_SAMPLE_RATE))))
	for i in range(start_index, end_index):
		var t := float(i) / float(NATIVE_BASS_SAMPLE_RATE)
		var local := t - offset
		var start_freq := 440.0 * pow(2.0, (float(start_midi) - 69.0) / 12.0) * freq_mul
		var sample: float
		if slide_midi >= 0 and slide_ramp_end > 0.0:
			var target_freq := 440.0 * pow(2.0, (float(slide_midi) - 69.0) / 12.0) * freq_mul
			sample = _native_wave_sample_ramped_at(wave, start_freq, target_freq, slide_ramp_end, local)
		else:
			sample = _native_wave_sample_at(wave, start_freq, local)
		var filtered_sample := sample
		match safe_filter:
			"lowpass":
				low_state += filter_alpha * (sample - low_state)
				filtered_sample = low_state
			"highpass":
				high_low_state += filter_alpha * (sample - high_low_state)
				filtered_sample = sample - high_low_state
			"bandpass":
				high_low_state += filter_alpha * (sample - high_low_state)
				var high_sample := sample - high_low_state
				low_state += filter_alpha * (high_sample - low_state)
				filtered_sample = low_state
		filtered_sample *= _native_filter_factor(safe_filter, start_freq, safe_cutoff)
		filtered_sample *= _native_adsr_gain(local, voice_seconds) * peak
		samples[i] = clamp(samples[i] + filtered_sample, -1.0, 1.0)


func _native_melody_instrument_config(instrument: String) -> Dictionary:
	match instrument:
		"soft":
			return {"wave": "triangle", "peak": 0.16, "filter": "lowpass", "freq": 1700.0, "dur_mul": 1.0}
		"synth":
			return {"wave": "sawtooth", "peak": 0.18, "filter": "lowpass", "freq": 1500.0, "dur_mul": 0.95}
		"bell":
			return {"wave": "sine", "peak": 0.105, "filter": "lowpass", "freq": 2600.0, "dur_mul": 1.05}
		"lead_guitar":
			return {"wave": "sawtooth", "peak": 0.16, "filter": "bandpass", "freq": 1800.0, "dur_mul": 0.92}
		"distorted_lead_guitar":
			return {"wave": "sawtooth", "peak": 0.13, "filter": "lowpass", "freq": 2400.0, "dur_mul": 0.86}
		"banjo":
			return {"wave": "triangle", "peak": 0.13, "filter": "bandpass", "freq": 2100.0, "dur_mul": 0.48}
		"harmonica":
			return {"wave": "square", "peak": 0.115, "filter": "bandpass", "freq": 1250.0, "dur_mul": 1.18}
		"cowboy_whistle":
			return {"wave": "sine", "peak": 0.1, "filter": "lowpass", "freq": 3200.0, "dur_mul": 1.12}
		"trumpet":
			return {"wave": "square", "peak": 0.14, "filter": "bandpass", "freq": 1650.0, "dur_mul": 1.05}
		"saxophone":
			return {"wave": "triangle", "peak": 0.17, "filter": "bandpass", "freq": 940.0, "dur_mul": 1.12}
		"mellow_vibes":
			return {"wave": "sine", "peak": 0.105, "filter": "lowpass", "freq": 2100.0, "dur_mul": 1.15}
		"soft_pluck":
			return {"wave": "triangle", "peak": 0.112, "filter": "lowpass", "freq": 1650.0, "dur_mul": 0.62}
		"mellow_sax":
			return {"wave": "triangle", "peak": 0.118, "filter": "bandpass", "freq": 820.0, "dur_mul": 1.18}
		"muted_trumpet":
			return {"wave": "square", "peak": 0.095, "filter": "bandpass", "freq": 1180.0, "dur_mul": 0.98}
		"tape_bell":
			return {"wave": "sine", "peak": 0.088, "filter": "lowpass", "freq": 1900.0, "dur_mul": 1.04}
		"chip_square_lead":
			return {"wave": "square", "peak": 0.155, "filter": "lowpass", "freq": 4200.0, "dur_mul": 0.88}
		"chip_pulse_lead":
			return {"wave": "square", "peak": 0.135, "filter": "bandpass", "freq": 2400.0, "dur_mul": 0.76}
		"chip_triangle_blip":
			return {"wave": "triangle", "peak": 0.12, "filter": "lowpass", "freq": 3100.0, "dur_mul": 0.54}
		"chip_bell_stack":
			return {"wave": "sine", "peak": 0.108, "filter": "lowpass", "freq": 3900.0, "dur_mul": 1.05}
		"modern_chip_lead":
			return {"wave": "square", "peak": 0.138, "filter": "lowpass", "freq": 3600.0, "dur_mul": 0.86}
		_:
			return {"wave": "square", "peak": 0.2, "filter": "lowpass", "freq": 2300.0, "dur_mul": 1.0}


func _native_melody_extras(instrument: String) -> Array[Dictionary]:
	match instrument:
		"bell":
			return [_native_melody_extra(2.0, -1.0, 0.0, "sine", 0.022, 0.16, "lowpass", 3200.0, 0.012, 0.42)]
		"lead_guitar":
			return [_native_melody_extra(1.006, -1.0, 0.0, "square", 0.035, 0.2, "lowpass", 2600.0, 0.006, 0.72)]
		"distorted_lead_guitar":
			return [_native_melody_extra(0.996, -1.0, 0.0, "square", 0.05, 0.34, "bandpass", 2100.0, 0.004, 0.68)]
		"banjo":
			return [
				_native_melody_extra(2.01, -1.0, 0.0, "triangle", 0.028, 0.18, "highpass", 1500.0, 0.004, 0.38, 0.09),
				_native_melody_extra(0.997, -1.0, 0.0, "square", 0.018, 0.13, "bandpass", 2600.0, 0.012, 0.48, 0.13),
			]
		"harmonica":
			return [
				_native_melody_extra(1.004, -1.0, 0.0, "triangle", 0.035, 0.24, "bandpass", 860.0, 0.006, 0.92),
				_native_melody_extra(2.0, -1.0, 0.0, "square", 0.012, 0.08, "bandpass", 2100.0, 0.014, 0.42),
			]
		"cowboy_whistle":
			return [_native_melody_extra(2.0, -1.0, 0.0, "sine", 0.014, 0.14, "lowpass", 3600.0, 0.01, 0.65)]
		"trumpet":
			return [_native_melody_extra(1.0, 2.0, 12.0, "sawtooth", 0.018, 0.13, "bandpass", 2400.0, 0.008, 0.35)]
		"saxophone":
			return [_native_melody_extra(1.0, 0.5, -12.0, "sine", 0.03, 0.18, "lowpass", 760.0, 0.004, 0.42)]
		"mellow_vibes":
			return [_native_melody_extra(1.0, 2.0, 12.0, "sine", 0.018, 0.17, "lowpass", 2400.0, 0.01, 0.48, 0.18)]
		"soft_pluck":
			return [_native_melody_extra(2.0, -1.0, 0.0, "sine", 0.014, 0.13, "lowpass", 2200.0, 0.004, 0.45, 0.12)]
		"mellow_sax":
			return [_native_melody_extra(1.0, 0.5, -12.0, "sine", 0.018, 0.15, "lowpass", 640.0, 0.004, 0.46)]
		"muted_trumpet":
			return [_native_melody_extra(1.0, 2.0, 12.0, "triangle", 0.012, 0.13, "bandpass", 1700.0, 0.006, 0.28)]
		"tape_bell":
			return [_native_melody_extra(0.997, 1.994, 12.0, "sine", 0.014, 0.16, "lowpass", 2100.0, 0.016, 0.38)]
		"chip_square_lead":
			return [_native_melody_extra(2.0, -1.0, 0.0, "triangle", 0.018, 0.12, "lowpass", 5200.0, 0.004, 0.42, 0.12)]
		"chip_pulse_lead":
			return [_native_melody_extra(1.005, 1.008, 0.0, "square", 0.026, 0.16, "lowpass", 3600.0, 0.006, 0.62)]
		"chip_triangle_blip":
			return [_native_melody_extra(2.0, -1.0, 0.0, "sine", 0.012, 0.1, "lowpass", 4200.0, 0.004, 0.28, 0.08)]
		"chip_bell_stack":
			return [
				_native_melody_extra(2.003, -1.0, 12.0, "sine", 0.024, 0.18, "lowpass", 4800.0, 0.012, 0.5, 0.18),
				_native_melody_extra(3.01, -1.0, 0.0, "triangle", 0.01, 0.08, "highpass", 2100.0, 0.018, 0.38, 0.14),
			]
		"modern_chip_lead":
			return [
				_native_melody_extra(1.997, -1.0, 12.0, "triangle", 0.02, 0.14, "lowpass", 4300.0, 0.005, 0.58, 0.16),
				_native_melody_extra(0.5, -1.0, -12.0, "square", 0.012, 0.09, "lowpass", 1600.0, 0.002, 0.68, 0.18),
			]
	return []


func _native_melody_extra(freq_mul: float, slide_freq_mul: float, midi_offset: float, wave: String, peak: float, peak_scale: float, filter_type: String, filter_freq: float, offset: float, dur_mul: float, max_dur := -1.0) -> Dictionary:
	return {
		"freq_mul": freq_mul,
		"slide_freq_mul": slide_freq_mul if slide_freq_mul > 0.0 else freq_mul,
		"midi_offset": midi_offset,
		"wave": wave,
		"peak": peak,
		"peak_scale": peak_scale,
		"filter": filter_type,
		"freq": filter_freq,
		"offset": offset,
		"dur_mul": dur_mul,
		"max_dur": max_dur,
	}


func _native_chord_stream_for_event(event: Dictionary, allow_build := true) -> AudioStream:
	if chart == null:
		return null
	_sync_native_preview_cache_signature()
	var flags: Dictionary = _dictionary_or_empty(event.get("flags", {}))
	var notes: Array = flags.get("midi_notes", [int(event.get("midi_note", 48))])
	if notes.is_empty():
		return null
	var duration_ticks := max(1, int(event.get("duration_ticks", 1)))
	var instrument := str(flags.get("chord_instrument", event.get("instrument_id", "pocket")))
	var play_mode := str(flags.get("chord_play_mode", "block"))
	var step := int(event.get("step", int(event.get("tick", 0))))
	var note_key := []
	for note in notes:
		note_key.append(str(int(note)))
	var cache_key := "%s:%s:%d:%s:%s:%d" % [_last_native_cache_signature, ",".join(note_key), duration_ticks, instrument, play_mode, step % 97]
	if _native_chord_stream_cache.has(cache_key):
		return _native_chord_stream_cache[cache_key]
	if not allow_build:
		return null
	var stream := _build_native_chord_stream(notes, duration_ticks, instrument, play_mode, step)
	if stream == null:
		return null
	var cache_limit := max(0, int(playback_profile.sample_preview_native_chords_cache_limit))
	if cache_limit > 0:
		while _native_chord_stream_cache.size() >= cache_limit:
			_native_chord_stream_cache.erase(_native_chord_stream_cache.keys()[0])
		_native_chord_stream_cache[cache_key] = stream
	return stream


func _build_native_chord_stream(notes: Array, duration_ticks: int, instrument: String, play_mode: String, step: int) -> AudioStreamWAV:
	var seconds_per_tick: float = chart.get_seconds_per_tick() if chart != null else 0.01
	var note_seconds: float = max(0.04, float(duration_ticks) * seconds_per_tick)
	var cfg := _native_chord_instrument_config(instrument)
	var base_duration: float = max(0.08, min(note_seconds * float(cfg.get("dur_mul", 1.0)), float(cfg.get("max_live_dur", 1.1))))
	var gap := 0.010 * float(cfg.get("spread_mul", 1.0))
	if play_mode.begins_with("strum"):
		gap = 0.045 * float(cfg.get("spread_mul", 1.0))
	elif play_mode.begins_with("arp"):
		gap = 0.120 * float(cfg.get("spread_mul", 1.0))
	var note_duration := base_duration
	if play_mode.begins_with("arp"):
		note_duration = min(0.25, base_duration * 0.45)
	var release_tail := max(0.18, float(cfg.get("release", 0.2)) + 0.05)
	var stream_seconds: float = base_duration + float(max(0, notes.size() - 1)) * gap + release_tail
	if bool(cfg.get("shimmer", false)):
		stream_seconds = max(stream_seconds, float(max(0, notes.size() - 1)) * gap + 0.014 + min(0.16, base_duration * 0.42) + 0.4)
	var frame_count := max(1, int(ceil(stream_seconds * float(NATIVE_BASS_SAMPLE_RATE))))
	var samples := PackedFloat32Array()
	samples.resize(frame_count)
	for note_index in range(notes.size()):
		var midi_note := int(notes[note_index])
		var note_start := float(note_index) * gap
		var wave := str(cfg.get("root_wave", "triangle")) if note_index == 0 else str(cfg.get("wave", "sine"))
		var peak := float(cfg.get("peak", 0.24)) * (0.92 if play_mode != "block" else 1.0)
		_mix_native_chord_tone(samples, midi_note, note_start, note_duration, wave, peak, cfg)
		if bool(cfg.get("shimmer", false)) and note_index > 0 and play_mode == "block":
			var shimmer_cfg := {
				"attack": 0.002,
				"decay": 0.12,
				"sustain": 0.06,
				"release": 0.35,
				"filter": "lowpass",
				"freq": 5200.0,
				"layers": [_native_chord_layer("sine", 1.0)],
			}
			_mix_native_chord_tone(samples, midi_note + 12, note_start + 0.014, min(0.12, base_duration * 0.35), "sine", float(cfg.get("peak", 0.24)) * 0.08, shimmer_cfg)
	return _audio_stream_wav_from_mono_samples(samples)


func _mix_native_chord_tone(samples: PackedFloat32Array, midi_note: int, offset: float, duration: float, fallback_wave: String, peak: float, cfg: Dictionary) -> void:
	var freq := 440.0 * pow(2.0, (float(midi_note) - 69.0) / 12.0)
	var filter_type := str(cfg.get("filter", "lowpass"))
	var filter_freq := float(cfg.get("freq", 1800.0))
	var dt := 1.0 / float(NATIVE_BASS_SAMPLE_RATE)
	var filtered := 0.0
	var rc: float = 1.0 / max(1.0, TAU * filter_freq)
	var filter_alpha: float = dt / (rc + dt)
	var layers: Array = cfg.get("layers", [_native_chord_layer(fallback_wave, 1.0)])
	var start_index := max(0, int(floor(offset * float(NATIVE_BASS_SAMPLE_RATE))))
	var end_index := min(samples.size(), int(ceil((offset + duration + float(cfg.get("release", 0.2)) + 0.06) * float(NATIVE_BASS_SAMPLE_RATE))))
	for i in range(start_index, end_index):
		var t := float(i) * dt
		var local := t - offset
		var raw := 0.0
		for layer_value in layers:
			var layer: Dictionary = _dictionary_or_empty(layer_value)
			var wave := str(layer.get("wave", fallback_wave))
			var freq_mul := float(layer.get("freq_mul", 1.0))
			var detune := float(layer.get("detune", 0.0))
			var level := float(layer.get("level", 1.0))
			var layer_freq := freq * freq_mul * pow(2.0, detune / 1200.0)
			raw += _native_wave_sample_at(wave, layer_freq, local) * level
		var shaped: float = raw / max(1.0, sqrt(float(layers.size())))
		filtered += filter_alpha * (shaped - filtered)
		var tone_factor := _native_filter_factor(filter_type, freq, filter_freq)
		var sweep := float(cfg.get("filter_sweep", -1.0))
		if sweep > 0.0 and local < max(0.04, min(0.22, duration * 0.5)):
			var ratio: float = local / max(0.001, max(0.04, min(0.22, duration * 0.5)))
			tone_factor = _native_filter_factor(filter_type, freq, lerp(filter_freq, sweep, ratio))
		samples[i] = clamp(samples[i] + filtered * tone_factor * _native_chord_gain(local, duration, peak, cfg), -1.0, 1.0)


func _native_chord_gain(t: float, duration: float, peak: float, cfg: Dictionary) -> float:
	var attack := max(0.001, float(cfg.get("attack", 0.01)))
	var decay := max(0.001, float(cfg.get("decay", 0.06)))
	var sustain := clamp(float(cfg.get("sustain", 0.7)), 0.001, 1.0)
	var release := max(0.025, float(cfg.get("release", 0.2)))
	if t < attack:
		return lerp(0.0001, peak, t / attack)
	if t < attack + decay:
		return lerp(peak, peak * sustain, (t - attack) / decay)
	if t < duration:
		return peak * sustain
	if t < duration + release:
		return lerp(peak * sustain, 0.0, (t - duration) / release)
	return 0.0


func _native_chord_instrument_config(instrument: String) -> Dictionary:
	match instrument:
		"chip_square_stack":
			return _native_chord_config("square", "square", 0.16, "lowpass", 3600.0, 0.002, 0.08, 0.48, 0.14, 0.82, 0.16, false, 0.68, [_native_chord_layer("square", 0.72), _native_chord_layer("square", 0.38, 1.0, 6.0), _native_chord_layer("triangle", 0.12, 2.0)])
		"chip_triangle_pad":
			return _native_chord_config("triangle", "triangle", 0.125, "lowpass", 2200.0, 0.055, 0.16, 0.72, 0.34, 1.18, 0.12, false, 1.2, [_native_chord_layer("triangle", 0.8), _native_chord_layer("sine", 0.18, 2.0)])
		"chip_arp_keys":
			return _native_chord_config("square", "square", 0.135, "bandpass", 1850.0, 0.001, 0.055, 0.16, 0.12, 0.46, 0.72, true, 0.36, [_native_chord_layer("square", 0.74), _native_chord_layer("triangle", 0.16, 2.0, -4.0)])
		"modern_chip_poly":
			return _native_chord_config("square", "sawtooth", 0.142, "lowpass", 2550.0, 0.008, 0.13, 0.54, 0.22, 0.96, 0.28, true, 0.92, [_native_chord_layer("square", 0.62, 1.0, -7.0), _native_chord_layer("sawtooth", 0.4, 1.0, 8.0), _native_chord_layer("triangle", 0.22, 0.5)], 3400.0)
		"piano":
			return _native_chord_config("triangle", "triangle", 0.23, "lowpass", 3100.0, 0.003, 0.18, 0.18, 0.16, 0.72, 0.45, false, 0.82, [_native_chord_layer("triangle", 1.0), _native_chord_layer("sine", 0.18, 2.0, 3.0)])
		"saloon_piano":
			return _native_chord_config("triangle", "triangle", 0.205, "lowpass", 3600.0, 0.002, 0.13, 0.12, 0.18, 0.62, 0.58, false, 0.7, [_native_chord_layer("triangle", 0.88, 1.0, -8.0), _native_chord_layer("triangle", 0.62, 1.0, 9.0), _native_chord_layer("sine", 0.16, 2.0, 5.0)])
		"harp":
			return _native_chord_config("triangle", "sine", 0.18, "lowpass", 4600.0, 0.002, 0.1, 0.03, 0.36, 0.5, 1.45, true, 0.58, [_native_chord_layer("triangle", 0.9), _native_chord_layer("sine", 0.26, 2.0, 7.0)])
		"warm_pad":
			return _native_chord_config("sine", "triangle", 0.14, "lowpass", 1200.0, 0.11, 0.24, 0.82, 0.62, 1.35, 0.25, false, 1.65, [_native_chord_layer("sine", 0.95, 1.0, -5.0), _native_chord_layer("triangle", 0.48, 1.0, 6.0)], 1700.0)
		"dusty_rhodes":
			return _native_chord_config("triangle", "triangle", 0.155, "lowpass", 1550.0, 0.012, 0.18, 0.44, 0.34, 0.96, 0.38, false, 1.05, [_native_chord_layer("triangle", 0.82, 1.0, -4.0), _native_chord_layer("sine", 0.21, 2.01, 5.0), _native_chord_layer("sine", 0.045, 3.01, -8.0)])
		"felt_piano":
			return _native_chord_config("triangle", "triangle", 0.145, "lowpass", 1900.0, 0.006, 0.24, 0.22, 0.42, 0.82, 0.34, false, 0.96, [_native_chord_layer("triangle", 0.78), _native_chord_layer("sine", 0.16, 2.0, -3.0)])
		"cassette_keys":
			return _native_chord_config("triangle", "triangle", 0.135, "lowpass", 1320.0, 0.018, 0.18, 0.54, 0.44, 1.04, 0.45, false, 1.22, [_native_chord_layer("triangle", 0.72, 1.0, -9.0), _native_chord_layer("triangle", 0.5, 1.0, 10.0), _native_chord_layer("sine", 0.12, 2.0, 3.0)])
		"muted_jazz_guitar":
			return _native_chord_config("triangle", "triangle", 0.132, "bandpass", 1180.0, 0.004, 0.09, 0.08, 0.16, 0.5, 0.72, false, 0.42, [_native_chord_layer("triangle", 0.8), _native_chord_layer("square", 0.11, 1.0, -5.0)])
		"lofi_warm_pad":
			return _native_chord_config("sine", "triangle", 0.115, "lowpass", 930.0, 0.18, 0.3, 0.86, 0.72, 1.48, 0.22, false, 1.85, [_native_chord_layer("sine", 0.92, 1.0, -7.0), _native_chord_layer("triangle", 0.42, 1.0, 7.0)], 1180.0)
		"glass":
			return _native_chord_config("sine", "sine", 0.16, "bandpass", 1500.0, 0.004, 0.2, 0.1, 0.44, 0.9, 0.85, true, 0.82, [_native_chord_layer("sine", 0.36), _native_chord_layer("sine", 0.64, 2.01), _native_chord_layer("sine", 0.34, 4.02), _native_chord_layer("triangle", 0.12, 6.01)])
		_:
			return _native_chord_config("triangle", "sine", 0.24, "lowpass", 1800.0, 0.01, 0.06, 0.7, 0.2, 1.0, 1.0, false, 1.15, [_native_chord_layer("triangle", 0.82), _native_chord_layer("sine", 0.35)])


func _native_chord_config(root_wave: String, wave: String, peak: float, filter_type: String, freq: float, attack: float, decay: float, sustain: float, release: float, dur_mul: float, spread_mul: float, shimmer: bool, max_live_dur: float, layers: Array, filter_sweep := -1.0) -> Dictionary:
	return {
		"root_wave": root_wave,
		"wave": wave,
		"peak": peak,
		"filter": filter_type,
		"freq": freq,
		"attack": attack,
		"decay": decay,
		"sustain": sustain,
		"release": release,
		"dur_mul": dur_mul,
		"spread_mul": spread_mul,
		"shimmer": shimmer,
		"max_live_dur": max_live_dur,
		"layers": layers,
		"filter_sweep": filter_sweep,
	}


func _native_chord_layer(wave: String, level: float, freq_mul := 1.0, detune := 0.0) -> Dictionary:
	return {
		"wave": wave,
		"level": level,
		"freq_mul": freq_mul,
		"detune": detune,
	}


func _native_guitar_stream_for_event(event: Dictionary, allow_build := true) -> AudioStream:
	if chart == null:
		return null
	_sync_native_preview_cache_signature()
	var flags: Dictionary = _dictionary_or_empty(event.get("flags", {}))
	var notes: Array = flags.get("midi_notes", [int(event.get("midi_note", 40))])
	if notes.is_empty():
		return null
	var duration_ticks := max(1, int(event.get("duration_ticks", 1)))
	var tone := str(flags.get("tone", event.get("instrument_id", "high_gain")))
	var articulation := str(flags.get("articulation", event.get("instrument_id", "open")))
	var direction := str(flags.get("direction", "down"))
	var step := int(event.get("step", int(event.get("tick", 0))))
	var note_key := []
	for note in notes:
		note_key.append(str(int(note)))
	var cache_key := "%s:%s:%d:%s:%s:%s:%d" % [_last_native_cache_signature, ",".join(note_key), duration_ticks, tone, articulation, direction, step % 97]
	if _native_guitar_stream_cache.has(cache_key):
		return _native_guitar_stream_cache[cache_key]
	if not allow_build:
		return null
	var stream := _build_native_guitar_stream(notes, duration_ticks, tone, articulation, direction, step)
	if stream == null:
		return null
	var cache_limit := max(0, int(playback_profile.sample_preview_native_guitar_cache_limit))
	if cache_limit > 0:
		while _native_guitar_stream_cache.size() >= cache_limit:
			_native_guitar_stream_cache.erase(_native_guitar_stream_cache.keys()[0])
		_native_guitar_stream_cache[cache_key] = stream
	return stream


func _build_native_guitar_stream(notes: Array, duration_ticks: int, tone: String, articulation: String, direction: String, step: int) -> AudioStreamWAV:
	var seconds_per_tick: float = chart.get_seconds_per_tick() if chart != null else 0.01
	var note_seconds: float = max(0.04, float(duration_ticks) * seconds_per_tick)
	var cfg := _native_guitar_tone_config(tone)
	var is_chug := articulation == "chug"
	var is_scratch := articulation == "scratch"
	var play_duration: float
	if is_chug:
		play_duration = min(note_seconds, float(cfg.get("mute", 0.066)))
	elif is_scratch:
		play_duration = float(cfg.get("scratch", 0.042))
	else:
		play_duration = max(0.12, note_seconds * float(cfg.get("sustain", 0.91)))
	var ordered := _ordered_guitar_notes(notes, direction)
	var spread: float = 0.003 if is_chug or is_scratch else float(cfg.get("spread", 0.010))
	var stream_seconds: float = play_duration + float(max(0, ordered.size() - 1)) * spread + (0.08 if is_chug else 0.24)
	var frame_count := max(1, int(ceil(stream_seconds * float(NATIVE_BASS_SAMPLE_RATE))))
	var samples := PackedFloat32Array()
	samples.resize(frame_count)
	if is_scratch:
		_mix_native_guitar_scratch(samples, play_duration, cfg)
	else:
		for note_index in range(ordered.size()):
			var midi_note := int(ordered[note_index])
			_mix_native_guitar_note(samples, midi_note, float(note_index) * spread, play_duration, cfg, articulation, note_index, max(1, ordered.size()), step)
	return _audio_stream_wav_from_mono_samples(samples)


func _mix_native_guitar_note(samples: PackedFloat32Array, midi_note: int, offset: float, play_duration: float, cfg: Dictionary, articulation: String, note_index: int, note_count: int, step: int) -> void:
	var is_chug := articulation == "chug"
	var is_accent := articulation == "accent"
	var freq := 440.0 * pow(2.0, (float(midi_note) - 69.0) / 12.0)
	var osc_b_wave := "triangle" if str(cfg.get("secondary_wave", "square")) == "triangle" else "square"
	var detune_a := (_native_feature_seed(step, note_index + 50) - 0.5) * 4.0
	var detune_b := (_native_feature_seed(step, note_index + 70) - 0.5) * 5.0
	var freq_a := freq * pow(2.0, detune_a / 1200.0)
	var freq_b := freq * (1.003 + float(note_index) * 0.0009) * pow(2.0, detune_b / 1200.0)
	var peak := float(cfg.get("peak", 0.09)) * (1.28 if is_accent else 1.0) * (1.05 if is_chug else 1.0) / sqrt(float(note_count))
	peak *= float(cfg.get("native_output", 2.25))
	var drive := float(cfg.get("drive", 4.2)) * (1.12 if is_accent else 1.0)
	var input := float(cfg.get("input", 0.88)) * (1.18 if is_accent else 1.0)
	var highpass := max(135.0, float(cfg.get("highpass", 108.0))) if is_chug else float(cfg.get("highpass", 108.0))
	var lowpass := min(float(cfg.get("lowpass", 3250.0)), 1700.0) if is_chug else float(cfg.get("lowpass", 3250.0))
	var body := 1.5 if is_chug else float(cfg.get("body", 3.7))
	var mid := max(1.8, float(cfg.get("mid", 2.6))) if is_chug else float(cfg.get("mid", 2.6))
	var pick_noise := float(cfg.get("pick_noise", 0.0)) * (1.35 if is_accent else 1.0) * (0.25 if is_chug else 1.0)
	var pick_click_mix := float(cfg.get("pick_click_mix", 0.0)) * (1.25 if is_accent else 1.0) * (0.15 if is_chug else 1.0)
	var dt := 1.0 / float(NATIVE_BASS_SAMPLE_RATE)
	var hp_coeff := _native_biquad_coefficients("highpass", highpass, 0.707, 0.0)
	var body_coeff := _native_biquad_coefficients("peaking", 170.0 if is_chug else 240.0, 0.75, body)
	var mid_coeff := _native_biquad_coefficients("peaking", 720.0 if is_chug else 980.0, 0.85, mid)
	var lp_coeff := _native_biquad_coefficients("lowpass", lowpass, 0.707, 0.0)
	var hp_x1 := 0.0
	var hp_x2 := 0.0
	var hp_y1 := 0.0
	var hp_y2 := 0.0
	var body_x1 := 0.0
	var body_x2 := 0.0
	var body_y1 := 0.0
	var body_y2 := 0.0
	var mid_x1 := 0.0
	var mid_x2 := 0.0
	var mid_y1 := 0.0
	var mid_y2 := 0.0
	var lp_x1 := 0.0
	var lp_x2 := 0.0
	var lp_y1 := 0.0
	var lp_y2 := 0.0
	var start_index := max(0, int(floor(offset * float(NATIVE_BASS_SAMPLE_RATE))))
	var end_index := min(samples.size(), int(ceil((offset + play_duration + 0.22) * float(NATIVE_BASS_SAMPLE_RATE))))
	for i in range(start_index, end_index):
		var t := float(i) * dt
		var local := t - offset
		var osc_a := _native_wave_sample_at("sawtooth", freq_a, local)
		var osc_b := _native_wave_sample_at(osc_b_wave, freq_b, local)
		var pick := _native_stable_noise_sample(i + step * 17 + note_index * 101, 91) * exp(-local / 0.010) * pick_noise
		var raw := tanh((((osc_a + osc_b) * 0.5) + pick) * input * drive)
		var tone_factor := _native_filter_factor("highpass", freq, highpass) * _native_filter_factor("lowpass", freq, lowpass)
		var high := _native_biquad_tick(raw, hp_coeff, hp_x1, hp_x2, hp_y1, hp_y2)
		hp_x2 = hp_x1
		hp_x1 = raw
		hp_y2 = hp_y1
		hp_y1 = high
		var body_filtered := _native_biquad_tick(high, body_coeff, body_x1, body_x2, body_y1, body_y2)
		body_x2 = body_x1
		body_x1 = high
		body_y2 = body_y1
		body_y1 = body_filtered
		var mid_filtered := _native_biquad_tick(body_filtered, mid_coeff, mid_x1, mid_x2, mid_y1, mid_y2)
		mid_x2 = mid_x1
		mid_x1 = body_filtered
		mid_y2 = mid_y1
		mid_y1 = mid_filtered
		var filtered := _native_biquad_tick(mid_filtered, lp_coeff, lp_x1, lp_x2, lp_y1, lp_y2)
		lp_x2 = lp_x1
		lp_x1 = mid_filtered
		lp_y2 = lp_y1
		lp_y1 = filtered
		var attack_shape := _native_guitar_attack_shape(local, is_accent, is_chug, float(cfg.get("attack_boost", 1.0)))
		var pick_click := pick * pick_click_mix
		samples[i] = clamp(samples[i] + (filtered * tone_factor + pick_click) * _native_guitar_gain(local, play_duration, peak, is_chug) * attack_shape, -1.0, 1.0)


func _mix_native_guitar_scratch(samples: PackedFloat32Array, play_duration: float, cfg: Dictionary) -> void:
	var dt := 1.0 / float(NATIVE_BASS_SAMPLE_RATE)
	var highpass := float(cfg.get("highpass", 108.0))
	var lowpass := min(float(cfg.get("scratch_lowpass", cfg.get("lowpass", 3250.0))), 3200.0)
	var bandpass := float(cfg.get("scratch_bandpass", 1450.0))
	var hp_rc: float = 1.0 / max(1.0, TAU * highpass)
	var bp_rc: float = 1.0 / max(1.0, TAU * bandpass)
	var lp_rc: float = 1.0 / max(1.0, TAU * lowpass)
	var hp_alpha: float = dt / (hp_rc + dt)
	var bp_alpha: float = dt / (bp_rc + dt)
	var lp_alpha: float = dt / (lp_rc + dt)
	var hp_low := 0.0
	var bp_low := 0.0
	var lp_state := 0.0
	var input := float(cfg.get("input", 0.88))
	var drive := max(0.1, float(cfg.get("drive", 4.2)) * 0.55)
	var scratch_peak := float(cfg.get("scratch_peak", 0.18))
	var scratch_smooth := clamp(float(cfg.get("scratch_smooth", 0.0)), 0.0, 0.98)
	var smoothed_noise := 0.0
	var end_index := min(samples.size(), int(ceil((play_duration + 0.02) * float(NATIVE_BASS_SAMPLE_RATE))))
	for i in range(end_index):
		var t := float(i) * dt
		var attack := min(1.0, t / 0.004)
		var release := exp(-t / max(0.001, play_duration * 0.34))
		var noise := _native_stable_noise_sample(i, 37)
		smoothed_noise = lerp(noise, smoothed_noise, scratch_smooth)
		noise = smoothed_noise
		hp_low += hp_alpha * (noise - hp_low)
		var high := noise - hp_low
		bp_low += bp_alpha * (high - bp_low)
		lp_state += lp_alpha * (bp_low - lp_state)
		var shaped := tanh(lp_state * input * drive)
		samples[i] = clamp(samples[i] + shaped * attack * release * scratch_peak, -1.0, 1.0)


func _native_guitar_gain(t: float, play_duration: float, peak: float, is_chug: bool) -> float:
	var attack := 0.002 if is_chug else 0.006
	var decay_point := max(0.025, play_duration * (0.45 if is_chug else 0.35))
	var sustain := peak * (0.10 if is_chug else 0.52)
	var release := 0.035 if is_chug else 0.18
	if t < attack:
		return lerp(0.0001, peak, t / attack)
	if t < decay_point:
		return lerp(peak, sustain, (t - attack) / max(0.001, decay_point - attack))
	if t < play_duration + release:
		var release_ratio := clamp((t - decay_point) / max(0.001, play_duration + release - decay_point), 0.0, 1.0)
		return max(0.0, sustain * pow(0.0001 / max(0.0001, sustain), release_ratio))
	return 0.0


func _native_guitar_attack_shape(t: float, is_accent: bool, is_chug: bool, boost: float) -> float:
	var window := 0.010 if is_chug else 0.020
	if t < 0.0 or t >= window:
		return 1.0
	var accent_mul := 1.18 if is_accent else 1.0
	var chug_mul := 0.82 if is_chug else 1.0
	var start_boost := max(1.0, boost * accent_mul * chug_mul)
	return lerp(start_boost, 1.0, t / max(0.001, window))


func _native_biquad_coefficients(kind: String, frequency: float, q: float, gain_db: float) -> Dictionary:
	var nyquist := float(NATIVE_BASS_SAMPLE_RATE) * 0.5
	var safe_frequency := clamp(frequency, 10.0, nyquist - 10.0)
	var safe_q := max(0.001, q)
	var omega: float = TAU * safe_frequency / float(NATIVE_BASS_SAMPLE_RATE)
	var sin_omega: float = sin(omega)
	var cos_omega: float = cos(omega)
	var alpha: float = sin_omega / (2.0 * safe_q)
	var a0 := 1.0
	var b0 := 1.0
	var b1 := 0.0
	var b2 := 0.0
	var a1 := 0.0
	var a2 := 0.0
	match kind:
		"highpass":
			b0 = (1.0 + cos_omega) * 0.5
			b1 = -(1.0 + cos_omega)
			b2 = (1.0 + cos_omega) * 0.5
			a0 = 1.0 + alpha
			a1 = -2.0 * cos_omega
			a2 = 1.0 - alpha
		"lowpass":
			b0 = (1.0 - cos_omega) * 0.5
			b1 = 1.0 - cos_omega
			b2 = (1.0 - cos_omega) * 0.5
			a0 = 1.0 + alpha
			a1 = -2.0 * cos_omega
			a2 = 1.0 - alpha
		"peaking":
			var amp := pow(10.0, gain_db / 40.0)
			b0 = 1.0 + alpha * amp
			b1 = -2.0 * cos_omega
			b2 = 1.0 - alpha * amp
			a0 = 1.0 + alpha / amp
			a1 = -2.0 * cos_omega
			a2 = 1.0 - alpha / amp
		_:
			pass
	return {
		"b0": b0 / a0,
		"b1": b1 / a0,
		"b2": b2 / a0,
		"a1": a1 / a0,
		"a2": a2 / a0,
	}


func _native_biquad_tick(input: float, coeff: Dictionary, x1: float, x2: float, y1: float, y2: float) -> float:
	return float(coeff.get("b0", 1.0)) * input + float(coeff.get("b1", 0.0)) * x1 + float(coeff.get("b2", 0.0)) * x2 - float(coeff.get("a1", 0.0)) * y1 - float(coeff.get("a2", 0.0)) * y2


func _native_guitar_tone_config(tone: String) -> Dictionary:
	match tone:
		"clean":
			return {"drive": 0.65, "input": 0.62, "peak": 0.086, "lowpass": 4300.0, "highpass": 90.0, "body": 1.4, "mid": 1.0, "spread": 0.016, "sustain": 1.08, "mute": 0.085, "scratch": 0.040, "secondary_wave": "triangle", "native_output": 2.15, "scratch_peak": 0.15, "attack_boost": 1.45}
		"crunch":
			return {"drive": 2.4, "input": 0.80, "peak": 0.092, "lowpass": 3600.0, "highpass": 100.0, "body": 2.8, "mid": 2.0, "spread": 0.013, "sustain": 0.98, "mute": 0.074, "scratch": 0.044, "secondary_wave": "square", "native_output": 2.15, "scratch_peak": 0.16, "attack_boost": 1.35}
		"metal":
			return {"drive": 6.2, "input": 0.92, "peak": 0.088, "lowpass": 3050.0, "highpass": 115.0, "body": 4.5, "mid": 3.0, "spread": 0.009, "sustain": 0.86, "mute": 0.060, "scratch": 0.040, "secondary_wave": "square", "native_output": 2.0, "scratch_peak": 0.15, "attack_boost": 1.25}
		"western_twang":
			return {"drive": 1.25, "input": 0.68, "peak": 0.082, "lowpass": 4700.0, "highpass": 125.0, "body": 1.1, "mid": 2.4, "spread": 0.020, "sustain": 0.72, "mute": 0.070, "scratch": 0.034, "secondary_wave": "square", "native_output": 2.35, "scratch_peak": 0.74, "scratch_bandpass": 880.0, "scratch_lowpass": 1800.0, "scratch_smooth": 0.52, "attack_boost": 1.75, "pick_noise": 0.16, "pick_click_mix": 0.45}
		_:
			return {"drive": 4.2, "input": 0.88, "peak": 0.090, "lowpass": 3250.0, "highpass": 108.0, "body": 3.7, "mid": 2.6, "spread": 0.010, "sustain": 0.91, "mute": 0.066, "scratch": 0.042, "secondary_wave": "square", "native_output": 2.1, "scratch_peak": 0.16, "attack_boost": 1.3}


func _native_bass_tone_config(tone: String) -> Dictionary:
	match tone:
		"chip_triangle_bass":
			return {"main_wave": "triangle", "sub_wave": "sine", "main_peak": 0.88, "sub_peak": 0.25, "cutoff": 520.0, "sub_cutoff": 180.0, "attack": 0.004}
		"chip_square_bass":
			return {"main_wave": "square", "sub_wave": "triangle", "main_peak": 0.72, "sub_peak": 0.22, "cutoff": 680.0, "sub_cutoff": 220.0, "attack": 0.002}
		"modern_chip_sub":
			return {"main_wave": "square", "sub_wave": "sine", "main_peak": 0.64, "sub_peak": 0.62, "cutoff": 420.0, "sub_cutoff": 150.0, "attack": 0.006}
		"bitcrush_bass":
			return {"main_wave": "sawtooth", "sub_wave": "square", "main_peak": 0.58, "sub_peak": 0.34, "cutoff": 560.0, "sub_cutoff": 210.0, "attack": 0.003}
		"warm_sub":
			return {"main_wave": "sine", "sub_wave": "sine", "main_peak": 0.82, "sub_peak": 0.55, "cutoff": 210.0, "sub_cutoff": 120.0, "attack": 0.018}
		"soft_upright":
			return {"main_wave": "triangle", "sub_wave": "sine", "main_peak": 0.72, "sub_peak": 0.28, "cutoff": 360.0, "sub_cutoff": 140.0, "attack": 0.008}
		"rounded_triangle_bass":
			return {"main_wave": "triangle", "sub_wave": "sine", "main_peak": 0.84, "sub_peak": 0.34, "cutoff": 300.0, "sub_cutoff": 130.0, "attack": 0.012}
		_:
			return {"main_wave": "sawtooth", "sub_wave": "sine", "main_peak": 1.0, "sub_peak": 0.42, "cutoff": 420.0, "sub_cutoff": 220.0, "attack": 0.01}


func _mix_native_bass_voice(samples: PackedFloat32Array, start_midi: int, slide_midi: int, slide_offset_ticks: int, seconds_per_tick: float, note_seconds: float, voice_seconds: float, wave: String, peak_mul: float, cutoff_hz: float, attack: float) -> void:
	var phase := 0.0
	var filtered := 0.0
	var dt := 1.0 / float(NATIVE_BASS_SAMPLE_RATE)
	var rc: float = 1.0 / max(1.0, TAU * cutoff_hz)
	var filter_alpha: float = dt / (rc + dt)
	var slide_start := max(0.02, float(slide_offset_ticks) * seconds_per_tick)
	var slide_end := min(note_seconds + 0.22 - 0.03, slide_start + 0.09)
	var has_slide: bool = slide_midi >= 0 and slide_end > slide_start
	for i in range(samples.size()):
		var t := float(i) * dt
		var midi := float(start_midi)
		if has_slide and t >= slide_start:
			var ratio := clamp((t - slide_start) / max(0.001, slide_end - slide_start), 0.0, 1.0)
			midi = lerp(float(start_midi), float(slide_midi), ratio)
		var freq := 440.0 * pow(2.0, (midi - 69.0) / 12.0)
		phase = fmod(phase + TAU * freq * dt, TAU)
		var raw := _native_wave_sample(wave, phase)
		filtered += filter_alpha * (raw - filtered)
		samples[i] = clamp(samples[i] + filtered * _native_bass_adsr_gain(t, voice_seconds, attack) * 0.34 * peak_mul, -1.0, 1.0)


func _native_wave_sample(wave: String, phase: float) -> float:
	var cycle := phase / TAU
	match wave:
		"sine":
			return sin(phase)
		"triangle":
			return 1.0 - 4.0 * abs(cycle - 0.5)
		"square":
			return 1.0 if cycle < 0.5 else -1.0
		"sawtooth":
			return cycle * 2.0 - 1.0
		_:
			return sin(phase)


func _native_wave_sample_at(wave: String, freq: float, seconds: float) -> float:
	return _native_wave_sample_from_cycle(wave, fmod(max(0.0, freq) * max(0.0, seconds), 1.0))


func _native_wave_sample_ramped_at(wave: String, start_freq: float, target_freq: float, ramp_end: float, seconds: float) -> float:
	return _native_wave_sample_from_cycle(wave, _native_ramped_cycles(start_freq, target_freq, ramp_end, seconds))


func _native_wave_sample_from_cycle(wave: String, cycle: float) -> float:
	var wrapped := fmod(cycle, 1.0)
	if wrapped < 0.0:
		wrapped += 1.0
	match wave:
		"sine":
			return sin(TAU * wrapped)
		"triangle":
			return 1.0 - 4.0 * abs(wrapped - 0.5)
		"square":
			return 1.0 if wrapped < 0.5 else -1.0
		"sawtooth":
			return wrapped * 2.0 - 1.0
		_:
			return sin(TAU * wrapped)


func _native_ramped_cycles(start_freq: float, target_freq: float, ramp_end: float, seconds: float) -> float:
	if seconds <= 0.0:
		return 0.0
	var safe_ramp := max(0.0001, ramp_end)
	if abs(start_freq - target_freq) < 0.000001:
		return start_freq * seconds
	if seconds <= safe_ramp:
		return start_freq * seconds + (target_freq - start_freq) * seconds * seconds / (2.0 * safe_ramp)
	return ((start_freq + target_freq) * 0.5 * safe_ramp) + target_freq * (seconds - safe_ramp)


func _native_feature_seed(step: int, seed := 0) -> float:
	var value := sin(float(step + 1) * 12.9898 + float(seed + 1) * 78.233) * 43758.5453
	return value - floor(value)


func _native_stable_noise_sample(index: int, seed := 0) -> float:
	return _native_feature_seed(index, seed) * 2.0 - 1.0


func _native_filter_factor(filter_type: String, freq: float, cutoff: float) -> float:
	var safe_freq := max(1.0, freq)
	var safe_cutoff := max(1.0, cutoff)
	match filter_type:
		"lowpass":
			var ratio := max(0.0, safe_freq / safe_cutoff)
			return clamp(1.0 / sqrt(1.0 + pow(ratio, 4.0)), 0.18, 1.0)
		"highpass":
			return clamp(safe_freq / safe_cutoff, 0.18, 1.0)
		"bandpass":
			var high := clamp(safe_freq / safe_cutoff, 0.2, 1.0)
			var low := clamp(safe_cutoff / safe_freq, 0.2, 1.0)
			return sqrt(high * low)
		_:
			return 1.0


func _native_adsr_gain(t: float, dur: float, attack := 0.01) -> float:
	attack = max(0.001, attack)
	var decay := 0.06
	var sustain := 0.7
	var release := 0.25
	if t < attack:
		return t / attack
	if t < attack + decay:
		return lerp(1.0, sustain, (t - attack) / decay)
	if t < dur:
		return sustain
	if t < dur + release:
		return lerp(sustain, 0.0, (t - dur) / release)
	return 0.0


func _native_bass_adsr_gain(t: float, dur: float, attack := 0.01) -> float:
	var shaped := _native_adsr_gain(t, dur, attack)
	if t <= max(0.001, attack) + 0.04:
		return shaped
	var ratio := clamp((t - attack) / max(0.001, dur + 0.12), 0.0, 1.0)
	var body_trim := lerp(0.76, 0.44, ratio)
	return shaped * body_trim


func _audio_stream_wav_from_mono_samples(samples: PackedFloat32Array) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in range(samples.size()):
		var value := int(round(clamp(samples[i], -1.0, 1.0) * 32767.0))
		if value < 0:
			value = 65536 + value
		bytes[i * 2] = value & 0xff
		bytes[i * 2 + 1] = (value >> 8) & 0xff
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = NATIVE_BASS_SAMPLE_RATE
	stream.stereo = false
	stream.data = bytes
	return stream


func _audio_stream_wav_from_stereo_panned_samples(samples: PackedFloat32Array, pan: float) -> AudioStreamWAV:
	var safe_pan := clamp(pan, -1.0, 1.0)
	var angle: float = (safe_pan + 1.0) * PI * 0.25
	var left_gain: float = cos(angle)
	var right_gain: float = sin(angle)
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 4)
	for i in range(samples.size()):
		var sample := clamp(samples[i], -1.0, 1.0)
		_write_i16_le(bytes, i * 4, sample * left_gain)
		_write_i16_le(bytes, i * 4 + 2, sample * right_gain)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = NATIVE_BASS_SAMPLE_RATE
	stream.stereo = true
	stream.data = bytes
	return stream


func _write_i16_le(bytes: PackedByteArray, offset: int, sample: float) -> void:
	var value := int(round(clamp(sample, -1.0, 1.0) * 32767.0))
	if value < 0:
		value = 65536 + value
	bytes[offset] = value & 0xff
	bytes[offset + 1] = (value >> 8) & 0xff


func _dictionary_or_empty(value) -> Dictionary:
	return value if value is Dictionary else {}


func _array_or_empty(value) -> Array:
	return value if value is Array else []


func _playback_type_for_pitched_event(track_type: String, pitch_scale: float) -> int:
	if playback_profile == null or not playback_profile.sample_preview_force_web_stream_for_pitched:
		return AudioServer.PLAYBACK_TYPE_DEFAULT
	if track_type == "melody":
		return AudioServer.PLAYBACK_TYPE_STREAM
	if (track_type == "bass" or track_type == "chord" or track_type == "guitar") and abs(pitch_scale - 1.0) > 0.0001:
		return AudioServer.PLAYBACK_TYPE_STREAM
	return AudioServer.PLAYBACK_TYPE_DEFAULT


func _should_force_web_stream_for_tonal_bus(bus_name: String) -> bool:
	if playback_profile == null or not playback_profile.sample_preview_force_web_stream_for_pitched:
		return false
	return bus_name in [
		_safe_bus_name(playback_profile.bass_bus),
		_safe_bus_name(playback_profile.chords_bus),
		_safe_bus_name(playback_profile.guitar_bus),
		_safe_bus_name(playback_profile.melody_bus),
	]


func _set_player_playback_type(player: AudioStreamPlayer, playback_type: int) -> void:
	if player == null:
		return
	if _property_names(player).has("playback_type"):
		player.set("playback_type", playback_type)


func _player_playback_type(player: AudioStreamPlayer) -> int:
	if player == null or not _property_names(player).has("playback_type"):
		return -1
	return int(player.get("playback_type"))


func _pitch_debug_info(event: Dictionary, sample_key: String, sample_path: String, pitch_scale: float, track_type: String, midi_note: int) -> Dictionary:
	return {
		"enabled": playback_profile != null and playback_profile.sample_preview_log_pitched_events and track_type in ["melody", "bass", "chord", "guitar"],
		"section": _section_for_event(event),
		"tick": int(event.get("tick", current_tick)),
		"instrument": str(event.get("instrument_id", "")),
		"lane": int(event.get("track_index", -1)),
		"track_type": track_type,
		"sample_key": sample_key,
		"sample_path": sample_path,
		"midi_note": midi_note,
		"note": _midi_note_label(midi_note),
		"pitch_scale": pitch_scale,
	}


func _log_pitched_sample_event(debug_info, sample_name: String, bus_name: String, player_playback_type: int, requested_playback_type: int) -> void:
	if not (debug_info is Dictionary) or not bool(debug_info.get("enabled", false)):
		return
	print("MUSIC NOTE: section=", str(debug_info.get("section", "")),
		" tick=", int(debug_info.get("tick", 0)),
		" lane=", str(debug_info.get("track_type", "")), ":", int(debug_info.get("lane", -1)),
		" instrument=", str(debug_info.get("instrument", "")),
		" sample_key=", str(debug_info.get("sample_key", "")),
		" sample_name=", sample_name,
		" sample_path=", str(debug_info.get("sample_path", "")),
		" note=", str(debug_info.get("note", "")),
		" midi_note=", int(debug_info.get("midi_note", -1)),
		" pitch_scale=", "%.5f" % float(debug_info.get("pitch_scale", 1.0)),
		" AudioStreamPlayer.playback_type=", player_playback_type,
		" requested_playback_type=", requested_playback_type,
		" bus=", bus_name,
		" platform=", OS.get_name())


func _section_for_event(event: Dictionary) -> String:
	var section_id := str(event.get("section_id", event.get("section", "")))
	if not section_id.is_empty():
		return section_id
	if chart == null:
		return current_section
	return str(chart.find_section_at_tick(int(event.get("tick", current_tick))).get("id", current_section))


func _midi_note_label(midi_note: int) -> String:
	if midi_note < 0:
		return ""
	var names := ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
	return "%s%d" % [names[posmod(midi_note, names.size())], int(floor(float(midi_note) / 12.0)) - 1]


func _sample_preview_should_duck_bass_for_kick(event_tick: int) -> bool:
	if playback_profile == null or playback_profile.sample_preview_bass_duck_on_kick_db >= 0.0:
		return false
	var window_ticks := max(0, int(playback_profile.sample_preview_bass_duck_window_ticks))
	if window_ticks == 0:
		return _sample_preview_tick_has_kick(event_tick)
	return abs(event_tick - _sample_preview_last_kick_tick) <= window_ticks


func _sample_preview_tick_has_kick(event_tick: int) -> bool:
	if chart == null:
		return false
	var index := _find_event_cursor(event_tick)
	while index < chart.compiled_events.size():
		var candidate: Dictionary = chart.compiled_events[index]
		var candidate_tick := int(candidate.get("tick", -1))
		if candidate_tick != event_tick:
			break
		if str(candidate.get("track_type", "")) == "drum" and str(candidate.get("instrument_id", "")) == "kick":
			return true
		index += 1
	return false


func _sample_preview_gain_db(layer_name: String, sample_key: String) -> float:
	if playback_profile == null:
		return 0.0
	var gains: Dictionary = playback_profile.sample_preview_gain_db
	if gains.has(sample_key):
		return float(gains[sample_key]) + _chart_mix_gain_db(layer_name)
	if gains.has(layer_name):
		return float(gains[layer_name]) + _chart_mix_gain_db(layer_name)
	return _chart_mix_gain_db(layer_name)


func _chart_mix_gain_db(layer_name: String) -> float:
	if chart == null or chart.mix_volumes.is_empty():
		return 0.0
	var mix: Dictionary = chart.mix_volumes
	var gain_db := _volume_ratio_db(float(mix.get("master", DEFAULT_SAMPLE_PREVIEW_MIX["master"])), DEFAULT_SAMPLE_PREVIEW_MIX["master"])
	match layer_name:
		"drums", "bass", "chords", "melody", "guitar":
			gain_db += _volume_ratio_db(float(mix.get(layer_name, DEFAULT_SAMPLE_PREVIEW_MIX[layer_name])), DEFAULT_SAMPLE_PREVIEW_MIX[layer_name])
	return gain_db


func _volume_ratio_db(value: float, reference: float) -> float:
	var safe_reference := max(0.0001, reference)
	var safe_value := clamp(value, 0.0, 1.0)
	if safe_value <= 0.0001:
		return -80.0
	return linear_to_db(safe_value / safe_reference)


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
		return _load_audio_stream(playback_profile.drum_kit[sample_key], true)
	if playback_profile.event_sample_streams.has(sample_key):
		return _load_audio_stream(playback_profile.event_sample_streams[sample_key], true)
	if playback_profile.accent_streams.has(sample_key):
		return _load_audio_stream(playback_profile.accent_streams[sample_key], true)
	return null


func _sample_path_for_key(sample_key: String) -> String:
	if playback_profile == null:
		return ""
	if playback_profile.drum_kit.has(sample_key):
		return str(playback_profile.drum_kit[sample_key])
	if playback_profile.event_sample_streams.has(sample_key):
		return str(playback_profile.event_sample_streams[sample_key])
	if playback_profile.accent_streams.has(sample_key):
		return str(playback_profile.accent_streams[sample_key])
	return ""


func _is_headless_display() -> bool:
	return DisplayServer.get_name().to_lower() == "headless"


func _set_sync_stream_volume(layer_name: String, volume_db: float) -> void:
	if _stem_layer_players.has(layer_name):
		var player := _stem_layer_players[layer_name] as AudioStreamPlayer
		if is_instance_valid(player):
			player.volume_db = volume_db
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
	var high: int = chart.compiled_events.size()
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
