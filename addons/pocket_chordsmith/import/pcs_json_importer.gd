@tool
extends RefCounted
class_name PCSJsonImporter

const SHARE_CODE_PREFIX := "PCS1:"
const Migrator := preload("res://addons/pocket_chordsmith/import/pcs_schema_migrator.gd")
const Validator := preload("res://addons/pocket_chordsmith/import/pcs_validator.gd")


func load_file(path: String) -> Dictionary:
	var report := _empty_result(path)
	if path.strip_edges().is_empty():
		report["errors"].append("No Pocket Chordsmith JSON path was provided.")
		return report
	if not FileAccess.file_exists(path):
		report["errors"].append("Pocket Chordsmith JSON file was not found: %s" % path)
		return report

	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		report["errors"].append("Could not open Pocket Chordsmith JSON file: %s" % error_string(FileAccess.get_open_error()))
		return report

	return load_text(file.get_as_text(), path)


func load_text(text: String, source_path := "") -> Dictionary:
	var result := _empty_result(source_path)
	var trimmed := text.strip_edges()
	if trimmed.is_empty():
		result["errors"].append("Pocket Chordsmith JSON is empty.")
		return result

	var json_text := trimmed
	if trimmed.begins_with(SHARE_CODE_PREFIX):
		var decoded := _decode_share_code(trimmed)
		if decoded.is_empty():
			result["errors"].append("Share Code could not be decoded.")
			return result
		json_text = decoded

	var parsed_result := _parse_json(json_text)
	if not parsed_result["errors"].is_empty():
		result["errors"].append_array(parsed_result["errors"])
		return result

	var raw = parsed_result["data"]
	if not (raw is Dictionary):
		result["errors"].append("Project data must be a JSON object.")
		return result

	var migrator = Migrator.new()
	var migrated: Dictionary = migrator.normalize(raw, source_path)
	var project: Dictionary = migrated.get("project", {})

	var validator = Validator.new()
	var validation: Dictionary = validator.validate_project(project)

	result["project"] = project
	result["warnings"].append_array(migrated.get("warnings", []))
	result["warnings"].append_array(validation.get("warnings", []))
	result["errors"].append_array(migrated.get("errors", []))
	result["errors"].append_array(validation.get("errors", []))
	result["schema_version"] = int(migrated.get("schema_version", 0))
	result["migration_notes"] = migrated.get("migration_notes", [])
	result["metadata"] = migrated.get("metadata", {})
	result["report"] = _build_report(source_path, result)
	result["ok"] = result["errors"].is_empty()
	return result


func _empty_result(source_path: String) -> Dictionary:
	return {
		"ok": false,
		"source_path": source_path,
		"project": {},
		"report": {},
		"warnings": [] as Array[String],
		"errors": [] as Array[String],
		"schema_version": 0,
		"migration_notes": [] as Array[String],
		"metadata": {},
	}


func _parse_json(json_text: String) -> Dictionary:
	var parser := JSON.new()
	var error := parser.parse(json_text)
	if error != OK:
		return {
			"data": null,
			"errors": ["Invalid JSON at line %d: %s" % [parser.get_error_line(), parser.get_error_message()]],
		}
	return {"data": parser.data, "errors": []}


func _decode_share_code(text: String) -> String:
	var payload := text.substr(SHARE_CODE_PREFIX.length()).strip_edges()
	if payload.is_empty():
		return ""
	var normalized := payload.replace("-", "+").replace("_", "/")
	var remainder := normalized.length() % 4
	if remainder != 0:
		normalized += "=".repeat(4 - remainder)
	return Marshalls.base64_to_utf8(normalized)


func _build_report(source_path: String, result: Dictionary) -> Dictionary:
	var project: Dictionary = result.get("project", {})
	var sequence: Array = project.get("songSequence", [])
	var section_bars: Dictionary = project.get("sectionBars", {})
	var section_count := 0
	for section_id in PCSSchemaMigrator.SECTION_IDS:
		if section_bars.has(section_id):
			section_count += 1
	return {
		"source_path": source_path,
		"schema_version": result.get("schema_version", 0),
		"project_version": project.get("projectVersion", 0),
		"bpm": project.get("bpm", 0),
		"time_signature": project.get("timeSig", 0),
		"key": project.get("key", ""),
		"scale": project.get("scale", ""),
		"resolution": project.get("resolution", 0),
		"section_count": section_count,
		"sequence_slots": sequence.size(),
		"warning_count": (result.get("warnings", []) as Array).size(),
		"error_count": (result.get("errors", []) as Array).size(),
	}
