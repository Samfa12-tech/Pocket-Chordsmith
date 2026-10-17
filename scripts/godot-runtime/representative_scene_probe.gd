extends SceneTree

const Conductor := preload("res://probe_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const DrawScene := preload("res://scene_draw.gd")
var routes: Array = []
var frame_rows: Array = []
var audio_rows: Array = []
var conductor_spans: Array = []
var events: Array = []
var draw_events: Array = []
var failures: Array[String] = []
var config := {}
var begun_us := 0
var previous_us := 0
var previous_audio_us := 0
var phase := "setup"
var active := false
var sfx_enabled := false
var next_sfx_us := 0
var sfx_index := 0
var sfx_players: Array[AudioStreamPlayer] = []
var sfx_capture: AudioEffectCapture
var sfx_bus := -1
var sfx_frames := 0
var sfx_nonzero := false
var viewport: SubViewport
var scene

func _init() -> void:
	_run.call_deferred()

func _process(_delta: float) -> bool:
	var entered := Time.get_ticks_usec()
	if not active:
		return false
	frame_rows.append({"us":entered,"previous_us":previous_us,"gap_ms":float(entered-previous_us)/1000.0,"phase":phase})
	previous_us = entered
	var capture_begin := Time.get_ticks_usec()
	for route in routes:
		var frames: PackedVector2Array = route.capture.get_buffer(route.capture.get_frames_available())
		if not frames.is_empty():
			route.chunks.append(frames)
			route.drained += frames.size()
			route.last_pcm = frames[frames.size()-1]
	if sfx_capture != null:
		var sfx_chunk := sfx_capture.get_buffer(sfx_capture.get_frames_available())
		sfx_frames += sfx_chunk.size()
		if not sfx_chunk.is_empty() and sfx_chunk[sfx_chunk.size()-1].length_squared() > 0.000001:
			sfx_nonzero = true
	var capture_end := Time.get_ticks_usec()
	if sfx_enabled and entered >= next_sfx_us:
		var expected := next_sfx_us
		next_sfx_us += 100000
		var player: AudioStreamPlayer = sfx_players[sfx_index % sfx_players.size()]
		player.play()
		sfx_index += 1
		events.append({"kind":"sfx-request","due_us":expected,"actual_us":Time.get_ticks_usec(),"late_ms":float(entered-expected)/1000.0,"phase":phase})
	if entered - previous_audio_us >= 50000:
		previous_audio_us = entered
		_sample_audio()
	var draw_begin := Time.get_ticks_usec()
	RenderingServer.force_draw(false)
	var draw_end := Time.get_ticks_usec()
	frame_rows[frame_rows.size()-1]["capture_begin_us"] = capture_begin
	frame_rows[frame_rows.size()-1]["capture_end_us"] = capture_end
	frame_rows[frame_rows.size()-1]["force_draw_begin_us"] = draw_begin
	frame_rows[frame_rows.size()-1]["force_draw_end_us"] = draw_end
	frame_rows[frame_rows.size()-1]["tree_process_end_us"] = Time.get_ticks_usec()
	_deferred_tail.call_deferred(entered,phase)
	return false

func _deferred_tail(frame_us: int, frame_phase: String) -> void:
	draw_events.append({"kind":"deferred-tail","frame_us":frame_us,"us":Time.get_ticks_usec(),"phase":frame_phase})

func _run() -> void:
	begun_us = Time.get_ticks_usec()
	config = JSON.parse_string(FileAccess.get_file_as_string("res://run-config.json"))
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
	var identity := {"pid":OS.get_process_id(),"engine":Engine.get_version_info(),"driver":AudioServer.get_driver_name(),"mix_rate":AudioServer.get_mix_rate(),"display":DisplayServer.get_name(),"renderer":RenderingServer.get_current_rendering_method(),"rendering_device":RenderingServer.get_video_adapter_name(),"output_latency_seconds":AudioServer.get_output_latency(),"godot_internal_thread_id":OS.get_thread_caller_id(),"thread_id_is_win32":false,"begun_us":begun_us,"scope":"Actual offscreen raster and engine-bus PCM; not physical speaker-consumed capture or human listening."}
	_write("res://identity.json",identity)
	var wav := _phase_wav()
	for kind in ["raw","addon"]:
		for synchronized in [false,true]:
			_make_route(kind,synchronized,wav)
	_make_sfx()
	await create_timer(0.15).timeout
	active = true
	previous_us = Time.get_ticks_usec()
	await _phase_wait("render-only",float(config.get("phase_seconds",4)))
	for route in routes:
		_start(route)
	await _phase_wait("music-and-render",float(config.get("phase_seconds",4)))
	sfx_enabled = true
	next_sfx_us = Time.get_ticks_usec()
	await _phase_wait("music-render-and-sfx",float(config.get("phase_seconds",4)))
	phase = "known-scheduler-delay-control"
	var delay_begin := Time.get_ticks_usec()
	OS.delay_msec(180)
	events.append({"kind":"known-main-thread-delay","begin_us":delay_begin,"end_us":Time.get_ticks_usec(),"phase":phase})
	await _phase_wait("post-delay-music-and-sfx",2.5)
	sfx_enabled = false
	phase = "stop-drain"
	for route in routes:
		_stop(route)
	for player in sfx_players:
		player.stop()
	await create_timer(0.2).timeout
	_sample_audio()
	active = false
	var observation_end := Time.get_ticks_usec()
	RenderingServer.force_draw(false)
	viewport.get_texture().get_image().save_png("res://representative-scene.png")
	var reports: Array = []
	for route in routes:
		var pcm := FileAccess.open("res://"+str(route.name)+".f32",FileAccess.WRITE)
		for chunk in route.chunks:
			pcm.store_buffer(chunk.to_byte_array())
		pcm.close()
		var drops: int = route.capture.get_discarded_frames()
		if route.drained == 0 or drops != 0:
			failures.append("Missing/dropped PCM: "+str(route.name))
		reports.append({"name":route.name,"drained_frames":route.drained,"pushed_frames":route.capture.get_pushed_frames(),"discarded_frames":drops,"starts":route.starts})
		if route.music != null:
			route.music.queue_free()
		else:
			route.player.queue_free()
	for player in sfx_players:
		player.stream = null
		player.queue_free()
	sfx_players.clear()
	await process_frame
	await create_timer(0.2).timeout
	for route in routes:
		AudioServer.remove_bus_effect(AudioServer.get_bus_index(route.name),0)
	# Remove in reverse index order, preserving all host buses outside this project.
	for index in range(AudioServer.bus_count-1,0,-1):
		AudioServer.remove_bus(index)
	if sfx_index == 0 or not sfx_nonzero:
		failures.append("SFX output not observed")
	var report := {"identity":identity,"config":config,"begun_us":begun_us,"observation_end_us":observation_end,"frame_rows":frame_rows,"audio_rows":audio_rows,"conductor_spans":conductor_spans,"events":events,"draw_events":draw_events,"routes":reports,"sfx_requests":sfx_index,"sfx_captured_frames":sfx_frames,"sfx_nonzero":sfx_nonzero,"failures":failures,"persistence_begin_us":Time.get_ticks_usec(),"retained_limits":{"clock_phase_seconds":0.15,"steady_frame_ms":1000.0/30.0},"all_phases_retained":true}
	_write("res://probe-report.json",report)
	_write("res://completion.json",{"finished_us":Time.get_ticks_usec(),"observation_end_us":observation_end,"failures":failures})
	print(JSON.stringify({"test":"representative-audio-scene-probe","driver":AudioServer.get_driver_name(),"frames":frame_rows.size(),"audio_rows":audio_rows.size(),"sfx_requests":sfx_index,"routes":reports,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

func _phase_wait(name: String, seconds: float) -> void:
	phase = name
	events.append({"kind":"phase","name":name,"us":Time.get_ticks_usec()})
	print(JSON.stringify({"progress":name,"seconds":seconds}))
	await create_timer(seconds).timeout

func _make_route(kind: String, synchronized: bool, wav: AudioStreamWAV) -> void:
	var name := kind + ("-synchronized" if synchronized else "-standalone")
	AudioServer.add_bus()
	var bus := AudioServer.bus_count-1
	AudioServer.set_bus_name(bus,name)
	AudioServer.set_bus_volume_db(bus,-35.0)
	var capture := AudioEffectCapture.new()
	capture.buffer_length = 3.0
	AudioServer.add_bus_effect(bus,capture)
	var music = null
	var player: AudioStreamPlayer
	if kind == "raw":
		player = AudioStreamPlayer.new()
		player.bus = name
		var looped := wav.duplicate() as AudioStreamWAV
		looped.loop_mode = AudioStreamWAV.LOOP_FORWARD
		looped.loop_begin = 0
		looped.loop_end = 96000
		if synchronized:
			var stream := AudioStreamSynchronized.new()
			stream.set_stream_count(1)
			stream.set_sync_stream(0,looped)
			player.stream = stream
		else:
			player.stream = looped
		root.add_child(player)
	else:
		var chart := Chart.new()
		chart.bpm = 120
		chart.arrangement.assign(["A","B"])
		for index in range(2):
			chart.arrangement_positions.append({"id":chart.arrangement[index],"arrangement_index":index,"start_tick":index*1920,"length_ticks":1920,"bars":1})
		chart.default_music_state = "repeat_A"
		chart.music_states = {"repeat_A":{"section":"A","loop":true}}
		var profile := Profile.new()
		profile.sample_preview_enabled = false
		profile.sample_preview_prewarm_on_ready = false
		profile.loop_prepared_sections = true
		profile.use_audio_stream_synchronized = synchronized
		profile.master_music_bus = name
		profile.stem_bus_names = {"full":name}
		profile.set_section_stems("A",{"full":wav})
		profile.set_section_stems("B",{"full":wav})
		music = Conductor.new()
		music.probe_owner = self
		music.probe_name = name
		music.chart = chart
		music.playback_profile = profile
		root.add_child(music)
		music.beat.connect(func(bar,beat): events.append({"kind":"beat","route":name,"us":Time.get_ticks_usec(),"bar":bar,"beat":beat,"tick":music.current_tick,"anchor_us":music.get("_clock_anchor_usec")}))
		scene.beat_flash = 0.5
	routes.append({"name":name,"kind":kind,"synchronized":synchronized,"player":player,"music":music,"capture":capture,"chunks":[],"drained":0,"last_pcm":Vector2.ZERO,"starts":0,"anchor_us":0})

func _start(route: Dictionary) -> void:
	var begin := Time.get_ticks_usec()
	if route.music != null:
		route.music.play()
		route.anchor_us = route.music.get("_clock_anchor_usec")
		route.player = route.music.get("_stem_player") if route.synchronized else route.music.get("_stem_layer_players").get("full")
		if not route.synchronized and route.player == null:
			var layers: Dictionary = route.music.get("_stem_layer_players")
			if not layers.is_empty():
				route.player = layers.values()[0]
	else:
		route.player.play()
		route.anchor_us = Time.get_ticks_usec()
	route.starts += 1
	events.append({"kind":"start","route":route.name,"begin_us":begin,"end_us":Time.get_ticks_usec(),"anchor_us":route.anchor_us})

func _stop(route: Dictionary) -> void:
	var begin := Time.get_ticks_usec()
	if route.music != null:
		route.music.stop()
	else:
		route.player.stop()
	events.append({"kind":"stop","route":route.name,"begin_us":begin,"end_us":Time.get_ticks_usec()})

func _sample_audio() -> void:
	var begin := Time.get_ticks_usec()
	var samples: Array = []
	for route in routes:
		# Native arrangement setup can replace the active player after Play.
		# Resolve the actual live player rather than retaining that setup snapshot.
		var player: AudioStreamPlayer = route.player
		if route.music != null:
			player = null
			var synchronized_player: AudioStreamPlayer = route.music.get("_stem_player")
			if is_instance_valid(synchronized_player) and synchronized_player.playing and synchronized_player.stream != null:
				player = synchronized_player
			else:
				var layer_players: Dictionary = route.music.get("_stem_layer_players")
				for candidate in layer_players.values():
					if is_instance_valid(candidate) and candidate.playing and candidate.stream != null:
						player = candidate
						break
		var pos := player.get_playback_position() if is_instance_valid(player) else 0.0
		var pcm: Vector2 = route.last_pcm
		samples.append({"route":route.name,"position_seconds":pos,"player_playing":player.playing if is_instance_valid(player) else false,"conductor_tick":route.music.current_tick if route.music != null else null,"conductor_anchor_us":route.music.get("_clock_anchor_usec") if route.music != null else null,"anchor_us":route.anchor_us,"drained_frames":route.drained,"pushed_frames":route.capture.get_pushed_frames(),"dropped_frames":route.capture.get_discarded_frames(),"pcm_x":pcm.x,"pcm_y":pcm.y})
	audio_rows.append({"begin_us":begin,"end_us":Time.get_ticks_usec(),"phase":phase,"since_mix_seconds":AudioServer.get_time_since_last_mix(),"to_mix_seconds":AudioServer.get_time_to_next_mix(),"samples":samples})

func _make_sfx() -> void:
	AudioServer.add_bus()
	sfx_bus = AudioServer.bus_count-1
	AudioServer.set_bus_name(sfx_bus,"ProbeSFX")
	AudioServer.set_bus_volume_db(sfx_bus,-32.0)
	sfx_capture = AudioEffectCapture.new()
	sfx_capture.buffer_length = 3.0
	AudioServer.add_bus_effect(sfx_bus,sfx_capture)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = 48000
	var pcm := PackedByteArray()
	pcm.resize(4800*2)
	for frame in range(4800):
		pcm.encode_s16(frame*2,int(sin(TAU*880.0*float(frame)/48000.0)*sin(PI*float(frame)/4800.0)*6000))
	wav.data = pcm
	for index in range(12):
		var player := AudioStreamPlayer.new()
		player.bus = "ProbeSFX"
		player.stream = wav
		root.add_child(player)
		sfx_players.append(player)

func _phase_wav() -> AudioStreamWAV:
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = 48000
	wav.stereo = true
	var pcm := PackedByteArray()
	pcm.resize(96000*4)
	for frame in range(96000):
		var angle := TAU*float(frame)/96000.0
		pcm.encode_s16(frame*4,int(sin(angle)*4000))
		pcm.encode_s16(frame*4+2,int(cos(angle)*4000))
	wav.data = pcm
	return wav

func _write(path: String, value: Variant) -> void:
	var file := FileAccess.open(path,FileAccess.WRITE)
	file.store_string(JSON.stringify(value))
	file.close()
