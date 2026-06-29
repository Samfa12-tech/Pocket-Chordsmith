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
	var prefer_native := bool(args.get("prefer_native", false))
	var result := validate_sample_preview(chart_path, profile_path, max_per_type, not report_path.is_empty(), prefer_native)

	if not report_path.is_empty():
		var file := FileAccess.open(report_path, FileAccess.WRITE)
		if file == null:
			result["ok"] = false
			result["errors"].append("Could not write sample preview report: %s" % report_path)
		else:
			file.store_string(JSON.stringify(result, "\t"))
			file.store_string("\n")
			result["report_path"] = report_path

	print("Pocket Chordsmith sample preview validation: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	for key in ["chart", "profile", "preview_mode", "report_path", "bass_checked", "melody_checked", "guitar_checked", "chord_checked", "bass_peak", "melody_peak", "guitar_peak", "chord_peak"]:
		print("%s: %s" % [key, str(result.get(key, ""))])
	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))

	quit(0 if bool(result.get("ok", false)) else 1)


static func validate_sample_preview(chart_path: String, profile_path := "", max_per_type := 64, include_metrics := false, prefer_native := false) -> Dictionary:
	var result := {
		"ok": false,
		"chart": chart_path,
		"profile": profile_path,
		"preview_mode": "native-preferred" if prefer_native else "default-fallback",
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
	conductor.prewarm_audio(false, false)

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
		var stream_info := _preview_stream_for_event(conductor, event, prefer_native)
		var stream = stream_info.get("stream", null)
		if not (stream is AudioStreamWAV):
			_add_error(result, "%s sample preview did not resolve to an AudioStreamWAV." % track_type)
			continue
		var rendered := _render_sample_preview_event(conductor, event, stream, stream_info)
		_validate_rendered(result, track_type, rendered, event, key, event_index, include_metrics)

	conductor._audio_stream_cache.clear()
	conductor.chart = null
	conductor.playback_profile = null
	conductor.free()
	result["ok"] = result["errors"].is_empty()
	return result


static func _preview_stream_for_event(conductor, event: Dictionary, prefer_native := false) -> Dictionary:
	var track_type := str(event.get("track_type", ""))
	if prefer_native and conductor.playback_profile != null and conductor.playback_profile.sample_preview_tonal_enabled:
		if track_type == "bass" and bool(conductor.playback_profile.sample_preview_native_bass_enabled):
			var bass_stream: AudioStream = conductor._native_bass_stream_for_event(event, true)
			if bass_stream != null:
				return {"stream": bass_stream, "native": true, "sample_key": "native:bass"}
		elif track_type == "melody" and bool(conductor.playback_profile.sample_preview_native_melody_enabled):
			var melody_stream: AudioStream = conductor._native_melody_stream_for_event(event, true)
			if melody_stream != null:
				return {"stream": melody_stream, "native": true, "sample_key": "native:melody"}
		elif track_type == "guitar" and bool(conductor.playback_profile.sample_preview_native_guitar_enabled):
			var guitar_stream: AudioStream = conductor._native_guitar_stream_for_event(event, true)
			if guitar_stream != null:
				return {"stream": guitar_stream, "native": true, "sample_key": "native:guitar"}
		elif track_type == "chord" and bool(conductor.playback_profile.sample_preview_native_chords_enabled):
			var chord_stream: AudioStream = conductor._native_chord_stream_for_event(event, true)
			if chord_stream != null:
				return {"stream": chord_stream, "native": true, "sample_key": "native:chord"}
	var sample_key: String = str(conductor._sample_key_for_event(event))
	return {"stream": conductor._sample_stream_for_key(sample_key), "native": false, "sample_key": sample_key}


static func _render_sample_preview_event(conductor, event: Dictionary, stream: AudioStreamWAV, stream_info: Dictionary) -> Dictionary:
	var source := _decode_wav(stream)
	var track_type := str(event.get("track_type", ""))
	var flags: Dictionary = event.get("flags", {}) if event.get("flags", {}) is Dictionary else {}
	var sample_key: String = str(stream_info.get("sample_key", conductor._sample_key_for_event(event)))
	var uses_native := bool(stream_info.get("native", false))
	var event_gain := db_to_linear(_sample_preview_volume_db_for_event(conductor, event, sample_key, uses_native))
	var notes: Array = flags.get("midi_notes", [int(event.get("midi_note", 60))])
	var voices := []
	if uses_native:
		voices.append({
			"pitch_scale": 1.0,
			"delay_seconds": 0.0,
			"gain": event_gain,
		})
	elif track_type == "chord" or track_type == "guitar":
		if track_type == "guitar":
			notes = conductor._ordered_guitar_preview_notes(notes, flags)
		var max_notes: int = int(conductor.playback_profile.sample_preview_max_chord_notes)
		if track_type == "guitar":
			max_notes = max(max_notes, 3)
		if max_notes > 0 and notes.size() > max_notes:
			notes = notes.slice(0, max_notes)
		for note_index in range(notes.size()):
			var midi_note := int(notes[note_index])
			var delay: float = float(conductor._preview_chord_note_delay_seconds(flags, note_index, track_type))
			voices.append({
				"pitch_scale": pow(2.0, float(midi_note - 60) / 12.0),
				"delay_seconds": delay,
				"gain": event_gain,
			})
	else:
		voices.append({
			"pitch_scale": conductor._sample_pitch_scale_for_event(event),
			"delay_seconds": 0.0,
			"gain": event_gain,
		})
	return _mix_sample_voices(source, voices)


static func _sample_preview_volume_db_for_event(conductor, event: Dictionary, sample_key: String, uses_native := false) -> float:
	var track_type := str(event.get("track_type", ""))
	var default_velocity := 100
	if uses_native and track_type == "guitar":
		default_velocity = 86
	elif uses_native and track_type == "chord":
		default_velocity = 76
	var velocity := clamp(float(event.get("velocity", default_velocity)) / 127.0, 0.0, 1.0)
	var volume_db := lerp(-18.0, 0.0, velocity) if conductor.playback_profile.sample_preview_velocity_scale else 0.0
	var layer := str(conductor._sample_preview_layer_for_event(event))
	if uses_native:
		match track_type:
			"bass":
				volume_db += float(conductor.playback_profile.sample_preview_native_bass_gain_db) + float(conductor._chart_mix_gain_db(layer))
			"melody":
				volume_db += float(conductor.playback_profile.sample_preview_native_melody_gain_db) + float(conductor._chart_mix_gain_db(layer))
			"guitar":
				volume_db += float(conductor.playback_profile.sample_preview_native_guitar_gain_db) + float(conductor._chart_mix_gain_db(layer))
			"chord":
				volume_db += float(conductor.playback_profile.sample_preview_native_chords_gain_db) + float(conductor._chart_mix_gain_db(layer))
			_:
				volume_db += float(conductor._sample_preview_gain_db(layer, sample_key))
	else:
		volume_db += float(conductor._sample_preview_gain_db(layer, sample_key))
	return volume_db


static func _decode_wav(stream: AudioStreamWAV) -> Dictionary:
	var channels := 2 if bool(stream.stereo) else 1
	var data: PackedByteArray = stream.data
	var frame_count := int(data.size() / max(1, channels * 2))
	var samples := PackedFloat32Array()
	samples.resize(frame_count * channels)
	for frame in range(frame_count):
		for channel in range(channels):
			var source_index := (frame * channels + channel) * 2
			samples[frame * channels + channel] = _read_i16_le_sample(data, source_index)
	return {
		"samples": samples,
		"channels": channels,
		"frame_count": frame_count,
		"mix_rate": int(stream.mix_rate),
	}


static func _mix_sample_voices(source: Dictionary, voices: Array) -> Dictionary:
	var channels := int(source.get("channels", 1))
	var source_samples: PackedFloat32Array = source.get("samples", PackedFloat32Array())
	var source_frames := int(source.get("frame_count", 0))
	var mix_rate := max(1, int(source.get("mix_rate", 44100)))
	var output_frames := 1
	for voice in voices:
		var pitch_scale := max(0.05, float(voice.get("pitch_scale", 1.0)))
		var delay_frames := max(0, int(round(float(voice.get("delay_seconds", 0.0)) * float(mix_rate))))
		output_frames = max(output_frames, delay_frames + int(ceil(float(source_frames) / pitch_scale)))
	var out := PackedFloat32Array()
	out.resize(output_frames * channels)
	for voice in voices:
		var pitch_scale := max(0.05, float(voice.get("pitch_scale", 1.0)))
		var delay_frames := max(0, int(round(float(voice.get("delay_seconds", 0.0)) * float(mix_rate))))
		var gain := float(voice.get("gain", 1.0))
		for frame in range(output_frames - delay_frames):
			var source_pos: float = float(frame) * pitch_scale
			if source_pos >= float(max(0, source_frames - 1)):
				break
			var lower := int(floor(source_pos))
			var upper := min(source_frames - 1, lower + 1)
			var amount: float = source_pos - float(lower)
			for channel in range(channels):
				var a := source_samples[lower * channels + channel]
				var b := source_samples[upper * channels + channel]
				var value: float = lerp(a, b, amount) * gain
				var out_index: int = (delay_frames + frame) * channels + channel
				out[out_index] = clamp(out[out_index] + value, -1.0, 1.0)
	return {
		"samples": out,
		"channels": channels,
		"frame_count": output_frames,
		"mix_rate": mix_rate,
	}


static func _validate_rendered(result: Dictionary, track_type: String, rendered: Dictionary, event := {}, event_key := "", event_index := -1, include_metrics := false) -> void:
	result["%s_checked" % track_type] = int(result.get("%s_checked" % track_type, 0)) + 1
	var metrics := _sample_metrics(rendered)
	var peak := float(metrics.get("peak", 0.0))
	result["%s_peak" % track_type] = max(float(result.get("%s_peak" % track_type, 0.0)), peak)
	if include_metrics and result.has("metrics"):
		metrics.merge(_event_metrics(track_type, event, event_key, event_index), true)
		result["metrics"].append(metrics)
	if peak < 0.001:
		_add_error(result, "%s sample preview returned near-silent audio (peak %.6f)." % [track_type, peak])


static func _sample_metrics(rendered: Dictionary) -> Dictionary:
	var samples: PackedFloat32Array = rendered.get("samples", PackedFloat32Array())
	var channels := max(1, int(rendered.get("channels", 1)))
	var frame_count := max(0, int(rendered.get("frame_count", int(samples.size() / channels))))
	var mix_rate := max(1, int(rendered.get("mix_rate", 44100)))
	var peak := 0.0
	var sum_squares := 0.0
	var sum_abs_delta := 0.0
	var zero_crossings := 0
	var previous_values := []
	previous_values.resize(channels)
	var has_previous := []
	has_previous.resize(channels)
	for channel in range(channels):
		previous_values[channel] = 0.0
		has_previous[channel] = false
	for frame in range(frame_count):
		for channel in range(channels):
			var index: int = frame * channels + channel
			if index >= samples.size():
				continue
			var value := float(samples[index])
			peak = max(peak, absf(value))
			sum_squares += value * value
			if bool(has_previous[channel]):
				var previous_value := float(previous_values[channel])
				sum_abs_delta += absf(value - previous_value)
				if (value >= 0.0 and previous_value < 0.0) or (value < 0.0 and previous_value >= 0.0):
					zero_crossings += 1
			previous_values[channel] = value
			has_previous[channel] = true
	var sample_count := samples.size()
	var delta_count := max(1, max(0, frame_count - 1) * channels)
	var active_metrics := _active_metrics(samples, channels, frame_count, mix_rate, 0.0001, 0.05)
	return {
		"peak": peak,
		"rms": sqrt(sum_squares / float(max(1, sample_count))),
		"mean_abs_delta": sum_abs_delta / float(delta_count),
		"zero_crossing_rate": float(zero_crossings) / float(delta_count),
		"active_duration_seconds": float(active_metrics.get("active_duration_seconds", 0.0)),
		"attack_peak": float(active_metrics.get("attack_peak", 0.0)),
		"attack_rms": float(active_metrics.get("attack_rms", 0.0)),
		"sample_count": sample_count,
		"frame_count": frame_count,
		"duration_seconds": float(frame_count) / float(mix_rate),
		"mix_rate": mix_rate,
		"stereo": channels == 2,
	}


static func _active_metrics(samples: PackedFloat32Array, channels: int, frame_count: int, mix_rate: int, threshold: float, attack_seconds: float) -> Dictionary:
	var first_active_frame := -1
	var last_active_frame := -1
	for frame in range(frame_count):
		var frame_peak := 0.0
		for channel in range(channels):
			frame_peak = max(frame_peak, absf(float(samples[frame * channels + channel])))
		if frame_peak >= threshold:
			if first_active_frame < 0:
				first_active_frame = frame
			last_active_frame = frame
	if first_active_frame < 0:
		return {"active_duration_seconds": 0.0, "attack_peak": 0.0, "attack_rms": 0.0}
	var attack_frames := max(1, int(ceil(attack_seconds * float(max(1, mix_rate)))))
	var attack_end_frame = min(frame_count, first_active_frame + attack_frames)
	var attack_peak := 0.0
	var attack_sum_squares := 0.0
	var attack_samples := 0
	for frame in range(first_active_frame, attack_end_frame):
		for channel in range(channels):
			var value := float(samples[frame * channels + channel])
			attack_peak = max(attack_peak, absf(value))
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
		"duration_ticks": int(event.get("duration_ticks", 0)),
		"midi_note": int(event.get("midi_note", -1)),
		"instrument_id": str(event.get("instrument_id", "")),
		"flags": {},
	}
	for key in ["midi_notes", "tone", "articulation", "direction", "bass_tone", "chord_instrument", "chord_play_mode", "slide", "slide_midi", "slide_offset_ticks", "accent"]:
		if flags.has(key):
			out["flags"][key] = flags[key]
	return out


static func _event_key(track_type: String, event: Dictionary) -> String:
	var flags: Dictionary = event.get("flags", {}) if event.get("flags", {}) is Dictionary else {}
	var notes = flags.get("midi_notes", [])
	var note_key := ",".join(Array(notes).map(func(value): return str(int(value)))) if notes is Array else ""
	var pitch_key := note_key if track_type == "guitar" or track_type == "chord" else str(int(event.get("midi_note", -1)))
	return "|".join([
		track_type,
		str(event.get("instrument_id", "")),
		pitch_key,
		str(int(event.get("duration_ticks", 0))),
		str(flags),
	])


static func _add_error(result: Dictionary, message: String) -> void:
	if not result.has("errors"):
		result["errors"] = []
	result["errors"].append(message)


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
			"--report", "-r":
				index += 1
				if index < args.size():
					out["report"] = str(args[index])
			"--max-per-type":
				index += 1
				if index < args.size():
					out["max_per_type"] = int(args[index])
			"--prefer-native":
				out["prefer_native"] = true
		index += 1
	return out


static func _print_usage() -> void:
	print("Pocket Chordsmith sample preview validator")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_sample_preview.gd -- --chart <chart.tres> [--profile <profile.tres>] [--max-per-type 64] [--report res://sample_preview_report.json]")
	print("  Add --prefer-native to measure explicitly prewarmed native tonal preview streams instead of the cold editor fallback path.")
