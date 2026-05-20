@tool
extends VBoxContainer
class_name PCSImportReport

var import_result: Dictionary = {}


func set_import_result(value: Dictionary) -> void:
	import_result = value
	_rebuild()


func _ready() -> void:
	_rebuild()


func _rebuild() -> void:
	for child in get_children():
		child.queue_free()

	var title := Label.new()
	title.text = "Import Report"
	title.add_theme_font_size_override("font_size", 16)
	add_child(title)

	if import_result.is_empty():
		_add_line("No import run yet.", true)
		return

	var report: Dictionary = import_result.get("report", {})
	_add_line("Schema: %s  BPM: %s  %s/%s  %s %s" % [
		str(report.get("schema_version", "-")),
		str(report.get("bpm", "-")),
		str(report.get("time_signature", "-")),
		"4",
		str(report.get("key", "-")),
		str(report.get("scale", "-")),
	], false)
	_add_line("Sections: %s  Sequence slots: %s" % [str(report.get("section_count", 0)), str(report.get("sequence_slots", 0))], false)

	var errors: Array = import_result.get("errors", [])
	var warnings: Array = import_result.get("warnings", [])
	var notes: Array = import_result.get("migration_notes", [])
	if not errors.is_empty():
		_add_line("Errors", false)
		for error in errors:
			_add_line("- %s" % str(error), false, Color(1.0, 0.42, 0.35))
	if not warnings.is_empty():
		_add_line("Warnings", false)
		for warning in warnings:
			_add_line("- %s" % str(warning), false, Color(1.0, 0.78, 0.35))
	if not notes.is_empty():
		_add_line("Migration Notes", false)
		for note in notes:
			_add_line("- %s" % str(note), true)
	if errors.is_empty() and warnings.is_empty() and notes.is_empty():
		_add_line("Clean import.", true)


func _add_line(text: String, muted := false, color := Color.WHITE) -> void:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.modulate = Color(0.7, 0.7, 0.7) if muted else color
	add_child(label)
