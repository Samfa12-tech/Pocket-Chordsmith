extends SceneTree

const Manifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")
const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2:
		push_error("Expected pack manifest path and output directory.")
		quit(1)
		return
	var source: Dictionary = Manifest.load_manifest_file(args[0])
	if not source.ok:
		push_error(str(source.errors))
		quit(1)
		return
	root.size = Vector2i(640, 360)
	var label := Label.new()
	label.position = Vector2(24, 36)
	label.add_theme_font_size_override("font_size", 20)
	root.add_child(label)
	var capture := AudioEffectCapture.new()
	capture.buffer_length = 5.0
	AudioServer.add_bus_effect(0, capture)
	var results: Array = []
	for synchronized in [false, true]:
		for mix in ["full-mix", "layers"]:
			var imported: Dictionary = Manifest.create_playback_profile_from_manifest(source.manifest, args[0].get_base_dir(), {"playback_mix": mix, "use_audio_stream_synchronized": synchronized})
			if not imported.ok:
				push_error(str(imported.errors))
				quit(1)
				return
			var chart = Chart.new()
			chart.bpm = 120
			chart.arrangement.assign(["A"])
			chart.arrangement_positions.append({"id": "A", "arrangement_index": 0, "start_tick": 0, "length_ticks": 3840, "bars": 2})
			var music = Conductor.new()
			music.chart = chart
			music.playback_profile = imported.profile
			music.playback_profile.sample_preview_enabled = false
			music.playback_profile.sample_preview_prewarm_on_ready = false
			root.add_child(music)
			label.text = "Pocket Audio - exported PCM parity\n\n%s / synchronized=%s\nMix rate: %s / driver: %s\n\nCapturing engine-bus PCM for reference comparison.\nNo human listening claim." % [mix, synchronized, AudioServer.get_mix_rate(), AudioServer.get_driver_name()]
			# Drain the previous run's output before capturing this start.
			await create_timer(0.3).timeout
			capture.clear_buffer()
			music.play()
			music.set_process(false)
			await create_timer(2.5).timeout
			music.stop()
			var samples := capture.get_buffer(capture.get_frames_available())
			var pcm := PackedByteArray()
			pcm.resize(samples.size() * 8)
			for i in range(samples.size()):
				pcm.encode_float(i * 8, samples[i].x)
				pcm.encode_float(i * 8 + 4, samples[i].y)
			var name := "%s-%s.f32" % [mix, "sync" if synchronized else "layers"]
			var output := FileAccess.open(args[1].path_join(name), FileAccess.WRITE)
			output.store_buffer(pcm)
			output.close()
			results.append({"mix": mix, "synchronized": synchronized, "frames": samples.size(), "file": name, "selected_streams": imported.profile.stem_paths.size()})
			music.queue_free()
			await process_frame
	AudioServer.remove_bus_effect(0, AudioServer.get_bus_effect_count(0) - 1)
	label.text = "Pocket Audio - capture complete\nGodot %s / %s\n\nFour reference/layer routes captured.\nDecoded PCM comparison runs separately." % [Engine.get_version_info().get("string", ""), AudioServer.get_driver_name()]
	if DisplayServer.get_name() != "headless":
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(args[1].path_join("rendered-pack-runtime.png"))
	print(JSON.stringify({"test": "rendered-pack-capture", "mix_rate": AudioServer.get_mix_rate(), "driver": AudioServer.get_driver_name(), "captures": results}))
	quit(0)
