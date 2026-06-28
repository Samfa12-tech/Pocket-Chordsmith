# Pocket Audio Deep Audit Workplan

Source audit: `C:\Users\sam_s\Downloads\Pocket_Chordsmith_Deep_Audit_Codex_Report_2026-06-27.md`

This file turns the 2026-06-27 deep audit into a repeatable work loop. Work in small PR-sized chunks, verify the affected component, and update this file as findings are completed.

## Completion Type Legend

- `docs-cleanup`: documentation corrected or routed to the authoritative source.
- `automated-tests-added`: regression or smoke coverage added and run locally.
- `implementation-started`: source behavior changed, but broader follow-up work remains.
- `implementation-tested`: source behavior changed and targeted automated tests cover it.
- `local-installed-smoked`: installed Windows app behavior was manually verified on a named local build.
- `manual-checklist-only`: checklist or local procedure exists, but it is not CI coverage.
- `mocked-payload-tested`: browser/app payload behavior was tested against a mock target, not the full live target.
- `manual-godot-smoked`: Godot editor/headless behavior was verified locally.
- `design-anchor-only`: future product direction documented; no shipped feature is implied.
- `research-spike`: investigation result documented for later decisions.

## Loop Rules

- Start from `AGENTS.md` and `PROJECT_MEMORY.md`.
- Keep canonical app changes under `apps/`, shared runtime changes under `packages/`, and the Godot addon at `addons/pocket_chordsmith/`.
- Treat `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md` as the current Pocket DAW release-truth anchor.
- Preserve compatibility contracts: `PCS1:`, raw JSON, schema 16 Chordsmith projects, `.pocketdaw` schema 2, save/open, autosave, MIDI, WAV, stems, handoffs, Godot import, tuplets, holds, slides, bass, drums, guitar, and melody.
- Do not treat Pocket Audio Core as full sound parity until tests and docs prove it.
- Do not publish or document Pocket DAW as a browser/HTML5 itch app.

## Wave 1 - Truth, Safety, Validation

| ID      | Finding                                                    | Completion Type                              | Verification                                                                                                                             |
| ------- | ---------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-01 | DAW release truth cleanup across current-status docs.      | `docs-cleanup`                               | Release-truth `rg` sweep; `npm run verify:versions` in `apps/pocket-daw`                                                                 |
| TASK-02 | Release checklist itch channel fix to `windows-installer`. | `docs-cleanup`                               | Itch channel `rg` sweep across docs, `AGENTS.md`, and `PROJECT_MEMORY.md`                                                                |
| TASK-03 | Pocket Audio Core README limitation/status cleanup.        | `docs-cleanup`, `automated-tests-added`      | `npm test`; `npm run build` in `packages/pocket-audio-core`                                                                              |
| TASK-04 | Godot headless validation design.                          | `manual-checklist-only`                      | `addons/pocket_chordsmith/docs/HEADLESS_VALIDATION.md` documents compile, runtime validation, demo scene, and DAW pack import commands   |
| TASK-05 | Chordsmith -> Godot direct push smoke checklist.           | `manual-checklist-only`, `mocked-payload-tested` | `addons/pocket_chordsmith/docs/HEADLESS_VALIDATION.md` documents receiver health, hosted/browser push, fallback, and validation evidence |
| TASK-06 | Godot receiver hardening review.                           | `docs-cleanup`                               | `addons/pocket_chordsmith/docs/HEADLESS_VALIDATION.md` documents loopback/size/time/import-only posture and broad CORS rationale         |
| TASK-07 | Pocket DJ import/handoff/macro test expansion.             | `automated-tests-added`                      | `npm run test:e2e` in `apps/pocket-dj`                                                                                                   |
| TASK-08 | Chordsmith fixture smoke expansion.                        | `automated-tests-added`                      | `npm run test:e2e` in `apps/chordsmith-web`                                                                                              |
| TASK-09 | Sound parity matrix doc.                                   | `docs-cleanup`, `automated-tests-added`      | `docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md`; `npm run verify:family-parity` in `packages/pocket-audio-core`                               |
| TASK-10 | Public update-through-app smoke plan.                      | `manual-checklist-only`                      | `apps/pocket-daw/docs/UPDATER_RELEASE_PIPELINE.md` and `apps/pocket-daw/docs/WINDOWS_TESTING_CHECKLIST.md`                               |

## Next Waves

- Wave 2: DAW architecture seams, cache invalidation fixtures, Core WAV plumbing/equality, PCS Format scope, Godot pack roundtrip, recording docs cleanup.
- Wave 3: DJ `PDJ1`, DJ macro tests, hosted handoff UX, Godot sample kit package report, Core adaptive examples, DAW media/MIDI/drum workflow designs.
- Wave 4: larger DAW recording, ASIO, punch/comping, multi-format export, full Chordsmith live engine extraction, Godot visual editor exploration.

## Wave 2 - Architecture Seams And Parity Hardening

| ID      | Finding                                                         | Completion Type                                      | Verification                                                                                                                                                                   |
| ------- | --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TASK-11 | `App.ts` responsibility map and first extraction seam decision. | `docs-cleanup`                                       | `apps/pocket-daw/docs/APP_TS_RESPONSIBILITY_MAP.md`; `npm test`; `npm run build` in `apps/pocket-daw`                                                                          |
| TASK-12 | Extract one DAW orchestration service.                          | `implementation-tested`                              | Updater panel orchestration in `apps/pocket-daw/src/app/updaterOrchestration.ts`; targeted updater tests; `npm test`; `npm run build`; `npm run test:e2e` in `apps/pocket-daw` |
| TASK-13 | Native cache sound invalidation fixture.                        | `implementation-tested`                              | Recipe-hash guard in `apps/pocket-daw/src/audio/nativeRenderCache.ts`; `npm test -- tests/nativeRenderCache.test.ts tests/nativeRenderContract.test.ts`; `npm run verify:native-sound-recipes`; `npm test`; targeted Rust bass-render tests |
| TASK-14 | Core WAV plumbing/equality fixture.                             | `automated-tests-added`                              | Browser Core WAV equality smoke in `apps/chordsmith-web/tests/smoke.spec.js`; `npm run test:e2e` in `apps/chordsmith-web`; `npm test` in `packages/pocket-audio-core`            |
| TASK-15 | PCS Format scope and constants.                                 | `implementation-started`, `automated-tests-added`    | `npm test`; `npm run build` in `packages/pcs-format`                                                                                                                           |
| TASK-16 | Raw fixture drift decision note.                                | `docs-cleanup`, `automated-tests-added`              | `docs/POCKET_AUDIO_CORE_PARITY_REPORT.md` records the 2026-06-28 non-strict raw-drift decision; `npm run compare:chordsmith-browser-trace` passes normalized parity and prints raw drift as diagnostic evidence |
| TASK-17 | DAW file association implementation plan.                       | `manual-checklist-only`, `automated-tests-added`     | `apps/pocket-daw/docs/FILE_ASSOCIATION_IMPLEMENTATION_PLAN.md`; `npm test -- tests/deepLinkBridge.test.ts tests/fileBridge.test.ts`; `npm run verify:versions` in `apps/pocket-daw` |
| TASK-18 | DAW file association implementation.                            | `implementation-tested`, `local-installed-smoked`    | Installed `0.6.34` smoke on Windows: HKCU/HKCR `.pocketdaw` ProgID and OpenWithProgids present; cold-start `.pocketdaw` launch loaded `task18-second-instance-open.pocketdaw`; second-instance launch focused the existing app and loaded the clicked project; live `open_project` reopened `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`; real `pocket-daw://handoff?pocketHandoff=...` imported the `Basic 4/4 Major` PCS1 fixture; `npm test -- tests/deepLinkBridge.test.ts tests/fileBridge.test.ts tests/pocketHandoff.test.ts tests/pcsImport.test.ts`; `npm run verify:versions`; `cargo test --manifest-path src-tauri/Cargo.toml tests::native_cache_paths_stay_under_project_cache` |
| TASK-19 | DAW Godot pack roundtrip validation.                            | `implementation-tested`, `manual-godot-smoked`       | DAW-side Godot pack ZIP contract added in `apps/pocket-daw/tests/exportJobs.test.ts`; `npm test -- tests/exportJobs.test.ts`; `npm test -- tests/godot-kit.test.js` in Core; Godot 4.6.3 headless import of `audit-task19-godot-adaptive-pack.zip` into the open addon project; runtime validator returned `OK` with 464 events and 5 stems. |
| TASK-20 | DAW recording alpha docs cleanup.                               | `docs-cleanup`                                       | Recording-boundary docs search across `apps/pocket-daw` README/status/docs; docs-only caveats updated; `git diff --check` on touched docs                                     |

## Wave 3 - Product Evolution

| ID      | Finding                    | Completion Type | Verification                                                                                                                                                  |
| ------- | -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-21 | DJ `PDJ1` design note.     | `design-anchor-only` | `apps/pocket-dj/docs/PDJ1_SESSION_FORMAT.md`; linked from README; planning-doc example synced to live field names; `PDJ1`/session/handoff docs search; `git diff --check` on touched docs |
| TASK-22 | DJ deck macro tests.       | `automated-tests-added` | `apps/pocket-dj/tests/core-smoke.spec.js` covers queue, hold loop, stem mute/volume, filter, build and drop state; `npm run test:e2e` in `apps/pocket-dj`      |
| TASK-23 | Chordsmith hosted handoff UX polish. | `implementation-tested`, `mocked-payload-tested` | Chordsmith handoff status copy distinguishes success, blocked popup/clipboard, downloaded-file fallback and manual paste; `npm run test:e2e` in `apps/chordsmith-web` |
| TASK-24 | Godot sample kit package report. | `docs-cleanup` | `addons/pocket_chordsmith/docs/SAMPLE_KIT_PACKAGE_REPORT.md` lists preview WAVs, package size, generation source, import metadata exclusion, MIT/addon license expectations, and shipping recommendations. |
| TASK-25 | Core adaptive game API example update. | `docs-cleanup`, `automated-tests-added` | Core runtime/export examples now show lofi/chip profile metadata and Godot pack manifest fields; `npm test` in `packages/pocket-audio-core` |
| TASK-26 | DAW media relink/reload smoke expansion. | `automated-tests-added` | Media reload-path contract covers external, project-media, missing and runtime-only states; UI reload/relink matrix added; `npm test -- tests/mediaPool.test.ts tests/nativeMediaBridge.test.ts tests/ui.test.ts`; `cargo test --manifest-path src-tauri/Cargo.toml media` |
| TASK-27 | DAW serious MIDI import design. | `design-anchor-only` | `apps/pocket-daw/docs/MIDI_IMPORT_AND_CHORDSMITH_CONVERSION_PLAN.md` separates MIDI media import from future Chordsmith conversion, with roadmap, non-goals, verification targets, and release language. |
| TASK-28 | DAW drum branching design. | `design-anchor-only` | `apps/pocket-daw/docs/DRUM_BRANCHING_PLAN.md` defines source-preserving generated drum branch/collapse workflows, data-model direction, editing rules, UI expectations, non-goals, and verification targets. |
| TASK-29 | Core MIDI export implementation checkpoint. | `design-anchor-only` | `docs/POCKET_AUDIO_CORE_MIDI_EXPORT_CHECKPOINT.md` records the readiness gates, event contract, migration steps, and current DAW verification for moving MIDI export behind Core when shared event-renderer parity is ready. |
| TASK-30 | Cross-app release dashboard doc. | `docs-cleanup` | `docs/CROSS_APP_RELEASE_DASHBOARD.md` lists Chordsmith, DJ, DAW, Core, PCS Format and Godot baselines, release-truth anchors, validation gates, and release boundaries. |

## Wave 4 - Larger Design And Research Tracks

| ID      | Finding | Completion Type | Verification |
| ------- | ------- | --------------- | ------------ |
| TASK-31 | DAW stereo/multitrack recording design. | `design-anchor-only` | `apps/pocket-daw/docs/STEREO_MULTITRACK_RECORDING_PLAN.md` defines explicit channel assignment, grouped take metadata, one-stream/many-writer native direction, latency policy, UI safety, and verification targets. |
| TASK-32 | DAW ASIO/low-latency backend research spike. | `research-spike` | `apps/pocket-daw/docs/ASIO_LOW_LATENCY_BACKEND_SPIKE.md` records current CPAL default-only dependency evidence, WASAPI-preferred host selection, ASIO feature/prerequisite research, opt-in experiment decision, implementation phases, and verification targets. |
| TASK-33 | DAW punch/comping/take lanes design. | `design-anchor-only` | `apps/pocket-daw/docs/PUNCH_COMPING_TAKE_LANES_PLAN.md` records current same-track overwrite behavior, metadata/lane direction, punch flow, comping/save/export boundaries, risks and verification targets. |
| TASK-34 | Multi-format export design. | `design-anchor-only` | `apps/pocket-daw/docs/MULTI_FORMAT_EXPORT_PLAN.md` records the current WAV/MIDI/game-pack baseline, profile shape, codec matrix, renderer-to-encoder boundary, normalization/dither policy, Core/DAW ownership split and verification targets. |
| TASK-35 | Full Chordsmith live engine extraction. | `design-anchor-only` | `docs/POCKET_AUDIO_CORE_LIVE_ENGINE_EXTRACTION_GATE.md` records the current v68/Core scaffold baseline, entry gates, shadow/opt-in/default-switch phases, rollback requirements, ownership boundaries and verification targets. |
| TASK-36 | Godot visual editor exploration. | `design-anchor-only` | `addons/pocket_chordsmith/docs/VISUAL_EDITOR_EXPLORATION.md` records the current editor/addon baseline, compiled-chart inspector direction, safe runtime metadata edits, musical edit boundaries, UI direction and validation targets. |
