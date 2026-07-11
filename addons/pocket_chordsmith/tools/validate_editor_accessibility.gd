@tool
extends SceneTree

const EXPECTED_TOOLBAR_ACTIONS := 14
const MAIN_SCREEN := preload("res://addons/pocket_chordsmith/editor/pcs_main_screen.tscn")


func _init() -> void:
	call_deferred(&"_validate")


func _validate() -> void:
	var screen := MAIN_SCREEN.instantiate()
	root.add_child(screen)
	await process_frame

	var toolbar_actions: Array[Button] = []
	for node in screen.find_children("*", "Button", true, false):
		if node is Button and node.has_meta(&"pcs_toolbar_action"):
			toolbar_actions.append(node as Button)

	if toolbar_actions.size() != EXPECTED_TOOLBAR_ACTIONS:
		_fail(
			"Expected %d tagged toolbar actions, found %d."
			% [EXPECTED_TOOLBAR_ACTIONS, toolbar_actions.size()]
		)
		return

	for button in toolbar_actions:
		if button.focus_mode != Control.FOCUS_ALL:
			_fail("Toolbar action '%s' is not keyboard-focusable." % button.text)
			return
		if button.text.strip_edges().is_empty():
			_fail("A toolbar action has no visible accessible name.")
			return
		if button.tooltip_text.strip_edges().is_empty():
			_fail("Toolbar action '%s' has no explanatory tooltip." % button.text)
			return

	print(
		"Pocket Chordsmith editor accessibility OK: %d toolbar actions are named, explained, and FOCUS_ALL."
		% toolbar_actions.size()
	)
	quit(0)


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
