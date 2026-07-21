@tool
extends SceneTree

const SectionStemRenderer := preload("res://addons/pocket_chordsmith/editor/pcs_section_stem_renderer.gd")
const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const ChartResource := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const PlaybackProfile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")


func _init() -> void:
	var args := _parse_args(OS.get_cmdline_user_args())
	if args.has("help") or not args.has("chart") or not args.has("profile"):
		_print_usage()
		quit(0 if args.has("help") else 1)
		return

	var chart_path := str(args.get("chart", ""))
	var profile_path := str(args.get("profile", ""))
	var chart = ResourceLoader.load(chart_path)
	var profile = ResourceLoader.load(profile_path)
	if not _resource_uses_script(chart, ChartResource):
		push_error("Path is not a PCSChartResource: %s" % chart_path)
		quit(1)
		return
	if not _resource_uses_script(profile, PlaybackProfile):
		push_error("Path is not a PCSPlaybackProfile: %s" % profile_path)
		quit(1)
		return

	var output_root := str(args.get("output_root", SectionStemRenderer.default_output_root(chart)))
	var renderer = SectionStemRenderer.new()
	var conductor = ConductorScript.new()
	conductor.chart = chart
	conductor.playback_profile = profile
	var render_options := {
		"prefer_native": bool(args.get("prefer_native", false)),
	}
	var jobs: Array[Dictionary] = renderer.build_render_jobs(chart, output_root)
	var full_stem_paths := {}
	var section_stem_sets := {}
	var warnings: Array = []
	var rendered := 0
	for index in range(jobs.size()):
		var job: Dictionary = jobs[index]
		print("Rendering %d/%d: %s" % [index + 1, jobs.size(), str(job.get("label", ""))])
		var result: Dictionary = renderer.render_job(chart, profile, conductor, job, render_options)
		warnings.append_array(result.get("warnings", []))
		for warning in result.get("warnings", []):
			push_warning(str(warning))
		if not bool(result.get("ok", false)):
			for error in result.get("errors", []):
				push_error(str(error))
			quit(1)
			return
		rendered += 1
		var layer := str(job.get("layer", ""))
		var path := str(job.get("path", ""))
		if str(job.get("scope", "")) == "full":
			full_stem_paths[layer] = path
		else:
			var section_key := str(job.get("key", "section"))
			if not section_stem_sets.has(section_key):
				section_stem_sets[section_key] = {}
			(section_stem_sets[section_key] as Dictionary)[layer] = path

	var rendered_profile := renderer.create_rendered_profile(profile, full_stem_paths, section_stem_sets)
	var rendered_profile_path := str(args.get("rendered_profile", SectionStemRenderer.profile_path_for_output_root(output_root)))
	var save_error := ResourceSaver.save(rendered_profile, rendered_profile_path)
	if save_error != OK:
		push_error("Could not save rendered playback profile %s: %s" % [rendered_profile_path, error_string(save_error)])
		quit(1)
		return

	print("OK")
	print("Rendered WAV stems: %d" % rendered)
	print("Output root: %s" % output_root)
	print("Playback profile: %s" % rendered_profile_path)
	print("Warnings: %d" % warnings.size())
	quit(0)


func _parse_args(args: PackedStringArray) -> Dictionary:
	var out := {}
	var index := 0
	while index < args.size():
		var arg := str(args[index])
		match arg:
			"--help", "-h":
				out["help"] = true
			"--chart":
				index += 1
				if index < args.size():
					out["chart"] = str(args[index])
			"--profile":
				index += 1
				if index < args.size():
					out["profile"] = str(args[index])
			"--output-root":
				index += 1
				if index < args.size():
					out["output_root"] = str(args[index])
			"--rendered-profile":
				index += 1
				if index < args.size():
					out["rendered_profile"] = str(args[index])
			"--prefer-native":
				out["prefer_native"] = true
		index += 1
	return out


func _print_usage() -> void:
	print("Pocket Chordsmith preview-audio renderer")
	print("Usage:")
	print("  godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/render_pocket_chordsmith_preview_audio.gd -- --chart <chart.tres> --profile <profile.tres> [--output-root res://music/pocket_chordsmith_generated/name] [--prefer-native]")


func _resource_uses_script(resource: Variant, script: Script) -> bool:
	return resource is Resource and (resource as Resource).get_script() == script
