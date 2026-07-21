@tool
extends Resource
class_name PCSChartResource

const TICKS_PER_QUARTER := 480

@export var source_path := ""
@export var source_project_version := 0
@export var schema_version := 16
@export var imported_at_unix_time := 0
@export var bpm := 120
@export var time_signature := 4
@export_range(0.0, 0.35, 0.01) var swing := 0.0
@export var key := "C"
@export var scale := "major"
@export var resolution := 1
@export var ticks_per_quarter := TICKS_PER_QUARTER
@export var audio_profile := "standard"
@export var sound_profile: Dictionary = {}
@export var format_features: Array[String] = []
@export var profile_metadata: Dictionary = {}
@export var lofi_preset := ""
@export var lofi_texture: Dictionary = {}
@export var chip_preset := ""
@export var chip_texture: Dictionary = {}
@export var metal_preset := ""
@export var metal_texture: Dictionary = {}
@export var drum_kit := "classic"
@export var drum_groove_preset := ""
@export var bass_tone := "classic"
@export var mix_volumes: Dictionary = {}
@export var performance_settings: Dictionary = {}
@export var lofi_intensity_hints: Dictionary = {}
@export var chip_intensity_hints: Dictionary = {}
@export var metal_intensity_hints: Dictionary = {}
@export var expressive_event_count := 0
@export var rich_sections: Dictionary = {}
@export var capability_report: Dictionary = {}

@export var sections: Array[Resource] = []
@export var section_library: Dictionary = {}
@export var section_source_data: Dictionary = {}
@export var arrangement: Array[String] = []
@export var arrangement_positions: Array[Dictionary] = []
@export var compiled_events: Array[Dictionary] = []
@export var markers: Array[Dictionary] = []
@export var loop_regions: Array[Dictionary] = []
@export var intensity_tags: Dictionary = {}
@export var music_states: Dictionary = {}
@export var default_music_state := ""
@export var stem_sets: Dictionary = {}
@export var gameplay_flags: Dictionary = {}
@export var accent_map: Dictionary = {}
@export var level_id := ""
@export var default_loop := ""
@export var mood := ""
@export var import_warnings: Array[String] = []
@export var original_metadata: Dictionary = {}


func get_length_ticks() -> int:
	if arrangement_positions.is_empty():
		return 0
	var last: Dictionary = arrangement_positions[arrangement_positions.size() - 1]
	return int(last.get("start_tick", 0)) + int(last.get("length_ticks", 0))


func get_seconds_per_tick() -> float:
	return 60.0 / max(1.0, float(bpm)) / float(ticks_per_quarter)


func find_section_at_tick(tick: int) -> Dictionary:
	if arrangement_positions.is_empty():
		return {}
	for section_info in arrangement_positions:
		var start_tick := int(section_info.get("start_tick", 0))
		var length_ticks := int(section_info.get("length_ticks", 0))
		if tick >= start_tick and tick < start_tick + length_ticks:
			return section_info
	return arrangement_positions[arrangement_positions.size() - 1]


func first_section_start_tick(section_id: String) -> int:
	for section_info in arrangement_positions:
		if str(section_info.get("id", "")) == section_id:
			return int(section_info.get("start_tick", 0))
	return -1


func arrangement_start_tick(index: int) -> int:
	if index < 0 or index >= arrangement_positions.size():
		return -1
	return int((arrangement_positions[index] as Dictionary).get("start_tick", -1))


func arrangement_section_id(index: int) -> String:
	if index < 0 or index >= arrangement_positions.size():
		return ""
	return str((arrangement_positions[index] as Dictionary).get("id", ""))


func get_event_count_by_type() -> Dictionary:
	var counts := {}
	for event in compiled_events:
		var track_type := str(event.get("track_type", "unknown"))
		counts[track_type] = int(counts.get(track_type, 0)) + 1
	return counts


func has_slide_events() -> bool:
	for event in compiled_events:
		var flags: Dictionary = event.get("flags", {})
		if bool(flags.get("slide", false)):
			return true
	return false


func get_original_project() -> Dictionary:
	var source = original_metadata.get("original_project", {})
	return source.duplicate(true) if source is Dictionary else {}


func get_rich_loss_report(capabilities := {}) -> Dictionary:
	var contract = load("res://addons/pocket_chordsmith/import/pcs_sound_profile_contract.gd")
	return contract.negotiate({"soundProfile": sound_profile, "formatFeatures": format_features, "sections": rich_sections}, capabilities)
