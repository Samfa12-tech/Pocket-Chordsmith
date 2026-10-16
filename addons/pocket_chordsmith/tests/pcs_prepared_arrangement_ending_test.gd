extends SceneTree

const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
var failures: Array[String] = []
var measurements: Array[Dictionary] = []
var checks := 0

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	for synchronized in [false,true]:
		for layers in [false,true]:
			await _check_complete_ending(synchronized,layers)
	for intent in ["ordinary-loop","state","section","sequence"]:
		await _check_loop_intent(intent)
	await _check_queued_arrangement_boundary()
	await _check_stop_during_tail()
	for failure in failures:
		push_error(failure)
	print(JSON.stringify({"test":"prepared-arrangement-endings","checks":checks,"measurements":measurements,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

func _music(synchronized: bool, layers: bool, seconds := 1.0) -> Node:
	var chart := Chart.new()
	chart.bpm=240
	chart.arrangement.assign(["A"])
	chart.arrangement_positions.append({"id":"A","arrangement_index":0,"start_tick":0,"length_ticks":1920,"bars":1})
	var profile := Profile.new()
	profile.prepared_playback_scope="arrangement"
	profile.preserve_prepared_wav_endings=true
	profile.sample_preview_enabled=false
	profile.sample_preview_prewarm_on_ready=false
	profile.use_audio_stream_synchronized=synchronized
	profile.master_music_bus="Master"
	profile.guitar_bus="Master"
	profile.melody_bus="Master"
	profile.stem_paths={"guitar":_tone(seconds,4096),"melody":_tone(seconds,4096)} if layers else {"full":_tone(seconds,8192)}
	var music := Conductor.new()
	music.chart=chart
	music.playback_profile=profile
	music.loop_enabled=false
	root.add_child(music)
	return music

func _tone(seconds: float, amplitude: int) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format=AudioStreamWAV.FORMAT_16_BITS
	stream.stereo=true
	stream.mix_rate=int(AudioServer.get_mix_rate())
	var data := PackedByteArray()
	data.resize(int(seconds*stream.mix_rate)*4)
	for i in range(data.size()/4):
		data.encode_s16(i*4,amplitude)
		data.encode_s16(i*4+2,-amplitude/2)
	stream.data=data
	return stream

func _check_complete_ending(synchronized: bool, layers: bool) -> void:
	var name := "sync=%s/layers=%s"%[synchronized,layers]
	var music := _music(synchronized,layers)
	var prepared: Dictionary = await music.prewarm_arrangement_async()
	_check(prepared.ok and not music.is_playing(),name+" preparation must not autoplay")
	var loops := [0]
	music.loop_completed.connect(func(_name): loops[0]+=1)
	var capture := AudioEffectCapture.new()
	capture.buffer_length=3.0
	var index := AudioServer.get_bus_effect_count(0)
	AudioServer.add_bus_effect(0,capture)
	await create_timer(0.15).timeout
	capture.clear_buffer()
	music.play() # Keep actual conductor processing active for the entire capture.
	await create_timer(1.8).timeout
	var stopped: bool = not music.is_playing()
	var dropped := capture.get_discarded_frames()
	var samples := capture.get_buffer(capture.get_frames_available())
	var first := -1
	for i in range(samples.size()):
		if absf(samples[i].x)>0.01:
			first=i
			break
	var frames := int(AudioServer.get_mix_rate())
	var complete := first>=0 and first+frames<=samples.size()
	var tail_frames := int(AudioServer.get_mix_rate()/10.0)
	var tail_energy := 0.0
	if complete:
		for i in range(first+frames-tail_frames,first+frames):
			tail_energy+=samples[i].length_squared()
	var tail_rms := sqrt(tail_energy/float(maxi(1,tail_frames)*2))
	var expected_rms := sqrt((0.25*0.25+0.125*0.125)/2.0)
	_check(stopped,name+" finite arrangement must stop after consumed PCM")
	_check(loops[0]==0,name+" finite arrangement must not wrap as an adaptive sequence")
	_check(complete,name+" complete nonzero reference window must be captured")
	_check(tail_rms>=expected_rms*0.95,name+" energetic final100ms must survive the chart boundary")
	_check(dropped==0,name+" capture must not discard frames")
	measurements.append({"mode":name,"naturally_stopped":stopped,"loops":loops[0],"complete_window":complete,"tail_rms":tail_rms,"expected_tail_rms":expected_rms,"dropped":dropped})
	AudioServer.remove_bus_effect(0,index)
	capture=null
	await _cleanup(music)

func _check_loop_intent(intent: String) -> void:
	var music := _music(false,false)
	if intent=="ordinary-loop":
		music.loop_enabled=true
	elif intent=="state":
		music.chart.default_music_state="repeat"
		music.chart.music_states={"repeat":{"section":"A","loop":true}}
	var loops := [0]
	music.loop_completed.connect(func(_name): loops[0]+=1)
	music.play()
	if intent=="section":
		music.queue_section("A",Conductor.TransitionBoundary.IMMEDIATE)
	elif intent=="sequence":
		var sequence: Array[String]=["A"]
		music.queue_sequence(sequence,Conductor.TransitionBoundary.IMMEDIATE)
	await create_timer(1.3).timeout
	_check(music.is_playing() and loops[0]>0,intent+" explicitly requested looping must remain active")
	await _cleanup(music)

func _check_queued_arrangement_boundary() -> void:
	var music := _music(false,false,2.5)
	music.chart.arrangement.assign(["A","B"])
	music.chart.arrangement_positions.assign([
		{"id":"A","arrangement_index":0,"start_tick":0,"length_ticks":1920,"bars":1},
		{"id":"B","arrangement_index":1,"start_tick":1920,"length_ticks":1920,"bars":1},
	])
	music.play()
	await create_timer(1.2).timeout
	_check(music.current_section=="B","ordinary absolute PCM must advance the gameplay section")
	music.queue_section("A",Conductor.TransitionBoundary.NEXT_LOOP)
	await create_timer(1.1).timeout
	_check(music.is_playing() and music.current_section=="A","NEXT_LOOP queue must apply at the whole-arrangement boundary")
	await _cleanup(music)

func _check_stop_during_tail() -> void:
	var music := _music(true,false,1.5)
	music.play()
	await create_timer(1.2).timeout
	_check(music.is_playing(),"rendered tail must continue beyond its musical chart ending")
	music.stop()
	await create_timer(0.5).timeout
	_check(not music.is_playing(),"Stop during the ending must not resume/restart later")
	await _cleanup(music)

func _cleanup(music: Node) -> void:
	music.stop()
	music.queue_free()
	await process_frame
	await process_frame
	await create_timer(0.1).timeout
	_check(not is_instance_valid(music),"freed conductor must be released")

func _check(ok: bool, message: String) -> void:
	checks+=1
	if not ok:
		failures.append(message)
