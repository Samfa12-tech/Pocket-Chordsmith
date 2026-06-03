@tool
extends Node
class_name PCSPushReceiver

const DEFAULT_PORT := 9087
const PUSH_PATH := "/pocket-chordsmith/push-to-godot"
const HEALTH_PATH := "/pocket-chordsmith/health"
const MAX_BODY_BYTES := 1024 * 1024
const CLIENT_TIMEOUT_MS := 2500

var port := DEFAULT_PORT
var import_callback: Callable

var _server: TCPServer
var _clients: Array[Dictionary] = []


func start() -> int:
	if _server != null and _server.is_listening():
		return OK
	_server = TCPServer.new()
	var error := _server.listen(port, "127.0.0.1")
	if error != OK:
		_server = null
		return error
	set_process(true)
	return OK


func stop() -> void:
	set_process(false)
	for client in _clients:
		var peer: StreamPeerTCP = client.get("peer", null)
		if peer != null:
			peer.disconnect_from_host()
	_clients.clear()
	if _server != null:
		_server.stop()
	_server = null


func _exit_tree() -> void:
	stop()


func _process(_delta: float) -> void:
	if _server == null or not _server.is_listening():
		return
	while _server.is_connection_available():
		var peer := _server.take_connection()
		if peer != null:
			_clients.append({
				"peer": peer,
				"buffer": PackedByteArray(),
				"started_ms": Time.get_ticks_msec(),
			})
	_poll_clients()


func _poll_clients() -> void:
	for index in range(_clients.size() - 1, -1, -1):
		var client := _clients[index]
		var peer: StreamPeerTCP = client.get("peer", null)
		if peer == null:
			_clients.remove_at(index)
			continue
		peer.poll()
		var available := peer.get_available_bytes()
		if available > 0:
			var read_result := peer.get_data(available)
			if int(read_result[0]) == OK:
				var buffer: PackedByteArray = client.get("buffer", PackedByteArray())
				buffer.append_array(read_result[1])
				client["buffer"] = buffer
		var response := _try_build_response(client)
		if not response.is_empty():
			peer.put_data(response.to_utf8_buffer())
			peer.disconnect_from_host()
			_clients.remove_at(index)
		elif Time.get_ticks_msec() - int(client.get("started_ms", 0)) > CLIENT_TIMEOUT_MS:
			peer.put_data(_json_response(408, {"ok": false, "error": "Request timed out"}).to_utf8_buffer())
			peer.disconnect_from_host()
			_clients.remove_at(index)


func _try_build_response(client: Dictionary) -> String:
	var buffer: PackedByteArray = client.get("buffer", PackedByteArray())
	if buffer.is_empty():
		return ""
	if buffer.size() > MAX_BODY_BYTES:
		return _json_response(413, {"ok": false, "error": "Push payload is too large"})
	var request_text := buffer.get_string_from_utf8()
	var header_end := request_text.find("\r\n\r\n")
	if header_end < 0:
		return ""
	var header_text := request_text.substr(0, header_end)
	var content_length := _get_content_length(header_text)
	var body_start := header_end + 4
	if buffer.size() < body_start + content_length:
		return ""
	var body_text := request_text.substr(body_start, content_length)
	return _handle_request(header_text, body_text)


func _handle_request(header_text: String, body_text: String) -> String:
	var first_line := header_text.split("\r\n", false)[0]
	var parts := first_line.split(" ", false)
	if parts.size() < 2:
		return _json_response(400, {"ok": false, "error": "Malformed HTTP request"})
	var method := str(parts[0]).to_upper()
	var path := str(parts[1]).split("?", false)[0]

	if method == "OPTIONS":
		return _json_response(204, {})
	if method == "GET" and path == HEALTH_PATH:
		return _json_response(200, {
			"ok": true,
			"name": "Pocket Chordsmith Godot receiver",
			"port": port,
			"path": PUSH_PATH,
		})
	if method != "POST" or path != PUSH_PATH:
		return _json_response(404, {"ok": false, "error": "Pocket Chordsmith receiver path not found"})

	var parser := JSON.new()
	var error := parser.parse(body_text)
	if error != OK:
		return _json_response(400, {"ok": false, "error": "Push payload must be JSON"})
	var payload = parser.data
	if not (payload is Dictionary):
		return _json_response(400, {"ok": false, "error": "Push payload must be a JSON object"})
	var code := str(payload.get("code", "")).strip_edges()
	if code.is_empty():
		return _json_response(400, {"ok": false, "error": "Push payload is missing code"})
	if not import_callback.is_valid():
		return _json_response(503, {"ok": false, "error": "Chordsmith importer is not ready"})

	var result: Dictionary = import_callback.call(code, "browser Push to Godot")
	var status := 200 if bool(result.get("ok", false)) else 422
	return _json_response(status, result)


func _get_content_length(header_text: String) -> int:
	for line in header_text.split("\r\n", false):
		var separator := line.find(":")
		if separator < 0:
			continue
		var key := line.substr(0, separator).strip_edges().to_lower()
		if key == "content-length":
			return max(0, int(line.substr(separator + 1).strip_edges()))
	return 0


func _json_response(status: int, body: Dictionary) -> String:
	var response_body := "" if status == 204 else JSON.stringify(body)
	var reason := _status_reason(status)
	var headers := [
		"HTTP/1.1 %d %s" % [status, reason],
		"Access-Control-Allow-Origin: *",
		"Access-Control-Allow-Methods: GET, POST, OPTIONS",
		"Access-Control-Allow-Headers: Content-Type",
		"Access-Control-Allow-Private-Network: true",
		"Cache-Control: no-store",
		"Connection: close",
		"Content-Type: application/json",
		"Content-Length: %d" % response_body.to_utf8_buffer().size(),
		"",
		response_body,
	]
	return "\r\n".join(headers)


func _status_reason(status: int) -> String:
	match status:
		200:
			return "OK"
		204:
			return "No Content"
		400:
			return "Bad Request"
		404:
			return "Not Found"
		408:
			return "Request Timeout"
		413:
			return "Payload Too Large"
		422:
			return "Unprocessable Entity"
		503:
			return "Service Unavailable"
		_:
			return "Error"
