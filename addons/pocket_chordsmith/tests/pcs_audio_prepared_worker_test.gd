extends SceneTree

const LoadJob = preload("res://addons/pocket_chordsmith/runtime/pcs_audio_asset_load_job.gd")
const Conductor = preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile = preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
var checks := 0
var failures: Array[String] = []

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	for format in [AudioStreamWAV.FORMAT_8_BITS, AudioStreamWAV.FORMAT_16_BITS]:
		for stereo in [false, true]:
			for rate in [44100, 48000]:
				var original := AudioStreamWAV.new()
				original.format = format
				original.stereo = stereo
				original.mix_rate = rate
				var frame_bytes: int = (2 if format == AudioStreamWAV.FORMAT_16_BITS else 1) * (2 if stereo else 1)
				var pcm := PackedByteArray()
				pcm.resize(frame_bytes * 32)
				for index in range(pcm.size()):
					pcm[index] = (index * 17 + 31) % 256
				original.data = pcm
				var path := "res://prepared-worker-%s-%s-%s.res" % [format, stereo, rate]
				_check(ResourceSaver.save(original, path) == OK, "save source fixture")
				var saved_bytes := FileAccess.get_file_as_bytes(path)
				original = ResourceLoader.load(path, "AudioStream") as AudioStreamWAV
				for loop_sections in [false, true]:
					var music := Conductor.new()
					var profile := Profile.new()
					profile.sample_preview_prewarm_on_ready = false
					profile.preserve_prepared_wav_endings = true
					profile.loop_prepared_sections = loop_sections
					music.playback_profile = profile
					root.add_child(music)
					var sync_stream := music._load_prepared_stem_audio_stream(path) as AudioStreamWAV
					var job := LoadJob.new()
					job.asset_path = path
					job.prepare_wav_endings = true
					job.loop_sections = loop_sections
					job.output_mix_rate = int(AudioServer.get_mix_rate())
					root.add_child(job)
					var prepared := await job.completed as AudioStreamWAV
					_check(prepared != null and prepared != original and prepared != sync_stream, "worker owns a distinct prepared resource")
					_check(prepared.data == sync_stream.data and prepared.loop_mode == sync_stream.loop_mode and prepared.loop_begin == sync_stream.loop_begin and prepared.loop_end == sync_stream.loop_end, "worker and synchronous policy preserve exact PCM and loop points")
					_check(prepared.data.slice(0, pcm.size()) == pcm and original.data == pcm and original.loop_mode == AudioStreamWAV.LOOP_DISABLED and FileAccess.get_file_as_bytes(path) == saved_bytes, "source PCM/resource/file remain unchanged")
					if loop_sections:
						_check(prepared.data.size() == pcm.size() and prepared.loop_end == 32 and prepared.get_meta("pcs_native_section_loop", false), "section body remains exact length and audio-looped")
					else:
						var trailing := prepared.data.slice(pcm.size())
						var silence := PackedByteArray()
						silence.resize(trailing.size())
						_check(trailing.size() >= 8 * frame_bytes and trailing == silence and prepared.get_meta("pcs_content_frames", -1) == 32 and prepared.get_meta("pcs_guard_mix_rate", -1) == AudioServer.get_mix_rate(), "ending guard is trailing silence with original content/rate metadata")
					_check(job.prepared_cacheable and job.worker_prepare_us >= 0 and job.preparation_warning.is_empty(), "worker returns completed policy metadata")
					music.queue_free()
					prepared = null
					sync_stream = null
					await process_frame
				original = null
	# A previous raw load must not force the expensive prepared copy back onto
	# the main thread, or retain both copies after worker publication.
	for loop_sections in [false, true]:
		var profile := Profile.new()
		profile.sample_preview_prewarm_on_ready = false
		profile.preserve_prepared_wav_endings = true
		profile.loop_prepared_sections = loop_sections
		profile.section_stem_sets = {"A": {"full": "res://prepared-worker-1-true-48000.res"}}
		var music := Conductor.new()
		music.playback_profile = profile
		root.add_child(music)
		var raw := music._load_audio_stream("res://prepared-worker-1-true-48000.res") as AudioStreamWAV
		var raw_pcm := raw.data.duplicate()
		var report: Dictionary = await music.prewarm_sections_async(["A"])
		var prepared := music._load_prepared_stem_audio_stream("res://prepared-worker-1-true-48000.res") as AudioStreamWAV
		_check(report.ok and report.threaded_assets == 1 and report.cached_streams == 1, "cached raw PCM preparation still runs on worker with one cache entry")
		_check(prepared != raw and raw.data == raw_pcm and prepared.data.slice(0, raw_pcm.size()) == raw_pcm, "cached raw source is immutable and prepared body is exact")
		var warm: Dictionary = await music.prewarm_sections_async(["A"])
		_check(warm.ok and warm.threaded_assets == 0 and music._load_prepared_stem_audio_stream("res://prepared-worker-1-true-48000.res") == prepared, "prepared worker output keeps stable warm cache identity")
		if not loop_sections:
			# Simulate an obsolete rate snapshot without changing engine/device settings.
			prepared.set_meta("pcs_guard_mix_rate", int(AudioServer.get_mix_rate()) + 1)
			var refreshed: Dictionary = await music.prewarm_sections_async(["A"])
			var fresh := music._load_prepared_stem_audio_stream("res://prepared-worker-1-true-48000.res") as AudioStreamWAV
			_check(refreshed.ok and refreshed.threaded_assets == 1 and refreshed.cached_streams == 1 and fresh != prepared and fresh.get_meta("pcs_guard_mix_rate") == AudioServer.get_mix_rate(), "obsolete output-rate cache entry is prepared on worker before publication")
		music.queue_free()
		prepared = null
		raw = null
		await process_frame
	# Unchanged fallback resources retain their historical raw/prepared aliases;
	# authored loop points keep only the original raw entry.
	for kind in ["non-wav", "compressed", "authored-loop"]:
		var source: AudioStream
		if kind == "non-wav":
			source = AudioStreamRandomizer.new()
		else:
			var wav := AudioStreamWAV.new()
			wav.format = AudioStreamWAV.FORMAT_IMA_ADPCM if kind == "compressed" else AudioStreamWAV.FORMAT_16_BITS
			wav.data = PackedByteArray([0, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0])
			if kind == "authored-loop":
				wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
				wav.loop_begin = 1
				wav.loop_end = 4
			source = wav
		var path := "res://prepared-worker-fallback-%s.res" % kind
		if ResourceSaver.save(source, path) != OK:
			quit(1)
			return
		# ResourceSaver does not register the constructor object under its path.
		# Retain the actual imported resource used by the worker/cache comparison.
		source = ResourceLoader.load(path, "AudioStream") as AudioStream
		_check(source != null and source.resource_path == path, "fallback fixture retains the actual imported Resource: " + kind)
		var profile := Profile.new()
		profile.sample_preview_prewarm_on_ready = false
		profile.preserve_prepared_wav_endings = true
		profile.section_stem_sets = {"A": {"full": path}}
		var music := Conductor.new()
		music.playback_profile = profile
		root.add_child(music)
		var report: Dictionary = await music.prewarm_sections_async(["A"])
		var prepared := music._load_prepared_stem_audio_stream(path)
		var expected_entries := 1 if kind == "authored-loop" else 2
		_check(report.ok and report.cached_streams == expected_entries and prepared == source, "fallback and authored-loop resource/cache identity is unchanged: " + kind)
		var warm: Dictionary = await music.prewarm_sections_async(["A"])
		_check(warm.ok and warm.threaded_assets == 0 and music._load_prepared_stem_audio_stream(path) == source, "fallback warm identity does not create another worker: " + kind)
		music.queue_free()
		source = null
		prepared = null
		await process_frame
	for failure in failures:
		push_error(failure)
	print(JSON.stringify({"test":"audio-prepared-worker", "checks":checks, "failures":failures}))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures.append(label)
