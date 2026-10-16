extends SceneTree

const LoadJob = preload("res://addons/pocket_chordsmith/runtime/pcs_audio_asset_load_job.gd")
const Conductor = preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile = preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")

class HeldReader:
	extends LoadJob.AudioReader
	var loaded := Semaphore.new()
	var release := Semaphore.new()
	func read_stream() -> void:
		super.read_stream()
		loaded.post()
		release.wait()

class HeldJob:
	extends LoadJob
	func _create_reader() -> AudioReader:
		return HeldReader.new()

class HeldMusic:
	extends Conductor
	var created_jobs := 0
	var last_job: Node
	func _create_audio_asset_load_job(path: String) -> Node:
		created_jobs += 1
		last_job = HeldJob.new()
		last_job.asset_path = path
		return last_job

class ReleaseWorker:
	extends RefCounted
	var semaphore: Semaphore
	func release_after_delay() -> void:
		OS.delay_msec(50)
		semaphore.post()

var failures: Array[String] = []
var checks := 0
var preparation_result: Dictionary = {}
var direct_results: Array[AudioStream] = []
var cancellation_us: Array[int] = []

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var path := "res://owned-loader-a.res"
	var path_b := "res://owned-loader-b.res"
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 48000
	stream.data = PackedByteArray([1, 0, 2, 0, 3, 0, 4, 0])
	_check(ResourceSaver.save(stream, path) == OK and ResourceSaver.save(stream, path_b) == OK, "save imported fixtures")
	var expected_pcm := stream.data.duplicate()
	stream = null
	for index in range(128):
		var job := LoadJob.new()
		job.asset_path = path
		root.add_child(job)
		var loaded: AudioStream = await job.completed
		_check(loaded is AudioStreamWAV and loaded.data == expected_pcm, "owned load preserves PCM: %s" % index)
		loaded = null
		await process_frame
	# Two consumers loading the same cached resource must complete independently.
	var first := LoadJob.new()
	var second := LoadJob.new()
	first.asset_path = path
	second.asset_path = path
	first.completed.connect(_direct_result, CONNECT_ONE_SHOT)
	second.completed.connect(_direct_result, CONNECT_ONE_SHOT)
	root.add_child(first)
	root.add_child(second)
	var deadline := Time.get_ticks_msec() + 2000
	while direct_results.size() != 2 and Time.get_ticks_msec() < deadline:
		await process_frame
	_check(direct_results.size() == 2 and direct_results[0] == direct_results[1] and direct_results[0].data == expected_pcm, "same-path concurrent readers reuse one correct Resource")
	direct_results.clear()
	await process_frame
	# Exercise multiple uncached assets together, rather than only cached reads.
	for index in range(8):
		var cold_stream := AudioStreamWAV.new()
		cold_stream.format = AudioStreamWAV.FORMAT_16_BITS
		cold_stream.mix_rate = 48000
		cold_stream.data = expected_pcm
		var cold_path := "res://owned-loader-cold-%s.res" % index
		_check(ResourceSaver.save(cold_stream, cold_path) == OK, "save distinct cold fixture: %s" % index)
		cold_stream = null
		var cold_job := LoadJob.new()
		cold_job.asset_path = cold_path
		cold_job.completed.connect(_direct_result, CONNECT_ONE_SHOT)
		root.add_child(cold_job)
	deadline = Time.get_ticks_msec() + 2000
	while direct_results.size() != 8 and Time.get_ticks_msec() < deadline:
		await process_frame
	var identities: Dictionary = {}
	var pcm_correct := direct_results.size() == 8
	for result in direct_results:
		pcm_correct = pcm_correct and result is AudioStreamWAV and result.data == expected_pcm
		if result != null:
			identities[result.get_instance_id()] = true
	_check(pcm_correct and identities.size() == 8, "eight concurrent cold assets complete with distinct correct Resources")
	direct_results.clear()
	await process_frame
	for mode in ["cancel", "consumer-free", "job-detach"]:
		preparation_result = {}
		var music := HeldMusic.new()
		var profile := Profile.new()
		profile.sample_preview_prewarm_on_ready = false
		profile.preserve_prepared_wav_endings = true
		profile.section_stem_sets = {"A": {"full": path, "second": path_b}}
		music.playback_profile = profile
		root.add_child(music)
		_begin.call_deferred(music)
		deadline = Time.get_ticks_msec() + 2000
		while music.last_job == null and Time.get_ticks_msec() < deadline:
			await process_frame
		_check(music.last_job != null, "held read starts: %s" % mode)
		if music.last_job == null:
			quit(1)
			return
		var job = music.last_job
		var reader = job._reader
		var reader_ready := false
		while Time.get_ticks_msec() < deadline:
			if reader.loaded.try_wait():
				reader_ready = true
				break
			await process_frame
		_check(reader_ready, "actual ResourceLoader read reaches held worker completion: %s" % mode)
		_check(job.is_worker_active(), "real worker is still active before cancellation: %s" % mode)
		var before := Time.get_ticks_usec()
		if mode == "cancel":
			music.cancel_audio_prewarm()
		elif mode == "consumer-free":
			music.free()
		else:
			# A second worker releases I/O while the main thread destroys the job.
			# This tests joined teardown without releasing the hold beforehand.
			var releaser := Thread.new()
			var release_worker := ReleaseWorker.new()
			release_worker.semaphore = reader.release
			releaser.start(release_worker.release_after_delay)
			root.remove_child(job)
			releaser.wait_to_finish()
		cancellation_us.append(Time.get_ticks_usec() - before)
		_check(preparation_result.get("cancelled", false) and not preparation_result.get("ok", true), "caller resolves cancelled while worker drains: %s" % mode)
		if mode != "job-detach":
			_check(job.is_worker_active() and job.is_inside_tree(), "consumer cancellation does not join/free the active root job: %s" % mode)
			reader.release.post()
		else:
			_check(music.created_jobs == 1 and music._audio_stream_cache.is_empty(), "detached job cannot schedule second asset or promote stale PCM")
			job.queue_free()
		if is_instance_valid(music):
			music.queue_free()
		reader = null
		deadline = Time.get_ticks_msec() + 2000
		while is_instance_valid(job) and Time.get_ticks_msec() < deadline:
			await process_frame
		_check(not is_instance_valid(job), "owned job eventually releases: %s" % mode)
	await process_frame
	await process_frame
	for failure in failures:
		push_error(failure)
	print(JSON.stringify({"test":"audio-owned-loader", "checks":checks, "cancellation_us":cancellation_us, "failures":failures}))
	quit(0 if failures.is_empty() else 1)

func _begin(music) -> void:
	preparation_result = await music.prewarm_sections_async(["A"])

func _direct_result(stream: AudioStream) -> void:
	direct_results.append(stream)

func _check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)
