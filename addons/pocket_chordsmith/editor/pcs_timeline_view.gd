@tool
extends Control
class_name PCSTimelineView

var chart: PCSChartResource
var conductor: PocketChordsmithConductor


func _ready() -> void:
	custom_minimum_size = Vector2(520, 180)


func set_chart(value: PCSChartResource) -> void:
	chart = value
	queue_redraw()


func set_conductor(value: PocketChordsmithConductor) -> void:
	conductor = value
	queue_redraw()


func _process(_delta: float) -> void:
	if conductor != null and conductor.is_playing():
		queue_redraw()


func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	draw_rect(rect, Color(0.07, 0.075, 0.09), true)
	draw_rect(rect, Color(0.2, 0.22, 0.25), false, 1.0)
	if chart == null or chart.get_length_ticks() <= 0:
		draw_string(get_theme_default_font(), Vector2(14, 30), "No compiled chart", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.7, 0.7, 0.7))
		return

	var total_ticks := max(1, chart.get_length_ticks())
	var colors := [
		Color(0.22, 0.36, 0.52),
		Color(0.24, 0.45, 0.35),
		Color(0.46, 0.34, 0.20),
		Color(0.42, 0.28, 0.46),
	]
	for index in range(chart.arrangement_positions.size()):
		var info: Dictionary = chart.arrangement_positions[index]
		var start_tick := int(info.get("start_tick", 0))
		var length_ticks := int(info.get("length_ticks", 0))
		var x := _tick_to_x(start_tick, total_ticks)
		var w := max(2.0, _tick_to_x(start_tick + length_ticks, total_ticks) - x)
		var band_rect := Rect2(x, 0, w, size.y)
		draw_rect(band_rect, colors[index % colors.size()].darkened(0.25), true)
		draw_string(get_theme_default_font(), Vector2(x + 6, 20), str(info.get("id", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)

	for event in chart.compiled_events:
		var tick := int(event.get("tick", 0))
		var x := _tick_to_x(tick, total_ticks)
		var y := _event_y(str(event.get("track_type", "")))
		var color := _event_color(str(event.get("track_type", "")))
		draw_line(Vector2(x, y), Vector2(x, min(size.y - 10.0, y + 22.0)), color, 1.0)

	if conductor != null:
		var playhead_x := _tick_to_x(conductor.current_tick, total_ticks)
		draw_line(Vector2(playhead_x, 0), Vector2(playhead_x, size.y), Color(1.0, 0.88, 0.45), 2.0)


func _tick_to_x(tick: int, total_ticks: int) -> float:
	return clamp(float(tick) / float(total_ticks), 0.0, 1.0) * max(1.0, size.x)


func _event_y(track_type: String) -> float:
	match track_type:
		"drum":
			return size.y * 0.36
		"bass":
			return size.y * 0.52
		"chord":
			return size.y * 0.20
		"melody":
			return size.y * 0.70
		"marker":
			return size.y * 0.86
		_:
			return size.y * 0.90


func _event_color(track_type: String) -> Color:
	match track_type:
		"drum":
			return Color(0.95, 0.45, 0.38)
		"bass":
			return Color(0.45, 0.85, 0.58)
		"chord":
			return Color(0.55, 0.68, 1.0)
		"melody":
			return Color(1.0, 0.78, 0.35)
		"marker":
			return Color(1.0, 1.0, 1.0)
		_:
			return Color(0.7, 0.7, 0.7)
