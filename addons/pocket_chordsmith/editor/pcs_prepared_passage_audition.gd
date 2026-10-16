@tool
extends Node

signal status_changed(message: String)
signal range_changed(description: String)
signal busy_changed(busy: bool)

const Music := preload("res://addons/pocket_chordsmith/editor/pcs_prepared_audition_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")

var _music: PocketChordsmithConductor
var _generation := 0
var _source_chart: Resource
var _source_profile: Resource
var _signature := 0
var _preparing := false
var _active := false
var _plan: Dictionary = {}
var _transitioned := false
var _last_report: Dictionary = {}
var _watched_streams: Array[Resource] = []


func describe(chart: Resource, profile: Resource, from_section: String, to_section: String, lead_bars: int, tail: float, native_bar := 1) -> Dictionary:
	if chart == null or profile == null:
		return {"error": "Import a prepared audio pack or Render Preview Audio first. Your project is unchanged."}
	if not is_finite(tail) or tail < 0.5 or tail > 2.0 or lead_bars < 1 or lead_bars > 2:
		return {"error": "Choose one or two lead-in bars and a 0.5–2 second tail allowance."}
	if not chart.native_timeline.is_empty():
		var bars: Array = chart.native_timeline.get("bars", [])
		if native_bar < 1 or native_bar > bars.size() or profile.stem_paths.is_empty():
			return {"error": "Choose a bar in a native DAW pack with its prepared full arrangement. Re-export missing audio in DAW."}
		var selected: Dictionary = bars[native_bar - 1]
		var start: Dictionary = bars[maxi(0, native_bar - 1 - lead_bars)]
		var end_seconds := minf(chart.native_audio_duration_seconds, float(selected.endSeconds) + tail)
		if end_seconds - float(start.startSeconds) > 120.0:
			return {"error": "This passage exceeds the 120-second audition limit. Select a shorter range in DAW and re-export, or use Play Preview."}
		return {"native": true, "start_tick": int(start.startTick), "end_seconds": end_seconds,
			"label": "Native DAW bar %d / %d bars before / %.1fs tail allowance. Fully arranged audio; no adaptive remix." % [native_bar, native_bar - 1 - maxi(0, native_bar - 1 - lead_bars), tail]}
	if profile.get_section_stems(from_section).is_empty() or profile.get_section_stems(to_section).is_empty():
		return {"error": "Both selected sections need prepared section audio. Import a pack or Render Preview Audio; ordinary Play Preview remains available."}
	var first := _occurrence(chart, from_section)
	var target := _occurrence(chart, to_section)
	if first.is_empty() or target.is_empty():
		return {"error": "Choose sections present in this chart's arrangement."}
	var bar_ticks := maxi(1, int(chart.time_signature) * int(chart.ticks_per_quarter))
	var boundary := int(first.start_tick) + int(first.length_ticks)
	var start_tick := maxi(int(first.start_tick), boundary - lead_bars * bar_ticks)
	var end_tick := int(target.start_tick) + mini(bar_ticks, int(target.length_ticks))
	if chart.tick_to_seconds(float(boundary - start_tick + mini(bar_ticks, int(target.length_ticks)))) + tail > 120.0:
		return {"error": "This transition exceeds the 120-second audition limit. Use ordinary Play Preview or shorten the source passage."}
	return {"native": false, "from": from_section, "to": to_section, "start_tick": start_tick,
		"end_seconds": chart.tick_to_seconds(float(end_tick)) + tail,
		"label": "%s → %s / %.1f lead-in bars / first target bar / %.1fs tail allowance. Prepared cut transition, first occurrences." % [from_section, to_section, float(boundary - start_tick) / bar_ticks, tail]}


func begin(chart: Resource, profile: Resource, from_section: String, to_section: String, lead_bars: int, tail: float, native_bar := 1) -> Dictionary:
	stop(false)
	var plan := describe(chart, profile, from_section, to_section, lead_bars, tail, native_bar)
	if plan.has("error") or not is_inside_tree():
		var message := str(plan.get("error", "Open the editor audition in an active scene."))
		status_changed.emit(message)
		return {"ok": false, "error": message}
	_watch_sources(chart, profile)
	var signature := _source_signature(chart, profile)
	if _music == null:
		_music = _create_conductor()
		_music.name = "PreparedPassageConductor"
		add_child(_music)
		_music.section_started.connect(_section_started)
	if signature != _signature or _music.chart == null:
		var isolated_chart = chart.duplicate()
		var no_events: Array[Dictionary] = []
		isolated_chart.compiled_events = no_events
		isolated_chart.music_states = {}
		isolated_chart.default_music_state = ""
		var isolated_profile = profile.duplicate()
		isolated_profile.playback_backend = Profile.PlaybackBackend.STEM_SYNC
		isolated_profile.sample_preview_enabled = false
		isolated_profile.sample_preview_prewarm_on_ready = false
		isolated_profile.guitar_preview_effects_enabled = false
		isolated_profile.native_audio_router_script = null
		isolated_profile.loop_prepared_sections = false
		isolated_profile.prepared_playback_scope = "arrangement" if plan.native else "adaptive"
		isolated_profile.preserve_prepared_wav_endings = true
		_music.chart = isolated_chart
		_music.set_playback_profile(isolated_profile)
		_signature = signature
	_plan = plan
	_transitioned = bool(plan.native)
	_preparing = true
	busy_changed.emit(true)
	var generation := _generation
	range_changed.emit(str(plan.label))
	status_changed.emit("Preparing existing audio. Stop cancels; no gameplay synthesis.")
	var report: Dictionary = await _prepare(plan)
	if generation != _generation or not is_inside_tree() or not _music.is_inside_tree():
		return {"ok": false, "cancelled": true}
	_preparing = false
	_last_report = report
	if signature != _source_signature(chart, profile) or not report.get("ok", false):
		stop(false)
		status_changed.emit("Prepared audio changed or is unavailable. Import/render again, then Hear this bit. Project unchanged.")
		return {"ok": false, "cancelled": true, "preparation": report}
	var streams: Array = _music._audio_stream_cache.values()
	_collect_streams(profile.stem_paths if plan.native else profile.get_section_stems(from_section), streams)
	if not plan.native:
		_collect_streams(profile.get_section_stems(to_section), streams)
	for stream in streams:
		if _unsupported_stream(stream):
			stop(false)
			var message := "Finite audition needs seekable, non-looping prepared files. Use ordinary Play Preview for this audio resource."
			status_changed.emit(message)
			return {"ok": false, "error": message}
	_music.loop_enabled = false
	_music.play()
	if not plan.native:
		_music.jump_to_section(str(plan.from))
	_music.seek_tick(int(plan.start_tick))
	if not plan.native:
		_music.queue_section(str(plan.to), _music.TransitionBoundary.NEXT_SECTION)
	_active = true
	status_changed.emit("Playing prepared passage. Listen for the boundary and level change; audio quality not checked.")
	return {"ok": true, "preparation": report, "range": plan.duplicate()}


func stop(notify := true) -> void:
	_generation += 1
	_preparing = false
	_active = false
	busy_changed.emit(false)
	if is_instance_valid(_music):
		_music.cancel_audio_prewarm()
		_music.stop()
	if notify:
		status_changed.emit("Stopped. Original chart and playback profile unchanged.")


func is_busy() -> bool:
	return _preparing or _active


func diagnostics() -> Dictionary:
	return {"preparing": _preparing, "playing": _active, "transitioned": _transitioned, "range": _plan.duplicate(),
		"tick": _music.current_tick if is_instance_valid(_music) else 0, "preparation": _last_report.duplicate()}


func _process(_delta: float) -> void:
	if not _active or not _transitioned:
		return
	var progress := _playback_progress()
	var end_seconds := float(_plan.end_seconds)
	if (progress.playing and float(progress.seconds) >= end_seconds) or (not progress.playing and int(progress.assigned) > 0 and _music.chart.tick_to_seconds(float(_music.current_tick)) >= end_seconds):
		stop(false)
		status_changed.emit("Audition complete. Source tails only; no automatic quality finding.")


func _playback_progress() -> Dictionary:
	return _music.prepared_playback_progress()


func _section_started(section_id: String) -> void:
	if _active and not _transitioned and section_id == str(_plan.get("to", "")):
		_transitioned = true


func _prepare(plan: Dictionary) -> Dictionary:
	return await _music.prewarm_arrangement_async() if plan.native else await _music.prewarm_sections_async([str(plan.from), str(plan.to)])


func _create_conductor() -> PocketChordsmithConductor:
	return Music.new()


func _collect_streams(value, streams: Array) -> void:
	if value is Dictionary:
		for nested in value.values():
			if nested is AudioStream:
				streams.append(nested)


func _unsupported_stream(stream: AudioStream) -> bool:
	if stream is AudioStreamInteractive or stream.get_length() <= 0.0:
		return true
	if stream is AudioStreamWAV:
		return stream.loop_mode != AudioStreamWAV.LOOP_DISABLED
	if stream is AudioStreamOggVorbis or stream is AudioStreamMP3:
		return stream.loop
	return true # Only finite seekable prepared file formats are supported here.


func _occurrence(chart: Resource, section_id: String) -> Dictionary:
	for row in chart.arrangement_positions:
		if str(row.get("id", "")) == section_id:
			return row
	return {}


func _source_signature(chart: Resource, profile: Resource) -> int:
	var values: Array = [chart.get_instance_id(), chart.bpm, chart.time_signature, chart.arrangement_positions, chart.native_timeline, profile.get_instance_id()]
	for property in profile.get_property_list():
		if int(property.usage) & PROPERTY_USAGE_STORAGE:
			values.append([property.name, profile.get(property.name)])
	_append_asset_metadata(profile.stem_paths, values)
	_append_asset_metadata(profile.section_stem_sets, values)
	_append_asset_metadata(profile.stem_sets, values)
	return hash(values)


func _append_asset_metadata(value, values: Array, depth := 0) -> void:
	if depth > 4:
		return
	if value is Dictionary:
		for nested in value.values():
			_append_asset_metadata(nested, values, depth + 1)
	elif value is String and FileAccess.file_exists(value):
		var file := FileAccess.open(value, FileAccess.READ)
		values.append([value, FileAccess.get_modified_time(value), file.get_length() if file != null else -1])


func _watch_sources(chart: Resource, profile: Resource) -> void:
	_disconnect_sources()
	_source_chart = chart
	_source_profile = profile
	_source_chart.changed.connect(_source_changed)
	_source_profile.changed.connect(_source_changed)
	_watch_streams(profile.stem_paths)
	_watch_streams(profile.section_stem_sets)
	_watch_streams(profile.stem_sets)


func _watch_streams(value, depth := 0) -> void:
	if depth > 4:
		return
	if value is Dictionary:
		for nested in value.values():
			_watch_streams(nested, depth + 1)
	elif value is AudioStream and value not in _watched_streams:
		_watched_streams.append(value)
		value.changed.connect(_source_changed)


func _source_changed() -> void:
	stop(false)
	_signature = 0
	status_changed.emit("Chart/profile changed. Hear this bit again after preparing the current audio.")


func invalidate_assets() -> void:
	_source_changed()


func _disconnect_sources() -> void:
	for source in [_source_chart, _source_profile] + _watched_streams:
		if source != null and source.changed.is_connected(_source_changed):
			source.changed.disconnect(_source_changed)
	_watched_streams.clear()


func _exit_tree() -> void:
	stop(false)
	_disconnect_sources()
