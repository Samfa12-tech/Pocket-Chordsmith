extends SceneTree
const Tools := preload("res://addons/pocket_chordsmith/import/pcs_chart_build_tools.gd")
const Manifest := preload("res://addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd")
var checks := 0
var failures: Array = []
func _init() -> void:
	var tools := Tools.new()
	for path in ["audio/full/music.wav","audio/campfire mix.wav","audio/曲.wav","audio/🎸.wav"]:
		_check(tools._is_safe_pack_relative_path(path),"tools accepts ordinary/Unicode path: "+path)
		_check(Manifest._is_safe_pack_relative_path(path),"manifest accepts ordinary/Unicode path: "+path)
	for path in ["","/audio.wav","C:/audio.wav","res://audio.wav","../audio.wav","audio/../mix.wav","./mix.wav","audio//mix.wav","audio/./mix.wav","audio/\uFFFD.wav"]:
		_check(not tools._is_safe_pack_relative_path(path),"tools rejects invalid path: "+path)
		_check(not Manifest._is_safe_pack_relative_path(path),"manifest rejects invalid path: "+path)
	# ZIP directory entries and manifest asset paths intentionally differ here.
	_check(tools._is_safe_pack_relative_path("audio/"),"tools retains ZIP-directory trailing-slash policy")
	_check(not Manifest._is_safe_pack_relative_path("audio/"),"manifest retains nonempty asset-component policy")
	_check("\uFFFD".unicode_at(0)==65533,"direct guard character is the observed prior chr(0) result")
	print(JSON.stringify({"test":"pack-path-diagnostic","checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)
func _check(value: bool,label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
