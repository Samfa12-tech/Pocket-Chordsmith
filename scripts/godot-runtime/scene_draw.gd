extends Node2D

var seconds := 0.0
var beat_flash := 0.0

func _process(delta: float) -> void:
	seconds += delta
	beat_flash = maxf(0.0, beat_flash - delta * 3.0)
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(0,0,800,480),Color(0.025,0.04,0.07))
	for x in range(0,801,40):
		draw_line(Vector2(x,0),Vector2(x,480),Color(0.07,0.1,0.15))
	for y in range(0,481,40):
		draw_line(Vector2(0,y),Vector2(800,y),Color(0.07,0.1,0.15))
	for index in range(48):
		var angle := seconds * (0.25 + float(index % 5) * 0.04) + float(index) * 0.73
		var position := Vector2(400,240) + Vector2(cos(angle),sin(angle * 1.31)) * (55.0 + float(index % 12) * 11.0)
		draw_circle(position,4 + index % 5,Color.from_hsv(float(index)/48.0,0.55,0.7))
	draw_circle(Vector2(400,240),18 + beat_flash * 8,Color(0.15 + beat_flash * 0.4,0.8,0.9))
