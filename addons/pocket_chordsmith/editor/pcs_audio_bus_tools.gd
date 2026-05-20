@tool
extends RefCounted
class_name PCSAudioBusTools

const DEFAULT_LAYOUT := {
	"Music_Master": "Master",
	"Music_Drums": "Music_Master",
	"Music_Bass": "Music_Master",
	"Music_Chords": "Music_Master",
	"Music_Melody": "Music_Master",
	"Music_Stingers": "Music_Master",
	"Music_FX": "Music_Master",
	"SFX": "Master",
	"UI": "Master",
}


func get_recommended_layout_report() -> Dictionary:
	var existing := {}
	for index in range(AudioServer.get_bus_count()):
		var bus_name := AudioServer.get_bus_name(index)
		existing[bus_name] = {
			"index": index,
			"send": str(AudioServer.get_bus_send(index)),
		}

	var missing: Array[String] = []
	var mismatched_sends: Array[String] = []
	for bus_name in DEFAULT_LAYOUT.keys():
		if not existing.has(bus_name):
			missing.append(bus_name)
			continue
		var expected_send := str(DEFAULT_LAYOUT[bus_name])
		var actual_send := str(existing[bus_name].get("send", ""))
		if actual_send != expected_send:
			mismatched_sends.append("%s sends to %s, expected %s" % [bus_name, actual_send, expected_send])

	return {
		"existing": existing,
		"missing": missing,
		"mismatched_sends": mismatched_sends,
		"recommended": DEFAULT_LAYOUT.duplicate(),
	}


func create_missing_recommended_buses(save_layout := true) -> Dictionary:
	var report := get_recommended_layout_report()
	var created: Array[String] = []
	var warnings: Array[String] = []

	for bus_name in DEFAULT_LAYOUT.keys():
		if AudioServer.get_bus_index(bus_name) >= 0:
			continue
		var index := AudioServer.get_bus_count()
		AudioServer.add_bus(index)
		AudioServer.set_bus_name(index, bus_name)
		AudioServer.set_bus_send(index, StringName(DEFAULT_LAYOUT[bus_name]))
		created.append(bus_name)

	for warning in get_recommended_layout_report().get("mismatched_sends", []):
		warnings.append(str(warning))

	var save_error := OK
	if save_layout and not created.is_empty():
		var layout := AudioServer.generate_bus_layout()
		save_error = ResourceSaver.save(layout, "res://default_bus_layout.tres")
		if save_error != OK:
			warnings.append("Could not save default_bus_layout.tres: %s" % error_string(save_error))

	return {
		"created": created,
		"warnings": warnings,
		"save_error": save_error,
		"report": get_recommended_layout_report(),
	}


static func fallback_bus(preferred: String, fallback := "Master") -> String:
	return preferred if AudioServer.get_bus_index(preferred) >= 0 else fallback
