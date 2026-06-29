@tool
extends SceneTree

const AudioBusTools := preload("res://addons/pocket_chordsmith/editor/pcs_audio_bus_tools.gd")
const PreviewMixValidator := preload("res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_preview_mix.gd")
const DEFAULT_PROFILE := "res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres"


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help"):
		_print_usage()
		quit(0)
		return

	var save_layout := not bool(args.get("no_save", false))
	var profile_path := str(args.get("profile", DEFAULT_PROFILE))
	var tools = AudioBusTools.new()
	var result: Dictionary = tools.reset_dry_preview_mix(save_layout)

	print("Pocket Chordsmith preview mix repair")
	print("save_layout: %s" % str(save_layout))
	_print_array("created", result.get("created", []))
	_print_array("updated_sends", result.get("updated_sends", []))
	_print_array("unmuted", result.get("unmuted", []))
	_print_array("cleared_effects", result.get("cleared_effects", []))
	for warning in result.get("warnings", []):
		push_warning(str(warning))

	var validation := PreviewMixValidator.validate_preview_mix(profile_path, false, false)
	for info_line in validation.get("info", []):
		print(str(info_line))
	for error in validation.get("errors", []):
		push_error(str(error))
	print("Pocket Chordsmith preview mix validation after repair: %s" % ("OK" if bool(validation.get("ok", false)) else "Needs attention"))

	quit(0 if bool(validation.get("ok", false)) else 1)


func _print_array(label: String, values: Array) -> void:
	print("%s: %s" % [label, ", ".join(values) if not values.is_empty() else "(none)"])


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--no-save":
				out["no_save"] = true
			"--profile", "-p":
				index += 1
				if index < args.size():
					out["profile"] = str(args[index])
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith preview mix repair")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/repair_pocket_chordsmith_preview_mix.gd -- [--profile <profile.tres>] [--no-save]")
