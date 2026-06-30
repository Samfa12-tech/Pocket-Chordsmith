@tool
extends SceneTree

const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const PlaybackProfileScript := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("chart"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var result := profile_preview_performance(str(args.get("chart", "")), str(args.get("profile", "")))
	print("Pocket Chordsmith preview performance profile: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	for key in [
		"chart",
		"profile",
		"event_count",
		"native_event_count",
		"safe_prewarm_ms",
		"cached_audio_streams_after_prewarm",
		"warmed_play_start_ms",
		"play_start_ms",
		"first_process_ms",
		"cached_native_streams_after_prewarm",
		"cached_native_streams_after_play",
		"native_cache_hits_after_play",
		"native_fallbacks_after_play",
		"native_cache_hits_by_track_after_play",
		"native_fallbacks_by_track_after_play",
		"recent_native_fallbacks_after_play",
		"native_slice_warmed_after_play",
		"native_slice_ms_after_play",
		"native_slice_over_budget_after_play",
		"cached_native_streams_after_slice",
		"sample_play_skipped_late_total",
	]:
		print("%s: %s" % [key, str(result.get(key, ""))])
	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))
	quit(0 if bool(result.get("ok", false)) else 1)


static func profile_preview_performance(chart_path: String, profile_path := "") -> Dictionary:
	var result := {
		"ok": false,
		"chart": chart_path,
		"profile": profile_path,
		"event_count": 0,
		"native_event_count": 0,
		"safe_prewarm_ms": 0.0,
		"cached_audio_streams_after_prewarm": 0,
		"warmed_play_start_ms": 0.0,
		"play_start_ms": 0.0,
		"first_process_ms": 0.0,
		"cached_native_streams_after_prewarm": 0,
		"cached_native_streams_after_play": 0,
		"native_cache_hits_after_play": 0,
		"native_fallbacks_after_play": 0,
		"native_cache_hits_by_track_after_play": {},
		"native_fallbacks_by_track_after_play": {},
		"recent_native_fallbacks_after_play": [],
		"native_slice_warmed_after_play": 0,
		"native_slice_ms_after_play": 0.0,
		"native_slice_over_budget_after_play": false,
		"cached_native_streams_after_slice": 0,
		"sample_play_skipped_late_total": 0,
		"warnings": [],
		"errors": [],
	}
	var chart := load(chart_path)
	if chart == null:
		result["errors"].append("Could not load chart: %s" % chart_path)
		return result
	var profile = load(profile_path) if not profile_path.is_empty() else PlaybackProfileScript.new()
	if profile == null:
		result["errors"].append("Could not load playback profile: %s" % profile_path)
		return result

	result["event_count"] = int(chart.get("compiled_events").size())
	result["native_event_count"] = _count_native_events(chart.get("compiled_events"))

	var prewarm_conductor = ConductorScript.new()
	prewarm_conductor.chart = chart
	prewarm_conductor.playback_profile = profile
	var start_usec := Time.get_ticks_usec()
	prewarm_conductor.prewarm_audio(false, false)
	result["safe_prewarm_ms"] = _elapsed_ms(start_usec)
	var prewarm_diagnostics: Dictionary = prewarm_conductor.get_diagnostics()
	result["cached_audio_streams_after_prewarm"] = int(prewarm_diagnostics.get("cached_audio_streams", 0))
	result["cached_native_streams_after_prewarm"] = int(prewarm_diagnostics.get("cached_native_streams", 0))
	start_usec = Time.get_ticks_usec()
	prewarm_conductor.play()
	result["warmed_play_start_ms"] = _elapsed_ms(start_usec)
	prewarm_conductor.free()

	var play_profile = profile.duplicate(true) if profile != null else PlaybackProfileScript.new()
	var play_conductor = ConductorScript.new()
	play_conductor.chart = chart
	play_conductor.playback_profile = play_profile
	start_usec = Time.get_ticks_usec()
	play_conductor.play()
	result["play_start_ms"] = _elapsed_ms(start_usec)
	start_usec = Time.get_ticks_usec()
	play_conductor._process(0.016)
	result["first_process_ms"] = _elapsed_ms(start_usec)
	var diagnostics: Dictionary = play_conductor.get_diagnostics()
	result["cached_native_streams_after_play"] = int(diagnostics.get("cached_native_streams", 0))
	result["native_cache_hits_after_play"] = int(diagnostics.get("sample_preview_native_cache_hits_total", 0))
	result["native_fallbacks_after_play"] = int(diagnostics.get("sample_preview_native_fallbacks_total", 0))
	result["native_cache_hits_by_track_after_play"] = diagnostics.get("sample_preview_native_cache_hits_by_track", {})
	result["native_fallbacks_by_track_after_play"] = diagnostics.get("sample_preview_native_fallbacks_by_track", {})
	result["recent_native_fallbacks_after_play"] = diagnostics.get("sample_preview_recent_native_fallbacks", [])
	result["sample_play_skipped_late_total"] = int(diagnostics.get("sample_play_skipped_late_total", 0))
	var slice_report: Dictionary = play_conductor.prewarm_native_preview_slice(1, 8.0)
	result["native_slice_warmed_after_play"] = int(slice_report.get("warmed", 0))
	result["native_slice_ms_after_play"] = float(slice_report.get("elapsed_ms", 0.0))
	result["native_slice_over_budget_after_play"] = bool(slice_report.get("over_budget", false))
	result["cached_native_streams_after_slice"] = int(slice_report.get("cached_native_streams", 0))
	play_conductor.free()

	if float(result["play_start_ms"]) > 250.0:
		result["warnings"].append("Play start took %.1f ms; this can make the Godot editor appear unresponsive." % float(result["play_start_ms"]))
	if float(result["warmed_play_start_ms"]) > 50.0:
		result["warnings"].append("Warmed play start took %.1f ms; cached preview playback should stay close to instant." % float(result["warmed_play_start_ms"]))
	if float(result["first_process_ms"]) > 16.0:
		result["warnings"].append("First preview process took %.1f ms; runtime stream synthesis is still above a 60 FPS frame budget." % float(result["first_process_ms"]))
	if float(result["native_slice_ms_after_play"]) > 16.0:
		result["warnings"].append("One native preview prewarm slice took %.1f ms; use smaller loading-screen steps or rendered stems for this chart." % float(result["native_slice_ms_after_play"]))
	if float(result["safe_prewarm_ms"]) > 500.0:
		result["warnings"].append("Safe preview prewarm took %.1f ms; this should stay below editor-freeze territory." % float(result["safe_prewarm_ms"]))
	result["ok"] = result["errors"].is_empty()
	return result


static func _count_native_events(events: Array) -> int:
	var count := 0
	for event in events:
		if not (event is Dictionary):
			continue
		var track_type := str(event.get("track_type", ""))
		if track_type == "bass" or track_type == "melody" or track_type == "guitar" or track_type == "chord":
			count += 1
	return count


static func _elapsed_ms(start_usec: int) -> float:
	return float(Time.get_ticks_usec() - start_usec) / 1000.0


static func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--chart", "-c":
				index += 1
				if index < args.size():
					out["chart"] = str(args[index])
			"--profile", "-p":
				index += 1
				if index < args.size():
					out["profile"] = str(args[index])
		index += 1
	return out


static func _print_usage() -> void:
	print("Pocket Chordsmith preview performance profiler")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/profile_pocket_chordsmith_preview_performance.gd -- --chart <chart.tres> [--profile <profile.tres>]")
