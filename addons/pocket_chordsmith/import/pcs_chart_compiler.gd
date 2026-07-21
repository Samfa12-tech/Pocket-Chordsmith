@tool
extends RefCounted
class_name PCSChartCompiler

const ChartResource := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const SectionResource := preload("res://addons/pocket_chordsmith/resources/pcs_section_resource.gd")
const SoundProfileContract := preload("res://addons/pocket_chordsmith/import/pcs_sound_profile_contract.gd")

const SECTION_IDS := ["A", "B", "C", "D", "E", "F", "G", "H"]
const DRUM_TRACKS := ["kick", "snare", "hat"]
const EXPANDED_DRUM_LANES := SoundProfileContract.DRUM_LANES
const GRID_TRACKS := ["kick", "snare", "hat", "bass"]
const GUITAR_ARTICULATIONS := ["off", "open", "chug", "accent", "hold", "scratch"]
const NOTE_NAMES := ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const MAJOR_SCALE := [0, 2, 4, 5, 7, 9, 11]
const MINOR_SCALE := [0, 2, 3, 5, 7, 8, 10]
const MAJOR_QUALITIES := ["maj", "min", "min", "maj", "maj", "min", "dim"]
const MINOR_QUALITIES := ["min", "dim", "maj", "min", "min", "maj", "maj"]
const TICKS_PER_QUARTER := 480
const PHRASE_MINIMUM_SECONDS := 0.18
const PITCHED_TUPLET_MINIMUM_SECONDS := 0.08

var _active_project := {}


func compile_project(project: Dictionary, import_result := {}) -> Resource:
	_active_project = project
	var warnings: Array[String] = []
	if import_result is Dictionary:
		warnings.append_array(import_result.get("warnings", []))

	var chart = ChartResource.new()
	chart.source_path = _metadata_source_path(import_result)
	chart.source_project_version = int(project.get("projectVersion", 0))
	chart.schema_version = int(project.get("projectVersion", 16))
	chart.imported_at_unix_time = int(Time.get_unix_time_from_system())
	chart.bpm = int(project.get("bpm", 120))
	chart.time_signature = int(project.get("timeSig", 4))
	chart.swing = clamp(float(project.get("swing", 0.0)), 0.0, 0.35)
	chart.key = str(project.get("key", "C"))
	chart.scale = str(project.get("scale", "major"))
	chart.resolution = int(project.get("resolution", 1))
	chart.ticks_per_quarter = TICKS_PER_QUARTER
	chart.original_metadata = _metadata(import_result)
	chart.audio_profile = str(project.get("audioProfile", "standard"))
	chart.sound_profile = _dictionary_or_empty(project.get("soundProfile", {})).duplicate(true)
	chart.format_features = _string_array(project.get("formatFeatures", []))
	chart.profile_metadata = _dictionary_or_empty(project.get("profileMetadata", project.get("%sMetadata" % chart.audio_profile, {}))).duplicate(true)
	chart.rich_sections = _dictionary_or_empty(project.get("sections", project.get("richEvents", {}))).duplicate(true)
	chart.capability_report = SoundProfileContract.negotiate(project)
	chart.lofi_preset = str(project.get("lofiPreset", ""))
	chart.lofi_texture = _dictionary_or_empty(project.get("lofiTexture", {})).duplicate(true)
	chart.chip_preset = str(project.get("chipPreset", ""))
	chart.chip_texture = _dictionary_or_empty(project.get("chipTexture", {})).duplicate(true)
	chart.metal_preset = str(project.get("metalPreset", ""))
	chart.metal_texture = _dictionary_or_empty(project.get("metalTexture", {})).duplicate(true)
	chart.drum_kit = str(project.get("drumKit", "classic"))
	chart.drum_groove_preset = str(project.get("drumGroovePreset", ""))
	chart.bass_tone = str(project.get("bassTone", "classic"))
	chart.mix_volumes = _mix_volumes(project)
	chart.performance_settings = _performance_settings(project)

	var game_metadata := _game_metadata(import_result)
	if chart.audio_profile == "lofi_chill":
		chart.lofi_intensity_hints = {
			"menu": 0.42,
			"explore": 0.58,
			"night": 0.72,
			"rain": 0.68,
		}
		if game_metadata.has("lofi_intensity_hints"):
			chart.lofi_intensity_hints = _dictionary_or_empty(game_metadata.get("lofi_intensity_hints", {}))
	if chart.audio_profile == "chip_arcade":
		chart.chip_intensity_hints = {
			"menu": 0.48,
			"explore": 0.66,
			"boss": 0.84,
			"victory": 0.92,
		}
		if game_metadata.has("chip_intensity_hints"):
			chart.chip_intensity_hints = _dictionary_or_empty(game_metadata.get("chip_intensity_hints", {}))
	if chart.audio_profile == "heavy_metal":
		chart.metal_intensity_hints = {
			"menu": 0.38,
			"explore": 0.68,
			"combat": 0.86,
			"boss": 0.95,
			"breakdown": 0.78,
		}
		if game_metadata.has("metal_intensity_hints"):
			chart.metal_intensity_hints = _dictionary_or_empty(game_metadata.get("metal_intensity_hints", {}))
	chart.level_id = str(game_metadata.get("level_id", ""))
	chart.default_loop = str(game_metadata.get("default_loop", ""))
	chart.mood = str(game_metadata.get("mood", ""))
	chart.intensity_tags = _dictionary_or_empty(game_metadata.get("intensity_tags", {}))
	chart.music_states = _dictionary_or_empty(game_metadata.get("music_states", {}))
	chart.default_music_state = str(game_metadata.get("default_music_state", ""))
	chart.stem_sets = _dictionary_or_empty(game_metadata.get("stem_sets", {}))
	chart.gameplay_flags = _dictionary_or_empty(game_metadata.get("gameplay_flags", {}))
	chart.accent_map = _dictionary_or_empty(game_metadata.get("accent_map", {}))
	chart.loop_regions = _array_of_dictionaries(game_metadata.get("loop_regions", []))
	chart.markers = _sanitize_markers(game_metadata.get("markers", []), warnings)

	var arrangement := _sanitize_arrangement(project.get("songSequence", []))
	chart.arrangement = arrangement
	chart.section_source_data = _build_section_source_data(project)
	chart.section_library = _build_section_library(project)

	var events: Array[Dictionary] = []
	var arrangement_positions: Array[Dictionary] = []
	var section_cursor_tick := 0
	for arrangement_index in range(arrangement.size()):
		var section_id := str(arrangement[arrangement_index])
		var bars := _section_bars(project, section_id)
		var length_ticks := _section_length_ticks(project, section_id)
		var section_resource = SectionResource.new()
		section_resource.id = section_id
		section_resource.arrangement_index = arrangement_index
		section_resource.bars = bars
		section_resource.start_tick = section_cursor_tick
		section_resource.length_ticks = length_ticks
		section_resource.chord_progression = _progression(project, section_id).duplicate(true)
		section_resource.track_summary = chart.section_library.get(section_id, {}).get("track_summary", {})
		chart.sections.append(section_resource)

		arrangement_positions.append({
			"id": section_id,
			"arrangement_index": arrangement_index,
			"start_tick": section_cursor_tick,
			"length_ticks": length_ticks,
			"bars": bars,
		})
		events.append_array(_compile_section_events(project, section_id, arrangement_index, section_cursor_tick, warnings))
		section_cursor_tick += length_ticks

	chart.arrangement_positions = arrangement_positions
	events.append_array(_compile_marker_events(chart.markers, arrangement_positions, warnings))
	events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var tick_a := int(a.get("tick", 0))
		var tick_b := int(b.get("tick", 0))
		if tick_a == tick_b:
			return _event_sort_rank(a) < _event_sort_rank(b)
		return tick_a < tick_b
	)
	chart.compiled_events = events
	chart.expressive_event_count = _expressive_event_count(events)
	chart.import_warnings = warnings
	return chart


func _compile_section_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int, warnings: Array[String]) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var rich_tracks := _rich_track_ids(project, section_id)
	events.append_array(_compile_rich_events(project, section_id, arrangement_index, section_start_tick, warnings))
	if not rich_tracks.has("chord"):
		events.append_array(_compile_chord_events(project, section_id, arrangement_index, section_start_tick))
	if not rich_tracks.has("drums") and not rich_tracks.has("drum"):
		events.append_array(_compile_drum_events(project, section_id, arrangement_index, section_start_tick))
	if not rich_tracks.has("bass"):
		events.append_array(_compile_bass_events(project, section_id, arrangement_index, section_start_tick))
	if not rich_tracks.has("guitar"):
		events.append_array(_compile_guitar_events(project, section_id, arrangement_index, section_start_tick))
	if not rich_tracks.has("melody"):
		events.append_array(_compile_melody_events(project, section_id, arrangement_index, section_start_tick))
	return events


func _rich_track_ids(project: Dictionary, section_id: String) -> Array[String]:
	var sections: Dictionary = project.get("sections", project.get("richEvents", {})) if project.get("sections", project.get("richEvents", {})) is Dictionary else {}
	var section: Dictionary = sections.get(section_id, {}) if sections.get(section_id, {}) is Dictionary else {}
	var tracks: Dictionary = section.get("tracks", {}) if section.get("tracks", {}) is Dictionary else {}
	var out: Array[String] = []
	for track_id in tracks.keys():
		var canonical := _rich_track_type(str(track_id), {})
		if not canonical.is_empty() and not out.has(canonical):
			out.append(canonical)
	return out


func _compile_rich_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int, warnings: Array[String]) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var sections: Dictionary = project.get("sections", project.get("richEvents", {})) if project.get("sections", project.get("richEvents", {})) is Dictionary else {}
	var section: Dictionary = sections.get(section_id, {}) if sections.get(section_id, {}) is Dictionary else {}
	var tracks: Dictionary = section.get("tracks", {}) if section.get("tracks", {}) is Dictionary else {}
	for track_key in tracks.keys():
		var track_value = tracks[track_key]
		var track: Dictionary = track_value if track_value is Dictionary else {}
		var events: Array = track.get("events", []) if track.get("events", []) is Array else (track_value if track_value is Array else [])
		for event_index in range(events.size()):
			var raw_event = events[event_index]
			if not (raw_event is Dictionary):
				warnings.append("Ignored non-dictionary rich event %s.%s[%d]." % [section_id, str(track_key), event_index])
				continue
			var rich: Dictionary = raw_event.duplicate(true)
			var track_type := _rich_track_type(str(track_key), rich)
			if track_type.is_empty():
				warnings.append("Ignored rich event with unsupported track '%s'." % str(track_key))
				continue
			var source_step := int(rich.get("step", -1)) if rich.has("step") else -1
			var local_tick := int(rich.get("tick", 0)) if rich.has("tick") else _step_to_tick(project, max(0, source_step))
			var duration_value := rich.get("durationTicks", rich.get("duration_ticks", null))
			var duration_ticks := int(duration_value) if duration_value != null else int(rich.get("duration", 1)) * (_ticks_per_step(project) if source_step >= 0 else 1)
			var notes_source: Array = rich.get("notes", []) if rich.get("notes", []) is Array else []
			var note_source := rich.get("note", null)
			if notes_source.is_empty() and note_source != null:
				notes_source = [note_source]
			var midi_notes: Array[int] = []
			for note_value in notes_source:
				var midi := _rich_note_to_midi(note_value)
				if midi >= 0:
					midi_notes.append(midi)
			var midi_note := int(midi_notes[0]) if not midi_notes.is_empty() else -1
			var articulation := str(rich.get("articulation", ""))
			var lane := str(rich.get("lane", rich.get("drumLane", track_key)))
			var sound := str(rich.get("sound", rich.get("instrument", track.get("sound", lane if track_type == "drum" else track_key))))
			var instrument_id := lane if track_type == "drum" else sound
			if track_type == "drum" and midi_note < 0:
				midi_note = _rich_drum_midi(lane)
			var role := str(rich.get("role", track.get("role", "")))
			var expression: Dictionary = rich.get("expression", {}) if rich.get("expression", {}) is Dictionary else {}
			var technique: Dictionary = rich.get("technique", {}) if rich.get("technique", {}) is Dictionary else {}
			var flags := {
				"accent": articulation == "accent" or articulation == "slap" or articulation == "pop" or bool(rich.get("accent", false)),
				"tuplet": false,
				"hold": articulation == "hold",
				"slide": articulation == "slide",
				"muted": articulation in ["mute", "ghost", "scratch"],
				"solo": false,
				"generated": false,
				"audio_profile": str(project.get("audioProfile", "standard")),
				"sound_profile": str(_dictionary_or_empty(project.get("soundProfile", {})).get("id", project.get("audioProfile", "standard"))),
				"sound": sound,
				"role": role,
				"articulation": articulation,
				"expression": expression.duplicate(true),
				"technique": technique.duplicate(true),
				"midi_notes": midi_notes,
				"rich_event": rich.duplicate(true),
			}
			var velocity := clamp(int(rich.get("velocity", 100)), 0, 127)
			var pan := clamp(float(expression.get("pan", rich.get("pan", 0.0))), -1.0, 1.0)
			var event := _make_event(
				section_start_tick + max(0, local_tick), max(1, duration_ticks), section_id, track_type, int(rich.get("trackIndex", track.get("trackIndex", 0))), instrument_id, midi_note, velocity, pan, flags,
				source_step, _step_to_bar(project, max(0, source_step)), arrangement_index, -1, source_step
			)
			event["step"] = source_step
			event["notes"] = midi_notes.duplicate()
			event["note"] = note_source if note_source != null else -1
			event["articulation"] = articulation
			event["sound"] = sound
			event["role"] = role
			event["expression"] = expression.duplicate(true)
			event["technique"] = technique.duplicate(true)
			event["source_event"] = rich.duplicate(true)
			out.append(event)
	return out


func _rich_track_type(track_key: String, event: Dictionary) -> String:
	var value := str(event.get("track", track_key)).to_lower()
	if value in ["drums", "drum"] or EXPANDED_DRUM_LANES.has(value) or value in ["hat", "kick", "snare"]:
		return "drum"
	return value if value in ["bass", "chord", "guitar", "melody"] else ""


func _rich_note_to_midi(value) -> int:
	if value == null:
		return -1
	var note_value := int(value)
	if note_value < 0:
		return -1
	return clamp(note_value, 0, 127)


func _rich_drum_midi(lane: String) -> int:
	match lane:
		"kick", "tom_low":
			return 36
		"snare", "rim", "tom_mid":
			return 38
		"clap":
			return 39
		"hat_closed":
			return 42
		"hat_open":
			return 46
		"ride":
			return 51
		"crash":
			return 49
		"china":
			return 52
		"tom_high":
			return 50
		_:
			return 39


func _compile_chord_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var bars := _section_bars(project, section_id)
	var progression := _progression(project, section_id)
	for bar in range(bars):
		var degree := int(progression[bar % progression.size()])
		var bar_tick := section_start_tick + bar * int(project.get("timeSig", 4)) * TICKS_PER_QUARTER
		var source_step: int = bar * max(1, int(project.get("timeSig", 4)) * int(project.get("resolution", 1)))
		for rhythm in _chord_rhythm_starts(project, bar_tick):
			var start_tick := int(rhythm[0])
			var duration_ticks := int(rhythm[1])
			var midi_notes := _chord_midi_notes(project, degree)
			events.append(_make_event(
				start_tick,
				duration_ticks,
				section_id,
				"chord",
				0,
				_chord_name(project, degree),
				int(midi_notes[0]),
				76,
				0.0,
				{
					"accent": false,
					"tuplet": false,
					"hold": duration_ticks > TICKS_PER_QUARTER,
					"slide": false,
					"muted": false,
					"solo": false,
					"generated": false,
					"chord_degree": degree,
					"chord_quality": _triad_quality(project, degree),
					"chord_instrument": str(project.get("chordInstrument", "pocket")),
					"chord_play_mode": str(project.get("chordPlayMode", "block")),
					"audio_profile": str(project.get("audioProfile", "standard")),
					"lofi_preset": str(project.get("lofiPreset", "")),
					"chip_preset": str(project.get("chipPreset", "")),
					"midi_notes": midi_notes,
				},
				source_step,
				bar,
				arrangement_index
			))
	return events


func _compile_drum_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var step_ticks := _ticks_per_step(project)
	var step_count := _section_step_count(project, section_id)
	var grid: Dictionary = project.get("grid%s" % section_id, {})
	var tuplets: Dictionary = project.get("gridTuplets%s" % section_id, {})
	for step in range(step_count):
		for track_index in range(DRUM_TRACKS.size()):
			var track_id := str(DRUM_TRACKS[track_index])
			if _grid_tuplet_second(grid, tuplets, track_id, step, step_count):
				continue
			var level := _grid_level(grid, track_id, step)
			if level <= 0:
				continue
			var tick := section_start_tick + _step_to_tick(project, step)
			if _grid_tuplet_start(grid, tuplets, track_id, step, step_count):
				var next_level := _grid_level(grid, track_id, step + 1)
				var span_ticks := max(1, _step_to_tick(project, step + 2) - _step_to_tick(project, step))
				var offsets := _triplet_offsets(span_ticks)
				for triplet_index in range(3):
					var hit_level := next_level if triplet_index == 2 else level
					events.append(_make_drum_event(
						tick + int(offsets[triplet_index]),
						_drum_tuplet_duration_ticks(project, track_id, hit_level, span_ticks),
						section_id,
						arrangement_index,
						track_index,
						track_id,
						hit_level,
						step,
						_step_to_bar(project, step),
						true,
						triplet_index == 1,
						str(project.get("audioProfile", "standard")),
						str(project.get("lofiPreset", "")),
						str(project.get("chipPreset", "")),
						str(project.get("drumKit", "classic")),
						step + triplet_index
					))
			else:
				events.append(_make_drum_event(
					tick,
					_drum_duration_ticks(project, track_id, level, step),
					section_id,
					arrangement_index,
					track_index,
					track_id,
					level,
					step,
					_step_to_bar(project, step),
					false,
					false,
					str(project.get("audioProfile", "standard")),
					str(project.get("lofiPreset", "")),
					str(project.get("chipPreset", "")),
					str(project.get("drumKit", "classic")),
					step
				))
	return events


func _drum_duration_ticks(project: Dictionary, track_id: String, level: int, step: int) -> int:
	var step_ticks := _step_duration_ticks(project, step)
	var cap := _seconds_to_ticks(project, 0.025)
	if track_id == "kick":
		cap = _seconds_to_ticks(project, 0.10)
	elif track_id == "snare":
		cap = _seconds_to_ticks(project, 0.08)
	elif level > 1:
		cap = _seconds_to_ticks(project, 0.12)
	var step_mul := 0.75 if track_id == "hat" and level > 1 else 0.70
	return max(1, min(cap, int(round(float(step_ticks) * step_mul))))


func _drum_tuplet_duration_ticks(project: Dictionary, track_id: String, level: int, span_ticks: int) -> int:
	var cap := _seconds_to_ticks(project, 0.12) if track_id == "hat" and level > 1 else _seconds_to_ticks(project, 0.08)
	return max(1, min(cap, int(round(float(span_ticks) / 3.0 * 0.70))))


func _pitched_tuplet_duration_ticks(project: Dictionary, span_ticks: int) -> int:
	return max(_seconds_to_ticks(project, PITCHED_TUPLET_MINIMUM_SECONDS), int(round(float(span_ticks) / 3.0 * 0.86)))


func _compile_bass_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var step_ticks := _ticks_per_step(project)
	var step_count := _section_step_count(project, section_id)
	var grid: Dictionary = project.get("grid%s" % section_id, {})
	var tuplets: Dictionary = project.get("gridTuplets%s" % section_id, {})
	var hold_track: Array = project.get("bassHold%s" % section_id, [])
	var slide_track: Array = project.get("bassSlide%s" % section_id, [])
	for step in range(step_count):
		if _bool_at(hold_track, step) or _bool_at(slide_track, step):
			continue
		if _bass_tuplet_second(project, section_id, grid, tuplets, step, step_count):
			continue
		if not _bass_has_trigger(project, section_id, step):
			continue
		var tick := section_start_tick + _step_to_tick(project, step)
		if _bass_tuplet_start(project, section_id, grid, tuplets, step, step_count):
			var span_ticks := max(1, _step_to_tick(project, step + 2) - _step_to_tick(project, step))
			var offsets := _triplet_offsets(span_ticks)
			var left_midi := _bass_midi_at(project, section_id, step)
			var right_midi := _bass_midi_at(project, section_id, step + 1)
			var middle_midi := left_midi
			if left_midi >= 0 and right_midi >= 0:
				middle_midi = int(round(float(left_midi + right_midi) / 2.0))
			var notes := [left_midi, middle_midi, right_midi if right_midi >= 0 else left_midi]
			for triplet_index in range(3):
				var midi := int(notes[triplet_index])
				if midi < 0:
					continue
				var accent := _bass_accent_at(project, section_id, step + 1) if triplet_index == 2 else _bass_accent_at(project, section_id, step)
				events.append(_make_event(
					tick + int(offsets[triplet_index]),
					_pitched_tuplet_duration_ticks(project, span_ticks),
					section_id,
					"bass",
					0,
					"manual_bass" if str(project.get("bassMode", "auto")) == "manual" else "auto_bass",
					midi,
					98 if accent else 82,
					0.0,
					{
						"accent": accent,
						"tuplet": true,
						"hold": false,
						"slide": false,
						"muted": false,
						"solo": false,
						"generated": triplet_index == 1,
						"audio_profile": str(project.get("audioProfile", "standard")),
						"lofi_preset": str(project.get("lofiPreset", "")),
						"chip_preset": str(project.get("chipPreset", "")),
						"bass_tone": str(project.get("bassTone", "classic")),
					},
					step,
					_step_to_bar(project, step),
					arrangement_index,
					4,
					step + triplet_index
				))
		else:
			var midi_note := _bass_midi_at(project, section_id, step)
			if midi_note < 0:
				continue
			var phrase := _bass_phrase_info(project, section_id, step)
			var flags := {
				"accent": _bass_accent_at(project, section_id, step),
				"tuplet": false,
				"hold": int(phrase.get("duration_ticks", step_ticks)) > step_ticks,
				"slide": int(phrase.get("slide_midi", -1)) >= 0,
				"muted": false,
				"solo": false,
				"generated": false,
				"audio_profile": str(project.get("audioProfile", "standard")),
				"lofi_preset": str(project.get("lofiPreset", "")),
				"chip_preset": str(project.get("chipPreset", "")),
				"bass_tone": str(project.get("bassTone", "classic")),
			}
			if flags["slide"]:
				flags["slide_midi"] = int(phrase["slide_midi"])
				flags["slide_offset_ticks"] = int(phrase["slide_offset_ticks"])
			events.append(_make_event(
				tick,
				int(phrase.get("duration_ticks", step_ticks)),
				section_id,
				"bass",
				0,
				"manual_bass" if str(project.get("bassMode", "auto")) == "manual" else "auto_bass",
				midi_note,
				98 if flags["accent"] else 82,
				0.0,
				flags,
				step,
				_step_to_bar(project, step),
				arrangement_index,
				4,
				step
			))
	return events


func _compile_guitar_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if not bool(project.get("guitarEnabled", false)):
		return events
	var step_count := _section_step_count(project, section_id)
	var pattern: Array = project.get("guitarPattern%s" % section_id, [])
	for step in range(step_count):
		var articulation := _guitar_articulation_at(pattern, step)
		if articulation in ["off", "hold"]:
			continue
		var tick := section_start_tick + _step_to_tick(project, step)
		var bar := _step_to_bar(project, step)
		var progression := _progression(project, section_id)
		var degree := int(progression[bar % progression.size()])
		var notes := _guitar_power_chord_notes(project, degree)
		var duration_ticks := _guitar_duration_ticks(project, section_id, pattern, step, articulation)
		var flags := {
			"accent": false,
			"tuplet": false,
			"hold": duration_ticks > _step_duration_ticks(project, step),
			"slide": false,
			"muted": false,
			"solo": false,
			"generated": false,
			"articulation": articulation,
			"tone": str(project.get("guitarTone", "high_gain")),
			"register": str(project.get("guitarRegister", "low")),
			"direction": _guitar_direction_for_step(project, step),
			"palm_muted": articulation == "chug",
			"scratch": articulation == "scratch",
			"midi_notes": notes,
			"chord_degree": degree,
			"chord_quality": _triad_quality(project, degree),
			"audio_profile": str(project.get("audioProfile", "standard")),
			"lofi_preset": str(project.get("lofiPreset", "")),
			"chip_preset": str(project.get("chipPreset", "")),
		}
		events.append(_make_event(
			tick,
			duration_ticks,
			section_id,
			"guitar",
			0,
			articulation,
			int(notes[0]) if not notes.is_empty() else -1,
			_guitar_velocity(articulation),
			0.0,
			flags,
			step,
			bar,
			arrangement_index,
			17,
			step
		))
	return events


func _compile_melody_events(project: Dictionary, section_id: String, arrangement_index: int, section_start_tick: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var step_ticks := _ticks_per_step(project)
	var step_count := _section_step_count(project, section_id)
	var tracks: Array = project.get("melodyTracks%s" % section_id, [])
	var instruments: Array = project.get("melodyInstruments%s" % section_id, [])
	var octaves: Array = project.get("melodyOctaves%s" % section_id, [])
	var mute: Array = project.get("melodyMute%s" % section_id, [])
	var solo: Array = project.get("melodySolo%s" % section_id, [])
	var pan: Array = project.get("melodyPan%s" % section_id, [])
	var holds: Array = project.get("melodyHold%s" % section_id, [])
	var slides: Array = project.get("melodySlide%s" % section_id, [])
	var tuplets: Array = project.get("melodyTuplets%s" % section_id, [])
	var any_solo := false
	for value in solo:
		if bool(value):
			any_solo = true
			break

	for track_index in range(min(tracks.size(), 6)):
		var track: Array = tracks[track_index]
		var hold_track: Array = holds[track_index] if track_index < holds.size() else []
		var slide_track: Array = slides[track_index] if track_index < slides.size() else []
		var tuplet_track: Array = tuplets[track_index] if track_index < tuplets.size() else []
		var track_muted := bool(mute[track_index]) if track_index < mute.size() else false
		var track_solo := bool(solo[track_index]) if track_index < solo.size() else false
		var muted_by_solo := any_solo and not track_solo
		var pan_value := clamp(float(pan[track_index]) if track_index < pan.size() else 0.0, -1.0, 1.0)
		var instrument_id := str(instruments[track_index]) if track_index < instruments.size() else "pulse"
		var octave := int(octaves[track_index]) if track_index < octaves.size() else 0
		for step in range(step_count):
			if _bool_at(hold_track, step) or _bool_at(slide_track, step) or _melody_tuplet_second(track, tuplet_track, step, step_count):
				continue
			if _value_at(track, step) == null:
				continue
			var tick := section_start_tick + _step_to_tick(project, step)
			if _melody_tuplet_start(track, tuplet_track, step, step_count):
				var span_ticks := max(1, _step_to_tick(project, step + 2) - _step_to_tick(project, step))
				var offsets := _triplet_offsets(span_ticks)
				var first_note := int(_value_at(track, step))
				var third_note := int(_value_at(track, step + 1))
				var middle_note := _melody_triplet_middle(project, first_note, third_note)
				var notes := [first_note, middle_note, third_note]
				for triplet_index in range(3):
					var note_index := int(notes[triplet_index])
					events.append(_make_event(
						tick + int(offsets[triplet_index]),
						_pitched_tuplet_duration_ticks(project, span_ticks),
						section_id,
						"melody",
						track_index,
						instrument_id,
						_melody_index_to_midi(project, note_index, octave),
						88,
						pan_value,
						{
							"accent": false,
							"tuplet": true,
							"hold": false,
							"slide": false,
							"muted": track_muted or muted_by_solo,
							"solo": track_solo,
							"generated": triplet_index == 1,
							"note_index": note_index,
							"audio_profile": str(project.get("audioProfile", "standard")),
							"lofi_preset": str(project.get("lofiPreset", "")),
							"chip_preset": str(project.get("chipPreset", "")),
						},
						step,
						_step_to_bar(project, step),
						arrangement_index,
						10 + track_index,
						step + triplet_index
					))
			else:
				var note_index := int(_value_at(track, step))
				var phrase := _melody_phrase_info(project, section_id, track_index, step)
				var flags := {
					"accent": false,
					"tuplet": false,
					"hold": int(phrase.get("duration_ticks", step_ticks)) > step_ticks,
					"slide": int(phrase.get("slide_midi", -1)) >= 0,
					"muted": track_muted or muted_by_solo,
					"solo": track_solo,
					"generated": false,
					"note_index": note_index,
					"audio_profile": str(project.get("audioProfile", "standard")),
					"lofi_preset": str(project.get("lofiPreset", "")),
					"chip_preset": str(project.get("chipPreset", "")),
				}
				if flags["slide"]:
					flags["slide_midi"] = int(phrase["slide_midi"])
					flags["slide_offset_ticks"] = int(phrase["slide_offset_ticks"])
				events.append(_make_event(
					tick,
					int(phrase.get("duration_ticks", step_ticks)),
					section_id,
					"melody",
					track_index,
					instrument_id,
					_melody_index_to_midi(project, note_index, octave),
					88,
					pan_value,
					flags,
					step,
					_step_to_bar(project, step),
					arrangement_index,
					10 + track_index,
					step
				))
	return events


func _make_drum_event(tick: int, duration_ticks: int, section_id: String, arrangement_index: int, track_index: int, track_id: String, level: int, source_step: int, source_bar: int, tuplet: bool, generated: bool, audio_profile := "standard", lofi_preset := "", chip_preset := "", drum_kit := "classic", humanize_step := -1) -> Dictionary:
	var midi_note := 36
	if track_id == "snare":
		midi_note = 38
	elif track_id == "hat":
		midi_note = 46 if level == 2 else 42
	var velocity := 100
	if track_id == "snare":
		velocity = 112 if level == 2 else 96
	elif track_id == "hat":
		velocity = 96 if level == 2 else 68
	elif track_id == "kick":
		velocity = 118 if level == 2 else 100
	return _make_event(
		tick,
		duration_ticks,
		section_id,
		"drum",
		track_index,
		track_id,
		midi_note,
		velocity,
		0.0,
		{
			"accent": level == 2,
			"tuplet": tuplet,
			"hold": false,
			"slide": false,
			"muted": false,
			"solo": false,
			"generated": generated,
			"audio_profile": audio_profile,
			"lofi_preset": lofi_preset,
			"chip_preset": chip_preset,
			"drum_kit": drum_kit,
		},
		source_step,
		source_bar,
		arrangement_index,
		_drum_humanize_seed(track_id),
		source_step if humanize_step < 0 else humanize_step
	)


func _make_event(tick: int, duration_ticks: int, section_id: String, track_type: String, track_index: int, instrument_id: String, midi_note: int, velocity: int, pan: float, flags: Dictionary, source_step: int, source_bar: int, arrangement_index: int, humanize_seed := -1, humanize_step := -1) -> Dictionary:
	var event_flags := flags.duplicate(true)
	var event_tick := tick
	var event_velocity := velocity
	if humanize_seed >= 0 and bool(_active_project.get("humanizeOn", false)):
		var effective_step := source_step if humanize_step < 0 else humanize_step
		event_tick = _humanized_tick(tick, effective_step, humanize_seed)
		event_velocity = _humanized_velocity(velocity, effective_step, humanize_seed)
		event_flags["humanized"] = true
		event_flags["humanize_seed"] = humanize_seed
	var notes: Array = event_flags.get("midi_notes", [midi_note]) if event_flags.get("midi_notes", [midi_note]) is Array else [midi_note]
	return {
		"tick": max(0, event_tick),
		"duration_ticks": max(1, duration_ticks),
		"step": source_step,
		"notes": notes.duplicate(),
		"note": midi_note,
		"section_id": section_id,
		"arrangement_index": arrangement_index,
		"track_type": track_type,
		"track_index": track_index,
		"instrument_id": instrument_id,
		"midi_note": clamp(midi_note, -1, 127),
		"velocity": clamp(event_velocity, 0, 127),
		"pan": clamp(pan, -1.0, 1.0),
		"articulation": str(event_flags.get("articulation", "")),
		"sound": str(event_flags.get("sound", instrument_id)),
		"role": str(event_flags.get("role", "")),
		"expression": _dictionary_or_empty(event_flags.get("expression", {})).duplicate(true),
		"technique": _dictionary_or_empty(event_flags.get("technique", {})).duplicate(true),
		"flags": event_flags,
		"source_step": source_step,
		"source_bar": source_bar,
	}


func _expressive_event_count(events: Array[Dictionary]) -> int:
	var count := 0
	for event in events:
		if not str(event.get("articulation", "")).is_empty() or not str(event.get("role", "")).is_empty() or not _dictionary_or_empty(event.get("expression", {})).is_empty() or not _dictionary_or_empty(event.get("technique", {})).is_empty() or event.has("source_event"):
			count += 1
	return count


func _drum_humanize_seed(track_id: String) -> int:
	match track_id:
		"kick":
			return 1
		"snare":
			return 2
		_:
			return 3


func _humanized_tick(tick: int, step: int, seed: int) -> int:
	return tick + int(round(_humanize_offset_seconds(step, seed) * _ticks_per_second_for_project(_active_project)))


func _humanized_velocity(velocity: int, step: int, seed: int) -> int:
	var scale := 0.9 + _feature_seed(step, seed + 199) * 0.18
	return clamp(int(round(float(velocity) * scale)), 1, 127)


func _humanize_offset_seconds(step: int, seed: int) -> float:
	return (_feature_seed(step, seed) - 0.5) * 0.018


func _feature_seed(step: int, seed: int) -> float:
	var x := sin(float(step + 1) * 12.9898 + float(seed + 1) * 78.233) * 43758.5453
	return x - floor(x)


func _ticks_per_second_for_project(project: Dictionary) -> float:
	return float(project.get("bpm", 120)) / 60.0 * float(TICKS_PER_QUARTER)


func _build_section_library(project: Dictionary) -> Dictionary:
	var out := {}
	for section_id in SECTION_IDS:
		out[section_id] = {
			"id": section_id,
			"bars": _section_bars(project, section_id),
			"length_ticks": _section_length_ticks(project, section_id),
			"chord_progression": _progression(project, section_id).duplicate(true),
			"track_summary": _track_summary(project, section_id),
		}
	return out


func _build_section_source_data(project: Dictionary) -> Dictionary:
	var out := {}
	for section_id in SECTION_IDS:
		out[section_id] = {
			"bars": _section_bars(project, section_id),
			"progression": _progression(project, section_id).duplicate(true),
			"grid": _dictionary_or_empty(project.get("grid%s" % section_id, {})).duplicate(true),
			"gridTuplets": _dictionary_or_empty(project.get("gridTuplets%s" % section_id, {})).duplicate(true),
			"melodyTracks": (project.get("melodyTracks%s" % section_id, []) as Array).duplicate(true),
			"melodyInstruments": (project.get("melodyInstruments%s" % section_id, []) as Array).duplicate(true),
			"melodyOctaves": (project.get("melodyOctaves%s" % section_id, []) as Array).duplicate(true),
			"melodyMute": (project.get("melodyMute%s" % section_id, []) as Array).duplicate(true),
			"melodySolo": (project.get("melodySolo%s" % section_id, []) as Array).duplicate(true),
			"melodyPan": (project.get("melodyPan%s" % section_id, []) as Array).duplicate(true),
			"melodyHold": (project.get("melodyHold%s" % section_id, []) as Array).duplicate(true),
			"melodySlide": (project.get("melodySlide%s" % section_id, []) as Array).duplicate(true),
			"melodyTuplets": (project.get("melodyTuplets%s" % section_id, []) as Array).duplicate(true),
			"bassNotes": (project.get("bassNotes%s" % section_id, []) as Array).duplicate(true),
			"bassAccent": (project.get("bassAccent%s" % section_id, []) as Array).duplicate(true),
			"bassHold": (project.get("bassHold%s" % section_id, []) as Array).duplicate(true),
			"bassSlide": (project.get("bassSlide%s" % section_id, []) as Array).duplicate(true),
			"guitarPattern": (project.get("guitarPattern%s" % section_id, []) as Array).duplicate(true),
		}
	return out


func _track_summary(project: Dictionary, section_id: String) -> Dictionary:
	var step_count := _section_step_count(project, section_id)
	var grid: Dictionary = project.get("grid%s" % section_id, {})
	var drum_counts := {}
	for track_id in DRUM_TRACKS:
		var count := 0
		var accent_count := 0
		for step in range(step_count):
			var level := _grid_level(grid, track_id, step)
			if level > 0:
				count += 1
			if level == 2:
				accent_count += 1
		drum_counts[track_id] = {"events": count, "accents": accent_count}

	var melody_tracks: Array = project.get("melodyTracks%s" % section_id, [])
	var mute: Array = project.get("melodyMute%s" % section_id, [])
	var solo: Array = project.get("melodySolo%s" % section_id, [])
	var pans: Array = project.get("melodyPan%s" % section_id, [])
	var instruments: Array = project.get("melodyInstruments%s" % section_id, [])
	var melody_summary := []
	for track_index in range(melody_tracks.size()):
		var track: Array = melody_tracks[track_index]
		var notes := 0
		for step in range(min(step_count, track.size())):
			if track[step] != null:
				notes += 1
		melody_summary.append({
			"track_index": track_index,
			"notes": notes,
			"instrument": str(instruments[track_index]) if track_index < instruments.size() else "pulse",
			"muted": bool(mute[track_index]) if track_index < mute.size() else false,
			"solo": bool(solo[track_index]) if track_index < solo.size() else false,
			"pan": float(pans[track_index]) if track_index < pans.size() else 0.0,
		})

	var bass_triggers := 0
	for step in range(step_count):
		if _bass_has_trigger(project, section_id, step):
			bass_triggers += 1
	var guitar_counts := {"open": 0, "chug": 0, "accent": 0, "scratch": 0, "hold": 0}
	var guitar_pattern: Array = project.get("guitarPattern%s" % section_id, [])
	for step in range(step_count):
		var articulation := _guitar_articulation_at(guitar_pattern, step)
		if guitar_counts.has(articulation):
			guitar_counts[articulation] = int(guitar_counts[articulation]) + 1

	return {
		"drums": drum_counts,
		"bass": {"mode": str(project.get("bassMode", "auto")), "triggers": bass_triggers},
		"guitar": {
			"enabled": bool(project.get("guitarEnabled", false)),
			"tone": str(project.get("guitarTone", "high_gain")),
			"register": str(project.get("guitarRegister", "low")),
			"strum": str(project.get("guitarStrumMode", "down")),
			"events": int(guitar_counts["open"]) + int(guitar_counts["chug"]) + int(guitar_counts["accent"]) + int(guitar_counts["scratch"]),
			"articulations": guitar_counts,
		},
		"chords": {"progression": _progression(project, section_id).duplicate(true)},
		"melody_tracks": melody_summary,
	}


func _compile_marker_events(markers: Array[Dictionary], arrangement_positions: Array[Dictionary], warnings: Array[String]) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var total_length := 0
	if not arrangement_positions.is_empty():
		var last := arrangement_positions[arrangement_positions.size() - 1]
		total_length = int(last.get("start_tick", 0)) + int(last.get("length_ticks", 0))
	for marker in markers:
		var tick := int(marker.get("tick", 0))
		if tick < 0 or tick > total_length:
			warnings.append("Marker '%s' at tick %d is outside the compiled arrangement." % [str(marker.get("name", "marker")), tick])
			continue
		var section_info := _section_info_for_tick(arrangement_positions, tick)
		events.append(_make_event(
			tick,
			1,
			str(section_info.get("id", "")),
			"marker",
			0,
			str(marker.get("name", "marker")),
			-1,
			0,
			0.0,
			{
				"accent": false,
				"tuplet": false,
				"hold": false,
				"slide": false,
				"muted": false,
				"solo": false,
				"generated": false,
				"marker": marker.duplicate(true),
			},
			-1,
			-1,
			int(section_info.get("arrangement_index", -1))
		))
	return events


func _sanitize_markers(raw, warnings: Array[String]) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not (raw is Array):
		return out
	for item in raw:
		if not (item is Dictionary):
			warnings.append("Ignored marker that was not a dictionary.")
			continue
		var tick := int(item.get("tick", 0))
		var name := str(item.get("name", "marker"))
		out.append({"tick": max(0, tick), "name": name, "payload": item.get("payload", {})})
	return out


func _sanitize_arrangement(raw) -> Array[String]:
	var source: Array = raw if raw is Array and not raw.is_empty() else ["A"]
	var out: Array[String] = []
	for value in source:
		var section_id := str(value)
		if SECTION_IDS.has(section_id):
			out.append(section_id)
	if out.is_empty():
		out.append("A")
	return out


func _chord_rhythm_starts(project: Dictionary, bar_start_tick: int) -> Array:
	var starts := []
	var time_sig := int(project.get("timeSig", 4))
	var mode := str(project.get("chordRhythmMode", "sustain"))
	if mode == "sustain":
		starts.append([bar_start_tick, max(1, int(round(float(time_sig * TICKS_PER_QUARTER) * 0.92)))])
	elif mode == "quarter":
		for beat_index in range(time_sig):
			starts.append([bar_start_tick + beat_index * TICKS_PER_QUARTER, max(1, int(round(float(TICKS_PER_QUARTER) * 0.90)))])
	else:
		starts.append([bar_start_tick, max(1, int(round(float(TICKS_PER_QUARTER) * 1.80)))])
		if time_sig >= 4:
			starts.append([bar_start_tick + TICKS_PER_QUARTER * 2, max(1, int(round(float(TICKS_PER_QUARTER) * 1.80)))])
		elif time_sig == 3:
			starts.append([bar_start_tick + int(round(1.5 * TICKS_PER_QUARTER)), max(1, int(round(float(TICKS_PER_QUARTER) * 1.20)))])
	return starts


func _bass_phrase_info(project: Dictionary, section_id: String, step: int) -> Dictionary:
	var step_count := _section_step_count(project, section_id)
	var hold_track: Array = project.get("bassHold%s" % section_id, [])
	var slide_track: Array = project.get("bassSlide%s" % section_id, [])
	var duration_ticks := 0
	var index := step
	while index < step_count:
		duration_ticks += _step_duration_ticks(project, index)
		index += 1
		if index >= step_count or not _bool_at(hold_track, index):
			break
	var slide_midi := -1
	var slide_offset_ticks := -1
	if index < step_count and _bool_at(slide_track, index) and _bass_has_trigger(project, section_id, index):
		slide_midi = _bass_midi_at(project, section_id, index)
		slide_offset_ticks = duration_ticks
		duration_ticks += _step_duration_ticks(project, index)
		index += 1
		while index < step_count and _bool_at(hold_track, index):
			duration_ticks += _step_duration_ticks(project, index)
			index += 1
	duration_ticks = max(_seconds_to_ticks(project, PHRASE_MINIMUM_SECONDS), int(round(float(duration_ticks) * 0.94)))
	return {"duration_ticks": max(1, duration_ticks), "slide_midi": slide_midi, "slide_offset_ticks": slide_offset_ticks}


func _melody_phrase_info(project: Dictionary, section_id: String, track_index: int, step: int) -> Dictionary:
	var step_count := _section_step_count(project, section_id)
	var tracks: Array = project.get("melodyTracks%s" % section_id, [])
	var octaves: Array = project.get("melodyOctaves%s" % section_id, [])
	var holds: Array = project.get("melodyHold%s" % section_id, [])
	var slides: Array = project.get("melodySlide%s" % section_id, [])
	var track: Array = tracks[track_index] if track_index < tracks.size() else []
	var hold_track: Array = holds[track_index] if track_index < holds.size() else []
	var slide_track: Array = slides[track_index] if track_index < slides.size() else []
	var octave := int(octaves[track_index]) if track_index < octaves.size() else 0
	var duration_ticks := 0
	var index := step
	while index < step_count:
		duration_ticks += _step_duration_ticks(project, index)
		index += 1
		if index >= step_count or not _bool_at(hold_track, index):
			break
	var slide_midi := -1
	var slide_offset_ticks := -1
	if index < step_count and _bool_at(slide_track, index) and _value_at(track, index) != null:
		slide_midi = _melody_index_to_midi(project, int(_value_at(track, index)), octave)
		slide_offset_ticks = duration_ticks
		duration_ticks += _step_duration_ticks(project, index)
		index += 1
		while index < step_count and _bool_at(hold_track, index):
			duration_ticks += _step_duration_ticks(project, index)
			index += 1
	duration_ticks = max(_seconds_to_ticks(project, PHRASE_MINIMUM_SECONDS), int(round(float(duration_ticks) * 0.92)))
	return {"duration_ticks": max(1, duration_ticks), "slide_midi": slide_midi, "slide_offset_ticks": slide_offset_ticks}


func _grid_tuplet_start(grid: Dictionary, tuplets: Dictionary, track_id: String, step: int, step_count: int) -> bool:
	if step >= step_count - 1:
		return false
	var tuplet_track: Array = tuplets.get(track_id, [])
	return _bool_at(tuplet_track, step) and _grid_level(grid, track_id, step) > 0 and _grid_level(grid, track_id, step + 1) > 0


func _grid_tuplet_second(grid: Dictionary, tuplets: Dictionary, track_id: String, step: int, step_count: int) -> bool:
	return step > 0 and _grid_tuplet_start(grid, tuplets, track_id, step - 1, step_count)


func _bass_tuplet_start(project: Dictionary, section_id: String, grid: Dictionary, tuplets: Dictionary, step: int, step_count: int) -> bool:
	if step >= step_count - 1:
		return false
	var tuplet_track: Array = tuplets.get("bass", [])
	return _bool_at(tuplet_track, step) and _bass_has_trigger(project, section_id, step) and _bass_has_trigger(project, section_id, step + 1)


func _bass_tuplet_second(project: Dictionary, section_id: String, grid: Dictionary, tuplets: Dictionary, step: int, step_count: int) -> bool:
	return step > 0 and _bass_tuplet_start(project, section_id, grid, tuplets, step - 1, step_count)


func _melody_tuplet_start(track: Array, tuplets: Array, step: int, step_count: int) -> bool:
	return step < step_count - 1 and _bool_at(tuplets, step) and _value_at(track, step) != null and _value_at(track, step + 1) != null


func _melody_tuplet_second(track: Array, tuplets: Array, step: int, step_count: int) -> bool:
	return step > 0 and _melody_tuplet_start(track, tuplets, step - 1, step_count)


func _triplet_offsets(span_ticks: int) -> Array[int]:
	return [0, int(round(float(span_ticks) / 3.0)), int(round(float(span_ticks) * 2.0 / 3.0))]


func _bass_has_trigger(project: Dictionary, section_id: String, step: int) -> bool:
	if str(project.get("bassMode", "auto")) == "manual":
		var notes: Array = project.get("bassNotes%s" % section_id, [])
		return _value_at(notes, step) != null
	var grid: Dictionary = project.get("grid%s" % section_id, {})
	return _grid_level(grid, "bass", step) > 0


func _bass_accent_at(project: Dictionary, section_id: String, step: int) -> bool:
	if str(project.get("bassMode", "auto")) == "manual":
		var accent: Array = project.get("bassAccent%s" % section_id, [])
		return _bool_at(accent, step)
	var grid: Dictionary = project.get("grid%s" % section_id, {})
	return _grid_level(grid, "bass", step) == 2


func _bass_midi_at(project: Dictionary, section_id: String, step: int) -> int:
	if str(project.get("bassMode", "auto")) == "manual":
		var notes: Array = project.get("bassNotes%s" % section_id, [])
		var value = _value_at(notes, step)
		return -1 if value == null else _bass_manual_index_to_midi(project, int(value))
	var bar := _step_to_bar(project, step)
	var progression := _progression(project, section_id)
	var degree := int(progression[bar % progression.size()])
	return 36 + _chord_root_semitone(project, degree)


func _bass_manual_index_to_midi(project: Dictionary, index: int) -> int:
	var scale_notes := _scale_notes(project)
	var degree := posmod(index, 7)
	var octave := int(floor(float(index) / 7.0))
	return 36 + int(scale_notes[degree]) + octave * 12


func _melody_index_to_midi(project: Dictionary, index: int, track_octave: int) -> int:
	var pitch_mode := str(project.get("melodyPitchMode", "scale"))
	if pitch_mode == "chromatic":
		var safe_index := clamp(index, 0, 23)
		var chroma := posmod(safe_index, 12)
		var octave := int(floor(float(safe_index) / 12.0))
		return 72 + chroma + (track_octave + octave) * 12
	var scale_notes := _scale_notes(project)
	var safe_index := clamp(index, 0, 13)
	var degree := posmod(safe_index, 7)
	var octave := int(floor(float(safe_index) / 7.0))
	return 72 + int(scale_notes[degree]) + (track_octave + octave) * 12


func _melody_triplet_middle(project: Dictionary, first: int, third: int) -> int:
	var max_note := 23 if str(project.get("melodyPitchMode", "scale")) == "chromatic" else 13
	return clamp(int(round(float(first + third) / 2.0)), 0, max_note)


func _guitar_articulation_at(pattern: Array, step: int) -> String:
	var value = _value_at(pattern, step)
	var articulation := str(value).to_lower() if value != null else "off"
	if articulation in ["mute", "palm", "pm"]:
		articulation = "chug"
	elif articulation == "sustain":
		articulation = "hold"
	elif articulation in ["dead", "dead_mute"]:
		articulation = "scratch"
	return articulation if GUITAR_ARTICULATIONS.has(articulation) else "off"


func _guitar_power_chord_notes(project: Dictionary, degree: int) -> Array[int]:
	var root_pc := _chord_root_semitone(project, degree)
	var register := str(project.get("guitarRegister", "low"))
	var min_note := 35
	var max_note := 47
	if register == "mid":
		min_note = 45
		max_note = 57
	elif register == "high":
		min_note = 52
		max_note = 64
	var root := 24 + root_pc
	while root < min_note:
		root += 12
	while root > max_note:
		root -= 12
	return [clamp(root, 0, 127), clamp(root + 7, 0, 127), clamp(root + 12, 0, 127)]


func _guitar_duration_ticks(project: Dictionary, section_id: String, pattern: Array, step: int, articulation: String) -> int:
	var step_ticks := _step_duration_ticks(project, step)
	if articulation == "chug":
		return max(_seconds_to_ticks(project, 0.055), min(_seconds_to_ticks(project, 0.16), int(round(float(step_ticks) * 0.58))))
	if articulation == "scratch":
		return max(_seconds_to_ticks(project, 0.035), min(_seconds_to_ticks(project, 0.075), int(round(float(step_ticks) * 0.42))))
	var duration_ticks := step_ticks
	var index := step + 1
	var step_count := _section_step_count(project, section_id)
	while index < step_count and _guitar_articulation_at(pattern, index) == "hold":
		duration_ticks += _step_duration_ticks(project, index)
		index += 1
	var gate := 0.98 if articulation == "accent" else 0.92
	duration_ticks = int(round(float(duration_ticks) * gate))
	duration_ticks = max(_seconds_to_ticks(project, 0.16), min(_seconds_to_ticks(project, 1.8), duration_ticks))
	return max(1, duration_ticks)


func _seconds_to_ticks(project: Dictionary, seconds: float) -> int:
	var bpm := max(1.0, float(project.get("bpm", 120)))
	return max(1, int(round(seconds * bpm / 60.0 * float(TICKS_PER_QUARTER))))


func _guitar_velocity(articulation: String) -> int:
	match articulation:
		"accent":
			return 108
		"chug":
			return 92
		"scratch":
			return 64
		_:
			return 96


func _guitar_direction_for_step(project: Dictionary, step: int) -> String:
	var mode := str(project.get("guitarStrumMode", "down"))
	if mode == "up":
		return "up"
	if mode == "alternate":
		return "up" if step % 2 == 1 else "down"
	return "down"


func _chord_midi_notes(project: Dictionary, degree: int) -> Array[int]:
	var root := _chord_root_semitone(project, degree)
	var quality := _triad_quality(project, degree)
	var intervals := _chord_intervals(quality, str(project.get("chordType", "triad")))
	var base := 48 + root + int(project.get("chordOctave", 0)) * 12
	var notes: Array[int] = []
	for index in range(intervals.size()):
		notes.append(base + int(intervals[index]) + (0 if index == 0 else 12))
	if str(project.get("chordPlayMode", "block")) in ["strum_down", "arp_down"]:
		notes.reverse()
	return notes


func _chord_name(project: Dictionary, degree: int) -> String:
	var root := _chord_root_semitone(project, degree)
	var quality := _triad_quality(project, degree)
	return "%s%s" % [NOTE_NAMES[root], _chord_suffix(quality, str(project.get("chordType", "triad")))]


func _chord_root_semitone(project: Dictionary, degree: int) -> int:
	var scale_notes := _scale_notes(project)
	return int(scale_notes[posmod(degree, scale_notes.size())])


func _scale_notes(project: Dictionary) -> Array:
	var root := NOTE_NAMES.find(str(project.get("key", "C")))
	if root < 0:
		root = 0
	var intervals := MINOR_SCALE if str(project.get("scale", "major")) == "minor" else MAJOR_SCALE
	var out := []
	for interval in intervals:
		out.append(posmod(root + int(interval), 12))
	return out


func _triad_quality(project: Dictionary, degree: int) -> String:
	var qualities := MINOR_QUALITIES if str(project.get("scale", "major")) == "minor" else MAJOR_QUALITIES
	return str(qualities[posmod(degree, qualities.size())])


func _chord_intervals(quality: String, chord_type: String) -> Array:
	match chord_type:
		"sus2":
			return [0, 2, 7]
		"sus4":
			return [0, 5, 7]
		"seventh":
			if quality == "maj":
				return [0, 4, 7, 11]
			if quality == "min":
				return [0, 3, 7, 10]
			return [0, 3, 6, 10]
		_:
			if quality == "min":
				return [0, 3, 7]
			if quality == "dim":
				return [0, 3, 6]
			return [0, 4, 7]


func _chord_suffix(quality: String, chord_type: String) -> String:
	match chord_type:
		"sus2":
			return "sus2"
		"sus4":
			return "sus4"
		"seventh":
			if quality == "maj":
				return "maj7"
			if quality == "min":
				return "m7"
			return "dim7"
		_:
			if quality == "min":
				return "m"
			if quality == "dim":
				return "dim"
			return ""


func _progression(project: Dictionary, section_id: String) -> Array:
	var progression: Array = project.get("progression%s" % section_id, [0, 4, 5, 3])
	return progression if not progression.is_empty() else [0, 4, 5, 3]


func _grid_level(grid: Dictionary, track_id: String, step: int) -> int:
	var track: Array = grid.get(track_id, [])
	var value = _value_at(track, step)
	if value == null:
		return 0
	if value is bool:
		return 1 if value else 0
	return clamp(int(value), 0, 2)


func _section_bars(project: Dictionary, section_id: String) -> int:
	var section_bars: Dictionary = project.get("sectionBars", {})
	return clamp(int(section_bars.get(section_id, 4)), 1, 4)


func _section_length_ticks(project: Dictionary, section_id: String) -> int:
	return _section_bars(project, section_id) * int(project.get("timeSig", 4)) * TICKS_PER_QUARTER


func _section_step_count(project: Dictionary, section_id: String) -> int:
	return _section_bars(project, section_id) * int(project.get("timeSig", 4)) * int(project.get("resolution", 1))


func _ticks_per_step(project: Dictionary) -> int:
	return max(1, int(round(float(TICKS_PER_QUARTER) / float(max(1, int(project.get("resolution", 1)))))))


func _step_to_tick(project: Dictionary, step: int) -> int:
	var step_ticks := _ticks_per_step(project)
	var base_tick := step * step_ticks
	var resolution := max(1, int(project.get("resolution", 1)))
	var swing := clamp(float(project.get("swing", 0.0)), 0.0, 0.35)
	if swing <= 0.0 or resolution < 2 or resolution == 3:
		return base_tick
	if step % 2 == 1:
		return max(0, base_tick - int(round(float(step_ticks) * swing)))
	return base_tick


func _step_duration_ticks(project: Dictionary, step: int) -> int:
	return max(1, _step_to_tick(project, step + 1) - _step_to_tick(project, step))


func _step_to_bar(project: Dictionary, step: int) -> int:
	var steps_per_bar := max(1, int(project.get("timeSig", 4)) * int(project.get("resolution", 1)))
	return int(floor(float(step) / float(steps_per_bar)))


func _value_at(array: Array, index: int):
	if index < 0 or index >= array.size():
		return null
	return array[index]


func _bool_at(array: Array, index: int) -> bool:
	var value = _value_at(array, index)
	return bool(value) if value != null else false


func _event_sort_rank(event: Dictionary) -> int:
	match str(event.get("track_type", "")):
		"marker":
			return 0
		"chord":
			return 1
		"drum":
			return 2
		"guitar":
			return 3
		"bass":
			return 4
		"melody":
			return 5
		_:
			return 9


func _metadata(import_result) -> Dictionary:
	if import_result is Dictionary:
		return _dictionary_or_empty(import_result.get("metadata", {})).duplicate(true)
	return {}


func _metadata_source_path(import_result) -> String:
	if import_result is Dictionary:
		var metadata := _dictionary_or_empty(import_result.get("metadata", {}))
		return str(metadata.get("source_path", import_result.get("source_path", "")))
	return ""


func _game_metadata(import_result) -> Dictionary:
	var metadata := _metadata(import_result)
	return _dictionary_or_empty(metadata.get("game_metadata", {}))


func _mix_volumes(project: Dictionary) -> Dictionary:
	var beat_volume := _clamp_volume(project.get("beatVolume", 0.86), 0.86)
	return {
		"master": _clamp_volume(project.get("masterVolume", 0.82), 0.82),
		"chords": _clamp_volume(project.get("chordVolume", 0.72), 0.72),
		"drums": beat_volume,
		"bass": beat_volume,
		"melody": _clamp_volume(project.get("leadVolume", 0.65), 0.65),
		"guitar": _clamp_volume(project.get("guitarVolume", 0.66), 0.66),
	}


func _clamp_volume(value, fallback: float) -> float:
	if typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT:
		return clamp(float(value), 0.0, 1.0)
	if str(value).is_valid_float():
		return clamp(str(value).to_float(), 0.0, 1.0)
	return fallback


func _performance_settings(project: Dictionary) -> Dictionary:
	return {
		"humanize_on": bool(project.get("humanizeOn", false)),
		"fx": _fx_settings(project),
		"sidechain": {
			"enabled": bool(project.get("sidechainOn", false)),
			"amount": _clamp_volume(project.get("sidechainAmount", 0.45), 0.45),
			"attack_seconds": 0.012,
			"release_seconds": 0.22,
			"depth": 0.72,
			"floor": 0.18,
		},
	}


func _fx_settings(project: Dictionary) -> Dictionary:
	var delay := _clamp_volume(project.get("fxDelay", 0.12), 0.12)
	var chorus := _clamp_volume(project.get("fxChorus", 0.18), 0.18)
	var flanger := _clamp_volume(project.get("fxFlanger", 0.06), 0.06)
	var reverb := _clamp_volume(project.get("fxReverb", 0.18), 0.18)
	var mix := _clamp_volume(project.get("fxMix", 0.65), 0.65)
	var wet_scale := mix * 1.45
	var brightness := (chorus * 0.9) + (flanger * 1.1) + (reverb * 0.35) - (delay * 0.10)
	return {
		"source": {
			"delay": delay,
			"chorus": chorus,
			"flanger": flanger,
			"reverb": reverb,
			"mix": mix,
		},
		"dry_gain": max(0.52, 1.0 - mix * 0.48),
		"wet_master_gain": wet_scale,
		"tone": {
			"frequency": 1800.0,
			"gain": clamp(brightness * 6.0, -2.0, 7.0),
		},
		"delay": {
			"time": 0.10 + delay * 0.42,
			"feedback": 0.05 + delay * 0.72,
			"mix": clamp(delay * 0.95 * wet_scale, 0.0, 1.0),
		},
		"chorus": {
			"rate": 0.25 + chorus * 1.9,
			"depth": 0.0014 + chorus * 0.030,
			"mix": clamp(chorus * 0.95 * wet_scale, 0.0, 1.0),
		},
		"flanger": {
			"rate": 0.10 + flanger * 1.10,
			"depth": 0.0007 + flanger * 0.0062,
			"feedback": 0.08 + flanger * 0.82,
			"mix": clamp(flanger * 0.85 * wet_scale, 0.0, 1.0),
		},
		"reverb": {
			"decay": 1.6,
			"impulse_decay": 2.4,
			"mix": clamp(reverb * 1.05 * wet_scale, 0.0, 1.0),
		},
	}


func _dictionary_or_empty(value) -> Dictionary:
	return value if value is Dictionary else {}


func _array_of_dictionaries(value) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not (value is Array):
		return out
	for item in value:
		if item is Dictionary:
			out.append(item)
	return out


func _string_array(value) -> Array[String]:
	var out: Array[String] = []
	if not (value is Array):
		return out
	for item in value:
		var text := str(item)
		if not text.is_empty():
			out.append(text)
	return out


func _section_info_for_tick(arrangement_positions: Array[Dictionary], tick: int) -> Dictionary:
	for info in arrangement_positions:
		var start_tick := int(info.get("start_tick", 0))
		var length_ticks := int(info.get("length_ticks", 0))
		if tick >= start_tick and tick < start_tick + length_ticks:
			return info
	return {} if arrangement_positions.is_empty() else arrangement_positions[arrangement_positions.size() - 1]
