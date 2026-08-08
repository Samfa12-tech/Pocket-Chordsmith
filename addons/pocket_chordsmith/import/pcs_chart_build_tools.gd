@tool
extends RefCounted
class_name PCSChartBuildTools

const JsonImporter := preload("res://addons/pocket_chordsmith/import/pcs_json_importer.gd")
const ChartCompiler := preload("res://addons/pocket_chordsmith/import/pcs_chart_compiler.gd")
const ChartResource := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const PlaybackProfile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const SoundKitGenerator := preload("res://addons/pocket_chordsmith/editor/pcs_sound_kit_generator.gd")
const Validator := preload("res://addons/pocket_chordsmith/import/pcs_validator.gd")
const GamePackManifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")
const SharedSoundConstants := preload("res://addons/pocket_chordsmith/import/pcs_shared_sound_constants.gd")

const DEFAULT_DAW_PACK_IMPORT_ROOT := "res://music/pocket_chordsmith_packs"
const MAX_SOURCE_TEXT_BYTES := 4 * 1024 * 1024
const MAX_ZIP_BYTES := 128 * 1024 * 1024
const MAX_ZIP_ENTRIES := 512
const MAX_ZIP_PATH_DEPTH := 12
const MAX_ZIP_ENTRY_BYTES := 64 * 1024 * 1024
const MAX_ZIP_TOTAL_BYTES := 256 * 1024 * 1024
const MAX_ZIP_COMPRESSION_RATIO := 200.0


func compile_file(source_path: String, output_path := "", options := {}) -> Dictionary:
	var result := _empty_result()
	if not FileAccess.file_exists(source_path):
		result["errors"].append("Source file does not exist: %s" % source_path)
		return result
	var source_size := FileAccess.get_size(source_path)
	if source_size < 0 or source_size > MAX_SOURCE_TEXT_BYTES:
		result["errors"].append("Source file exceeds the %d-byte import limit: %s" % [MAX_SOURCE_TEXT_BYTES, source_path])
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
	var profile = PlaybackProfile.new()
	profile.playback_backend = int(options.get("playback_backend", PlaybackProfile.PlaybackBackend.HYBRID))
	profile.max_polyphony = int(options.get("max_polyphony", 24))
	profile.mobile_safe = bool(options.get("mobile_safe", true))
	profile.drum_kit = _blank_streams(SharedSoundConstants.GODOT_DRUM_SAMPLE_STREAMS.keys())
	profile.stem_paths = {
		"drums": "",
		"bass": "",
		"chords": "",
		"guitar": "",
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


func create_playback_profile_from_game_pack_manifest(manifest_path: String, save_path := "", pack_root := "", options := {}) -> Dictionary:
	var manifest_result: Dictionary = GamePackManifest.load_manifest_file(manifest_path)
	if not bool(manifest_result.get("ok", false)):
		return manifest_result

	var resolved_pack_root := pack_root
	if resolved_pack_root.strip_edges().is_empty():
		resolved_pack_root = _pack_root_for_manifest_path(manifest_path)
	var profile_result: Dictionary = GamePackManifest.create_playback_profile_from_manifest(manifest_result.get("manifest", {}), resolved_pack_root, options)
	if not bool(profile_result.get("ok", false)):
		return profile_result

	if not save_path.strip_edges().is_empty():
		var profile = profile_result.get("profile", null)
		var error := ResourceSaver.save(profile, _resource_save_path(save_path))
		if error != OK:
			profile_result["ok"] = false
			profile_result["errors"].append("Could not save playback profile from game-pack manifest: %s" % error_string(error))
			return profile_result
		profile_result["path"] = save_path
	return profile_result


func import_daw_game_pack(pack_path: String, destination_root := DEFAULT_DAW_PACK_IMPORT_ROOT, options := {}) -> Dictionary:
	var result := _empty_result()
	var source_path := pack_path.strip_edges()
	if source_path.is_empty():
		result["errors"].append("DAW pack path is empty.")
		return result
	if not FileAccess.file_exists(source_path):
		result["errors"].append("DAW pack file does not exist: %s" % source_path)
		return result

	var manifest_path := ""
	var pack_root := ""
	var entries := []
	match source_path.get_extension().to_lower():
		"zip":
			var extract_result := _extract_game_pack_zip(source_path, destination_root, options)
			result["warnings"].append_array(extract_result.get("warnings", []))
			result["errors"].append_array(extract_result.get("errors", []))
			if not bool(extract_result.get("ok", false)):
				return result
			pack_root = str(extract_result.get("pack_root", ""))
			manifest_path = _find_manifest_in_pack(pack_root)
			entries = extract_result.get("entries", [])
		"json":
			manifest_path = _resource_save_path(source_path)
			pack_root = _pack_root_for_manifest_path(manifest_path)
		_:
			result["errors"].append("Choose a Pocket DAW Godot Adaptive Pack .zip or manifest .json: %s" % source_path)
			return result

	if manifest_path.is_empty() or not FileAccess.file_exists(manifest_path):
		result["errors"].append("Could not find %s in DAW pack." % SharedSoundConstants.GODOT_GAME_PACK_MANIFEST_PATH)
		return result

	var manifest_result: Dictionary = GamePackManifest.load_manifest_file(manifest_path)
	if not bool(manifest_result.get("ok", false)):
		result["errors"].append_array(manifest_result.get("errors", []))
		return result
	var manifest: Dictionary = manifest_result.get("manifest", {})
	if not _looks_like_daw_game_pack_manifest(manifest):
		result["warnings"].append("Manifest does not identify itself as a Pocket DAW Godot Adaptive Pack; importing with best-effort game-pack support.")

	var profile_stem := _safe_file_stem(str(manifest.get("projectTitle", source_path.get_file().get_basename())))
	if profile_stem.is_empty():
		profile_stem = source_path.get_file().get_basename()
	var profile_path := _resource_path_join(pack_root, "%s_playback_profile.tres" % profile_stem)
	var profile_result: Dictionary = create_playback_profile_from_game_pack_manifest(manifest_path, profile_path, pack_root, options)
	result["warnings"].append_array(profile_result.get("warnings", []))
	result["errors"].append_array(profile_result.get("errors", []))
	if not bool(profile_result.get("ok", false)):
		return result

	var source_project_path: String = GamePackManifest.source_project_path_from_manifest(manifest, pack_root, bool(options.get("trusted_project_paths", false)))
	if source_project_path.is_empty() and manifest.get("project", null) is Dictionary:
		source_project_path = _resource_path_join(pack_root, "source_project.json")
		var write_error := _write_text_to_resource_path(source_project_path, JSON.stringify(manifest.get("project", {}), "\t"))
		if write_error != OK:
			result["errors"].append("Could not write embedded source project JSON: %s" % error_string(write_error))
			return result
	if source_project_path.is_empty() or not FileAccess.file_exists(source_project_path):
		result["errors"].append("DAW pack manifest does not include a readable source project JSON.")
		return result

	var charts_dir := _resource_path_join(pack_root, "charts")
	_ensure_resource_dir(charts_dir)
	var compile_result := compile_file(source_project_path, charts_dir, {
		"save_beside_source": false,
	})
	result["compiled"].append_array(compile_result.get("compiled", []))
	result["warnings"].append_array(compile_result.get("warnings", []))
	result["errors"].append_array(compile_result.get("errors", []))
	if not bool(compile_result.get("ok", false)):
		return result

	var compiled: Array = result.get("compiled", [])
	var chart_path := str(compiled[0].get("path", "")) if not compiled.is_empty() else ""
	result["ok"] = result["errors"].is_empty()
	result["pack_root"] = pack_root
	result["manifest_path"] = manifest_path
	result["profile_path"] = profile_path
	result["chart_path"] = chart_path
	result["source_project_path"] = source_project_path
	result["playback_profile"] = profile_result.get("profile", null)
	result["profile"] = profile_result.get("profile", null)
	result["entries"] = entries
	return result


func generate_web_sound_kit(output_dir := SoundKitGenerator.DEFAULT_OUTPUT_DIR) -> Dictionary:
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
	if not _resource_uses_script(chart_resource, ChartResource):
		result["errors"].append("Path is not a PCSChartResource: %s" % chart_path)
		return result

	var playback_profile = null
	if not playback_profile_path.is_empty():
		var profile_resource := ResourceLoader.load(playback_profile_path)
		if _resource_uses_script(profile_resource, PlaybackProfile):
			playback_profile = profile_resource
		else:
			result["errors"].append("Path is not a PCSPlaybackProfile: %s" % playback_profile_path)
			return result

	var validator = Validator.new()
	var validation: Dictionary = validator.call("validate_runtime_readiness", chart_resource, playback_profile)
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
	var chart = compiler.call("compile_project", import_result.get("project", {}), import_result)
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
	var stripped := text.strip_edges()
	if stripped.begins_with("PCS1:"):
		var importer = JsonImporter.new()
		var import_result: Dictionary = importer.load_text(stripped, source_path)
		if not bool(import_result.get("ok", false)):
			return {
				"projects": [],
				"errors": import_result.get("errors", ["Invalid PCS1 handoff file: %s" % source_path]),
			}
		var project: Dictionary = import_result.get("project", {})
		var id := str(project.get("title", source_path.get_file().get_basename()))
		return {
			"projects": [{"id": id, "project": project}],
			"errors": [],
		}

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
	if _looks_like_daw_project(root):
		var projects := []
		var refs: Array = root.get("sourceRefs", [])
		for ref_index in range(refs.size()):
			var ref = refs[ref_index]
			if not (ref is Dictionary):
				continue
			var source_type := str(ref.get("sourceType", ""))
			if not source_type.is_empty() and source_type != "pocket-chordsmith":
				continue
			var project := _project_from_daw_source_ref(ref)
			if project.is_empty():
				continue
			var id := str(ref.get("title", ref.get("id", "daw_source_%02d" % (ref_index + 1))))
			projects.append({"id": id, "project": project})
		if projects.is_empty():
			return {"projects": [], "errors": ["Pocket DAW source JSON does not include an embedded Pocket Chordsmith project: %s" % source_path]}
		return {"projects": projects, "errors": []}

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


func _looks_like_daw_project(root: Dictionary) -> bool:
	return str(root.get("app", "")) == "PocketDAW" or root.has("sourceRefs")


func _project_from_daw_source_ref(ref: Dictionary) -> Dictionary:
	if ref.get("original") is Dictionary:
		return (ref["original"] as Dictionary).duplicate(true)
	var normalized = ref.get("normalized", {})
	if normalized is Dictionary:
		if normalized.get("original") is Dictionary:
			return (normalized["original"] as Dictionary).duplicate(true)
		return (normalized as Dictionary).duplicate(true)
	return {}


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
		elif name.get_extension().to_lower() in ["json", "pcs1", "txt"]:
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


func _extract_game_pack_zip(zip_path: String, destination_root: String, options: Dictionary) -> Dictionary:
	var result := {
		"ok": false,
		"pack_root": "",
		"entries": [],
		"warnings": [],
		"errors": [],
	}
	var reader := ZIPReader.new()
	var archive_size := FileAccess.get_size(zip_path)
	if archive_size < 0 or archive_size > MAX_ZIP_BYTES:
		result["errors"].append("DAW pack ZIP exceeds the %d-byte archive limit." % MAX_ZIP_BYTES)
		return result
	var error := reader.open(zip_path)
	if error != OK:
		result["errors"].append("Could not open DAW pack ZIP: %s" % error_string(error))
		return result

	var pack_name := _safe_file_stem(str(options.get("pack_name", zip_path.get_file().get_basename())))
	if pack_name.is_empty():
		pack_name = "pocket_daw_pack"
	var pack_root := _resource_path_join(destination_root, pack_name)
	var staging_root := _resource_path_join(destination_root, ".%s.importing-%s" % [pack_name, Crypto.new().generate_random_bytes(8).hex_encode()])
	var destination_absolute := ProjectSettings.globalize_path(_resource_save_path(destination_root)).simplify_path()
	var pack_absolute := ProjectSettings.globalize_path(_resource_save_path(pack_root)).simplify_path()
	var staging_absolute := ProjectSettings.globalize_path(_resource_save_path(staging_root)).simplify_path()
	if not _absolute_descendant_of(pack_absolute, destination_absolute) or not _absolute_descendant_of(staging_absolute, destination_absolute):
		reader.close()
		result["errors"].append("DAW pack destination escaped the configured import root.")
		return result
	if DirAccess.dir_exists_absolute(pack_absolute) or FileAccess.file_exists(pack_absolute):
		reader.close()
		result["errors"].append("DAW pack destination already exists; choose a different pack name: %s" % pack_root)
		return result
	var files := reader.get_files()
	var metadata_result := _read_zip_central_directory(zip_path)
	result["errors"].append_array(metadata_result.get("errors", []))
	if not result["errors"].is_empty():
		reader.close()
		return result
	var metadata: Array = metadata_result.get("entries", [])
	if files.size() != metadata.size() or files.size() > MAX_ZIP_ENTRIES:
		reader.close()
		result["errors"].append("DAW pack ZIP entry count is invalid or exceeds %d." % MAX_ZIP_ENTRIES)
		return result
	var seen_paths := {}
	var total_uncompressed := 0
	var total_compressed := 0
	for entry_index in range(files.size()):
		var entry_path = files[entry_index]
		var entry := str(entry_path).replace("\\", "/")
		if not _is_safe_pack_relative_path(entry):
			result["errors"].append("Unsafe path in DAW pack ZIP: %s" % entry)
			continue
		if entry.trim_suffix("/").split("/", false).size() > MAX_ZIP_PATH_DEPTH:
			result["errors"].append("DAW pack ZIP path is too deeply nested: %s" % entry)
			continue
		var collision_key := entry.trim_suffix("/").to_lower()
		if seen_paths.has(collision_key):
			result["errors"].append("Duplicate or case-colliding DAW pack ZIP path: %s" % entry)
			continue
		seen_paths[collision_key] = true
		var entry_metadata: Dictionary = metadata[entry_index]
		if str(entry_metadata.get("name", "")).replace("\\", "/") != entry:
			result["errors"].append("DAW pack ZIP directory metadata does not match entry: %s" % entry)
			continue
		var uncompressed := int(entry_metadata.get("uncompressed", 0))
		var compressed := int(entry_metadata.get("compressed", 0))
		if uncompressed > MAX_ZIP_ENTRY_BYTES:
			result["errors"].append("DAW pack ZIP entry exceeds %d bytes: %s" % [MAX_ZIP_ENTRY_BYTES, entry])
		total_uncompressed += uncompressed
		total_compressed += compressed
		if uncompressed > 0 and (compressed <= 0 or float(uncompressed) / float(compressed) > MAX_ZIP_COMPRESSION_RATIO):
			result["errors"].append("DAW pack ZIP entry has an unsafe compression ratio: %s" % entry)
	if total_uncompressed > MAX_ZIP_TOTAL_BYTES:
		result["errors"].append("DAW pack ZIP expands beyond the %d-byte aggregate limit." % MAX_ZIP_TOTAL_BYTES)
	if total_uncompressed > 0 and (total_compressed <= 0 or float(total_uncompressed) / float(total_compressed) > MAX_ZIP_COMPRESSION_RATIO):
		result["errors"].append("DAW pack ZIP has an unsafe aggregate compression ratio.")
	if not result["errors"].is_empty():
		reader.close()
		return result

	var stage_error := _ensure_resource_dir(staging_root)
	if stage_error != OK:
		reader.close()
		result["errors"].append("Could not create guarded DAW pack staging directory: %s" % error_string(stage_error))
		return result
	var relative_files := []
	for entry_index in range(files.size()):
		var entry := str(files[entry_index]).replace("\\", "/")
		var out_path := _resource_path_join(staging_root, entry)
		var out_absolute := ProjectSettings.globalize_path(_resource_save_path(out_path)).simplify_path()
		if not _absolute_descendant_of(out_absolute.trim_suffix("/"), staging_absolute):
			result["errors"].append("DAW pack ZIP entry escaped the staging directory: %s" % entry)
			break
		if entry.ends_with("/"):
			var directory_error := _ensure_resource_dir(out_path)
			if directory_error != OK:
				result["errors"].append("Could not create staged directory %s: %s" % [entry, error_string(directory_error)])
				break
			continue
		_ensure_resource_dir(out_path.get_base_dir())
		var bytes := reader.read_file(entry)
		if bytes.size() != int(metadata[entry_index].get("uncompressed", bytes.size())):
			result["errors"].append("DAW pack ZIP entry size changed while reading: %s" % entry)
			break
		var write_error := _write_bytes_to_resource_path(out_path, bytes)
		if write_error != OK:
			result["errors"].append("Could not write %s: %s" % [out_path, error_string(write_error)])
			break
		relative_files.append(entry)

	reader.close()
	if result["errors"].is_empty():
		var staged_manifest := _find_manifest_in_pack(staging_root)
		if staged_manifest.is_empty():
			result["errors"].append("DAW pack ZIP does not contain a game-pack manifest.")
		else:
			var manifest_result: Dictionary = GamePackManifest.load_manifest_file(staged_manifest)
			if not bool(manifest_result.get("ok", false)):
				result["errors"].append_array(manifest_result.get("errors", []))
			elif not _looks_like_daw_game_pack_manifest(manifest_result.get("manifest", {})):
				result["errors"].append("DAW pack ZIP manifest does not identify a supported game-pack shape.")
	if not result["errors"].is_empty():
		_remove_resource_tree(staging_root)
		return result
	var move_error := DirAccess.rename_absolute(staging_absolute, pack_absolute)
	if move_error != OK:
		_remove_resource_tree(staging_root)
		result["errors"].append("Could not publish validated DAW pack from staging: %s" % error_string(move_error))
		return result
	for relative_path in relative_files:
		result["entries"].append(_resource_path_join(pack_root, relative_path))
	result["ok"] = true
	result["pack_root"] = pack_root
	return result


func _read_zip_central_directory(zip_path: String) -> Dictionary:
	var result := {"entries": [], "errors": []}
	var bytes := FileAccess.get_file_as_bytes(zip_path)
	if bytes.size() < 22:
		result["errors"].append("DAW pack ZIP is missing its central directory.")
		return result
	var eocd := -1
	var search_start := max(0, bytes.size() - 65557)
	for offset in range(bytes.size() - 22, search_start - 1, -1):
		if bytes.decode_u32(offset) == 0x06054b50:
			eocd = offset
			break
	if eocd < 0:
		result["errors"].append("DAW pack ZIP central-directory footer was not found.")
		return result
	var disk_number := bytes.decode_u16(eocd + 4)
	var directory_disk := bytes.decode_u16(eocd + 6)
	var entry_count := bytes.decode_u16(eocd + 10)
	var directory_size := bytes.decode_u32(eocd + 12)
	var directory_offset := bytes.decode_u32(eocd + 16)
	if disk_number != 0 or directory_disk != 0 or entry_count == 0xffff or directory_size == 0xffffffff or directory_offset == 0xffffffff:
		result["errors"].append("Multi-disk and ZIP64 DAW packs are not accepted.")
		return result
	if directory_offset + directory_size > eocd or entry_count > MAX_ZIP_ENTRIES:
		result["errors"].append("DAW pack ZIP central directory is out of bounds.")
		return result
	var cursor := directory_offset
	for _entry_index in range(entry_count):
		if cursor + 46 > bytes.size() or bytes.decode_u32(cursor) != 0x02014b50:
			result["errors"].append("DAW pack ZIP central directory entry is malformed.")
			return result
		var flags := bytes.decode_u16(cursor + 8)
		var compressed := bytes.decode_u32(cursor + 20)
		var uncompressed := bytes.decode_u32(cursor + 24)
		var name_length := bytes.decode_u16(cursor + 28)
		var extra_length := bytes.decode_u16(cursor + 30)
		var comment_length := bytes.decode_u16(cursor + 32)
		var record_size := 46 + name_length + extra_length + comment_length
		if cursor + record_size > bytes.size() or compressed == 0xffffffff or uncompressed == 0xffffffff:
			result["errors"].append("ZIP64 or truncated DAW pack entries are not accepted.")
			return result
		if flags & 0x1:
			result["errors"].append("Encrypted DAW pack ZIP entries are not accepted.")
			return result
		var name := bytes.slice(cursor + 46, cursor + 46 + name_length).get_string_from_utf8()
		result["entries"].append({"name": name, "compressed": compressed, "uncompressed": uncompressed})
		cursor += record_size
	return result


func _absolute_descendant_of(path: String, root: String) -> bool:
	var normalized_path := path.replace("\\", "/").trim_suffix("/")
	var normalized_root := root.replace("\\", "/").trim_suffix("/")
	return normalized_path.begins_with(normalized_root + "/")


func _remove_resource_tree(path: String) -> void:
	var absolute := ProjectSettings.globalize_path(_resource_save_path(path)).simplify_path()
	var dir := DirAccess.open(absolute)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		var child := absolute.path_join(name)
		if dir.current_is_dir():
			_remove_resource_tree(child)
		else:
			DirAccess.remove_absolute(child)
		name = dir.get_next()
	dir.list_dir_end()
	DirAccess.remove_absolute(absolute)


func _find_manifest_in_pack(pack_root: String) -> String:
	var default_manifest := _resource_path_join(pack_root, SharedSoundConstants.GODOT_GAME_PACK_MANIFEST_PATH)
	if FileAccess.file_exists(default_manifest):
		return default_manifest
	var files := _json_files(pack_root, true)
	for file in files:
		var lower := file.get_file().to_lower()
		if lower.find("manifest") >= 0:
			return file
	return ""


func _looks_like_daw_game_pack_manifest(manifest: Dictionary) -> bool:
	return str(manifest.get("kind", "")) == "godot-adaptive-pack" or manifest.has("stems") or manifest.has("sectionLoops") or manifest.has("sections") or manifest.has("states") or manifest.has("fullMix")


func _resource_path_join(base_path: String, relative_path: String) -> String:
	var base := base_path.strip_edges().replace("\\", "/")
	var relative := relative_path.strip_edges().replace("\\", "/")
	while base.ends_with("/"):
		base = base.substr(0, base.length() - 1)
	while relative.begins_with("/"):
		relative = relative.substr(1)
	if base.is_empty():
		return relative
	if relative.is_empty():
		return base
	return "%s/%s" % [base, relative]


func _ensure_resource_dir(path: String) -> int:
	var localized := _resource_save_path(path)
	var absolute := ProjectSettings.globalize_path(localized)
	return DirAccess.make_dir_recursive_absolute(absolute)


func _write_bytes_to_resource_path(path: String, bytes: PackedByteArray) -> int:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_buffer(bytes)
	file.close()
	return OK


func _write_text_to_resource_path(path: String, text: String) -> int:
	return _write_bytes_to_resource_path(path, text.to_utf8_buffer())


func _is_safe_pack_relative_path(path: String) -> bool:
	var candidate := path.trim_suffix("/")
	if candidate.is_empty() or candidate.begins_with("/") or candidate.find(":") >= 0 or candidate.find(String.chr(0)) >= 0:
		return false
	for part in candidate.split("/"):
		if part.is_empty() or part == "." or part == "..":
			return false
	return true


func _resource_save_path(path: String) -> String:
	if path.begins_with("res://") or path.begins_with("user://"):
		return path
	var localized := ProjectSettings.localize_path(path)
	return localized if localized.begins_with("res://") else path


func _pack_root_for_manifest_path(path: String) -> String:
	var base := path.get_base_dir()
	if base.get_file() == "manifests":
		return base.get_base_dir()
	return base


func _blank_streams(keys: Array) -> Dictionary:
	var out := {}
	for key in keys:
		out[str(key)] = ""
	return out


func _resource_uses_script(resource: Variant, script: Script) -> bool:
	return resource is Resource and (resource as Resource).get_script() == script


func _empty_result() -> Dictionary:
	return {
		"ok": false,
		"compiled": [],
		"warnings": [],
		"errors": [],
	}
