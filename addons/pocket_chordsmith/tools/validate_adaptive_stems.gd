@tool
extends SceneTree

const GamePackManifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")
const BuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
const JsonImporter := preload("res://addons/pocket_chordsmith/import/pcs_json_importer.gd")
const ChartCompiler := preload("res://addons/pocket_chordsmith/import/pcs_chart_compiler.gd")
const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const ProfileScript := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const ChartScript := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")

var _errors: Array[String] = []


func _init() -> void:
	_test_profile_section_stems()
	_test_game_pack_manifest()
	_test_game_pack_zip_import()
	_test_pcs1_import_compiles()
	_test_conductor_section_switch()
	_test_profile_serialization()
	_test_docs()
	for error in _errors:
		push_error(error)
	print("Pocket Chordsmith adaptive stem validation: %s" % ("OK" if _errors.is_empty() else "FAILED"))
	quit(0 if _errors.is_empty() else 1)


func _test_profile_section_stems() -> void:
	var profile = ProfileScript.new()
	profile.set_section_stems("01_A", {
		"Drums": "res://missing/A_drums.wav",
		"lead": "res://missing/A_melody.ogg",
	})
	profile.set_section_stems("section_B", {"bassline": "res://missing/B_bass.wav"})
	_assert(profile.has_section_stems("A"), "Profile should resolve section A aliases.")
	_assert(profile.get_section_stems("A").has("melody"), "Lead should normalize to melody.")
	_assert(profile.get_section_stems("02_B").has("bass"), "Section B and bass aliases should normalize.")


func _test_game_pack_manifest() -> void:
	var manifest := {
		"sections": {
			"A": {"assets": {"drums": "stems/A_drums.wav", "lead": "stems/A_lead.ogg"}},
			"03_B": {"assets": {"bassline": "stems/B_bass.ogg"}},
		},
		"sectionLoops": [{"section": "C", "path": "sections/C_full.ogg"}],
		"states": {"combat": {"stems": {"drums": "states/combat_drums.wav"}}},
	}
	var result: Dictionary = GamePackManifest.create_playback_profile_from_manifest(manifest, "res://music/game_pack")
	var profile = result.get("profile", null)
	_assert(profile != null, "Game pack manifest should return a playback profile.")
	_assert(profile != null and profile.get_section_stems("A").get("melody", "") == "res://music/game_pack/stems/A_lead.ogg", "Importer should map section melody OGG stems.")
	_assert(profile != null and profile.get_section_stems("B").has("bass"), "Importer should map aliased section B stems.")
	_assert(profile != null and profile.get_section_stems("C").has("full"), "Importer should map section loop assets.")
	_assert(profile != null and profile.get_state_stems("combat").has("drums"), "Importer should map state stem sets.")


func _test_game_pack_zip_import() -> void:
	var zip_path := "user://pcs_game_pack_validation.zip"
	var output_root := "res://__pcs_validation_pack"
	var manifest := {
		"sections": {
			"A": {"assets": {"drums": "stems/A_drums.wav", "lead": "stems/A_lead.ogg"}},
		},
		"states": {"combat": {"stems": {"bass": "states/combat_bass.wav"}}},
		"project": _demo_project_fixture(),
	}
	var zip_error := _write_game_pack_zip(zip_path, manifest, false)
	_assert(zip_error == OK, "Validation game-pack ZIP should be writable.")
	var tools = BuildTools.new()
	var result: Dictionary = tools.import_daw_game_pack(zip_path, output_root)
	var profile = result.get("profile", null)
	_assert(bool(result.get("ok", false)), "Game-pack ZIP import should succeed.")
	_assert(profile != null and profile.get_section_stems("A").has("melody"), "ZIP import should build section_stem_sets from prepared stems.")
	_assert(not str(result.get("chart_path", "")).is_empty(), "ZIP import should compile embedded Pocket Chordsmith source.")
	_assert(FileAccess.file_exists(ProjectSettings.globalize_path(output_root.path_join("pcs_game_pack_validation/stems/A_drums.wav"))), "ZIP import should extract prepared WAV stems into res://.")
	var unsafe_zip := "user://pcs_game_pack_unsafe_validation.zip"
	zip_error = _write_game_pack_zip(unsafe_zip, manifest, true)
	_assert(zip_error == OK, "Unsafe validation ZIP should be writable.")
	var unsafe_result: Dictionary = tools.import_daw_game_pack(unsafe_zip, output_root.path_join("unsafe"))
	_assert(not bool(unsafe_result.get("ok", true)) and str(unsafe_result.get("errors", [])).find("Unsafe path") >= 0, "Game-pack ZIP import should reject path traversal.")


func _test_pcs1_import_compiles() -> void:
	var json_text := FileAccess.get_file_as_string("res://addons/pocket_chordsmith/demos/demo_pocket_chordsmith_project.json")
	_assert(not json_text.is_empty(), "Demo JSON fixture should exist for PCS1 validation.")
	var share_code := "PCS1:%s" % Marshalls.utf8_to_base64(json_text)
	var importer = JsonImporter.new()
	var import_result: Dictionary = importer.load_text(share_code, "generated_demo_fixture.pcs1")
	_assert(bool(import_result.get("ok", false)), "PCS1 share code should import through PCSJsonImporter.")
	var compiler = ChartCompiler.new()
	var chart = compiler.compile_project(import_result.get("project", {}), import_result)
	_assert(chart != null and chart.compiled_events.size() > 0, "PCS1 share code should compile into chart events.")


func _test_conductor_section_switch() -> void:
	var chart = ChartScript.new()
	chart.bpm = 120
	chart.time_signature = 4
	chart.ticks_per_quarter = ChartScript.TICKS_PER_QUARTER
	var arrangement: Array[String] = ["A", "B"]
	var arrangement_positions: Array[Dictionary] = [
		{"id": "A", "arrangement_index": 0, "start_tick": 0, "length_ticks": 1920, "bars": 1},
		{"id": "B", "arrangement_index": 1, "start_tick": 1920, "length_ticks": 1920, "bars": 1},
	]
	chart.arrangement = arrangement
	chart.arrangement_positions = arrangement_positions
	var profile = ProfileScript.new()
	profile.use_audio_stream_synchronized = false
	profile.sample_preview_enabled = false
	profile.set_section_stems("A", {"drums": "res://missing/A_drums.wav"})
	profile.set_section_stems("B", {"drums": "res://missing/B_drums.wav", "bass": "res://missing/B_bass.ogg"})
	var conductor = ConductorScript.new()
	root.add_child(conductor)
	conductor.chart = chart
	conductor.playback_profile = profile
	conductor.play()
	conductor.queue_section("B", ConductorScript.TransitionBoundary.IMMEDIATE)
	_assert(conductor.current_section == "B", "queue_section(\"B\", IMMEDIATE) should switch chart section.")
	_assert(conductor.active_stem_map().get("drums", "") == "res://missing/B_drums.wav", "queue_section(\"B\") should resolve B's stem map.")
	var prewarm := conductor.prewarm_audio()
	_assert(not bool(prewarm.get("ok", true)) and int(prewarm.get("failed", 0)) > 0, "prewarm_audio should report missing prepared assets.")
	conductor.set_layer_volume("drums", -6.0)
	conductor.set_stem_volume("drums", -6.0)
	conductor.mute_layer("bass", true)
	conductor.mute_stem("bass", true)
	conductor.queue_free()


func _test_profile_serialization() -> void:
	var profile = ProfileScript.new()
	profile.set_section_stems("A", {"drums": "res://missing/A_drums.wav"})
	var path := "user://pcs_adaptive_profile_test.tres"
	var save_error := ResourceSaver.save(profile, path)
	_assert(save_error == OK, "Profile serialization should save.")
	var loaded = ResourceLoader.load(path)
	_assert(loaded != null and loaded.get_section_stems("A").has("drums"), "Profile serialization should preserve section_stem_sets.")


func _test_docs() -> void:
	var stem_doc := FileAccess.get_file_as_string("res://addons/pocket_chordsmith/docs/STEM_WORKFLOW.md")
	var readme := FileAccess.get_file_as_string("res://addons/pocket_chordsmith/README.md")
	_assert(stem_doc.find("prepared") >= 0 and stem_doc.find("Preview") >= 0, "STEM_WORKFLOW should mention prepared and preview paths.")
	_assert(readme.find("section_stem_sets") >= 0, "README should mention section_stem_sets.")


func _assert(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)


func _demo_project_fixture() -> Dictionary:
	var text := FileAccess.get_file_as_string("res://addons/pocket_chordsmith/demos/demo_pocket_chordsmith_project.json")
	var parser := JSON.new()
	if parser.parse(text) != OK or not (parser.data is Dictionary):
		return {}
	return parser.data


func _write_game_pack_zip(zip_path: String, manifest: Dictionary, unsafe := false) -> int:
	var absolute_zip := ProjectSettings.globalize_path(zip_path)
	if FileAccess.file_exists(absolute_zip):
		DirAccess.remove_absolute(absolute_zip)
	var packer := ZIPPacker.new()
	var error := packer.open(absolute_zip, ZIPPacker.APPEND_CREATE)
	if error != OK:
		return error
	_zip_write_text(packer, "manifest.json", JSON.stringify(manifest))
	_zip_write_text(packer, "stems/A_drums.wav", "dummy wav bytes")
	_zip_write_text(packer, "stems/A_lead.ogg", "dummy ogg bytes")
	_zip_write_text(packer, "states/combat_bass.wav", "dummy wav bytes")
	if unsafe:
		_zip_write_text(packer, "../escape.wav", "nope")
	packer.close()
	return OK


func _zip_write_text(packer: ZIPPacker, path: String, text: String) -> void:
	if packer.start_file(path) != OK:
		return
	packer.write_file(text.to_utf8_buffer())
	packer.close_file()
