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
res://addons/pocket_chordsmith/audio/web_kit/victory_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/transition_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
```

Assign `pocket_chordsmith_web_kit_profile.tres` to `PocketChordsmithConductor.playback_profile` to hear chart drum events through Godot-native sample playback.

The generated kick, snare, and hats are inspired by the original Pocket Chordsmith WebAudio drum functions and tuned into short, reusable WAV one-shots for Godot. This means projects can preview charts without sourcing a drum kit first. It does not mean runtime bypasses audio assets entirely: generated WAVs, licensed user samples, or rendered stems are still played through Godot's audio system. Imported JSON can include bass and melody slide events from one note to another; sample preview preserves those slide flags in the event data but does not reproduce continuous pitch glides. Use rendered stems or a native audio router when slide accuracy matters.

When using your own samples, trim long silent tails before assigning them to a playback profile. Godot will keep an `AudioStreamPolyphonic` voice active until the stream ends, so a punchy kick saved as a three-second file can waste polyphony and make diagnostics look busier than the audible sound.

For short sample hits, `PCSPlaybackProfile.sample_preview_load_wavs_uncompressed` defaults to `true`. This makes the conductor load WAV hit samples with `AudioStreamWAV.load_from_file(..., {"compress/mode": 0})` for preview/hybrid event playback, avoiding the lossy default WAV import mode that can smear drum transients. Stem playback still uses normal Godot imports and routing.

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
