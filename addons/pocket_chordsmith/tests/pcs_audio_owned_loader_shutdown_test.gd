extends SceneTree

const LoadJob = preload("res://addons/pocket_chordsmith/runtime/pcs_audio_asset_load_job.gd")
const Conductor = preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile = preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")

class SlowReader:
	extends LoadJob.AudioReader
	var loaded := Semaphore.new()
	func read_stream() -> void:
		super.read_stream()
		loaded.post()
		OS.delay_msec(150)

class SlowJob:
	extends LoadJob
	func _create_reader() -> AudioReader:
		return SlowReader.new()

class SlowMusic:
	extends Conductor
	var created_jobs := 0
	var last_job: Node
	func _create_audio_asset_load_job(path: String) -> Node:
		created_jobs += 1
		last_job = SlowJob.new()
		last_job.asset_path = path
		return last_job

var music: SlowMusic

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var stream := AudioStreamWAV.new()
	stream.data = PackedByteArray([1, 0, 2, 0])
	ResourceSaver.save(stream, "res://owned-shutdown.res")
	stream = null
	var profile := Profile.new()
	profile.sample_preview_prewarm_on_ready = false
	profile.preserve_prepared_wav_endings = true
	profile.section_stem_sets = {"A": {"one": "res://owned-shutdown.res", "two": "res://owned-shutdown.res"}}
	music = SlowMusic.new()
	music.playback_profile = profile
	root.add_child(music)
	_begin.call_deferred()
	var deadline := Time.get_ticks_msec() + 2000
	while music.last_job == null and Time.get_ticks_msec() < deadline:
		await process_frame
	if music.last_job == null:
		push_error("Shutdown probe never created its loader.")
		quit(1)
		return
	var loaded := false
	while Time.get_ticks_msec() < deadline:
		if music.last_job._reader.loaded.try_wait():
			loaded = true
			break
		await process_frame
	if not loaded or not music.last_job.is_worker_active():
		push_error("Shutdown probe did not reach a live held worker after actual loading.")
		quit(1)
		return
	print(JSON.stringify({"test":"owned-loader-shutdown", "worker_live_at_quit":true, "actual_resource_loaded":true, "created_jobs":music.created_jobs}))
	quit(0)

func _begin() -> void:
	var result: Dictionary = await music.prewarm_sections_async(["A"])
	if not result.cancelled or result.ok or music.created_jobs != 1:
		push_error("Whole-tree shutdown must resolve cancelled without scheduling another asset.")
	print(JSON.stringify({"test":"owned-loader-shutdown-result", "cancelled":result.cancelled, "ok":result.ok, "created_jobs":music.created_jobs}))
