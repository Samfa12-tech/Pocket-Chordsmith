# Pocket Audio Family Stability Audit

Date: 2026-06-20
Baseline: Pocket DAW 0.6.19, Pocket Chordsmith v68 core bridge, Pocket DJ v1g core bridge, Godot addon 1.1.7.

## Scope

This audit covers:

- Pocket Chordsmith: `apps/chordsmith-web/`
- Pocket DJ: `apps/pocket-dj/`
- Pocket DAW: `apps/pocket-daw/`
- Pocket Audio Core: `packages/pocket-audio-core/`
- PCS format boundary: `PCS1:` plus raw JSON compatibility
- Godot addon: `addons/pocket_chordsmith/`
- CI and release verification

## Current Stability Baseline

- Pocket Chordsmith remains the authoring source for PCS-compatible songs.
- Pocket DJ and Pocket DAW consume Chordsmith-compatible data and preserve source compatibility.
- Pocket Audio Core has the strongest family-level parity gate through `npm run verify:family-parity`.
- Pocket DAW has the broadest app test surface and now has a proposed Windows native CI gate.
- Godot addon packaging and release paths are stable. Local Godot execution was verified in an open Godot 4.6.3 project, but automated Godot execution is not yet part of CI.

## Component Findings

### Pocket Chordsmith

Strengths:

- Current browser app is the practical schema and behavior authority.
- PCS1/share-code import/export remains the key compatibility boundary.
- Browser parity trace hooks allow core and DAW to compare event generation.

Risks:

- Some musical defaults still exist as source constants in the app and are mirrored elsewhere.
- Source-text parity can prove constants are synchronized, but not always that behavior is equivalent.
- Direct browser-to-Godot push now has a live local smoke pass against addon 1.1.7, but it still needs a deterministic checked-in fixture before it can be promoted to CI.

### Pocket DJ

Strengths:

- DJ stays product-focused as a performance/remix deck rather than another composition editor.
- Playwright coverage catches import and performance-surface regressions.
- It already consumes shared lofi/sound IDs through parity checks.

Risks:

- DJ-specific scheduler/remix behavior is still separate from DAW and core live-engine behavior.
- Browser e2e tests are useful but do not prove deterministic audio event parity for every control path.

### Pocket DAW

Strengths:

- Strong TypeScript/Vitest coverage for schema migration, import/export, timeline, UI, native-cache behavior, and recording foundations.
- Native Rust tests cover playback synthesis, cache WAV decode, metronome, sidechain, path safety, bridge auth, and recording WAV/path helpers.
- Recording first-pass hardening now preserves fractional placement and moves startup work before the capture boundary.

Risks:

- Native playback and native recording are not sample-clock unified.
- Audio-file/native cache hydration is still a DAW-specific bridge, not fully shared family logic.
- Release verification is stronger locally than in CI unless the new Windows native job is kept.

### Pocket Audio Core

Strengths:

- Best location for deterministic normalization, event generation, render metrics, sound-surface metadata, and cross-app parity fixtures.
- `verify:family-parity` already catches drift across Chordsmith, DJ, DAW, Godot, and generated native sound recipes.

Risks:

- Core is still a scaffold plus selected shared behavior. It should not be mistaken for the full DAW engine.
- Some parity checks compare source text or generated metadata. Those should remain backed by behavior tests and golden fixtures.

### PCS Format Boundary

Strengths:

- `PCS1:` and raw JSON remain the durable interchange path.
- Unknown Chordsmith source fields are preserved in DAW imports.
- Schema-16 compatibility is treated as current app behavior rather than stale skill text.

Risks:

- `packages/pcs-format/` is still a scaffold, so schema ownership is split between app code, core helpers, fixtures, and migration tests.
- Normalization and migration should move first, before live engine consolidation.

### Godot Addon

Strengths:

- Stable path: `addons/pocket_chordsmith/`.
- Addon release packaging has a dedicated Godot script.
- Godot pack imports and sample preview docs give practical game-runtime coverage.
- In an open Godot 4.6.3 project with addon 1.1.7 enabled, `GET /pocket-chordsmith/health` returned OK and a valid direct push POST compiled successfully in the Chordsmith tab.
- Headless local validation loaded all five compiled level charts with the sample-focus playback profile and returned OK.
- Headless local validation loaded an imported DAW adaptive pack chart/profile and returned OK with expected swing/sample-assignment warnings.
- Godot `--check-only` parsed all 29 addon GDScript files successfully.

Risks:

- CI does not currently run a headless Godot fixture.
- Editor-level import and preview behavior still rely mostly on manual smoke.
- Exact synth parity is not claimed; rendered DAW/Godot packs are the safer exact-audio handoff.
- The Godot MCP health audit reports false-positive script syntax errors on valid GDScript dictionary/enum syntax, so CI should prefer Godot CLI parsing over that lightweight scanner.

## Duplicated Normalizers

Likely duplication points:

- Chordsmith browser project sanitization.
- Pocket Audio Core normalization.
- Pocket DAW PCS import and migration path.
- Pocket DJ deck/session import normalization.
- Godot addon import/compiler normalization.

Recommendation:

1. Make `packages/pcs-format/` the source of schema version metadata, migration fixtures, and parse/validate contracts.
2. Keep app-specific UI defaults local, but route compatibility normalization through shared functions.
3. Add golden fixture tests for every migrated schema boundary before moving more behavior.

## Duplicated Scheduler And Event Logic

Likely duplication points:

- Chordsmith live Web Audio scheduler.
- Pocket DJ live remix scheduler.
- Pocket DAW Web Audio fallback scheduler.
- Pocket DAW native event renderer/playback bridge.
- Pocket Audio Core timeline/event generation.
- Godot conductor event callbacks.

Recommendation:

1. Consolidate deterministic event generation first.
2. Keep runtime playback engines separate until event parity is stable.
3. Use core golden event fixtures as the contract between app schedulers and runtimes.
4. Add behavior parity tests for start offsets, loops, tuplets, holds, slides, humanise, swing, sidechain, lofi texture, chip metadata, and guitar articulations.

## Source-Text Parity Versus Behavioral Parity

Source-text parity is useful for:

- generated sound-surface freshness,
- keeping constant tables synchronized,
- spotting drift in duplicated IDs,
- preventing forgotten generated metadata updates.

Behavioral parity is required for:

- timing,
- render output metrics,
- import/export semantics,
- live scheduler behavior,
- native playback parity,
- Godot conductor callbacks.

Recommendation:

- Keep source-text parity as a cheap early warning.
- Do not accept source-text parity as proof of audio behavior.
- Pair every important source-text check with either a golden event fixture, audio metric fixture, import/export round trip, or app-level e2e smoke.

## CI And Verification Gaps

Previously confirmed gaps:

- Main CI ran on Ubuntu only.
- Pocket DAW Rust tests and clippy were not part of the main workflow.
- Pocket Audio Core family parity was not part of the main workflow.
- Godot addon headless tests were not present.

Implemented in this pass:

- Added `npm run verify:family-parity` to the Pocket Audio Core CI step.
- Added a Windows native Pocket DAW job that runs:
  - `npm install`
  - `npm test`
  - `npm run build`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`

Manual/local Godot validation performed in this pass:

- Confirmed the open editor project had `res://addons/godot_mcp/plugin.cfg` and `res://addons/pocket_chordsmith/plugin.cfg` enabled.
- Confirmed Godot MCP HTTP endpoint `http://localhost:9080/mcp` initialized and reported project info.
- Confirmed Pocket Chordsmith receiver `http://127.0.0.1:9087/pocket-chordsmith/health` returned OK.
- Sent a valid direct push POST to `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`; it returned `ok: true`, BPM `132`, key `E`, scale `minor`, and `1462` compiled events.
- Ran Godot 4.6.3 `--check-only` against all 29 addon `.gd` files in the open project; all exited `0`.
- Ran `validate_pocket_chordsmith_runtime.gd` against five compiled level charts and one imported DAW adaptive pack chart/profile; all exited `0`.

Follow-up:

- Add a headless Godot fixture only after a checked-in, deterministic command exists.
- Keep physical audio hardware out of CI.
- Add a CI job for release-script dry runs only if it cannot generate installer/upload artifacts.

## High-Risk Compatibility Paths

Highest risk:

- PCS1/raw JSON import from Chordsmith into DAW and DJ.
- DAW preservation of unknown Chordsmith fields.
- Chordsmith sound ID, drum kit, bass tone, guitar tone, lofi, and chip metadata across browser/core/DAW/DJ/Godot.
- DAW native render cache versus live procedural fallback.
- Godot DAW-pack import and generated sound metadata.
- Recording project-media paths and save/reopen behavior.
- Release/update metadata alignment for Pocket DAW.

Recommended coverage:

- Keep family parity as a required gate before public checkpoints.
- Add a fixture for every reported user project that exposes compatibility drift.
- Prefer exact generated event comparisons before visual/manual smoke.

## Practical Consolidation Order

Do not attempt a big-bang rewrite. Use incremental canonical ownership:

1. Schema and migrations
   - Move schema definitions, compatibility fixtures, and migration assertions into `packages/pcs-format/`.
   - Apps keep product-specific UI defaults and importer UX.

2. Deterministic event generation
   - Make Pocket Audio Core the canonical event generator for Chordsmith-compatible material.
   - Keep app-specific performance controls as inputs to the generator, not forks of generator logic.

3. Render parity
   - Expand golden audio metrics and stem/pack fixtures.
   - Keep native rendering honest with metric comparisons and generated recipe checks.

4. Live-engine consolidation
   - Only consolidate schedulers once event and render parity are boring.
   - Keep Pocket DAW native recording/playback separate from browser live engines until the native session clock is solved.

## Recommended Next Actions

1. Land the recording hardening first-pass and CI native gate.
2. Move PCS schema/migration ownership into `packages/pcs-format/` with fixture coverage.
3. Add behavior parity for DJ live remix scheduling, not only import/e2e smoke.
4. Add deterministic Godot headless test scaffolding if a local command can be proven.
5. Continue converging native render cache and core event fixtures before adding broader DAW features.
