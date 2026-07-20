@tool
extends Resource
class_name PCSEventResource

@export var tick := 0
@export var duration_ticks := 0
@export var step := -1
@export var notes: Array[int] = []
@export var note := -1
@export var section_id := ""
@export_enum("drum", "bass", "chord", "melody", "marker", "accent") var track_type := "marker"
@export var track_index := 0
@export var instrument_id := ""
@export var midi_note := -1
@export var velocity := 0
@export_range(-1.0, 1.0, 0.01) var pan := 0.0
@export var articulation := ""
@export var sound := ""
@export var role := ""
@export var expression: Dictionary = {}
@export var technique: Dictionary = {}
@export var flags: Dictionary = {}
@export var source_step := -1
@export var source_bar := -1


func to_dictionary() -> Dictionary:
	return {
		"tick": tick,
		"duration_ticks": duration_ticks,
		"step": step,
		"notes": notes.duplicate(),
		"note": note,
		"section_id": section_id,
		"track_type": track_type,
		"track_index": track_index,
		"instrument_id": instrument_id,
		"midi_note": midi_note,
		"velocity": velocity,
		"pan": pan,
		"articulation": articulation,
		"sound": sound,
		"role": role,
		"expression": expression.duplicate(true),
		"technique": technique.duplicate(true),
		"flags": flags,
		"source_step": source_step,
		"source_bar": source_bar,
	}
