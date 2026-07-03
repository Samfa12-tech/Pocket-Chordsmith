# Performant Godot Audio Roadmap

This note is the current direction for turning Pocket Chordsmith imports into a practical Godot game-audio system without making gameplay render a full music engine from text.

## Current State In 1.1.9

Pocket Chordsmith JSON and `PCS1:` share codes are score data. The addon can import them, compile a lightweight `PCSChartResource`, preserve sound/mix/performance metadata, and preview the result in Godot.

The 1.1.9 addon has three usable audio paths:

- `STEM_SYNC` for prepared stems and loops. This is the preferred shipped-game path.
- `HYBRID` for stems plus short samples, accents, stingers, and event hits.
- `PROCEDURAL_PREVIEW` and sample/native preview for editor auditioning before final assets exist.

The editor `Render Preview Audio` action can bake text-only Chordsmith imports into visible WAV stems. It writes separate role stems for drums, bass, chords, guitar, and melody, plus section stem sets, then creates a generated playback profile. Those stems route through the normal Godot music buses, so users can still adjust volume, pan, tone, and FX in Godot's mixer.

This render path is useful because the expensive work happens before preview playback. It is not yet a production mastering pipeline: it uses the addon preview kit/native preview voices, not the exact browser WebAudio graph or a DAW renderer.

## Design Decision

The runtime conductor should stay lightweight. Its job is to coordinate prepared audio:

- keep chart time in integer ticks;
- play synchronized stem players;
- switch sections or music states on musical boundaries;
- mute or fade layers;
- trigger stingers and sample hits;
- emit gameplay signals;
- expose diagnostics.

The runtime should not parse full JSON per frame, spawn nodes per note, or synthesize dense tonal streams during gameplay. Anything that can take seconds in GDScript belongs in an import/render step with visible progress, not behind the Play Preview button and not during a level.

## Near-Term Work

1. Make rendered preview audio a first-class import artifact.

   The current renderer writes WAV stems and a generated playback profile. Next, the addon should make this feel like an import job: progress bar, cancel/status text, output folder choice, overwrite policy, and clear "generated preview assets" naming.

2. Save section stem sets by default.

   Full-song stems are useful for simple playback. Section stems are the more important game-audio asset because they let the conductor switch exploration/combat/menu states on bar or section boundaries without re-rendering during play.

3. Add OGG export for longer generated assets.

   WAV is simple and safe for editor generation, but OGG should be available for longer section/full-song stems so game projects do not carry oversized preview audio. Short hits and very small generated sounds can remain WAV.

4. Add cache manifests and invalidation.

   Generated audio should record the source chart hash, addon version, playback profile hash, BPM, section keys, role list, render mode, and output format. If any of those change, the editor should show the stems as stale and offer to rebuild.

5. Improve live preview feedback.

   Preview/render work should always update visible status text before expensive steps. Users should see "rendering section 3/8 bass" rather than an unresponsive editor.

6. Add stem playback transition polish.

   Future `STEM_SYNC` work should support overlap/crossfade players for state changes, short pre-roll where needed, and clean transitions between section stem sets.

## Runtime Budget Rules

The shipped-game runtime should aim for predictable audio cost:

- one conductor for the active music system;
- one player per active stem layer, not one player per note;
- bounded `AudioStreamPolyphonic` voices for short hits;
- no console spam during playback;
- no native tonal stream generation on an audio scheduling frame;
- no import/render work while the game is active;
- use Godot buses for mix and FX control instead of baking every mix decision into code.

Generated/imported audio should be prepared before the level starts. For games that load music dynamically, do it from a loading screen or background preparation scene and show progress.

## Recommended Shipping Pipeline

For the strongest result today:

1. Author the song in Pocket Chordsmith.
2. Export a Pocket DAW Godot Adaptive Pack when final mix identity matters, or import the Chordsmith JSON/share code directly when the addon preview is enough.
3. In Godot, compile the chart and save the `.tres` resource.
4. Render or import stems before gameplay.
5. Use `STEM_SYNC` or `HYBRID` in the level.
6. Use Godot's mixer buses for user volume, balancing, EQ, compression, reverb, and game-specific FX.

For text-only Chordsmith imports, the addon should continue moving toward this flow:

```text
PCS1 or JSON
-> compile chart
-> visible import/render job
-> per-section role stems
-> generated playback profile
-> runtime conductor plays prepared audio
```

## What Not To Build Yet

Do not make the level runtime a full browser-synth clone. Exact WebAudio parity inside Godot would be expensive to build and maintain, and it would compete with game CPU/audio budgets. The better path is to make import/render preparation strong enough that Godot games receive normal audio assets plus rich chart timing.

Do not depend on the editor preview kit as the final shipped sound identity unless that is a deliberate aesthetic choice. It is small, useful, and now much closer to Chordsmith, but production games should be able to swap in rendered stems or licensed samples.

## Validation Targets

Each performance iteration should keep these checks green:

- addon package excludes `.uid` and `.import` metadata;
- `validate_pocket_chordsmith_runtime.gd` accepts saved charts/profiles;
- `validate_pocket_chordsmith_preview_mix.gd` keeps default buses dry and unmuted;
- `profile_pocket_chordsmith_preview_performance.gd` does not regress Play-button startup;
- `compare:chordsmith-godot-trace` keeps compiled musical events aligned with Chordsmith/Core;
- manual editor smoke shows visible render progress and responsive playback.

The target is not "Godot recreates every browser audio sample live." The target is "Godot receives musical intelligence plus prepared audio assets, then runs a stable, mixable, adaptive music system for games."
