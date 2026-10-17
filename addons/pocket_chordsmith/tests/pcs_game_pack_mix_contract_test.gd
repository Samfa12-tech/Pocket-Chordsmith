extends SceneTree

const Manifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")
var errors: Array[String] = []
var checks := 0

func _init() -> void:
	var pack_root := "user://pcs-mix-contract-test"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(pack_root))
	# Metadata selection tests only: the runtime PCM fixture validates real WAVs.
	var file := FileAccess.open(pack_root.path_join("fixture.wav"), FileAccess.WRITE)
	file.store_8(0)
	file.close()
	var assets := {"mix": "fixture.wav", "drums": "fixture.wav", "bass": "fixture.wav", "shared_bed": "fixture.wav"}
	var core := {"profile": "STEM_SYNC", "assets": assets, "sections": {"A": {"assets": assets}}, "states": {"camp": {"assets": assets}}}
	var layers: Dictionary = Manifest.create_playback_profile_from_manifest(core, pack_root)
	_expect(layers.ok, "Core layer profile imports")
	var profile = layers.profile
	_expect(profile.stem_paths.size() == 3 and not profile.stem_paths.has("full"), "Core full mix cannot double the adaptive layers")
	_expect(profile.stem_paths.has("shared_bed"), "Shared texture bed is a single layer")
	_expect(profile.event_sample_streams.is_empty(), "Shared bed cannot also become an event sample")
	_expect(profile.get_section_stems("A").size() == 3 and not profile.get_section_stems("A").has("full"), "Section mix/layers are exclusive")
	_expect(profile.get_state_stems("camp").size() == 3 and not profile.get_state_stems("camp").has("full"), "State mix/layers are exclusive")
	var full: Dictionary = Manifest.create_playback_profile_from_manifest(core, pack_root, {"playback_mix": "full-mix"})
	_expect(full.ok and full.profile.stem_paths.keys() == ["full"], "Explicit full-mix reference selects only the mix")
	_expect(full.profile.get_section_stems("A").keys() == ["full"], "Explicit section full-mix reference selects only the mix")
	_expect(not full.profile.loop_prepared_sections, "Ordinary full-song profiles retain their existing playback policy")
	var loop_kit := core.duplicate(true)
	loop_kit.profile = "LOOP_KIT"
	var loop_profile: Dictionary = Manifest.create_playback_profile_from_manifest(loop_kit, pack_root)
	_expect(loop_profile.ok and loop_profile.profile.loop_prepared_sections, "LOOP_KIT selects native prepared section repetition")
	var opt_out: Dictionary = Manifest.create_playback_profile_from_manifest(loop_kit, pack_root, {"loop_prepared_sections": false})
	_expect(opt_out.ok and not opt_out.profile.loop_prepared_sections, "Legacy section restart remains an explicit import choice")
	var daw := {"kind": "godot-adaptive-pack", "fullMix": "fixture.wav", "stems": [
		{"id": "drums", "packPath": "fixture.wav"}, {"id": "drums-kick", "packPath": "fixture.wav"}, {"id": "bass", "packPath": "fixture.wav"}
	]}
	var aggregate: Dictionary = Manifest.create_playback_profile_from_manifest(daw, pack_root)
	_expect(aggregate.ok and aggregate.profile.stem_paths.size() == 2 and aggregate.profile.stem_paths.has("drums"), "Legacy DAW aggregate excludes duplicate branch WAVs")
	var branches: Dictionary = Manifest.create_playback_profile_from_manifest(daw, pack_root, {"drum_stems": "branches"})
	_expect(branches.ok and branches.profile.stem_paths.size() == 2 and not branches.profile.stem_paths.has("drums"), "DAW branch selection excludes aggregate WAV")
	var daw_full: Dictionary = Manifest.create_playback_profile_from_manifest(daw, pack_root, {"playback_mix": "full-mix"})
	_expect(daw_full.ok and daw_full.profile.stem_paths.keys() == ["full"], "DAW full mix is a separate reference path")
	var many: Array = []
	for i in range(33):
		many.append({"id": "audio_%d" % i, "packPath": "fixture.wav"})
	var oversized := {"fullMix": "fixture.wav", "stems": many}
	var rejected: Dictionary = Manifest.create_playback_profile_from_manifest(oversized, pack_root)
	_expect(not rejected.ok and str(rejected.errors).contains("at most 32"), "Oversized synchronized set fails explicitly")
	var reference: Dictionary = Manifest.create_playback_profile_from_manifest(oversized, pack_root, {"playback_mix": "full-mix"})
	_expect(reference.ok and reference.profile.preserve_prepared_wav_endings, "Imported packs preserve prepared WAV endings by default")
	var unguarded: Dictionary = Manifest.create_playback_profile_from_manifest(oversized, pack_root, {"playback_mix": "full-mix", "preserve_wav_endings": false})
	_expect(unguarded.ok and not unguarded.profile.preserve_prepared_wav_endings, "Original stream ending behavior remains an explicit import option")
	_expect(reference.ok and reference.profile.stem_paths.size() == 1, "Full mix is an explicit bounded alternative")
	var separate: Dictionary = Manifest.create_playback_profile_from_manifest(oversized, pack_root, {"use_audio_stream_synchronized": false})
	_expect(separate.ok and separate.profile.stem_paths.size() == 33, "Independent players require an explicit caller choice")
	var invalid: Dictionary = Manifest.create_playback_profile_from_manifest(core, pack_root, {"playback_mix": "both"})
	_expect(not invalid.ok, "Invalid mix preference cannot silently select both paths")
	var invalid_scope: Dictionary = Manifest.create_playback_profile_from_manifest(core, pack_root, {"playback_scope": "unknown"})
	_expect(not invalid_scope.ok, "Invalid playback scope fails explicitly")
	for mix in ["layers", "full-mix"]:
		var arrangement: Dictionary = Manifest.create_playback_profile_from_manifest(core, pack_root, {"playback_scope": "arrangement", "playback_mix": mix})
		_expect(arrangement.ok and arrangement.profile.prepared_playback_scope == "arrangement", "Explicit arrangement scope imports")
		_expect(arrangement.profile.section_stem_sets.is_empty() and arrangement.profile.stem_sets.is_empty() and arrangement.profile.state_stem_sets.is_empty(), "Arrangement cannot retain local section/state overrides")
		_expect(arrangement.profile.stem_paths.size() == (1 if mix == "full-mix" else 3), "Arrangement keeps the selected exclusive mix/layer path")
	var section_only := {"profile": "LOOP_KIT", "sections": {"A": {"assets": assets}}}
	var unsupported: Dictionary = Manifest.create_playback_profile_from_manifest(section_only, pack_root, {"playback_scope": "arrangement"})
	_expect(not unsupported.ok and str(unsupported.errors).contains("full-song assets"), "Section-only packs cannot silently use arrangement scope")
	_expect(layers.profile.prepared_playback_scope == "adaptive", "Existing profile scope remains adaptive by default")
	var loop_arrangement: Dictionary = Manifest.create_playback_profile_from_manifest(loop_kit, pack_root, {"playback_scope": "arrangement"})
	_expect(loop_arrangement.ok and not loop_arrangement.profile.loop_prepared_sections, "Arrangement does not loop full-song files at section boundaries")
	for message in errors:
		push_error(message)
	print(JSON.stringify({"test": "game-pack-mix-contract", "checks": checks, "errors": errors}))
	quit(0 if errors.is_empty() else 1)

func _expect(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		errors.append(message)
