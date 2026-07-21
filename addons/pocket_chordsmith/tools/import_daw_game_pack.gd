@tool
extends SceneTree

const BuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("pack"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var pack_path := str(args.get("pack", ""))
	var output_root := str(args.get("output_root", BuildTools.DEFAULT_DAW_PACK_IMPORT_ROOT))
	var tools = BuildTools.new()
	var result: Dictionary = tools.import_daw_game_pack(pack_path, output_root)

	for warning in result.get("warnings", []):
		push_warning(str(warning))
	for error in result.get("errors", []):
		push_error(str(error))

	if bool(result.get("ok", false)):
		print("Imported DAW pack -> %s" % str(result.get("pack_root", "")))
		print("Manifest: %s" % str(result.get("manifest_path", "")))
		print("Chart: %s" % str(result.get("chart_path", "")))
		print("Playback profile: %s" % str(result.get("profile_path", "")))
		var compiled: Array = result.get("compiled", [])
		if not compiled.is_empty():
			print("Events: %d" % int(compiled[0].get("events", 0)))

	quit(0 if bool(result.get("ok", false)) else 1)


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--pack", "-p":
				index += 1
				if index < args.size():
					out["pack"] = str(args[index])
			"--output-root", "-o":
				index += 1
				if index < args.size():
					out["output_root"] = str(args[index])
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket DAW game-pack importer")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/import_daw_game_pack.gd -- --pack <godot-adaptive-pack.zip> [--output-root res://music/pocket_chordsmith_packs]")
