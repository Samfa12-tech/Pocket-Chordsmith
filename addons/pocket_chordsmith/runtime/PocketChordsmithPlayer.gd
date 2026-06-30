extends Node

const NOTE_NAMES := ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const MAJOR_SCALE := [0, 2, 4, 5, 7, 9, 11]
const MINOR_SCALE := [0, 2, 3, 5, 7, 8, 10]
const MAJOR_QUALITIES := ["maj", "min", "min", "maj", "maj", "min", "dim"]
const MINOR_QUALITIES := ["min", "dim", "maj", "min", "min", "maj", "maj"]

@export var mix_rate := 22050
@export var buffer_length := 0.5
@export var max_frames_per_process := 8192
@export var startup_prime_frames := 8192
@export var max_voices := 36
@export var master_gain := 0.16
@export var drum_gain := 0.36
@export var bass_gain := 0.22
@export var chord_gain := 0.105
@export var melody_gain := 0.12

var project: Dictionary = {}
var _audio_player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback
var _rng := RandomNumberGenerator.new()
var _voices: Array = []
var _playing := false
var _muted := false

var _sample_clock := 0
var _next_step_sample := 0
var _global_step := 0
var _section_step := 0
var _sequence_index := 0
var _sequence: Array = ["A"]
var _current_section := "A"
var _last_frames_written := 0
var _audio_skips := 0

var _bpm := 120.0
var _time_sig := 4
var _resolution := 1
var _swing := 0.0
var _key := "C"
var _scale := "major"
var _chord_type := "triad"
var _chord_octave := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.randomize()
	_setup_audio()
	set_process(true)


func play_project(project_data: Dictionary) -> void:
	project = project_data.duplicate(true)
	if project.is_empty():
		stop()
		return
	_bpm = clamp(float(project.get("bpm", 120.0)), 40.0, 220.0)
	_time_sig = max(1, int(project.get("timeSig", 4)))
	_resolution = max(1, int(project.get("resolution", 1)))
	_swing = clamp(float(project.get("swing", 0.0)), 0.0, 0.35)
	_key = str(project.get("key", "C"))
	_scale = str(project.get("scale", "major"))
	_chord_type = str(project.get("chordType", "triad"))
	_chord_octave = int(project.get("chordOctave", 0))
	_sequence = _sanitize_sequence(project.get("songSequence", ["A"]))
	_current_section = str(_sequence[0])
	_sequence_index = 0
	_section_step = 0
	_global_step = 0
	_sample_clock = 0
	_next_step_sample = 0
	_voices.clear()
	_playing = true
	_ensure_audio_playing()


func stop() -> void:
	_playing = false
	_voices.clear()
	if is_instance_valid(_audio_player):
		_audio_player.stop()
	_playback = null


func set_muted(muted: bool) -> void:
	_muted = muted


func is_playing() -> bool:
	return _playing and is_instance_valid(_audio_player) and _audio_player.playing


func get_current_section() -> String:
	return _current_section


func get_current_step() -> int:
	return _section_step


func get_debug_status() -> Dictionary:
	return {
		"playing": is_playing(),
		"muted": _muted,
		"bpm": _bpm,
		"section": _current_section,
		"step": _section_step,
		"voices": _voices.size(),
		"frames_written": _last_frames_written,
		"audio_skips": _audio_skips,
	}


func _process(_delta: float) -> void:
	if not _playing:
		return
	_ensure_audio_playing()
	if _playback == null:
		return
	var frames_to_write: int = min(_playback.get_frames_available(), max_frames_per_process)
	if frames_to_write <= 0:
		return
	_write_audio_frames(frames_to_write)


func _setup_audio() -> void:
	_audio_player = AudioStreamPlayer.new()
	_audio_player.name = "PocketChordsmithAudio"
	_audio_player.bus = "Master"
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = mix_rate
	stream.buffer_length = buffer_length
	_audio_player.stream = stream
	add_child(_audio_player)


func _ensure_audio_playing() -> void:
	if not is_instance_valid(_audio_player):
		_setup_audio()
	var was_playing := _audio_player.playing
	if not was_playing:
		_audio_player.play()
	_playback = _audio_player.get_stream_playback() as AudioStreamGeneratorPlayback
	if not was_playing and _playback != null:
		_write_audio_frames(min(_playback.get_frames_available(), startup_prime_frames))


func _write_audio_frames(frame_count: int) -> void:
	if frame_count <= 0 or _playback == null:
		return
	var buffer := PackedVector2Array()
	buffer.resize(frame_count)
	for i in range(frame_count):
		buffer[i] = _mix_frame()
	_playback.push_buffer(buffer)
	_last_frames_written = frame_count
	_audio_skips = _playback.get_skips()


func _mix_frame() -> Vector2:
	while _playing and _sample_clock >= _next_step_sample:
		_schedule_current_step()
		_advance_step()

	var mix := Vector2.ZERO
	for index in range(_voices.size() - 1, -1, -1):
		var voice: Dictionary = _voices[index]
		mix += _render_voice(voice)
		if bool(voice.get("done", false)):
			_voices.remove_at(index)
		else:
			_voices[index] = voice

	_sample_clock += 1
	if _muted:
		return Vector2.ZERO
	return Vector2(_soft_limit(mix.x * master_gain), _soft_limit(mix.y * master_gain))


func _schedule_current_step() -> void:
	var section_step_count := _section_step_count(_current_section)
	if section_step_count <= 0:
		return
	var step := posmod(_section_step, section_step_count)
	var grid := _section_grid(_current_section)
	_schedule_drums(grid, step)
	_schedule_bass(grid, step)
	_schedule_chord(step)
	_schedule_melody(step)


func _advance_step() -> void:
	var step_duration := _step_duration_seconds(_global_step)
	_next_step_sample += max(1, int(round(step_duration * float(mix_rate))))
	_section_step += 1
	_global_step += 1
	if _section_step >= _section_step_count(_current_section):
		_sequence_index = posmod(_sequence_index + 1, _sequence.size())
		_current_section = str(_sequence[_sequence_index])
		_section_step = 0


func _schedule_drums(grid: Dictionary, step: int) -> void:
	var kick_strength := _track_value(grid, "kick", step)
	if kick_strength > 0.0:
		_add_tone(138.0, 0.18, "sine", drum_gain * (0.48 + kick_strength * 0.11), 0.0, 0.0, 0.001, 0.035, 0.22, 0.045, 42.0)
		_add_tone(52.0, 0.12, "sine", drum_gain * 0.13, 0.0, 0.004, 0.002, 0.035, 0.35, 0.04)
		_add_noise(0.011, drum_gain * 0.025, 0.0, 0.0, 0.0005, 0.003, 0.03, 0.004, 0.75)
	var snare_strength := _track_value(grid, "snare", step)
	if snare_strength > 0.0:
		_add_noise(0.105, drum_gain * (0.18 + snare_strength * 0.075), 0.02, 0.001, 0.002, 0.026, 0.11, 0.045, 0.28)
		_add_tone(185.0, 0.075, "triangle", drum_gain * 0.075, 0.02, 0.0, 0.001, 0.018, 0.16, 0.035)
		_add_tone(330.0, 0.04, "sine", drum_gain * 0.04, 0.02, 0.002, 0.001, 0.012, 0.12, 0.02)
	var hat_strength := _track_value(grid, "hat", step)
	if hat_strength > 0.0:
		_add_noise(0.032 if hat_strength < 2.0 else 0.065, drum_gain * (0.034 + hat_strength * 0.018), -0.05, 0.001, 0.001, 0.006, 0.035, 0.014, 0.58)


func _schedule_bass(grid: Dictionary, step: int) -> void:
	var bass_strength := _track_value(grid, "bass", step)
	if bass_strength <= 0.0:
		return
	var root_midi := _chord_root_midi(_degree_for_step(step), 36)
	var freq := _midi_to_freq(root_midi)
	var duration := _beat_duration_seconds() * (0.46 if bass_strength < 2.0 else 0.68)
	_add_tone(freq, duration, "triangle", bass_gain * (0.46 + bass_strength * 0.12), 0.0, 0.0, 0.004, 0.035, 0.42, 0.05)
	_add_tone(freq * 0.5, duration, "sine", bass_gain * 0.16, 0.0, 0.0, 0.003, 0.04, 0.42, 0.05)


func _schedule_chord(step: int) -> void:
	if not _should_play_chord(step):
		return
	var degree := _degree_for_step(step)
	var root_midi := _chord_root_midi(degree, 60 + _chord_octave * 12)
	var quality := _triad_quality(degree)
	var intervals := _chord_intervals(quality, _chord_type)
	var mode := str(project.get("chordPlayMode", "block"))
	var note_order: Array = []
	for i in range(intervals.size()):
		note_order.append(i)
	if mode in ["strum_down", "arp_down"]:
		note_order.reverse()

	var delay_spacing := 0.0
	if mode.begins_with("strum"):
		delay_spacing = 0.026
	elif mode.begins_with("arp"):
		delay_spacing = 0.095

	for order_index in range(note_order.size()):
		var interval_index := int(note_order[order_index])
		var midi := root_midi + int(intervals[interval_index])
		var pan := -0.16 + float(order_index) * 0.16
		_add_tone(_midi_to_freq(midi), _beat_duration_seconds() * 0.44, "triangle", chord_gain, pan, delay_spacing * float(order_index), 0.014, 0.07, 0.24, 0.10)


func _schedule_melody(step: int) -> void:
	var tracks_value = project.get("melodyTracks%s" % _current_section, [])
	if not (tracks_value is Array):
		return
	var tracks: Array = tracks_value
	var instruments := _array_or_empty(project.get("melodyInstruments%s" % _current_section, []))
	var octaves := _array_or_empty(project.get("melodyOctaves%s" % _current_section, []))
	var pans := _array_or_empty(project.get("melodyPan%s" % _current_section, []))
	var muted := _array_or_empty(project.get("melodyMute%s" % _current_section, project.get("melodyMuted%s" % _current_section, [])))
	for track_index in range(tracks.size()):
		if track_index < muted.size() and bool(muted[track_index]):
			continue
		var track = tracks[track_index]
		var track_steps := _melody_track_steps(track)
		if track_steps.is_empty():
			continue
		var note_value = track_steps[posmod(step, track_steps.size())]
		if note_value == null:
			continue
		var note_index := int(note_value)
		var octave_offset := int(octaves[track_index]) if track_index < octaves.size() else 0
		var pan := float(pans[track_index]) if track_index < pans.size() else 0.0
		var instrument := str(instruments[track_index]) if track_index < instruments.size() else "pulse"
		var midi := _scale_note_midi(note_index, 72 + octave_offset * 12)
		var wave := "triangle" if instrument == "pulse" else "sine"
		var gain := melody_gain * (0.62 if instrument == "soft" else 0.78)
		_add_tone(_midi_to_freq(midi), _beat_duration_seconds() * 0.42, wave, gain, pan, 0.0, 0.006, 0.055, 0.26, 0.075)


func _add_tone(freq: float, duration: float, wave: String, gain: float, pan := 0.0, delay := 0.0, attack := 0.005, decay := 0.04, sustain := 0.5, release := 0.08, freq_to := 0.0) -> void:
	_trim_voice_pool()
	_voices.append({
		"kind": "tone",
		"freq": max(1.0, freq),
		"freq_to": freq_to,
		"duration": max(0.01, duration),
		"wave": wave,
		"gain": gain,
		"pan": clamp(pan, -1.0, 1.0),
		"start_sample": _sample_clock + max(0, int(round(delay * float(mix_rate)))),
		"age_samples": 0,
		"phase": 0.0,
		"attack": attack,
		"decay": decay,
		"sustain": sustain,
		"release": release,
	})


func _add_noise(duration: float, gain: float, pan := 0.0, delay := 0.0, attack := 0.001, decay := 0.03, sustain := 0.18, release := 0.035, noise_smooth := 0.4) -> void:
	_trim_voice_pool()
	_voices.append({
		"kind": "noise",
		"duration": max(0.01, duration),
		"gain": gain,
		"pan": clamp(pan, -1.0, 1.0),
		"start_sample": _sample_clock + max(0, int(round(delay * float(mix_rate)))),
		"age_samples": 0,
		"attack": attack,
		"decay": decay,
		"sustain": sustain,
		"release": release,
		"last_noise": 0.0,
		"noise_smooth": clamp(noise_smooth, 0.05, 1.0),
	})


func _render_voice(voice: Dictionary) -> Vector2:
	if _sample_clock < int(voice.get("start_sample", 0)):
		return Vector2.ZERO
	var age_samples := int(voice.get("age_samples", 0))
	var time := float(age_samples) / float(mix_rate)
	var duration := float(voice.get("duration", 0.1))
	var release := float(voice.get("release", 0.08))
	if time > duration + release:
		voice["done"] = true
		return Vector2.ZERO

	var env := _envelope(time, duration, float(voice.get("attack", 0.005)), float(voice.get("decay", 0.04)), float(voice.get("sustain", 0.5)), release)
	var sample := 0.0
	if str(voice.get("kind", "tone")) == "noise":
		var raw_noise := _rng.randf() * 2.0 - 1.0
		var noise_smooth := float(voice.get("noise_smooth", 0.4))
		var shaped_noise := lerp(float(voice.get("last_noise", 0.0)), raw_noise, noise_smooth)
		voice["last_noise"] = shaped_noise
		sample = shaped_noise * float(voice.get("gain", 0.2)) * env
	else:
		var freq := float(voice.get("freq", 440.0))
		var freq_to := float(voice.get("freq_to", 0.0))
		if freq_to > 0.0:
			freq = lerp(freq, freq_to, clamp(time / max(duration, 0.001), 0.0, 1.0))
		var phase := float(voice.get("phase", 0.0)) + TAU * freq / float(mix_rate)
		phase = fmod(phase, TAU)
		voice["phase"] = phase
		sample = _wave_sample(str(voice.get("wave", "sine")), phase) * float(voice.get("gain", 0.2)) * env

	voice["age_samples"] = age_samples + 1
	var pan: float = clamp(float(voice.get("pan", 0.0)), -1.0, 1.0)
	var left_gain: float = sqrt(0.5 * (1.0 - pan))
	var right_gain: float = sqrt(0.5 * (1.0 + pan))
	return Vector2(sample * left_gain, sample * right_gain)


func _trim_voice_pool() -> void:
	while _voices.size() >= max_voices:
		_voices.remove_at(0)


func _soft_limit(value: float) -> float:
	return clamp(value / (1.0 + abs(value)), -0.98, 0.98)


func _wave_sample(wave: String, phase: float) -> float:
	match wave:
		"square":
			return 1.0 if sin(phase) >= 0.0 else -1.0
		"saw":
			var cycle := fmod(phase / TAU, 1.0)
			return cycle * 2.0 - 1.0
		"triangle":
			var cycle := fmod(phase / TAU, 1.0)
			return 1.0 - 4.0 * abs(cycle - 0.5)
		_:
			return sin(phase)


func _envelope(time: float, duration: float, attack: float, decay: float, sustain: float, release: float) -> float:
	attack = max(0.0001, attack)
	decay = max(0.0001, decay)
	release = max(0.0001, release)
	if time < attack:
		return time / attack
	if time < attack + decay:
		return lerp(1.0, sustain, (time - attack) / decay)
	if time < duration:
		return sustain
	if time < duration + release:
		return lerp(sustain, 0.0, (time - duration) / release)
	return 0.0


func _should_play_chord(step: int) -> bool:
	var rhythm := str(project.get("chordRhythmMode", "sustain"))
	var steps_per_beat: int = max(1, _resolution)
	var steps_per_bar: int = _steps_per_bar()
	match rhythm:
		"quarter":
			return step % steps_per_beat == 0
		"half":
			return step % max(1, steps_per_beat * 2) == 0
		_:
			return step % steps_per_bar == 0


func _degree_for_step(step: int) -> int:
	var progression := _section_progression(_current_section)
	if progression.is_empty():
		return 0
	var bar_index := int(floor(float(step) / float(_steps_per_bar())))
	return int(progression[posmod(bar_index, progression.size())])


func _section_grid(section_id: String) -> Dictionary:
	var value = project.get("grid%s" % section_id, {})
	return value if value is Dictionary else {}


func _section_progression(section_id: String) -> Array:
	return _array_or_empty(project.get("progression%s" % section_id, []))


func _section_step_count(section_id: String) -> int:
	var section_bars_value = project.get("sectionBars", {})
	var section_bars := 4
	if section_bars_value is Dictionary:
		section_bars = int(section_bars_value.get(section_id, 4))
	return max(1, section_bars) * _steps_per_bar()


func _steps_per_bar() -> int:
	return max(1, _time_sig * _resolution)


func _step_duration_seconds(step_index: int) -> float:
	var base_duration := _beat_duration_seconds() / float(_resolution)
	if _resolution >= 2 and _resolution != 3 and step_index % 2 == 0:
		return base_duration * (1.0 + _swing)
	if _resolution >= 2 and _resolution != 3:
		return base_duration * (1.0 - _swing)
	return base_duration


func _beat_duration_seconds() -> float:
	return 60.0 / max(1.0, _bpm)


func _track_value(grid: Dictionary, track_name: String, step: int) -> float:
	var track = grid.get(track_name, [])
	if not (track is Array) or track.is_empty():
		return 0.0
	var value = track[posmod(step, track.size())]
	if value == null:
		return 0.0
	return float(value)


func _melody_track_steps(track) -> Array:
	if track is Array:
		return track
	if track is Dictionary:
		return _array_or_empty(track.get("value", []))
	return []


func _array_or_empty(value) -> Array:
	if value is Array:
		return value
	return []


func _sanitize_sequence(value) -> Array:
	var raw := _array_or_empty(value)
	var clean: Array = []
	for section in raw:
		var section_id := str(section)
		if section_id in ["A", "B", "C", "D"]:
			clean.append(section_id)
	if clean.is_empty():
		clean.append("A")
	return clean


func _scale_intervals() -> Array:
	return MINOR_SCALE if _scale == "minor" else MAJOR_SCALE


func _triad_quality(degree: int) -> String:
	var qualities := MINOR_QUALITIES if _scale == "minor" else MAJOR_QUALITIES
	return str(qualities[posmod(degree, qualities.size())])


func _chord_intervals(quality: String, chord_type: String) -> Array:
	match chord_type:
		"sus2":
			return [0, 2, 7]
		"sus4":
			return [0, 5, 7]
		"seventh":
			match quality:
				"maj":
					return [0, 4, 7, 11]
				"min":
					return [0, 3, 7, 10]
				"dim":
					return [0, 3, 6, 10]
				_:
					return [0, 4, 7, 10]
		_:
			match quality:
				"min":
					return [0, 3, 7]
				"dim":
					return [0, 3, 6]
				_:
					return [0, 4, 7]


func _chord_root_midi(degree: int, base_midi: int) -> int:
	var key_index := NOTE_NAMES.find(_key)
	if key_index < 0:
		key_index = 0
	var intervals := _scale_intervals()
	return base_midi + key_index + int(intervals[posmod(degree, intervals.size())])


func _scale_note_midi(note_index: int, base_midi: int) -> int:
	var key_index := NOTE_NAMES.find(_key)
	if key_index < 0:
		key_index = 0
	var intervals := _scale_intervals()
	var scale_degree := posmod(note_index, intervals.size())
	var octave := int(floor(float(note_index) / float(intervals.size())))
	return base_midi + key_index + int(intervals[scale_degree]) + octave * 12


func _midi_to_freq(midi_note: int) -> float:
	return 440.0 * pow(2.0, (float(midi_note) - 69.0) / 12.0)
