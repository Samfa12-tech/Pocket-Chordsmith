@tool
extends RefCounted
class_name PCSValidator

const SECTION_IDS := ["A", "B", "C", "D", "E", "F", "G", "H"]
const TRACK_IDS := ["kick", "snare", "hat", "bass"]
const RECOMMENDED_MUSIC_BUSES := [
	"Music_Master",
	"Music_Drums",
	"Music_Bass",
	"Music_Chords",
	"Music_Guitar",
	"Music_Melody",
	"Music_Stingers",
	"Music_FX",
]


func validate_project(project: Dictionary) -> Dictionary:
	var warnings: Array[String] = []
	var errors: Array[String] = []

	if project.is_empty():
		errors.append("Project is empty after import.")
		return {"warnings": warnings, "errors": errors}

	if int(project.get("bpm", 0)) <= 0:
		errors.append("Project BPM must be greater than zero.")
	if int(project.get("timeSig", 0)) <= 0:
		errors.append("Project timeSig must be greater than zero.")
	if int(project.get("resolution", 0)) <= 0:
		errors.append("Project resolution must be greater than zero.")

	var sequence: Array = project.get("songSequence", [])
	if sequence.is_empty():
		warnings.append("Song sequence is empty; runtime playback will use Section A.")
	for section_id in sequence:
		if not SECTION_IDS.has(str(section_id)):
			errors.append("Song sequence contains unsupported section '%s'." % str(section_id))

	var section_bars: Dictionary = project.get("sectionBars", {})
	for section_id in SECTION_IDS:
		if not section_bars.has(section_id):
			warnings.append("Missing sectionBars.%s; compiler will use 4 bars." % section_id)
		var grid = project.get("grid%s" % section_id, {})
		if not (grid is Dictionary):
			errors.append("Section %s grid is not a dictionary." % section_id)
			continue
		for track_id in TRACK_IDS:
			if not (grid.get(track_id, []) is Array):
				errors.append("Section %s grid.%s is not an array." % [section_id, track_id])
		if bool(project.get("guitarEnabled", false)) and not (project.get("guitarPattern%s" % section_id, []) is Array):
			errors.append("Section %s guitarPattern is not an array." % section_id)

	return {"warnings": warnings, "errors": errors}


func validate_runtime_readiness(chart: PCSChartResource, playback_profile: PCSPlaybackProfile = null) -> Dictionary:
	var warnings: Array[String] = []
	var errors: Array[String] = []
	var info := {}

	if chart == null:
		errors.append("No PCSChartResource assigned.")
		return {"ok": false, "warnings": warnings, "errors": errors, "info": info}

	info["chart_source_path"] = chart.source_path
	info["bpm"] = chart.bpm
	info["time_signature"] = chart.time_signature
	info["swing"] = chart.swing
	info["arrangement"] = chart.arrangement.duplicate()
	info["event_count"] = chart.compiled_events.size()
	info["event_counts_by_type"] = chart.get_event_count_by_type()
	info["music_states"] = chart.music_states.keys()
	info["has_slide_events"] = chart.has_slide_events()

	if chart.bpm <= 0:
		errors.append("Chart BPM must be greater than zero.")
	if chart.time_signature <= 0:
		errors.append("Chart time signature must be greater than zero.")
	if chart.ticks_per_quarter != PCSChartResource.TICKS_PER_QUARTER:
		warnings.append("Chart ticks_per_quarter is %d; Pocket Chordsmith expects %d." % [chart.ticks_per_quarter, PCSChartResource.TICKS_PER_QUARTER])
	if chart.arrangement.is_empty():
		warnings.append("Chart arrangement is empty; conductor will have limited section playback.")
	if chart.sections.is_empty() and chart.section_library.is_empty():
		warnings.append("Chart has no compiled section resources.")
	if chart.compiled_events.is_empty():
		warnings.append("Chart has no compiled events; beat/bar timing can still run, but no cues will emit.")
	if chart.swing > 0.0:
		warnings.append("Chart uses swing %.0f%%. Compiled event ticks preserve swung step timing; check stem alignment if stems were rendered dry/straight." % [chart.swing * 100.0])

	var previous_tick := -1
	for index in range(chart.compiled_events.size()):
		var event: Dictionary = chart.compiled_events[index]
		var tick := int(event.get("tick", 0))
		if tick < previous_tick:
			errors.append("Compiled events are not sorted at index %d." % index)
			break
		previous_tick = tick

	for section_info in chart.arrangement_positions:
		var section_id := str(section_info.get("id", ""))
		var length_ticks := int(section_info.get("length_ticks", 0))
		if section_id.is_empty():
			warnings.append("Arrangement position has an empty section id.")
		if length_ticks <= 0:
			errors.append("Arrangement section %s has invalid length_ticks %d." % [section_id, length_ticks])

	if playback_profile == null:
		warnings.append("No PCSPlaybackProfile assigned; conductor timing still works, but native playback is not configured.")
	else:
		_validate_playback_profile(chart, playback_profile, warnings, errors, info)

	return {"ok": errors.is_empty(), "warnings": warnings, "errors": errors, "info": info}


func _validate_playback_profile(chart: PCSChartResource, playback_profile: PCSPlaybackProfile, warnings: Array[String], _errors: Array[String], info: Dictionary) -> void:
	var backend_name: String = str(PCSPlaybackProfile.PlaybackBackend.keys()[playback_profile.playback_backend])
	info["playback_backend"] = backend_name
	info["max_polyphony"] = playback_profile.max_polyphony
	info["mobile_safe"] = playback_profile.mobile_safe
	info["stem_count"] = playback_profile.stem_paths.size()
	info["drum_kit_count"] = playback_profile.drum_kit.size()
	info["accent_stream_count"] = playback_profile.accent_streams.size()
	info["marker_stinger_count"] = playback_profile.marker_stingers.size()

	if playback_profile.max_events_per_frame <= 0:
		warnings.append("Playback profile max_events_per_frame should be greater than zero.")
	if playback_profile.max_polyphony <= 0:
		warnings.append("Playback profile max_polyphony should be greater than zero.")
	if playback_profile.mobile_safe and playback_profile.max_polyphony > 32:
		warnings.append("Mobile-safe profile has max_polyphony above 32.")

	if playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.STEM_SYNC:
		var has_stems := not playback_profile.stem_paths.is_empty() or not playback_profile.stem_sets.is_empty() or not chart.stem_sets.is_empty()
		if not has_stems:
			warnings.append("Profile is STEM_SYNC, but no stems are assigned.")

	if playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.HYBRID:
		var has_hybrid_audio := not playback_profile.stem_paths.is_empty() or not playback_profile.stem_sets.is_empty() or not playback_profile.drum_kit.is_empty() or not playback_profile.accent_streams.is_empty() or not playback_profile.event_sample_streams.is_empty()
		if not has_hybrid_audio:
			warnings.append("Profile is HYBRID, but no stems, drum kit, accent samples, or event samples are assigned.")

	var missing_sample_keys := _missing_drum_sample_keys(chart, playback_profile)
	for key in missing_sample_keys:
		warnings.append("Drum event '%s' has no sample assigned in playback_profile.drum_kit." % key)
	info["missing_drum_sample_keys"] = missing_sample_keys

	var missing_stingers := _missing_stinger_keys(chart, playback_profile)
	for key in missing_stingers:
		warnings.append("Stinger '%s' is referenced by the chart/profile but is missing from playback_profile.accent_streams." % key)
	info["missing_stinger_keys"] = missing_stingers

	var missing_state_stems := _missing_state_stem_sets(chart, playback_profile)
	for key in missing_state_stems:
		warnings.append("State stem set '%s' is referenced but not assigned in playback_profile.stem_sets or chart.stem_sets." % key)
	info["missing_state_stem_sets"] = missing_state_stems

	if chart.has_slide_events() and playback_profile.sample_preview_enabled and playback_profile.sample_preview_tonal_enabled:
		warnings.append("Chart includes bass/melody slide events. The sample preview preserves slide metadata but cannot reproduce continuous pitch glides; use stems or a native audio router for accurate slides.")

	if playback_profile.lookahead_ticks <= 0 and playback_profile.is_event_mode_enabled():
		warnings.append("Playback profile lookahead_ticks is 0; sample preview hits will be triggered on the frame they become due.")

	for key in playback_profile.drum_kit.keys():
		_warn_missing_resource("drum_kit.%s" % str(key), playback_profile.drum_kit[key], warnings)
	for key in playback_profile.accent_streams.keys():
		_warn_missing_resource("accent_streams.%s" % str(key), playback_profile.accent_streams[key], warnings)
	for key in playback_profile.event_sample_streams.keys():
		_warn_missing_resource("event_sample_streams.%s" % str(key), playback_profile.event_sample_streams[key], warnings)
	for key in playback_profile.stem_paths.keys():
		_warn_missing_resource("stem_paths.%s" % str(key), playback_profile.stem_paths[key], warnings)

	if Engine.is_editor_hint():
		for bus_name in _profile_bus_names(playback_profile):
			if not bus_name.is_empty() and AudioServer.get_bus_index(bus_name) == -1:
				warnings.append("Audio bus '%s' does not exist yet. Use Create Chordsmith Audio Buses or choose an existing bus." % bus_name)


func _missing_drum_sample_keys(chart: PCSChartResource, playback_profile: PCSPlaybackProfile) -> Array[String]:
	var missing: Array[String] = []
	var seen := {}
	for event in chart.compiled_events:
		if str(event.get("track_type", "")) != "drum":
			continue
		var instrument_id := str(event.get("instrument_id", ""))
		var flags: Dictionary = event.get("flags", {})
		var sample_key := instrument_id
		if bool(flags.get("accent", false)) and playback_profile.drum_kit.has("%s_accent" % instrument_id):
			sample_key = "%s_accent" % instrument_id
		if not playback_profile.drum_kit.has(sample_key) or str(playback_profile.drum_kit.get(sample_key, "")).is_empty():
			seen[sample_key] = true
	for key in seen.keys():
		missing.append(str(key))
	missing.sort()
	return missing


func _missing_stinger_keys(chart: PCSChartResource, playback_profile: PCSPlaybackProfile) -> Array[String]:
	var missing: Array[String] = []
	var seen := {}
	for state_name in chart.music_states.keys():
		var state = chart.music_states[state_name]
		if not (state is Dictionary):
			continue
		var stinger := str(state.get("stinger", ""))
		if not stinger.is_empty() and _profile_path_missing(playback_profile.accent_streams, stinger):
			seen[stinger] = true
	for marker_name in playback_profile.marker_stingers.keys():
		var stinger_name := str(playback_profile.marker_stingers[marker_name])
		if not stinger_name.is_empty() and _profile_path_missing(playback_profile.accent_streams, stinger_name):
			seen[stinger_name] = true
	for key in seen.keys():
		missing.append(str(key))
	missing.sort()
	return missing


func _missing_state_stem_sets(chart: PCSChartResource, playback_profile: PCSPlaybackProfile) -> Array[String]:
	var missing: Array[String] = []
	var seen := {}
	for state_name in playback_profile.state_stem_sets.keys():
		var set_key := str(playback_profile.state_stem_sets[state_name])
		if not set_key.is_empty() and not playback_profile.stem_sets.has(set_key) and not chart.stem_sets.has(set_key):
			seen[set_key] = true
	for state_name in chart.music_states.keys():
		var state = chart.music_states[state_name]
		if not (state is Dictionary):
			continue
		for field in ["stem_set", "stem_set_key", "stem_set_id"]:
			var set_key := str(state.get(field, ""))
			if not set_key.is_empty() and not playback_profile.stem_sets.has(set_key) and not chart.stem_sets.has(set_key):
				seen[set_key] = true
	for key in seen.keys():
		missing.append(str(key))
	missing.sort()
	return missing


func _profile_path_missing(map: Dictionary, key: String) -> bool:
	return not map.has(key) or str(map.get(key, "")).is_empty()


func _warn_missing_resource(label: String, value: Variant, warnings: Array[String]) -> void:
	var path := str(value)
	if path.is_empty():
		return
	if path.begins_with("res://") or path.begins_with("user://"):
		if not ResourceLoader.exists(path):
			warnings.append("Assigned audio resource does not exist: %s = %s" % [label, path])
		return
	if not FileAccess.file_exists(path):
		warnings.append("Assigned audio file does not exist: %s = %s" % [label, path])


func _profile_bus_names(playback_profile: PCSPlaybackProfile) -> Array[String]:
	var names: Array[String] = []
	for value in [
		playback_profile.master_music_bus,
		playback_profile.drums_bus,
		playback_profile.bass_bus,
		playback_profile.chords_bus,
		playback_profile.guitar_bus,
		playback_profile.melody_bus,
		playback_profile.stingers_bus,
		playback_profile.fx_bus,
		playback_profile.accent_bus_name,
		playback_profile.music_bus_name,
	]:
		var bus_name := str(value)
		if not names.has(bus_name):
			names.append(bus_name)
	for bus_name in playback_profile.stem_bus_names.values():
		var stem_bus := str(bus_name)
		if not names.has(stem_bus):
			names.append(stem_bus)
	return names
