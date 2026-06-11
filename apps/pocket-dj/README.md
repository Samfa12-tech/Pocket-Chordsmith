# Pocket DJ

Pocket DJ is the performance/remix app for the Pocket Audio family.

It imports Pocket Chordsmith `PCS1:` share codes, compatible share-code payloads, and raw Pocket Chordsmith JSON, then turns songs into a live deck for section launching, stem mutes, loops, volume shaping, filter movement, builds, and drops.

Pocket DJ should remain separate from the Chordsmith editor UI. Composition, detailed chord editing, melody grids, MIDI editing, and arrangement authoring belong in Pocket Chordsmith or Pocket DAW.

Future Pocket DJ sessions can export a `PDJ1` format that captures performance state, cue points, loop choices, FX moves, and remix metadata without rewriting the original Chordsmith composition.

## Current App

- `index.html` redirects to `pocket_dj_v1g_core_bridge.html`.
- `pocket_dj_v1f_push_handoffs.html` is retained as the direct push-handoff reference build.
- Planning docs live in `docs/`.
