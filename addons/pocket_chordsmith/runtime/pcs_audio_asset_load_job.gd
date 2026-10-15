extends Node
## A short-lived loading-scene job owns and drains one threaded resource request.
## It lives under the scene root so freeing a conductor cannot abandon the job.

signal completed(stream: AudioStream)

var asset_path := ""
var _request_error := OK
var _consumer_completed := false

func _ready() -> void:
	_request_error = ResourceLoader.load_threaded_request(asset_path, "AudioStream", false)

func _process(_delta: float) -> void:
	if _request_error != OK:
		_finish(null)
		return
	var status := ResourceLoader.load_threaded_get_status(asset_path)
	if status == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		return
	# Never call get before completion: that would block the gameplay thread.
	var stream: AudioStream = null
	if status == ResourceLoader.THREAD_LOAD_LOADED:
		stream = ResourceLoader.load_threaded_get(asset_path) as AudioStream
	elif status == ResourceLoader.THREAD_LOAD_FAILED:
		# Consume the failed request as well; no result is promoted into a cache.
		ResourceLoader.load_threaded_get(asset_path)
	_finish(stream)

func _finish(stream: AudioStream) -> void:
	set_process(false)
	if not _consumer_completed:
		_consumer_completed = true
		completed.emit(stream)
	queue_free()

func detach_consumer() -> void:
	# Finish its await while the conductor is still alive. The root-owned job
	# continues draining I/O, without retaining or calling the old consumer.
	if not _consumer_completed:
		_consumer_completed = true
		completed.emit(null)
