extends SceneTree

const Conductor = preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile = preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const LoadJob = preload("res://addons/pocket_chordsmith/runtime/pcs_audio_asset_load_job.gd")
var failures: Array[String] = []
var cancellation := ""
var subject
var requested_jobs := 0

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var path := "res://pcs-async-%s.res" % Time.get_ticks_usec()
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.stereo = true
	wav.mix_rate = 48000
	var pcm := PackedByteArray()
	pcm.resize(48000 * 4)
	for frame in range(48000):
		pcm.encode_s16(frame * 4, int(sin(frame * TAU * 220.0 / 48000.0) * 5000.0))
		pcm.encode_s16(frame * 4 + 2, int(sin(frame * TAU * 330.0 / 48000.0) * 4000.0))
	wav.data = pcm
	if ResourceSaver.save(wav, path) != OK:
		push_error("Could not save the threaded resource fixture.")
		quit(1)
		return
	root.child_entered_tree.connect(_job_started)
	subject = _music(path)
	var report: Dictionary = await subject.prewarm_sections_async(["A", "A"])
	var resident = subject._load_prepared_stem_audio_stream(path)
	_check(report.ok and report.threaded_assets == 1 and report.loaded == 1 and report.cached_streams == 1, "Cold imported preparation must thread once and deduplicate residency.")
	_check(not subject.is_playing() and resident.data.slice(0, pcm.size()) == pcm and wav.data == pcm, "Preparation must retain PCM and caller resource, with no autoplay.")
	var warm: Dictionary = await subject.prewarm_sections_async(["A"])
	_check(warm.ok and warm.threaded_assets == 0 and subject._load_prepared_stem_audio_stream(path) == resident, "Warm preparation must reuse the same prepared resource.")
	subject.queue_free()
	await process_frame
	subject = _music(path)
	subject.playback_profile.stem_paths = {"full": path}
	subject.playback_profile.section_stem_sets.clear()
	subject.playback_profile.prepared_playback_scope = "arrangement"
	var arrangement: Dictionary = await subject.prewarm_arrangement_async()
	_check(arrangement.ok and arrangement.threaded_assets == 1 and arrangement.loaded == 1 and not subject.is_playing(), "Native global arrangements need an explicit asynchronous preparation route without section sets.")
	subject.queue_free()
	await process_frame
	for mode in ["explicit", "profile", "in-place", "exit"]:
		subject = _music(path)
		cancellation = mode
		var weak_subject := weakref(subject)
		var result: Dictionary = await subject.prewarm_sections_async(["A"])
		cancellation = ""
		if mode != "exit":
			_check(result.cancelled and not result.ok and subject._audio_stream_cache.is_empty(), "Cancelled imported work must not promote stale PCM: %s" % mode)
			subject.queue_free()
		else:
			_check(result.cancelled and not result.ok, "Detached conductor must reject a completed resource.")
			subject.queue_free()
		await _wait_for_jobs()
		_check(weak_subject.get_ref() == null, "Conductor must release after cancelled preparation: %s" % mode)
		var jobs := 0
		for child in root.get_children():
			if child.get_script() == LoadJob:
				jobs += 1
		_check(jobs == 0, "Owned threaded job must drain and release after cancellation: %s" % mode)
	subject = _music(path)
	var abandoned := weakref(subject)
	cancellation = "free"
	subject.call_deferred("prewarm_sections_async", ["A"])
	await _wait_for_jobs()
	cancellation = ""
	_check(abandoned.get_ref() == null, "Freeing a conductor during resource loading must release the conductor.")
	var remaining_jobs := 0
	for child in root.get_children():
		if child.get_script() == LoadJob:
			remaining_jobs += 1
	_check(remaining_jobs == 0, "An abandoned conductor's resource request must still drain and release its job.")
	var bad = _music("res://pcs-missing-audio-fixture.wav")
	var failed: Dictionary = await bad.prewarm_sections_async(["A"])
	_check(not failed.ok and failed.failed == 1 and bad._audio_stream_cache.is_empty(), "Missing assets must remain incomplete and uncached.")
	bad.queue_free()
	await process_frame
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	for failure in failures:
		push_error(failure)
	print(JSON.stringify({"test": "audio-async-loading", "engine": Engine.get_version_info().get("string", ""), "checks": 19, "requested_jobs": requested_jobs, "cold": report, "warm": warm, "arrangement": arrangement, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _music(path: String):
	var music := Conductor.new()
	var profile := Profile.new()
	profile.sample_preview_prewarm_on_ready = false
	profile.preserve_prepared_wav_endings = true
	profile.section_stem_sets = {"A": {"full": path}}
	music.playback_profile = profile
	root.add_child(music)
	return music

func _job_started(child: Node) -> void:
	if child.get_script() != LoadJob:
		return
	requested_jobs += 1
	match cancellation:
		"explicit": subject.cancel_audio_prewarm()
		"profile": subject.set_playback_profile(Profile.new())
		"in-place": subject.playback_profile.loop_prepared_sections = true
		"exit":
			child.set_process(false)
			_detach_subject.call_deferred(child)
		"free":
			child.set_process(false)
			_free_subject.call_deferred(child)

func _detach_subject(job: Node) -> void:
	root.remove_child(subject)
	job.set_process(true)

func _free_subject(job: Node) -> void:
	subject.queue_free()
	await process_frame
	job.set_process(true)

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _wait_for_jobs() -> void:
	# Cancellation returns immediately; Godot's already-requested I/O drains
	# asynchronously. Check bounded eventual cleanup rather than a same-frame free.
	var deadline := Time.get_ticks_usec() + 5000000
	while Time.get_ticks_usec() < deadline:
		await create_timer(0.005).timeout
		var jobs := 0
		for child in root.get_children():
			if child.get_script() == LoadJob:
				jobs += 1
		if jobs == 0:
			return
