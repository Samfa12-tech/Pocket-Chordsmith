@tool
extends RefCounted

const Chart := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const Section := preload("res://addons/pocket_chordsmith/resources/pcs_section_resource.gd")
const Manifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")


static func compile_manifest(manifest: Dictionary, pack_root: String, source_path: String) -> Dictionary:
	var errors := validate_timeline(manifest.get("nativeTimeline", null))
	if not errors.is_empty():
		return {"ok": false, "errors": errors}
	var timeline: Dictionary = manifest.nativeTimeline
	var full_path := Manifest.resolve_asset_path(str(manifest.get("fullMix", "")), pack_root)
	if full_path.is_empty() or full_path.get_extension().to_lower() != "wav" or not FileAccess.file_exists(full_path):
		return {"ok": false, "errors": ["Native arrangement chart requires its full-mix WAV reference."]}
	# Import-time only; Godot reads the actual native WAV duration including tails.
	var audio := AudioStreamWAV.load_from_file(full_path)
	if audio == null or audio.get_length() + 0.0001 < float(timeline.musicalEndSeconds):
		return {"ok": false, "errors": ["Native full-mix WAV is missing or shorter than its musical timeline."]}
	var chart := Chart.new()
	chart.source_path = source_path
	chart.bpm = int(manifest.get("bpm", 120))
	chart.time_signature = int(manifest.get("timeSig", 4))
	chart.key = str(manifest.get("key", "C"))
	chart.scale = str(manifest.get("scale", "major"))
	chart.native_timeline = timeline.duplicate(true)
	chart.native_audio_duration_seconds = audio.get_length()
	chart.original_metadata = {"source_project_path": source_path, "native_prepared_arrangement": true}
	# One global occurrence includes gaps and release tails. It must not substitute
	# embedded PCS sections or section-local loop WAVs for the edited arrangement.
	var section := Section.new()
	section.id = "daw_arrangement"
	section.length_ticks = chart.get_length_ticks()
	section.bars = timeline.bars.size()
	chart.sections.append(section)
	chart.section_library[section.id] = section
	chart.arrangement.assign([section.id])
	chart.arrangement_positions.append({"id": section.id, "arrangement_index": 0, "start_tick": 0, "length_ticks": section.length_ticks, "bars": section.bars})
	for marker in timeline.get("markers", []):
		var event := {"tick": roundi(float(marker.tick)), "duration_ticks": 0, "track_type": "marker", "instrument_id": str(marker.get("name", "")), "name": str(marker.get("name", "")), "flags": {}}
		chart.markers.append(event)
		chart.compiled_events.append(event)
	chart.compiled_events.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return int(left.tick) < int(right.tick))
	return {"ok": true, "errors": [], "chart": chart}


static func validate_timeline(value) -> Array[String]:
	var errors: Array[String] = []
	if not value is Dictionary or value.get("version", 0) != 1 or value.get("clock", "") != "native-transport-map" or value.get("audioMode", "") != "prepared-arrangement" or value.get("ticksPerQuarter", 0) != 480:
		return ["Unsupported native arrangement timeline contract."]
	var points = value.get("transportMap", null)
	var bars = value.get("bars", null)
	if not points is Array or points.size() < 2 or points.size() > 40000 or not bars is Array or bars.is_empty() or bars.size() > 16384:
		return ["Native arrangement requires a bounded transport map and bar map."]
	var previous_seconds := -1.0
	var previous_ppq := -1.0
	for point in points:
		if not point is Dictionary or not _finite_fields(point, ["timeSeconds", "projectPpq", "tempo", "numerator", "denominator"]) or float(point.timeSeconds) <= previous_seconds or float(point.projectPpq) <= previous_ppq or float(point.tempo) < 1.0 or float(point.tempo) > 999.0:
			return ["Native transport coordinates must be finite and strictly increasing."]
		previous_seconds = float(point.timeSeconds)
		previous_ppq = float(point.projectPpq)
	if float(points[0].timeSeconds) != 0.0 or float(points[0].projectPpq) != 0.0:
		return ["Native arrangement transport must begin at the global origin."]
	var previous_end := 0.0
	var previous_time := 0.0
	for index in range(bars.size()):
		var row = bars[index]
		if not row is Dictionary or not _finite_fields(row, ["bar", "startTick", "endTick", "startSeconds", "endSeconds", "numerator", "denominator"]) or int(row.bar) != index + 1 or float(row.startTick) != previous_end or float(row.startSeconds) != previous_time or float(row.endTick) <= previous_end or float(row.endSeconds) <= previous_time or int(row.numerator) < 1 or int(row.numerator) > 32 or int(row.denominator) not in [1, 2, 4, 8, 16, 32, 64]:
			return ["Native bars must be contiguous, ordered and use a supported meter."]
		previous_end = float(row.endTick)
		previous_time = float(row.endSeconds)
	if not _finite_fields(value, ["musicalEndSeconds", "musicalEndTick"]) or previous_end != float(value.musicalEndTick) or previous_time != float(value.musicalEndSeconds):
		return ["Native musical endpoint must match its bar map."]
	var markers = value.get("markers", [])
	if not markers is Array or markers.size() > 16384:
		return ["Native marker map exceeds its supported size."]
	for marker in markers:
		if not marker is Dictionary or not _finite_fields(marker, ["tick", "seconds"]) or float(marker.tick) < 0.0 or float(marker.seconds) < 0.0 or float(marker.tick) > previous_end:
			return ["Native marker must be inside its musical timeline."]
	return errors


static func _finite_fields(value: Dictionary, fields: Array) -> bool:
	for key in fields:
		if not (value.get(key, null) is float or value.get(key, null) is int) or not is_finite(float(value[key])):
			return false
	return true
