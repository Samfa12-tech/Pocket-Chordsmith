# Godot Visual Editor Exploration

This is the TASK-36 exploration note for compiled-chart and section visual editing inside Godot. It does not change current addon behavior: the `Chordsmith` main screen imports Pocket Chordsmith JSON, `PCS1:` share codes, and Pocket DAW Godot Adaptive Packs, then compiles them to `PCSChartResource` plus optional `PCSPlaybackProfile` resources for preview and runtime use.

## Current Baseline

- `editor/pcs_main_screen.gd` already provides import, paste, direct browser push, DAW pack import, folder compile, chart save, preview, section list, timeline and import-report UI.
- `editor/pcs_timeline_view.gd` draws arrangement section bands, compiled events by track type, and a preview playhead.
- `editor/pcs_section_list.gd` lists compiled sections with bars, event-ish counts, bass, guitar and melody summaries.
- `resources/pcs_chart_resource.gd` stores compiled timing data, section library, source section data, arrangement positions, compiled events, markers, loop regions, intensity tags, music states, stem sets, gameplay flags and metadata.
- `resources/pcs_section_resource.gd` stores lightweight section summaries, not a full editable Chordsmith grid.
- `runtime/pocket_chordsmith_conductor.gd` is the runtime clock, event cursor and adaptive-state bridge.

## Decision

Godot should not become a port of the Pocket Chordsmith browser editor. The first visual editor work should be a compiled-chart inspector and adaptive music authoring surface for game integration.

Musical composition stays in Pocket Chordsmith and deeper arrangement/stem work stays in Pocket DAW. Godot edits should focus on how the compiled chart is used in a game: sections, markers, loop regions, music states, playback profiles, buses, stingers, intensity tags and runtime validation.

## Useful First Slice

Add a `Chart Inspector` panel to the existing `Chordsmith` main screen:

- selected section details from `section_library` and `section_source_data`;
- event lane filters for drums, bass, chords, guitar, melody and markers;
- marker and loop-region list with tick/bar/section readouts;
- music-state list showing `section`, `sequence`, `loop_sections`, `entry`, `stinger` and `then_return_to`;
- playback-profile summary showing backend, stems, sample kits, buses and missing assets;
- validation warnings that mirror the headless runtime validator.

This slice can be read-only at first. It would still be valuable because it lets game developers audit compiled charts without opening the browser app.

## Safe Editable Fields

The first editable Godot surface should limit itself to runtime/game metadata:

- `level_id`
- `mood`
- `default_loop`
- `default_music_state`
- `music_states`
- `markers`
- `loop_regions`
- `intensity_tags`
- `gameplay_flags`
- playback-profile assignment and bus names

These are Godot/runtime-facing fields. Editing them should not imply that notes, chords, drums, bass, melody, guitar or arrangement source have changed.

## Musical Edit Boundary

Avoid editing these directly in Godot until a reversible source roundtrip exists:

- chord progressions;
- drum/bass/melody/guitar grids;
- tuplets, holds and slides;
- song arrangement order;
- tempo, key, scale and time signature;
- generated instrument choices that should remain compatible with Chordsmith/DAW.

If Godot eventually supports musical edits, it should write an explicit source patch and recompile through the importer/compiler. It should not mutate compiled events as the source of truth.

## UI Direction

Build on the current `PCSMainScreen`:

- Keep the toolbar short and reuse the existing import/save/preview flow.
- Add tabs or collapsible panels for `Timeline`, `Sections`, `States`, `Markers`, `Playback`, and `Validation`.
- Let timeline clicks select a section, marker or event summary.
- Keep event drawing dense and visual; put detailed property editing in side panels.
- Prefer Godot-native controls and `Resource` editing over custom browser-style grids.
- Make dangerous edits explicit with validation and undo/redo support through Godot editor conventions.

## Runtime Validation Direction

Every editable path should be backed by a headless check:

- saved chart loads;
- conductor can assign chart and playback profile;
- `validate_pocket_chordsmith_runtime.gd` reports no errors;
- music states have valid sections/stingers;
- markers and loop regions resolve to chart ticks;
- playback profile references existing streams or reports expected preview warnings.

## Non-Goals

- Do not port the Pocket Chordsmith browser UI to Godot.
- Do not parse full JSON at runtime.
- Do not make compiled events the editable musical source of truth.
- Do not create a separate Godot-only song format that cannot roundtrip.
- Do not add project-specific game concepts to addon core.
- Do not claim Godot procedural preview is exact Chordsmith/DAW sound parity.

## Verification Targets

- Existing headless addon gates in `HEADLESS_VALIDATION.md` keep passing.
- A chart-inspector test project can import a demo JSON, save a chart, reopen it, and display section/state/marker summaries without errors.
- A metadata edit roundtrip test saves `music_states`, `markers`, `loop_regions` and `gameplay_flags`, reloads the `.tres`, and validates runtime diagnostics.
- A DAW pack imported through the current ZIP flow still previews and validates after inspector-only changes.
- Documentation keeps the browser app as the music authoring surface and Pocket DAW as the production/stem surface.

## Release Boundary

Until the inspector/editor exists and passes headless plus real-editor smoke, release notes should describe this as exploration only. The current shipped addon remains an importer, compiler, preview tab, resource saver, conductor and runtime bridge.
