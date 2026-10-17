extends "res://representative_scene_probe.gd"

func _run() -> void:
	begun_us = Time.get_ticks_usec()
	config = JSON.parse_string(FileAccess.get_file_as_string("res://prepared-config.json"))
	root.set_flag(Window.FLAG_NO_FOCUS,true)
	root.mode = Window.MODE_MINIMIZED
	viewport = SubViewport.new()
	viewport.size = Vector2i(800,480)
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	scene = DrawScene.new()
	viewport.add_child(scene)
	RenderingServer.frame_pre_draw.connect(func(): draw_events.append({"kind":"pre-draw","us":Time.get_ticks_usec(),"phase":phase}))
	RenderingServer.frame_post_draw.connect(func(): draw_events.append({"kind":"post-draw","us":Time.get_ticks_usec(),"phase":phase}))
	var identity := {"engine":Engine.get_version_info(),"driver":AudioServer.get_driver_name(),"mix_rate":AudioServer.get_mix_rate(),"output_latency_seconds":AudioServer.get_output_latency(),"display":DisplayServer.get_name(),"renderer":RenderingServer.get_current_rendering_method(),"device":RenderingServer.get_video_adapter_name(),"scope":"Rendered diagnostic scene and engine-bus PCM; no microphone or physical output/listening claim."}
	_write("res://identity.json",identity)
	if int(AudioServer.get_mix_rate()) != int(config.sample_rate):
		failures.append("Reference/output rate mismatch; direct PCM comparison not admitted")
		_write("res://completion.json",{"failures":failures})
		quit(1)
		return
	_make_sfx()
	active = true
	previous_us = Time.get_ticks_usec()
	await _phase_wait("render-only",1.0)
	var preparation: Array = []
	for route_config in config.routes:
		if route_config.kind == "raw":
			continue
		phase = "cold-prewarm-"+route_config.name
		var route := _make_musical_route(route_config)
		var start := Time.get_ticks_usec()
		var prepared: Dictionary = await route.music.prewarm_arrangement_async()
		var row := {"name":route.name,"begin_us":start,"end_us":Time.get_ticks_usec(),"report":prepared,"playing_after_prepare":route.music.is_playing(),"chart_bpm":route.music.chart.bpm,"chart_default_state":route.music.chart.default_music_state}
		preparation.append(row)
		if not prepared.ok or route.music.is_playing():
			failures.append("Preparation failed/autoplayed: "+route.name)
		if prepared.max_asset_load_us > 1000000.0/60.0:
			failures.append("Main-thread cold preparation exceeded one60Hz frame: "+route.name)
	# Raw control loads after addon preparation so it cannot warm the first cold path.
	for route_config in config.routes:
		if route_config.kind == "raw":
			_make_musical_route(route_config)
	await _phase_wait("prepared-silent",0.3)
	for route in routes:
		route.capture.clear_buffer()
		route.chunks.clear()
		route.drained = 0
	phase = "finite-music-render-sfx"
	events.append({"kind":"phase","name":phase,"us":Time.get_ticks_usec()})
	sfx_enabled = true
	next_sfx_us = Time.get_ticks_usec()
	for route in routes:
		_start(route)
		if route.music != null:
			route.selected_streams = route.music._stem_map_for_current_state().size()
			var synchronized_player: AudioStreamPlayer = route.music.get("_stem_player")
			var active_layers := 0
			for player in route.music.get("_stem_layer_players").values():
				if player.playing:
					active_layers += 1
			var sync_playing: bool = is_instance_valid(synchronized_player) and synchronized_player.playing and synchronized_player.stream != null
			events.append({"kind":"player-ownership","route":route.name,"requested_synchronized":route.synchronized,"profile_synchronized":route.music.playback_profile.use_audio_stream_synchronized,"active_layer_players":active_layers,"synchronized_playing":sync_playing})
			if route.synchronized != route.music.playback_profile.use_audio_stream_synchronized or (route.synchronized and (not sync_playing or active_layers!=0)) or (not route.synchronized and (sync_playing or active_layers!=route.selected_streams)):
				failures.append("Requested player ownership not observed: "+route.name)
	await create_timer(2.0).timeout
	phase = "known-scheduler-delay-control"
	var delay_begin := Time.get_ticks_usec()
	OS.delay_msec(180)
	events.append({"kind":"known-main-thread-delay","begin_us":delay_begin,"end_us":Time.get_ticks_usec(),"phase":phase})
	await _phase_wait("post-delay-finite-music-render-sfx",float(config.seconds)-2.0+0.7)
	var natural: Array = []
	for route in routes:
		var ended: bool = not route.music.is_playing() if route.music != null else not route.player.playing
		natural.append({"route":route.name,"naturally_ended":ended,"selected_streams":route.get("selected_streams",1)})
		if not ended:
			failures.append("Finite arrangement failed to end: "+route.name)
	sfx_enabled = false
	phase = "stop-drain"
	for route in routes:
		_stop(route)
	for player in sfx_players:
		player.stop()
	await create_timer(0.2).timeout
	active = false
	var observation_end := Time.get_ticks_usec()
	RenderingServer.force_draw(false)
	viewport.get_texture().get_image().save_png("res://representative-scene.png")
	var reports: Array = []
	for route in routes:
		var pcm := FileAccess.open("res://"+route.name+".f32",FileAccess.WRITE)
		for chunk in route.chunks:
			pcm.store_buffer(chunk.to_byte_array())
		pcm.close()
		var drops: int = route.capture.get_discarded_frames()
		if route.drained == 0 or drops != 0:
			failures.append("Missing/dropped PCM: "+route.name)
		reports.append({"name":route.name,"drained_frames":route.drained,"discarded_frames":drops,"starts":route.starts})
		if route.music != null:
			route.music.queue_free()
		else:
			route.player.stream = null
			route.player.queue_free()
	for player in sfx_players:
		player.stream = null
		player.queue_free()
	sfx_players.clear()
	await process_frame
	await create_timer(0.2).timeout
	for index in range(AudioServer.bus_count-1,0,-1):
		AudioServer.remove_bus(index)
	if not sfx_nonzero or sfx_index == 0:
		failures.append("SFX output missing")
	_write("res://probe-report.json",{"identity":identity,"config":config,"begun_us":begun_us,"observation_end_us":observation_end,"frame_rows":frame_rows,"audio_rows":audio_rows,"conductor_spans":conductor_spans,"events":events,"draw_events":draw_events,"preparation":preparation,"natural_endings":natural,"routes":reports,"sfx_requests":sfx_index,"sfx_nonzero":sfx_nonzero,"failures":failures,"retained_limits":{"clock_phase_seconds":0.15,"steady_frame_ms":1000.0/30.0,"main_thread_cold_us":1000000.0/60.0,"warm_play_us":2000}})
	_write("res://completion.json",{"finished_us":Time.get_ticks_usec(),"failures":failures})
	print(JSON.stringify({"test":"representative-musical-probe","routes":reports,"natural":natural,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

func _make_musical_route(route_config: Dictionary) -> Dictionary:
	var name: String = route_config.name
	AudioServer.add_bus()
	var bus := AudioServer.bus_count-1
	AudioServer.set_bus_name(bus,name)
	AudioServer.set_bus_volume_db(bus,-35.0)
	var capture := AudioEffectCapture.new()
	capture.buffer_length = 3.0
	AudioServer.add_bus_effect(bus,capture)
	var music = null
	var player: AudioStreamPlayer
	if route_config.kind == "raw":
		player = AudioStreamPlayer.new()
		player.bus = name
		player.stream = ResourceLoader.load(config.reference,"",ResourceLoader.CACHE_MODE_IGNORE)
		root.add_child(player)
	else:
		var profile = ResourceLoader.load(route_config.profile_path,"",ResourceLoader.CACHE_MODE_IGNORE)
		if profile.use_audio_stream_synchronized != route_config.synchronized:
			failures.append("Saved profile mode mismatch: "+name)
		profile.sample_preview_enabled = false
		profile.sample_preview_prewarm_on_ready = false
		for property in ["master_music_bus","drums_bus","bass_bus","chords_bus","guitar_bus","melody_bus","stingers_bus","fx_bus","music_bus_name"]:
			profile.set(property,name)
		for key in profile.stem_bus_names:
			profile.stem_bus_names[key] = name
		music = Conductor.new()
		music.probe_owner = self
		music.probe_name = name
		music.chart = ResourceLoader.load(route_config.chart_path,"",ResourceLoader.CACHE_MODE_IGNORE)
		music.playback_profile = profile
		root.add_child(music)
		music.beat.connect(func(bar,beat): events.append({"kind":"beat","route":name,"us":Time.get_ticks_usec(),"bar":bar,"beat":beat,"tick":music.current_tick,"anchor_us":music.get("_clock_anchor_usec")}))
	var route := {"name":name,"kind":route_config.kind,"synchronized":route_config.synchronized,"player":player,"music":music,"capture":capture,"chunks":[],"drained":0,"last_pcm":Vector2.ZERO,"starts":0,"anchor_us":0}
	routes.append(route)
	return route
