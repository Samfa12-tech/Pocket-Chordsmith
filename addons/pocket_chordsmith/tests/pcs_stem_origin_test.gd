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
		await _check_empty_selection(synchronized)
		await _check_automatic_sections(synchronized)
		await _check_state_pause_seek(synchronized)
		await _check_ordinary_pause_resume(synchronized)
		await _check_player_ownership_switches(synchronized)
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
		# Include a held tail so slow rendered test frames cannot consume the
		# remainder of the file before a halfway-seek position can be inspected.
		profile.set_section_stems("A", {"music": _tone(220.0, 4.0)})
		profile.set_section_stems("B", {"music": _tone(660.0, 4.0)})
	else:
		profile.stem_paths = {"music": _tone(330.0, 8.0)}
	var music = Conductor.new()
	music.chart = chart
	music.playback_profile = profile
	root.add_child(music)
	music.play()
	music.set_process(false)
	music.jump_to_section("B")
	await _assert_position(music, 0.0 if local else 2.0, synchronized, local, "first-B", 660.0 if local else 330.0)
	music.seek_tick(2880)
	await _assert_position(music, 1.0 if local else 3.0, synchronized, local, "seek-half-B", 660.0 if local else 330.0)
	music.current_sequence.assign(["A", "B", "A", "B"])
	music.call("_seek_to_sequence_index", 3)
	await _assert_position(music, 0.0 if local else 6.0, synchronized, local, "repeated-B", 660.0 if local else 330.0)
	music.call("_seek_to_sequence_index", 2)
	await _assert_position(music, 0.0 if local else 4.0, synchronized, local, "repeated-A", 220.0 if local else 330.0)
	music.stop()
	music.queue_free()
	await process_frame

func _assert_position(music: Node, expected: float, synchronized: bool, local: bool, scenario: String, expected_hz: float) -> void:
	scene_label.text = "Prepared audio origin regression\n\n%s · synchronized=%s · section-local=%s\nExpected file origin: %.3f seconds\n\nGenerated PCM tones; engine-bus capture" % [scenario, synchronized, local, expected]
	var started_usec := Time.get_ticks_usec()
	await create_timer(0.2).timeout # Drain the previous player's queued output.
	capture.clear_buffer()
	await create_timer(0.2).timeout
	var elapsed_seconds := float(Time.get_ticks_usec() - started_usec) / 1000000.0
	var player: AudioStreamPlayer = music.get("_stem_player") if synchronized else music.get("_stem_layer_players").get("full")
	var actual: float = player.get_playback_position() if is_instance_valid(player) else -1.0
	var samples := capture.get_buffer(capture.get_frames_available())
	var peak := 0.0
	for frame in samples:
		peak = max(peak, abs(frame.x), abs(frame.y))
	var actual_hz := _captured_frequency(samples)
	var tone_matches: bool = abs(actual_hz - expected_hz) < max(15.0, expected_hz * 0.05)
	var ok: bool = is_instance_valid(player) and player.playing and actual >= expected - 0.03 and actual < expected + elapsed_seconds + 0.35 and peak > 0.001 and tone_matches
	measurements.append({"synchronized": synchronized, "local": local, "scenario": scenario, "expected_seconds": expected, "actual_seconds": actual, "elapsed_seconds": elapsed_seconds, "expected_hz": expected_hz, "captured_hz": actual_hz, "playing": is_instance_valid(player) and player.playing, "captured_frames": samples.size(), "captured_peak": peak, "passed": ok})
	if not ok:
		errors.append("%s sync=%s local=%s expected=%s actual=%s" % [scenario, synchronized, local, expected, actual])

func _captured_frequency(samples: PackedVector2Array) -> float:
	if samples.size() < 2:
		return 0.0
	var crossings := 0
	for i in range(1, samples.size()):
		if samples[i - 1].x <= 0.0 and samples[i].x > 0.0:
			crossings += 1
	return float(crossings) * AudioServer.get_mix_rate() / float(samples.size())

func _fixture_chart() -> Resource:
	var chart = Chart.new()
	chart.bpm = 120
	chart.time_signature = 4
	chart.arrangement.assign(["A", "B", "A", "B"])
	for i in range(4):
		chart.arrangement_positions.append({"id": chart.arrangement[i], "arrangement_index": i, "start_tick": i * 1920, "length_ticks": 1920, "bars": 1})
	return chart

func _fixture_profile(synchronized: bool) -> Resource:
	var profile = Profile.new()
	profile.use_audio_stream_synchronized = synchronized
	profile.sample_preview_enabled = false
	profile.sample_preview_prewarm_on_ready = false
	return profile

func _fixture_music(profile: Resource) -> Node:
	var music = Conductor.new()
	music.chart = _fixture_chart()
	music.playback_profile = profile
	root.add_child(music)
	music.play()
	music.set_process(false)
	return music

func _assert_silence(music: Node, synchronized: bool, scenario: String, require_empty := true) -> void:
	await create_timer(0.25).timeout
	capture.clear_buffer()
	await create_timer(0.2).timeout
	var samples := capture.get_buffer(capture.get_frames_available())
	var peak := 0.0
	for frame in samples:
		peak = max(peak, abs(frame.x), abs(frame.y))
	var ready: bool = music.call("_has_ready_stem_players")
	var sync_player: AudioStreamPlayer = music.get("_stem_player")
	var empty := not ready and (sync_player == null or sync_player.stream == null)
	var ok := samples.size() > 0 and peak < 0.00001 and (empty or not require_empty)
	measurements.append({"synchronized": synchronized, "scenario": scenario, "require_empty": require_empty, "ready_layers": ready, "captured_frames": samples.size(), "captured_peak": peak, "passed": ok})
	if not ok:
		errors.append("%s sync=%s stale_ready=%s peak=%s" % [scenario, synchronized, ready, peak])

func _dispose_music(music: Node) -> void:
	music.stop()
	music.queue_free()
	await process_frame

func _check_empty_selection(synchronized: bool) -> void:
	var profile = _fixture_profile(synchronized)
	profile.set_section_stems("A", {"music": _tone(220.0, 8.0)})
	var music = _fixture_music(profile)
	await _assert_position(music, 0.0, synchronized, true, "nonempty-A", 220.0)
	music.jump_to_section("B")
	await _assert_silence(music, synchronized, "empty-B-after-jump")
	music.jump_to_section("A")
	music.seek_tick(1920)
	await _assert_silence(music, synchronized, "empty-B-after-seek")
	await _dispose_music(music)

func _wait_for_occurrence(music: Node, index: int) -> bool:
	var deadline := Time.get_ticks_msec() + 6000
	while music.current_arrangement_index != index and Time.get_ticks_msec() < deadline:
		await process_frame
	return music.current_arrangement_index == index

func _check_automatic_sections(synchronized: bool) -> void:
	var profile = _fixture_profile(synchronized)
	profile.set_section_stems("A", {"music": _tone(220.0, 2.0)})
	profile.set_section_stems("B", {"music": _tone(660.0, 2.0)})
	var music = _fixture_music(profile)
	music.seek_tick(1680)
	music.set_process(true)
	var entered_b: bool = await _wait_for_occurrence(music, 1)
	if not entered_b:
		errors.append("Automatic first B transition timed out")
	else:
		await _assert_position(music, 0.0, synchronized, true, "automatic-B-processing-active", 660.0)
	var entered_a: bool = await _wait_for_occurrence(music, 2)
	if not entered_a:
		errors.append("Automatic repeated A transition timed out")
	else:
		await _assert_position(music, 0.0, synchronized, true, "automatic-repeated-A-processing-active", 220.0)
	await _dispose_music(music)

func _check_state_pause_seek(synchronized: bool) -> void:
	var profile = _fixture_profile(synchronized)
	profile.state_stem_sets = {"camp": {"music": _tone(880.0, 4.0)}}
	profile.state_stem_origin_ticks = {"camp": 1920}
	var music = Conductor.new()
	music.chart = _fixture_chart()
	music.playback_profile = profile
	music.current_music_state = "camp"
	root.add_child(music)
	music.play()
	music.set_process(false)
	music.seek_tick(2880)
	await _assert_position(music, 1.0, synchronized, true, "explicit-state-origin", 880.0)
	music.pause()
	await _assert_silence(music, synchronized, "state-paused", false)
	music.seek_tick(3360)
	await _assert_silence(music, synchronized, "state-seek-while-paused", false)
	music.resume()
	await _assert_position(music, 1.5, synchronized, true, "state-resume-after-paused-seek", 880.0)
	await _dispose_music(music)

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

func _check_ordinary_pause_resume(synchronized: bool) -> void:
	var profile = _fixture_profile(synchronized)
	profile.set_section_stems("A", {"music": _tone(220.0, 8.0)})
	var music = _fixture_music(profile)
	await create_timer(0.25).timeout
	var player: AudioStreamPlayer = music.get("_stem_player") if synchronized else music.get("_stem_layer_players").get("full")
	music.pause()
	var before := player.get_playback_position()
	await _assert_silence(music, synchronized, "ordinary-paused", false)
	var after := player.get_playback_position()
	var ok: bool = abs(after - before) < 0.03 and player.stream_paused
	measurements.append({"synchronized": synchronized, "scenario": "ordinary-pause-preserves-position", "before_seconds": before, "after_seconds": after, "passed": ok})
	if not ok:
		errors.append("ordinary pause changed position: sync=%s before=%s after=%s" % [synchronized, before, after])
	music.resume()
	await _assert_position(music, before, synchronized, true, "ordinary-resume-position", 220.0)
	await _dispose_music(music)

func _check_player_ownership_switches(initial_synchronized: bool) -> void:
	var profile = _fixture_profile(initial_synchronized)
	profile.set_section_stems("A", {"music": _tone(220.0, 8.0)})
	profile.set_section_stems("B", {"music": _tone(660.0, 8.0)})
	var music = _fixture_music(profile)
	for synchronized in [not initial_synchronized, initial_synchronized]:
		profile.use_audio_stream_synchronized = synchronized
		music.jump_to_section("B" if synchronized != initial_synchronized else "A")
		await _assert_position(music, 0.0, synchronized, true, "in-place-player-mode-switch", 660.0 if synchronized != initial_synchronized else 220.0)
		var sync_player: AudioStreamPlayer = music.get("_stem_player")
		var layer_count := 0
		var layer_streams := 0
		for player_value in music.get("_stem_layer_players").values():
			var player := player_value as AudioStreamPlayer
			if player.stream != null:
				layer_streams += 1
			if player.playing and not player.stream_paused:
				layer_count += 1
		var sync_active := sync_player.playing and not sync_player.stream_paused
		var ok: bool = (sync_active and layer_count == 0 and layer_streams == 0) if synchronized else (not sync_active and sync_player.stream == null and layer_count == 1)
		measurements.append({"synchronized": synchronized, "scenario": "exclusive-player-ownership", "synchronized_active": sync_active, "layer_active_count": layer_count, "layer_stream_count": layer_streams, "passed": ok})
		if not ok:
			errors.append("player mode switch retained overlapping ownership: sync=%s layers=%s sync_active=%s" % [synchronized, layer_count, sync_active])
	await _dispose_music(music)
