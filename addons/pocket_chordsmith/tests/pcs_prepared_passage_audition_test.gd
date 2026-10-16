extends SceneTree

const Audition := preload("res://addons/pocket_chordsmith/editor/pcs_prepared_passage_audition.gd")
const Music := preload("res://addons/pocket_chordsmith/editor/pcs_prepared_audition_conductor.gd")
const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const LoadJob := preload("res://addons/pocket_chordsmith/runtime/pcs_audio_asset_load_job.gd")

class DelayedLoadJob:
	extends LoadJob
	signal request_started
	var completion_released := false
	func _ready() -> void:
		super._ready()
		request_started.emit()
	func _process(delta: float) -> void:
		if completion_released:
			super._process(delta)

class HeldMusic:
	extends Music
	func _create_audio_asset_load_job(path: String) -> Node:
		var job := DelayedLoadJob.new()
		job.asset_path = path
		return job

class HeldAudition:
	extends Audition
	func _create_conductor() -> PocketChordsmithConductor:
		return HeldMusic.new()

class ClockAudition:
	extends Audition
	var reported_progress: Dictionary = {}
	func _playback_progress() -> Dictionary:
		return reported_progress if not reported_progress.is_empty() else super._playback_progress()

var failures: Array[String] = []
var checks := 0
var subject
var action := ""
var held_jobs: Array[Node] = []
var source_a := "res://prepared-audition-a.res"
var source_b := "res://prepared-audition-b.res"


func _init() -> void:
	_run.call_deferred()


func _run() -> void:
	_check(ResourceSaver.save(_tone(220.0, 2.5), source_a) == OK, "write original A tone")
	_check(ResourceSaver.save(_tone(440.0, 1.5), source_b) == OK, "write original B tone")
	var source_hash := FileAccess.get_sha256(source_a)
	var chart := _chart()
	var profile := _profile()
	var original_states: Dictionary = chart.music_states.duplicate(true)
	var original_profile: Dictionary = profile.section_stem_sets.duplicate(true)
	subject = ClockAudition.new()
	root.add_child(subject)
	_check(not subject.is_busy(), "creating controls never autoplays")
	_check(subject.describe(chart, Profile.new(), "A", "B", 1, 0.5).has("error"), "missing prepared assets have explicit fallback")
	var plan: Dictionary = subject.describe(chart, profile, "A", "B", 1, 0.5)
	_check(plan.start_tick == 1920 and absf(plan.end_seconds - 3.5) < 0.0001, "last source bar, first target bar and tail are explicit")
	var slow_chart := _chart()
	slow_chart.bpm = 1
	_check(subject.describe(slow_chart, profile, "A", "B", 2, 2.0).has("error"), "overlong passage gives a bounded ordinary-Play fallback")
	var result: Dictionary = await subject.begin(chart, profile, "A", "B", 1, 0.5)
	_check(result.get("ok", false), "cold imported resources prepare before user-requested playback")
	if not result.get("ok", false):
		_finish()
		return
	_check(result.preparation.threaded_assets == 2, "both imported sections were threaded")
	_check(subject._music.playback_profile != profile and not subject._music.playback_profile.sample_preview_enabled and subject._music.chart.compiled_events.is_empty(), "isolated prepared-only conductor disables synthesis and source callbacks")
	_check(chart.compiled_events.size() == 1 and chart.music_states == original_states and profile.section_stem_sets == original_profile and FileAccess.get_sha256(source_a) == source_hash, "original chart/profile/file stay unchanged")
	var resident = subject._music._audio_stream_cache.values()[0]
	subject._music.set_process(false)
	subject._music.playback_profile.sample_preview_wall_clock_timing = false
	subject._music.seek_tick(1920)
	subject._music._process(1.1)
	_check(subject.diagnostics().transitioned and subject._music.current_section == "B", "production queued section boundary reaches prepared target")
	subject._music._process(1.2)
	subject._process(0.0)
	_check(subject.is_busy() and subject._music.current_section == "B", "target tail does not wrap or end early at chart boundary")
	subject._music._process(0.4)
	subject.reported_progress = {"playing": true, "assigned": 1, "seconds": 3.3}
	subject._process(0.0)
	_check(subject.is_busy(), "gameplay clock cannot truncate prepared PCM before reported playback endpoint")
	subject.reported_progress.seconds = 3.5
	subject._process(0.0)
	_check(not subject.is_busy() and not subject._music.is_playing(), "finite passage completes and stops existing players")
	subject.reported_progress = {}
	result = await subject.begin(chart, profile, "A", "B", 1, 0.5)
	_check(result.ok and result.preparation.threaded_assets == 0 and resident in subject._music._audio_stream_cache.values(), "repeat audition reuses warm prepared resources")
	subject.stop()
	_check(not subject.is_busy() and not subject._music.is_playing(), "manual Stop clears ownership")
	profile.emit_changed()
	_check(subject._signature == 0, "resource changes invalidate warm source identity")
	subject.queue_free()
	await process_frame
	await process_frame
	await _native_route()
	await _asset_guards()
	root.child_entered_tree.connect(_job_entered)
	for mode in ["stop", "profile", "chart", "exit", "free"]:
		action = mode
		held_jobs.clear()
		subject = HeldAudition.new()
		root.add_child(subject)
		var weak := weakref(subject)
		result = await subject.begin(_chart(), _profile(), "A", "B", 1, 0.5)
		_check(not result.get("ok", false) and result.get("cancelled", false), "%s invalidates pending readiness" % mode)
		# Detach emits while exit/free is still unwinding. Keep the real load held
		# through the next frame, then prove the consumer is gone before release.
		await process_frame
		_check(held_jobs.size() == 1 and is_instance_valid(held_jobs[0]) and not held_jobs[0].completion_released, "%s leaves a proven pending owned load until release" % mode)
		if mode == "free":
			_check(weak.get_ref() == null, "freed consumer is gone before load completion is released")
		elif mode == "exit":
			_check(not subject.is_inside_tree(), "exited consumer is outside tree before completion")
		else:
			_check(not subject.is_busy() and not subject._music.is_playing(), "%s cannot autoplay obsolete audio" % mode)
		var job_weak := weakref(held_jobs[0])
		held_jobs[0].completion_released = true
		var deadline := Time.get_ticks_msec() + 3000
		while job_weak.get_ref() != null and Time.get_ticks_msec() < deadline:
			await process_frame
		_check(job_weak.get_ref() == null, "%s drains and frees its root-owned loading job" % mode)
		if weak.get_ref() != null:
			weak.get_ref().queue_free()
		await process_frame
		await process_frame
	action = "inplace"
	held_jobs.clear()
	subject = HeldAudition.new()
	root.add_child(subject)
	result = await subject.begin(_chart(), _profile(), "A", "B", 1, 0.5)
	_check(result.get("cancelled", false) and not subject.is_busy() and not subject._music.is_playing(), "in-place unannounced profile change rejects prepared stale playback")
	subject.queue_free()
	await process_frame
	await process_frame
	_finish()


func _native_route() -> void:
	var chart := _chart()
	chart.native_timeline = {"version": 1, "clock": "native-transport-map", "audioMode": "prepared-arrangement", "ticksPerQuarter": 480, "musicalEndSeconds": 2.0, "musicalEndTick": 3840.0, "markers": [],
		"transportMap": [{"timeSeconds": 0.0, "projectPpq": 0.0, "tempo": 240.0, "numerator": 4, "denominator": 4}, {"timeSeconds": 3.0, "projectPpq": 12.0, "tempo": 240.0, "numerator": 4, "denominator": 4}],
		"bars": [{"bar": 1, "startTick": 0.0, "endTick": 1920.0, "startSeconds": 0.0, "endSeconds": 1.0, "numerator": 4, "denominator": 4}, {"bar": 2, "startTick": 1920.0, "endTick": 3840.0, "startSeconds": 1.0, "endSeconds": 2.0, "numerator": 4, "denominator": 4}]}
	chart.native_audio_duration_seconds = 2.5
	chart.arrangement.assign(["daw_arrangement"])
	chart.arrangement_positions.assign([{"id": "daw_arrangement", "arrangement_index": 0, "start_tick": 0, "length_ticks": 4800}])
	chart.section_library = {"daw_arrangement": {"bars": 2}}
	var profile := _profile()
	profile.stem_paths = {"full": source_a}
	profile.prepared_playback_scope = "arrangement"
	subject = Audition.new()
	root.add_child(subject)
	var result: Dictionary = await subject.begin(chart, profile, "", "", 1, 0.5, 2)
	_check(result.ok and result.range.native and result.range.start_tick == 0 and absf(result.range.end_seconds - 2.5) < 0.0001, "native route uses full arrangement/bar map and real tail bound")
	_check(subject._music.playback_profile.prepared_playback_scope == "arrangement", "native route never becomes a section remix")
	subject.stop()
	subject.queue_free()
	await process_frame
	await process_frame


func _asset_guards() -> void:
	var chart := _chart()
	var profile := _profile()
	var direct := _tone(220.0, 2.5)
	profile.section_stem_sets.A.full = direct
	subject = Audition.new()
	root.add_child(subject)
	var result: Dictionary = await subject.begin(chart, profile, "A", "B", 1, 0.5)
	_check(result.get("ok", false), "direct finite PCM resources remain supported")
	direct.emit_changed()
	_check(not subject.is_busy() and subject._signature == 0 and not subject._music.is_playing(), "direct prepared resource edits invalidate an active audition")
	result = await subject.begin(chart, profile, "A", "B", 1, 0.5)
	subject.invalidate_assets()
	_check(not subject.is_busy() and subject._signature == 0, "editor reimport/reload invalidation cancels active audition")
	direct.loop_mode = AudioStreamWAV.LOOP_FORWARD
	result = await subject.begin(chart, profile, "A", "B", 1, 0.5)
	_check(not result.get("ok", false) and not subject.is_busy() and result.get("error", "").contains("ordinary Play Preview"), "authored looping direct WAV has an explicit finite-audition fallback")
	profile.section_stem_sets.A.full = AudioStreamInteractive.new()
	result = await subject.begin(chart, profile, "A", "B", 1, 0.5)
	_check(not result.get("ok", false) and not subject.is_busy(), "dynamic interactive streams cannot enter finite playback-position audition")
	subject.queue_free()
	await process_frame
	await process_frame


func _job_entered(node: Node) -> void:
	if node is DelayedLoadJob:
		held_jobs.append(node)
		node.request_started.connect(func(): _cancel.call_deferred())


func _cancel() -> void:
	_check(subject.is_busy() and subject._music._pending_audio_load_jobs.size() == 1, "%s cancellation occurs while its load is held" % action)
	match action:
		"stop": subject.stop()
		"profile": subject._source_profile.emit_changed()
		"chart": subject._source_chart.emit_changed()
		"exit": root.remove_child(subject)
		"free": subject.free()
		"inplace":
			subject._source_profile.master_music_bus = "StaleChangedBus"
			action = "inplace-loading"
			held_jobs[-1].completion_released = true
		"inplace-loading": held_jobs[-1].completion_released = true


func _chart() -> Resource:
	var chart := Chart.new()
	chart.bpm = 240
	chart.time_signature = 4
	chart.arrangement.assign(["A", "B"])
	chart.section_library = {"A": {"bars": 2}, "B": {"bars": 1}}
	chart.arrangement_positions.assign([{"id": "A", "arrangement_index": 0, "start_tick": 0, "length_ticks": 3840}, {"id": "B", "arrangement_index": 1, "start_tick": 3840, "length_ticks": 1920}])
	chart.default_music_state = "source-default"
	chart.music_states = {"source-default": {"entry": "B", "stinger": "source-only-stinger"}}
	chart.compiled_events.assign([{"tick": 0, "track_type": "marker", "instrument_id": "source-only-marker"}])
	return chart


func _profile() -> Resource:
	var profile := Profile.new()
	profile.section_stem_sets = {"A": {"full": source_a}, "B": {"full": source_b}}
	profile.sample_preview_prewarm_on_ready = false
	profile.master_music_bus = "Master"
	profile.guitar_bus = "Master"
	return profile


func _tone(frequency: float, seconds: float) -> AudioStreamWAV:
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = 48000
	var pcm := PackedByteArray()
	pcm.resize(int(seconds * 48000) * 2)
	for frame in range(pcm.size() / 2):
		pcm.encode_s16(frame * 2, int(sin(frame * TAU * frequency / 48000.0) * 5000.0))
	wav.data = pcm
	return wav


func _check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)


func _finish() -> void:
	print(JSON.stringify({"test": "prepared-passage-audition", "checks": checks, "failures": failures, "ok": failures.is_empty()}))
	quit(0 if failures.is_empty() else 1)
