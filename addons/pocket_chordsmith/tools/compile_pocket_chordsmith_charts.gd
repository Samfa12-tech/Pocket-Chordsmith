@tool
extends SceneTree

const BuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("source"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var source := str(args.get("source", ""))
	var output := str(args.get("output", ""))
	var options := {
		"recursive": bool(args.get("recursive", true)),
		"save_beside_source": bool(args.get("beside_source", output.is_empty())),
	}

	var tools = BuildTools.new()
	var result: Dictionary
	var dir := DirAccess.open(source)
	if dir != null:
		result = tools.compile_folder(source, output, options)
	else:
		result = tools.compile_file(source, output, options)

	for item in result.get("compiled", []):
		print("Compiled %s -> %s (%d events)" % [
			str(item.get("source", "")),
			str(item.get("path", "")),
			int(item.get("events", 0)),
		])
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
			"--source", "-s":
				index += 1
				if index < args.size():
					out["source"] = str(args[index])
			"--output", "-o":
				index += 1
				if index < args.size():
					out["output"] = str(args[index])
			"--no-recursive":
				out["recursive"] = false
			"--beside-source":
				out["beside_source"] = true
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith chart compiler")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd -- --source <json-or-folder> [--output <folder-or-file>] [--beside-source] [--no-recursive]")
