@tool
extends RefCounted
class_name PCSSoundKitGenerator

const DEFAULT_OUTPUT_DIR := "res://addons/pocket_chordsmith/audio/web_kit"
const SAMPLE_RATE := 44100
const TWO_PI := PI * 2.0
const PlaybackProfileScript := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")


func generate_web_kit(output_dir := DEFAULT_OUTPUT_DIR) -> Dictionary:
	var result := {
		"ok": false,
		"output_dir": output_dir,
		"profile_path": "",
		"samples": {},
		"warnings": [],
		"errors": [],
	}
	var dir_error := _ensure_dir(output_dir)
	if dir_error != OK:
		result["errors"].append("Could not create sound kit folder %s: %s" % [output_dir, error_string(dir_error)])
		return result

	var samples := {
		"kick": _kick(0.95),
		"kick_accent": _kick(1.12),
		"snare": _snare(0.50, 1),
		"snare_accent": _snare(0.72, 2),
		"hat": _hat(0.16, false, 3),
		"open_hat": _hat(0.24, true, 4),
		"hat_accent": _hat(0.24, true, 4),
		"clap": _clap(0.34, 5),
		"bass_tone": _bass_tone(),
		"chord_tone": _chord_tone(),
		"melody_pulse": _melody_pulse(),
		"melody_soft": _melody_soft(),
		"melody_bell": _melody_bell(),
		"warning_hit": _warning_hit(),
		"reward_hit": _reward_hit(),
		"victory_hit": _reward_hit(),
		"transition_hit": _transition_hit(6),
	}

	var sample_paths := {}
	for sample_name in samples.keys():
		var path := output_dir.path_join("%s.wav" % sample_name)
		var error := _write_wav(path, samples[sample_name])
		if error == OK:
			sample_paths[sample_name] = path
		else:
			result["errors"].append("Could not save %s: %s" % [path, error_string(error)])

	if not result["errors"].is_empty():
		return result

	var profile_path := output_dir.path_join("pocket_chordsmith_web_kit_profile.tres")
	var profile_result := _save_profile(profile_path, sample_paths)
	result["warnings"].append_array(profile_result.get("warnings", []))
	result["errors"].append_array(profile_result.get("errors", []))
	result["profile_path"] = profile_path
	result["samples"] = sample_paths
	result["ok"] = result["errors"].is_empty()
	return result


func _save_profile(profile_path: String, sample_paths: Dictionary) -> Dictionary:
	var profile: Resource = PlaybackProfileScript.new()
	profile.playback_backend = PlaybackProfileScript.PlaybackBackend.HYBRID
	profile.max_polyphony = 24
	profile.mobile_safe = true
	profile.sample_preview_enabled = true
	profile.sample_preview_velocity_scale = true
	profile.sample_preview_tonal_enabled = true
	profile.sample_preview_wall_clock_timing = true
	profile.sample_preview_load_wavs_uncompressed = true
	profile.sample_preview_prewarm_on_ready = true
	profile.sample_preview_max_chord_notes = 2
	profile.sample_preview_skip_late_audio_ticks = 960
	profile.sample_preview_bass_duck_on_kick_db = -9.0
	profile.sample_preview_bass_duck_window_ticks = 0
	profile.sample_preview_gain_db = {
		"drums": -3.0,
		"kick": 1.0,
		"kick_accent": 1.0,
		"snare": 0.0,
		"snare_accent": 0.0,
		"hat": -12.0,
		"hat_accent": -13.0,
		"open_hat": -13.0,
		"bass": -6.0,
		"chords": -26.0,
		"melody": -20.0,
		"stingers": -8.0,
	}
	profile.drum_kit = {
		"kick": sample_paths.get("kick", ""),
		"kick_accent": sample_paths.get("kick_accent", ""),
		"snare": sample_paths.get("snare", ""),
		"snare_accent": sample_paths.get("snare_accent", ""),
		"hat": sample_paths.get("hat", ""),
		"hat_accent": sample_paths.get("hat_accent", sample_paths.get("open_hat", "")),
		"open_hat": sample_paths.get("open_hat", ""),
		"clap": sample_paths.get("clap", ""),
	}
	profile.accent_streams = {
		"warning_hit": sample_paths.get("warning_hit", ""),
		"reward_hit": sample_paths.get("reward_hit", ""),
		"victory_hit": sample_paths.get("victory_hit", sample_paths.get("reward_hit", "")),
		"transition_hit": sample_paths.get("transition_hit", ""),
	}
	profile.event_sample_streams = {
		"bass": sample_paths.get("bass_tone", ""),
		"bass:auto_bass": sample_paths.get("bass_tone", ""),
		"bass:manual_bass": sample_paths.get("bass_tone", ""),
		"chord": sample_paths.get("chord_tone", ""),
		"chord:tone": sample_paths.get("chord_tone", ""),
		"melody": sample_paths.get("melody_pulse", ""),
		"melody:pulse": sample_paths.get("melody_pulse", ""),
		"melody:synth": sample_paths.get("melody_pulse", ""),
		"melody:soft": sample_paths.get("melody_soft", ""),
		"melody:bell": sample_paths.get("melody_bell", ""),
	}
	profile.marker_stingers = {
		"boss_warning": "warning_hit",
		"reward": "reward_hit",
		"transition": "transition_hit",
	}
	profile.master_music_bus = "Music_Master"
	profile.drums_bus = "Music_Drums"
	profile.bass_bus = "Music_Bass"
	profile.chords_bus = "Music_Chords"
	profile.melody_bus = "Music_Melody"
	profile.stingers_bus = "Music_Stingers"
	var error := ResourceSaver.save(profile, profile_path)
	return {
		"ok": error == OK,
		"errors": [] if error == OK else ["Could not save playback profile %s: %s" % [profile_path, error_string(error)]],
		"warnings": [],
	}


func _kick(peak: float) -> PackedFloat32Array:
	var duration := 0.14
	var total := int(SAMPLE_RATE * duration)
	var out := PackedFloat32Array()
	out.resize(total)
	var phase := 0.0
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var freq := _exp_ramp(78.0, 48.0, t / 0.052)
		phase += TWO_PI * freq / float(SAMPLE_RATE)
		var body_attack: float = min(1.0, t / 0.007)
		var body_env := body_attack * _exp_ramp(max(0.08, peak), 0.001, t / 0.082)
		var punch_env := _exp_ramp(max(0.04, peak * 0.34), 0.001, t / 0.026)
		var click_env := _exp_ramp(max(0.03, peak * 0.16), 0.001, t / 0.006)
		var body := _soft_clip(sin(phase) * 1.55) * body_env
		var punch := sin(phase * 2.0) * punch_env
		var click := sin(TWO_PI * 1800.0 * t) * click_env
		out[i] = _soft_clip((body + punch + click) * 1.45)
	return _normalize(_lowpass(out, 7200.0), 0.90)


func _snare(peak: float, seed: int) -> PackedFloat32Array:
	var duration := 0.16
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var shell := PackedFloat32Array()
	shell.resize(total)
	var body := PackedFloat32Array()
	body.resize(total)
	var body_phase := 0.0
	var overtone_phase := 0.0
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var shell_env := _exp_ramp(max(0.05, peak) * 0.52, 0.001, t / 0.145)
		var crack_env := _exp_ramp(max(0.04, peak) * 0.18, 0.001, t / 0.026)
		shell[i] = (rng.randf() * 2.0 - 1.0) * (shell_env + crack_env)

		var body_freq := _exp_ramp(215.0, 165.0, t / 0.09)
		body_phase += TWO_PI * body_freq / float(SAMPLE_RATE)
		overtone_phase += TWO_PI * 335.0 / float(SAMPLE_RATE)
		var body_env := _exp_ramp(max(0.05, peak) * 0.30, 0.001, t / 0.105)
		var triangle := asin(sin(body_phase)) * (2.0 / PI)
		var overtone := sin(overtone_phase) * 0.32
		body[i] = (triangle + overtone) * body_env
	var shaped_shell := _lowpass(_highpass(shell, 900.0), 7200.0)
	var out := PackedFloat32Array()
	out.resize(total)
	for i in range(total):
		out[i] = _soft_clip(shaped_shell[i] + body[i])
	return _normalize(out, 0.74 + clamp(peak - 0.5, 0.0, 0.35) * 0.28)


func _hat(peak: float, open: bool, seed: int) -> PackedFloat32Array:
	var duration := 0.42 if open else 0.095
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env := _exp_ramp(max(0.05 if open else 0.03, peak), 0.001, t / (0.36 if open else 0.075))
		var noise := (rng.randf() * 2.0 - 1.0) * (0.62 if open else 0.78)
		var metallic := 0.0
		metallic += sin(TWO_PI * 6320.0 * t) * 0.34
		metallic += sin(TWO_PI * 8150.0 * t) * 0.26
		metallic += sin(TWO_PI * 10760.0 * t) * 0.18
		metallic += sin(TWO_PI * 13220.0 * t) * 0.10
		var tick := sin(TWO_PI * 3100.0 * t) * _exp_ramp(0.20, 0.001, t / 0.018)
		data[i] = (noise + metallic + tick) * env
	var filtered := _lowpass(_highpass(data, 3300.0 if open else 4700.0), 13200.0)
	return _normalize(filtered, 0.36 if open else 0.42)


func _clap(peak: float, seed: int) -> PackedFloat32Array:
	var duration := 0.18
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var burst := 0.0
		for offset in [0.0, 0.018, 0.036]:
			if t >= offset:
				burst += exp(-55.0 * (t - offset))
		data[i] = (rng.randf() * 2.0 - 1.0) * peak * burst
	return _normalize(_highpass(data, 1350.0), 0.78)


func _bass_tone() -> PackedFloat32Array:
	var duration := 0.46
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.012) * exp(-4.6 * t)
		var tone := sin(TWO_PI * 65.406 * t) * 0.74
		tone += sin(TWO_PI * 130.812 * t) * 0.22
		tone += _soft_clip(sin(TWO_PI * 65.406 * t) * 2.4) * 0.16
		data[i] = tone * env
	return _normalize(data, 0.82)


func _chord_tone() -> PackedFloat32Array:
	var duration := 0.62
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.018) * exp(-3.1 * t)
		var pulse := 1.0 if fmod(t * 261.626, 1.0) < 0.52 else -1.0
		var tone := pulse * 0.36 + sin(TWO_PI * 261.626 * t) * 0.28 + sin(TWO_PI * 523.252 * t) * 0.08
		data[i] = tone * env
	return _normalize(_lowpass(data, 5200.0), 0.64)


func _melody_pulse() -> PackedFloat32Array:
	var duration := 0.38
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.009) * exp(-5.8 * t)
		var pulse := 1.0 if fmod(t * 261.626, 1.0) < 0.46 else -1.0
		data[i] = (pulse * 0.42 + sin(TWO_PI * 523.252 * t) * 0.12) * env
	return _normalize(_lowpass(data, 6200.0), 0.70)


func _melody_soft() -> PackedFloat32Array:
	var duration := 0.46
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.024) * exp(-4.2 * t)
		var tone := sin(TWO_PI * 261.626 * t) * 0.55 + sin(TWO_PI * 392.0 * t) * 0.13
		data[i] = tone * env
	return _normalize(data, 0.66)


func _melody_bell() -> PackedFloat32Array:
	var duration := 0.72
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.004) * exp(-5.4 * t)
		var tone := sin(TWO_PI * 523.252 * t) * 0.52
		tone += sin(TWO_PI * 1046.504 * t) * 0.20
		tone += sin(TWO_PI * 1567.982 * t) * 0.08
		data[i] = tone * env
	return _normalize(data, 0.68)


func _warning_hit() -> PackedFloat32Array:
	var duration := 0.42
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	var phase := 0.0
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var freq := 340.0 + sin(TWO_PI * 7.0 * t) * 48.0
		phase += TWO_PI * freq / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.015) * exp(-5.2 * t)
		data[i] = sin(phase) * 0.55 * env
	return _normalize(data, 0.8)


func _reward_hit() -> PackedFloat32Array:
	var duration := 0.62
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var value := 0.0
		for spec in [[523.25, 0.0], [659.25, 0.055], [783.99, 0.11]]:
			var start := float(spec[1])
			if t >= start:
				var local_t := t - start
				var env: float = min(1.0, local_t / 0.01) * exp(-6.0 * local_t)
				value += sin(TWO_PI * float(spec[0]) * local_t) * env * 0.28
		data[i] = value
	return _normalize(data, 0.84)


func _transition_hit(seed: int) -> PackedFloat32Array:
	var duration := 0.36
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.02) * exp(-8.0 * t)
		data[i] = (rng.randf() * 2.0 - 1.0) * env * 0.42
	return _normalize(_highpass(data, 900.0), 0.72)


func _lowpass(input: PackedFloat32Array, cutoff_hz: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(input.size())
	if input.is_empty():
		return out
	var dt := 1.0 / float(SAMPLE_RATE)
	var rc := 1.0 / (TWO_PI * cutoff_hz)
	var alpha := dt / (rc + dt)
	var y := float(input[0])
	for i in range(input.size()):
		y = y + alpha * (float(input[i]) - y)
		out[i] = y
	return out


func _soft_clip(value: float) -> float:
	return value / (1.0 + absf(value))


func _exp_ramp(start: float, end: float, progress: float) -> float:
	var safe_start := max(0.0001, start)
	var safe_end := max(0.0001, end)
	var amount := clamp(progress, 0.0, 1.0)
	return safe_start * pow(safe_end / safe_start, amount)


func _highpass(input: PackedFloat32Array, cutoff_hz: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(input.size())
	if input.is_empty():
		return out
	var dt := 1.0 / float(SAMPLE_RATE)
	var rc := 1.0 / (TWO_PI * cutoff_hz)
	var alpha := rc / (rc + dt)
	var last_y := 0.0
	var last_x := float(input[0])
	for i in range(input.size()):
		var x := float(input[i])
		var y := alpha * (last_y + x - last_x)
		out[i] = y
		last_y = y
		last_x = x
	return out


func _limit_peak(input: PackedFloat32Array, target_peak: float) -> PackedFloat32Array:
	var peak := 0.0
	for sample in input:
		peak = max(peak, absf(float(sample)))
	if peak <= target_peak or peak <= 0.00001:
		return input
	var gain := target_peak / peak
	var out := PackedFloat32Array()
	out.resize(input.size())
	for i in range(input.size()):
		out[i] = clamp(float(input[i]) * gain, -1.0, 1.0)
	return out


func _normalize(input: PackedFloat32Array, target_peak: float) -> PackedFloat32Array:
	var peak := 0.0
	for sample in input:
		peak = max(peak, absf(float(sample)))
	if peak <= 0.00001:
		return input
	var gain := target_peak / peak
	var out := PackedFloat32Array()
	out.resize(input.size())
	for i in range(input.size()):
		out[i] = clamp(float(input[i]) * gain, -1.0, 1.0)
	return out


func _write_wav(path: String, samples: PackedFloat32Array) -> int:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	var data_size := samples.size() * 2
	file.store_buffer("RIFF".to_ascii_buffer())
	_store_u32_le(file, 36 + data_size)
	file.store_buffer("WAVE".to_ascii_buffer())
	file.store_buffer("fmt ".to_ascii_buffer())
	_store_u32_le(file, 16)
	_store_u16_le(file, 1)
	_store_u16_le(file, 1)
	_store_u32_le(file, SAMPLE_RATE)
	_store_u32_le(file, SAMPLE_RATE * 2)
	_store_u16_le(file, 2)
	_store_u16_le(file, 16)
	file.store_buffer("data".to_ascii_buffer())
	_store_u32_le(file, data_size)
	for sample in samples:
		var value := int(round(clamp(float(sample), -1.0, 1.0) * 32767.0))
		if value < 0:
			value = 65536 + value
		_store_u16_le(file, value)
	file.close()
	return OK


func _store_u16_le(file: FileAccess, value: int) -> void:
	file.store_8(value & 0xff)
	file.store_8((value >> 8) & 0xff)


func _store_u32_le(file: FileAccess, value: int) -> void:
	file.store_8(value & 0xff)
	file.store_8((value >> 8) & 0xff)
	file.store_8((value >> 16) & 0xff)
	file.store_8((value >> 24) & 0xff)


func _ensure_dir(path: String) -> int:
	var global_path := ProjectSettings.globalize_path(path)
	return DirAccess.make_dir_recursive_absolute(global_path)
