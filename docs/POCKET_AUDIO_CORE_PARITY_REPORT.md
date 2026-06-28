# Pocket Audio Core Parity Report

Date: 2026-06-11

This report covers the first Pocket Audio Core parity harness. It proves deterministic core fixture handling, render metrics, and current Chordsmith browser trace agreement after Chordsmith imports and re-exports the fixture project.

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

Status: core-internal golden event parity passes, and Chordsmith-normalized browser trace parity passes.

The strict golden layer compares section transitions, bar/beat positions, event time, duration, ticks, stem, type, pitch metadata, velocity/accent, tuplets, instrument/tone metadata, articulation and pan where present.

`npm run compare:chordsmith-browser-trace` now opens Pocket Chordsmith v68 in Playwright, imports every committed raw fixture through `window.PocketChordsmithParityTrace.fromProject()`, and verifies that Pocket Audio Core reproduces the app-normalized event trace from the exported Chordsmith project. This proves the shared core can follow the current app's import/export surface.

Known limitation: raw fixture JSON still drifts from Chordsmith's browser import interpretation for legacy/compact step grids. Chordsmith currently expands some older 16-step fixture grids into its 64-cell section canvas, while the raw core fixture normalizer treats them as one-bar advanced grids. The comparison command prints this raw drift intentionally; use `--strict-raw` only when that migration decision has been resolved.

Decision note, 2026-06-28: keep `npm run compare:chordsmith-browser-trace` non-strict for raw fixture drift. The release gate is strict for Chordsmith-normalized browser exports because that is the compatibility contract users exercise through import/export. Raw fixture drift remains diagnostic evidence for a future migration pass, not a failure, until the project intentionally redefines legacy/compact-grid semantics and updates fixtures or core normalisation together.

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
- Raw fixture interpretation still differs from Chordsmith browser import for some legacy/compact grids; app-normalized browser exports compare cleanly against core.

## App Comparison

Pocket Chordsmith v68 exposes `window.PocketChordsmithParityTrace` for browser harnesses. `current()` returns the current app project plus the normalized `buildSequenceEvents()` trace, and `fromProject(rawProject, options)` imports a supplied project, traces it, then restores the user's current project. This gives DAW/Core work a direct current-app trace path without adding UI or changing saves.

`packages/pocket-audio-core/scripts/compare-chordsmith-browser-trace.mjs` runs the committed fixture set through that hook. The default check is strict for Chordsmith-normalized exports and diagnostic for raw fixture drift; `--strict-raw` can be used later when raw fixture migration semantics are expected to match too.

- compare Pocket DAW imported event skeletons against the same Chordsmith browser trace
- compare WAV duration and rough audio metrics
- perform installed-app A/B listening with the same fixture exports

## Commands

Commands run for this harness:

```powershell
cd packages/pocket-audio-core
npm run update:golden
npm run test:core
npm run test:golden
npm run test:render
npm run compare:chordsmith-browser-trace
npm test
npm run build
```

Results on this pass:

- `npm run update:golden`: generated 12 fixtures.
- `npm run test:core`: passed 12 tests.
- `npm run test:golden`: passed golden event trace coverage. On this Node build, the name-pattern command still executed the full golden test file, and all 25 checks passed.
- `npm run test:render`: passed render metrics coverage. On this Node build, the name-pattern command still executed the full golden test file, and all 25 checks passed.
- `npm run compare:chordsmith-browser-trace`: passed Chordsmith-normalized browser trace parity for all 12 fixtures; raw fixture drift remains printed as diagnostic evidence.
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
- `npm run compare:chordsmith-browser-trace` passes, with raw drift reviewed when fixture/import migration behavior is being changed
