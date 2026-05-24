@tool
extends VBoxContainer
class_name PCSSectionList

signal section_selected(section_id: String)

var chart: PCSChartResource


func set_chart(value: PCSChartResource) -> void:
	chart = value
	_rebuild()


func _ready() -> void:
	_rebuild()


func _rebuild() -> void:
	for child in get_children():
		child.queue_free()

	var title := Label.new()
	title.text = "Sections"
	title.add_theme_font_size_override("font_size", 16)
	add_child(title)

	if chart == null:
		_add_muted_label("No chart loaded")
		return

	var ids := chart.section_library.keys()
	ids.sort()
	for section_id in ids:
		var section_info: Dictionary = chart.section_library.get(section_id, {})
		var summary: Dictionary = section_info.get("track_summary", {})
		var melody_tracks: Array = summary.get("melody_tracks", [])
		var bass: Dictionary = summary.get("bass", {})
		var guitar: Dictionary = summary.get("guitar", {})
		var button := Button.new()
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.text = "%s  %d bars  %d events-ish  bass:%d  gtr:%d  mel:%d" % [
			section_id,
			int(section_info.get("bars", 0)),
			_count_section_events(str(section_id)),
			int(bass.get("triggers", 0)),
			int(guitar.get("events", 0)),
			melody_tracks.size(),
		]
		button.pressed.connect(func() -> void:
			section_selected.emit(str(section_id))
		)
		add_child(button)


func _count_section_events(section_id: String) -> int:
	if chart == null:
		return 0
	var count := 0
	for event in chart.compiled_events:
		if str(event.get("section_id", "")) == section_id:
			count += 1
	return count


func _add_muted_label(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.modulate = Color(0.7, 0.7, 0.7)
	add_child(label)
