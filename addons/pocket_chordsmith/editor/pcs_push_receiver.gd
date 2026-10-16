@tool
extends Node
class_name PCSPushReceiver

const DEFAULT_PORT := 9087
const PUSH_PATH := "/pocket-chordsmith/push-to-godot"
const HEALTH_PATH := "/pocket-chordsmith/health"
const MAX_BODY_BYTES := 1024 * 1024
const CLIENT_TIMEOUT_MS := 2500
const MIN_IMPORT_INTERVAL_MS := 750
const REPLAY_WINDOW_MS := 5 * 60 * 1000
const MAX_REPLAY_IDS := 128
const ALLOWED_HTTPS_ORIGINS := [
	"https://samfa12.com",
	"https://www.samfa12.com",
	"https://samfa12.itch.io",
	"https://html-classic.itch.zone",
]

var port := DEFAULT_PORT
var import_callback: Callable

var _server: TCPServer
var _clients: Array[Dictionary] = []
var _session_token := ""
var _last_import_ms := 0
var _recent_request_ids := {}
var _import_in_progress := false


func start() -> int:
	if _server != null and _server.is_listening():
		return OK
	_server = TCPServer.new()
	var error := _server.listen(port, "127.0.0.1")
	if error != OK:
		_server = null
		return error
	_session_token = Crypto.new().generate_random_bytes(32).hex_encode()
	_last_import_ms = 0
	_recent_request_ids.clear()
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
	_session_token = ""
	_recent_request_ids.clear()
	_import_in_progress = false


func is_active() -> bool:
	return _server != null and _server.is_listening()


func get_session_token() -> String:
	return _session_token


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
	var host := _get_header(header_text, "host")
	var origin := _get_header(header_text, "origin")
	if not _is_loopback_host(host):
		return _json_response(403, {"ok": false, "error": "Loopback Host header required"})
	if not _is_allowed_origin(origin):
		return _json_response(403, {"ok": false, "error": "Origin is not allowed"})

	if method == "OPTIONS":
		return _json_response(204, {}, origin, true)
	if method == "GET" and path == HEALTH_PATH:
		if not _has_valid_token(header_text):
			return _json_response(200, {"ok": true, "receiver": "available"}, origin)
		return _json_response(200, {"ok": true, "receiver": "authorized", "port": port, "path": PUSH_PATH}, origin)
	if method != "POST" or path != PUSH_PATH:
		return _json_response(404, {"ok": false, "error": "Pocket Chordsmith receiver path not found"}, origin)
	if not _has_valid_token(header_text):
		return _json_response(401, {"ok": false, "error": "Current receiver token required"}, origin)
	var request_id := _get_header(header_text, "x-pocket-audio-request-id").strip_edges()
	if request_id.is_empty() or request_id.length() > 128:
		return _json_response(400, {"ok": false, "error": "A bounded request ID is required"}, origin)
	_prune_replay_ids()
	if _recent_request_ids.has(request_id):
		return _json_response(409, {"ok": false, "error": "Replayed push request rejected"}, origin)
	var now := Time.get_ticks_msec()
	if _import_in_progress or (_last_import_ms > 0 and now - _last_import_ms < MIN_IMPORT_INTERVAL_MS):
		return _json_response(429, {"ok": false, "error": "Push receiver is busy; retry shortly"}, origin)
	_recent_request_ids[request_id] = now

	var payload = _parse_payload(header_text, body_text)
	if not (payload is Dictionary):
		return _json_response(400, {"ok": false, "error": "Push payload must be JSON or form data"}, origin)
	var code := str(payload.get("code", "")).strip_edges()
	if code.is_empty():
		return _json_response(400, {"ok": false, "error": "Push payload is missing code"}, origin)
	if not import_callback.is_valid():
		return _json_response(503, {"ok": false, "error": "Chordsmith importer is not ready"}, origin)

	_import_in_progress = true
	var result: Dictionary = import_callback.call(code, "browser Push to Godot")
	_import_in_progress = false
	_last_import_ms = Time.get_ticks_msec()
	var status := 200 if bool(result.get("ok", false)) else 422
	return _json_response(status, result, origin)


func _is_loopback_host(host_header: String) -> bool:
	var host := host_header.strip_edges().to_lower()
	return host == "localhost" or host.begins_with("localhost:") or host == "127.0.0.1" or host.begins_with("127.0.0.1:") or host == "[::1]" or host.begins_with("[::1]:")


func _is_allowed_origin(origin: String) -> bool:
	var value := origin.strip_edges().to_lower()
	if ALLOWED_HTTPS_ORIGINS.has(value):
		return true
	return value.begins_with("http://localhost:") or value == "http://localhost" \
		or value.begins_with("https://localhost:") or value == "https://localhost" \
		or value.begins_with("http://127.0.0.1:") or value == "http://127.0.0.1" \
		or value.begins_with("https://127.0.0.1:") or value == "https://127.0.0.1"


func _has_valid_token(header_text: String) -> bool:
	var authorization := _get_header(header_text, "authorization")
	return not _session_token.is_empty() and authorization == "Bearer %s" % _session_token


func _prune_replay_ids() -> void:
	var cutoff := Time.get_ticks_msec() - REPLAY_WINDOW_MS
	for request_id in _recent_request_ids.keys():
		if int(_recent_request_ids[request_id]) < cutoff:
			_recent_request_ids.erase(request_id)
	if _recent_request_ids.size() <= MAX_REPLAY_IDS:
		return
	var sorted_ids := _recent_request_ids.keys()
	sorted_ids.sort_custom(func(left, right): return int(_recent_request_ids[left]) < int(_recent_request_ids[right]))
	while sorted_ids.size() > MAX_REPLAY_IDS:
		_recent_request_ids.erase(sorted_ids.pop_front())


func _parse_payload(header_text: String, body_text: String):
	var content_type := _get_header(header_text, "content-type").to_lower()
	if content_type.begins_with("application/x-www-form-urlencoded"):
		return _parse_form_payload(body_text)
	if content_type.begins_with("text/plain"):
		return {"code": body_text.strip_edges()}
	var parser := JSON.new()
	var error := parser.parse(body_text)
	if error != OK:
		return null
	return parser.data


func _parse_form_payload(body_text: String) -> Dictionary:
	var payload := {}
	for pair in body_text.split("&", false):
		if pair.is_empty():
			continue
		var separator := pair.find("=")
		var key := pair if separator < 0 else pair.substr(0, separator)
		var value := "" if separator < 0 else pair.substr(separator + 1)
		payload[_decode_form_component(key)] = _decode_form_component(value)
	return payload


func _decode_form_component(value: String) -> String:
	return value.replace("+", " ").uri_decode()


func _get_header(header_text: String, header_name: String) -> String:
	var wanted := header_name.to_lower()
	for line in header_text.split("\r\n", false):
		var separator := line.find(":")
		if separator < 0:
			continue
		var key := line.substr(0, separator).strip_edges().to_lower()
		if key == wanted:
			return line.substr(separator + 1).strip_edges()
	return ""


func _get_content_length(header_text: String) -> int:
	for line in header_text.split("\r\n", false):
		var separator := line.find(":")
		if separator < 0:
			continue
		var key := line.substr(0, separator).strip_edges().to_lower()
		if key == "content-length":
			return max(0, int(line.substr(separator + 1).strip_edges()))
	return 0


func _json_response(status: int, body: Dictionary, origin := "", allow_private_network := false) -> String:
	var response_body := "" if status == 204 else JSON.stringify(body)
	var reason := _status_reason(status)
	var headers := [
		"HTTP/1.1 %d %s" % [status, reason],
		"Cache-Control: no-store",
		"Connection: close",
		"Content-Type: application/json",
		"Content-Length: %d" % response_body.to_utf8_buffer().size(),
		"",
		response_body,
	]
	if not str(origin).is_empty():
		headers.insert(1, "Vary: Origin")
		headers.insert(1, "Access-Control-Allow-Headers: Authorization, Content-Type, X-Pocket-Audio-Request-Id")
		headers.insert(1, "Access-Control-Allow-Methods: GET, POST, OPTIONS")
		headers.insert(1, "Access-Control-Allow-Origin: %s" % str(origin))
		if allow_private_network:
			headers.insert(1, "Access-Control-Allow-Private-Network: true")
	return "\r\n".join(headers)


func _status_reason(status: int) -> String:
	match status:
		200:
			return "OK"
		204:
			return "No Content"
		401:
			return "Unauthorized"
		403:
			return "Forbidden"
		400:
			return "Bad Request"
		404:
			return "Not Found"
		408:
			return "Request Timeout"
		409:
			return "Conflict"
		413:
			return "Payload Too Large"
		422:
			return "Unprocessable Entity"
		429:
			return "Too Many Requests"
		503:
			return "Service Unavailable"
		_:
			return "Error"
