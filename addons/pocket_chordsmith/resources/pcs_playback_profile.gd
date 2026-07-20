@tool
extends Resource
class_name PCSPlaybackProfile

const SoundProfileContract := preload("res://addons/pocket_chordsmith/import/pcs_sound_profile_contract.gd")

enum PlaybackBackend {
	STEM_SYNC,
	HYBRID,
	PROCEDURAL_PREVIEW,
}

@export var playback_backend: PlaybackBackend = PlaybackBackend.STEM_SYNC
@export var lookahead_ticks := 240
@export var max_events_per_frame := 128
@export var max_polyphony := 32
@export var emit_muted_events := false
@export var emit_generated_events := true
@export var mobile_safe := true
@export var stem_paths: Dictionary = {}
@export var stem_bus_names: Dictionary = {}
@export var use_audio_stream_synchronized := true
@export var use_audio_stream_polyphonic_for_accents := true
@export var accent_streams: Dictionary = {}
@export var event_sample_streams: Dictionary = {}
@export var drum_kit: Dictionary = {}
@export var marker_stingers: Dictionary = {}
@export var sample_preview_enabled := true
@export var sample_preview_velocity_scale := true
@export var sample_preview_tonal_enabled := true
@export var sample_preview_wall_clock_timing := true
@export var sample_preview_load_wavs_uncompressed := true
@export var sample_preview_prewarm_on_ready := true
@export var sample_preview_force_web_stream_for_pitched := true
@export var sample_preview_log_pitched_events := false
@export var sample_preview_native_bass_enabled := true
@export var sample_preview_native_bass_gain_db := 2.0
@export var sample_preview_native_bass_cache_limit := 192
@export var sample_preview_native_melody_enabled := true
@export var sample_preview_native_melody_gain_db := 4.5
@export var sample_preview_native_melody_cache_limit := 256
@export var sample_preview_native_guitar_enabled := true
@export var sample_preview_native_guitar_gain_db := 0.0
@export var sample_preview_native_guitar_cache_limit := 192
@export var sample_preview_native_chords_enabled := true
@export var sample_preview_native_chords_gain_db := 0.0
@export var sample_preview_native_chords_cache_limit := 192
@export var sample_preview_build_native_streams_during_playback := false
@export var sample_preview_max_chord_notes := 4
@export var sample_preview_slide_steps := 3
@export var sample_preview_pan_buses_enabled := false
@export var sample_preview_fx_enabled := false
@export var sample_preview_skip_late_audio_ticks := 120
@export var sample_preview_bass_duck_on_kick_db := 0.0
@export var sample_preview_bass_duck_window_ticks := 0
@export var guitar_preview_effects_enabled := false
@export var audio_profile := "standard"
@export var sound_profile_id := "standard"
@export var sound_preset := "standard_chordsmith"
@export var sound_recipe_version := 1
@export var supported_format_features: Array[String] = ["sound-profile-v1", "rich-events-v1", "articulations-v1", "expanded-drums-v1", "capability-report-v1"]
@export var supported_articulations: Array[String] = ["finger", "slap", "pop", "mute", "ghost", "hammer", "pull", "slide", "hold", "staccato", "legato", "bend", "vibrato", "tremolo", "open", "chug", "scratch", "palm_mute", "accent", "flam", "drag", "roll", "choke"]
@export var supported_drum_lanes: Array[String] = ["kick", "snare", "rim", "clap", "hat_closed", "hat_open", "ride", "crash", "china", "tom_high", "tom_mid", "tom_low", "percussion"]
@export var supported_technique_namespaces: Array[String] = ["chip", "metal", "western", "funk"]
@export var supported_profile_ids: Array[String] = ["standard", "lofi_chill", "chip_arcade", "western_frontier", "heavy_metal", "funk_groove"]
@export var lofi_preset := ""
@export var lofi_texture: Dictionary = {}
@export var chip_preset := ""
@export var chip_texture: Dictionary = {}
@export var lofi_bus := "Music_Texture"
@export var lofi_state_presets: Dictionary = {
	"lofi_study_room": {"menu": 0.42, "explore": 0.58, "night": 0.72},
	"lofi_rainy_window": {"menu": 0.48, "explore": 0.56, "rain": 0.78},
	"lofi_koi_pond": {"menu": 0.36, "explore": 0.50, "night": 0.62},
	"lofi_train_window": {"menu": 0.46, "explore": 0.64, "night": 0.70},
}
@export var sample_preview_gain_db: Dictionary = {
	"drums": 0.0,
	"kick": 0.0,
	"kick_accent": 0.0,
	"snare": 0.0,
	"snare_accent": 0.0,
	"hat": 0.0,
	"hat_accent": 0.0,
	"open_hat": 0.0,
	"bass": -1.0,
	"chords": -4.0,
	"guitar": -8.0,
	"guitar:western_twang:scratch": -23.0,
	"melody": -9.0,
	"melody:banjo": -27.0,
	"stingers": 0.0,
}
@export var master_music_bus := "Music_Master"
@export var drums_bus := "Music_Drums"
@export var bass_bus := "Music_Bass"
@export var chords_bus := "Music_Chords"
@export var guitar_bus := "Music_Guitar"
@export var melody_bus := "Music_Melody"
@export var stingers_bus := "Music_Stingers"
@export var fx_bus := "Music_FX"
@export var accent_bus_name := "Music_Stingers"
@export var music_bus_name := "Music_Master"
@export var ducking_rules: Dictionary = {}
@export var filter_automation: Dictionary = {}
@export var intensity_mix_targets: Dictionary = {}
@export var native_audio_router_script: Script
@export var stem_sets: Dictionary = {}
@export var section_stem_sets: Dictionary = {}
@export var state_stem_sets: Dictionary = {}
@export var stem_playback_mode := "mixer_routed_stems"
@export var section_transition_quantize := "bar"
@export var transition_mode := "cut"
@export var crossfade_seconds := 0.08
@export var default_stem_layers: Array[String] = ["drums", "bass", "chords", "guitar", "melody_1", "melody_2", "melody_3", "fx"]


func is_event_mode_enabled() -> bool:
	return playback_backend == PlaybackBackend.HYBRID or playback_backend == PlaybackBackend.PROCEDURAL_PREVIEW


func get_capabilities() -> Dictionary:
	return {
		"profileIds": supported_profile_ids.duplicate(),
		"features": supported_format_features.duplicate(),
		"articulations": supported_articulations.duplicate(),
		"drumLanes": supported_drum_lanes.duplicate(),
		"techniqueNamespaces": supported_technique_namespaces.duplicate(),
	}


func get_bus_for_layer(layer_name: String) -> String:
	match normalize_layer_name(layer_name):
		"drums":
			return drums_bus
		"bass":
			return bass_bus
		"chords":
			return chords_bus
		"guitar", "guitars":
			return guitar_bus
		"melody", "melody_1", "melody_2", "melody_3", "melody_4", "melody_5", "melody_6":
			return melody_bus
		"stingers", "stinger":
			return stingers_bus
		"fx":
			return fx_bus
		"master", "music":
			return master_music_bus
		_:
			return str(stem_bus_names.get(layer_name, master_music_bus))


func has_section_stems(section_id: String) -> bool:
	return not get_section_stems(section_id).is_empty()


func get_section_stems(section_id: String) -> Dictionary:
	var canonical := canonical_section_id(section_id)
	if canonical.is_empty():
		return {}
	if section_stem_sets.has(canonical) and section_stem_sets[canonical] is Dictionary:
		return (section_stem_sets[canonical] as Dictionary).duplicate(true)
	for key in section_stem_sets.keys():
		if canonical_section_id(str(key)) == canonical and section_stem_sets[key] is Dictionary:
			return (section_stem_sets[key] as Dictionary).duplicate(true)
	if stem_sets.has(canonical) and stem_sets[canonical] is Dictionary:
		return (stem_sets[canonical] as Dictionary).duplicate(true)
	for key in stem_sets.keys():
		if canonical_section_id(str(key)) == canonical and stem_sets[key] is Dictionary:
			return (stem_sets[key] as Dictionary).duplicate(true)
	return {}


func set_section_stems(section_id: String, stems: Dictionary) -> void:
	var canonical := canonical_section_id(section_id)
	if canonical.is_empty():
		return
	var normalized := {}
	for key in stems.keys():
		var stem_key := normalize_stem_key(str(key))
		if not stem_key.is_empty():
			normalized[stem_key] = stems[key]
	section_stem_sets[canonical] = normalized


func get_state_stems(state_name: String) -> Dictionary:
	if state_name.is_empty() or not state_stem_sets.has(state_name):
		return {}
	var value = state_stem_sets[state_name]
	if value is Dictionary:
		return (value as Dictionary).duplicate(true)
	if value is String and stem_sets.has(str(value)) and stem_sets[str(value)] is Dictionary:
		return (stem_sets[str(value)] as Dictionary).duplicate(true)
	return {}


func set_state_stems(state_name: String, stems: Dictionary) -> void:
	if state_name.strip_edges().is_empty():
		return
	var normalized := {}
	for key in stems.keys():
		var stem_key := normalize_stem_key(str(key))
		if not stem_key.is_empty():
			normalized[stem_key] = stems[key]
	state_stem_sets[state_name.strip_edges()] = normalized


func normalize_layer_name(name: String) -> String:
	return normalize_stem_key(name)


func normalize_stem_key(key: String) -> String:
	var normalized := key.strip_edges().to_lower().replace("-", "_").replace(" ", "_")
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


func canonical_section_id(key: String) -> String:
	var normalized := key.strip_edges().to_upper().replace("-", "_").replace(" ", "_")
	if normalized.is_empty():
		return ""
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
