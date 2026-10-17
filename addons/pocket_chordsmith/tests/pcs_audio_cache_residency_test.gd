extends SceneTree

const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
var async_result: Dictionary = {}

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var failures: Array[String] = []
	var path := "user://pcs-residency-%s.wav" % str(Time.get_ticks_usec())
	var stream := AudioStreamWAV.new()
	stream.mix_rate = 48000
	stream.stereo = true
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	var data := PackedByteArray()
	data.resize(48000 * 4)
	for frame in range(48000):
		data.encode_s16(frame * 4, int(sin(frame * TAU * 220.0 / 48000.0) * 6000.0))
		data.encode_s16(frame * 4 + 2, int(sin(frame * TAU * 330.0 / 48000.0) * 4000.0))
	stream.data = data
	if stream.save_to_wav(path) != OK:
		push_error("Could not save cache residency fixture.")
		quit(1)
		return
	var music := Conductor.new()
	music.playback_profile = Profile.new()
	music.playback_profile.sample_preview_prewarm_on_ready = false
	root.add_child(music)
	var started := Time.get_ticks_usec()
	var cold := music._load_audio_stream(path) as AudioStreamWAV
	var cold_us := Time.get_ticks_usec() - started
	if cold == null or cold.data != data:
		failures.append("Cold WAV load must retain the exact source PCM.")
	var sections := Profile.new()
	sections.sample_preview_prewarm_on_ready = false
	sections.preserve_prepared_wav_endings = true
	sections.section_stem_sets = {"A": {"full": path}, "B": {"full": path}}
	music.set_playback_profile(sections)
	var frame_before := Engine.get_process_frames()
	var prepared: Dictionary = await music.prewarm_sections_async(["A", "B", "A"])
	var preparation_frames := Engine.get_process_frames() - frame_before
	# process_frame is emitted before Godot increments its frame counter, so
	# three awaited signals span at least two completed process frames here.
	if not prepared.ok or prepared.loaded != 1 or prepared.cached_streams != 1 or preparation_frames < 2 or music.is_playing():
		failures.append("Loading-scene preparation must yield between assets, deduplicate residency and never autoplay.")
	for cancellation in ["explicit", "profile"]:
		async_result = {}
		_prepare.call_deferred(music)
		await process_frame
		if cancellation == "profile":
			music.set_playback_profile(Profile.new())
		else:
			music.cancel_audio_prewarm()
		var waited := 0
		while async_result.is_empty() and waited < 8:
			await process_frame
			waited += 1
		if not async_result.get("cancelled", false) or async_result.get("ok", true):
			failures.append("Cancelled section preparation must return an explicit incomplete report: %s" % cancellation)
		if cancellation == "profile" and not music._audio_stream_cache.is_empty():
			failures.append("Stale preparation repopulated a replacement profile cache.")
	var profile := Profile.new()
	profile.event_sample_streams = {"fixture": path}
	profile.sample_preview_prewarm_on_ready = true
	music.set_playback_profile(profile)
	var first_cache_size: int = music._audio_stream_cache.size()
	# Same immutable paths are common when a game replaces a profile resource.
	# A previous signature must not mask an emptied cache after that replacement.
	music.set_playback_profile(profile.duplicate(true))
	if first_cache_size != 1 or music._audio_stream_cache.size() != 1:
		failures.append("Replacing a same-path profile must actually repopulate its emptied prewarm cache.")
	var resident := music._load_audio_stream(path, true)
	# A resident resource is the gameplay source of truth until explicit profile
	# replacement. A warm lookup must not reopen/probe its original disk path.
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	started = Time.get_ticks_usec()
	var warm := music._load_audio_stream(path, true)
	var warm_us := Time.get_ticks_usec() - started
	if resident == null or warm != resident:
		failures.append("Warm playback must reuse resident PCM without a filesystem prerequisite.")
	music.set_playback_profile(Profile.new())
	if not music._audio_stream_cache.is_empty() or music._load_audio_stream(path, true) != null:
		failures.append("Explicit profile replacement must release residency and not reuse stale missing assets.")
	music.queue_free()
	await process_frame
	for failure in failures:
		push_error(failure)
	print(JSON.stringify({"test": "audio-cache-residency", "engine": Engine.get_version_info().get("string", ""), "fixture_pcm_bytes": data.size(), "cold_load_us": cold_us, "warm_lookup_us": warm_us, "loading_scene_preparation": prepared, "preparation_frames": preparation_frames, "checks": 8, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _prepare(music) -> void:
	async_result = await music.prewarm_sections_async(["A", "B", "A", "B"])
