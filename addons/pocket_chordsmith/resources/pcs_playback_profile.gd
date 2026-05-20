@tool
extends Resource
class_name PCSPlaybackProfile

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
@export var master_music_bus := "Music_Master"
@export var drums_bus := "Music_Drums"
@export var bass_bus := "Music_Bass"
@export var chords_bus := "Music_Chords"
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
@export var state_stem_sets: Dictionary = {}
@export var default_stem_layers: Array[String] = ["drums", "bass", "chords", "melody_1", "melody_2", "melody_3", "fx"]


func is_event_mode_enabled() -> bool:
	return playback_backend == PlaybackBackend.HYBRID or playback_backend == PlaybackBackend.PROCEDURAL_PREVIEW


func get_bus_for_layer(layer_name: String) -> String:
	match layer_name:
		"drums":
			return drums_bus
		"bass":
			return bass_bus
		"chords":
			return chords_bus
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
