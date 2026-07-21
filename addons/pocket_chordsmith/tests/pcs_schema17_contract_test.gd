@tool
extends SceneTree

const Importer := preload("res://addons/pocket_chordsmith/import/pcs_json_importer.gd")
const Compiler := preload("res://addons/pocket_chordsmith/import/pcs_chart_compiler.gd")
const Contract := preload("res://addons/pocket_chordsmith/import/pcs_sound_profile_contract.gd")


func _init() -> void:
	var fixture_path := "res://addons/pocket_chordsmith/tests/fixtures/schema17_sound_profile_fixture.json"
	var legacy_path := "res://addons/pocket_chordsmith/tests/fixtures/schema16_legacy_fixture.json"
	var fixture := JSON.parse_string(FileAccess.get_file_as_string(fixture_path))
	var failures: Array[String] = []
	if not (fixture is Dictionary):
		failures.append("Fixture did not parse as a dictionary.")
	else:
		var importer = Importer.new()
		var imported: Dictionary = importer.load_text(JSON.stringify(fixture), fixture_path)
		if not bool(imported.get("ok", false)):
			failures.append("Schema-17 fixture import failed: %s" % str(imported.get("errors", [])))
		else:
			var project: Dictionary = imported.get("project", {})
			if int(project.get("projectVersion", 0)) != 17:
				failures.append("Schema-17 project version was not retained.")
			if str((project.get("soundProfile", {}) as Dictionary).get("id", "")) != "funk_groove":
				failures.append("Funk profile identity was not retained.")
			var metadata: Dictionary = imported.get("metadata", {})
			var original_project: Dictionary = metadata.get("original_project", {}) if metadata.get("original_project", {}) is Dictionary else {}
			var unknown_top_level: Dictionary = original_project.get("unknownTopLevel", {}) if original_project.get("unknownTopLevel", {}) is Dictionary else {}
			if not bool(unknown_top_level.get("mustSurvive", false)):
				failures.append("Unknown top-level data was not preserved.")
			var chart = Compiler.new().compile_project(project, imported)
			if int(chart.expressive_event_count) < 5:
				failures.append("Rich expressive event count was not compiled.")
			var found_technique := false
			var found_crash := false
			var bass_midis: Array[int] = []
			var found_tick_duration := false
			for event in chart.compiled_events:
				if event.get("technique", {}) is Dictionary and (event.get("technique", {}) as Dictionary).has("futureTechnique"):
					found_technique = true
				if str(event.get("instrument_id", "")) == "crash":
					found_crash = true
				if str(event.get("track_type", "")) == "bass":
					bass_midis.append(int(event.get("midi_note", -1)))
					if int(event.get("midi_note", -1)) == 43 and int(event.get("duration_ticks", -1)) == 240:
						found_tick_duration = true
			if not found_technique:
				failures.append("Unknown technique namespace was not carried into compiled diagnostics.")
			if not found_crash:
				failures.append("Expanded crash drum lane was not compiled.")
			if not bass_midis.has(36) or not bass_midis.has(43):
				failures.append("Schema-17 bass notes were not retained as absolute MIDI pitches.")
			if not found_tick_duration:
				failures.append("Schema-17 durationTicks was not retained as an exact PPQ duration.")
			var restricted := {"articulations": ["finger"], "drumLanes": ["kick"], "features": ["capability-report-v1"], "techniqueNamespaces": ["funk"], "profileIds": ["standard"]}
			var loss_report: Dictionary = Contract.negotiate(project, restricted)
			if (loss_report.get("losses", []) as Array).is_empty():
				failures.append("Restricted capability negotiation did not report losses.")
			if not (loss_report.get("losses", []) as Array).any(func(loss): return str(loss.get("feature", "")) == "drum-lane:crash"):
				failures.append("Restricted capability negotiation missed the crash lane in the drums track.")
		var legacy = JSON.parse_string(FileAccess.get_file_as_string(legacy_path))
		var legacy_imported: Dictionary = importer.load_text(JSON.stringify(legacy), legacy_path)
		if not bool(legacy_imported.get("ok", false)) or str((legacy_imported.get("project", {}) as Dictionary).get("audioProfile", "")) != "chip_arcade":
			failures.append("Schema-16 chip_tune compatibility migration failed.")

	if failures.is_empty():
		print("PCS schema-17 contract tests: OK")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
