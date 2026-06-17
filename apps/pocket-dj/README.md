# Pocket DJ

Pocket DJ is the performance/remix app for the Pocket Audio family.

It imports Pocket Chordsmith `PCS1:` share codes, compatible share-code payloads, and raw Pocket Chordsmith JSON, then turns songs into a live deck for section launching, stem mutes, loops, volume shaping, filter movement, builds, and drops.

Public app page:

```text
https://samfa12.itch.io/pocket-dj
```

License/status: source-available app, `UNLICENSED`. See the repository root
`LICENSES.md` before reusing or redistributing app code.

Pocket DJ should remain separate from the Chordsmith editor UI. Composition, detailed chord editing, melody grids, MIDI editing, and arrangement authoring belong in Pocket Chordsmith or Pocket DAW.

Future Pocket DJ sessions can export a `PDJ1` format that captures performance state, cue points, loop choices, FX moves, and remix metadata without rewriting the original Chordsmith composition.

## Current App

- `index.html` redirects to `pocket_dj_v1g_core_bridge.html`.
- `pocket_dj_v1f_push_handoffs.html` is retained as the direct push-handoff reference build.
- Planning docs live in `docs/`.

## Lofi Chill Pack

Pocket DJ imports Pocket Chordsmith lofi projects and preserves `audioProfile`, `lofiPreset`, `lofiTexture`, `drumKit`, `drumGroovePreset`, and `bassTone` metadata on the live deck.

The current app adds a `Lofi DJ Demo` plus lofi-aware macros: `Gentle Build`, `Rainy Drop`, `Filtered Study Mode`, and `Tape Stop`. These macros keep energy changes soft and warm instead of turning the mix into an EDM build/drop.

Send a lofi project from Pocket Chordsmith by copying the normal `PCS1:` share code or using the existing handoff path. Stem mutes, section queueing, loops, build/drop, volume controls, and imports continue to use the same Chordsmith-compatible payload.

## Local Check

```powershell
cd apps/pocket-dj
npm install
npm run test:e2e
npm run package:itch
```

`npm run package:itch` builds `packages/pocket-audio-core`, stages a clean Pocket
DJ web package under `dist/itch-package/`, and writes
`releases/pocket-dj/pocket-dj-web.zip`. The zip includes `index.html`,
`pocket_dj_v1g_core_bridge.html`, and packaged `pocket-audio-core/src` plus
`pocket-audio-core/dist` fallback files so hosted builds can load Pocket Audio
Core from `./pocket-audio-core/...`.
