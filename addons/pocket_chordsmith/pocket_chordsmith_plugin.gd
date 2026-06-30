@tool
extends EditorPlugin

const MainScreenScene := preload("res://addons/pocket_chordsmith/editor/pcs_main_screen.tscn")
const ChartResourceScript := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const SectionResourceScript := preload("res://addons/pocket_chordsmith/resources/pcs_section_resource.gd")
const EventResourceScript := preload("res://addons/pocket_chordsmith/resources/pcs_event_resource.gd")
const PlaybackProfileScript := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const ConductorScript := preload("res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd")

var _main_screen: Control


func _enter_tree() -> void:
	add_custom_type("PCSChartResource", "Resource", ChartResourceScript, null)
	add_custom_type("PCSSectionResource", "Resource", SectionResourceScript, null)
	add_custom_type("PCSEventResource", "Resource", EventResourceScript, null)
	add_custom_type("PCSPlaybackProfile", "Resource", PlaybackProfileScript, null)
	add_custom_type("PocketChordsmithConductor", "Node", ConductorScript, null)

	_main_screen = MainScreenScene.instantiate()
	_main_screen.name = "Chordsmith"
	if _main_screen.has_method("set_editor_interface"):
		_main_screen.call("set_editor_interface", get_editor_interface())
	get_editor_interface().get_editor_main_screen().add_child(_main_screen)
	_main_screen.hide()


func _exit_tree() -> void:
	if is_instance_valid(_main_screen):
		_main_screen.queue_free()
	_main_screen = null

	remove_custom_type("PocketChordsmithConductor")
	remove_custom_type("PCSPlaybackProfile")
	remove_custom_type("PCSEventResource")
	remove_custom_type("PCSSectionResource")
	remove_custom_type("PCSChartResource")


func _has_main_screen() -> bool:
	return true


func _make_visible(visible: bool) -> void:
	if is_instance_valid(_main_screen):
		_main_screen.visible = visible


func _get_plugin_name() -> String:
	return "Chordsmith"


func _get_plugin_icon() -> Texture2D:
	return get_editor_interface().get_editor_theme().get_icon("AudioStreamPlayer", "EditorIcons")
