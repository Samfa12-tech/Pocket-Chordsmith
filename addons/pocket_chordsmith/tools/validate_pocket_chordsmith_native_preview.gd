@tool
extends SceneTree

const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const PlaybackProfileScript := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("chart"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var chart_path := str(args.get("chart", ""))
	var profile_path := str(args.get("profile", ""))
	var report_path := str(args.get("report", ""))
	var max_per_type := max(0, int(args.get("max_per_type", 64)))
	var result := validate_native_preview(chart_path, profile_path, max_per_type, not report_path.is_empty())

	if not report_path.is_empty():
		var file := FileAccess.open(report_path, FileAccess.WRITE)
		if file == null:
			result["ok"] = false
			result["errors"].append("Could not write native preview report: %s" % report_path)
		else:
			file.store_string(JSON.stringify(result, "\t"))
			file.store_string("\n")
			result["report_path"] = report_path

	print("Pocket Chordsmith native preview validation: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	for key in ["chart", "profile", "report_path", "bass_checked", "melody_checked", "guitar_checked", "chord_checked", "bass_peak", "melody_peak", "guitar_peak", "chord_peak"]:
		print("%s: %s" % [key, str(result.get(key, ""))])
	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))

	quit(0 if bool(result.get("ok", false)) else 1)


static func validate_native_preview(chart_path: String, profile_path := "", max_per_type := 64, include_metrics := false) -> Dictionary:
	var result := {
		"ok": false,
		"chart": chart_path,
		"profile": profile_path,
		"bass_checked": 0,
		"melody_checked": 0,
		"guitar_checked": 0,
		"chord_checked": 0,
		"bass_peak": 0.0,
		"melody_peak": 0.0,
		"guitar_peak": 0.0,
		"chord_peak": 0.0,
		"warnings": [],
		"errors": [],
	}
	if include_metrics:
		result["metrics"] = []
	var chart := load(chart_path)
	if chart == null:
		result["errors"].append("Could not load chart: %s" % chart_path)
		return result
	var profile = load(profile_path) if not profile_path.is_empty() else PlaybackProfileScript.new()
	if profile == null:
		result["errors"].append("Could not load playback profile: %s" % profile_path)
		return result

	var conductor = ConductorScript.new()
	conductor.chart = chart
	conductor.playback_profile = profile

	var seen := {}
	for event_index in range(chart.compiled_events.size()):
		var event: Dictionary = chart.compiled_events[event_index]
		var track_type := str(event.get("track_type", ""))
		if track_type != "bass" and track_type != "melody" and track_type != "guitar" and track_type != "chord":
			continue
		if max_per_type > 0 and int(result.get("%s_checked" % track_type, 0)) >= max_per_type:
			continue
		var key := _event_key(track_type, event)
		if seen.has(key):
			continue
		seen[key] = true
		if track_type == "bass" and bool(profile.get("sample_preview_native_bass_enabled")):
			var bass_stream = conductor._native_bass_stream_for_event(event)
			_validate_stream(result, "bass", bass_stream, false, event, key, event_index, include_metrics)
		elif track_type == "melody" and bool(profile.get("sample_preview_native_melody_enabled")):
			var melody_stream = conductor._native_melody_stream_for_event(event)
			_validate_stream(result, "melody", melody_stream, true, event, key, event_index, include_metrics)
		elif track_type == "guitar" and bool(profile.get("sample_preview_native_guitar_enabled")):
			var guitar_stream = conductor._native_guitar_stream_for_event(event)
			_validate_stream(result, "guitar", guitar_stream, false, event, key, event_index, include_metrics)
		elif track_type == "chord" and bool(profile.get("sample_preview_native_chords_enabled")):
			var chord_stream = conductor._native_chord_stream_for_event(event)
			_validate_stream(result, "chord", chord_stream, false, event, key, event_index, include_metrics)
	conductor._native_bass_stream_cache.clear()
	conductor._native_melody_stream_cache.clear()
	conductor._native_guitar_stream_cache.clear()
	conductor._native_chord_stream_cache.clear()
	conductor._audio_stream_cache.clear()
	conductor.chart = null
	conductor.playback_profile = null
	conductor.free()
	if int(result["bass_checked"]) == 0 and bool(profile.get("sample_preview_native_bass_enabled")):
		result["warnings"].append("No bass events were checked.")
	if int(result["melody_checked"]) == 0 and bool(profile.get("sample_preview_native_melody_enabled")):
		result["warnings"].append("No melody events were checked.")
	if int(result["guitar_checked"]) == 0 and bool(profile.get("sample_preview_native_guitar_enabled")):
		result["warnings"].append("No guitar events were checked.")
	if int(result["chord_checked"]) == 0 and bool(profile.get("sample_preview_native_chords_enabled")):
		result["warnings"].append("No chord events were checked.")
	result["ok"] = result["errors"].is_empty()
	return result


static func _validate_stream(result: Dictionary, track_type: String, stream, expect_stereo: bool, event := {}, event_key := "", event_index := -1, include_metrics := false) -> void:
	result["%s_checked" % track_type] = int(result.get("%s_checked" % track_type, 0)) + 1
	if not (stream is AudioStreamWAV):
		result["errors"].append("%s native preview did not return an AudioStreamWAV." % track_type)
		return
	if stream.data.is_empty():
		result["errors"].append("%s native preview returned an empty WAV stream." % track_type)
	var metrics := _wav_metrics(stream.data, bool(stream.stereo), int(stream.mix_rate))
	var peak := float(metrics.get("peak", 0.0))
	result["%s_peak" % track_type] = max(float(result.get("%s_peak" % track_type, 0.0)), peak)
	if include_metrics and result.has("metrics"):
		metrics.merge(_event_metrics(track_type, event, event_key, event_index), true)
		result["metrics"].append(metrics)
	if peak < 0.001:
		result["errors"].append("%s native preview returned near-silent audio (peak %.6f)." % [track_type, peak])
	if int(stream.mix_rate) <= 0:
		result["errors"].append("%s native preview returned an invalid mix rate." % track_type)
	if bool(stream.stereo) != expect_stereo:
		result["errors"].append("%s native preview stereo flag was %s, expected %s." % [track_type, str(stream.stereo), str(expect_stereo)])


static func _wav_metrics(data: PackedByteArray, stereo: bool, mix_rate: int) -> Dictionary:
	var peak := 0.0
	var sum_squares := 0.0
	var sum_abs_delta := 0.0
	var zero_crossings := 0
	var channels := 2 if stereo else 1
	var frame_count := int(data.size() / max(1, channels * 2))
	for channel in range(channels):
		var previous_value := 0.0
		var has_previous := false
		for frame in range(frame_count):
			var index := (frame * channels + channel) * 2
			var value := _read_i16_le_sample(data, index)
			peak = max(peak, abs(value))
			sum_squares += value * value
			if has_previous:
				sum_abs_delta += abs(value - previous_value)
				if (value >= 0.0 and previous_value < 0.0) or (value < 0.0 and previous_value >= 0.0):
					zero_crossings += 1
			previous_value = value
			has_previous = true
	var sample_count := frame_count * channels
	var rms := sqrt(sum_squares / float(max(1, sample_count)))
	var comparable_samples := max(1, (frame_count - 1) * channels)
	var active_metrics := _wav_active_metrics(data, channels, frame_count, mix_rate, 0.0001, 0.05)
	return {
		"peak": peak,
		"rms": rms,
		"mean_abs_delta": sum_abs_delta / float(comparable_samples),
		"zero_crossing_rate": float(zero_crossings) / float(comparable_samples),
		"active_duration_seconds": float(active_metrics.get("active_duration_seconds", 0.0)),
		"attack_peak": float(active_metrics.get("attack_peak", 0.0)),
		"attack_rms": float(active_metrics.get("attack_rms", 0.0)),
		"sample_count": sample_count,
		"frame_count": frame_count,
		"duration_seconds": float(frame_count) / float(max(1, mix_rate)),
		"mix_rate": mix_rate,
		"stereo": stereo,
		"byte_count": data.size(),
	}


static func _wav_active_metrics(data: PackedByteArray, channels: int, frame_count: int, mix_rate: int, threshold: float, attack_seconds: float) -> Dictionary:
	var first_active_frame := -1
	var last_active_frame := -1
	for frame in range(frame_count):
		var frame_peak := 0.0
		for channel in range(channels):
			var index := (frame * channels + channel) * 2
			frame_peak = max(frame_peak, abs(_read_i16_le_sample(data, index)))
		if frame_peak >= threshold:
			if first_active_frame < 0:
				first_active_frame = frame
			last_active_frame = frame
	if first_active_frame < 0:
		return {
			"active_duration_seconds": 0.0,
			"attack_peak": 0.0,
			"attack_rms": 0.0,
		}
	var attack_frames := max(1, int(ceil(attack_seconds * float(max(1, mix_rate)))))
	var attack_end_frame = min(frame_count, first_active_frame + attack_frames)
	var attack_peak := 0.0
	var attack_sum_squares := 0.0
	var attack_samples := 0
	for frame in range(first_active_frame, attack_end_frame):
		for channel in range(channels):
			var index := (frame * channels + channel) * 2
			var value := _read_i16_le_sample(data, index)
			attack_peak = max(attack_peak, abs(value))
			attack_sum_squares += value * value
			attack_samples += 1
	return {
		"active_duration_seconds": float(last_active_frame - first_active_frame + 1) / float(max(1, mix_rate)),
		"attack_peak": attack_peak,
		"attack_rms": sqrt(attack_sum_squares / float(max(1, attack_samples))),
	}


static func _read_i16_le_sample(data: PackedByteArray, index: int) -> float:
	if index + 1 >= data.size():
		return 0.0
	var sample := int(data[index]) | (int(data[index + 1]) << 8)
	if sample >= 32768:
		sample -= 65536
	return float(sample) / 32768.0


static func _event_metrics(track_type: String, event: Dictionary, event_key: String, event_index: int) -> Dictionary:
	var flags: Dictionary = event.get("flags", {}) if event.get("flags", {}) is Dictionary else {}
	var out := {
		"track_type": track_type,
		"event_key": event_key,
		"event_index": event_index,
		"tick": int(event.get("tick", 0)),
		"step": int(event.get("step", -1)),
		"duration_ticks": int(event.get("duration_ticks", 0)),
		"midi_note": int(event.get("midi_note", -1)),
		"instrument_id": str(event.get("instrument_id", "")),
		"velocity": float(event.get("velocity", 1.0)),
		"pan": float(event.get("pan", 0.0)),
	}
	for key in ["midi_notes", "tone", "articulation", "direction", "bass_tone", "chord_instrument", "chord_play_mode", "slide", "slide_midi", "slide_offset_ticks", "accent"]:
		if flags.has(key):
			out[key] = flags[key]
	return out


static func _event_key(track_type: String, event: Dictionary) -> String:
	var flags: Dictionary = event.get("flags", {}) if event.get("flags", {}) is Dictionary else {}
	var notes = flags.get("midi_notes", [])
	var note_key := ""
	if notes is Array:
		var parts := []
		for note in notes:
			parts.append(str(int(note)))
		note_key = ",".join(parts)
	var pitch_key := note_key if track_type == "guitar" or track_type == "chord" else str(int(event.get("midi_note", -1)))
	return "%s:%s:%s:%s:%s:%s:%s:%s:%s" % [
		track_type,
		str(event.get("instrument_id", "")),
		pitch_key,
		int(event.get("duration_ticks", 0)),
		str(flags.get("tone", flags.get("slide_midi", ""))),
		str(flags.get("articulation", flags.get("slide_offset_ticks", ""))),
		str(flags.get("chord_instrument", "")),
		str(flags.get("chord_play_mode", "")),
		"%.2f" % float(event.get("pan", 0.0)),
	]


static func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--chart", "-c":
				index += 1
				if index < args.size():
					out["chart"] = str(args[index])
			"--profile", "-p":
				index += 1
				if index < args.size():
					out["profile"] = str(args[index])
			"--max-per-type":
				index += 1
				if index < args.size():
					out["max_per_type"] = int(args[index])
			"--report", "-r":
				index += 1
				if index < args.size():
					out["report"] = str(args[index])
		index += 1
	return out


static func _print_usage() -> void:
	print("Pocket Chordsmith native preview validator")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_native_preview.gd -- --chart <chart.tres> [--profile <profile.tres>] [--max-per-type 64] [--report res://native_preview_report.json]")
