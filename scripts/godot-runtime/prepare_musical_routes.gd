extends SceneTree
const Tools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
func _init() -> void:
	_run.call_deferred()
func _run() -> void:
	var config: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://run-config.json"))
	var rows: Array = []
	var failures: Array = []
	DirAccess.make_dir_recursive_absolute("res://profiles")
	DirAccess.make_dir_recursive_absolute("res://charts")
	for route in config.routes:
		if route.kind == "raw":
			continue
		var options := {"playback_mix":route.mix,"playback_scope":"arrangement","use_audio_stream_synchronized":route.synchronized}
		var result: Dictionary
		if config.native:
			result = Tools.new().import_daw_game_pack(config.manifest,"res://imported-"+route.name,options)
			# A manifest import saves beside its pack, regardless of destination.
			# Preserve each requested mode before a later route overwrites that file.
			if result.ok and ResourceSaver.save(result.profile,route.profile_path) != OK:
				result.ok = false
				result.errors.append("Could not save distinct route profile: "+route.name)
		else:
			result = Tools.new().create_playback_profile_from_game_pack_manifest(config.manifest,route.profile_path,"res://fixtures",options)
			var compiled: Dictionary = Tools.new().compile_file("res://fixtures/source-project.json","res://charts",{"save_beside_source":false})
			if not compiled.ok:
				result.ok = false
				result.errors.append_array(compiled.errors)
			elif not compiled.compiled.is_empty():
				result["chart_path"] = compiled.compiled[0].path
		if not result.ok:
			failures.append({"route":route.name,"errors":result.errors})
		else:
			route.chart_path = result.chart_path
		rows.append({"name":route.name,"ok":result.ok,"errors":result.errors,"warnings":result.warnings})
	_write("res://prepared-config.json",config)
	_write("res://route-preparation.json",{"routes":rows,"failures":failures})
	print(JSON.stringify({"test":"representative-musical-preparation","routes":rows,"failures":failures}))
	quit(0 if failures.is_empty() else 1)
func _write(path: String,value: Variant) -> void:
	var file := FileAccess.open(path,FileAccess.WRITE)
	file.store_string(JSON.stringify(value))
	file.close()
