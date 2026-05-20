@tool
extends RefCounted
class_name PCSChartBuildTools

const JsonImporter := preload("res://addons/pocket_chordsmith/import/pcs_json_importer.gd")
const ChartCompiler := preload("res://addons/pocket_chordsmith/import/pcs_chart_compiler.gd")
const SoundKitGenerator := preload("res://addons/pocket_chordsmith/editor/pcs_sound_kit_generator.gd")
const Validator := preload("res://addons/pocket_chordsmith/import/pcs_validator.gd")


func compile_file(source_path: String, output_path := "", options := {}) -> Dictionary:
	var result := _empty_result()
	if not FileAccess.file_exists(source_path):
		result["errors"].append("Source file does not exist: %s" % source_path)
		return result

	var text := FileAccess.get_file_as_string(source_path)
	if text.strip_edges().is_empty():
		result["errors"].append("Source file is empty: %s" % source_path)
		return result

	var entries := _project_entries_from_text(text, source_path)
	if not entries.get("errors", []).is_empty():
		result["errors"].append_array(entries.get("errors", []))
		return result

	for entry in entries.get("projects", []):
		var entry_result := _compile_entry(entry, source_path, output_path, options)
		result["compiled"].append_array(entry_result.get("compiled", []))
		result["warnings"].append_array(entry_result.get("warnings", []))
		result["errors"].append_array(entry_result.get("errors", []))

	result["ok"] = result["errors"].is_empty()
	return result


func compile_folder(source_dir: String, output_dir := "", options := {}) -> Dictionary:
	var result := _empty_result()
	var dir := DirAccess.open(source_dir)
	if dir == null:
		result["errors"].append("Could not open source folder: %s" % source_dir)
		return result

	var recursive := bool(options.get("recursive", true))
	var files := _json_files(source_dir, recursive)
	if files.is_empty():
		result["warnings"].append("No JSON files found in %s." % source_dir)

	for path in files:
		var file_result := compile_file(path, output_dir, options)
		result["compiled"].append_array(file_result.get("compiled", []))
		result["warnings"].append_array(file_result.get("warnings", []))
		result["errors"].append_array(file_result.get("errors", []))

	result["ok"] = result["errors"].is_empty()
	return result


func create_playback_profile_template(save_path: String, options := {}) -> Dictionary:
	var profile := PCSPlaybackProfile.new()
	profile.playback_backend = int(options.get("playback_backend", PCSPlaybackProfile.PlaybackBackend.HYBRID))
	profile.max_polyphony = int(options.get("max_polyphony", 24))
	profile.mobile_safe = bool(options.get("mobile_safe", true))
	profile.drum_kit = {
		"kick": "",
		"kick_accent": "",
		"snare": "",
		"snare_accent": "",
		"hat": "",
		"hat_accent": "",
	}
	profile.stem_paths = {
		"drums": "",
		"bass": "",
		"chords": "",
		"melody_1": "",
		"fx": "",
	}
	var error := ResourceSaver.save(profile, _resource_save_path(save_path))
	return {
		"ok": error == OK,
		"path": save_path,
		"errors": [] if error == OK else ["Could not save playback profile template: %s" % error_string(error)],
		"warnings": [],
	}


func generate_web_sound_kit(output_dir := PCSSoundKitGenerator.DEFAULT_OUTPUT_DIR) -> Dictionary:
	var generator = SoundKitGenerator.new()
	return generator.generate_web_kit(output_dir)


func validate_runtime_files(chart_path: String, playback_profile_path := "") -> Dictionary:
	var result := {
		"ok": false,
		"warnings": [],
		"errors": [],
		"info": {},
		"chart_path": chart_path,
		"playback_profile_path": playback_profile_path,
	}
	var chart_resource := ResourceLoader.load(chart_path)
	if not (chart_resource is PCSChartResource):
		result["errors"].append("Path is not a PCSChartResource: %s" % chart_path)
		return result

	var playback_profile: PCSPlaybackProfile = null
	if not playback_profile_path.is_empty():
		var profile_resource := ResourceLoader.load(playback_profile_path)
		if profile_resource is PCSPlaybackProfile:
			playback_profile = profile_resource
		else:
			result["errors"].append("Path is not a PCSPlaybackProfile: %s" % playback_profile_path)
			return result

	var validator = Validator.new()
	var validation: Dictionary = validator.validate_runtime_readiness(chart_resource, playback_profile)
	result["ok"] = bool(validation.get("ok", false))
	result["warnings"] = validation.get("warnings", [])
	result["errors"] = validation.get("errors", [])
	result["info"] = validation.get("info", {})
	return result


func export_integration_report(chart_path: String, playback_profile_path: String, output_path: String) -> Dictionary:
	var validation := validate_runtime_files(chart_path, playback_profile_path)
	var lines: Array[String] = []
	lines.append("# Pocket Chordsmith Integration Report")
	lines.append("")
	lines.append("Generated: %s" % Time.get_datetime_string_from_system(false, true))
	lines.append("Chart: `%s`" % chart_path)
	lines.append("Playback profile: `%s`" % (playback_profile_path if not playback_profile_path.is_empty() else "none"))
	lines.append("Status: `%s`" % ("OK" if bool(validation.get("ok", false)) else "Needs attention"))
	lines.append("")
	lines.append("## Summary")
	var info: Dictionary = validation.get("info", {})
	var info_keys := info.keys()
	info_keys.sort()
	for key in info_keys:
		lines.append("- `%s`: `%s`" % [str(key), str(info[key])])
	lines.append("")
	lines.append("## Warnings")
	var warnings: Array = validation.get("warnings", [])
	if warnings.is_empty():
		lines.append("- None")
	else:
		for warning in warnings:
			lines.append("- %s" % str(warning))
	lines.append("")
	lines.append("## Errors")
	var errors: Array = validation.get("errors", [])
	if errors.is_empty():
		lines.append("- None")
	else:
		for error in errors:
			lines.append("- %s" % str(error))
	lines.append("")
	lines.append("## Runtime Wiring")
	lines.append("1. Add `PocketChordsmithConductor` to the level.")
	lines.append("2. Assign the compiled chart resource.")
	lines.append("3. Assign the playback profile.")
	lines.append("4. Connect `beat`, `bar_started`, `section_started`, `marker_hit`, `accent_hit`, and `event_triggered`.")
	lines.append("5. Use `queue_music_state()`, `queue_sequence()`, and `trigger_stinger()` for adaptive changes.")

	var file := FileAccess.open(output_path, FileAccess.WRITE)
	if file == null:
		validation["errors"].append("Could not write integration report: %s" % output_path)
		validation["ok"] = false
		return validation
	file.store_string("\n".join(lines))
	validation["report_path"] = output_path
	return validation


func _compile_entry(entry: Dictionary, source_path: String, output_path: String, options: Dictionary) -> Dictionary:
	var result := _empty_result()
	var project: Dictionary = entry.get("project", {})
	if project.is_empty():
		result["errors"].append("Skipped empty project entry in %s." % source_path)
		return result

	var importer = JsonImporter.new()
	var import_result: Dictionary = importer.load_text(JSON.stringify(project), source_path)
	if not bool(import_result.get("ok", false)):
		result["errors"].append_array(import_result.get("errors", []))
		result["warnings"].append_array(import_result.get("warnings", []))
		return result

	var compiler = ChartCompiler.new()
	var chart: PCSChartResource = compiler.compile_project(import_result.get("project", {}), import_result)
	var save_path := _output_path_for_entry(entry, source_path, output_path, options)
	var error := ResourceSaver.save(chart, _resource_save_path(save_path))
	if error != OK:
		result["errors"].append("Could not save %s: %s" % [save_path, error_string(error)])
		return result

	result["compiled"].append({
		"source": source_path,
		"path": save_path,
		"id": str(entry.get("id", "")),
		"events": chart.compiled_events.size(),
		"warnings": chart.import_warnings.duplicate(),
	})
	result["warnings"].append_array(chart.import_warnings)
	result["ok"] = true
	return result


func _project_entries_from_text(text: String, source_path: String) -> Dictionary:
	var parser := JSON.new()
	var error := parser.parse(text)
	if error != OK:
		return {
			"projects": [],
			"errors": ["Invalid JSON in %s at line %d: %s" % [source_path, parser.get_error_line(), parser.get_error_message()]],
		}
	if not (parser.data is Dictionary):
		return {"projects": [], "errors": ["Root JSON must be an object: %s" % source_path]}

	var root: Dictionary = parser.data
	if root.has("levels") and root["levels"] is Array:
		var projects := []
		for level_index in range(root["levels"].size()):
			var level = root["levels"][level_index]
			if not (level is Dictionary):
				continue
			var project := _wrapped_project(level)
			if project.is_empty():
				continue
			var id := str(level.get("levelId", level.get("id", "level_%02d" % (level_index + 1))))
			projects.append({"id": id, "project": project})
		return {"projects": projects, "errors": []}

	var single_project := _wrapped_project(root)
	if single_project.is_empty():
		single_project = root.duplicate(true)
	return {
		"projects": [{"id": source_path.get_file().get_basename(), "project": single_project}],
		"errors": [],
	}


func _wrapped_project(source: Dictionary) -> Dictionary:
	var project := {}
	if source.get("pocketChordsmithProject") is Dictionary:
		project = (source["pocketChordsmithProject"] as Dictionary).duplicate(true)
	elif source.get("project") is Dictionary:
		project = (source["project"] as Dictionary).duplicate(true)
	if project.is_empty():
		return {}

	var game_metadata := {}
	for key in ["gameCueMetadata", "gameMetadata", "godotMetadata", "pcsMetadata"]:
		if source.get(key) is Dictionary:
			for meta_key in source[key].keys():
				game_metadata[meta_key] = source[key][meta_key]
	for key in ["levelId", "level_id", "mood", "default_loop", "intensity_tags", "music_states", "default_music_state", "stem_sets"]:
		if source.has(key):
			game_metadata[key] = source[key]
	if not game_metadata.is_empty():
		var existing_value: Variant = project.get("gameMetadata", {})
		if existing_value is Dictionary:
			var existing: Dictionary = (existing_value as Dictionary).duplicate(true)
			for meta_key in game_metadata.keys():
				existing[meta_key] = game_metadata[meta_key]
			project["gameMetadata"] = existing
		else:
			project["gameMetadata"] = game_metadata
	return project


func _json_files(source_dir: String, recursive: bool) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(source_dir)
	if dir == null:
		return out
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		if name.begins_with("."):
			name = dir.get_next()
			continue
		var path := source_dir.path_join(name)
		if dir.current_is_dir():
			if recursive:
				out.append_array(_json_files(path, recursive))
		elif name.get_extension().to_lower() == "json":
			out.append(path)
		name = dir.get_next()
	return out


func _output_path_for_entry(entry: Dictionary, source_path: String, output_path: String, options: Dictionary) -> String:
	if not output_path.is_empty() and output_path.get_extension().to_lower() in ["tres", "res"]:
		return output_path
	var output_dir := output_path
	if output_dir.is_empty() or bool(options.get("save_beside_source", true)):
		output_dir = source_path.get_base_dir()
	var id := _safe_file_stem(str(entry.get("id", source_path.get_file().get_basename())))
	if id.is_empty():
		id = source_path.get_file().get_basename()
	return output_dir.path_join("%s_pcs_chart.tres" % id)


func _safe_file_stem(value: String) -> String:
	var out := value.strip_edges().to_snake_case()
	for token in ["\\", "/", ":", "*", "?", "\"", "<", ">", "|", " "]:
		out = out.replace(token, "_")
	return out


func _resource_save_path(path: String) -> String:
	if path.begins_with("res://") or path.begins_with("user://"):
		return path
	var localized := ProjectSettings.localize_path(path)
	return localized if localized.begins_with("res://") else path


func _empty_result() -> Dictionary:
	return {
		"ok": false,
		"compiled": [],
		"warnings": [],
		"errors": [],
	}
