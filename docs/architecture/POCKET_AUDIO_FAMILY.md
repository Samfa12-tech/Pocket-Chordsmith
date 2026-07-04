# Pocket Audio Family Architecture

Pocket Audio is a family of focused tools that share project data and, over time, should share more playback/export logic.

This public repository has mixed licensing. The Godot addon is MIT, while the
current apps and shared package scaffolds are source-available or WIP/private
unless their metadata says otherwise. See `../../LICENSES.md`.

```text
Pocket Chordsmith
  -> PCS1 / JSON
  -> Pocket DJ
  -> Pocket DAW
  -> Godot addon / game runtimes
```

## Roles

- Pocket Chordsmith is the composition sketchpad and studio. It remains the main place to create songs, sections, chords, drums, bass, melody, guitar, MIDI, WAV, and share-code data.
- Pocket DJ is the live performance/remix deck. It imports Chordsmith projects and turns them into section pads, mutes, loops, stem controls, and FX without becoming another composition editor.
- Pocket DAW is the native Windows desktop production app. It imports compatible Chordsmith/Pocket Audio data, arranges it on a richer timeline, records and manages audio/MIDI material where supported, renders/exports through native app paths, and is distributed through Windows installer/updater flows. It is not a browser DAW and should not be implemented as an HTML5/Web Audio app.
- The Godot addon is the game integration/runtime conductor. Its addon path stays `addons/pocket_chordsmith/` so existing Godot installs and packaging workflows keep working.
- `packages/pcs-format/` is the future home for PCS format definitions, fixtures, migrations, and compatibility tests.
- `packages/pocket-audio-core/` is the shared runtime/export direction. Pocket Audio Core should eventually make playback/export feel consistent across web, DAW, DJ, and Godot, but this consolidation pass does not attempt to build the full shared engine.

## Pocket DAW Timing Boundary

Pocket DAW's central architectural rule is that timing belongs to the native
audio engine/sample clock.

The UI may display the playhead, dispatch commands, and edit project state, but
it must not drive playback, recording placement, scheduler timing, loop
boundaries, cache timing, or export length.

Live playback, native render/cache, WAV/stem export, recording placement, and
project save/reopen should interpret the same project/timeline model wherever
possible.

## Compatibility Boundary

`PCS1:` and raw JSON remain the practical interchange formats for now. Apps can bridge to Pocket Audio Core incrementally, but should preserve their existing import/export compatibility and fallback paths while parity is still being proven.
