@tool
extends Node
## Root-owned, cancellable first-frame yield before any preparation I/O.
## Complete while the consumer still exists during cancellation/exit, rather
## than leave its coroutine waiting on SceneTree after that consumer is freed.

signal completed

var _completed := false

func _ready() -> void:
	get_tree().process_frame.connect(_finish, CONNECT_ONE_SHOT)

func _finish() -> void:
	if _completed:
		return
	_completed = true
	if is_inside_tree() and get_tree().process_frame.is_connected(_finish):
		get_tree().process_frame.disconnect(_finish)
	completed.emit()
	queue_free()

func detach_consumer() -> void:
	_finish()
