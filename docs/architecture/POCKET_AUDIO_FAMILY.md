# Pocket Audio Family Architecture

Pocket Audio is a family of focused tools that share project data and, over time, should share more playback/export logic.

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
- Pocket DAW is the desktop/native production app. It imports compatible Chordsmith data, arranges it on a richer timeline, and can grow toward native rendering and project management.
- The Godot addon is the game integration/runtime conductor. Its addon path stays `addons/pocket_chordsmith/` so existing Godot installs and packaging workflows keep working.
- `packages/pcs-format/` is the future home for PCS format definitions, fixtures, migrations, and compatibility tests.
- `packages/pocket-audio-core/` is the shared runtime/export direction. Pocket Audio Core should eventually make playback/export feel consistent across web, DAW, DJ, and Godot, but this consolidation pass does not attempt to build the full shared engine.

## Compatibility Boundary

`PCS1:` and raw JSON remain the practical interchange formats for now. Apps can bridge to Pocket Audio Core incrementally, but should preserve their existing import/export compatibility and fallback paths while parity is still being proven.
