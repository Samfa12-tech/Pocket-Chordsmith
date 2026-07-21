@tool
extends SceneTree

const DEFAULT_PROFILE := "res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres"
const EXPECTED_SENDS := {
	"Music_Master": "Master",
	"Music_Drums": "Music_Master",
	"Music_Bass": "Music_FX",
	"Music_Chords": "Music_FX",
	"Music_Guitar": "Music_FX",
	"Music_Melody": "Music_FX",
	"Music_Stingers": "Music_Master",
	"Music_FX": "Music_Master",
	"Music_Texture": "Music_FX",
}
const DEFAULT_DRY_BUSES := [
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


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help"):
		_print_usage()
		quit(0)
		return

	var profile_path := str(args.get("profile", DEFAULT_PROFILE))
	var allow_effects := bool(args.get("allow_effects", false))
	var allow_missing_buses := bool(args.get("allow_missing_buses", false))
	var result := validate_preview_mix(profile_path, allow_effects, allow_missing_buses)

	print("Pocket Chordsmith preview mix validation: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	print("Profile: %s" % profile_path)
	for info_line in result.get("info", []):
		print(str(info_line))
	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))

	quit(0 if bool(result.get("ok", false)) else 1)


static func validate_preview_mix(profile_path := DEFAULT_PROFILE, allow_effects := false, allow_missing_buses := false) -> Dictionary:
	var result := {
		"ok": false,
		"info": [],
		"warnings": [],
		"errors": [],
	}
	var profile: Resource = load(profile_path)
	if profile == null:
		result["errors"].append("Could not load playback profile: %s" % profile_path)
		return result

	var sample_preview_fx_enabled := bool(profile.get("sample_preview_fx_enabled"))
	var guitar_preview_effects_enabled := bool(profile.get("guitar_preview_effects_enabled"))
	var bass_duck_db := float(profile.get("sample_preview_bass_duck_on_kick_db"))
	var gains: Dictionary = profile.get("sample_preview_gain_db") if profile.get("sample_preview_gain_db") is Dictionary else {}
	var bass_gain_db := float(gains.get("bass", 0.0))

	result["info"].append("sample_preview_fx_enabled=%s" % str(sample_preview_fx_enabled))
	result["info"].append("guitar_preview_effects_enabled=%s" % str(guitar_preview_effects_enabled))
	result["info"].append("sample_preview_bass_duck_on_kick_db=%.2f" % bass_duck_db)
	result["info"].append("sample_preview_bass_gain_db=%.2f" % bass_gain_db)

	if sample_preview_fx_enabled:
		result["errors"].append("sample_preview_fx_enabled should be false for the dry default preview mix.")
	if guitar_preview_effects_enabled:
		result["errors"].append("guitar_preview_effects_enabled should be false unless a project deliberately opts into the legacy guitar chain.")
	if bass_duck_db < -0.001:
		result["errors"].append("sample_preview_bass_duck_on_kick_db should be 0.0 by default so kick hits do not hide the bass.")
	if bass_gain_db < -3.0 or bass_gain_db > 8.0:
		result["errors"].append("sample_preview_gain_db.bass should stay between -3 dB and +8 dB for the bundled bass source to remain audible without clipping.")

	for bus_name in EXPECTED_SENDS.keys():
		var bus_index := AudioServer.get_bus_index(str(bus_name))
		if bus_index < 0:
			var message := "Missing recommended bus: %s" % str(bus_name)
			if allow_missing_buses:
				result["warnings"].append(message)
			else:
				result["errors"].append(message)
			continue
		var expected_send := str(EXPECTED_SENDS[bus_name])
		var actual_send := str(AudioServer.get_bus_send(bus_index))
		var mute := AudioServer.is_bus_mute(bus_index)
		var effects := AudioServer.get_bus_effect_count(bus_index)
		result["info"].append("%s -> %s mute=%s effects=%d" % [str(bus_name), actual_send, str(mute), effects])
		if actual_send != expected_send:
			result["errors"].append("%s sends to %s, expected %s." % [str(bus_name), actual_send, expected_send])
		if mute:
			result["errors"].append("%s is muted." % str(bus_name))
		if not allow_effects and DEFAULT_DRY_BUSES.has(str(bus_name)) and effects > 0:
			result["errors"].append("%s has %d effect(s); the default preview mix should be dry." % [str(bus_name), effects])

	result["ok"] = result["errors"].is_empty()
	return result


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--profile", "-p":
				index += 1
				if index < args.size():
					out["profile"] = str(args[index])
			"--allow-effects":
				out["allow_effects"] = true
			"--allow-missing-buses":
				out["allow_missing_buses"] = true
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith preview mix validator")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_preview_mix.gd -- [--profile <profile.tres>] [--allow-effects] [--allow-missing-buses]")
