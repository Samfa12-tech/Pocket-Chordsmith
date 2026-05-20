# Stem Workflow

Recommended shipping path:

1. Author in Pocket Chordsmith.
2. Export JSON/share code for chart timing.
3. Render stems from the same arrangement at the chart BPM.
4. Import JSON into `PCSChartResource`.
5. Assign stems through `PCSPlaybackProfile`.
6. Let `PocketChordsmithConductor` drive sections, markers, game events, bus volumes, effects, and adaptive state changes.

Suggested full-arrangement stem names:

```text
level_01_drums.ogg
level_01_bass.ogg
level_01_chords.ogg
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
	"melody_1": "res://music/level_01_melody_1.ogg",
	"fx": "res://music/level_01_fx.ogg",
}
```

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

