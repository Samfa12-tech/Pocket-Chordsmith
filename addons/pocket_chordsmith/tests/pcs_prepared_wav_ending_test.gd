extends SceneTree

const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const Profile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var source := AudioStreamWAV.new()
	source.format = AudioStreamWAV.FORMAT_16_BITS
	source.stereo = true
	source.mix_rate = 48000
	var pcm := PackedByteArray()
	pcm.resize(480 * 4)
	for frame in range(480):
		pcm.encode_s16(frame * 4, 12000)
		pcm.encode_s16(frame * 4 + 2, -7000)
	source.data = pcm
	var music := Conductor.new()
	music.playback_profile = Profile.new()
	music.playback_profile.sample_preview_prewarm_on_ready = false
	root.add_child(music)
	var failures: Array[String] = []
	var checks := 0
	checks += 1
	if music._load_prepared_stem_audio_stream(source) != source:
		failures.append("Existing profiles must retain the original resource unless opted in.")
	music.playback_profile.preserve_prepared_wav_endings = true
	var prepared := music._load_prepared_stem_audio_stream(source) as AudioStreamWAV
	var guard_frames := maxi(8, ceili(128.0 * source.mix_rate / AudioServer.get_mix_rate()) + 4)
	checks += 1
	if prepared == source or source.data != pcm or source.get_length() != 0.01:
		failures.append("Prepared ending guard must not mutate caller-owned PCM or length.")
	checks += 1
	if prepared.data.size() != pcm.size() + guard_frames * 4 or prepared.get_meta("pcs_content_frames") != 480:
		failures.append("Prepared stream must retain the complete body and a bounded rate-aware ending guard.")
	checks += 1
	if prepared.data.slice(0, pcm.size()) != pcm:
		failures.append("Ending guard changed source samples.")
	checks += 1
	if prepared.data.slice(pcm.size()).count(0) != guard_frames * 4:
		failures.append("All appended PCM bytes must be silent.")
	checks += 1
	if music._load_prepared_stem_audio_stream(source) != prepared or music._audio_stream_cache.size() != 1:
		failures.append("Repeated preparation must reuse one guarded resource.")
	for rate in [8000, 192000]:
		var rated := source.duplicate() as AudioStreamWAV
		rated.mix_rate = rate
		var guarded := music._load_prepared_stem_audio_stream(rated) as AudioStreamWAV
		var expected_frames := maxi(8, ceili(128.0 * rate / AudioServer.get_mix_rate()) + 4)
		checks += 1
		if guarded.data.size() != pcm.size() + expected_frames * 4 or expected_frames > 4096 or rated.data != pcm:
			failures.append("Ending guard must cover the output lookahead at low/high source rates without changing source PCM.")
	var looped := source.duplicate() as AudioStreamWAV
	looped.loop_mode = AudioStreamWAV.LOOP_FORWARD
	looped.loop_begin = 17
	looped.loop_end = 470
	checks += 1
	if music._load_prepared_stem_audio_stream(looped) != looped or looped.loop_begin != 17 or looped.loop_end != 470 or looped.data != pcm:
		failures.append("Authored loop mode, points and PCM must be preserved.")
	var file_path := "user://pcs-ending-fixture-%s.wav" % str(Time.get_ticks_usec())
	if source.save_to_wav(file_path) != OK:
		failures.append("Could not save generated test WAV.")
	var file_bytes := FileAccess.get_file_as_bytes(file_path)
	var from_path := music._load_prepared_stem_audio_stream(file_path) as AudioStreamWAV
	checks += 1
	if from_path == null or from_path.data != prepared.data or FileAccess.get_file_as_bytes(file_path) != file_bytes:
		failures.append("Path preparation must preserve source file bytes and body PCM.")
	checks += 1
	if music._audio_stream_cache.has(music._audio_cache_key(file_path)) or music._load_prepared_stem_audio_stream(file_path) != from_path:
		failures.append("Path preparation must keep one prepared cache entry, not a retained raw copy.")
	music.playback_profile.stem_paths = {"full": file_path}
	var prewarm: Dictionary = music.prewarm_audio(true, false)
	checks += 1
	if not prewarm.ok or music._load_prepared_stem_audio_stream(file_path) != from_path:
		failures.append("Stem prewarm must share the same guarded resource used by playback.")
	music.set_playback_profile(Profile.new())
	checks += 1
	if not music._audio_stream_cache.is_empty():
		failures.append("Profile replacement must clear prepared resources.")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(file_path))
	music.queue_free()
	await process_frame
	print(JSON.stringify({"test": "prepared-wav-endings", "checks": checks, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
