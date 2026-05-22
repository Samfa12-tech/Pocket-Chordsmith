extends Node2D

const ChartResourceScript := preload("res://addons/pocket_chordsmith/resources/pcs_chart_resource.gd")
const SectionResourceScript := preload("res://addons/pocket_chordsmith/resources/pcs_section_resource.gd")
const WebKitProfilePath := "res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres"

@export var chart: PCSChartResource

@onready var conductor: PocketChordsmithConductor = $PocketChordsmithConductor
@onready var pulse_sprite: Sprite2D = $PulseSprite
@onready var status_label: Label = $CanvasLayer/StatusLabel
@onready var marker_label: Label = $CanvasLayer/MarkerLabel

var _section_colors := {
	"A": Color(0.45, 0.82, 1.0),
	"B": Color(1.0, 0.58, 0.38),
	"C": Color(0.58, 1.0, 0.54),
	"D": Color(0.95, 0.72, 1.0),
	"E": Color(1.0, 0.25, 0.45),
	"F": Color(1.0, 0.92, 0.35),
}
var _muffled := false
var _ducked := false
var _drums_quiet := false
var _active_kit_name := "Default"


func _ready() -> void:
	_build_sprite_texture()
	if chart == null:
		chart = _create_fallback_chart()
	conductor.chart = chart
	if _should_use_web_kit_profile() and ResourceLoader.exists(WebKitProfilePath):
		_apply_demo_profile(WebKitProfilePath, "Generated Web Kit", false)
	conductor.loop_enabled = false
	conductor.beat.connect(_on_beat)
	conductor.accent_hit.connect(_on_accent)
	conductor.section_started.connect(_on_section_started)
	conductor.marker_hit.connect(_on_marker_hit)
	conductor.event_triggered.connect(_on_event_triggered)
	conductor.music_state_queued.connect(_on_music_state_queued)
	conductor.music_state_changed.connect(_on_music_state_changed)
	conductor.stinger_started.connect(_on_stinger_started)
	conductor.stinger_finished.connect(_on_stinger_finished)
	_build_demo_buttons()
	conductor.play()


func _should_use_web_kit_profile() -> bool:
	if conductor.playback_profile == null:
		return true
	return conductor.playback_profile.playback_backend == PCSPlaybackProfile.PlaybackBackend.STEM_SYNC and conductor.playback_profile.stem_paths.is_empty() and conductor.playback_profile.stem_sets.is_empty() and conductor.playback_profile.drum_kit.is_empty()


func _process(_delta: float) -> void:
	if conductor == null:
		return
	status_label.text = "Kit %s  State %s  Queued %s  Section %s  Bar %d  Beat %d  Tick %d" % [
		_active_kit_name,
		conductor.get_current_music_state(),
		conductor.get_queued_music_state(),
		conductor.current_section,
		conductor.current_bar,
		conductor.current_beat,
		conductor.current_tick,
	]


func _on_beat(bar: int, beat: int) -> void:
	if beat == 1:
		_pulse(1.08)


func _on_accent(track_type: String, _track_index: int, strength: float) -> void:
	if track_type == "drum":
		_pulse(1.18 + strength * 0.15)


func _on_section_started(section_id: String) -> void:
	pulse_sprite.modulate = _section_colors.get(section_id, Color.WHITE)
	marker_label.text = "Section %s" % section_id


func _on_marker_hit(marker_name: String) -> void:
	marker_label.text = "Marker: %s" % marker_name
	if marker_name == "spawn_wave":
		_pulse(1.45)


func _on_event_triggered(event: Dictionary) -> void:
	if str(event.get("instrument_id", "")) == "kick":
		_pulse(1.22)


func _on_music_state_queued(state_name: String, _boundary: int) -> void:
	marker_label.text = "Queued: %s" % state_name


func _on_music_state_changed(_old_state: String, new_state: String) -> void:
	marker_label.text = "State: %s" % new_state


func _on_stinger_started(name: String) -> void:
	marker_label.text = "Stinger: %s" % name
	_pulse(1.5)


func _on_stinger_finished(name: String) -> void:
	marker_label.text = "Stinger finished: %s" % name


func _build_demo_buttons() -> void:
	var rows := VBoxContainer.new()
	rows.position = Vector2(20, 98)
	rows.add_theme_constant_override("separation", 6)
	$CanvasLayer.add_child(rows)
	_add_demo_button(rows, "Normal A-C", func() -> void:
		conductor.set_music_state("exploration", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
	)
	_add_demo_button(rows, "Boss Appears", func() -> void:
		conductor.queue_music_state("boss_phase_1", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
	)
	_add_demo_button(rows, "Phase Two", func() -> void:
		conductor.queue_music_state("boss_phase_2", PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION)
	)
	_add_demo_button(rows, "Boss Defeated", func() -> void:
		conductor.trigger_stinger("victory_hit", "exploration")
	)
	_add_demo_button(rows, "Muffle Menu", func() -> void:
		_muffled = not _muffled
		if _muffled:
			conductor.muffle_for_pause()
		else:
			conductor.restore_menu_muffle()
	)
	_add_demo_button(rows, "Dialogue Duck", func() -> void:
		_ducked = not _ducked
		if _ducked:
			conductor.duck_for_dialogue()
		else:
			conductor.restore_after_dialogue()
	)
	_add_demo_button(rows, "Layer Volume", func() -> void:
		_drums_quiet = not _drums_quiet
		conductor.set_layer_volume("drums", -8.0 if _drums_quiet else 0.0)
	)
	_add_demo_button(rows, "Kit: Web", func() -> void:
		_apply_demo_profile(WebKitProfilePath, "Generated Web Kit")
	)
	_add_demo_button(rows, "Stinger Now", func() -> void:
		conductor.trigger_stinger("warning_hit")
	)


func _apply_demo_profile(path: String, kit_name: String, stop_active_samples := true) -> void:
	if not ResourceLoader.exists(path):
		marker_label.text = "Missing profile: %s" % path
		return
	var profile := load(path) as PCSPlaybackProfile
	if profile == null:
		marker_label.text = "Profile failed: %s" % path
		return
	conductor.set_playback_profile(profile, stop_active_samples)
	_active_kit_name = kit_name
	marker_label.text = "Kit: %s" % kit_name


func _add_demo_button(parent: Control, text: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(180, 34)
	button.pressed.connect(callback)
	parent.add_child(button)


func _pulse(scale_to: float) -> void:
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(pulse_sprite, "scale", Vector2.ONE * scale_to, 0.05)
	tween.tween_property(pulse_sprite, "scale", Vector2.ONE, 0.16)


func _build_sprite_texture() -> void:
	var image := Image.create(96, 96, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	for y in range(96):
		for x in range(96):
			var p := Vector2(x - 48, y - 48)
			var distance := p.length()
			if distance <= 42.0:
				var alpha: float = 1.0 - clamp((distance - 32.0) / 10.0, 0.0, 1.0)
				image.set_pixel(x, y, Color(1.0, 1.0, 1.0, alpha))
	pulse_sprite.texture = ImageTexture.create_from_image(image)


func _create_fallback_chart() -> PCSChartResource:
	var demo_chart: PCSChartResource = ChartResourceScript.new()
	demo_chart.source_path = "generated_demo"
	demo_chart.source_project_version = 15
	demo_chart.imported_at_unix_time = int(Time.get_unix_time_from_system())
	demo_chart.bpm = 112
	demo_chart.time_signature = 4
	demo_chart.key = "C"
	demo_chart.scale = "major"
	demo_chart.resolution = 1
	demo_chart.ticks_per_quarter = 480
	demo_chart.arrangement = ["A", "B", "C", "D", "E", "F"]
	for index in range(demo_chart.arrangement.size()):
		demo_chart.arrangement_positions.append({"id": demo_chart.arrangement[index], "arrangement_index": index, "start_tick": index * 7680, "length_ticks": 7680, "bars": 4})
	demo_chart.markers = [{"tick": 3840, "name": "spawn_wave"}]
	demo_chart.music_states = {
		"exploration": {"loop_sections": ["A", "B", "C"]},
		"boss_phase_1": {"entry": "D", "loop_sections": ["D"]},
		"boss_phase_2": {"entry": "E", "loop_sections": ["E"]},
		"victory": {"entry": "F", "loop_sections": ["F"], "stinger": "victory_hit", "then_return_to": "exploration"},
	}
	demo_chart.default_music_state = "exploration"
	for section_id in demo_chart.arrangement:
		demo_chart.section_library[section_id] = {"id": section_id, "bars": 4, "length_ticks": 7680, "chord_progression": [0, 4, 5, 3], "track_summary": {}}
	for index in range(demo_chart.arrangement.size()):
		var section := SectionResourceScript.new()
		section.id = demo_chart.arrangement[index]
		section.arrangement_index = index
		section.bars = 4
		section.start_tick = index * 7680
		section.length_ticks = 7680
		demo_chart.sections.append(section)
	demo_chart.compiled_events = _fallback_events()
	return demo_chart


func _fallback_events() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var sections := ["A", "B", "C", "D", "E", "F"]
	for section_index in range(sections.size()):
		var section_id: String = sections[section_index]
		var base_tick := section_index * 7680
		for beat_index in range(16):
			var tick := base_tick + beat_index * 480
			events.append(_event(tick, section_id, section_index, "drum", 0, "kick", 36, 116, beat_index, beat_index % 4 == 0))
			events.append(_event(tick + 240, section_id, section_index, "drum", 2, "hat", 42, 72, beat_index, false))
			if beat_index % 4 == 1 or beat_index % 4 == 3:
				events.append(_event(tick, section_id, section_index, "drum", 1, "snare", 38, 110, beat_index, true))
		events.append(_event(base_tick + 6720, section_id, section_index, "marker", 0, "safe_transition", -1, 0, -1, false))
	events.append(_event(3840, "A", 0, "marker", 0, "spawn_wave", -1, 0, -1, false))
	events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("tick", 0)) < int(b.get("tick", 0))
	)
	return events


func _event(tick: int, section_id: String, arrangement_index: int, track_type: String, track_index: int, instrument_id: String, midi_note: int, velocity: int, source_step: int, accent: bool) -> Dictionary:
	return {
		"tick": tick,
		"duration_ticks": 120,
		"section_id": section_id,
		"arrangement_index": arrangement_index,
		"track_type": track_type,
		"track_index": track_index,
		"instrument_id": instrument_id,
		"midi_note": midi_note,
		"velocity": velocity,
		"pan": 0.0,
		"flags": {
			"accent": accent,
			"tuplet": false,
			"hold": false,
			"slide": false,
			"muted": false,
			"solo": false,
			"generated": false,
		},
		"source_step": source_step,
		"source_bar": int(floor(float(max(source_step, 0)) / 4.0)),
	}
