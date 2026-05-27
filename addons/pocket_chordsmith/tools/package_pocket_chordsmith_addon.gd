@tool
extends SceneTree

const ADDON_DIR := "res://addons/pocket_chordsmith"
const DEFAULT_VERSION := "1.1.3"
const DEFAULT_OUTPUT := "res://pocket_chordsmith_godot_addon_%s.zip" % DEFAULT_VERSION


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help"):
		_print_usage()
		quit(0)
		return

	var output_path := str(args.get("output", DEFAULT_OUTPUT))
	var include_import_metadata := bool(args.get("include_import_metadata", false))
	var result := package_addon(output_path, include_import_metadata)

	for file_path in result.get("files", []):
		print("Packed %s" % str(file_path))
	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))
	if bool(result.get("ok", false)):
		print("Pocket Chordsmith addon package: %s (%d files)" % [output_path, int(result.get("file_count", 0))])

	quit(0 if bool(result.get("ok", false)) else 1)


static func package_addon(output_path: String = DEFAULT_OUTPUT, include_import_metadata := false) -> Dictionary:
	var result := {"ok": false, "output_path": output_path, "file_count": 0, "files": [], "warnings": [], "errors": []}
	var files := _collect_files(ADDON_DIR, include_import_metadata)
	if files.is_empty():
		result["errors"].append("No addon files found under %s." % ADDON_DIR)
		return result

	var absolute_output := ProjectSettings.globalize_path(output_path) if output_path.begins_with("res://") or output_path.begins_with("user://") else output_path
	var output_dir := absolute_output.get_base_dir()
	var dir_error := DirAccess.make_dir_recursive_absolute(output_dir)
	if dir_error != OK:
		result["errors"].append("Could not create package output folder %s: %s" % [output_dir, error_string(dir_error)])
		return result
	if FileAccess.file_exists(absolute_output):
		var remove_error := DirAccess.remove_absolute(absolute_output)
		if remove_error != OK:
			result["errors"].append("Could not replace existing zip package %s: %s" % [absolute_output, error_string(remove_error)])
			return result

	var packer := ZIPPacker.new()
	var open_error := packer.open(absolute_output, ZIPPacker.APPEND_CREATE)
	if open_error != OK:
		result["errors"].append("Could not open zip package %s: %s" % [absolute_output, error_string(open_error)])
		return result

	for resource_path in files:
		var data := FileAccess.get_file_as_bytes(resource_path)
		if data.is_empty() and FileAccess.get_open_error() != OK:
			result["warnings"].append("Skipped unreadable file: %s" % resource_path)
			continue
		var zip_path := resource_path.trim_prefix("res://")
		var start_error := packer.start_file(zip_path)
		if start_error != OK:
			result["warnings"].append("Could not start zip file %s: %s" % [zip_path, error_string(start_error)])
			continue
		packer.write_file(data)
		packer.close_file()
		result["files"].append(resource_path)

	packer.close()
	result["file_count"] = result["files"].size()
	result["ok"] = result["errors"].is_empty()
	if not include_import_metadata:
		result["warnings"].append("Skipped .uid and .import metadata so Godot can rebuild local caches cleanly.")
	return result


static func _collect_files(root: String, include_import_metadata: bool) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(root)
	if dir == null:
		return out
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		if name.begins_with("."):
			name = dir.get_next()
			continue
		var path := root.path_join(name)
		if dir.current_is_dir():
			out.append_array(_collect_files(path, include_import_metadata))
		elif _should_package_file(path, include_import_metadata):
			out.append(path)
		name = dir.get_next()
	out.sort()
	return out


static func _should_package_file(path: String, include_import_metadata: bool) -> bool:
	if path.ends_with(".uid"):
		return false
	if path.ends_with(".import") and not include_import_metadata:
		return false
	if path.get_file().begins_with("tmp_"):
		return false
	return true


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--output", "-o":
				index += 1
				if index < args.size():
					out["output"] = str(args[index])
			"--include-import-metadata":
				out["include_import_metadata"] = true
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith addon packager")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd -- [--output <zip-path>] [--include-import-metadata]")
