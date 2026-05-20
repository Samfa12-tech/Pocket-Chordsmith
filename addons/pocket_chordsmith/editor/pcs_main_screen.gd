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
const ChartBuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")

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
var _save_button: Button
var _play_button: Button
var _stop_button: Button
var _timeline: PCSTimelineView
var _section_list: PCSSectionList
var _report: PCSImportReport
var _import_dialog: FileDialog
var _save_dialog: FileDialog
var _compile_folder_dialog: FileDialog
var _profile_save_dialog: FileDialog
var _paste_dialog: ConfirmationDialog
var _paste_text: TextEdit


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
	_update_actions()


func _process(_delta: float) -> void:
	if conductor != null and conductor.is_playing():
		_update_position_label()


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
		"Paste JSON/Code",
		"Paste raw Pocket Chordsmith JSON or a PCS1 share code and compile it immediately.",
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
		"Playback Profile Template",
		"Generate a starter PCSPlaybackProfile with stem, sample, and bus fields.",
		_open_profile_save_dialog
	)

	_toolbar_button(
		toolbar,
		"Generate Web Sound Kit",
		"Generate Pocket Chordsmith-style drum/stinger WAVs and a HYBRID playback profile.",
		_generate_web_sound_kit
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
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func _open_import_dialog() -> void:
	_import_dialog.popup_file_dialog()


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
	var result: Dictionary = tools.create_missing_recommended_buses(true)
	var created: Array = result.get("created", [])
	var warnings: Array = result.get("warnings", [])
	if editor_interface != null:
		editor_interface.get_resource_filesystem().scan()
	if created.is_empty():
		_set_status("Chordsmith audio buses already exist. %s" % ("Warnings: %s" % str(warnings) if not warnings.is_empty() else ""))
	else:
		_set_status("Created Chordsmith audio buses: %s. %s" % [", ".join(created), "Warnings: %s" % str(warnings) if not warnings.is_empty() else "Saved to default_bus_layout.tres."])


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


func _import_file(path: String) -> void:
	_stop_preview()
	var importer = JsonImporter.new()
	import_result = importer.load_file(path)
	_compile_import_result(path)


func _import_pasted_text() -> void:
	_stop_preview()
	var pasted := _paste_text.text if _paste_text != null else ""
	if pasted.strip_edges().is_empty():
		_set_status("Paste JSON or a PCS1 share code before importing.")
		return
	var importer = JsonImporter.new()
	import_result = importer.load_text(pasted, "pasted_json_or_share_code")
	_compile_import_result("pasted input")


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
	editor_interface.open_scene_from_path("res://addons/pocket_chordsmith/demos/demo_music_level.tscn")


func _play_preview() -> void:
	if chart == null:
		_set_status("Import or load a chart before previewing.")
		return
	conductor.chart = chart
	conductor.loop_enabled = true
	if not _assign_default_preview_profile(true):
		_set_status("Preview timing is ready, but no audio profile is assigned. Click Generate Web Sound Kit, then press Play Preview again.")
		return
	_ensure_preview_audio_buses()
	if conductor.playback_profile != null and conductor.playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.STEM_SYNC and conductor.playback_profile.stem_paths.is_empty() and conductor.playback_profile.stem_sets.is_empty():
		_set_status("Preview timing will play, but this profile is STEM_SYNC with no stems assigned.")
	conductor.play()
	_update_position_label()


func _stop_preview() -> void:
	if conductor != null:
		conductor.stop()
	_update_position_label()


func _jump_preview_to_section(section_id: String) -> void:
	if chart == null:
		return
	if not conductor.is_playing():
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
		var melody: Array = summary.get("melody_tracks", [])
		var drums: Dictionary = summary.get("drums", {})
		lines.append("Section %s: drums %s, bass %d %s triggers, melody tracks %d" % [
			str(section_id),
			str(drums),
			int(bass.get("triggers", 0)),
			str(bass.get("mode", "auto")),
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
	conductor.playback_profile = profile
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
		conductor.playback_profile.melody_bus,
		conductor.playback_profile.stingers_bus,
	]
	for bus_name in required:
		if AudioServer.get_bus_index(str(bus_name)) == -1:
			var tools = AudioBusTools.new()
			var result: Dictionary = tools.create_missing_recommended_buses(true)
			if editor_interface != null:
				editor_interface.get_resource_filesystem().scan()
			var warnings: Array = result.get("warnings", [])
			if not warnings.is_empty():
				_set_status("Preview created/reused Chordsmith audio buses. Warnings: %s" % str(warnings))
			return


func _set_status(text: String) -> void:
	if _status_label != null:
		_status_label.text = text
