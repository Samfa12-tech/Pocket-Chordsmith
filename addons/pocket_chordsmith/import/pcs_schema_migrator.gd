@tool
extends RefCounted
class_name PCSSchemaMigrator

const SharedSoundConstants := preload("res://addons/pocket_chordsmith/import/pcs_shared_sound_constants.gd")

const SECTION_IDS := ["A", "B", "C", "D", "E", "F", "G", "H"]
const TRACK_IDS := ["kick", "snare", "hat", "bass"]
const NOTE_NAMES := ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const MAX_BARS := 4
const MAX_MELODY_TRACKS := 6
const MAX_SEQUENCE_SLOTS := 64
const PROJECT_SCHEMA_VERSION := 16
const GUITAR_ARTICULATIONS := SharedSoundConstants.POCKET_GUITAR_ARTICULATIONS
const LOFI_AUDIO_PROFILE_ID := SharedSoundConstants.LOFI_AUDIO_PROFILE_ID
const LOFI_STYLE_PRESETS := SharedSoundConstants.LOFI_STYLE_PRESETS
const LOFI_STYLE_PRESET_TEXTURES := SharedSoundConstants.LOFI_STYLE_PRESET_TEXTURES
const CHIP_AUDIO_PROFILE_ID := SharedSoundConstants.CHIP_AUDIO_PROFILE_ID
const DEFAULT_CHIP_PRESET_ID := SharedSoundConstants.DEFAULT_CHIP_PRESET_ID
const CHIP_STYLE_PRESETS := SharedSoundConstants.CHIP_STYLE_PRESETS
const CHIP_STYLE_PRESET_TEXTURES := SharedSoundConstants.CHIP_STYLE_PRESET_TEXTURES
const HEAVY_METAL_AUDIO_PROFILE_ID := SharedSoundConstants.HEAVY_METAL_AUDIO_PROFILE_ID
const DEFAULT_METAL_PRESET_ID := SharedSoundConstants.DEFAULT_METAL_PRESET_ID
const METAL_STYLE_PRESETS := SharedSoundConstants.METAL_STYLE_PRESETS
const METAL_STYLE_PRESET_TEXTURES := SharedSoundConstants.METAL_STYLE_PRESET_TEXTURES
const POCKET_CHORD_INSTRUMENTS := SharedSoundConstants.POCKET_CHORD_INSTRUMENTS
const POCKET_MELODY_INSTRUMENTS := SharedSoundConstants.POCKET_MELODY_INSTRUMENTS
const POCKET_DRUM_KITS := SharedSoundConstants.POCKET_DRUM_KITS
const POCKET_BASS_TONES := SharedSoundConstants.POCKET_BASS_TONES
const POCKET_GUITAR_TONES := SharedSoundConstants.POCKET_GUITAR_TONES
const POCKET_GUITAR_REGISTERS := SharedSoundConstants.POCKET_GUITAR_REGISTERS
const POCKET_GUITAR_STRUM_MODES := SharedSoundConstants.POCKET_GUITAR_STRUM_MODES
const POCKET_GUITAR_PATTERN_PRESETS := SharedSoundConstants.POCKET_GUITAR_PATTERN_PRESETS
const DEFAULT_CHORD_INSTRUMENT := SharedSoundConstants.DEFAULT_CHORD_INSTRUMENT
const DEFAULT_MELODY_INSTRUMENT := SharedSoundConstants.DEFAULT_MELODY_INSTRUMENT
const DEFAULT_GUITAR_TONE := SharedSoundConstants.DEFAULT_GUITAR_TONE
const DEFAULT_GUITAR_REGISTER := SharedSoundConstants.DEFAULT_GUITAR_REGISTER
const DEFAULT_GUITAR_STRUM_MODE := SharedSoundConstants.DEFAULT_GUITAR_STRUM_MODE

const DEFAULT_SECTION_BARS := {
	"A": 4, "B": 4, "C": 4, "D": 4,
	"E": 4, "F": 4, "G": 4, "H": 4,
}
const DEFAULT_SONG_SEQUENCE := ["A", "A", "B", "A", "A", "B", "C", "B", "A", "D"]
const DEFAULT_MAJOR_PROGRESSION := [0, 4, 5, 3]
const DEFAULT_MINOR_PROGRESSION := [0, 5, 2, 6]

const TOP_LEVEL_SUPPORTED_KEYS := [
	"projectVersion", "schemaVersion", "key", "scale", "timeSig", "bpm", "swing",
	"audioProfile", "stylePreset", "lofiPreset", "lofiTexture", "chipPreset", "chipTexture", "metalPreset", "metalTexture", "drumKit", "drumGroovePreset", "bassTone",
	"resolution", "chordType", "chordInstrument", "chordPlayMode", "chordRhythmMode", "chordOctave",
	"humanizeOn", "sidechainOn", "sidechainAmount", "fxDelay", "fxChorus", "fxFlanger", "fxReverb", "fxMix",
	"masterVolume", "masterVol", "chordVolume", "chordVol", "beatVolume", "beatVol", "leadVolume", "leadVol",
	"melodyPitchMode", "melodyOctave", "bassMode", "midiExportMode",
	"midiChordExport", "midiExactDurations", "guitarEnabled", "guitarTone",
	"guitarRegister", "guitarStrumMode", "guitarPatternPreset", "guitarVolume",
	"sectionBars", "sectionLengths",
	"songSequence", "sectionSequence", "level_id", "default_loop", "mood",
	"intensity_tags", "markers", "loop_regions", "gameplay_flags", "accent_map",
	"music_states", "default_music_state", "stem_sets", "state_stem_sets",
	"gameMetadata", "godotMetadata", "pcsMetadata",
]

const UI_ONLY_KEYS := [
	"theme", "uiMode", "currentStep", "isPlaying", "selectedSlot", "selectedTrack",
	"settingsOpen", "tooltipsOn", "wavUrl", "wavBlob", "wavFile", "showMelodyPads",
	"showDrumPads", "drumRecordToGrid", "showMelodyPicker", "showTrackControls",
	"lastAdvancedResolution",
	"currentSection", "currentPlaybackSection", "currentSequenceIndex",
	"playbackMode", "melodyInputMode", "xyPlaybackMode", "xyPadMode",
	"xyScaleMode", "xyChordFollow", "xyRecordToGrid", "xyLastWriteStep",
	"xyLiveActive", "xyLiveMidi", "xyLiveBrightness", "xyLiveGate",
	"xyLivePulseInterval", "xyLivePulseLabel", "xyLiveInstrument", "xyLivePan",
	"undoStack", "suspendUndo", "pendingUiTimers", "lastHighlightedStep",
	"advancedFxPrimed", "transportPlan", "availableChords", "nextSuggested",
	"activeMelodyTrack", "selectedMelodyDegree",
]


func normalize(raw: Dictionary, source_path := "") -> Dictionary:
	var warnings: Array[String] = []
	var errors: Array[String] = []
	var migration_notes: Array[String] = []
	var metadata := {
		"source_path": source_path,
		"ignored_ui_fields": [],
		"unknown_fields": {},
	}

	var schema_version := _as_int(raw.get("projectVersion", raw.get("schemaVersion", 1)), 1)
	if schema_version < PROJECT_SCHEMA_VERSION:
		migration_notes.append("Project schema %d was normalised to importer schema %d." % [schema_version, PROJECT_SCHEMA_VERSION])
	elif schema_version > PROJECT_SCHEMA_VERSION:
		warnings.append("Project schema %d is newer than this importer schema %d; unsupported fields were preserved as metadata." % [schema_version, PROJECT_SCHEMA_VERSION])

	var data := {}
	data["projectVersion"] = schema_version
	data["key"] = _safe_choice(str(raw.get("key", "C")), NOTE_NAMES, "C", "key", warnings)
	data["scale"] = _safe_choice(str(raw.get("scale", "major")), ["major", "minor"], "major", "scale", warnings)
	data["timeSig"] = _sanitize_time_signature(raw.get("timeSig", 4), warnings)
	data["bpm"] = _clamp_int(raw.get("bpm", 96), 40, 240, 96, "bpm", warnings)
	data["swing"] = _clamp_float(raw.get("swing", 0.0), 0.0, 0.35, 0.0, "swing", warnings)
	var style_preset := str(raw.get("stylePreset", ""))
	var chip_preset := _sanitize_chip_preset(str(raw.get("chipPreset", style_preset if style_preset.begins_with("chip_") else "")))
	var metal_preset := _sanitize_metal_preset(str(raw.get("metalPreset", style_preset if style_preset.begins_with("metal_") else "")))
	var lofi_preset := _sanitize_lofi_preset(str(raw.get("lofiPreset", style_preset if style_preset.begins_with("lofi_") else "")))
	data["audioProfile"] = CHIP_AUDIO_PROFILE_ID if str(raw.get("audioProfile", "")) == CHIP_AUDIO_PROFILE_ID or not chip_preset.is_empty() else (HEAVY_METAL_AUDIO_PROFILE_ID if str(raw.get("audioProfile", "")) == HEAVY_METAL_AUDIO_PROFILE_ID or not metal_preset.is_empty() else (LOFI_AUDIO_PROFILE_ID if str(raw.get("audioProfile", "")) == LOFI_AUDIO_PROFILE_ID or not lofi_preset.is_empty() else "standard"))
	data["lofiPreset"] = lofi_preset if data["audioProfile"] == LOFI_AUDIO_PROFILE_ID else ""
	data["lofiTexture"] = _sanitize_lofi_texture(raw.get("lofiTexture", {}), str(data["lofiPreset"]))
	data["chipPreset"] = (chip_preset if not chip_preset.is_empty() else DEFAULT_CHIP_PRESET_ID) if data["audioProfile"] == CHIP_AUDIO_PROFILE_ID else ""
	data["chipTexture"] = _sanitize_chip_texture(raw.get("chipTexture", {}), str(data["chipPreset"]))
	data["metalPreset"] = (metal_preset if not metal_preset.is_empty() else DEFAULT_METAL_PRESET_ID) if data["audioProfile"] == HEAVY_METAL_AUDIO_PROFILE_ID else ""
	data["metalTexture"] = _sanitize_metal_texture(raw.get("metalTexture", {}), str(data["metalPreset"]))
	if data["audioProfile"] != LOFI_AUDIO_PROFILE_ID:
		data["lofiTexture"]["enabled"] = false
	if data["audioProfile"] != CHIP_AUDIO_PROFILE_ID:
		data["chipTexture"]["enabled"] = false
	if data["audioProfile"] != HEAVY_METAL_AUDIO_PROFILE_ID:
		data["metalTexture"]["enabled"] = false
	data["drumKit"] = _safe_choice(str(raw.get("drumKit", "classic")), POCKET_DRUM_KITS, "classic", "drumKit", warnings)
	data["drumGroovePreset"] = str(raw.get("drumGroovePreset", ""))
	data["bassTone"] = _safe_choice(str(raw.get("bassTone", "classic")), POCKET_BASS_TONES, "classic", "bassTone", warnings)
	data["resolution"] = _sanitize_resolution(raw.get("resolution", 1), warnings)
	data["chordType"] = _safe_choice(str(raw.get("chordType", "triad")), ["triad", "seventh", "sus2", "sus4"], "triad", "chordType", warnings)
	data["chordInstrument"] = _safe_choice(str(raw.get("chordInstrument", DEFAULT_CHORD_INSTRUMENT)), POCKET_CHORD_INSTRUMENTS, DEFAULT_CHORD_INSTRUMENT, "chordInstrument", warnings)
	data["chordPlayMode"] = _safe_choice(str(raw.get("chordPlayMode", "block")), ["block", "strum_up", "strum_down", "arp_up", "arp_down"], "block", "chordPlayMode", warnings)
	data["chordRhythmMode"] = _safe_choice(str(raw.get("chordRhythmMode", "sustain")), ["sustain", "quarter", "half"], "sustain", "chordRhythmMode", warnings)
	data["chordOctave"] = _clamp_int(raw.get("chordOctave", 0), -2, 2, 0, "chordOctave", warnings)
	data["humanizeOn"] = bool(raw.get("humanizeOn", false))
	data["sidechainOn"] = bool(raw.get("sidechainOn", raw.get("pumpChordsEnabled", false)))
	data["sidechainAmount"] = _clamp_float(raw.get("sidechainAmount", raw.get("pumpAmount", 0.45)), 0.0, 1.0, 0.45, "sidechainAmount", warnings)
	data["fxDelay"] = _clamp_float(raw.get("fxDelay", 0.12), 0.0, 1.0, 0.12, "fxDelay", warnings)
	data["fxChorus"] = _clamp_float(raw.get("fxChorus", 0.18), 0.0, 1.0, 0.18, "fxChorus", warnings)
	data["fxFlanger"] = _clamp_float(raw.get("fxFlanger", 0.06), 0.0, 1.0, 0.06, "fxFlanger", warnings)
	data["fxReverb"] = _clamp_float(raw.get("fxReverb", 0.18), 0.0, 1.0, 0.18, "fxReverb", warnings)
	data["fxMix"] = _clamp_float(raw.get("fxMix", 0.65), 0.0, 1.0, 0.65, "fxMix", warnings)
	data["masterVolume"] = _clamp_float(raw.get("masterVolume", raw.get("masterVol", 0.82)), 0.0, 1.0, 0.82, "masterVolume", warnings)
	data["chordVolume"] = _clamp_float(raw.get("chordVolume", raw.get("chordVol", 0.72)), 0.0, 1.0, 0.72, "chordVolume", warnings)
	data["beatVolume"] = _clamp_float(raw.get("beatVolume", raw.get("beatVol", 0.86)), 0.0, 1.0, 0.86, "beatVolume", warnings)
	data["leadVolume"] = _clamp_float(raw.get("leadVolume", raw.get("leadVol", 0.65)), 0.0, 1.0, 0.65, "leadVolume", warnings)
	data["melodyPitchMode"] = _safe_choice(str(raw.get("melodyPitchMode", "scale")), ["scale", "chromatic"], "scale", "melodyPitchMode", warnings)
	data["melodyOctave"] = _clamp_int(raw.get("melodyOctave", 0), -2, 2, 0, "melodyOctave", warnings)
	data["bassMode"] = _safe_choice(str(raw.get("bassMode", "auto")), ["auto", "manual"], "auto", "bassMode", warnings)
	data["midiExportMode"] = _safe_choice(str(raw.get("midiExportMode", "quantized")), ["quantized", "performance"], "quantized", "midiExportMode", warnings)
	data["midiChordExport"] = _safe_choice(str(raw.get("midiChordExport", "played")), ["played", "block", "none"], "played", "midiChordExport", warnings)
	data["midiExactDurations"] = raw.get("midiExactDurations", true) != false
	data["guitarEnabled"] = bool(raw.get("guitarEnabled", false))
	data["guitarTone"] = _safe_choice(str(raw.get("guitarTone", DEFAULT_GUITAR_TONE)), POCKET_GUITAR_TONES, DEFAULT_GUITAR_TONE, "guitarTone", warnings)
	data["guitarRegister"] = _safe_choice(str(raw.get("guitarRegister", DEFAULT_GUITAR_REGISTER)), POCKET_GUITAR_REGISTERS, DEFAULT_GUITAR_REGISTER, "guitarRegister", warnings)
	data["guitarStrumMode"] = _safe_choice(str(raw.get("guitarStrumMode", DEFAULT_GUITAR_STRUM_MODE)), POCKET_GUITAR_STRUM_MODES, DEFAULT_GUITAR_STRUM_MODE, "guitarStrumMode", warnings)
	data["guitarPatternPreset"] = _safe_choice(str(raw.get("guitarPatternPreset", "metal_chug")), POCKET_GUITAR_PATTERN_PRESETS, "metal_chug", "guitarPatternPreset", warnings)
	data["guitarVolume"] = _clamp_float(raw.get("guitarVolume", 0.66), 0.0, 1.0, 0.66, "guitarVolume", warnings)
	data["sectionBars"] = _sanitize_section_bars(raw.get("sectionBars", raw.get("sectionLengths", {})), warnings)
	data["songSequence"] = _sanitize_song_sequence(raw.get("songSequence", raw.get("sectionSequence", DEFAULT_SONG_SEQUENCE)), warnings)

	var max_steps := _max_steps(data)
	for section_id in SECTION_IDS:
		data["progression%s" % section_id] = _sanitize_progression(raw.get("progression%s" % section_id, []), data["scale"])
		data["grid%s" % section_id] = _sanitize_grid(raw.get("grid%s" % section_id, {}), max_steps)
		data["gridTuplets%s" % section_id] = _sanitize_grid_tuplets(raw.get("gridTuplets%s" % section_id, {}), max_steps)

		var melody_source = raw.get("melodyTracks%s" % section_id, raw.get("melody%s" % section_id, []))
		var melody_tracks := _sanitize_melody_tracks(melody_source, max_steps)
		data["melodyTracks%s" % section_id] = melody_tracks
		var track_count := melody_tracks.size()
		data["melodyInstruments%s" % section_id] = _sanitize_instruments(raw.get("melodyInstruments%s" % section_id, []), track_count)
		data["melodyOctaves%s" % section_id] = _sanitize_octaves(raw.get("melodyOctaves%s" % section_id, []), track_count, int(data["melodyOctave"]))
		data["melodyMute%s" % section_id] = _sanitize_bool_list(raw.get("melodyMute%s" % section_id, []), track_count)
		data["melodySolo%s" % section_id] = _sanitize_bool_list(raw.get("melodySolo%s" % section_id, []), track_count)
		data["melodyPan%s" % section_id] = _sanitize_pan_list(raw.get("melodyPan%s" % section_id, []), track_count)
		data["melodyHold%s" % section_id] = _sanitize_track_list(raw.get("melodyHold%s" % section_id, []), track_count, max_steps, "bool")
		data["melodySlide%s" % section_id] = _sanitize_track_list(raw.get("melodySlide%s" % section_id, []), track_count, max_steps, "bool")
		data["melodyTuplets%s" % section_id] = _sanitize_track_list(raw.get("melodyTuplets%s" % section_id, []), track_count, max_steps, "bool")

		data["bassNotes%s" % section_id] = _rescale_nullable_note_track(raw.get("bassNotes%s" % section_id, []), max_steps, 13)
		data["bassAccent%s" % section_id] = _rescale_bool_interval_track(raw.get("bassAccent%s" % section_id, []), max_steps)
		data["bassHold%s" % section_id] = _rescale_bool_interval_track(raw.get("bassHold%s" % section_id, []), max_steps)
		data["bassSlide%s" % section_id] = _rescale_bool_interval_track(raw.get("bassSlide%s" % section_id, []), max_steps)
		data["guitarPattern%s" % section_id] = _sanitize_guitar_pattern(raw.get("guitarPattern%s" % section_id, []), max_steps)

	_clean_tuplets(data, warnings)
	_collect_metadata(raw, data, metadata, warnings)

	return {
		"project": data,
		"warnings": warnings,
		"errors": errors,
		"schema_version": schema_version,
		"migration_notes": migration_notes,
		"metadata": metadata,
	}


func _collect_metadata(raw: Dictionary, data: Dictionary, metadata: Dictionary, warnings: Array[String]) -> void:
	var supported_lookup := {}
	for key in TOP_LEVEL_SUPPORTED_KEYS:
		supported_lookup[key] = true
	for section_id in SECTION_IDS:
		for prefix in ["progression", "grid", "gridTuplets", "melodyTracks", "melodyInstruments", "melodyOctaves", "melodyMute", "melodySolo", "melodyPan", "melodyHold", "melodySlide", "melodyTuplets", "bassNotes", "bassAccent", "bassHold", "bassSlide", "guitarPattern"]:
			supported_lookup["%s%s" % [prefix, section_id]] = true

	var ignored_ui_fields: Array[String] = []
	var unknown_fields := {}
	for key in raw.keys():
		var key_string := str(key)
		if UI_ONLY_KEYS.has(key_string):
			ignored_ui_fields.append(key_string)
		elif not supported_lookup.has(key_string):
			unknown_fields[key_string] = raw[key]

	metadata["ignored_ui_fields"] = ignored_ui_fields
	metadata["unknown_fields"] = unknown_fields
	if not ignored_ui_fields.is_empty():
		warnings.append("Ignored %d Pocket Chordsmith UI-only field(s)." % ignored_ui_fields.size())
	if not unknown_fields.is_empty():
		warnings.append("Preserved %d unknown field(s) in import metadata." % unknown_fields.size())

	var game_metadata := {}
	for key in ["gameMetadata", "godotMetadata", "pcsMetadata"]:
		if raw.get(key) is Dictionary:
			for meta_key in raw[key].keys():
				game_metadata[meta_key] = raw[key][meta_key]
	for key in ["level_id", "default_loop", "mood", "intensity_tags", "markers", "loop_regions", "gameplay_flags", "accent_map", "music_states", "default_music_state", "stem_sets", "state_stem_sets", "audioProfile", "lofiPreset", "lofiTexture", "chipPreset", "chipTexture", "metalPreset", "metalTexture", "drumKit", "drumGroovePreset", "bassTone"]:
		if raw.has(key):
			game_metadata[key] = raw[key]
	for key in ["audioProfile", "lofiPreset", "lofiTexture", "chipPreset", "chipTexture", "metalPreset", "metalTexture", "drumKit", "drumGroovePreset", "bassTone"]:
		if data.has(key):
			game_metadata[key] = data[key]
	metadata["game_metadata"] = game_metadata


func _clean_tuplets(data: Dictionary, warnings: Array[String]) -> void:
	for section_id in SECTION_IDS:
		var section_steps := _section_steps(data, section_id)
		var grid: Dictionary = data["grid%s" % section_id]
		var grid_tuplets: Dictionary = data["gridTuplets%s" % section_id]
		for track_id in TRACK_IDS:
			var tuplets: Array = grid_tuplets.get(track_id, [])
			_normalize_tuplet_starts(tuplets, section_steps, func(step: int) -> bool:
				return _beat_level((grid.get(track_id, []) as Array)[step]) > 0 and _beat_level((grid.get(track_id, []) as Array)[step + 1]) > 0
			, "Section %s %s" % [section_id, track_id], warnings)

		var melody_tracks: Array = data["melodyTracks%s" % section_id]
		var melody_tuplets: Array = data["melodyTuplets%s" % section_id]
		for track_index in range(melody_tracks.size()):
			var track: Array = melody_tracks[track_index]
			var tuplets: Array = melody_tuplets[track_index]
			_normalize_tuplet_starts(tuplets, section_steps, func(step: int) -> bool:
				return track[step] != null and track[step + 1] != null
			, "Section %s melody %d" % [section_id, track_index + 1], warnings)


func _normalize_tuplet_starts(tuplets: Array, section_steps: int, is_valid_start: Callable, label: String, warnings: Array[String]) -> void:
	var blocked_until := -1
	for step in range(tuplets.size()):
		if not bool(tuplets[step]):
			continue
		var valid := step < section_steps - 1 and bool(is_valid_start.call(step))
		if not valid or step <= blocked_until:
			tuplets[step] = false
			warnings.append("%s tuplet at step %d was ignored because it is invalid or overlaps another tuplet." % [label, step + 1])
			continue
		blocked_until = step + 1
	for step in range(section_steps, tuplets.size()):
		tuplets[step] = false


func _sanitize_time_signature(value, warnings: Array[String]) -> int:
	var time_sig := _as_int(value, 4)
	if time_sig == 3 or time_sig == 4:
		return time_sig
	warnings.append("Unsupported timeSig %s was normalised to 4." % str(value))
	return 4


func _sanitize_resolution(value, warnings: Array[String]) -> int:
	var resolution := _as_int(value, 1)
	if [1, 2, 4, 8, 16].has(resolution):
		return resolution
	if resolution == 3:
		warnings.append("Triplet resolution value 3 was normalised to 2; tuplets are stored as markers.")
		return 2
	warnings.append("Unsupported resolution %s was normalised to 1." % str(value))
	return 1


func _sanitize_section_bars(raw, warnings: Array[String]) -> Dictionary:
	var out := {}
	for section_id in SECTION_IDS:
		var value = raw.get(section_id, DEFAULT_SECTION_BARS[section_id]) if raw is Dictionary else DEFAULT_SECTION_BARS[section_id]
		out[section_id] = _clamp_int(value, 1, MAX_BARS, DEFAULT_SECTION_BARS[section_id], "sectionBars.%s" % section_id, warnings)
	return out


func _sanitize_song_sequence(raw, warnings: Array[String]) -> Array[String]:
	var source: Array = raw if raw is Array and not raw.is_empty() else DEFAULT_SONG_SEQUENCE
	var out: Array[String] = []
	for value in source.slice(0, MAX_SEQUENCE_SLOTS):
		var section_id := _sanitize_section_id(str(value))
		if section_id.is_empty():
			warnings.append("Ignored invalid songSequence entry '%s'." % str(value))
			continue
		out.append(section_id)
	if out.is_empty():
		out.append("A")
		warnings.append("Empty songSequence was normalised to Section A.")
	return out


func _sanitize_section_id(value: String) -> String:
	return value if SECTION_IDS.has(value) else ""


func _sanitize_progression(raw, scale_name: String) -> Array:
	var defaults := DEFAULT_MINOR_PROGRESSION if scale_name == "minor" else DEFAULT_MAJOR_PROGRESSION
	var source: Array = raw if raw is Array and not raw.is_empty() else defaults
	var out := []
	for index in range(MAX_BARS):
		var fallback := int(defaults[index]) if index < defaults.size() else 0
		var value = source[index] if index < source.size() else fallback
		if value is Dictionary:
			value = value.get("degree", fallback)
		out.append(clamp(_as_int(value, fallback), 0, 6))
	return out


func _sanitize_grid(raw, max_steps: int) -> Dictionary:
	var out := {}
	for track_id in TRACK_IDS:
		var source = raw.get(track_id, []) if raw is Dictionary else []
		out[track_id] = _rescale_beat_track(source, max_steps)
	return out


func _sanitize_grid_tuplets(raw, max_steps: int) -> Dictionary:
	var out := {}
	for track_id in TRACK_IDS:
		var source = raw.get(track_id, []) if raw is Dictionary else []
		out[track_id] = _rescale_bool_interval_track(source, max_steps)
	return out


func _sanitize_melody_tracks(raw, max_steps: int) -> Array:
	var source: Array = raw if raw is Array and not raw.is_empty() else []
	if source.is_empty():
		return [_blank_nullable(max_steps)]
	if source.size() > MAX_MELODY_TRACKS:
		source = source.slice(0, MAX_MELODY_TRACKS)
	var out := []
	for track in source:
		out.append(_rescale_nullable_note_track(track, max_steps, 23))
	return out


func _sanitize_track_list(raw, track_count: int, max_steps: int, mode: String) -> Array:
	var source: Array = raw if raw is Array else []
	var out := []
	for index in range(track_count):
		var track = source[index] if index < source.size() else []
		if mode == "bool":
			out.append(_rescale_bool_interval_track(track, max_steps))
		else:
			out.append(_rescale_nullable_note_track(track, max_steps, 23))
	return out


func _sanitize_instruments(raw, track_count: int) -> Array[String]:
	var source: Array = raw if raw is Array else []
	var out: Array[String] = []
	for index in range(track_count):
		var value := str(source[index]) if index < source.size() else DEFAULT_MELODY_INSTRUMENT
		out.append(value if POCKET_MELODY_INSTRUMENTS.has(value) else DEFAULT_MELODY_INSTRUMENT)
	return out


func _sanitize_lofi_preset(value: String) -> String:
	return value if LOFI_STYLE_PRESETS.has(value) else ""


func _sanitize_chip_preset(value: String) -> String:
	return value if CHIP_STYLE_PRESETS.has(value) else ""


func _sanitize_metal_preset(value: String) -> String:
	return value if METAL_STYLE_PRESETS.has(value) else ""


func _sanitize_lofi_texture(raw, preset_id := "") -> Dictionary:
	var source: Dictionary = raw if raw is Dictionary else {}
	var preset_texture: Dictionary = LOFI_STYLE_PRESET_TEXTURES.get(preset_id, {})
	return {
		"enabled": bool(source.get("enabled", preset_texture.get("enabled", false))),
		"vinylCrackle": clamp(_as_float(source.get("vinylCrackle", preset_texture.get("vinylCrackle", 0.08)), 0.08), 0.0, 1.0),
		"tapeHiss": clamp(_as_float(source.get("tapeHiss", preset_texture.get("tapeHiss", 0.05)), 0.05), 0.0, 1.0),
		"wowFlutter": clamp(_as_float(source.get("wowFlutter", preset_texture.get("wowFlutter", 0.03)), 0.03), 0.0, 1.0),
		"warmth": clamp(_as_float(source.get("warmth", preset_texture.get("warmth", 0.16)), 0.16), 0.0, 1.0),
		"lowPassAge": clamp(_as_float(source.get("lowPassAge", preset_texture.get("lowPassAge", 0.22)), 0.22), 0.0, 1.0),
		"bitCrush": clamp(_as_float(source.get("bitCrush", preset_texture.get("bitCrush", 0.01)), 0.01), 0.0, 1.0),
	}


func _sanitize_chip_texture(raw, preset_id := "") -> Dictionary:
	var source: Dictionary = raw if raw is Dictionary else {}
	var preset_texture: Dictionary = CHIP_STYLE_PRESET_TEXTURES.get(preset_id, {})
	return {
		"enabled": bool(source.get("enabled", preset_texture.get("enabled", false))),
		"bitDepth": clamp(_as_float(source.get("bitDepth", preset_texture.get("bitDepth", 0.18)), 0.18), 0.0, 1.0),
		"sampleRateCrush": clamp(_as_float(source.get("sampleRateCrush", preset_texture.get("sampleRateCrush", 0.14)), 0.14), 0.0, 1.0),
		"pulseWidth": clamp(_as_float(source.get("pulseWidth", preset_texture.get("pulseWidth", 0.5)), 0.5), 0.0, 1.0),
		"pitchDrift": clamp(_as_float(source.get("pitchDrift", preset_texture.get("pitchDrift", 0.02)), 0.02), 0.0, 1.0),
		"saturation": clamp(_as_float(source.get("saturation", preset_texture.get("saturation", 0.18)), 0.18), 0.0, 1.0),
		"stereoSpread": clamp(_as_float(source.get("stereoSpread", preset_texture.get("stereoSpread", 0.12)), 0.12), 0.0, 1.0),
	}


func _sanitize_metal_texture(raw, preset_id := "") -> Dictionary:
	var source: Dictionary = raw if raw is Dictionary else {}
	var preset_texture: Dictionary = METAL_STYLE_PRESET_TEXTURES.get(preset_id, {})
	return {
		"enabled": bool(source.get("enabled", preset_texture.get("enabled", false))),
		"drive": clamp(_as_float(source.get("drive", preset_texture.get("drive", 0.45)), 0.45), 0.0, 1.0),
		"palmMute": clamp(_as_float(source.get("palmMute", preset_texture.get("palmMute", 0.68)), 0.68), 0.0, 1.0),
		"lowTightness": clamp(_as_float(source.get("lowTightness", preset_texture.get("lowTightness", 0.78)), 0.78), 0.0, 1.0),
		"presence": clamp(_as_float(source.get("presence", preset_texture.get("presence", 0.55)), 0.55), 0.0, 1.0),
		"roomSize": clamp(_as_float(source.get("roomSize", preset_texture.get("roomSize", 0.14)), 0.14), 0.0, 1.0),
		"pickAttack": clamp(_as_float(source.get("pickAttack", preset_texture.get("pickAttack", 0.7)), 0.7), 0.0, 1.0),
	}


func _sanitize_octaves(raw, track_count: int, fallback: int) -> Array[int]:
	var source: Array = raw if raw is Array else []
	var out: Array[int] = []
	for index in range(track_count):
		var value = source[index] if index < source.size() else fallback
		out.append(clamp(_as_int(value, fallback), -2, 2))
	return out


func _sanitize_bool_list(raw, track_count: int) -> Array[bool]:
	var source: Array = raw if raw is Array else []
	var out: Array[bool] = []
	for index in range(track_count):
		out.append(bool(source[index]) if index < source.size() else false)
	return out


func _sanitize_pan_list(raw, track_count: int) -> Array[float]:
	var source: Array = raw if raw is Array else []
	var out: Array[float] = []
	for index in range(track_count):
		var value = source[index] if index < source.size() else 0.0
		out.append(clamp(_as_float(value, 0.0), -1.0, 1.0))
	return out


func _sanitize_guitar_pattern(raw, new_len: int) -> Array[String]:
	var old: Array = raw if raw is Array else []
	var next: Array[String] = []
	next.resize(new_len)
	next.fill("off")
	if old.is_empty():
		return next
	if old.size() == new_len:
		for index in range(new_len):
			next[index] = _normalize_guitar_articulation(old[index])
		return next
	for index in range(old.size()):
		var articulation := _normalize_guitar_articulation(old[index])
		if articulation == "off":
			continue
		var target_index := _rescale_step_index(index, old.size(), new_len)
		next[target_index] = articulation
	return next


func _normalize_guitar_articulation(value) -> String:
	var articulation := str(value).to_lower()
	if articulation in ["mute", "palm", "pm"]:
		articulation = "chug"
	elif articulation in ["sustain"]:
		articulation = "hold"
	elif articulation in ["dead", "dead_mute"]:
		articulation = "scratch"
	return articulation if GUITAR_ARTICULATIONS.has(articulation) else "off"


func _rescale_beat_track(track, new_len: int) -> Array:
	var old: Array = track if track is Array else []
	var next := _blank_int(new_len)
	if old.is_empty():
		return next
	if old.size() == new_len:
		for index in range(new_len):
			next[index] = _beat_level(old[index])
		return next
	for index in range(old.size()):
		var level := _beat_level(old[index])
		if level <= 0:
			continue
		var target_index := _rescale_step_index(index, old.size(), new_len)
		next[target_index] = max(int(next[target_index]), level)
	return next


func _rescale_nullable_note_track(track, new_len: int, max_note: int) -> Array:
	var old: Array = track if track is Array else []
	var next := _blank_nullable(new_len)
	if old.is_empty():
		return next
	if old.size() == new_len:
		for index in range(new_len):
			if old[index] != null:
				next[index] = clamp(_as_int(old[index], 0), 0, max_note)
		return next
	for index in range(old.size()):
		if old[index] == null:
			continue
		var target_index := _rescale_step_index(index, old.size(), new_len)
		next[target_index] = clamp(_as_int(old[index], 0), 0, max_note)
	return next


func _rescale_bool_interval_track(track, new_len: int) -> Array:
	var old: Array = track if track is Array else []
	var next := _blank_bool(new_len)
	if old.is_empty():
		return next
	if old.size() == new_len:
		for index in range(new_len):
			next[index] = bool(old[index])
		return next
	for index in range(old.size()):
		if not bool(old[index]):
			continue
		var start := _rescale_boundary_index(index, old.size(), new_len)
		var end: int = max(start + 1, _rescale_boundary_index(index + 1, old.size(), new_len))
		for target_index in range(start, min(end, new_len)):
			next[target_index] = true
	return next


func _rescale_step_index(index: int, old_len: int, new_len: int) -> int:
	if old_len <= 0 or new_len <= 0:
		return 0
	return clamp(int(round((float(index) / float(old_len)) * float(new_len))), 0, new_len - 1)


func _rescale_boundary_index(index: int, old_len: int, new_len: int) -> int:
	if old_len <= 0 or new_len <= 0:
		return 0
	return clamp(int(round((float(index) / float(old_len)) * float(new_len))), 0, new_len)


func _max_steps(data: Dictionary) -> int:
	return MAX_BARS * int(data.get("timeSig", 4)) * int(data.get("resolution", 1))


func _section_steps(data: Dictionary, section_id: String) -> int:
	var bars := int((data.get("sectionBars", {}) as Dictionary).get(section_id, MAX_BARS))
	return bars * int(data.get("timeSig", 4)) * int(data.get("resolution", 1))


func _blank_int(size: int) -> Array:
	var out := []
	out.resize(size)
	out.fill(0)
	return out


func _blank_bool(size: int) -> Array:
	var out := []
	out.resize(size)
	out.fill(false)
	return out


func _blank_nullable(size: int) -> Array:
	var out := []
	out.resize(size)
	out.fill(null)
	return out


func _beat_level(value) -> int:
	if value == null:
		return 0
	if typeof(value) == TYPE_BOOL:
		return 1 if bool(value) else 0
	if value is String and str(value).is_empty():
		return 0
	return clamp(_as_int(value, 0), 0, 2)


func _safe_choice(value: String, allowed: Array, fallback: String, label: String, warnings: Array[String]) -> String:
	if allowed.has(value):
		return value
	warnings.append("Unsupported %s '%s' was normalised to '%s'." % [label, value, fallback])
	return fallback


func _clamp_int(value, min_value: int, max_value: int, fallback: int, label: String, warnings: Array[String]) -> int:
	var parsed := _as_int(value, fallback)
	var clamped := clamp(parsed, min_value, max_value)
	if parsed != clamped:
		warnings.append("%s value %s was clamped to %s." % [label, str(value), str(clamped)])
	return clamped


func _clamp_float(value, min_value: float, max_value: float, fallback: float, label: String, warnings: Array[String]) -> float:
	var parsed := _as_float(value, fallback)
	var clamped := clamp(parsed, min_value, max_value)
	if not is_equal_approx(parsed, clamped):
		warnings.append("%s value %s was clamped to %s." % [label, str(value), str(clamped)])
	return clamped


func _as_int(value, fallback: int) -> int:
	if value is int:
		return value
	if value is float:
		return int(value)
	var string_value := str(value)
	if string_value.is_valid_int():
		return string_value.to_int()
	if string_value.is_valid_float():
		return int(string_value.to_float())
	return fallback


func _as_float(value, fallback: float) -> float:
	if value is int or value is float:
		return float(value)
	var string_value := str(value)
	if string_value.is_valid_float():
		return string_value.to_float()
	return fallback
