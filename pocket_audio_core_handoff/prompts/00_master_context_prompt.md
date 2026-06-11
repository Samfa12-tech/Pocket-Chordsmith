# Codex Prompt 00 — Master Context for Pocket Audio Core

You are working on the Pocket Chordsmith family of music tools.

We are designing and building **Pocket Audio Core**, a shared, headless Web Audio runtime that can be used by:

- Pocket Chordsmith
- Pocket DJ
- Pocket DAW
- new HTML/Three.js/Babylon.js games
- Godot export workflows
- future Android/Capacitor wrappers

## Main goal

A Pocket Chordsmith project should sound the same when moved between Pocket Chordsmith, Pocket DJ, Pocket DAW and new game runtimes.

The core should become the shared audio truth:

- same parser
- same project normaliser
- same scheduler
- same instruments
- same stem mixer
- same FX behaviour
- same offline WAV/stem renderer
- same adaptive section/game-state logic

## Important current context

Pocket Chordsmith is currently a browser-based music sketchpad with chord, beat, bass, melody, guitar, MIDI and WAV export support.

Pocket DJ is a separate live performance/remix deck that imports Pocket Chordsmith projects and turns them into section pads, stems, loops, builds, drops and FX.

The Godot addon currently uses compiled charts and Godot-native audio workflows. For true sound parity, Godot should prefer core-rendered stems/loops/stingers/sample kits or core-generated event manifests instead of relying only on a separate native procedural imitation.

Pocket DAW will be larger than Pocket Audio Core. It should be more like Audacity/Fruity Loops plus Pocket Chordsmith. Pocket Audio Core should provide the Chordsmith-compatible lanes and render engine inside the DAW; it should not limit the whole DAW to Chordsmith grids.

## Hard requirements

1. Do not update old games yet.
2. Design this for new games first.
3. Do not break existing Pocket Chordsmith data compatibility.
4. Do not rewrite the Pocket Chordsmith UI as part of the first core extraction.
5. Do not turn Pocket DJ into an editor.
6. Keep schema/project migration separate from runtime/playback state.
7. Keep project schema versioning separate from Pocket Audio Core versioning.
8. Build tests before or alongside integration.
9. Prove timing/event parity before claiming sound parity.
10. The core must support both live playback and offline rendering.

## Recommended approach

Work in phases:

1. Inventory the current audio code and data model.
2. Design the public core API.
3. Create a package scaffold.
4. Extract schema parsing and normalisation first.
5. Extract timeline/event generation.
6. Extract live scheduler and instrument playback.
7. Extract offline renderer.
8. Add fixtures and golden tests.
9. Integrate Pocket DJ first.
10. Integrate Pocket Chordsmith next.
11. Add DAW and Godot workflows after parity is proven.

## Exact-sound policy

For web apps, exact sound means same Pocket Audio Core version and same implementation.

For Godot, exact sound should usually come from core-rendered audio assets and/or event manifests. A native Godot procedural preview is allowed but must not be marketed as exact unless parity tests prove it.

## Output expectations

When you make changes:

- keep them small and reviewable
- add tests
- update changelogs/docs
- document limitations honestly
- include commands/tests actually run
- do not remove existing features without explicit instruction

Begin by reading the project structure and producing a practical design/inventory report before modifying code.
