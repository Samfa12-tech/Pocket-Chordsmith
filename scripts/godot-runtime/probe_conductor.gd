extends "res://addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd"

var probe_owner: Object
var probe_name := ""

func _process(delta: float) -> void:
	var entered := Time.get_ticks_usec()
	super._process(delta)
	if is_instance_valid(probe_owner):
		probe_owner.conductor_spans.append({"name":probe_name,"begin_us":entered,"end_us":Time.get_ticks_usec(),"tick":current_tick,"tick_float":get("_tick_float"),"anchor_us":get("_clock_anchor_usec"),"anchor_tick":get("_clock_anchor_tick"),"playing":is_playing()})
