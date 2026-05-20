# Sample-Based Preview And Hybrid Playback

The lightweight sample path is intended for:

- no-stems-yet development builds
- punchier drum preview than the legacy procedural synth
- HYBRID accents, warnings, hits, and stingers

It uses Godot `AudioStreamPolyphonic` through one player instead of spawning nodes per event.

## One-Click Web Sound Kit

In the `Chordsmith` main screen, click `Generate Web Sound Kit`.

This creates Pocket Chordsmith-style WAV assets and a ready-to-use HYBRID playback profile:

```text
res://addons/pocket_chordsmith/audio/web_kit/kick.wav
res://addons/pocket_chordsmith/audio/web_kit/kick_accent.wav
res://addons/pocket_chordsmith/audio/web_kit/snare.wav
res://addons/pocket_chordsmith/audio/web_kit/snare_accent.wav
res://addons/pocket_chordsmith/audio/web_kit/hat.wav
res://addons/pocket_chordsmith/audio/web_kit/open_hat.wav
res://addons/pocket_chordsmith/audio/web_kit/clap.wav
res://addons/pocket_chordsmith/audio/web_kit/warning_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/reward_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/transition_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
```

Assign `pocket_chordsmith_web_kit_profile.tres` to `PocketChordsmithConductor.playback_profile` to hear chart drum events through Godot-native sample playback.

Example drum kit:

```gdscript
profile.playback_backend = PCSPlaybackProfile.PlaybackBackend.HYBRID
profile.drum_kit = {
	"kick": "res://audio/drums/kick.wav",
	"kick_accent": "res://audio/drums/kick_heavy.wav",
	"snare": "res://audio/drums/snare.wav",
	"snare_accent": "res://audio/drums/snare_heavy.wav",
	"hat": "res://audio/drums/hat.wav",
	"hat_accent": "res://audio/drums/open_hat.wav",
}
profile.max_polyphony = 24
```

Marker-triggered stingers:

```gdscript
profile.accent_streams = {
	"boss_warning": "res://audio/stingers/boss_warning.wav"
}
profile.marker_stingers = {
	"boss_warning_marker": "boss_warning"
}
```

Use the recommended Chordsmith audio buses so drums route to `Music_Drums` and stingers route to `Music_Stingers`. Add compression/limiting on those buses in Godot's native audio bus layout, not in Pocket Chordsmith.
