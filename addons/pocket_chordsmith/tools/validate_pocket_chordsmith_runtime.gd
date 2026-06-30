@tool
extends SceneTree

const BuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("chart"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var chart_path := str(args.get("chart", ""))
	var profile_path := str(args.get("profile", ""))
	var report_path := str(args.get("report", ""))

	var tools = BuildTools.new()
	var result: Dictionary
	if report_path.is_empty():
		result = tools.validate_runtime_files(chart_path, profile_path)
	else:
		result = tools.export_integration_report(chart_path, profile_path, report_path)

	print("Pocket Chordsmith runtime validation: %s" % ("OK" if bool(result.get("ok", false)) else "Needs attention"))
	print("Chart: %s" % chart_path)
	if not profile_path.is_empty():
		print("Profile: %s" % profile_path)
	if result.has("report_path"):
		print("Report: %s" % str(result["report_path"]))

	var info: Dictionary = result.get("info", {})
	var keys := info.keys()
	keys.sort()
	for key in keys:
		print("%s: %s" % [str(key), str(info[key])])

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
			"--chart", "-c":
				index += 1
				if index < args.size():
					out["chart"] = str(args[index])
			"--profile", "-p":
				index += 1
				if index < args.size():
					out["profile"] = str(args[index])
			"--report", "-r":
				index += 1
				if index < args.size():
					out["report"] = str(args[index])
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith runtime validator")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart <chart.tres> [--profile <profile.tres>] [--report <report.md>]")
