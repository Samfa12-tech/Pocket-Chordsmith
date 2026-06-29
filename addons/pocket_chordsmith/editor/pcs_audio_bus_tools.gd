@tool
extends RefCounted
class_name PCSAudioBusTools

const DEFAULT_LAYOUT := {
	"Music_Master": "Master",
	"Music_Drums": "Music_Master",
	"Music_Bass": "Music_FX",
	"Music_Chords": "Music_FX",
	"Music_Guitar": "Music_FX",
	"Music_Melody": "Music_FX",
	"Music_Stingers": "Music_Master",
	"Music_FX": "Music_Master",
	"Music_Texture": "Music_FX",
	"SFX": "Master",
	"UI": "Master",
}
const DEFAULT_MUSIC_BUSES := [
	"Music_Master",
	"Music_Drums",
	"Music_Bass",
	"Music_Chords",
	"Music_Guitar",
	"Music_Melody",
	"Music_Stingers",
	"Music_FX",
	"Music_Texture",
]
const DEFAULT_BUS_LAYOUT_PATH := "res://default_bus_layout.tres"
const DEFAULT_BUS_LAYOUT_SETTING := "audio/buses/default_bus_layout"


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


func create_missing_recommended_buses(save_layout := true, install_guitar_preview_effects := false) -> Dictionary:
	var report := get_recommended_layout_report()
	var created: Array[String] = []
	var updated_sends: Array[String] = []
	var warnings: Array[String] = []

	for bus_name in DEFAULT_LAYOUT.keys():
		if AudioServer.get_bus_index(bus_name) >= 0:
			continue
		var index := AudioServer.get_bus_count()
		AudioServer.add_bus(index)
		AudioServer.set_bus_name(index, bus_name)
		AudioServer.set_bus_send(index, StringName("Master"))
		created.append(bus_name)

	for bus_name in DEFAULT_LAYOUT.keys():
		var index := AudioServer.get_bus_index(bus_name)
		if index < 0:
			continue
		var expected_send := str(DEFAULT_LAYOUT[bus_name])
		if str(AudioServer.get_bus_send(index)) == expected_send:
			continue
		AudioServer.set_bus_send(index, StringName(expected_send))
		updated_sends.append("%s -> %s" % [bus_name, expected_send])

	for warning in get_recommended_layout_report().get("mismatched_sends", []):
		warnings.append(str(warning))

	var created_effects: Array[String] = []
	if install_guitar_preview_effects:
		var effect_result := ensure_guitar_preview_effects(false)
		for effect_name in effect_result.get("created_effects", []):
			created_effects.append(str(effect_name))
		for warning in effect_result.get("warnings", []):
			warnings.append(str(warning))
		var lofi_result := ensure_lofi_texture_effects(false)
		for effect_name in lofi_result.get("created_effects", []):
			created_effects.append(str(effect_name))
		for warning in lofi_result.get("warnings", []):
			warnings.append(str(warning))

	var save_error := OK
	if save_layout and (not created.is_empty() or not updated_sends.is_empty() or not created_effects.is_empty()):
		save_error = _save_default_bus_layout(warnings)

	return {
		"created": created,
		"updated_sends": updated_sends,
		"created_effects": created_effects,
		"warnings": warnings,
		"save_error": save_error,
		"report": get_recommended_layout_report(),
	}


func reset_dry_preview_mix(save_layout := true) -> Dictionary:
	var setup_result := create_missing_recommended_buses(false, false)
	var unmuted: Array[String] = []
	var cleared_effects: Array[String] = []
	var warnings: Array[String] = []

	for warning in setup_result.get("warnings", []):
		warnings.append(str(warning))

	for bus_name in DEFAULT_MUSIC_BUSES:
		var bus_index := AudioServer.get_bus_index(bus_name)
		if bus_index < 0:
			warnings.append("Missing Chordsmith bus during dry preview reset: %s" % bus_name)
			continue

		if AudioServer.is_bus_mute(bus_index):
			AudioServer.set_bus_mute(bus_index, false)
			unmuted.append(bus_name)

		for effect_index in range(AudioServer.get_bus_effect_count(bus_index) - 1, -1, -1):
			var effect := AudioServer.get_bus_effect(bus_index, effect_index)
			var effect_name := effect.get_class() if effect != null else "AudioEffect"
			AudioServer.remove_bus_effect(bus_index, effect_index)
			cleared_effects.append("%s:%s" % [bus_name, effect_name])

	var save_error := OK
	if save_layout and (not setup_result.get("created", []).is_empty() or not setup_result.get("updated_sends", []).is_empty() or not unmuted.is_empty() or not cleared_effects.is_empty()):
		save_error = _save_default_bus_layout(warnings)

	return {
		"created": setup_result.get("created", []),
		"updated_sends": setup_result.get("updated_sends", []),
		"unmuted": unmuted,
		"cleared_effects": cleared_effects,
		"warnings": warnings,
		"save_error": save_error,
		"report": get_recommended_layout_report(),
	}


static func ensure_guitar_preview_effects(save_layout := true) -> Dictionary:
	var created_effects: Array[String] = []
	var warnings: Array[String] = []
	var bus_index := AudioServer.get_bus_index("Music_Guitar")
	if bus_index < 0:
		return {
			"created_effects": created_effects,
			"warnings": ["Music_Guitar bus does not exist yet."],
			"save_error": OK,
		}

	if _find_effect(bus_index, "AudioEffectHighPassFilter") == null:
		var highpass := AudioEffectHighPassFilter.new()
		_set_if_has(highpass, "cutoff_hz", 90.0)
		_set_if_has(highpass, "resonance", 0.18)
		AudioServer.add_bus_effect(bus_index, highpass, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("guitar high-pass")

	if _find_effect(bus_index, "AudioEffectDistortion") == null:
		var distortion := AudioEffectDistortion.new()
		_set_if_has(distortion, "mode", AudioEffectDistortion.MODE_ATAN)
		_set_if_has(distortion, "pre_gain", 3.0)
		_set_if_has(distortion, "keep_hf_hz", 3600.0)
		_set_if_has(distortion, "drive", 0.42)
		_set_if_has(distortion, "post_gain", -8.0)
		AudioServer.add_bus_effect(bus_index, distortion, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("guitar amp drive")

	if _find_effect(bus_index, "AudioEffectEQ10") == null:
		var eq := AudioEffectEQ10.new()
		var gains := [-18.0, -9.0, -4.0, 1.0, 0.0, 1.8, 1.2, -2.5, -8.0, -18.0]
		for band in range(min(eq.get_band_count(), gains.size())):
			eq.set_band_gain_db(band, gains[band])
		AudioServer.add_bus_effect(bus_index, eq, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("guitar cab EQ")

	if _find_effect(bus_index, "AudioEffectLowPassFilter") == null:
		var lowpass := AudioEffectLowPassFilter.new()
		_set_if_has(lowpass, "cutoff_hz", 5200.0)
		_set_if_has(lowpass, "resonance", 0.12)
		AudioServer.add_bus_effect(bus_index, lowpass, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("guitar low-pass")

	if _find_effect(bus_index, "AudioEffectCompressor") == null:
		var compressor := AudioEffectCompressor.new()
		_set_if_has(compressor, "threshold", -16.0)
		_set_if_has(compressor, "ratio", 2.4)
		_set_if_has(compressor, "attack_us", 5000.0)
		_set_if_has(compressor, "release_ms", 90.0)
		_set_if_has(compressor, "gain", 0.0)
		AudioServer.add_bus_effect(bus_index, compressor, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("guitar compressor")

	if _find_effect(bus_index, "AudioEffectLimiter") == null:
		var limiter := AudioEffectLimiter.new()
		_set_if_has(limiter, "ceiling_db", -1.2)
		_set_if_has(limiter, "soft_clip_db", 2.0)
		_set_if_has(limiter, "soft_clip_ratio", 8.0)
		AudioServer.add_bus_effect(bus_index, limiter, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("guitar limiter")

	var save_error := OK
	if save_layout and not created_effects.is_empty():
		save_error = _save_default_bus_layout(warnings)

	return {
		"created_effects": created_effects,
		"warnings": warnings,
		"save_error": save_error,
	}


static func ensure_lofi_texture_effects(save_layout := true) -> Dictionary:
	var created_effects: Array[String] = []
	var warnings: Array[String] = []
	var bus_index := AudioServer.get_bus_index("Music_Texture")
	if bus_index < 0:
		return {
			"created_effects": created_effects,
			"warnings": ["Music_Texture bus does not exist yet."],
			"save_error": OK,
		}

	if _find_effect(bus_index, "AudioEffectLowPassFilter") == null:
		var lowpass := AudioEffectLowPassFilter.new()
		_set_if_has(lowpass, "cutoff_hz", 5600.0)
		_set_if_has(lowpass, "resonance", 0.10)
		AudioServer.add_bus_effect(bus_index, lowpass, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("lofi texture low-pass")

	if _find_effect(bus_index, "AudioEffectReverb") == null:
		var reverb := AudioEffectReverb.new()
		_set_if_has(reverb, "room_size", 0.28)
		_set_if_has(reverb, "wet", 0.12)
		_set_if_has(reverb, "dry", 0.86)
		AudioServer.add_bus_effect(bus_index, reverb, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("lofi texture room")

	if _find_effect(bus_index, "AudioEffectDistortion") == null:
		var saturation := AudioEffectDistortion.new()
		_set_if_has(saturation, "mode", AudioEffectDistortion.MODE_ATAN)
		_set_if_has(saturation, "drive", 0.16)
		_set_if_has(saturation, "post_gain", -10.0)
		AudioServer.add_bus_effect(bus_index, saturation, AudioServer.get_bus_effect_count(bus_index))
		created_effects.append("lofi texture warmth")

	var save_error := OK
	if save_layout and not created_effects.is_empty():
		save_error = _save_default_bus_layout(warnings)

	return {
		"created_effects": created_effects,
		"warnings": warnings,
		"save_error": save_error,
	}


static func fallback_bus(preferred: String, fallback := "Master") -> String:
	return preferred if AudioServer.get_bus_index(preferred) >= 0 else fallback


static func _save_default_bus_layout(warnings: Array[String]) -> int:
	var layout := AudioServer.generate_bus_layout()
	var save_error := ResourceSaver.save(layout, DEFAULT_BUS_LAYOUT_PATH)
	if save_error != OK:
		warnings.append("Could not save default_bus_layout.tres: %s" % error_string(save_error))
		return save_error
	ProjectSettings.set_setting(DEFAULT_BUS_LAYOUT_SETTING, DEFAULT_BUS_LAYOUT_PATH)
	var project_save_error := ProjectSettings.save()
	if project_save_error != OK:
		warnings.append("Could not save project setting %s: %s" % [DEFAULT_BUS_LAYOUT_SETTING, error_string(project_save_error)])
	return project_save_error


static func _find_effect(bus_index: int, effect_class: String) -> AudioEffect:
	for effect_index in range(AudioServer.get_bus_effect_count(bus_index)):
		var effect := AudioServer.get_bus_effect(bus_index, effect_index)
		if effect != null and effect.get_class() == effect_class:
			return effect
	return null


static func _set_if_has(object: Object, property_name: String, value) -> void:
	for property in object.get_property_list():
		if str(property.get("name", "")) == property_name:
			object.set(property_name, value)
			return
