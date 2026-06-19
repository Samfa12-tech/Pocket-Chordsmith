@tool
extends SceneTree

const SoundKitGenerator := preload("res://addons/pocket_chordsmith/editor/pcs_sound_kit_generator.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help"):
		_print_usage()
		quit(0)
		return

	var output_dir := str(args.get("output", SoundKitGenerator.DEFAULT_OUTPUT_DIR))
	var generator = SoundKitGenerator.new()
	var result: Dictionary = generator.generate_web_kit(output_dir)
	print("Pocket Chordsmith web sound kit: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	print("Output: %s" % output_dir)
	print("Profile: %s" % str(result.get("profile_path", "")))
	print("Samples: %d" % (result.get("samples", {}) as Dictionary).size())
	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))
	quit(0 if bool(result.get("ok", false)) else 1)


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--output", "-o":
				index += 1
				if index < args.size():
					out["output"] = str(args[index])
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith web sound kit generator")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/generate_web_sound_kit.gd [-- --output res://addons/pocket_chordsmith/audio/web_kit]")
