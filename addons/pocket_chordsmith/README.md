# Pocket Chordsmith Godot Addon

Pocket Chordsmith imports web-app JSON into compiled Godot resources, then drives runtime music callbacks through one lightweight conductor node.

Current release: `1.1.7`, with lofi/chillhop and chip tune Pocket Audio profile metadata support.

License/status: MIT. The component license is `LICENSE` in this addon folder.
See the repository root `LICENSES.md` for the full monorepo matrix.

Author charts in the Pocket Chordsmith web app:

```text
https://samfa12.itch.io/pocket-chordsmith
```

Pipeline:

```text
Pocket Chordsmith JSON -> importer/schema migrator -> PCSChartResource -> PocketChordsmithConductor
```

Runtime rules:

- Gameplay uses `PCSChartResource`, not full JSON.
- `PocketChordsmithConductor` owns timing, arrangement position, event cursors, beat/bar/section signals, markers, accents, and transition requests.
- Godot's built-in audio system remains the playback foundation. Use buses, effects, `AudioStreamPlayer`, `AudioStreamSynchronized` for stems, and `AudioStreamPolyphonic` for short accents/stingers.
- The legacy `runtime/PocketChordsmithPlayer.gd` is retained as an older procedural preview/reference path. It should not become the shipped runtime audio architecture.

Editor workflow:

1. Enable the `Pocket Chordsmith` addon.
2. Open the `Chordsmith` main screen.
3. Import a Pocket Chordsmith JSON, paste raw JSON, paste a `PCS1:` share code, or click `Import DAW Pack` for a Pocket DAW Godot Adaptive Pack ZIP.
4. Inspect the import report, sequence, sections, timeline, and event counts.
5. Optional: click `Generate Web Sound Kit` to create Pocket Chordsmith-style drum/stinger WAVs and a HYBRID playback profile.
6. Save the compiled chart as `.tres` or `.res`.
7. Assign the chart and playback profile to `PocketChordsmithConductor` in a level or demo scene.

Push-to-Godot workflow from the browser app:

1. In Pocket Chordsmith, open Settings > Project & export.
2. Click `Push to Godot`.
3. If the addon is enabled in an open Godot editor, the browser app sends the `PCS1:` song code to the local receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`.
4. The `Chordsmith` tab imports and compiles the song.
5. Click `Save Chart Resource` to save the compiled `.tres` or `.res` chart.
6. If local push is unavailable, the browser app copies the same `PCS1:` code and shows the manual paste path: `Chordsmith` tab > `Paste JSON/Code` > paste > import.

The addon does not require users to bring their own drum WAVs just to get started: the editor can generate a small built-in preview kit. At runtime, audio still uses Godot-native `AudioStream` playback. For a shipped game, use generated samples, your own licensed drum/stinger samples, rendered stems, or a mix of stems plus event-triggered samples.

Pocket DAW pack workflow:

1. Export `Godot Adaptive Pack` from Pocket DAW.
2. In the Godot `Chordsmith` tab, click `Import DAW Pack` and choose the exported ZIP.
3. The addon extracts the pack under `res://music/pocket_chordsmith_packs/`, compiles the embedded Pocket Chordsmith source into a chart resource, and creates a `PCSPlaybackProfile` pointing at the rendered full mix, stems, and section loops.
4. Press `Play Preview` to audition the rendered pack audio, then use the saved chart/profile resources on `PocketChordsmithConductor`.

Headless import:

```text
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/import_daw_game_pack.gd -- --pack <godot-adaptive-pack.zip>
```

Visual track building stays in the web app for now. Godot receives the exported JSON/share code, compiles it to a lightweight `PCSChartResource`, then uses the conductor for timing, states, markers, cues, and Godot-native audio routing. A future Godot visual editor should build on the compiled chart/section data instead of porting the whole browser app into runtime.

For batch migration, use the editor `Compile Folder` button or the headless compiler:

```text
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/compile_pocket_chordsmith_charts.gd -- --source <json-or-folder> --beside-source
```

The main screen also includes `Create Chordsmith Audio Buses`. This safely adds missing recommended buses only:

```text
Master
  Music_Master
    Music_Drums
    Music_Bass
    Music_Chords
    Music_Guitar
    Music_Melody
    Music_Stingers
    Music_FX
  SFX
  UI
```

Existing buses are reused. Existing sends are reported as warnings instead of being overwritten.
The guitar bus also gets a conservative native amp/cab-style preview chain when created: high-pass, distortion, EQ, low-pass, compression, and limiting.

Runtime signal example:

```gdscript
@onready var conductor: PocketChordsmithConductor = $PocketChordsmithConductor

func _ready() -> void:
	conductor.accent_hit.connect(_on_accent)
	conductor.section_started.connect(_on_section_started)
	conductor.marker_hit.connect(_on_marker_hit)
	conductor.play()
```

Native audio extension points live in `PCSPlaybackProfile` and the conductor:

- stem paths and bus names
- music/accent bus names
- intensity mix targets
- ducking rules
- filter automation maps
- optional native audio router node via `native_audio_router_path`

Playback backends:

- `STEM_SYNC`: preferred shipped-game path using rendered stems and Godot playback.
- `HYBRID`: stems for the main bed plus event-triggered accents or stingers.
- `PROCEDURAL_PREVIEW`: editor-oriented preview mode, not the default mobile runtime path.

Adaptive music states:

```gdscript
conductor.set_music_state("exploration")
conductor.queue_music_state("combat", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
conductor.queue_sequence(["A", "B", "C"], PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION)
conductor.trigger_stinger("victory_hit", "exploration")
```

States are stored on `PCSChartResource.music_states` and can map to `section`, `sequence`, `loop_sections`, `entry`, `stinger`, and `then_return_to`. Transitions can wait for immediate, beat, bar, section, loop, or marker boundaries.

Native mix controls:

```gdscript
conductor.set_layer_volume("drums", -6.0)
conductor.mute_layer("melody", true)
conductor.duck_music(true, 0.5)
conductor.lowpass_music(0.75)
conductor.set_bus_effect_amount("Music_Master", "reverb", 0.25)
```

## Lofi Chill Pack

The importer/migrator accepts Pocket Chordsmith lofi metadata without requiring a schema bump: `audioProfile`, `lofiPreset`, `lofiTexture`, `drumKit`, `drumGroovePreset`, and `bassTone`. Compiled `PCSChartResource` files store that metadata so games can choose adaptive chill-game states from the lightweight chart resource.

`Create Chordsmith Audio Buses` now also prepares a `Music_Texture` path under `Music_FX` for optional low-pass, reverb, and soft saturation-style texture. The generated preview sound kit includes practical lofi drum keys and profile mappings, but shipped games should still prefer stems, licensed samples, or the HYBRID path when production audio quality matters.

For sample-preview lofi drums, prefer kit-specific playback-profile keys such as `lofi_tape_soft:kick`; the conductor falls back to legacy keys such as `lofi_kick` and then the plain lane name.

Chill-game state example:

```gdscript
conductor.set_music_state("menu")
conductor.set_music_state("explore")
conductor.queue_music_state("night", PocketChordsmithConductor.TransitionBoundary.NEXT_BAR)
conductor.queue_music_state("night", PocketChordsmithConductor.TransitionBoundary.NEXT_SECTION)
conductor.lowpass_music(0.65)
conductor.set_bus_effect_amount("Music_Texture", "lowpass", 0.35)
```

## Chip Tune Pack

The importer/migrator also accepts Pocket Chordsmith chip tune metadata without requiring a schema bump: `audioProfile`, `chipPreset`, `chipTexture`, `drumKit`, `drumGroovePreset`, `bassTone`, `chordInstrument`, and `melodyInstruments`. Compiled chart resources preserve this metadata for arcade menus, boss states, victory stingers, and modern chip-inspired loops while keeping shipped audio on the Godot-native stem/sample path.

The bundled web-kit playback profile maps chip chord, melody, bass, and drum identifiers to safe preview aliases. These previews are for editor auditioning; production projects should still prefer rendered stems from Pocket DAW game packs, licensed samples, or a HYBRID playback profile.

More docs:

- `CHANGELOG.md`
- `MIGRATION.md`
- `docs/GETTING_STARTED.md`
- `docs/LEVEL_INTEGRATION.md`
- `docs/SHIPPING_CHECKLIST.md`
- `docs/RELEASE_CANDIDATE.md`
- `docs/CLI_COMPILE.md`
- `docs/RUNTIME_BRIDGE.md`
- `docs/STEM_WORKFLOW.md`
- `docs/SAMPLE_PREVIEW.md`
- `docs/UID_CACHE_RECOVERY.md`
- `SKILL.md` for AI-assisted project integration

Release-candidate tools:

```text
godot --headless --path <project> --script res://addons/pocket_chordsmith/tools/validate_pocket_chordsmith_runtime.gd -- --chart <chart.tres> [--profile <profile.tres>] [--report <report.md>]
```

Godot Asset Library release checklist:

1. Commit all release changes to Git.
2. Copy the full 40-character Git commit hash from the committed revision.
3. Paste that full hash into the Godot Asset Library `Download Commit` field.
4. Do not use branch names or version tags such as `main`, `master`, or `v1.1.6` for `Download Commit`.
