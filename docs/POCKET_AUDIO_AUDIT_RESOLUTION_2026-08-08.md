# Pocket Audio Repository Audit Resolution

Resolved against `Pocket-Audio-Full-Repository-Audit-2026-08-05.md` on 2026-08-08.

## Outcome

All 27 findings now have a repository-side resolution. Findings that require a physical device, human perception, external publication, or repository-admin authority are explicitly retained as pending release evidence in `docs/releases/MANUAL_RELEASE_EVIDENCE.md`; they are not represented as automated passes.

| Finding | Repository resolution | Status |
| --- | --- | --- |
| F-001 | Production Handoff relay is pinned to the official Worker. Overrides require explicit loopback developer mode, and the effective endpoint plus complete-song upload disclosure are visible. | Code closed |
| F-002 | Godot receiver is off by default and requires a rotating 256-bit token, loopback Host, allowed Origin, unique request ID, replay protection, and rate limits; wildcard CORS is removed. | Code closed |
| F-003 | Core ESM, browser ESM, and real IIFE now come from one esbuild graph with an API manifest and shared audible-runtime conformance tests. | Closed |
| F-004 | Godot ZIP import now preflights every entry, enforces count/path/depth/size/ratio/ZIP64/encryption/collision limits, extracts to staging, validates the manifest, and cleans failures. | Closed |
| F-005 | Core uses a stable audio epoch, bounded late-event dropping/counters, and real beat/bar-quantized section and music-state transitions. | Closed |
| F-006 | DJ drops stale audible steps after stalls, separates visual catch-up, tracks diagnostics, and stops cleanly on visibility/audio interruption. | Closed |
| F-007 | Chordsmith deterministic composer fixtures run in CI before browser build/package. | Closed |
| F-008 | CI is split into pinned component, Godot, security, and final family gates; Handoff and native/release contracts are included. | Closed |
| F-009 | Release-candidate truth rejects a published version newer than exact installed smoke unless a complete version-matched exception is recorded. Pocket DAW 0.6.46 was subsequently published and exact-installed-smoked from commit `aa519f2fc26064f3804d9f9ee917d277a966d080`, closing the prior 0.6.45 reduced-hotfix evidence gap. | Fully closed by exact 0.6.46 publication |
| F-010 | PCS Format now has a bounded browser-safe codec, canonicalize/migrate API, self-contained build, cross-consumer fixture contract, and honest contract-library ownership language. Core delegates PCS1 envelope handling to it; app-local migrations remain explicit rather than falsely claimed canonical. | Immediate defect/claim closed |
| F-011 | Addon packaging reopens and verifies an addon-only ZIP and emits version/SHA evidence; monorepo source archives are no longer presented as the addon payload. | Code closed; Asset Library publication pending authority |
| F-012 | Current composing guidance defaults to native schema 17, A-H sections, preserved rich/unknown intent, explicit schema-16 loss reports, and import/Section A/Play Song validation. | Closed |
| F-013 | DAW external links use `ShellExecuteW` directly after strict URL parsing, scheme/host/recipient checks, and malformed-encoding/control-character rejection; no command shell is involved. | Closed |
| F-014 | Five fixed genres have deterministic duration/peak/RMS/DC/clipping/non-finite/silence goldens. Fresh current-source tests prove matching sequence duration, event counts, and exact live/Core structural keys for lofi, chip, metal, western, and funk. | Automated evidence closed; listening/blind review pending human evidence |
| F-015 | WAV export estimates frames and working memory before allocation, applies desktop/mobile/constrained-mobile limits, and offers Current Section/shorter render recovery. Physical SM-S948B Android 16 / Chrome 151 evidence at commit `aa519f2f` passed a 12-second 1,869,884-byte Core WAV and rejected a synthetic 480.1-minute / 53,296 MB request at 384 MB before allocation with no reload and interactive controls. | Android closed; iOS physical evidence pending |
| F-016 | Chordsmith is generated deterministically from 12 ordered state/schema/audio/transport/export/handoff/UI/accessibility fragments; DJ from 7. Portable single-file artifacts and drift checks are retained. | Closed |
| F-017 | `FAMILY_MANIFEST.json` generates component inventory, licensing, security scope, release dashboard, and version matrix; historical memory is marked non-current. | Closed |
| F-018 | Every-change Chromium desktop/Pixel gates remain; focused Chordsmith and DJ parser/UI/transport smoke runs in Firefox/WebKit. Physical SM-S948B Android Settings-background / Chrome-foreground testing on the phone speaker produced a monotonic step 0-13 trace with no duplicate/backward scheduling. | Android transport-only pass; iOS, audio interruption, wired/Bluetooth routes, acoustic no-burst perception, and latency pending |
| F-019 | Dependabot, CODEOWNERS, dependency review, CodeQL JS/TS/Rust, tracked-secret scan, governance validation, and all-lockfile high-severity audit gates are present. GitHub remote settings were verified with Dependency graph/dependabot security updates, secret scanning, and push protection enabled. | Closed; remote settings verified 2026-08-09 |
| F-020 | Explicit CSPs now cover Handoff, Chordsmith, DJ, and the Tauri WebView with narrow network/media/object/navigation policies appropriate to each runtime. | Closed |
| F-021 | Core dist artifacts are self-contained; packaged Chordsmith and DJ ZIPs contain no raw Core source and validate ESM/IIFE/API-manifest requirements. | Closed |
| F-022 | Imported Godot packs default to pack-relative ownership. External Godot paths require explicit trusted-project configuration, warnings, existence, and type checks. | Closed |
| F-023 | Chordsmith, DJ, and Handoff packagers emit source/build/schema/core/hash/required-file provenance. Handoff exposes `handoff-v1` in metadata and visible UI. Historical deployment evidence remains distinct from dirty local packages. | Closed |
| F-024 | Existing automated semantics/reflow/forced-colors/reduced-motion checks remain gated; Godot headless accessibility validates 16 toolbar actions. Manual AT/OS display evidence is tracked without false pass claims. | Automated portion closed; human/OS evidence pending |
| F-025 | Independent component/build/schema versions and compatibility relationships are machine-readable in the family manifest. | Closed |
| F-026 | Chordsmith and DJ have lint, checkJs, formatting, unit/scheduler tests, deterministic-source drift checks, and web-surface size/dead-code reports in CI. | Closed |
| F-027 | Runnable history is consolidated under an unsupported immutable archive with exact hashes, generated index, search/package exclusion, and organization enforcement. v67 and DJ v1f no longer ship. | Closed |

## Current-run verification

- Chordsmith: 34 composer fixtures, 4 WAV-preflight unit tests, 5 fixed-seed audio-quality/parity tests, 86 Chromium/Pixel browser tests, and 8 Firefox/WebKit smoke tests passed; deterministic build and package passed. Oversized share/project/MIDI input stops before expensive work.
- Pocket DJ: 6 fake-clock/interruption scheduler tests, 22 Chromium browser tests, and 6 Firefox/WebKit smoke tests passed; deterministic build and package passed. Share/project/rich-playback limits and pathological-stall reset are covered.
- Pocket Audio Core: 149 tests passed, including IIFE/ESM audible runtime, timing contracts, project resource ceilings, direct-builder bypass coverage and bounded same-tick dispatch.
- PCS Format: 23 tests passed.
- Pocket DAW: 1,112 frontend tests and 158 native library tests passed; sidecar/process tests passed with only explicitly external compatibility fixtures ignored.
- Handoff security tests passed; its ZIP was reopened with exactly one root `index.html`.
- Godot 4.6.3/4.7.1 trust-boundary, schema-17, accessibility, and addon-only packaging checks passed during this pass.
- Family governance, archive hashes, organization, tracked-secret scanning, security governance, all npm high-severity audits, package-content checks, and `git diff --check` passed.

Historical audit-phase boundary: during that phase no deployment, release
publication, GitHub settings change, staging, commit, or push was performed.
Subsequently Pocket DAW 0.6.46 was published and exact-installed-smoked, and
the repository security settings named in F-019 were verified enabled. Those
later facts do not relabel the audit-phase command evidence.

## Sealed change-aware security review

The uncommitted audit diff was independently frozen and reviewed as scan
`2be9179b-962a-4636-a32e-45ba17785fa7`: 89/89 complete-file receipts, 12/12
candidate validations and a sealed final report. One Low/P3 Core rich-event
node-fanout regression survived validation. It is fixed in the current working
tree with pre-allocation project limits and a bounded scheduler dispatch budget;
the original 10,000-event proof is rejected before timeline or audio-node work.
App-local decoder, rich-project, MIDI and DJ scheduling hardening identified
during validation was also implemented even where the behavior predated the
audited diff.
