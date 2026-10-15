extends SceneTree

const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
var errors: Array[String] = []
var measurements: Array[Dictionary] = []
var capture := AudioEffectCapture.new()
var scene_label: Label

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	root.size = Vector2i(640, 360)
	var background := ColorRect.new()
	background.color = Color("17232e")
	background.size = Vector2(640, 360)
	root.add_child(background)
	scene_label = Label.new()
	scene_label.position = Vector2(24, 30)
	scene_label.size = Vector2(590, 300)
	scene_label.add_theme_font_size_override("font_size", 19)
	scene_label.text = "Pocket Audio — prepared stem origin regression\nGenerated 220 / 660 Hz section tones\nWarming test audio driver…"
	root.add_child(scene_label)
	capture.buffer_length = 0.3
	AudioServer.add_bus_effect(0, capture)
	# Warm the test audio driver before timing positions. Cold-load performance
	# is a separate gate; Dummy may not mix its first block during engine startup.
	var warmup := AudioStreamPlayer.new()
	warmup.stream = _tone(110.0, 1.0)
	root.add_child(warmup)
	warmup.play()
	await create_timer(0.6).timeout
	warmup.stop()
	warmup.queue_free()
	await process_frame
	for synchronized in [false, true]:
		await _check_route(synchronized, true)
		await _check_route(synchronized, false)
	AudioServer.remove_bus_effect(0, AudioServer.get_bus_effect_count(0) - 1)
	await create_timer(0.1).timeout
	scene_label.text = "Pocket Audio — prepared stem origins\nGodot %s · %s\n\n%s / %s scenarios passed\nSection-local / full-song · seek / repeated A/B\nSynchronized / per-layer players\n\nEngine-bus PCM capture; no human listening claim" % [Engine.get_version_info().get("string", ""), AudioServer.get_driver_name(), measurements.filter(func(item): return item.passed).size(), measurements.size()]
	if DisplayServer.get_name() != "headless":
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://stem-origin-runtime.png")
	for message in errors:
		push_error(message)
	print(JSON.stringify({"test": "prepared-stem-origin", "engine": Engine.get_version_info(), "audio_driver": AudioServer.get_driver_name(), "measurements": measurements, "errors": errors}))
	quit(0 if errors.is_empty() else 1)

func _check_route(synchronized: bool, local: bool) -> void:
	var chart = Chart.new()
	chart.bpm = 120
	chart.time_signature = 4
	chart.arrangement.assign(["A", "B", "A", "B"])
	for i in range(4):
		chart.arrangement_positions.append({"id": chart.arrangement[i], "arrangement_index": i, "start_tick": i * 1920, "length_ticks": 1920, "bars": 1})
	var profile = Profile.new()
	profile.use_audio_stream_synchronized = synchronized
	profile.sample_preview_enabled = false
	profile.sample_preview_prewarm_on_ready = false
	if local:
		profile.set_section_stems("A", {"music": _tone(220.0, 2.0)})
		profile.set_section_stems("B", {"music": _tone(660.0, 2.0)})
	else:
		profile.stem_paths = {"music": _tone(330.0, 8.0)}
	var music = Conductor.new()
	music.chart = chart
	music.playback_profile = profile
	root.add_child(music)
	music.play()
	music.set_process(false)
	music.jump_to_section("B")
	await _assert_position(music, 0.0 if local else 2.0, synchronized, local, "first-B")
	music.seek_tick(2880)
	await _assert_position(music, 1.0 if local else 3.0, synchronized, local, "seek-half-B")
	music.current_sequence.assign(["A", "B", "A", "B"])
	music.call("_seek_to_sequence_index", 3)
	await _assert_position(music, 0.0 if local else 6.0, synchronized, local, "repeated-B")
	music.call("_seek_to_sequence_index", 2)
	await _assert_position(music, 0.0 if local else 4.0, synchronized, local, "repeated-A")
	music.stop()
	music.queue_free()
	await process_frame

func _assert_position(music: Node, expected: float, synchronized: bool, local: bool, scenario: String) -> void:
	scene_label.text = "Prepared audio origin regression\n\n%s · synchronized=%s · section-local=%s\nExpected file origin: %.3f seconds\n\nGenerated PCM tones; engine-bus capture" % [scenario, synchronized, local, expected]
	var started_usec := Time.get_ticks_usec()
	capture.clear_buffer()
	await create_timer(0.2).timeout
	var elapsed_seconds := float(Time.get_ticks_usec() - started_usec) / 1000000.0
	var player: AudioStreamPlayer = music.get("_stem_player") if synchronized else music.get("_stem_layer_players").get("full")
	var actual: float = player.get_playback_position() if is_instance_valid(player) else -1.0
	var samples := capture.get_buffer(capture.get_frames_available())
	var peak := 0.0
	for frame in samples:
		peak = max(peak, abs(frame.x), abs(frame.y))
	var ok := is_instance_valid(player) and player.playing and actual >= expected - 0.03 and actual < expected + elapsed_seconds + 0.35 and peak > 0.001
	measurements.append({"synchronized": synchronized, "local": local, "scenario": scenario, "expected_seconds": expected, "actual_seconds": actual, "elapsed_seconds": elapsed_seconds, "playing": is_instance_valid(player) and player.playing, "captured_frames": samples.size(), "captured_peak": peak, "passed": ok})
	if not ok:
		errors.append("%s sync=%s local=%s expected=%s actual=%s" % [scenario, synchronized, local, expected, actual])

func _tone(hz: float, seconds: float) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 48000
	var pcm := PackedByteArray()
	pcm.resize(int(seconds * 48000) * 2)
	for i in range(pcm.size() / 2):
		pcm.encode_s16(i * 2, int(sin(TAU * hz * float(i) / 48000.0) * 2000))
	stream.data = pcm
	return stream
