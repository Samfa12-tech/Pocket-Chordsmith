@tool
extends RefCounted
class_name PCSSoundKitGenerator

const DEFAULT_OUTPUT_DIR := "res://addons/pocket_chordsmith/audio/web_kit"
const SAMPLE_RATE := 44100
const TWO_PI := PI * 2.0
const PlaybackProfileScript := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const SharedSoundConstants := preload("res://addons/pocket_chordsmith/import/pcs_shared_sound_constants.gd")


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
		"lofi_kick": _lofi_kick(),
		"lofi_snare": _lofi_snare(),
		"lofi_hat": _lofi_hat(false),
		"lofi_open_hat": _lofi_hat(true),
		"lofi_dusty_kick": _lofi_dusty_kick(),
		"lofi_dusty_snare": _lofi_dusty_snare(),
		"lofi_dusty_hat": _lofi_dusty_hat(false),
		"lofi_dusty_open_hat": _lofi_dusty_hat(true),
		"lofi_brush_kick": _lofi_brush_kick(),
		"lofi_brush_snare": _lofi_brush_snare(),
		"lofi_brush_hat": _lofi_brush_hat(false),
		"lofi_brush_open_hat": _lofi_brush_hat(true),
		"lofi_tape_soft_kick": _lofi_tape_soft_kick(),
		"lofi_tape_soft_snare": _lofi_tape_soft_snare(),
		"lofi_tape_soft_hat": _lofi_tape_soft_hat(false),
		"lofi_tape_soft_open_hat": _lofi_tape_soft_hat(true),
		"clap": _clap(0.34, 5),
		"bass_tone": _bass_tone(),
		"bass_warm_sub": _bass_warm_sub(),
		"bass_soft_upright": _bass_soft_upright(),
		"bass_rounded_triangle_bass": _bass_rounded_triangle_bass(),
		"chord_tone": _chord_tone(),
		"chord_saloon_piano": _chord_saloon_piano(),
		"chord_dusty_rhodes": _chord_dusty_rhodes(),
		"chord_felt_piano": _chord_felt_piano(),
		"chord_cassette_keys": _chord_cassette_keys(),
		"chord_muted_jazz_guitar": _chord_muted_jazz_guitar(),
		"chord_lofi_warm_pad": _chord_lofi_warm_pad(),
		"guitar_open": _guitar_open(),
		"guitar_chug": _guitar_chug(),
		"guitar_accent": _guitar_accent(),
		"guitar_scratch": _guitar_scratch(),
		"guitar_western_twang_open": _guitar_western_twang_open(),
		"guitar_western_twang_chug": _guitar_western_twang_chug(),
		"guitar_western_twang_accent": _guitar_western_twang_accent(),
		"guitar_western_twang_scratch": _guitar_western_twang_scratch(),
		"melody_pulse": _melody_pulse(),
		"melody_soft": _melody_soft(),
		"melody_bell": _melody_bell(),
		"melody_banjo": _melody_banjo(),
		"melody_harmonica": _melody_harmonica(),
		"melody_cowboy_whistle": _melody_cowboy_whistle(),
		"melody_trumpet": _melody_trumpet(),
		"melody_saxophone": _melody_saxophone(),
		"melody_mellow_vibes": _melody_mellow_vibes(),
		"melody_soft_pluck": _melody_soft_pluck(),
		"melody_mellow_sax": _melody_mellow_sax(),
		"melody_muted_trumpet": _melody_muted_trumpet(),
		"melody_tape_bell": _melody_tape_bell(),
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
	profile.max_polyphony = 64
	profile.mobile_safe = true
	profile.sample_preview_enabled = true
	profile.sample_preview_velocity_scale = true
	profile.sample_preview_tonal_enabled = true
	profile.sample_preview_wall_clock_timing = false
	profile.sample_preview_load_wavs_uncompressed = true
	profile.sample_preview_prewarm_on_ready = true
	profile.sample_preview_native_bass_enabled = true
	profile.sample_preview_native_bass_gain_db = 2.0
	profile.sample_preview_native_bass_cache_limit = 192
	profile.sample_preview_native_melody_enabled = true
	profile.sample_preview_native_melody_gain_db = 4.5
	profile.sample_preview_native_melody_cache_limit = 256
	profile.sample_preview_max_chord_notes = 4
	profile.sample_preview_slide_steps = 3
	profile.sample_preview_pan_buses_enabled = false
	profile.sample_preview_skip_late_audio_ticks = 120
	profile.sample_preview_fx_enabled = false
	profile.sample_preview_bass_duck_on_kick_db = 0.0
	profile.sample_preview_bass_duck_window_ticks = 0
	profile.guitar_preview_effects_enabled = false
	profile.sample_preview_gain_db = {
		"drums": 0.0,
		"kick": 0.0,
		"kick_accent": 0.0,
		"snare": 0.0,
		"snare_accent": 0.0,
		"hat": 0.0,
		"hat_accent": 0.0,
		"open_hat": 0.0,
		"lofi_kick": 0.0,
		"lofi_snare": 0.0,
		"lofi_hat": 0.0,
		"lofi_open_hat": 0.0,
		"bass": -1.0,
		"chords": -4.0,
		"guitar": -8.0,
		"guitar:western_twang:scratch": -23.0,
		"melody": -9.0,
		"melody:banjo": -27.0,
		"stingers": 0.0,
	}
	profile.drum_kit = _mapped_sample_streams(sample_paths, _drum_sample_streams())
	profile.accent_streams = {
		"warning_hit": sample_paths.get("warning_hit", ""),
		"reward_hit": sample_paths.get("reward_hit", ""),
		"victory_hit": sample_paths.get("victory_hit", sample_paths.get("reward_hit", "")),
		"transition_hit": sample_paths.get("transition_hit", ""),
	}
	profile.event_sample_streams = _mapped_sample_streams(sample_paths, _event_sample_streams())
	profile.marker_stingers = {
		"boss_warning": "warning_hit",
		"reward": "reward_hit",
		"transition": "transition_hit",
	}
	profile.master_music_bus = "Music_Master"
	profile.drums_bus = "Music_Drums"
	profile.bass_bus = "Music_Bass"
	profile.chords_bus = "Music_Chords"
	profile.guitar_bus = "Music_Guitar"
	profile.melody_bus = "Music_Melody"
	profile.stingers_bus = "Music_Stingers"
	var error := ResourceSaver.save(profile, profile_path)
	return {
		"ok": error == OK,
		"errors": [] if error == OK else ["Could not save playback profile %s: %s" % [profile_path, error_string(error)]],
		"warnings": [],
	}


func _mapped_sample_streams(sample_paths: Dictionary, key_to_sample: Dictionary) -> Dictionary:
	var out := {}
	for key in key_to_sample.keys():
		var sample_name := str(key_to_sample[key])
		out[str(key)] = _sample_path(sample_paths, sample_name)
	return out


func _drum_sample_streams() -> Dictionary:
	return (SharedSoundConstants.GODOT_DRUM_SAMPLE_STREAMS as Dictionary).duplicate(true)


func _event_sample_streams() -> Dictionary:
	var out: Dictionary = (SharedSoundConstants.GODOT_EVENT_SAMPLE_STREAMS as Dictionary).duplicate(true)
	for key in out.keys():
		var parts := str(key).split(":", false, 1)
		if parts.size() == 2 and parts[0] in ["bass", "chord", "melody"]:
			out["sound:%s" % parts[1]] = str(out[key])
	return out


func _sample_path(sample_paths: Dictionary, sample_name: String) -> String:
	var path := str(sample_paths.get(sample_name, ""))
	if not path.is_empty():
		return path
	var fallback := _sample_name_fallback(sample_name)
	if fallback.is_empty():
		return ""
	return str(sample_paths.get(fallback, ""))


func _sample_name_fallback(sample_name: String) -> String:
	match sample_name:
		"hat_accent":
			return "open_hat"
		"lofi_kick":
			return "kick"
		"lofi_snare":
			return "snare"
		"lofi_hat":
			return "hat"
		"lofi_open_hat":
			return "open_hat"
	return ""


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


func _lofi_kick() -> PackedFloat32Array:
	return _normalize(_lowpass(_kick(0.52), 1800.0), 0.56)


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


func _lofi_snare() -> PackedFloat32Array:
	return _normalize(_lowpass(_snare(0.34, 21), 3200.0), 0.46)


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


func _lofi_hat(open: bool) -> PackedFloat32Array:
	return _normalize(_lowpass(_hat(0.12 if open else 0.08, open, 31 if open else 30), 5800.0), 0.22 if open else 0.18)


func _lofi_dusty_kick() -> PackedFloat32Array:
	return _normalize(_lowpass(_kick(0.46), 1450.0), 0.48)


func _lofi_dusty_snare() -> PackedFloat32Array:
	return _normalize(_lowpass(_snare(0.32, 41), 3000.0), 0.42)


func _lofi_dusty_hat(open: bool) -> PackedFloat32Array:
	return _normalize(_lowpass(_hat(0.10 if open else 0.07, open, 42 if open else 43), 5200.0), 0.18 if open else 0.14)


func _lofi_brush_kick() -> PackedFloat32Array:
	return _normalize(_lowpass(_kick(0.36), 1100.0), 0.38)


func _lofi_brush_snare() -> PackedFloat32Array:
	var brush := _lowpass(_snare(0.26, 44), 2300.0)
	return _normalize(_highpass(brush, 520.0), 0.34)


func _lofi_brush_hat(open: bool) -> PackedFloat32Array:
	var hat := _hat(0.075 if open else 0.052, open, 45 if open else 46)
	return _normalize(_lowpass(_highpass(hat, 2100.0), 4300.0), 0.15 if open else 0.11)


func _lofi_tape_soft_kick() -> PackedFloat32Array:
	return _normalize(_lowpass(_kick(0.42), 1600.0), 0.42)


func _lofi_tape_soft_snare() -> PackedFloat32Array:
	return _normalize(_lowpass(_snare(0.28, 47), 2100.0), 0.36)


func _lofi_tape_soft_hat(open: bool) -> PackedFloat32Array:
	return _normalize(_lowpass(_hat(0.08 if open else 0.055, open, 48 if open else 49), 4800.0), 0.16 if open else 0.12)


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
	var duration := 0.56
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.012) * (exp(-4.7 * t) * 0.86 + exp(-12.0 * t) * 0.14)
		var base := sin(TWO_PI * 65.406 * t)
		var saw := fmod(65.406 * t, 1.0) * 2.0 - 1.0
		var tone := saw * 0.12 + base * 0.62
		tone += sin(TWO_PI * 32.703 * t) * 0.22
		tone += sin(TWO_PI * 130.812 * t) * 0.025
		data[i] = tone * env
	return _normalize(_lowpass(data, 260.0), 0.68)


func _bass_warm_sub() -> PackedFloat32Array:
	var duration := 0.56
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.018) * exp(-3.7 * t)
		var tone := sin(TWO_PI * 49.0 * t) * 0.82
		tone += sin(TWO_PI * 98.0 * t) * 0.16
		data[i] = _soft_clip(tone * 1.1) * env
	return _normalize(_lowpass(data, 850.0), 0.72)


func _bass_soft_upright() -> PackedFloat32Array:
	var duration := 0.58
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = 52
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.006) * exp(-5.0 * t)
		var pluck := exp(-52.0 * t) * (rng.randf() * 2.0 - 1.0) * 0.08
		var tone := sin(TWO_PI * 55.0 * t) * 0.58
		tone += sin(TWO_PI * 110.0 * t) * 0.28
		tone += sin(TWO_PI * 165.0 * t) * 0.10
		data[i] = (tone + pluck) * env
	return _normalize(_lowpass(data, 1700.0), 0.68)


func _bass_rounded_triangle_bass() -> PackedFloat32Array:
	var duration := 0.48
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.012) * exp(-4.1 * t)
		var tri := asin(sin(TWO_PI * 65.406 * t)) * (2.0 / PI)
		var sub := sin(TWO_PI * 32.703 * t) * 0.20
		data[i] = (tri * 0.72 + sub) * env
	return _normalize(_lowpass(data, 1250.0), 0.70)


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


func _chord_saloon_piano() -> PackedFloat32Array:
	var duration := 0.70
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	var base_freq := 261.626
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.002) * (exp(-7.7 * t) * 0.82 + exp(-1.85 * t) * 0.18)
		var tone := _triangle_sample(base_freq * 0.996, t) * 0.88
		tone += _triangle_sample(base_freq * 1.005, t) * 0.62
		tone += sin(TWO_PI * base_freq * 2.01 * t) * 0.16
		var hammer := sin(TWO_PI * 2450.0 * t) * exp(-105.0 * t) * 0.06
		data[i] = _soft_clip((tone + hammer) * 1.24) * env
	return _normalize(_lowpass(data, 3600.0), 0.58)


func _chord_dusty_rhodes() -> PackedFloat32Array:
	return _warm_key_tone(261.626, 0.86, 2.35, 3400.0, 0.54, 0.10, 0.18)


func _chord_felt_piano() -> PackedFloat32Array:
	return _warm_key_tone(261.626, 0.72, 3.15, 2400.0, 0.50, 0.02, 0.08)


func _chord_cassette_keys() -> PackedFloat32Array:
	return _warm_key_tone(261.626, 0.82, 2.65, 2100.0, 0.48, 0.16, 0.05)


func _chord_muted_jazz_guitar() -> PackedFloat32Array:
	return _normalize(_lowpass(_guitar_tone(0.42, 5.8, 1.4, 53, 0.22, 0.48), 2400.0), 0.46)


func _chord_lofi_warm_pad() -> PackedFloat32Array:
	return _warm_key_tone(220.0, 1.12, 1.35, 1900.0, 0.42, 0.03, 0.22)


func _warm_key_tone(base_freq: float, duration: float, decay_rate: float, cutoff_hz: float, peak: float, pulse_amount: float, bell_amount: float) -> PackedFloat32Array:
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = int(base_freq + cutoff_hz)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var wobble := 1.0 + sin(TWO_PI * 3.2 * t) * 0.004
		var env: float = min(1.0, t / 0.035) * exp(-decay_rate * t)
		var cycle := fmod(t * base_freq * wobble, 1.0)
		var pulse := 1.0 if cycle < 0.50 else -1.0
		var tone := sin(TWO_PI * base_freq * wobble * t) * 0.46
		tone += sin(TWO_PI * base_freq * 2.0 * wobble * t) * 0.18
		tone += pulse * pulse_amount
		tone += sin(TWO_PI * base_freq * 3.02 * wobble * t) * bell_amount
		tone += (rng.randf() * 2.0 - 1.0) * 0.006
		data[i] = _soft_clip(tone * 1.35) * env
	return _normalize(_lowpass(data, cutoff_hz), peak)


func _guitar_open() -> PackedFloat32Array:
	return _guitar_tone(0.78, 2.05, 1.15, 7, 0.22, 0.54)


func _guitar_chug() -> PackedFloat32Array:
	return _guitar_tone(0.16, 16.0, 1.25, 8, 0.28, 0.56)


func _guitar_accent() -> PackedFloat32Array:
	return _guitar_tone(0.44, 3.8, 1.35, 9, 0.30, 0.62)


func _guitar_tone(duration: float, decay_rate: float, drive: float, seed: int, pick_amount: float, peak: float) -> PackedFloat32Array:
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var data := PackedFloat32Array()
	data.resize(total)
	var phase_a := 0.0
	var phase_b := 0.0
	var base_freq := 82.407
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		phase_a += TWO_PI * base_freq / float(SAMPLE_RATE)
		phase_b += TWO_PI * (base_freq * 1.006) / float(SAMPLE_RATE)
		var cycle_a := fmod(phase_a / TWO_PI, 1.0)
		var cycle_b := fmod(phase_b / TWO_PI, 1.0)
		var saw_a := cycle_a * 2.0 - 1.0
		var saw_b := cycle_b * 2.0 - 1.0
		var square := 1.0 if cycle_a < 0.52 else -1.0
		var tri_a := asin(sin(phase_a)) * (2.0 / PI)
		var string_body := tri_a * 0.44 + saw_a * 0.24 + saw_b * 0.18 + square * 0.04
		string_body += sin(phase_a * 2.0) * 0.10 + sin(phase_a * 3.01) * 0.05
		var amp_env: float = min(1.0, t / 0.004) * exp(-decay_rate * t)
		var pick_env := exp(-85.0 * t)
		var pick_noise := (rng.randf() * 2.0 - 1.0) * pick_amount * pick_env
		var value := _soft_clip((string_body + pick_noise) * drive * 0.72) * amp_env
		data[i] = value
	var filtered := _lowpass(_highpass(data, 80.0), 5600.0)
	return _normalize(_limit_peak(filtered, 0.92), peak)


func _guitar_scratch() -> PackedFloat32Array:
	var duration := 0.11
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = 10
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env := exp(-48.0 * t)
		var scrape := rng.randf() * 2.0 - 1.0
		var tick := sin(TWO_PI * 1450.0 * t) * exp(-110.0 * t) * 0.28
		data[i] = _soft_clip((scrape * 1.6 + tick) * env)
	return _normalize(_lowpass(_highpass(data, 320.0), 4200.0), 0.48)


func _guitar_western_twang_open() -> PackedFloat32Array:
	return _guitar_twang_tone(0.54, 3.5, 1.25, 71, 0.24, 0.38, 125.0, 4700.0)


func _guitar_western_twang_chug() -> PackedFloat32Array:
	return _guitar_twang_tone(0.24, 26.0, 0.44, 72, 0.18, 0.30, 145.0, 950.0)


func _guitar_western_twang_accent() -> PackedFloat32Array:
	return _guitar_twang_tone(0.32, 7.4, 1.32, 73, 0.36, 0.62, 125.0, 5400.0)


func _guitar_western_twang_scratch() -> PackedFloat32Array:
	var duration := 0.046
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = 74
	var data := PackedFloat32Array()
	data.resize(total)
	var smoothed: float = 0.0
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.004) * exp(-64.0 * t)
		smoothed += ((rng.randf() * 2.0 - 1.0) - smoothed) * 0.075
		var wood_tick: float = sin(TWO_PI * 560.0 * t) * exp(-105.0 * t) * 0.22
		var pick_click: float = sin(TWO_PI * 1120.0 * t) * exp(-170.0 * t) * 0.08
		data[i] = _soft_clip((smoothed * 0.38 + wood_tick + pick_click) * env)
	return _normalize(_lowpass(_highpass(data, 160.0), 1200.0), 0.24)


func _guitar_twang_tone(duration: float, decay_rate: float, drive: float, seed: int, pick_amount: float, peak: float, highpass_hz: float, lowpass_hz: float) -> PackedFloat32Array:
	var total := int(SAMPLE_RATE * duration)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var data := PackedFloat32Array()
	data.resize(total)
	var phase_a := 0.0
	var phase_b := 0.0
	var base_freq := 82.407
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		phase_a += TWO_PI * base_freq / float(SAMPLE_RATE)
		phase_b += TWO_PI * (base_freq * 1.004) / float(SAMPLE_RATE)
		var cycle_a := fmod(phase_a / TWO_PI, 1.0)
		var cycle_b := fmod(phase_b / TWO_PI, 1.0)
		var saw_a := cycle_a * 2.0 - 1.0
		var saw_b := cycle_b * 2.0 - 1.0
		var square_b := 1.0 if cycle_b < 0.50 else -1.0
		var tri_a := asin(sin(phase_a)) * (2.0 / PI)
		var string_body := saw_a * 0.34 + saw_b * 0.16 + square_b * 0.16 + tri_a * 0.18
		string_body += sin(phase_a * 2.0) * 0.09 + sin(phase_a * 3.01) * 0.05
		var amp_env: float = min(1.0, t / 0.005) * exp(-decay_rate * t)
		var pick_env := exp(-92.0 * t)
		var pick_noise := (rng.randf() * 2.0 - 1.0) * pick_amount * pick_env
		data[i] = _soft_clip((string_body + pick_noise) * drive * 0.50) * amp_env
	var filtered := _lowpass(_highpass(data, highpass_hz), lowpass_hz)
	return _normalize(_limit_peak(filtered, 0.76), peak)


func _melody_pulse() -> PackedFloat32Array:
	var duration := 1.10
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.012) * (exp(-2.3 * t) * 0.84 + exp(-6.8 * t) * 0.16)
		var cycle := fmod(t * 261.626, 1.0)
		var saw := (cycle * 2.0) - 1.0
		var pulse := 1.0 if cycle < 0.46 else -1.0
		data[i] = (saw * 0.20 + pulse * 0.07 + sin(TWO_PI * 523.252 * t) * 0.030) * env
	return _normalize(_lowpass(data, 1450.0), 0.52)


func _melody_soft() -> PackedFloat32Array:
	var duration := 0.86
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.018) * (exp(-2.6 * t) * 0.82 + exp(-6.0 * t) * 0.18)
		var tone := asin(sin(TWO_PI * 261.626 * t)) * (2.0 / PI) * 0.22
		tone += sin(TWO_PI * 261.626 * t) * 0.34 + sin(TWO_PI * 392.0 * t) * 0.08
		data[i] = tone * env
	return _normalize(_lowpass(data, 1800.0), 0.52)


func _melody_bell() -> PackedFloat32Array:
	var duration := 0.88
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.010) * (exp(-3.4 * t) * 0.70 + exp(-7.0 * t) * 0.30)
		var tone := sin(TWO_PI * 261.626 * t) * 0.46
		tone += sin(TWO_PI * 523.252 * t) * 0.16
		tone += sin(TWO_PI * 784.0 * t) * 0.035
		data[i] = tone * env
	return _normalize(_lowpass(data, 2600.0), 0.50)


func _melody_banjo() -> PackedFloat32Array:
	return _western_melody_tone(261.626, 0.24, 9.4, 0.56, "triangle", "bandpass", 2100.0, [
		{"freq_mul": 2.01, "wave": "triangle", "level": 0.22, "delay": 0.004, "decay": 14.0},
		{"freq_mul": 0.997, "wave": "square", "level": 0.14, "delay": 0.012, "decay": 11.0},
	])


func _melody_harmonica() -> PackedFloat32Array:
	return _western_melody_tone(261.626, 0.64, 3.5, 0.50, "square", "bandpass", 1250.0, [
		{"freq_mul": 1.004, "wave": "triangle", "level": 0.30, "delay": 0.006, "decay": 3.2},
		{"freq_mul": 2.0, "wave": "square", "level": 0.10, "delay": 0.014, "decay": 5.8},
	])


func _melody_cowboy_whistle() -> PackedFloat32Array:
	return _western_melody_tone(261.626, 0.60, 3.8, 0.42, "sine", "lowpass", 3200.0, [
		{"freq_mul": 2.0, "wave": "sine", "level": 0.14, "delay": 0.010, "decay": 4.8},
	])


func _melody_trumpet() -> PackedFloat32Array:
	return _western_melody_tone(261.626, 0.54, 4.1, 0.54, "square", "bandpass", 1650.0, [
		{"freq_mul": 2.0, "wave": "sawtooth", "level": 0.13, "delay": 0.008, "decay": 6.0},
	])


func _melody_saxophone() -> PackedFloat32Array:
	return _western_melody_tone(261.626, 0.58, 3.6, 0.56, "triangle", "bandpass", 940.0, [
		{"freq_mul": 0.5, "wave": "sine", "level": 0.18, "delay": 0.004, "decay": 4.4},
	])


func _western_melody_tone(base_freq: float, duration: float, decay_rate: float, peak: float, wave: String, filter_type: String, filter_hz: float, layers: Array) -> PackedFloat32Array:
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.010) * exp(-decay_rate * t)
		var tone := _wave_sample(wave, base_freq, t)
		for layer in layers:
			var delay := float(layer.get("delay", 0.0))
			if t < delay:
				continue
			var local_t := t - delay
			var layer_env: float = min(1.0, local_t / 0.006) * exp(-float(layer.get("decay", decay_rate)) * local_t)
			tone += _wave_sample(str(layer.get("wave", wave)), base_freq * float(layer.get("freq_mul", 1.0)), local_t) * float(layer.get("level", 0.0)) * layer_env
		data[i] = _soft_clip(tone * 1.4) * env
	match filter_type:
		"bandpass":
			return _normalize(_lowpass(_highpass(data, max(40.0, filter_hz * 0.45)), filter_hz * 1.85), peak)
		"highpass":
			return _normalize(_highpass(data, filter_hz), peak)
		_:
			return _normalize(_lowpass(data, filter_hz), peak)


func _melody_mellow_vibes() -> PackedFloat32Array:
	return _normalize(_lowpass(_melody_bell(), 3600.0), 0.52)


func _melody_soft_pluck() -> PackedFloat32Array:
	var duration := 0.34
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.006) * exp(-7.2 * t)
		var tone := sin(TWO_PI * 329.628 * t) * 0.46 + sin(TWO_PI * 659.256 * t) * 0.11
		data[i] = tone * env
	return _normalize(_lowpass(data, 2900.0), 0.48)


func _melody_mellow_sax() -> PackedFloat32Array:
	return _nasal_melody_tone(293.665, 0.50, 0.54, 1900.0)


func _melody_muted_trumpet() -> PackedFloat32Array:
	return _nasal_melody_tone(349.228, 0.42, 0.50, 2400.0)


func _melody_tape_bell() -> PackedFloat32Array:
	return _normalize(_lowpass(_melody_bell(), 2600.0), 0.48)


func _nasal_melody_tone(base_freq: float, duration: float, peak: float, cutoff_hz: float) -> PackedFloat32Array:
	var total := int(SAMPLE_RATE * duration)
	var data := PackedFloat32Array()
	data.resize(total)
	for i in range(total):
		var t := float(i) / float(SAMPLE_RATE)
		var env: float = min(1.0, t / 0.018) * exp(-4.7 * t)
		var tone := sin(TWO_PI * base_freq * t) * 0.38
		tone += sin(TWO_PI * base_freq * 2.0 * t) * 0.25
		tone += sin(TWO_PI * base_freq * 3.0 * t) * 0.12
		data[i] = _soft_clip(tone * 1.6) * env
	return _normalize(_lowpass(data, cutoff_hz), peak)


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


func _wave_sample(wave: String, freq: float, t: float) -> float:
	match wave:
		"square":
			return 1.0 if fmod(t * freq, 1.0) < 0.5 else -1.0
		"triangle":
			return _triangle_sample(freq, t)
		"saw", "sawtooth":
			return fmod(t * freq, 1.0) * 2.0 - 1.0
		_:
			return sin(TWO_PI * freq * t)


func _triangle_sample(freq: float, t: float) -> float:
	return asin(sin(TWO_PI * freq * t)) * (2.0 / PI)


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
