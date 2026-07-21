@tool
extends RefCounted
class_name PCSGamePackManifest

const SharedSoundConstants := preload("res://addons/pocket_chordsmith/import/pcs_shared_sound_constants.gd")
const PlaybackProfile := preload("res://addons/pocket_chordsmith/resources/pcs_playback_profile.gd")
const SoundProfileContract := preload("res://addons/pocket_chordsmith/import/pcs_sound_profile_contract.gd")

const STEM_ASSET_KEYS := ["drums", "bass", "chords", "guitar", "melody", "melody_1", "melody_2", "melody_3", "melody_4", "melody_5", "melody_6", "fx", "ambience", "full"]
const DRUM_SAMPLE_KEYS := ["kick", "kick_accent", "snare", "snare_accent", "hat", "hat_accent", "open_hat", "crash"]


static func manifest_path_for_kind(kind := "godot-adaptive-pack") -> String:
	var files: Dictionary = SharedSoundConstants.GAME_PACK_MANIFEST_FILES
	var file_name := str(files.get(kind, files.get("godot-adaptive-pack", "godot-adaptive-manifest.json")))
	return _pack_path("manifests", file_name)


static func load_manifest_file(path: String) -> Dictionary:
	var result := _empty_result()
	if path.strip_edges().is_empty():
		result["errors"].append("Manifest path is empty.")
		return result
	if not FileAccess.file_exists(path):
		result["errors"].append("Manifest file does not exist: %s" % path)
		return result
	var text := FileAccess.get_file_as_string(path)
	var parser := JSON.new()
	var error := parser.parse(text)
	if error != OK:
		result["errors"].append("Invalid game-pack manifest JSON at line %d: %s" % [parser.get_error_line(), parser.get_error_message()])
		return result
	if not (parser.data is Dictionary):
		result["errors"].append("Game-pack manifest root must be an object.")
		return result
	result["ok"] = true
	result["manifest"] = parser.data
	return result


static func create_playback_profile_from_manifest(manifest: Dictionary, pack_root := "", options := {}) -> Dictionary:
	var result := _empty_result()
	if manifest.is_empty():
		result["errors"].append("Game-pack manifest is empty.")
		return result

	var profile = PlaybackProfile.new()
	profile.playback_backend = _backend_for_manifest(str(manifest.get("profile", "")))
	if str(manifest.get("kind", "")) == "godot-adaptive-pack" or manifest.has("stems") or manifest.has("sectionLoops"):
		profile.playback_backend = PlaybackProfile.PlaybackBackend.STEM_SYNC
	var sound_profile: Dictionary = manifest.get("soundProfile", {}) if manifest.get("soundProfile", {}) is Dictionary else {}
	var normalized_profile := SoundProfileContract.normalize_profile(sound_profile, str(manifest.get("audioProfile", profile.audio_profile)), str(manifest.get("preset", "")))
	profile.audio_profile = str(normalized_profile.get("id", profile.audio_profile))
	profile.sound_profile_id = str(normalized_profile.get("id", profile.sound_profile_id))
	profile.sound_preset = str(normalized_profile.get("preset", profile.sound_preset))
	profile.sound_recipe_version = int(normalized_profile.get("recipeVersion", profile.sound_recipe_version))
	profile.lofi_preset = str(_dictionary_or_empty(manifest.get("lofi", {})).get("presetId", profile.lofi_preset))
	profile.lofi_texture = _dictionary_or_empty(_dictionary_or_empty(manifest.get("lofi", {})).get("texture", {}))
	profile.chip_preset = str(_dictionary_or_empty(manifest.get("chip", {})).get("presetId", profile.chip_preset))
	profile.chip_texture = _dictionary_or_empty(_dictionary_or_empty(manifest.get("chip", {})).get("texture", {}))
	profile.stem_paths = stem_paths_from_manifest(manifest, pack_root)
	var section_sets := section_stem_sets_from_manifest(manifest, pack_root)
	profile.section_stem_sets = section_sets
	profile.stem_sets = section_sets.duplicate(true)
	profile.state_stem_sets = state_stem_sets_from_manifest(manifest, pack_root)
	profile.drum_kit = drum_kit_from_manifest(manifest, pack_root)
	profile.accent_streams = accent_streams_from_manifest(manifest, pack_root)
	profile.event_sample_streams = event_sample_streams_from_manifest(manifest, pack_root)

	var use_audio_stream_synchronized := bool(options.get("use_audio_stream_synchronized", profile.use_audio_stream_synchronized))
	profile.use_audio_stream_synchronized = use_audio_stream_synchronized
	if profile.stem_paths.is_empty() and not profile.stem_sets.is_empty():
		profile.playback_backend = PlaybackProfile.PlaybackBackend.STEM_SYNC
	if profile.playback_backend == PlaybackProfile.PlaybackBackend.HYBRID and profile.drum_kit.is_empty() and profile.event_sample_streams.is_empty() and not profile.stem_paths.is_empty():
		result["warnings"].append("HYBRID manifest has stems but no sample assets; using stem playback only until samples are assigned.")

	result["ok"] = result["errors"].is_empty()
	result["profile"] = profile
	result["stem_paths"] = profile.stem_paths
	result["stem_sets"] = profile.stem_sets
	result["section_stem_sets"] = profile.section_stem_sets
	result["state_stem_sets"] = profile.state_stem_sets
	result["drum_kit"] = profile.drum_kit
	result["accent_streams"] = profile.accent_streams
	result["event_sample_streams"] = profile.event_sample_streams
	return result


static func stem_paths_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	if manifest.has("stems") or manifest.has("fullMix"):
		return _daw_stem_paths_from_manifest(manifest, pack_root)
	return _asset_stem_map(_dictionary_or_empty(manifest.get("assets", {})), pack_root)


static func section_stem_sets_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var sections := _dictionary_or_empty(manifest.get("sections", {}))
	for section_id in sections.keys():
		var canonical := _canonical_section_id(str(section_id))
		var section := _dictionary_or_empty(sections[section_id])
		var assets := _dictionary_or_empty(section.get("assets", {}))
		var stem_map := _asset_stem_map(assets, pack_root)
		if stem_map.is_empty() and assets.has("mix"):
			var mix_path := resolve_asset_path(str(assets.get("mix", "")), pack_root)
			if not mix_path.is_empty():
				stem_map["full"] = mix_path
		if not canonical.is_empty() and not stem_map.is_empty():
			out[canonical] = stem_map
	for section_id in _daw_section_loop_sets_from_manifest(manifest, pack_root).keys():
		if not out.has(section_id):
			out[section_id] = {}
		(out[section_id] as Dictionary).merge(_daw_section_loop_sets_from_manifest(manifest, pack_root)[section_id], true)
	return out


static func state_stem_sets_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var states := _dictionary_or_empty(manifest.get("states", {}))
	for state_name in states.keys():
		var state := _dictionary_or_empty(states[state_name])
		var stems := _dictionary_or_empty(state.get("stems", state.get("assets", {})))
		var stem_map := _asset_stem_map(stems, pack_root)
		if not stem_map.is_empty():
			out[str(state_name)] = stem_map
	return out


static func source_project_path_from_manifest(manifest: Dictionary, pack_root := "") -> String:
	for key in ["sourceProject", "source_project", "projectPath", "chart", "chartPath"]:
		var path := resolve_asset_path(str(manifest.get(key, "")), pack_root)
		if not path.is_empty():
			return path
	return ""


static func _daw_stem_paths_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var stems: Array = manifest.get("stems", [])
	for stem in stems:
		if not (stem is Dictionary):
			continue
		var path := resolve_asset_path(str(stem.get("packPath", "")), pack_root)
		if path.is_empty():
			continue
		var key := _safe_layer_key(str(stem.get("id", stem.get("label", ""))))
		if key.is_empty():
			key = _safe_layer_key(str(stem.get("label", "stem_%d" % out.size())))
		out[key] = path
	if out.is_empty() and manifest.has("fullMix"):
		var full_mix := resolve_asset_path(str(manifest.get("fullMix", "")), pack_root)
		if not full_mix.is_empty():
			out["music"] = full_mix
	return out


static func _daw_section_loop_sets_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var loops: Array = manifest.get("sectionLoops", [])
	for loop_index in range(loops.size()):
		var loop = loops[loop_index]
		if not (loop is Dictionary):
			continue
		var path := resolve_asset_path(str(loop.get("packPath", loop.get("path", ""))), pack_root)
		if path.is_empty():
			continue
		var section_id := _canonical_section_id(str(loop.get("sectionId", loop.get("section", loop.get("id", "")))))
		if section_id.is_empty():
			section_id = _canonical_section_id("section_loop_%02d" % (loop_index + 1))
		if section_id.is_empty():
			continue
		out[section_id] = {"full": path}
	return out


static func drum_kit_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var assets := _dictionary_or_empty(manifest.get("assets", {}))
	for key in DRUM_SAMPLE_KEYS:
		if not assets.has(key):
			continue
		var path := resolve_asset_path(str(assets.get(key, "")), pack_root)
		if not path.is_empty():
			out[key] = path
	return out


static func accent_streams_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var assets := _dictionary_or_empty(manifest.get("assets", {}))
	for key in assets.keys():
		var sample_key := str(key)
		if not (sample_key.ends_with("_stinger") or sample_key.ends_with(":stinger") or sample_key == "stinger"):
			continue
		var path := resolve_asset_path(str(assets.get(key, "")), pack_root)
		if not path.is_empty():
			out[sample_key] = path
	return out


static func event_sample_streams_from_manifest(manifest: Dictionary, pack_root := "") -> Dictionary:
	var out := {}
	var assets := _dictionary_or_empty(manifest.get("assets", {}))
	for key in assets.keys():
		var sample_key := str(key)
		if STEM_ASSET_KEYS.has(sample_key) or sample_key == "mix" or DRUM_SAMPLE_KEYS.has(sample_key):
			continue
		if sample_key.ends_with("_stinger") or sample_key.ends_with(":stinger") or sample_key == "stinger":
			continue
		var path := resolve_asset_path(str(assets.get(key, "")), pack_root)
		if not path.is_empty():
			out[sample_key] = path
	return out


static func resolve_asset_path(asset_path: String, pack_root := "") -> String:
	var path := asset_path.strip_edges().replace("\\", "/")
	if path.is_empty():
		return ""
	if path.begins_with("res://") or path.begins_with("user://"):
		return path
	if not _is_safe_pack_relative_path(path):
		return ""
	var root := str(pack_root).strip_edges().replace("\\", "/")
	if root.is_empty():
		return path
	if root.ends_with("/"):
		return root + path
	return "%s/%s" % [root, path]


static func _asset_stem_map(assets: Dictionary, pack_root: String) -> Dictionary:
	var out := {}
	for key in assets.keys():
		var stem_key := _normalize_stem_key(str(key))
		if stem_key.is_empty() or not STEM_ASSET_KEYS.has(stem_key):
			continue
		var path := resolve_asset_path(str(assets.get(key, "")), pack_root)
		if not path.is_empty():
			out[stem_key] = path
	return out


static func _backend_for_manifest(profile_name: String) -> int:
	match profile_name.to_upper():
		"HYBRID":
			return PlaybackProfile.PlaybackBackend.HYBRID
		"PROCEDURAL_PREVIEW":
			return PlaybackProfile.PlaybackBackend.PROCEDURAL_PREVIEW
		_:
			return PlaybackProfile.PlaybackBackend.STEM_SYNC


static func _pack_path(folder: String, file_name: String) -> String:
	var folders: Dictionary = SharedSoundConstants.GAME_PACK_FOLDERS
	var prefix := str(folders.get(folder, ""))
	var safe_file := _safe_relative_file(file_name)
	if prefix.is_empty() or safe_file.is_empty():
		return ""
	return "%s%s" % [prefix, safe_file]


static func _safe_relative_file(value: String) -> String:
	var parts := []
	for part in value.replace("\\", "/").split("/"):
		if part.is_empty() or part == "." or part == "..":
			continue
		parts.append(part)
	return "/".join(parts)


static func _safe_layer_key(value: String) -> String:
	var out := value.strip_edges().to_snake_case()
	for token in ["\\", "/", ":", "*", "?", "\"", "<", ">", "|", " "]:
		out = out.replace(token, "_")
	return out


static func _normalize_stem_key(key: String) -> String:
	var normalized := _safe_layer_key(key)
	match normalized:
		"drum", "drumkit", "drum_kit", "beat", "beats":
			return "drums"
		"bassline", "bass_line":
			return "bass"
		"chord", "keys", "pad", "pads", "harmony":
			return "chords"
		"guitars", "rhythm_guitar":
			return "guitar"
		"lead", "lead_melody", "melody_lead", "topline":
			return "melody"
		"amb", "ambient":
			return "ambience"
		"section", "loop", "mix", "full_mix", "full_loop", "music":
			return "full"
		_:
			return normalized


static func _canonical_section_id(key: String) -> String:
	var normalized := key.strip_edges().to_upper().replace("-", "_").replace(" ", "_")
	if normalized.begins_with("SECTION_"):
		normalized = normalized.substr("SECTION_".length())
	if normalized.find("_") >= 0:
		for part in normalized.split("_", false):
			if part.length() == 1 and part >= "A" and part <= "H":
				return part
	if normalized.length() == 1 and normalized >= "A" and normalized <= "H":
		return normalized
	for index in range(normalized.length()):
		var letter := normalized.substr(index, 1)
		if letter >= "A" and letter <= "H":
			return letter
	return ""


static func _is_safe_pack_relative_path(path: String) -> bool:
	if path.begins_with("/") or path.find(":") >= 0:
		return false
	for part in path.split("/"):
		if part.is_empty() or part == "." or part == "..":
			return false
	return true


static func _dictionary_or_empty(value) -> Dictionary:
	return value if value is Dictionary else {}


static func _empty_result() -> Dictionary:
	return {
		"ok": false,
		"manifest": {},
		"profile": null,
		"warnings": [],
		"errors": [],
	}
