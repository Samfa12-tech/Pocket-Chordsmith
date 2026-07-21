@tool
extends Control
class_name PCSMainScreen

const JsonImporter := preload("res://addons/pocket_chordsmith/import/pcs_json_importer.gd")
const ChartCompiler := preload("res://addons/pocket_chordsmith/import/pcs_chart_compiler.gd")
const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")
const TimelineView := preload("res://addons/pocket_chordsmith/editor/pcs_timeline_view.gd")
const SectionList := preload("res://addons/pocket_chordsmith/editor/pcs_section_list.gd")
const ImportReport := preload("res://addons/pocket_chordsmith/editor/pcs_import_report.gd")
const AudioBusTools := preload("res://addons/pocket_chordsmith/editor/pcs_audio_bus_tools.gd")
const SectionStemRenderer := preload("res://addons/pocket_chordsmith/editor/pcs_section_stem_renderer.gd")
const ChartBuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
const PushReceiver := preload("res://addons/pocket_chordsmith/editor/pcs_push_receiver.gd")

const POCKET_CHORDSMITH_URL := "https://samfa12.itch.io/pocket-chordsmith"
const WEB_KIT_PROFILE_PATH := "res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres"

var editor_interface: EditorInterface
var import_result: Dictionary = {}
var chart: PCSChartResource
var conductor: PocketChordsmithConductor

var _summary_label: Label
var _sequence_label: Label
var _position_label: Label
var _event_count_label: Label
var _track_summary_label: Label
var _status_label: Label
var _preview_diagnostics_label: Label
var _save_button: Button
var _render_preview_audio_button: Button
var _play_button: Button
var _stop_button: Button
var _timeline: PCSTimelineView
var _section_list: PCSSectionList
var _report: PCSImportReport
var _import_dialog: FileDialog
var _daw_pack_dialog: FileDialog
var _save_dialog: FileDialog
var _compile_folder_dialog: FileDialog
var _profile_save_dialog: FileDialog
var _paste_dialog: ConfirmationDialog
var _paste_text: TextEdit
var _push_receiver: PCSPushReceiver
var _drop_window: Window


func set_editor_interface(value: EditorInterface) -> void:
	editor_interface = value


func _ready() -> void:
	_build_ui()
	conductor = ConductorScript.new()
	conductor.name = "EditorPreviewConductor"
	conductor.process_mode = Node.PROCESS_MODE_ALWAYS
	conductor.beat.connect(_on_preview_beat)
	conductor.bar_started.connect(_on_preview_bar)
	conductor.section_started.connect(_on_preview_section)
	conductor.event_triggered.connect(_on_preview_event)
	add_child(conductor)
	_assign_default_preview_profile(false)
	_timeline.set_conductor(conductor)
	_start_push_receiver()
	_connect_file_drop_signal()
	_update_actions()


func _process(_delta: float) -> void:
	if _conductor_is_playing():
		_update_position_label()
		_update_preview_diagnostics_label()


func _exit_tree() -> void:
	if _push_receiver != null:
		_push_receiver.stop()
	if _drop_window != null and _drop_window.files_dropped.is_connected(_handle_dropped_files):
		_drop_window.files_dropped.disconnect(_handle_dropped_files)


func _build_ui() -> void:
	for child in get_children():
		child.queue_free()

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 10)
	add_child(root)

	var toolbar_scroll := ScrollContainer.new()
	toolbar_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toolbar_scroll.custom_minimum_size = Vector2(0, 46)
	root.add_child(toolbar_scroll)

	var toolbar := HBoxContainer.new()
	toolbar.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	toolbar.add_theme_constant_override("separation", 8)
	toolbar_scroll.add_child(toolbar)

	var title := Label.new()
	title.text = "Pocket Chordsmith"
	title.add_theme_font_size_override("font_size", 22)
	title.tooltip_text = "Pocket Chordsmith Godot importer, compiler, preview, and runtime chart tools."
	toolbar.add_child(title)

	_toolbar_button(
		toolbar,
		"Website",
		"Open the Pocket Chordsmith web app page in your browser.",
		_open_pocket_chordsmith_site
	)

	_toolbar_button(
		toolbar,
		"Import JSON",
		"Choose a Pocket Chordsmith JSON file or share-code text file from disk.",
		_open_import_dialog
	)

	_toolbar_button(
		toolbar,
		"Import DAW Pack",
		"Choose a Pocket DAW Godot Adaptive Pack ZIP, compile its embedded chart, and assign its rendered playback profile.",
		_open_daw_pack_dialog
	)

	_toolbar_button(
		toolbar,
		"Paste JSON/Code",
		"Paste raw Pocket Chordsmith JSON, a PCS1 share code, or the code copied by Pocket Chordsmith's Push to Godot action.",
		_open_paste_dialog
	)

	_toolbar_button(
		toolbar,
		"Compile Folder",
		"Compile every supported Pocket Chordsmith JSON file in a folder and save resources beside the sources.",
		_open_compile_folder_dialog
	)

	_toolbar_button(
		toolbar,
		"Create Chordsmith Audio Buses",
		"Safely create missing recommended Godot audio buses without overwriting existing buses.",
		_create_chordsmith_audio_buses
	)

	_toolbar_button(
		toolbar,
		"Reset Preview Mix",
		"Unmute Chordsmith music buses and remove effects from those buses for a dry Pocket Chordsmith preview check.",
		_reset_preview_mix
	)

	_toolbar_button(
		toolbar,
		"Playback Profile Template",
		"Generate a starter PCSPlaybackProfile with stem, sample, and bus fields.",
		_open_profile_save_dialog
	)

	_toolbar_button(
		toolbar,
		"Generate Preview Sound Kit",
		"Generate Pocket Chordsmith-style drum/stinger WAVs and a HYBRID playback profile.",
		_generate_web_sound_kit
	)

	_render_preview_audio_button = _toolbar_button(
		toolbar,
		"Render Preview Audio",
		"Render the imported chart into visible WAV stems, then assign the generated stem playback profile for Play Preview.",
		_render_preview_audio
	)

	_save_button = _toolbar_button(
		toolbar,
		"Save Chart Resource",
		"Save the currently imported chart as a compiled .tres or .res resource.",
		_open_save_dialog
	)

	_toolbar_button(
		toolbar,
		"Open Demo Scene",
		"Open the included runtime demo scene.",
		_open_demo_scene
	)

	_play_button = _toolbar_button(
		toolbar,
		"Play Preview",
		"Preview chart timing, sections, markers, and events in the editor.",
		_play_preview
	)

	_stop_button = _toolbar_button(
		toolbar,
		"Stop",
		"Stop the editor preview conductor.",
		_stop_preview
	)

	_status_label = Label.new()
	_status_label.text = "Import a Pocket Chordsmith JSON or Share Code file to begin."
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_status_label)

	_preview_diagnostics_label = Label.new()
	_preview_diagnostics_label.text = "Preview diagnostics: idle"
	_preview_diagnostics_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_preview_diagnostics_label)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	var left_scroll := ScrollContainer.new()
	left_scroll.custom_minimum_size = Vector2(330, 400)
	split.add_child(left_scroll)
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 10)
	left_scroll.add_child(left)

	_summary_label = Label.new()
	_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(_summary_label)

	_sequence_label = Label.new()
	_sequence_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(_sequence_label)

	_event_count_label = Label.new()
	_event_count_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(_event_count_label)

	_position_label = Label.new()
	_position_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(_position_label)

	_section_list = SectionList.new()
	_section_list.section_selected.connect(_jump_preview_to_section)
	left.add_child(_section_list)

	var right_scroll := ScrollContainer.new()
	right_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_child(right_scroll)
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	right_scroll.add_child(right)

	_timeline = TimelineView.new()
	_timeline.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_child(_timeline)

	_track_summary_label = Label.new()
	_track_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(_track_summary_label)

	_report = ImportReport.new()
	right.add_child(_report)

	_import_dialog = FileDialog.new()
	_import_dialog.title = "Import Pocket Chordsmith JSON"
	_import_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_import_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_import_dialog.filters = PackedStringArray(["*.json ; Pocket Chordsmith JSON", "*.txt ; Share Code or JSON Text", "* ; Any File"])
	_import_dialog.file_selected.connect(_import_file)
	add_child(_import_dialog)

	_daw_pack_dialog = FileDialog.new()
	_daw_pack_dialog.title = "Import Pocket DAW Godot Adaptive Pack"
	_daw_pack_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_daw_pack_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_daw_pack_dialog.use_native_dialog = true
	_daw_pack_dialog.filters = PackedStringArray(["*.zip ; Pocket DAW Pack ZIP", "*.json ; Godot Adaptive Manifest JSON", "*.* ; All Files"])
	_daw_pack_dialog.file_selected.connect(_import_daw_pack)
	add_child(_daw_pack_dialog)

	_save_dialog = FileDialog.new()
	_save_dialog.title = "Save Compiled Pocket Chordsmith Chart"
	_save_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_save_dialog.access = FileDialog.ACCESS_RESOURCES
	_save_dialog.filters = PackedStringArray(["*.tres ; Godot Text Resource", "*.res ; Godot Binary Resource"])
	_save_dialog.file_selected.connect(_save_chart_resource)
	add_child(_save_dialog)

	_compile_folder_dialog = FileDialog.new()
	_compile_folder_dialog.title = "Compile Pocket Chordsmith JSON Folder"
	_compile_folder_dialog.file_mode = FileDialog.FILE_MODE_OPEN_DIR
	_compile_folder_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_compile_folder_dialog.dir_selected.connect(_compile_folder)
	add_child(_compile_folder_dialog)

	_profile_save_dialog = FileDialog.new()
	_profile_save_dialog.title = "Save Pocket Chordsmith Playback Profile Template"
	_profile_save_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_profile_save_dialog.access = FileDialog.ACCESS_RESOURCES
	_profile_save_dialog.filters = PackedStringArray(["*.tres ; Godot Text Resource", "*.res ; Godot Binary Resource"])
	_profile_save_dialog.file_selected.connect(_save_playback_profile_template)
	add_child(_profile_save_dialog)

	_paste_dialog = ConfirmationDialog.new()
	_paste_dialog.title = "Paste Pocket Chordsmith JSON Or Share Code"
	_paste_dialog.min_size = Vector2i(760, 340)
	_paste_dialog.confirmed.connect(_import_pasted_text)
	add_child(_paste_dialog)
	var paste_root := VBoxContainer.new()
	paste_root.add_theme_constant_override("separation", 8)
	_paste_dialog.add_child(paste_root)
	var paste_hint := Label.new()
	paste_hint.text = "Paste raw JSON or a PCS1 share code from Pocket Chordsmith."
	paste_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	paste_root.add_child(paste_hint)
	_paste_text = TextEdit.new()
	_paste_text.custom_minimum_size = Vector2(720, 210)
	paste_root.add_child(_paste_text)


func _toolbar_button(parent: Control, text: String, tooltip: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.tooltip_text = tooltip
	# Keep native keyboard semantics: toolbar actions must remain reachable by
	# Tab/Shift+Tab and activate with Enter or Space in the Godot editor.
	button.focus_mode = Control.FOCUS_ALL
	button.set_meta(&"pcs_toolbar_action", true)
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func _open_import_dialog() -> void:
	_import_dialog.popup_file_dialog()


func _open_daw_pack_dialog() -> void:
	var downloads := OS.get_system_dir(OS.SYSTEM_DIR_DOWNLOADS)
	if not downloads.is_empty() and DirAccess.dir_exists_absolute(downloads):
		_daw_pack_dialog.current_dir = downloads
		_daw_pack_dialog.current_path = downloads
	_daw_pack_dialog.popup_file_dialog()


func _open_paste_dialog() -> void:
	if _paste_text != null:
		_paste_text.text = ""
	_paste_dialog.popup_centered(Vector2i(760, 340))


func _open_pocket_chordsmith_site() -> void:
	OS.shell_open(POCKET_CHORDSMITH_URL)


func _open_compile_folder_dialog() -> void:
	_compile_folder_dialog.popup_file_dialog()


func _open_profile_save_dialog() -> void:
	_profile_save_dialog.current_path = "res://addons/pocket_chordsmith/demos/pocket_chordsmith_playback_profile.tres"
	_profile_save_dialog.popup_file_dialog()


func _create_chordsmith_audio_buses() -> void:
	var tools = AudioBusTools.new()
	var result: Dictionary = tools.create_missing_recommended_buses(true, false)
	var created: Array = result.get("created", [])
	var updated_sends: Array = result.get("updated_sends", [])
	var warnings: Array = result.get("warnings", [])
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	if created.is_empty() and updated_sends.is_empty():
		_set_status("Chordsmith audio buses already exist. %s" % ("Warnings: %s" % str(warnings) if not warnings.is_empty() else ""))
	else:
		var changes := []
		if not created.is_empty():
			changes.append("created: %s" % ", ".join(created))
		if not updated_sends.is_empty():
			changes.append("routed: %s" % ", ".join(updated_sends))
		_set_status("Updated Chordsmith audio buses (%s). %s" % ["; ".join(changes), "Warnings: %s" % str(warnings) if not warnings.is_empty() else "Saved to default_bus_layout.tres."])


func _reset_preview_mix() -> void:
	var tools = AudioBusTools.new()
	var result: Dictionary = tools.reset_dry_preview_mix(true)
	var created: Array = result.get("created", [])
	var updated_sends: Array = result.get("updated_sends", [])
	var unmuted: Array = result.get("unmuted", [])
	var cleared_effects: Array = result.get("cleared_effects", [])
	var warnings: Array = result.get("warnings", [])
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	var changes := []
	if not created.is_empty():
		changes.append("created %d bus(es)" % created.size())
	if not updated_sends.is_empty():
		changes.append("routed %d bus(es)" % updated_sends.size())
	if not unmuted.is_empty():
		changes.append("unmuted %s" % ", ".join(unmuted))
	if not cleared_effects.is_empty():
		changes.append("removed %d effect(s)" % cleared_effects.size())
	if changes.is_empty():
		_set_status("Preview mix is already dry. %s" % ("Warnings: %s" % str(warnings) if not warnings.is_empty() else ""))
	else:
		_set_status("Reset Chordsmith preview mix: %s. %s" % ["; ".join(changes), "Warnings: %s" % str(warnings) if not warnings.is_empty() else "Saved to default_bus_layout.tres."])


func _open_save_dialog() -> void:
	if chart == null:
		_set_status("No compiled chart to save.")
		return
	var default_name := "pocket_chordsmith_chart.tres"
	if not chart.source_path.is_empty():
		default_name = "%s.tres" % chart.source_path.get_file().get_basename()
	_save_dialog.current_path = "res://addons/pocket_chordsmith/demos/%s" % default_name
	_save_dialog.popup_file_dialog()


func _compile_folder(path: String) -> void:
	var tools = ChartBuildTools.new()
	var result: Dictionary = tools.compile_folder(path, "", {
		"recursive": true,
		"save_beside_source": true,
	})
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	var compiled: Array = result.get("compiled", [])
	var errors: Array = result.get("errors", [])
	var warnings: Array = result.get("warnings", [])
	if not errors.is_empty():
		_set_status("Folder compile finished with %d error(s), %d warning(s), %d chart(s) saved." % [errors.size(), warnings.size(), compiled.size()])
	else:
		_set_status("Folder compile saved %d chart resource(s). %d warning(s)." % [compiled.size(), warnings.size()])


func _save_playback_profile_template(path: String) -> void:
	var save_path := path
	if save_path.get_extension().is_empty():
		save_path += ".tres"
	var tools = ChartBuildTools.new()
	var result: Dictionary = tools.create_playback_profile_template(save_path)
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	if bool(result.get("ok", false)):
		_set_status("Saved playback profile template to %s." % save_path)
	else:
		_set_status("Could not save playback profile template: %s" % str(result.get("errors", [])))


func _generate_web_sound_kit() -> void:
	var tools = ChartBuildTools.new()
	var result: Dictionary = tools.generate_web_sound_kit()
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	var samples: Dictionary = result.get("samples", {})
	var errors: Array = result.get("errors", [])
	var warnings: Array = result.get("warnings", [])
	if not errors.is_empty():
		_set_status("Could not generate sound kit: %s" % str(errors))
		return
	_assign_default_preview_profile(false)
	_set_status("Generated %d Pocket Chordsmith web-kit WAV(s) and profile %s. %s" % [
		samples.size(),
		str(result.get("profile_path", "")),
		"Warnings: %s" % str(warnings) if not warnings.is_empty() else "Preview will use this HYBRID profile.",
	])


func _render_preview_audio() -> void:
	if chart == null:
		_set_status("Import or load a chart before rendering preview audio.")
		return
	_stop_preview()
	conductor.chart = chart
	if not _assign_default_preview_profile(true):
		_set_status("Render needs a preview profile. Click Generate Preview Sound Kit, then try again.")
		return
	_render_preview_audio_button.disabled = true
	_play_button.disabled = true
	var renderer = SectionStemRenderer.new()
	var output_root := SectionStemRenderer.default_output_root(chart)
	var jobs: Array[Dictionary] = renderer.build_render_jobs(chart, output_root)
	if jobs.is_empty():
		_set_status("No playable section or full-song events were found to render.")
		_render_preview_audio_button.disabled = false
		_update_actions()
		return

	var full_stem_paths := {}
	var section_stem_sets := {}
	var warnings: Array = []
	var rendered_count := 0
	for index in range(jobs.size()):
		var job: Dictionary = jobs[index]
		_set_status("Rendering preview audio %d/%d: %s..." % [index + 1, jobs.size(), str(job.get("label", "stem"))])
		await get_tree().process_frame
		var result: Dictionary = renderer.render_job(chart, conductor.playback_profile, conductor, job)
		warnings.append_array(result.get("warnings", []))
		if not bool(result.get("ok", false)):
			_set_status("Preview audio render failed at %s: %s" % [str(job.get("label", "stem")), str(result.get("errors", []))])
			_render_preview_audio_button.disabled = false
			_update_actions()
			return
		rendered_count += 1
		var layer := str(job.get("layer", ""))
		var path := str(job.get("path", ""))
		if str(job.get("scope", "")) == "full":
			full_stem_paths[layer] = path
		else:
			var section_key := str(job.get("key", "section"))
			if not section_stem_sets.has(section_key):
				section_stem_sets[section_key] = {}
			(section_stem_sets[section_key] as Dictionary)[layer] = path

	_set_status("Preview audio render complete. Saving generated playback profile...")
	await get_tree().process_frame
	var rendered_profile := renderer.create_rendered_profile(conductor.playback_profile, full_stem_paths, section_stem_sets)
	var profile_path := SectionStemRenderer.profile_path_for_output_root(output_root)
	var save_error := ResourceSaver.save(rendered_profile, profile_path)
	if save_error != OK:
		_set_status("Rendered WAVs, but could not save playback profile: %s" % error_string(save_error))
		_render_preview_audio_button.disabled = false
		_update_actions()
		return
	conductor.set_playback_profile(rendered_profile, false)
	_render_preview_audio_button.disabled = false
	_update_actions()
	_set_status("Rendered %d preview WAV stem(s) into %s and assigned %s. Press Play Preview to hear cached stems. Godot import scan was skipped so the editor stays responsive.%s" % [
		rendered_count,
		output_root,
		profile_path,
		" Warnings: %s" % str(warnings.slice(0, 4)) if not warnings.is_empty() else "",
	])


func _import_file(path: String) -> void:
	_stop_preview()
	var importer = JsonImporter.new()
	import_result = importer.load_file(path)
	_compile_import_result(path)


func _handle_dropped_files(files: PackedStringArray) -> void:
	if not is_inside_tree() or not is_visible_in_tree():
		return
	for file_path in files:
		var path := str(file_path)
		if _is_daw_pack_candidate(path):
			_import_daw_pack(path)
			return
		if _is_chordsmith_import_candidate(path):
			_import_file(path)
			return
	_set_status("Drop a Pocket DAW pack ZIP, Godot adaptive manifest JSON, Pocket Chordsmith JSON, or PCS1 text file onto this tab.")


func _import_daw_pack(path: String) -> void:
	_stop_preview()
	var tools = ChartBuildTools.new()
	var result: Dictionary = tools.import_daw_game_pack(path)
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	var errors: Array = result.get("errors", [])
	var warnings: Array = result.get("warnings", [])
	if not errors.is_empty():
		_report.set_import_result({
			"ok": false,
			"errors": errors,
			"warnings": warnings,
			"report": {},
		})
		_set_status("DAW pack import failed. See the report for details.")
		return

	var chart_path := str(result.get("chart_path", ""))
	var profile_path := str(result.get("profile_path", ""))
	var loaded_chart := ResourceLoader.load(chart_path) if not chart_path.is_empty() else null
	if loaded_chart is PCSChartResource:
		chart = loaded_chart
		conductor.chart = chart
	var loaded_profile := ResourceLoader.load(profile_path) if not profile_path.is_empty() else null
	if loaded_profile is PCSPlaybackProfile:
		conductor.set_playback_profile(loaded_profile, false)

	var compiled: Array = result.get("compiled", [])
	var events := int(compiled[0].get("events", 0)) if not compiled.is_empty() else 0
	import_result = {
		"ok": true,
		"errors": [],
		"warnings": warnings,
		"report": {
			"source_path": result.get("source_project_path", path),
			"chart_path": chart_path,
			"profile_path": profile_path,
			"events": events,
		},
	}
	_report.set_import_result(import_result)
	_refresh_chart_views()
	_set_status("Imported DAW pack: %d events, chart %s, playback profile %s. Press Play Preview to hear the rendered pack audio." % [
		events,
		chart_path,
		profile_path,
	])


func _connect_file_drop_signal() -> void:
	_drop_window = get_window()
	if _drop_window != null and not _drop_window.files_dropped.is_connected(_handle_dropped_files):
		_drop_window.files_dropped.connect(_handle_dropped_files)


func _is_daw_pack_candidate(path: String) -> bool:
	var extension := path.get_extension().to_lower()
	if extension == "zip":
		return true
	if extension == "json":
		var file_name := path.get_file().to_lower()
		return file_name.find("godot-adaptive-manifest") >= 0 or file_name.find("game-pack-manifest") >= 0
	return false


func _is_chordsmith_import_candidate(path: String) -> bool:
	var extension := path.get_extension().to_lower()
	return extension == "json" or extension == "txt"


func _import_pasted_text() -> void:
	_stop_preview()
	var pasted := _paste_text.text if _paste_text != null else ""
	if pasted.strip_edges().is_empty():
		_set_status("Paste JSON, a PCS1 share code, or a Push to Godot code before importing.")
		return
	var importer = JsonImporter.new()
	import_result = importer.load_text(pasted, "pasted_json_or_share_code")
	_compile_import_result("pasted input")


func _import_pushed_song(code: String, source_label: String) -> Dictionary:
	_stop_preview()
	var importer = JsonImporter.new()
	import_result = importer.load_text(code, source_label)
	if not bool(import_result.get("ok", false)):
		_report.set_import_result(import_result)
		chart = null
		_set_status("Push to Godot import failed. See the report for details.")
		_refresh_chart_views()
		return {
			"ok": false,
			"error": "Import failed",
			"errors": import_result.get("errors", []),
			"warnings": import_result.get("warnings", []),
		}
	_compile_import_result(source_label)
	if editor_interface != null and editor_interface.has_method("set_main_screen_editor"):
		editor_interface.call("set_main_screen_editor", "Chordsmith")
	return {
		"ok": true,
		"message": "Imported and compiled in the Chordsmith tab",
		"bpm": chart.bpm if chart != null else 0,
		"key": chart.key if chart != null else "",
		"scale": chart.scale if chart != null else "",
		"sequence": chart.arrangement if chart != null else [],
		"event_count": chart.compiled_events.size() if chart != null else 0,
	}


func _compile_import_result(source_label: String) -> void:
	_report.set_import_result(import_result)
	if not bool(import_result.get("ok", false)):
		chart = null
		_set_status("Import failed. See the report for details.")
		_refresh_chart_views()
		return
	var compiler = ChartCompiler.new()
	chart = compiler.compile_project(import_result.get("project", {}), import_result)
	conductor.chart = chart
	_set_status("Imported and compiled %s." % source_label)
	_refresh_chart_views()


func _start_push_receiver() -> void:
	if _push_receiver != null:
		return
	_push_receiver = PushReceiver.new()
	_push_receiver.name = "BrowserPushReceiver"
	_push_receiver.import_callback = Callable(self, "_import_pushed_song")
	add_child(_push_receiver)
	var error := _push_receiver.start()
	if error != OK:
		_set_status("Direct Push to Godot receiver unavailable on localhost:%d: %s" % [PCSPushReceiver.DEFAULT_PORT, error_string(error)])


func _save_chart_resource(path: String) -> void:
	if chart == null:
		_set_status("No compiled chart to save.")
		return
	var save_path := path
	if save_path.get_extension().is_empty():
		save_path += ".tres"
	var error := ResourceSaver.save(chart, save_path)
	if error != OK:
		_set_status("Could not save chart: %s" % error_string(error))
		return
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
		editor_interface.select_file(save_path)
	_set_status("Saved compiled chart to %s." % save_path)


func _open_demo_scene() -> void:
	if editor_interface == null:
		_set_status("Editor interface is unavailable.")
		return
	var demo_path := "res://addons/pocket_chordsmith/demos/demo_music_level.tscn"
	if not ResourceLoader.exists(demo_path) and not FileAccess.file_exists(ProjectSettings.globalize_path(demo_path)):
		_set_status("Demo scene is missing: %s" % demo_path)
		return
	if editor_interface.has_method("open_scene_from_path"):
		var open_result = editor_interface.call("open_scene_from_path", demo_path)
		var error := OK if open_result == null else int(open_result)
		if error == OK:
			_set_status("Opened demo scene: %s" % demo_path)
			return
		_set_status("Could not open demo scene directly (%s). Selecting it in the FileSystem dock." % error_string(error))
	var filesystem := editor_interface.get_resource_filesystem()
	if filesystem != null:
		filesystem.scan()
	editor_interface.select_file(demo_path)


func _play_preview() -> void:
	if chart == null:
		_set_status("Import or load a chart before previewing.")
		return
	conductor.chart = chart
	conductor.loop_enabled = true
	if not _assign_default_preview_profile(true):
		_set_status("Preview timing is ready, but no audio profile is assigned. Click Generate Preview Sound Kit, then press Play Preview again.")
		return
	_ensure_preview_audio_buses()
	if conductor.playback_profile != null and conductor.playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.STEM_SYNC and conductor.playback_profile.stem_paths.is_empty() and conductor.playback_profile.stem_sets.is_empty():
		_set_status("Preview timing will play, but this profile is STEM_SYNC with no stems assigned.")
	conductor.play()
	_update_position_label()
	_update_preview_diagnostics_label()


func _stop_preview() -> void:
	if conductor != null:
		conductor.stop()
	_update_position_label()
	_update_preview_diagnostics_label()


func _jump_preview_to_section(section_id: String) -> void:
	if chart == null:
		return
	if not _conductor_is_playing():
		conductor.chart = chart
	conductor.jump_to_section(section_id)
	_update_position_label()


func _refresh_chart_views() -> void:
	_update_actions()
	_timeline.set_chart(chart)
	_section_list.set_chart(chart)
	_update_summary()
	_update_sequence()
	_update_event_counts()
	_update_track_summary()
	_update_position_label()


func _update_actions() -> void:
	var has_chart := chart != null
	if _save_button != null:
		_save_button.disabled = not has_chart
	if _render_preview_audio_button != null:
		_render_preview_audio_button.disabled = not has_chart
	if _play_button != null:
		_play_button.disabled = not has_chart
	if _stop_button != null:
		_stop_button.disabled = not has_chart


func _update_summary() -> void:
	if _summary_label == null:
		return
	if chart == null:
		_summary_label.text = "No chart loaded."
		return
	_summary_label.text = "Chart: %s bpm, %s/4, %s %s, resolution %s, length %s ticks" % [
		chart.bpm,
		chart.time_signature,
		chart.key,
		chart.scale,
		chart.resolution,
		chart.get_length_ticks(),
	]


func _update_sequence() -> void:
	if _sequence_label == null:
		return
	_sequence_label.text = "Sequence: %s" % (" -> ".join(chart.arrangement) if chart != null else "-")


func _update_event_counts() -> void:
	if _event_count_label == null:
		return
	if chart == null:
		_event_count_label.text = "Events: 0"
		return
	_event_count_label.text = "Events: %d  %s" % [chart.compiled_events.size(), str(chart.get_event_count_by_type())]


func _update_position_label() -> void:
	if _position_label == null:
		return
	if conductor == null or chart == null:
		_position_label.text = "Position: -"
		return
	_position_label.text = "Position: section %s  bar %d  beat %d  tick %d" % [
		conductor.current_section,
		conductor.current_bar,
		conductor.current_beat,
		conductor.current_tick,
	]


func _update_preview_diagnostics_label() -> void:
	if _preview_diagnostics_label == null:
		return
	if conductor == null:
		_preview_diagnostics_label.text = "Preview diagnostics: no conductor"
		return
	var diagnostics: Dictionary = conductor.get_diagnostics() if conductor.has_method("get_diagnostics") else {}
	if diagnostics.is_empty():
		_preview_diagnostics_label.text = "Preview diagnostics: unavailable"
		return
	var failures := int(diagnostics.get("sample_play_failures_total", 0))
	var skipped := int(diagnostics.get("sample_play_skipped_late_total", 0))
	var active_polyphony := int(diagnostics.get("active_polyphony", 0))
	var max_polyphony := int(diagnostics.get("max_polyphony", 0))
	var timing_mode := "wall" if bool(diagnostics.get("sample_preview_wall_clock_timing", false)) else "delta"
	var fallbacks_by_track: Dictionary = diagnostics.get("sample_preview_native_fallbacks_by_track", {}) if diagnostics.get("sample_preview_native_fallbacks_by_track", {}) is Dictionary else {}
	var cache_hits_by_track: Dictionary = diagnostics.get("sample_preview_native_cache_hits_by_track", {}) if diagnostics.get("sample_preview_native_cache_hits_by_track", {}) is Dictionary else {}
	var recent: Array = diagnostics.get("sample_preview_recent_native_fallbacks", []) if diagnostics.get("sample_preview_recent_native_fallbacks", []) is Array else []
	var recent_keys := []
	for index in range(min(4, recent.size())):
		var entry: Dictionary = recent[recent.size() - 1 - index] if recent[recent.size() - 1 - index] is Dictionary else {}
		recent_keys.append("%s@%s" % [str(entry.get("sample_key", "")), str(entry.get("tick", ""))])
	var state := "playing" if _conductor_is_playing() else "idle"
	_preview_diagnostics_label.text = "Preview diagnostics: %s/%s | voices %d/%d | play failures %d | skipped late %d | native hits %s | fallbacks %s | recent %s" % [
		state,
		timing_mode,
		active_polyphony,
		max_polyphony,
		failures,
		skipped,
		str(cache_hits_by_track),
		str(fallbacks_by_track),
		", ".join(recent_keys) if not recent_keys.is_empty() else "-",
	]


func _conductor_is_playing() -> bool:
	if conductor == null or not conductor.has_method("is_playing"):
		return false
	return bool(conductor.call("is_playing"))


func _update_track_summary() -> void:
	if _track_summary_label == null:
		return
	if chart == null:
		_track_summary_label.text = "Track Summary: -"
		return
	var lines := ["Track Summary"]
	var ids := chart.section_library.keys()
	ids.sort()
	for section_id in ids:
		var info: Dictionary = chart.section_library.get(section_id, {})
		var summary: Dictionary = info.get("track_summary", {})
		var bass: Dictionary = summary.get("bass", {})
		var guitar: Dictionary = summary.get("guitar", {})
		var melody: Array = summary.get("melody_tracks", [])
		var drums: Dictionary = summary.get("drums", {})
		lines.append("Section %s: drums %s, bass %d %s triggers, guitar %d %s events, melody tracks %d" % [
			str(section_id),
			str(drums),
			int(bass.get("triggers", 0)),
			str(bass.get("mode", "auto")),
			int(guitar.get("events", 0)),
			str(guitar.get("tone", "off")) if bool(guitar.get("enabled", false)) else "off",
			melody.size(),
		])
	_track_summary_label.text = "\n".join(lines)


func _on_preview_beat(_bar: int, _beat: int) -> void:
	_update_position_label()


func _on_preview_bar(_bar_index: int) -> void:
	_update_position_label()


func _on_preview_section(section_id: String) -> void:
	_set_status("Preview section %s." % section_id)
	_update_position_label()


func _on_preview_event(event: Dictionary) -> void:
	if str(event.get("track_type", "")) == "marker":
		_set_status("Marker: %s" % str(event.get("instrument_id", "")))


func _assign_default_preview_profile(update_status: bool) -> bool:
	if conductor == null:
		return false
	if conductor.playback_profile != null and not _profile_needs_preview_fallback(conductor.playback_profile):
		return true
	if not ResourceLoader.exists(WEB_KIT_PROFILE_PATH):
		return false
	var profile := ResourceLoader.load(WEB_KIT_PROFILE_PATH)
	if not (profile is PCSPlaybackProfile):
		return false
	conductor.set_playback_profile(profile, false)
	if update_status:
		_set_status("Using generated Pocket Chordsmith Web Sound Kit profile for preview.")
	return true


func _profile_needs_preview_fallback(profile: PCSPlaybackProfile) -> bool:
	if profile == null:
		return true
	if profile.playback_backend != PCSPlaybackProfile.PlaybackBackend.STEM_SYNC:
		return false
	return profile.stem_paths.is_empty() and profile.stem_sets.is_empty() and profile.drum_kit.is_empty() and profile.accent_streams.is_empty() and profile.event_sample_streams.is_empty()


func _ensure_preview_audio_buses() -> void:
	if conductor == null or conductor.playback_profile == null:
		return
	var required := [
		conductor.playback_profile.master_music_bus,
		conductor.playback_profile.drums_bus,
		conductor.playback_profile.bass_bus,
		conductor.playback_profile.chords_bus,
		conductor.playback_profile.guitar_bus,
		conductor.playback_profile.melody_bus,
		conductor.playback_profile.stingers_bus,
	]
	for bus_name in required:
		if AudioServer.get_bus_index(str(bus_name)) == -1:
			var tools = AudioBusTools.new()
			var result: Dictionary = tools.create_missing_recommended_buses(true, false)
			if editor_interface != null:
				editor_interface.get_resource_filesystem().scan()
			var warnings: Array = result.get("warnings", [])
			if not warnings.is_empty():
				_set_status("Preview created/reused Chordsmith audio buses. Warnings: %s" % str(warnings))
			return
	if conductor.playback_profile.guitar_preview_effects_enabled:
		var effect_tools = AudioBusTools.new()
		effect_tools.ensure_guitar_preview_effects(true)


func _set_status(text: String) -> void:
	if _status_label != null:
		_status_label.text = text
