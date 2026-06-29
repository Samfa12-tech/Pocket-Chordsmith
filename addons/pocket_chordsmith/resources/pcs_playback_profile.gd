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
@export var state_stem_sets: Dictionary = {}
@export var default_stem_layers: Array[String] = ["drums", "bass", "chords", "guitar", "melody_1", "melody_2", "melody_3", "fx"]


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
