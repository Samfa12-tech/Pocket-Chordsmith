# Stem Workflow

Recommended shipping path:

1. Author in Pocket Chordsmith.
2. Export JSON/share code for chart timing, or send the same chart into Pocket DAW.
3. Render stems from the same arrangement at the chart BPM.
4. Import JSON into `PCSChartResource`, or import a Pocket DAW Godot Adaptive Pack ZIP when rendered audio is already available.
5. Assign stems through `PCSPlaybackProfile`.
6. Let `PocketChordsmithConductor` drive sections, markers, game events, bus volumes, effects, and adaptive state changes.

## Source Formats

Pocket Chordsmith JSON and `PCS1:` share codes are score data: notes, sections, timing, sound IDs, mix metadata, and adaptive hints. They are enough for Godot to compile a chart and run an editor preview, but they are not stem audio.

Pocket DAW Godot Adaptive Packs are game-audio asset bundles. They include the chart source plus rendered full mixes, stems, section loops, and a generated playback profile. This path does less work inside Godot and should be preferred when the goal is shipped mix parity.

Do not make gameplay render stems from Chordsmith text. That would require porting or embedding a music renderer in Godot and would compete with game CPU/audio budgets. If Pocket Chordsmith grows a direct game-pack export later, it should export rendered audio assets alongside the chart, similar to the DAW pack path.

For text-only imports, the addon can render preview/cache stems before playback through `Render Preview Audio` or `tools/render_pocket_chordsmith_preview_audio.gd`. Treat these as prepared preview assets: they are useful for stable editor auditioning and can be routed/mixed like stems, but they are generated from the addon preview kit/native preview voices rather than a mastered DAW render.

Prepared section stems live in `PCSPlaybackProfile.section_stem_sets`:

```gdscript
{
	"A": {
		"drums": "res://music/packs/level_01/stems/A_drums.ogg",
		"bass": "res://music/packs/level_01/stems/A_bass.ogg",
		"chords": "res://music/packs/level_01/stems/A_chords.ogg",
		"guitar": "res://music/packs/level_01/stems/A_guitar.ogg",
		"melody": "res://music/packs/level_01/stems/A_melody.ogg",
	},
	"B": {
		"drums": "res://music/packs/level_01/stems/B_drums.ogg",
		"bass": "res://music/packs/level_01/stems/B_bass.ogg",
	}
}
```

At runtime, `PocketChordsmithConductor.queue_section("B")` changes the chart section and resolves the matching section stem map. Call `conductor.prewarm_audio()` during loading so section/state/full-song stems are imported or diagnosed before gameplay.

Section stem files start at the beginning of that section. The conductor
subtracts the current arrangement occurrence's start tick, so repeated A/B
sections and halfway seeks use the same local audio. `stem_paths` remains
arrangement-absolute. State sets also retain absolute playback by default; an
explicit `state_stem_origin_ticks[state_name]` declares the absolute tick that
corresponds to zero in a state-local file. Do not infer origins from filenames.
`seek_tick()` repositions prepared players as well as chart/event cursors.
An empty selection clears obsolete player streams so a later seek/jump cannot
restart the preceding section. Pause also pauses the actual prepared players;
a seek while paused prepares the new set but starts it only on Resume.

The automated `tests/pcs_stem_origin_test.gd` uses deterministic PCM tones,
actual Godot players and engine-bus capture with the warmed Dummy driver. It
checks local/absolute positions and tone identity in both player modes,
nonempty-to-empty silence, automatic A/B/repeated-A transitions with processing
active, explicit state origins, pause/seek/resume, ordinary pause/resume position
and in-place player-mode switching with exclusive ownership. It does not establish
physical output, human listening, source-engine fidelity or cold-load budgets.

Game-pack import uses exclusive full-mix/layer selection. The adaptive default
excludes the full mix and duplicate aggregate/branch drums. Choose
`playback_mix: "full-mix"` for the source reference or `drum_stems: "branches"`
for independent drum branches. Core's shared texture bed is a single layer.
Keep baked layer gains at unity. `PCSChartBuildTools` sets pack-local WAVs to
lossless PCM import; let the editor reimport before auditioning or exporting the
game. Godot 4.6 otherwise defaults to lossy QOA. Uncompressed stems require more
memory, so cold-load budgeting remains a separate gate. See
`docs/GODOT_PARITY_EXPORT_WORKFLOW.md` in the repository root for contracts and
the rendered Core PCM comparison command.

Suggested full-arrangement stem names:

```text
level_01_drums.ogg
level_01_bass.ogg
level_01_chords.ogg
level_01_guitar.ogg
level_01_melody_1.ogg
level_01_melody_2.ogg
level_01_fx.ogg
```

Suggested profile mapping:

```gdscript
profile.stem_paths = {
	"drums": "res://music/level_01_drums.ogg",
	"bass": "res://music/level_01_bass.ogg",
	"chords": "res://music/level_01_chords.ogg",
	"guitar": "res://music/level_01_guitar.ogg",
	"melody_1": "res://music/level_01_melody_1.ogg",
	"fx": "res://music/level_01_fx.ogg",
}
```

Route rendered guitar stems or guitar event samples to `Music_Guitar` so they can use guitar-specific amp/cab/EQ treatment without affecting chord pads.

For adaptive music, prefer state stem sets when each state has its own loop audio:

```gdscript
profile.stem_sets = {
	"exploration": {
		"drums": "res://music/level_01_exploration_drums.ogg",
		"bass": "res://music/level_01_exploration_bass.ogg"
	},
	"combat": {
		"drums": "res://music/level_01_combat_drums.ogg",
		"bass": "res://music/level_01_combat_bass.ogg"
	}
}
```

Use `STEM_SYNC` for released builds, `HYBRID` when stems plus event-triggered samples/stingers are needed, and `PROCEDURAL_PREVIEW` only for editor auditioning.

For sample-accurate transitions, render stems on bar/section boundaries using the same BPM and loop length as the chart. Queue music states on `NEXT_BAR`, `NEXT_SECTION`, or `NEXT_LOOP` so the conductor switches at integer chart ticks. Future work should add crossfade stem players for overlapping state changes.

The current performance roadmap is `PERFORMANT_AUDIO_ROADMAP.md`: prepare/import/render audio visibly, cache generated assets with clear invalidation, and keep gameplay focused on synchronized stem/sample playback through Godot's mixer.
