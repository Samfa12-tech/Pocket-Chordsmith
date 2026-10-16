@tool
extends SceneTree

const PushReceiver := preload("res://addons/pocket_chordsmith/editor/pcs_push_receiver.gd")
const BuildTools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
const GamePackManifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")

var _failures := []
var _import_count := 0


func _init() -> void:
	_test_receiver_boundary()
	_test_manifest_asset_boundary()
	_test_zip_boundary()
	if _failures.is_empty():
		print("Pocket Chordsmith trust-boundary tests passed.")
		quit(0)
		return
	for failure in _failures:
		push_error(str(failure))
	quit(1)


func _test_receiver_boundary() -> void:
	var receiver = PushReceiver.new()
	root.add_child(receiver)
	receiver.import_callback = Callable(self, "_accept_import")
	var start_error := receiver.start()
	_expect(start_error == OK, "receiver starts on loopback")
	var first_token := receiver.get_session_token()
	_expect(first_token.length() == 64, "receiver creates a 256-bit hex token")
	var untrusted_options := receiver._handle_request(_headers("OPTIONS", "evil-1", "https://evil.example", ""), "")
	_expect(untrusted_options.begins_with("HTTP/1.1 403"), "untrusted-origin OPTIONS receives 403")
	var missing_token := receiver._handle_request(_headers("POST", "missing-1", "http://localhost:4173", ""), _payload())
	_expect(missing_token.begins_with("HTTP/1.1 401"), "missing token receives 401")
	var wrong_token := receiver._handle_request(_headers("POST", "wrong-1", "http://localhost:4173", "wrong"), _payload())
	_expect(wrong_token.begins_with("HTTP/1.1 401"), "wrong token receives 401")
	var accepted := receiver._handle_request(_headers("POST", "accepted-1", "http://localhost:4173", first_token), _payload())
	_expect(accepted.begins_with("HTTP/1.1 200"), "approved origin and current token import successfully")
	_expect(_import_count == 1, "authorized receiver request changes importer state once")
	var replay := receiver._handle_request(_headers("POST", "accepted-1", "http://localhost:4173", first_token), _payload())
	_expect(replay.begins_with("HTTP/1.1 409"), "replayed receiver request is rejected")
	_expect(_import_count == 1, "replay cannot alter importer state")
	receiver.stop()
	_expect(receiver.start() == OK, "receiver restarts")
	_expect(receiver.get_session_token() != first_token, "receiver token rotates on restart")
	receiver.stop()
	receiver.queue_free()


func _test_manifest_asset_boundary() -> void:
	var external_path := "user://pcs-trust-boundary-external.wav"
	var external_file := FileAccess.open(external_path, FileAccess.WRITE)
	external_file.store_8(0)
	external_file.close()
	var manifest := {"assets": {"drums": external_path}}
	var untrusted: Dictionary = GamePackManifest.create_playback_profile_from_manifest(manifest, "user://pack")
	_expect(bool(untrusted.get("ok", false)), "untrusted manifest can load after external asset is ignored")
	_expect((untrusted.get("profile").stem_paths as Dictionary).is_empty(), "untrusted manifest cannot escape pack-local ownership")
	_expect(not untrusted.get("warnings", []).is_empty(), "ignored external manifest reference emits a warning")
	var trusted: Dictionary = GamePackManifest.create_playback_profile_from_manifest(manifest, "user://pack", {"trusted_project_paths": true})
	_expect(bool(trusted.get("ok", false)), "explicit trusted-project mode accepts an existing external audio asset")
	_expect(str((trusted.get("profile").stem_paths as Dictionary).get("drums", "")) == external_path, "trusted-project mode preserves the external path")
	var invalid_type: Dictionary = GamePackManifest.create_playback_profile_from_manifest({"assets": {"drums": "payload.gd"}}, "user://pack")
	_expect(not bool(invalid_type.get("ok", false)), "manifest rejects unsupported asset types before profile creation")


func _test_zip_boundary() -> void:
	var tools = BuildTools.new()
	var base := "user://pcs-trust-boundary-zips"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(base))
	var safe_zip := base.path_join("safe.zip")
	_write_zip(safe_zip, {
		"manifests/godot-adaptive-manifest.json": JSON.stringify({"kind": "godot-adaptive-pack", "fullMix": "audio/mix.wav", "sourceProject": "source_project.json"}),
		"audio/mix.wav": "bounded-audio-fixture",
		"source_project.json": "{}",
	})
	var safe_name := "safe_%s" % Time.get_ticks_usec()
	var safe: Dictionary = tools._extract_game_pack_zip(safe_zip, base.path_join("imports"), {"pack_name": safe_name})
	_expect(bool(safe.get("ok", false)), "bounded pack extracts through staging after manifest validation")
	_expect(FileAccess.file_exists(str(safe.get("pack_root", "")).path_join("manifests/godot-adaptive-manifest.json")), "validated pack is moved to its final root")
	var traversal_zip := base.path_join("traversal.zip")
	_write_zip(traversal_zip, {"../escaped.txt": "escape", "manifests/godot-adaptive-manifest.json": "{}"})
	var traversal: Dictionary = tools._extract_game_pack_zip(traversal_zip, base.path_join("imports"), {"pack_name": "traversal"})
	_expect(not bool(traversal.get("ok", false)), "ZIP traversal entry is rejected")
	_expect(not FileAccess.file_exists(base.path_join("escaped.txt")), "rejected ZIP creates nothing outside staging")
	var collision_zip := base.path_join("collision.zip")
	_write_zip(collision_zip, {"Audio/Tone.wav": "one", "audio/tone.wav": "two", "manifests/godot-adaptive-manifest.json": "{}"})
	var collision: Dictionary = tools._extract_game_pack_zip(collision_zip, base.path_join("imports"), {"pack_name": "collision"})
	_expect(not bool(collision.get("ok", false)), "case-colliding ZIP entries are rejected")
	var deep_zip := base.path_join("deep.zip")
	_write_zip(deep_zip, {"a/b/c/d/e/f/g/h/i/j/k/l/m/file.wav": "deep", "manifests/godot-adaptive-manifest.json": "{}"})
	var deep: Dictionary = tools._extract_game_pack_zip(deep_zip, base.path_join("imports"), {"pack_name": "deep"})
	_expect(not bool(deep.get("ok", false)), "excessive ZIP path depth is rejected")
	var colon_zip := base.path_join("colon.zip")
	_write_zip(colon_zip, {"C:/outside.wav": "drive", "manifests/godot-adaptive-manifest.json": "{}"})
	var colon: Dictionary = tools._extract_game_pack_zip(colon_zip, base.path_join("imports"), {"pack_name": "colon"})
	_expect(not bool(colon.get("ok", false)), "drive-letter and colon ZIP paths are rejected")
	var many_files := {}
	for index in range(BuildTools.MAX_ZIP_ENTRIES + 1):
		many_files["files/%04d.txt" % index] = ""
	var many_zip := base.path_join("many.zip")
	_write_zip(many_zip, many_files)
	var many: Dictionary = tools._extract_game_pack_zip(many_zip, base.path_join("imports"), {"pack_name": "many"})
	_expect(not bool(many.get("ok", false)), "excessive ZIP entry count is rejected")
	var bomb_zip := base.path_join("ratio.zip")
	var repeated := "0".repeat(1024 * 1024)
	_write_zip(bomb_zip, {"audio/repeated.wav": repeated, "manifests/godot-adaptive-manifest.json": "{}"})
	var bomb: Dictionary = tools._extract_game_pack_zip(bomb_zip, base.path_join("imports"), {"pack_name": "ratio"})
	_expect(not bool(bomb.get("ok", false)), "extreme ZIP compression ratio is rejected before extraction")
	var huge_zip := base.path_join("huge-metadata.zip")
	_write_zip(huge_zip, {"audio/huge.wav": "small", "manifests/godot-adaptive-manifest.json": "{}"})
	_patch_central_uncompressed_sizes(huge_zip, [BuildTools.MAX_ZIP_ENTRY_BYTES + 1, 2])
	var huge: Dictionary = tools._extract_game_pack_zip(huge_zip, base.path_join("imports"), {"pack_name": "huge"})
	_expect(not bool(huge.get("ok", false)), "huge single ZIP entry metadata is rejected before allocation")
	var aggregate_zip := base.path_join("aggregate-metadata.zip")
	_write_zip(aggregate_zip, {"audio/one.wav": "1", "audio/two.wav": "2", "audio/three.wav": "3", "audio/four.wav": "4", "audio/five.wav": "5"})
	_patch_central_uncompressed_sizes(aggregate_zip, [60 * 1024 * 1024, 60 * 1024 * 1024, 60 * 1024 * 1024, 60 * 1024 * 1024, 60 * 1024 * 1024])
	var aggregate: Dictionary = tools._extract_game_pack_zip(aggregate_zip, base.path_join("imports"), {"pack_name": "aggregate"})
	_expect(not bool(aggregate.get("ok", false)), "excessive aggregate ZIP output metadata is rejected before allocation")


func _write_zip(path: String, files: Dictionary) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var packer := ZIPPacker.new()
	_expect(packer.open(path, ZIPPacker.APPEND_CREATE) == OK, "test ZIP opens for writing")
	for file_path in files.keys():
		_expect(packer.start_file(str(file_path)) == OK, "test ZIP entry starts: %s" % file_path)
		packer.write_file(str(files[file_path]).to_utf8_buffer())
		packer.close_file()
	packer.close()


func _patch_central_uncompressed_sizes(path: String, sizes: Array) -> void:
	var bytes := FileAccess.get_file_as_bytes(path)
	var size_index := 0
	for offset in range(bytes.size() - 46):
		if bytes.decode_u32(offset) != 0x02014b50:
			continue
		if size_index >= sizes.size():
			break
		bytes.encode_u32(offset + 24, int(sizes[size_index]))
		size_index += 1
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(bytes)
	file.close()
	_expect(size_index == sizes.size(), "test ZIP central-directory sizes were patched")


func _headers(method: String, request_id: String, origin: String, token: String) -> String:
	var headers := [
		"%s /pocket-chordsmith/push-to-godot HTTP/1.1" % method,
		"Host: 127.0.0.1:9087",
		"Origin: %s" % origin,
		"Content-Type: application/json",
		"Content-Length: %d" % _payload().to_utf8_buffer().size(),
		"X-Pocket-Audio-Request-Id: %s" % request_id,
	]
	if not token.is_empty():
		headers.append("Authorization: Bearer %s" % token)
	return "\r\n".join(headers)


func _payload() -> String:
	return JSON.stringify({"code": "PCS1:test"})


func _accept_import(_code: String, _source: String) -> Dictionary:
	_import_count += 1
	return {"ok": true, "event_count": 1}


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
