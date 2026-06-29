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
