extends SceneTree

const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
var failures: Array[String] = []
var measurements: Array[Dictionary] = []

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	for synchronized in [false, true]:
		await _check_delta_frames(synchronized, true)
		await _check_delta_frames(synchronized, false)
		await _check_wall_clock(synchronized)
	await create_timer(0.1).timeout # Let the audio thread release stopped streams.
	for failure in failures:
		push_error(failure)
	print(JSON.stringify({"test": "prepared-loop-clock", "driver": AudioServer.get_driver_name(), "measurements": measurements, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _music(synchronized: bool, sequence: bool, wall_clock: bool) -> Node:
	var chart := Chart.new()
	chart.bpm = 120
	chart.arrangement.assign(["A", "B"] if sequence else ["A"])
	for index in range(chart.arrangement.size()):
		chart.arrangement_positions.append({"id": chart.arrangement[index], "arrangement_index": index, "start_tick": index * 1920, "length_ticks": 1920, "bars": 1})
	if sequence:
		chart.default_music_state = "repeat_A"
		chart.music_states = {"repeat_A": {"section": "A", "loop": true}}
	var profile := Profile.new()
	profile.loop_prepared_sections = true
	profile.sample_preview_enabled = false
	profile.sample_preview_prewarm_on_ready = false
	profile.sample_preview_wall_clock_timing = wall_clock
	profile.use_audio_stream_synchronized = synchronized
	profile.set_section_stems("A", {"full": _tone(220.0)})
	profile.set_section_stems("B", {"full": _tone(660.0)})
	var music := Conductor.new()
	music.chart = chart
	music.playback_profile = profile
	music.loop_enabled = true
	root.add_child(music)
	music.play()
	music.set_process(false)
	if not sequence:
		music.current_sequence.clear()
	return music

func _check_delta_frames(synchronized: bool, sequence: bool) -> void:
	var music := _music(synchronized, sequence, false)
	var beats: Array = []
	var on_beat := func(bar_index: int, beat_index: int): beats.append({"bar": bar_index, "beat": beat_index, "tick": music.current_tick})
	music.beat.connect(on_beat)
	var elapsed := 0.0
	var max_error := 0.0
	var max_beat_error := 0
	for index in range(30):
		# Deliberately late boundaries with fractional ticks and changing delays.
		var delta: float = [2.0203, 2.0337, 2.0091, 2.0419][index % 4]
		elapsed += delta
		music._process(delta)
		var expected := fposmod(elapsed * 960.0, 1920.0)
		max_error = maxf(max_error, absf(float(music.get("_tick_float")) - expected))
		max_beat_error = maxi(max_beat_error, absi(music.current_beat - (int(expected / 480.0) + 1)))
	var phase := fposmod(elapsed, 2.0)
	var transition_ok := true
	if sequence:
		music.queue_section("B", Conductor.TransitionBoundary.NEXT_BEAT)
		var until_next_beat := 0.5 - fposmod(phase, 0.5) + 0.002
		music._process(until_next_beat)
		transition_ok = music.current_section == "B"
	var ok := max_error < 0.00001 and max_beat_error == 0 and not beats.is_empty() and transition_ok
	measurements.append({"mode": "deterministic-irregular-frames", "synchronized": synchronized, "sequence": sequence, "frames": 30, "max_tick_error": max_error, "beat_error": max_beat_error, "queued_transition_checked": sequence, "queued_transition_passed": transition_ok if sequence else null, "passed": ok})
	if not ok:
		failures.append("Fractional loop overshoot/beat/queued transition failed: sync=%s sequence=%s" % [synchronized, sequence])
	music.beat.disconnect(on_beat)
	music.stop()
	music.queue_free()
	await process_frame

func _check_wall_clock(synchronized: bool) -> void:
	var music := _music(synchronized, true, true)
	var original_anchor: int = music.get("_clock_anchor_usec")
	var max_error := 0.0
	for late_boundary in [2.020, 4.033, 6.009]:
		await _wait_until(original_anchor + int(late_boundary * 1000000.0))
		var elapsed := float(Time.get_ticks_usec() - original_anchor) / 1000000.0
		music._process(0.0)
		var expected := fposmod(elapsed * 960.0, 1920.0)
		max_error = maxf(max_error, absf(float(music.get("_tick_float")) - expected))
	var player: AudioStreamPlayer = music.get("_stem_player") if synchronized else music.get("_stem_layer_players").get("full")
	var audio_phase := fposmod(player.get_playback_position(), 2.0)
	var clock_phase := float(music.current_tick) / 960.0
	var circular_phase_error := absf(fposmod(clock_phase - audio_phase + 1.0, 2.0) - 1.0)
	var next_beat_usec := original_anchor + int(ceil(float(Time.get_ticks_usec() - original_anchor) / 500000.0) * 500000.0) + 12000
	var anchor_preserved: bool = music.get("_clock_anchor_usec") == original_anchor
	music.queue_section("B", Conductor.TransitionBoundary.NEXT_BEAT)
	await _wait_until(next_beat_usec)
	music._process(0.0)
	var transition_ok: bool = music.current_section == "B"
	var ok := max_error < 1.0 and circular_phase_error < 0.15 and transition_ok and anchor_preserved
	measurements.append({"mode": "real-wall-clock-late-frames", "synchronized": synchronized, "max_tick_error": max_error, "audio_phase_seconds": audio_phase, "clock_phase_seconds": clock_phase, "circular_phase_error_seconds": circular_phase_error, "original_anchor_preserved": anchor_preserved, "queued_transition_passed": transition_ok, "passed": ok})
	if not ok:
		failures.append("Continuous player and wall-clock timeline diverged: sync=%s" % synchronized)
	music.stop()
	music.queue_free()
	await process_frame

func _wait_until(target_usec: int) -> void:
	while Time.get_ticks_usec() < target_usec:
		await create_timer(maxf(0.001, float(target_usec - Time.get_ticks_usec()) / 1000000.0)).timeout

func _tone(hz: float) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 48000
	var pcm := PackedByteArray()
	pcm.resize(96000 * 2)
	for frame in range(96000):
		pcm.encode_s16(frame * 2, int(sin(TAU * hz * float(frame) / 48000.0) * 2000))
	stream.data = pcm
	return stream
