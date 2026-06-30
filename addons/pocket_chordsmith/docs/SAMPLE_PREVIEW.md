# Sample-Based Preview And Hybrid Playback

The lightweight sample path is intended for:

- no-stems-yet development builds
- punchier drum preview than the legacy procedural synth
- HYBRID accents, warnings, hits, and stingers

It uses Godot `AudioStreamPolyphonic` through one player instead of spawning nodes per event.

## One-Click Web Sound Kit

In the `Chordsmith` main screen, click `Generate Preview Sound Kit`.

This creates Pocket Chordsmith-style WAV assets and a ready-to-use HYBRID playback profile:

```text
res://addons/pocket_chordsmith/audio/web_kit/kick.wav
res://addons/pocket_chordsmith/audio/web_kit/kick_accent.wav
res://addons/pocket_chordsmith/audio/web_kit/snare.wav
res://addons/pocket_chordsmith/audio/web_kit/snare_accent.wav
res://addons/pocket_chordsmith/audio/web_kit/hat.wav
res://addons/pocket_chordsmith/audio/web_kit/open_hat.wav
res://addons/pocket_chordsmith/audio/web_kit/clap.wav
res://addons/pocket_chordsmith/audio/web_kit/guitar_chug.wav
res://addons/pocket_chordsmith/audio/web_kit/guitar_open.wav
res://addons/pocket_chordsmith/audio/web_kit/guitar_accent.wav
res://addons/pocket_chordsmith/audio/web_kit/guitar_scratch.wav
res://addons/pocket_chordsmith/audio/web_kit/warning_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/reward_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/victory_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/transition_hit.wav
res://addons/pocket_chordsmith/audio/web_kit/pocket_chordsmith_web_kit_profile.tres
```

Assign `pocket_chordsmith_web_kit_profile.tres` to `PocketChordsmithConductor.playback_profile` to hear chart drum events through Godot-native sample playback.

The generated kick, snare, and hats are inspired by the original Pocket Chordsmith WebAudio drum functions and tuned into short, reusable WAV one-shots for Godot. This means projects can preview charts without sourcing a drum kit first. It does not mean runtime bypasses audio assets entirely: generated WAVs, licensed user samples, native preview streams, or rendered stems are still played through Godot's audio system. Imported JSON can include bass and melody slide events from one note to another; native bass and melody preview render slides inside generated note streams instead of relying on stepped pitch updates. Guitar and chord events can also render native Chordsmith-style streams instead of pitching one-shot samples. Use rendered stems when exact mastered game audio matters.

When using your own samples, trim long silent tails before assigning them to a playback profile. Godot will keep an `AudioStreamPolyphonic` voice active until the stream ends, so a punchy kick saved as a three-second file can waste polyphony and make diagnostics look busier than the audible sound.

For short sample hits, `PCSPlaybackProfile.sample_preview_load_wavs_uncompressed` defaults to `true`. This makes the conductor load WAV hit samples with `AudioStreamWAV.load_from_file(..., {"compress/mode": 0})` for preview/hybrid event playback, avoiding the lossy default WAV import mode that can smear drum transients. Stem playback still uses normal Godot imports and routing.

For web exports, `PCSPlaybackProfile.sample_preview_force_web_stream_for_pitched` defaults to `true`. When bass, chord, or melody sample preview needs pitch variation, the conductor asks Godot to use stream playback for those tonal hits on web builds. This works around the browser export pitch variation issue without changing drum one-shot playback or the desktop/native path.

`PCSPlaybackProfile.sample_preview_native_bass_enabled` defaults to `true`. Bass preview events render short Godot-native WAV streams from the same Chordsmith bass-tone recipes carried in compiled chart events, including accent, duration, tone ID, and slide metadata. This is the first native-engine parity slice: it should sound closer than pitching one shared bass sample, but rendered stems are still the path for exact mastered game audio.

`PCSPlaybackProfile.sample_preview_native_melody_enabled` also defaults to `true`. Melody preview events render short stereo Godot-native WAV streams from shared Chordsmith lead-instrument recipes, including instrument ID, duration, slide, extra layers, and melody pan. This avoids the old stepped slide approximation and avoids per-pan dynamic bus creation in normal preview playback.

`PCSPlaybackProfile.sample_preview_native_guitar_enabled` defaults to `true`. Guitar preview events render short Godot-native WAV streams from the Chordsmith rhythm-guitar voice model, including power-chord notes, tone ID, articulation, strum direction, accent/chug/scratch envelopes, drive, and basic high/low filtering. This removes the old one-sample-per-note pitch artifact and avoids requiring a saved distortion chain on `Music_Guitar`.

`PCSPlaybackProfile.sample_preview_native_chords_enabled` defaults to `true`. Chord preview events render short Godot-native WAV streams from Chordsmith chord instrument recipes, including chord MIDI notes, instrument ID, play mode, spread timing, ADSR shape, layers, shimmer, and basic tone filtering. This keeps chord volume/tone under the `Music_Chords` bus without relying on a saved bus effect chain.

Native bass, melody, guitar, and chord streams can be warmed with an explicit `conductor.prewarm_audio(false, true)` call during a loading screen. `conductor.prewarm_native_preview_slice(1, 8.0)` can split the work across multiple calls, but a single long chord or guitar stream can still exceed the requested budget because GDScript cannot interrupt a stream once generation has started. Use sliced native prewarm only from a loading/progress screen, not from live playback. Live playback uses cached native streams when they already exist, but it does not synthesize missing native streams on the audio scheduling frame by default. If a native stream is not cached, preview falls back to the bundled Web Kit sample for that event so dense charts keep playing instead of freezing the Godot editor.

Set `PCSPlaybackProfile.sample_preview_build_native_streams_during_playback` to `true` only for debugging or very small charts. Dense charts can spend seconds generating native tonal WAV streams in GDScript, which causes wall-clock playback to skip or hitch. For normal editor audition, keep it `false`; for a higher-fidelity native preview, prewarm explicitly before calling `play()`.

The remaining approximation is that Godot is using generated Web Kit samples or equivalent native preview voices instead of replaying the browser's exact WebAudio graph sample-for-sample. Use rendered stems when exact mastered game audio matters.

If a web melody still sounds wrong, temporarily enable `sample_preview_log_pitched_events` on the playback profile. The conductor will print the sample key, MIDI note, pitch scale, bus, and requested playback type for tonal events.

Keep `sample_preview_log_pitched_events` disabled in normal gameplay. Dense charts can trigger more than a thousand tonal sample logs per loop, and console output can stall the main thread enough for audio timers to fire late.

`sample_preview_skip_late_audio_ticks` defaults to `120`, so badly late preview hits are dropped instead of being played as catch-up bursts. If a target device still sounds rushed after a frame hitch, prefer increasing audio headroom and reducing logging before raising this too far.

`PCSPlaybackProfile.sample_preview_prewarm_on_ready` also defaults to `true`. The conductor preloads drum-kit, event-sample, and stinger streams into its cache before playback. Automatic prewarm intentionally skips full native tonal stream synthesis so pressing Play does not block the editor. You can call `conductor.prewarm_audio(false, true)` yourself during a loading screen after assigning the chart and playback profile when you want native tonal streams cached before playback, or step through it gradually from a loading/progress screen:

```gdscript
while true:
	var slice := conductor.prewarm_native_preview_slice(1, 8.0)
	if bool(slice.get("complete", false)):
		break
	await get_tree().process_frame
```

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
	"lofi_kick": "res://audio/drums/lofi_kick.wav",
	"lofi_snare": "res://audio/drums/lofi_snare.wav",
	"lofi_hat": "res://audio/drums/lofi_hat.wav",
	"lofi_open_hat": "res://audio/drums/lofi_open_hat.wav",
	"lofi_tape_soft:kick": "res://audio/drums/tape_soft_kick.wav",
	"lofi_tape_soft:snare": "res://audio/drums/tape_soft_snare.wav",
	"lofi_tape_soft:hat": "res://audio/drums/tape_soft_hat.wav",
	"lofi_tape_soft:open_hat": "res://audio/drums/tape_soft_open_hat.wav",
}
profile.max_polyphony = 24
```

For lofi charts, the conductor first looks for kit-specific keys such as `lofi_tape_soft:kick`, then falls back to legacy profile keys such as `lofi_kick`, accent keys, and finally the plain lane name. Use the kit-specific form when adding new lofi drum-kit variants so Chordsmith, DAW, and Godot can keep the same sound IDs.

Marker-triggered stingers:

```gdscript
profile.accent_streams = {
	"boss_warning": "res://audio/stingers/boss_warning.wav"
}
profile.marker_stingers = {
	"boss_warning_marker": "boss_warning"
}
```

Use the recommended Chordsmith audio buses so drums route to `Music_Drums`, guitar routes to `Music_Guitar`, and stingers route to `Music_Stingers`. The `Create Chordsmith Audio Buses` tool creates and routes buses dry by default; add guitar tone, compression, limiting, or ambience deliberately in Godot's native audio bus layout for shipped mixes.
