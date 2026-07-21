@tool
extends RefCounted
class_name PCSSoundProfileContract

const SCHEMA_VERSION := 17
const PROFILE_IDS := ["standard", "lofi_chill", "chip_arcade", "western_frontier", "heavy_metal", "funk_groove"]
const FORMAT_FEATURES := ["sound-profile-v1", "rich-events-v1", "articulations-v1", "expanded-drums-v1", "capability-report-v1"]
const COMMON_ARTICULATIONS := ["finger", "slap", "pop", "mute", "ghost", "hammer", "pull", "slide", "hold", "staccato", "legato", "bend", "vibrato", "tremolo", "open", "chug", "scratch", "palm_mute", "accent", "flam", "drag", "roll", "choke"]
const DRUM_LANES := ["kick", "snare", "rim", "clap", "hat_closed", "hat_open", "ride", "crash", "china", "tom_high", "tom_mid", "tom_low", "percussion"]
const TECHNIQUE_NAMESPACES := ["chip", "metal", "western", "funk"]
const PROFILE_ALIASES := {
	"standard": "standard", "chordsmith": "standard", "default": "standard",
	"lofi": "lofi_chill", "lofi_chill": "lofi_chill",
	"chip": "chip_arcade", "chip_tune": "chip_arcade", "chiptune": "chip_arcade", "chip_arcade": "chip_arcade",
	"western": "western_frontier", "country": "western_frontier", "western_frontier": "western_frontier",
	"metal": "heavy_metal", "heavy_metal": "heavy_metal",
	"funk": "funk_groove", "funk_groove": "funk_groove",
}
const DEFAULT_PRESETS := {
	"standard": "standard_chordsmith",
	"lofi_chill": "lofi_study_room",
	"chip_arcade": "chip_nes_pulse",
	"western_frontier": "western_trail",
	"heavy_metal": "metal_tight_riff",
	"funk_groove": "funk_classic_pocket",
}
const FALLBACK_ARTICULATIONS := {
	"slap": "accent", "pop": "accent", "ghost": "mute", "hammer": "finger", "pull": "finger",
	"bend": "accent", "vibrato": "hold", "tremolo": "accent", "palm_mute": "chug", "flam": "accent", "drag": "accent", "roll": "accent", "choke": "staccato",
}
const FALLBACK_DRUM_LANES := {
	"rim": "snare", "clap": "snare", "hat_closed": "hat", "hat_open": "open_hat", "ride": "hat", "crash": "hat", "china": "hat", "tom_high": "snare", "tom_mid": "snare", "tom_low": "kick", "percussion": "hat",
}
const PREVIEW_SAMPLE_KEYS := {
	"funk_finger_pocket": "bass", "funk_slap_pop": "bass", "funk_muted_thump": "bass", "funk_round_finger": "bass:soft_upright", "funk_synth_pocket": "bass",
	"funk_clav_stab": "chord:muted_jazz_guitar", "funk_rhodes_stab": "chord:dusty_rhodes", "funk_muted_guitar": "guitar:scratch", "funk_brass_stack": "chord:tone", "funk_muted_trumpet": "melody:muted_trumpet", "funk_sax_punch": "melody:saxophone",
	"western_banjo": "melody:banjo", "western_harmonica": "melody:harmonica", "western_cowboy_whistle": "melody:cowboy_whistle", "western_twang": "guitar:western_twang:open", "western_saloon": "chord:saloon_piano",
	"metal_tight_riff": "guitar:chug", "metal_power_stack": "chord:tone", "metal_shred_lead": "melody:shred_lead_guitar", "metal_twin_lead": "melody:twin_harmony_lead", "chip_nes_pulse": "melody:chip_square_lead", "chip_arcade_noise": "hat",
}


static func canonical_profile_id(value: String) -> String:
	var key := value.strip_edges().to_lower().replace("-", "_").replace(" ", "_")
	return str(PROFILE_ALIASES.get(key, "standard"))


static func default_preset(profile_id: String) -> String:
	return str(DEFAULT_PRESETS.get(canonical_profile_id(profile_id), DEFAULT_PRESETS["standard"]))


static func normalize_profile(raw, legacy_profile := "", legacy_preset := "", legacy_parameters := {}) -> Dictionary:
	var source: Dictionary = raw if raw is Dictionary else {}
	var requested := str(source.get("id", source.get("profile", legacy_profile)))
	var profile_id := canonical_profile_id(requested if not requested.is_empty() else "standard")
	var preset := str(source.get("preset", legacy_preset))
	if preset.is_empty():
		preset = default_preset(profile_id)
	var parameters: Dictionary = source.get("parameters", legacy_parameters) if source.get("parameters", legacy_parameters) is Dictionary else {}
	return {
		"id": profile_id,
		"preset": preset,
		"parameters": parameters.duplicate(true),
		"recipeVersion": max(1, _as_int(source.get("recipeVersion", 1), 1)),
	}


static func normalize_features(raw, is_rich := false) -> Array[String]:
	var out: Array[String] = []
	var source = raw if raw is Array else []
	for value in source:
		var feature := str(value)
		if not feature.is_empty() and not out.has(feature):
			out.append(feature)
	if is_rich:
		for feature in FORMAT_FEATURES:
			if not out.has(feature):
				out.append(feature)
	return out


static func is_rich_project(raw: Dictionary) -> bool:
	var version := _as_int(raw.get("projectVersion", raw.get("schemaVersion", 1)), 1)
	return version >= SCHEMA_VERSION or raw.has("soundProfile") or raw.has("formatFeatures") or raw.has("sections") or raw.has("richEvents")


static func default_capabilities() -> Dictionary:
	return {
		"profileIds": PROFILE_IDS.duplicate(),
		"features": FORMAT_FEATURES.duplicate(),
		"articulations": COMMON_ARTICULATIONS.duplicate(),
		"drumLanes": DRUM_LANES.duplicate(),
		"techniqueNamespaces": TECHNIQUE_NAMESPACES.duplicate(),
	}


static func negotiate(value, capabilities := {}) -> Dictionary:
	var source: Dictionary = value if value is Dictionary else {}
	var caps := default_capabilities()
	if capabilities is Dictionary:
		for key in caps.keys():
			if capabilities.has(key) and capabilities[key] is Array:
				caps[key] = capabilities[key].duplicate()
	var profile := normalize_profile(source.get("soundProfile", {}), str(source.get("audioProfile", "standard")), str(source.get("stylePreset", "")))
	var report := {
			"profile": profile.duplicate(true),
			"capabilities": caps.duplicate(true),
			"losses": [],
			"preserved_unknown": true,
			"ok": true,
		}
	if not caps["profileIds"].has(profile["id"]):
		_add_loss(report, "soundProfile.id", "profile:%s" % profile["id"], "fallback", "standard", "Profile identity is not supported by this consumer.")
	var source_features: Array = source.get("formatFeatures", []) if source.get("formatFeatures", []) is Array else []
	for feature_index in range(source_features.size()):
		var feature := str(source_features[feature_index])
		if not feature.is_empty() and not caps["features"].has(feature):
			var fallback := "compact-grid" if feature == "rich-events-v1" else "consumer-default"
			_add_loss(report, "formatFeatures[%d]" % feature_index, "format:%s" % feature, "fallback", fallback, "Format feature is preserved in the source but is not supported by this consumer.")
	var sections: Dictionary = source.get("sections", {}) if source.get("sections", {}) is Dictionary else {}
	for section_id in sections.keys():
		var section: Dictionary = sections[section_id] if sections[section_id] is Dictionary else {}
		var tracks: Dictionary = section.get("tracks", {}) if section.get("tracks", {}) is Dictionary else {}
		for track_id in tracks.keys():
			var track: Dictionary = tracks[track_id] if tracks[track_id] is Dictionary else {}
			var events: Array = track.get("events", []) if track.get("events", []) is Array else []
			var previous_event: Dictionary = {}
			for event_index in range(events.size()):
				var event: Dictionary = events[event_index] if events[event_index] is Dictionary else {}
				var path := "sections.%s.tracks.%s.events[%d]" % [str(section_id), str(track_id), event_index]
				var articulation := str(event.get("articulation", ""))
				if not articulation.is_empty() and not caps["articulations"].has(articulation):
					_add_loss(report, "%s.articulation" % path, "articulation:%s" % articulation, "fallback", str(FALLBACK_ARTICULATIONS.get(articulation, "accent")), "Articulation is preserved in the source event but preview uses a supported fallback.")
				if articulation in ["hammer", "pull"] and (previous_event.is_empty() or (not previous_event.has("note") and not previous_event.has("notes"))):
					_add_loss(report, "%s.articulation" % path, "connected-note:%s" % articulation, "fallback", "finger", "Connected articulation has no valid preceding pitched note.")
				var sound := str(event.get("sound", ""))
				if not sound.is_empty() and not caps["features"].has("sound-profile-v1"):
					_add_loss(report, "%s.sound" % path, "sound:%s" % sound, "approximated", "track-default", "Sound recipe intent is preserved but this consumer does not advertise sound-profile support.")
				var technique: Dictionary = event.get("technique", {}) if event.get("technique", {}) is Dictionary else {}
				for namespace_id in technique.keys():
					if not caps["techniqueNamespaces"].has(str(namespace_id)):
						_add_loss(report, "%s.technique.%s" % [path, str(namespace_id)], "technique:%s" % str(namespace_id), "preserved", "", "Unknown technique namespace is preserved for a later-capable consumer.")
				var drum_lane := _event_drum_lane(str(track_id), track, event)
				if not drum_lane.is_empty() and not caps["drumLanes"].has(drum_lane):
					_add_loss(report, "%s.lane" % path, "drum-lane:%s" % drum_lane, "fallback", str(FALLBACK_DRUM_LANES.get(drum_lane, "percussion")), "Drum lane is preserved but preview uses the nearest supported lane.")
				previous_event = event
	var losses: Array = report["losses"]
	losses.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.get("path", "")) < str(b.get("path", "")))
	report["ok"] = losses.is_empty()
	return report


static func _event_drum_lane(track_id: String, track: Dictionary, event: Dictionary) -> String:
	var role := str(track.get("role", track.get("stem", track_id))).to_lower()
	if role not in ["drum", "drums"] and role not in DRUM_LANES:
		return ""
	var lane := str(event.get("lane", event.get("drumLane", event.get("sound", role if role in DRUM_LANES else ""))))
	return lane if lane in DRUM_LANES else ""


static func _add_loss(report: Dictionary, path: String, feature: String, action: String, fallback: String, message: String) -> void:
	var item := {"path": path, "feature": feature, "action": action, "fallback": fallback, "message": message}
	(report["losses"] as Array).append(item)


static func _as_int(value, fallback: int) -> int:
	if value is int:
		return value
	if value is float:
		return int(value)
	var text := str(value)
	return text.to_int() if text.is_valid_int() else fallback
