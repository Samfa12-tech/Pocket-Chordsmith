# Pocket DAW Stabilization Coverage

Compared against:

- `C:\Users\sam_s\Downloads\Pocket_Audio_Family_Audit_2026-06-20.md`
- `C:\Users\sam_s\Downloads\Pocket_DAW_Codex_Next_Steps_Prompt.md`

Date: 2026-06-21

## Summary

This branch implements the first stabilization slice and a follow-up coverage pass. It improves release truth, project-save recoverability, recovery candidate decisions, migration/reference validation, audio-region duration/fade semantics, recording diagnostics, CI coverage/report retention, browser smoke coverage, exact-artifact smoke attestation validation, and PCS Format package foundations.

It does not complete the full stabilization milestone definition from the uploaded prompt. The remaining work is still material before Pocket DAW can be described as a trustworthy daily-work DAW or before `0.6.20` can be published.

## Workstream Coverage

| Workstream | Status | Evidence | Remaining gap |
| --- | --- | --- | --- |
| 1. Release truth | Partial, stronger after this comparison pass | `apps/pocket-daw/release-status.json`, `apps/pocket-daw/scripts/release-status-lib.mjs`, `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md`, `apps/pocket-daw/tests/releaseStatus.test.ts` | Status doc is generated and tested, but release packaging terms still need full package/test/smoke/publication artifact separation. |
| 2. Atomic save and recovery | Partial foundation | `apps/pocket-daw/src-tauri/src/project_files.rs`, `apps/pocket-daw/src/native/fileBridge.ts`, Rust transaction tests, recovery recommendation tests, interactive native-open recovery prompt | Recovery discovery, recommendation mapping, and human-triggered restore/decline prompting exist for native Open and Windows file launches; MCP opens stay non-modal. Windows replacement remains a safest recoverable sequence, not a proven platform atomic replace primitive. |
| 3. Migration and reference integrity | Partial foundation | `apps/pocket-daw/src/compatibility/migrations.ts`, `apps/pocket-daw/src/daw/projectInvariants.ts`, `apps/pocket-daw/tests/projectInvariants.test.ts` | More corrupt/recoverable fixture coverage is needed. Control-only clip types are diagnosed as warnings, not fully prevented at every creation boundary. |
| 4. Audio clip contract and exact duration | Partial foundation | `apps/pocket-daw/src/audio/audioRegions.ts`, live/offline/native fade plumbing, diagnostics-returning audio metadata normalization, audio clip tests | Needs broader split/trim/source-offset/save-reopen tests and seek/loop fade parity tests. |
| 5. Recording session clock | Diagnostic slice only | `apps/pocket-daw/docs/RECORDING_SESSION_CLOCK.md`, recording diagnostics fields | Not sample locked. No hidden latency compensation. Rust-owned unified session clock, device latency estimates, explicit user offset preference, and hardware acceptance remain open. |
| 6. Pocket DAW end-to-end tests | Broader smoke slice | `apps/pocket-daw/playwright.config.js`, `apps/pocket-daw/tests/e2e/smoke.spec.js` | Browser fallback now covers startup, file panel, new project, browser save download, diagnostics download, diagnostics panel, audio settings, loop toggle, live-track add, copy/paste, duplicate/undo/redo, and malicious paste. The larger matrix is still missing: deep editor changes, fixture imports, MIDI/WAV import mocks, menu focus return, relink, and status-region long-operation behavior. |
| 7. CI and release gates | Partial | `.github/workflows/ci.yml`, `apps/pocket-daw/releases/smoke-attestation.schema.json`, `apps/pocket-daw/scripts/verify-smoke-attestation.mjs`, guarded push/publish checks, smoke-attestation tests | CI now uploads browser/native report directories with 14-day retention and smoke attestation can be validated locally and is required by the guarded itch push and updater publish paths when `PUBLISH=1`. Deterministic Godot CI remains blocked until a pinned Godot runner/executable is available. |
| 8. PCS Format first slice | Partial foundation | `packages/pcs-format/src/index.js`, schema fixtures, trace-smoke fixture, tests, build script | Prefix/schema/parse/validate and section/sequence fixture summaries exist, but Chordsmith trace-harness import/play integration and migration ownership remain open. |
| 9. Documentation and product truth | Partial | Pocket DAW README, `CURRENT_RELEASE_STATUS.md`, `RECORDING_SESSION_CLOCK.md`, this coverage doc | Needs full save/recovery UX docs, fade support matrix, Web/native/offline/Godot feature matrix, Core convergence update, PCS Format ownership detail, and exact Windows smoke checklist alignment. |

## Findings Coverage

| Finding | Current branch status |
| --- | --- |
| PDAW-001 source/release/smoke drift | Partially addressed with machine-readable status, validation, generated Markdown, and tests. |
| PDAW-005 non-atomic save | Partially addressed with recoverable transaction, `.tmp`, `.bak`, readback, and recovery candidates. |
| PDAW-013 playback/capture clocks not unified | Not solved; explicitly documented as diagnostic-only. |
| PDAW-014 exact-artifact hardware recording acceptance | Not solved; still requires installed Windows hardware smoke matrix. Installer SHA attestation schema/verifier now exists. |
| PDAW-017 missing E2E top | Partially addressed with seven browser smoke/workflow tests; broad workflow coverage remains open. |
| PDAW-019 packaging vs release readiness | Partially addressed with status separation, exact-artifact smoke attestation verifier, and guarded publish wiring. |
| FAM-001 PCS Format scaffold | Partially addressed with parser/validator/fixture/section-summary slice. |
| PDAW-007 imported audio duration rounds | Partially addressed for imported audio duration conversion with 1.25/2.5/7.75 regression coverage; more fractional editing tests are needed. |
| PDAW-008 fade metadata inert | Partially addressed across live/offline/native paths with diagnostics-returning normalization; more parity tests are needed. |
| PDAW-010 multiple audio truths | Partially addressed for audio-region envelopes; broader engine parity remains open. |
| PDAW-003 marker ID uniqueness | Addressed for migration repair and covered by tests. |
| PDAW-016 local bridge hardening | Partially addressed with loopback Host / trusted local Origin checks before handoff or live-bridge dispatch, plus native tests. Bearer-token live control remains required. |
| PDAW-018 CI reproducibility | Partially addressed with npm/Rust gates and retained Playwright/test report artifacts. |
| FAM-003 Godot validation in CI | Not addressed; still blocked on a pinned Godot CLI/runner path for this monorepo. |

## Next Highest-Value Patches

1. Expand Pocket DAW Playwright from smoke coverage into full project workflow coverage.
2. Add deterministic Godot CI once a pinned Godot executable is available.
3. Add deeper audio split/trim/source-offset/save-reopen and seek/loop fade parity tests.
4. Add a richer in-app recovery modal and exact save-guarantee documentation around the current native-open recovery prompt.
5. Add Chordsmith trace-harness fixtures and migrate one app parser entry point behind PCS Format compatibility tests.

No public release or itch upload was performed for this comparison pass.
