# Pocket DAW Test Orchestration

`test-scope-manifest.json` is the executable inventory. Run
`node scripts/verify-test-scope-manifest.mjs --write-matrix` to regenerate
`TEST_MATRIX.md`; do not duplicate its per-file classifications here.

## Decision table

| Change or intent | Command / CI scope | Do not run |
| --- | --- | --- |
| Ordinary local source change | `npm run check` | Release preparation, installed smoke, publication |
| Frontend/domain change | `npm run check:pr`; CI DAW Linux | Windows full Vitest/build duplicate |
| Native, bridge, Cargo, Tauri, signing or VST3 change | `npm run check:windows-contract`; CI Windows native | Browser-only substitute for native checks |
| Release-script/config change | `npm run check:release-source`; release-contract and Windows package-relevant CI scopes | `release:prepare` unless deliberately preparing a checkpoint |
| Deliberate release | `release:prepare` once, retained installed/manual evidence, then evidence-only `verify:candidate`, then exact `release:publish-exact` | Rebuild/restage after evidence or any unarmed publication |

`npm test` is the complete deterministic non-E2E Vitest scope. `npm run
check:full` is the same full source scope. `npm run check:pr` is the
manifest-required pull-request scope; `check:windows-contract` is the focused
TypeScript contract scope owned by the Windows job. Any changed-path ambiguity
falls back to the full deterministic scope.

## Script audit and migration

All package scripts were audited against repository/workflow consumers. The
small human-facing surface above is canonical; specialised scripts remain
release-workflow internals or explicit evidence tools.

| Legacy/alias command | Disposition | Safe equivalent / reason |
| --- | --- | --- |
| `release:update` | Retained compatibility alias | `release:prepare`; still builds/stages only when deliberately invoked |
| `release:update:full` | Retained compatibility alias | `release:prepare` |
| `release:update:fast` | Retained fail-closed retirement marker | Fails without touching artifacts |
| `release:update:publish` | Retained compatibility alias | `release:publish-exact`; never builds/restages |
| `verify:itch` | Retained deprecated compatibility command | Existing one-pass prepare verifier; it does not publish |
| `release:itch:local` | Retained internal alias | `verify:itch`; no publication |
| `itch:push`, `itch:push:hidden` | Retained guarded emergency commands | Require `PUBLISH=1`; not normal development/release preparation |
| `itch:push:bootstrapper` | Retained guarded operational command | Only when the bootstrapper payload itself changes |

No historically non-publishing command was redirected to publication. The
package scripts still keep `PUBLISH=1`, exact receipt, verification report and
frozen-hash requirements at publication boundaries.

## Measurement baseline and CI change

The ignored machine-readable baseline at
`local-artifacts/test-profiles/pocket-daw-vitest-baseline.json` was recorded on
2026-08-20: 98 deterministic Vitest files, 1,148 cases, 14.698 seconds local
wall time. The final full scope after replacing one duplicate source-string
assertion has 1,147 cases; the baseline remains retained rather than rewritten.
It includes file/category totals and the 20 slowest files. Vitest's JSON
reporter exposes no reliable setup, collection or retry durations here; those
fields are explicitly `null` rather than estimated.

| Metric | Before | After |
| --- | --- | --- |
| Linux full Vitest/build | One full suite/build | One full suite/build, with retained profile artifact |
| Windows full Vitest/build | One duplicate full suite/build | None; 29 explicit Windows-contract tests plus Rust checks |
| Duplicate JS suite executions | 98-file suite twice | 98-file suite once (one full duplicate removed) |
| Runner minutes / workflow wall time | No comparable pre-change CI telemetry was retained | Reported as a CI artifact and warning-only baseline after the first remote run; no invented minute claim |

Representative PR plans: documentation-only plans governance but no DAW;
Handoff-only does not plan DAW; a DAW UI change plans Linux plus browser E2E;
native/Cargo/Tauri changes plan Windows native; release-script changes add
release-contract and Windows package-relevant checks. `main`, scheduled, and
explicit-full dispatches select the full family.

## Refactored source-string checks

| Previous test | Change | Retained equivalent |
| --- | --- | --- |
| `appInteractionSource.test.ts` App.ts slicing | Replaced | `interactionContracts.ts` state/link controller behavior tests |
| `releaseScripts.test.ts` source slicing and phrase assertions | Replaced | Pure installed-smoke control plans, release contract, receipt/tamper, smoke-attestation and packaging artifact tests |

Generated-file drift, receipt/hash/signature/schema validation and temporary
artifact tests remain intentional contract coverage, not implementation-text
assertions.

## Evidence boundary

Automated scopes validate evidence structure only. Human listening and blind
genre recognition; iOS memory/interruption/background/audio routes/latency;
NVDA, VoiceOver and Windows scaling/High Contrast; and exact published Godot
Asset Library download/clean-project proof remain pending in
`docs/releases/MANUAL_RELEASE_EVIDENCE.md`.
