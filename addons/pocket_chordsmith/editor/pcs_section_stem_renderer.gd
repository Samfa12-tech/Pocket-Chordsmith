@tool
extends RefCounted
class_name PCSSectionStemRenderer

const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const PlaybackProfile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")

const SAMPLE_RATE := 44100
const CHANNELS := 2
const RENDER_TAIL_SECONDS := 1.25
const LAYERS := ["drums", "bass", "chords", "guitar", "melody"]


func build_render_jobs(chart, output_root: String) -> Array[Dictionary]:
	var jobs: Array[Dictionary] = []
	if chart == null:
		return jobs
	var safe_root := output_root.strip_edges().replace("\\", "/")
	if safe_root.is_empty():
		return jobs

	var full_start := 0
	var full_end := int(chart.get_length_ticks())
	if full_end <= 0:
		for event in chart.compiled_events:
			full_end = max(full_end, int(event.get("tick", 0)) + int(event.get("duration_ticks", 1)))
	for index in range(chart.arrangement_positions.size()):
		var section_info: Dictionary = chart.arrangement_positions[index]
		var section_id := str(section_info.get("id", "section"))
		var start_tick := int(section_info.get("start_tick", 0))
		var length_ticks := int(section_info.get("length_ticks", 0))
		if length_ticks <= 0:
			continue
		var section_key := "%02d_%s" % [index + 1, _safe_stem(section_id)]
		for layer in LAYERS:
			if not _has_layer_events(chart, layer, start_tick, start_tick + length_ticks):
				continue
			jobs.append({
				"scope": "section",
				"key": section_key,
				"section_id": section_id,
				"arrangement_index": index,
				"layer": layer,
				"label": "section %s %s stem" % [section_key, layer],
				"start_tick": start_tick,
				"end_tick": start_tick + length_ticks,
				"path": _join_path(safe_root, "sections/%s/%s.wav" % [section_key, layer]),
			})
	for layer in LAYERS:
		if not _has_layer_events(chart, layer, full_start, full_end):
			continue
		jobs.append({
			"scope": "full",
			"key": "full",
			"layer": layer,
			"label": "full song %s stem" % layer,
			"start_tick": full_start,
			"end_tick": full_end,
			"path": _join_path(safe_root, "full/%s.wav" % layer),
		})
	return jobs


func render_job(chart, playback_profile, conductor, job: Dictionary, options := {}) -> Dictionary:
	var result := {
		"ok": false,
		"path": str(job.get("path", "")),
		"warnings": [],
		"errors": [],
		"event_count": 0,
	}
	if chart == null:
		result["errors"].append("No chart assigned.")
		return result
	if playback_profile == null:
		result["errors"].append("No playback profile assigned.")
		return result
	if conductor == null:
		conductor = ConductorScript.new()
	conductor.chart = chart
	conductor.playback_profile = playback_profile

	var layer := str(job.get("layer", ""))
	var start_tick := int(job.get("start_tick", 0))
	var end_tick := int(job.get("end_tick", 0))
	if end_tick <= start_tick:
		result["errors"].append("Render job has no duration: %s" % str(job))
		return result

	var duration_seconds: float = float(end_tick - start_tick) * float(chart.get_seconds_per_tick())
	var frame_count := max(1, int(ceil((duration_seconds + RENDER_TAIL_SECONDS) * float(SAMPLE_RATE))))
	var mix := PackedFloat32Array()
	mix.resize(frame_count * CHANNELS)
	for event in chart.compiled_events:
		var tick := int(event.get("tick", 0))
		if tick < start_tick or tick >= end_tick:
			continue
		if _layer_for_event(event) != layer:
			continue
		var rendered := _render_event(conductor, event, options)
		if not bool(rendered.get("ok", false)):
			result["warnings"].append_array(rendered.get("warnings", []))
			continue
		var start_frame := max(0, int(round(float(tick - start_tick) * chart.get_seconds_per_tick() * float(SAMPLE_RATE))))
		_mix_into(mix, frame_count, rendered, start_frame)
		result["event_count"] = int(result["event_count"]) + 1

	if int(result["event_count"]) <= 0:
		result["warnings"].append("No %s events found in %s." % [layer, str(job.get("label", "job"))])

	var path := str(job.get("path", ""))
	var write_error := _write_wav(path, mix, SAMPLE_RATE, CHANNELS)
	if write_error != OK:
		result["errors"].append("Could not write %s: %s" % [path, error_string(write_error)])
		return result
	result["ok"] = result["errors"].is_empty()
	return result


func create_rendered_profile(source_profile, full_stem_paths: Dictionary, section_stem_sets: Dictionary) -> Resource:
	var profile = source_profile.duplicate(true) if source_profile != null else PlaybackProfile.new()
	profile.playback_backend = PlaybackProfile.PlaybackBackend.STEM_SYNC
	profile.sample_preview_enabled = false
	profile.use_audio_stream_synchronized = false
	profile.stem_paths = full_stem_paths.duplicate(true)
	profile.stem_sets = section_stem_sets.duplicate(true)
	return profile


static func default_output_root(chart) -> String:
	var source := ""
	if chart != null:
		source = str(chart.source_path)
	var stem := _safe_stem(source.get_file().get_basename() if not source.is_empty() else "pocket_chordsmith_chart")
	if stem.is_empty():
		stem = "pocket_chordsmith_chart"
	return "res://music/pocket_chordsmith_generated/%s" % stem


static func profile_path_for_output_root(output_root: String) -> String:
	return _join_path(output_root, "rendered_preview_profile.tres")


static func _render_event(conductor, event: Dictionary, options := {}) -> Dictionary:
	var track_type := str(event.get("track_type", ""))
	var stream_info := _stream_info_for_event(conductor, event, bool(options.get("prefer_native", false)))
	var stream = stream_info.get("stream", null)
	if not (stream is AudioStreamWAV):
		return {
			"ok": false,
			"warnings": ["Skipped %s event at tick %d because it did not resolve to a WAV stream." % [track_type, int(event.get("tick", 0))]],
		}
	var source := _decode_wav(stream)
	var flags: Dictionary = event.get("flags", {}) if event.get("flags", {}) is Dictionary else {}
	var uses_native := bool(stream_info.get("native", false))
	var sample_key := str(stream_info.get("sample_key", conductor._sample_key_for_event(event)))
	var event_gain := db_to_linear(_volume_db_for_event(conductor, event, sample_key, uses_native))
	var voices: Array[Dictionary] = []
	if uses_native:
		voices.append({"pitch_scale": 1.0, "delay_seconds": 0.0, "gain": event_gain})
	elif track_type == "chord" or track_type == "guitar":
		var notes: Array = flags.get("midi_notes", [int(event.get("midi_note", 60))])
		if track_type == "guitar":
			notes = conductor._ordered_guitar_preview_notes(notes, flags)
		var max_notes := int(conductor.playback_profile.sample_preview_max_chord_notes)
		if track_type == "guitar":
			max_notes = max(max_notes, 3)
		if max_notes > 0 and notes.size() > max_notes:
			notes = notes.slice(0, max_notes)
		for note_index in range(notes.size()):
			var midi_note := int(notes[note_index])
			voices.append({
				"pitch_scale": pow(2.0, float(midi_note - 60) / 12.0),
				"delay_seconds": float(conductor._preview_chord_note_delay_seconds(flags, note_index, track_type)),
				"gain": event_gain,
			})
	else:
		voices.append({
			"pitch_scale": float(conductor._sample_pitch_scale_for_event(event)),
			"delay_seconds": 0.0,
			"gain": event_gain,
		})
	return _mix_voices(source, voices)


static func _stream_info_for_event(conductor, event: Dictionary, prefer_native := false) -> Dictionary:
	var track_type := str(event.get("track_type", ""))
	if prefer_native and conductor.playback_profile != null and bool(conductor.playback_profile.sample_preview_tonal_enabled):
		if track_type == "bass" and bool(conductor.playback_profile.sample_preview_native_bass_enabled):
			var bass_stream: AudioStream = conductor._native_bass_stream_for_event(event, true)
			if bass_stream != null:
				return {"stream": bass_stream, "native": true, "sample_key": "native:bass"}
		if track_type == "melody" and bool(conductor.playback_profile.sample_preview_native_melody_enabled):
			var melody_stream: AudioStream = conductor._native_melody_stream_for_event(event, true)
			if melody_stream != null:
				return {"stream": melody_stream, "native": true, "sample_key": "native:melody"}
		if track_type == "guitar" and bool(conductor.playback_profile.sample_preview_native_guitar_enabled):
			var guitar_stream: AudioStream = conductor._native_guitar_stream_for_event(event, true)
			if guitar_stream != null:
				return {"stream": guitar_stream, "native": true, "sample_key": "native:guitar"}
		if track_type == "chord" and bool(conductor.playback_profile.sample_preview_native_chords_enabled):
			var chord_stream: AudioStream = conductor._native_chord_stream_for_event(event, true)
			if chord_stream != null:
				return {"stream": chord_stream, "native": true, "sample_key": "native:chord"}
	var sample_key: String = str(conductor._sample_key_for_event(event))
	return {"stream": conductor._sample_stream_for_key(sample_key), "native": false, "sample_key": sample_key}


static func _volume_db_for_event(conductor, event: Dictionary, sample_key: String, uses_native: bool) -> float:
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
			var source_index: int = (frame * channels + channel) * 2
			samples[frame * channels + channel] = _read_i16_le_sample(data, source_index)
	return {
		"samples": samples,
		"channels": channels,
		"frame_count": frame_count,
		"mix_rate": int(stream.mix_rate),
	}


static func _mix_voices(source: Dictionary, voices: Array) -> Dictionary:
	var source_channels := max(1, int(source.get("channels", 1)))
	var source_samples: PackedFloat32Array = source.get("samples", PackedFloat32Array())
	var source_frames := int(source.get("frame_count", 0))
	var source_rate := max(1, int(source.get("mix_rate", SAMPLE_RATE)))
	var output_frames := 1
	for voice in voices:
		var pitch_scale := max(0.05, float(voice.get("pitch_scale", 1.0)))
		var delay_frames := max(0, int(round(float(voice.get("delay_seconds", 0.0)) * float(SAMPLE_RATE))))
		output_frames = max(output_frames, delay_frames + int(ceil(float(source_frames) * float(SAMPLE_RATE) / float(source_rate) / pitch_scale)))
	var out := PackedFloat32Array()
	out.resize(output_frames * CHANNELS)
	for voice in voices:
		var pitch_scale := max(0.05, float(voice.get("pitch_scale", 1.0)))
		var delay_frames := max(0, int(round(float(voice.get("delay_seconds", 0.0)) * float(SAMPLE_RATE))))
		var gain := float(voice.get("gain", 1.0))
		for frame in range(output_frames - delay_frames):
			var source_pos: float = float(frame) * float(source_rate) * pitch_scale / float(SAMPLE_RATE)
			if source_pos >= float(max(0, source_frames - 1)):
				break
			var lower := int(floor(source_pos))
			var upper := min(source_frames - 1, lower + 1)
			var amount: float = source_pos - float(lower)
			for channel in range(CHANNELS):
				var source_channel := min(channel, source_channels - 1)
				var a := source_samples[lower * source_channels + source_channel]
				var b := source_samples[upper * source_channels + source_channel]
				out[(delay_frames + frame) * CHANNELS + channel] = clamp(out[(delay_frames + frame) * CHANNELS + channel] + lerp(a, b, amount) * gain, -1.0, 1.0)
	return {"ok": true, "samples": out, "channels": CHANNELS, "frame_count": output_frames, "mix_rate": SAMPLE_RATE, "warnings": []}


static func _mix_into(target: PackedFloat32Array, target_frames: int, rendered: Dictionary, start_frame: int) -> void:
	var samples: PackedFloat32Array = rendered.get("samples", PackedFloat32Array())
	var source_frames: int = int(rendered.get("frame_count", 0))
	var source_channels: int = max(1, int(rendered.get("channels", CHANNELS)))
	for frame in range(source_frames):
		var out_frame: int = start_frame + frame
		if out_frame < 0 or out_frame >= target_frames:
			continue
		for channel in range(CHANNELS):
			var source_channel: int = min(channel, source_channels - 1)
			var target_index: int = out_frame * CHANNELS + channel
			var source_index: int = frame * source_channels + source_channel
			if source_index >= samples.size():
				continue
			target[target_index] = clamp(target[target_index] + samples[source_index], -1.0, 1.0)


static func _write_wav(path: String, samples: PackedFloat32Array, sample_rate: int, channels: int) -> int:
	if path.strip_edges().is_empty():
		return ERR_INVALID_PARAMETER
	var localized := _resource_save_path(path)
	var absolute := ProjectSettings.globalize_path(localized)
	var dir_error := DirAccess.make_dir_recursive_absolute(absolute.get_base_dir())
	if dir_error != OK:
		return dir_error
	var bytes := PackedByteArray()
	var data_size := samples.size() * 2
	bytes.resize(44 + data_size)
	_write_ascii(bytes, 0, "RIFF")
	_write_u32_le(bytes, 4, 36 + data_size)
	_write_ascii(bytes, 8, "WAVE")
	_write_ascii(bytes, 12, "fmt ")
	_write_u32_le(bytes, 16, 16)
	_write_u16_le(bytes, 20, 1)
	_write_u16_le(bytes, 22, channels)
	_write_u32_le(bytes, 24, sample_rate)
	_write_u32_le(bytes, 28, sample_rate * channels * 2)
	_write_u16_le(bytes, 32, channels * 2)
	_write_u16_le(bytes, 34, 16)
	_write_ascii(bytes, 36, "data")
	_write_u32_le(bytes, 40, data_size)
	for i in range(samples.size()):
		_write_i16_le(bytes, 44 + i * 2, samples[i])
	var file := FileAccess.open(localized, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_buffer(bytes)
	file.close()
	return OK


static func _read_i16_le_sample(data: PackedByteArray, offset: int) -> float:
	if offset + 1 >= data.size():
		return 0.0
	var value := int(data[offset]) | (int(data[offset + 1]) << 8)
	if value >= 32768:
		value -= 65536
	return float(value) / 32768.0


static func _write_i16_le(bytes: PackedByteArray, offset: int, sample: float) -> void:
	var value := int(round(clamp(sample, -1.0, 1.0) * 32767.0))
	if value < 0:
		value = 65536 + value
	bytes[offset] = value & 0xff
	bytes[offset + 1] = (value >> 8) & 0xff


static func _write_u16_le(bytes: PackedByteArray, offset: int, value: int) -> void:
	bytes[offset] = value & 0xff
	bytes[offset + 1] = (value >> 8) & 0xff


static func _write_u32_le(bytes: PackedByteArray, offset: int, value: int) -> void:
	bytes[offset] = value & 0xff
	bytes[offset + 1] = (value >> 8) & 0xff
	bytes[offset + 2] = (value >> 16) & 0xff
	bytes[offset + 3] = (value >> 24) & 0xff


static func _write_ascii(bytes: PackedByteArray, offset: int, text: String) -> void:
	for i in range(text.length()):
		bytes[offset + i] = text.unicode_at(i) & 0xff


static func _has_layer_events(chart, layer: String, start_tick: int, end_tick: int) -> bool:
	for event in chart.compiled_events:
		var tick := int(event.get("tick", 0))
		if tick >= start_tick and tick < end_tick and _layer_for_event(event) == layer:
			return true
	return false


static func _layer_for_event(event: Dictionary) -> String:
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
			return ""


static func _join_path(base_path: String, relative_path: String) -> String:
	var base := base_path.strip_edges().replace("\\", "/")
	var relative := relative_path.strip_edges().replace("\\", "/")
	while base.ends_with("/"):
		base = base.substr(0, base.length() - 1)
	while relative.begins_with("/"):
		relative = relative.substr(1)
	if base.is_empty():
		return relative
	if relative.is_empty():
		return base
	return "%s/%s" % [base, relative]


static func _safe_stem(value: String) -> String:
	var out := value.strip_edges().to_snake_case()
	for token in ["\\", "/", ":", "*", "?", "\"", "<", ">", "|", " "]:
		out = out.replace(token, "_")
	return out


static func _resource_save_path(path: String) -> String:
	if path.begins_with("res://") or path.begins_with("user://"):
		return path
	var localized := ProjectSettings.localize_path(path)
	return localized if localized.begins_with("res://") else path
