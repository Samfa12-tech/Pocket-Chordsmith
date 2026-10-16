extends SceneTree

const Tools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
const NativeChart := preload("res://addons/pocket_chordsmith/import/pcs_native_arrangement_chart.gd")
const Conductor := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")

var checks := 0
var failures: Array[String] = []


func _init() -> void:
	_run.call_deferred()


func _run() -> void:
	DirAccess.make_dir_recursive_absolute("res://native-arrangement-fixture")
	var wav := AudioStreamWAV.new()
	wav.mix_rate = 48000
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	var data := PackedByteArray()
	data.resize(48000 * 3 * 2)
	wav.data = data
	_expect(wav.save_to_wav("res://native-arrangement-fixture/full.wav") == OK, "write three-second WAV")
	var source := FileAccess.open("res://native-arrangement-fixture/source.json", FileAccess.WRITE)
	source.store_string("{\"app\":\"pocket-daw\",\"sourceRefs\":[],\"timeline\":{\"clips\":[]}}")
	source.close()
	var manifest := {"kind": "godot-adaptive-pack", "projectTitle": "Native audio only", "bpm": 120, "timeSig": 2, "fullMix": "full.wav", "sourceProject": "source.json", "nativeTimeline": _timeline()}
	var file := FileAccess.open("res://native-arrangement-fixture/manifest.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(manifest))
	file.close()
	var imported: Dictionary = Tools.new().import_daw_game_pack("res://native-arrangement-fixture/manifest.json")
	_expect(imported.get("ok", false), "high-level native import without embedded PCS: %s" % str(imported.get("errors", [])))
	if not imported.get("ok", false):
		_finish()
		return
	var chart = load(imported.chart_path)
	var profile = imported.profile
	_expect(chart.arrangement == ["daw_arrangement"], "global native occurrence")
	_expect(profile.prepared_playback_scope == "arrangement", "native import forces global prepared scope")
	_expect(profile.stem_paths.keys() == ["full"], "default exact full mix")
	_expect(chart.native_audio_duration_seconds == 3.0, "actual WAV duration includes one-second tail")
	_expect(chart.get_length_ticks() == 1920, "chart ends after rendered tail")
	_expect(absf(chart.seconds_to_tick(1.5) - 1200.0) < 0.0001, "tempo map forward")
	_expect(absf(chart.tick_to_seconds(1200.0) - 1.5) < 0.0001, "tempo map inverse")
	_expect(chart.native_position_at_tick(1200) == {"bar": 2, "beat": 2}, "2/8 denominator tracking")
	_expect(chart.get_original_project().is_empty() and chart.source_path.ends_with("source.json"), "original native source retained by path, no invented PCS source")
	profile.sample_preview_prewarm_on_ready = false
	profile.sample_preview_wall_clock_timing = false
	# This unit creates its WAV after the editor import pass. Give the conductor
	# the raw resource here; the native pack capture separately reimports assets.
	profile.stem_paths["full"] = AudioStreamWAV.load_from_file("res://native-arrangement-fixture/full.wav", {"compress/mode": 0})
	var music := Conductor.new()
	music.chart = chart
	music.playback_profile = profile
	root.add_child(music)
	music.set_process(false)
	var beats: Array = []
	var bars: Array = []
	var markers: Array = []
	music.beat.connect(func(bar: int, beat: int): beats.append([bar, beat]))
	music.bar_started.connect(func(bar: int): bars.append(bar))
	music.marker_hit.connect(func(marker: String): markers.append(marker))
	music.play()
	music.set_process(false)
	music._process(1.5)
	_expect(music.current_tick == 1200, "conductor follows mapped time")
	_expect(beats == [[1, 1], [1, 2], [2, 1], [2, 2]] and bars == [1, 2], "mapped beats/bars emitted once across meter change")
	_expect(markers == ["Edited cue"], "native marker reaches game signal")
	music.seek_tick(1440)
	var player = music._stem_layer_players.get("full", music._stem_player)
	_expect(player != null and player.playing and absf(player.get_playback_position() - 2.0) < 0.06, "seek uses mapped global seconds")
	music._process(0.5)
	_expect(music._playing and music.current_tick == 1680, "rendered tail is not cut at musical endpoint")
	music._process(0.51)
	_expect(music._playing, "gameplay clock cannot cut queued rendered PCM")
	var deadline := Time.get_ticks_msec() + 5000
	while music._native_arrangement_audio_playing() and Time.get_ticks_msec() < deadline:
		await create_timer(0.03).timeout
	music._process(0.01)
	_expect(not music._playing, "natural ending does not restart default sequence")
	music.queue_free()
	await process_frame
	var invalid := _timeline()
	invalid.transportMap[1].timeSeconds = 0.0
	_expect(not NativeChart.validate_timeline(invalid).is_empty(), "duplicate transport time rejected")
	invalid = _timeline()
	invalid.bars[1].startTick = 800
	_expect(not NativeChart.validate_timeline(invalid).is_empty(), "discontinuous bar map rejected")
	invalid = _timeline()
	invalid.version = 99
	_expect(not NativeChart.validate_timeline(invalid).is_empty(), "unknown native version rejected without PCS fallback")
	_finish()


func _timeline() -> Dictionary:
	return {"version": 1, "clock": "native-transport-map", "audioMode": "prepared-arrangement", "ticksPerQuarter": 480, "musicalEndSeconds": 2.0, "musicalEndTick": 1440.0,
		"transportMap": [{"timeSeconds": 0.0, "projectPpq": 0.0, "tempo": 120, "numerator": 2, "denominator": 4}, {"timeSeconds": 1.0, "projectPpq": 2.0, "tempo": 60, "numerator": 2, "denominator": 8}, {"timeSeconds": 3.0, "projectPpq": 4.0, "tempo": 60, "numerator": 2, "denominator": 8}],
		"bars": [{"bar": 1, "startTick": 0.0, "endTick": 960.0, "startSeconds": 0.0, "endSeconds": 1.0, "numerator": 2, "denominator": 4}, {"bar": 2, "startTick": 960.0, "endTick": 1440.0, "startSeconds": 1.0, "endSeconds": 2.0, "numerator": 2, "denominator": 8}],
		"markers": [{"name": "Edited cue", "tick": 1200.0, "seconds": 1.5}]}


func _expect(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)


func _finish() -> void:
	print(JSON.stringify({"test": "native-arrangement-chart", "checks": checks, "failures": failures, "ok": failures.is_empty()}))
	quit(0 if failures.is_empty() else 1)
