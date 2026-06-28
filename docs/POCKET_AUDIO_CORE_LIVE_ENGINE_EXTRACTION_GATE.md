# Pocket Audio Core Live Engine Extraction Gate

This is the TASK-35 design anchor for moving the full Pocket Chordsmith live engine into Pocket Audio Core. It does not change current behavior: Pocket Chordsmith v68 still uses its legacy browser scheduler and synth voices for audible live playback and preview sounds, with Pocket Audio Core used for project diagnostics and first-pass WAV export when available.

## Current Baseline

- `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html` is the current browser app.
- `apps/chordsmith-web/POCKET_CHORDSMITH_CODEX_CONTEXT.md` keeps the Chordsmith rules: single-file portability, schema `16`, mobile-first UI, Simple/Advanced split, no external dependencies by default, and preservation of JSON/import/share-code/MIDI/WAV/playback behavior.
- `packages/pocket-audio-core` is `0.1.0-scaffold`.
- Core has parser/normalizer, deterministic events, first-pass WAV/stem rendering, a simple live scheduler and game runtime seams.
- `docs/POCKET_AUDIO_CORE_PARITY_REPORT.md` records strict Chordsmith-normalized event trace parity, but also records that Core audio rendering is not the Pocket Chordsmith Web Audio sound.
- `docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md` says exact parity claims need app-specific tests, fixture gates and manual listening evidence.
- `docs/POCKET_AUDIO_CORE_APP_INTEGRATION_REPORT.md` records that Pocket Chordsmith live audible playback and preview sounds remain legacy app code.

## Decision

Do not extract or replace Pocket Chordsmith live audible playback until the gates below pass. The next implementation work should harden Core behind the app, not remove the app's proven live engine.

Core can keep owning more shared data, event and diagnostic surfaces before it owns sound. Full live-engine extraction becomes eligible only when event timing, voice identity, FX behavior, performance safety and rollback are all proven.

## Entry Gates

Before any PR makes Core the default Chordsmith live playback engine:

- Core event parity must pass for the committed fixture set through `npm run compare:chordsmith-browser-trace`.
- Core render metrics must pass through `npm test` and fixture golden checks.
- Core must implement Chordsmith-equivalent voices for drums, bass, chords, melody, guitar, lofi/chip profiles, texture/noise, sidechain and key FX surfaces that the app exposes.
- A listening A/B record must exist for representative fixtures: clean default, lofi, chip, guitar-heavy, tuplets, slides/holds, multi-melody, swing, 3/4 and dense arrangement.
- A mobile browser smoke must show no console errors, no user-gesture audio unlock regression, no layout regression and no excessive scheduler drift.
- Chordsmith JSON, `PCS1:`, autosave/browser slots, MIDI export and WAV export must remain backward compatible.
- The release build must include a documented rollback path to the legacy engine.

## Staged Extraction Path

1. **Inventory and freeze**
   - Keep the current Chordsmith live functions as the reference.
   - Record function groups for transport/scheduler, voices, preview sounds, FX, offline WAV, MIDI export and UI callbacks.
   - Add fixture names and expected listening notes before rewriting voices.

2. **Core parity implementation**
   - Move or mirror one role at a time into Core: drums, bass, chords, melody, guitar, then texture/FX.
   - Keep shared sound IDs and voice curves in Core registries first.
   - Add fixture tests for each role before enabling it in the app.

3. **Shadow mode in Chordsmith**
   - Load Core beside the legacy engine.
   - Let Core compute schedules, diagnostics and optional dry-run voice counts while legacy audio remains audible.
   - Compare event counts, start times, roles, active voices and dropped scheduler windows without changing user sound.

4. **Opt-in audible Core mode**
   - Add an Advanced/diagnostic-only switch or build flag.
   - Keep the legacy engine available in the same build.
   - Surface clear status when Core is active or when it falls back.

5. **Default switch**
   - Make Core the default only after automated, manual and mobile gates pass.
   - Keep a legacy fallback for at least one public release cycle.
   - Preserve previous single-file Chordsmith snapshots for emergency release rollback.

## Rollback Requirements

- The app must be able to choose legacy playback if Core fails to load, throws during project load, fails audio unlock, exceeds drift limits or reports missing voice definitions.
- Rollback must not change project data or schema.
- A failed Core render/playback attempt must leave transport controls usable.
- Release notes must name the fallback behavior and any known parity gaps.
- The previous working single-file HTML build must remain available under `apps/chordsmith-web/` or `archive/` until the Core default has survived public smoke.

## Implementation Boundaries

Pocket Chordsmith keeps:

- editor UI and Simple/Advanced flow;
- save slots, autosave, JSON, `PCS1:` and handoff UI;
- MIDI import UI;
- user-facing versioned single-file release shape;
- legacy engine fallback until the default switch is proven.

Pocket Audio Core should own, when proven:

- parser and normalization helpers;
- deterministic event renderer;
- shared live scheduler and transport;
- reusable voice manager with role budgets;
- Chordsmith-compatible synth voices and FX;
- diagnostics and stress counters;
- offline renderer and stems where parity is signed off.

## Verification Targets

- Core package: `npm test`, `npm run build`, `npm run compare:chordsmith-browser-trace`.
- Chordsmith app: `npm run test:e2e` plus manual browser audio smoke for changed voices.
- Family sound surfaces: `npm run verify:family-parity` when shared sound IDs, voice curves, generated surfaces or app renderers change.
- Mobile: phone-width smoke for play/stop, section switching, preview sounds, MIDI export and WAV export.
- Listening: A/B notes with fixture name, app build, Core version, browser/device and known differences.

## Release Boundary

Until the gates pass, release notes should say that Core bridges diagnostics, shared metadata and first-pass export scaffolding. They should not say that the full Chordsmith live engine has moved, nor that Core playback matches Chordsmith, unless the evidence named here exists.
