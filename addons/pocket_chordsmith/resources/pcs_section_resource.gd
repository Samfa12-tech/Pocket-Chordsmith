@tool
extends Resource
class_name PCSSectionResource

@export var id := "A"
@export var arrangement_index := 0
@export var bars := 4
@export var start_tick := 0
@export var length_ticks := 0
@export var chord_progression: Array = []
@export var track_summary: Dictionary = {}


func end_tick() -> int:
	return start_tick + length_ticks
