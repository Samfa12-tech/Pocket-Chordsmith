@tool
extends Node
## A short-lived loading-scene job owns and drains one background resource read.
## It lives under the scene root so freeing a conductor cannot abandon the job.

const PreparedWav := preload("res://addons/pocket_chordsmith/runtime/pcs_prepared_wav.gd")

class AudioReader:
	extends RefCounted
	var path := ""
	var result: AudioStream
	var source_stream: AudioStream
	var prepare_wav_endings := false
	var loop_sections := false
	var output_mix_rate := 48000
	var prepared_cacheable := false
	var prepared_is_copy := false
	var preparation_warning := ""
	var worker_prepare_us := 0
	func read_stream() -> void:
		result = source_stream if source_stream != null else ResourceLoader.load(path, "AudioStream") as AudioStream
		if result != null and prepare_wav_endings:
			var started := Time.get_ticks_usec()
			var prepared := PreparedWav.prepare(result, loop_sections, output_mix_rate)
			prepared_is_copy = prepared.stream != result
			result = prepared.stream
			prepared_cacheable = prepared.cache_prepared
			preparation_warning = prepared.warning
			worker_prepare_us = Time.get_ticks_usec() - started

signal completed(stream: AudioStream)

var asset_path := ""
var source_stream: AudioStream
var prepare_wav_endings := false
var loop_sections := false
var output_mix_rate := 48000
var prepared_cacheable := false
var prepared_is_copy := false
var preparation_warning := ""
var worker_prepare_us := 0
var _request_error := OK
var _consumer_completed := false
var _task_id := -1
var _reader: AudioReader
var _exiting := false

func _ready() -> void:
	_reader = _create_reader()
	_reader.path = asset_path
	_reader.source_stream = source_stream
	_reader.prepare_wav_endings = prepare_wav_endings
	_reader.loop_sections = loop_sections
	_reader.output_mix_rate = output_mix_rate
	_task_id = WorkerThreadPool.add_task(_reader.read_stream, false, "Pocket audio resource read")
	_request_error = FAILED if _task_id < 0 else OK

func _create_reader() -> AudioReader:
	return AudioReader.new()

func _process(_delta: float) -> void:
	if _request_error != OK:
		_finish(null)
		return
	if is_worker_active():
		return
	# Join only a completed read during normal processing. The worker is a
	# RefCounted reader, never a scene node or a reference to the consumer.
	_finish(_drain_worker())

func _drain_worker() -> AudioStream:
	var stream: AudioStream = null
	if _task_id >= 0:
		if WorkerThreadPool.wait_for_task_completion(_task_id) == OK:
			stream = _reader.result
			prepared_cacheable = _reader.prepared_cacheable
			prepared_is_copy = _reader.prepared_is_copy
			preparation_warning = _reader.preparation_warning
			worker_prepare_us = _reader.worker_prepare_us
	_task_id = -1
	_reader = null
	return stream

func _exit_tree() -> void:
	_exiting = true
	detach_consumer()
	# Root-owned jobs survive consumer/scene removal. If the job itself exits
	# (including whole-tree shutdown), finish its owned task before release.
	_drain_worker()

func was_detached() -> bool:
	return _exiting

func is_worker_active() -> bool:
	return _task_id >= 0 and not WorkerThreadPool.is_task_completed(_task_id)

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
