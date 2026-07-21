@tool
extends SceneTree


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("chart"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var chart_path := str(args.get("chart", ""))
	var report_path := str(args.get("report", ""))
	var result := export_event_trace(chart_path)

	if not report_path.is_empty():
		var file := FileAccess.open(report_path, FileAccess.WRITE)
		if file == null:
			result["ok"] = false
			result["errors"].append("Could not write event trace report: %s" % report_path)
		else:
			file.store_string(JSON.stringify(result, "\t"))
			file.store_string("\n")
			result["report_path"] = report_path

	print("Pocket Chordsmith event trace export: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	for key in ["chart", "report_path", "event_count", "event_counts_by_type", "bpm", "time_signature", "schema_version", "sound_profile", "expressive_event_count", "capability_report", "arrangement"]:
		print("%s: %s" % [key, str(result.get(key, ""))])
	for error in result.get("errors", []):
		push_error(str(error))

	quit(0 if bool(result.get("ok", false)) else 1)


static func export_event_trace(chart_path: String) -> Dictionary:
	var result := {
		"ok": false,
		"chart": chart_path,
		"bpm": 0,
		"time_signature": 0,
		"ticks_per_quarter": 0,
		"seconds_per_tick": 0.0,
		"arrangement": [],
		"event_count": 0,
		"event_counts_by_type": {},
		"schema_version": 0,
		"sound_profile": {},
		"format_features": [],
		"expressive_event_count": 0,
		"capability_report": {},
		"events": [],
		"errors": [],
	}
	var chart = load(chart_path)
	if chart == null:
		result["errors"].append("Could not load chart: %s" % chart_path)
		return result
	result["bpm"] = int(chart.get("bpm"))
	result["schema_version"] = int(chart.get("schema_version"))
	result["sound_profile"] = chart.get("sound_profile").duplicate(true) if chart.get("sound_profile") is Dictionary else {}
	result["format_features"] = chart.get("format_features").duplicate() if chart.get("format_features") is Array else []
	result["expressive_event_count"] = int(chart.get("expressive_event_count"))
	result["capability_report"] = chart.get("capability_report").duplicate(true) if chart.get("capability_report") is Dictionary else {}
	result["time_signature"] = int(chart.get("time_signature"))
	result["ticks_per_quarter"] = int(chart.get("ticks_per_quarter"))
	result["seconds_per_tick"] = float(chart.call("get_seconds_per_tick")) if chart.has_method("get_seconds_per_tick") else 0.0
	result["arrangement"] = chart.get("arrangement")
	result["event_count"] = int(chart.get("compiled_events").size())
	result["event_counts_by_type"] = chart.call("get_event_count_by_type") if chart.has_method("get_event_count_by_type") else _count_events_by_type(chart.get("compiled_events"))
	var seconds_per_tick := float(result["seconds_per_tick"])
	var events := []
	for event in chart.get("compiled_events"):
		events.append(_compact_event(event, seconds_per_tick))
	result["events"] = events
	result["ok"] = true
	return result


static func _compact_event(event: Dictionary, seconds_per_tick: float) -> Dictionary:
	var track_type := str(event.get("track_type", ""))
	var flags: Dictionary = event.get("flags", {}) if event.get("flags", {}) is Dictionary else {}
	var out := {
		"type": _browser_trace_type(event),
		"track_type": track_type,
		"sectionId": str(event.get("section_id", event.get("section", "A"))),
		"arrangementIndex": int(event.get("arrangement_index", -1)),
		"bar": int(event.get("source_bar", event.get("bar", -1))),
		"step": int(event.get("source_step", event.get("step", -1))),
		"tick": int(event.get("tick", 0)),
		"time": _round(float(event.get("tick", 0)) * seconds_per_tick),
		"duration": _round(float(event.get("duration_ticks", 0)) * seconds_per_tick),
		"duration_ticks": int(event.get("duration_ticks", 0)),
		"velocity": _round(float(event.get("velocity", 0.0)) / 127.0),
		"accent": bool(flags.get("accent", false)),
		"tuplet": bool(flags.get("tuplet", false)),
		"notes": event.get("notes", flags.get("midi_notes", [])),
		"note": int(event.get("note", event.get("midi_note", -1))),
		"articulation": str(event.get("articulation", flags.get("articulation", ""))),
		"sound": str(event.get("sound", flags.get("sound", ""))),
		"role": str(event.get("role", flags.get("role", ""))),
		"expression": event.get("expression", flags.get("expression", {})),
		"technique": event.get("technique", flags.get("technique", {})),
	}
	if int(event.get("midi_note", -1)) >= 0:
		out["midi"] = int(event.get("midi_note", -1))
	if not str(event.get("instrument_id", "")).is_empty():
		out["instrument"] = str(event.get("instrument_id", ""))
	if event.has("pan"):
		out["pan"] = _round(float(event.get("pan", 0.0)))
	if flags.has("slide_midi"):
		out["slideMidi"] = int(flags.get("slide_midi", -1))
	if flags.has("slide_offset_ticks"):
		out["slideOffset"] = _round(float(flags.get("slide_offset_ticks", 0)) * seconds_per_tick)
	for key in ["midi_notes", "articulation", "tone", "direction", "chord_instrument", "chord_play_mode", "bass_tone", "audio_profile", "lofi_preset", "chip_preset"]:
		if flags.has(key):
			out[key] = flags[key]
	if flags.has("midi_notes"):
		out["midiNotes"] = flags["midi_notes"]
	if flags.has("chord_instrument"):
		out["instrument"] = str(flags["chord_instrument"])
	if flags.has("chord_play_mode"):
		out["articulation"] = str(flags["chord_play_mode"])
	if flags.has("tone"):
		out["instrument"] = str(flags["tone"])
	return out


static func _browser_trace_type(event: Dictionary) -> String:
	var track_type := str(event.get("track_type", ""))
	if track_type == "drum":
		return str(event.get("instrument_id", "drum"))
	return track_type


static func _count_events_by_type(events: Array) -> Dictionary:
	var counts := {}
	for event in events:
		var track_type := str(event.get("track_type", "unknown"))
		counts[track_type] = int(counts.get(track_type, 0)) + 1
	return counts


static func _round(value: float) -> float:
	return round(value * 1000000.0) / 1000000.0


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
			"--report", "-r":
				index += 1
				if index < args.size():
					out["report"] = str(args[index])
		index += 1
	return out


static func _print_usage() -> void:
	print("Pocket Chordsmith event trace exporter")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/export_pocket_chordsmith_event_trace.gd -- --chart <chart.tres> [--report res://godot_event_trace.json]")
