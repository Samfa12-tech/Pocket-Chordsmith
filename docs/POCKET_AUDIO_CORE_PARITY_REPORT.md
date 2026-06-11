# Pocket Audio Core Parity Report

Date: 2026-06-11

This report covers the first Pocket Audio Core parity harness. It proves deterministic core fixture handling and render metrics inside the new package. It does not yet prove exact parity against the live Pocket Chordsmith browser app.

## Fixtures

The harness covers 12 fixture scenarios:

1. `basic-4-4-major` - basic 4/4 major progression, no swing.
2. `three-four` - 3/4 time signature.
3. `swing-groove` - swing groove.
4. `drum-tuplets` - triplets/tuplets in drums.
5. `melody-holds` - melody holds.
6. `melody-slides` - melody slides.
7. `manual-bass` - bass manual notes, holds, slides and accents.
8. `guitar-patterns` - guitar enabled with open, hold, chug, accent and scratch steps.
9. `multi-melody` - multiple melody tracks with mute/solo/pan.
10. `section-sequence` - section sequence A-B-C-D-A.
11. `build-drop-fx` - FX and sidechain source-state fixture.
12. `legacy-minimal` - minimal legacy-style project with missing fields.

Each fixture has:

- raw Pocket Chordsmith-style JSON under `packages/pocket-audio-core/tests/fixtures/`
- `PCS1:` share code text
- normalised `PocketAudioProject` snapshot
- deterministic event trace under `packages/pocket-audio-core/tests/golden/`
- deterministic audio metrics under `packages/pocket-audio-core/tests/golden/`

## Event Parity Status

Status: core-internal golden event parity passes.

The strict golden layer compares section transitions, bar/beat positions, event time, duration, ticks, stem, type, pitch metadata, velocity/accent, tuplets, instrument/tone metadata, articulation and pan where present.

Known limitation: these traces are generated from the new core, not yet extracted from the current Pocket Chordsmith v67 app. They prove deterministic behavior and regression safety inside the core. They do not yet prove exact agreement with the single-file app.

## Audio Metrics Status

Status: deterministic core render metrics pass.

Metrics include:

- duration seconds
- sample rate
- channel count
- event count
- peak
- RMS
- zero-crossing rate
- quantized sample hash

Known limitation: the renderer is a basic dependency-free PCM renderer. It is useful for duration, event coverage and deterministic regression checks, but it is not yet the Pocket Chordsmith Web Audio sound.

## Known Differences

- Pocket Chordsmith live and offline instruments are richer than the current core renderer.
- Chordsmith delay, chorus, flanger, reverb and sidechain are stored and exposed but not yet fully rendered with parity.
- Pocket DJ build/drop macros are represented through API seams but not golden-tested as live macro automation yet.
- Godot parity is not proven; Godot should still use generated assets/manifests later rather than native preview as exact parity.
- App timeline extraction is still manual because the current browser app timeline logic is embedded inside a single HTML file with UI/global state.

## App Comparison

Automatic comparison against the current Pocket Chordsmith app is not implemented yet. The current app code is tangled with DOM state, global mutable state, Web Audio globals and export UI. The next parity step should add a dev-only app trace exporter or fixture adapter that can run `buildSequenceEvents()` from v67 under a controlled VM/browser harness.

Manual comparison needed:

- export the same fixture projects from Pocket Chordsmith v67
- compare event counts by stem/type
- compare section start times and durations
- compare tuplets, holds, slides and guitar events
- compare WAV duration and rough audio metrics

## Commands

Commands run for this harness:

```powershell
cd packages/pocket-audio-core
npm run update:golden
npm run test:core
npm run test:golden
npm run test:render
npm test
npm run build
```

Results on this pass:

- `npm run update:golden`: generated 12 fixtures.
- `npm run test:core`: passed 12 tests.
- `npm run test:golden`: passed golden event trace coverage. On this Node build, the name-pattern command still executed the full golden test file, and all 25 checks passed.
- `npm run test:render`: passed render metrics coverage. On this Node build, the name-pattern command still executed the full golden test file, and all 25 checks passed.
- `npm test`: passed 37 tests.
- `npm run build`: generated `dist/pocket-audio-core.esm.js` and `dist/pocket-audio-core.iife.js`.
- Browser smoke: served `packages/pocket-audio-core` on `http://127.0.0.1:8766`, opened `examples/basic-html/index.html`, clicked `Load Demo`, `Play Events`, `Queue B`, `Drums -6 dB`, and `Render WAV`; all checks passed and browser console error logs were empty.

Runtime:

- Node: `v24.16.0`
- npm: `11.13.0`

## Gate

Pocket Chordsmith and Pocket DJ should not be integrated into the core until:

- core schema tests pass
- golden event tests pass
- render duration tests pass for multiple fixtures
- at least one browser smoke test plays the example without console errors
- a current-app comparison path is added or the remaining manual comparison is explicitly accepted as a limitation
