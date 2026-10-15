# Pocket Audio implementation ledger — 15 October 2026

This ledger separates source implementation, executed checks and publication.
Baseline main: `4f156e2c9857b40f7c79b3d6761d77c6683545d2`.
Planning reconciled from PR77 at
`f07fd4a1301fd4af39f4a3fe5ffd0e10c554b333`; that PR's documentation is not
feature implementation. Foundation commit:
`ac8cd967d5cdcce8582f6a9f5e2ba0b7545906dc`.

The owner checkout's uncommitted roadmap and untracked support directories are
preserved. Work is isolated on `codex/pocket-audio-reliability-20261015`.
Reef Sweep, PR75 and dependency PRs71–74 were not changed or merged.

## First candidate: bounded reliability

| Item | Implemented | Executed evidence | Published / remaining acceptance |
| --- | --- | --- | --- |
| Version truth | Family manifest and generated views match DAW source 0.6.51, public/installed 0.6.50, released commit ec3f783b. Other version domains remain independent. | Governance generator and drift check pass; GitHub release target read back. | Metadata only; no new release. |
| Current advisory | Only source-map-js 1.2.1 → 1.2.2 in Chordsmith/DAW locks. GHSA-68fv-2mgg-jv7q affects versions below 1.2.2. | npm audit initially reported one high advisory in each; final five package audits report zero advisories. | No arbitrary dependency merges/upgrades. |
| CACHE-02 | Stop invalidates optimistic residency; generation checks reject late acknowledgments; uncertain Stop fails conservatively. Pause/Resume retain hints. | Five new lifecycle/race tests failed before the patch. Bridge suite passes 36/36, including file-backed/byte-backed, eviction recovery and uncertain Stop. | Not published. Installed decode/retry timing and audible impact pending. |
| CACHE-03 | One previous cache generation, bounded to 64 MiB estimated JS PCM storage, remains a reusable build input after stopped edits. It cannot provide stale playback; project load clears reuse. | Engine integration proves fewer native render dispatches after a bass edit, no stale ready coverage, full rebuild after project load. | Not published. Native memory/performance traces and paused-session acceptance pending. |
| CACHE-04 | Abort checks between generated stem and runtime-asset jobs; superseded engine generation never promotes. The currently running native stem may finish. | Deferred first-render test proves only one obsolete job dispatches and newest project completes; cancellation is not reported as a render fault. | Not published. Completed cancelled jobs are not banked; native cooperative cancellation remains measurement-dependent. |
| CACHE-05 | Complete generated signature memoized for the engine-owned project revision, invalidated on sync. Sound-affecting signature contract unchanged. | 100 unchanged ready-cache validations do not traverse source music again; edited project rejects old coverage and rebuilds to its new signature. | Not published. Runtime-audio signature and stale-filter preparation remain separate measured follow-through. |
| UI-01 | Sample search/category/folder/favourites patch only results. Search input survives IME events, caret edits and filtering; selected samples remain selected. | Chromium regressions pass. Existing test corrected: Space in the retained text field enters a space and does not start transport. | Partial: VST descriptor/parameter searches still need scoped updates. Native WebView/scaling checks pending. |
| UI-02 | One DOM query per meter attribute per update, mapped by ID; change-only meter writes and stable transport strong/small nodes. | Chromium playback regression proves fixed three-query update bound and stable readout child. Existing accessible meter labels/recording override retained. | Not published. Dense native WebView/add-remove-reorder/recording profiling pending. |
| GODOT-01 | Prepared selection carries origin. Section sets are occurrence-local; full-song sets stay absolute; state origin is explicit/opt-in. Public seek repositions actual players. Empty selections stop obsolete audio. | Godot 4.6.3 reproduced incorrect B/repeated-section playback before patch. Sixteen local/full-song × synchronized/layer-player × first/seek/repeated scenarios pass with nonzero engine-bus PCM capture on both warmed Dummy and a rendered Windows WASAPI scene. | Not published. No human listening or source-engine parity claim. Two-source rendered-game fidelity, fractional/tempo-map and stress acceptance remain pending. |
| CACHE-01 | Pending | Source hypothesis only for actual gap duration. | Measure native stream continuity, tails and rollback before changing graph/stream ownership. |
| UI-03 | Pending | Source hypothesis; no new IPC batching. | Trace dense automation/mutex/underruns first. |
| UI-04 | Pending | No region-index optimization claimed. | Measure cache-region classification before change. |
| GODOT-02 | Pending | No summed-PCM fidelity or branch partition claim. | Fullmix default/alternative groups/common gain/shared-FX contract and two-source PCM fixtures needed. |
| GODOT-03 | Pending | No cold-loading speedup claimed. | Background preparation, readiness/working-set and real-game transition evidence needed. |
| EXPORT-01 | Pending | No memory/copy speedup claimed. | Profile 4/16/32 stems and cancellation before changing ownership. |

Source validation: changed-source scope passes 745 deterministic tests; its 14
browser-parity cases passed after installing the exact locked Chromium into an
ignored task-local folder (759 tests total across those runs). TypeScript/Vite
build passes with the existing chunk-size and mixed Tauri import warnings.
Chromium E2E: 17 initially passed; the two search cases passed after correcting
test assumptions about text-field focus (19 total across those runs).
Godot CI schema17/trust/accessibility/addon-only package gate passed; final
origin PCM regression is additionally retained. These are source/target checks,
not exact-installed Windows acceptance.

Windows contract scope additionally passes 283 tests in 30 files. Version,
release-status, security-input, organization and generated-governance checks pass.

Private validation reports remain under ignored `local-artifacts/scratch/validation/`.
The fixture script is public/reproducible and contains generated tones only.
No private songs, media, credentials, installer or ZIP is committed.
The rendered scene report is `godot-origin/origin-rendered-wasapi.log` and its
fixture-only image is `godot-origin/stem-origin-runtime.png`. This run used
Godot 4.6.3, Windows WASAPI and OpenGL Compatibility on the laptop's RTX 5050.
Position tolerance includes measured elapsed wall time so slow rendered frames
are not misreported as wrong file origins. This does not pass a frame-time or
transition-latency budget. The automatic bus capture proves mixed engine PCM;
it does not prove the physical speaker route or a human listening comparison.

## Microphone decision

No capture/acquisition code or dependency changed. The semantic v2 fingerprint
matches exact public 0.6.50 at `ec3f783b24abdd85d46229c2893ea953e96248cd`:
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`.
Human microphone interaction is scoped out for this source candidate; skipped
is not passed. A deliberate release must still verify a directly retained
eligible baseline and its hashes, and prove current exact-installer PCM
duration/file integrity, connected loopMIDI and WAV/MIDI exports. Do not turn
fingerprint equality alone into an installed-smoke pass. If later shared-audio
work changes this assessment, retain Sam's Friday 16 October evening AEDT
hands-on check and continue independent work.

## Remaining family scope

| Area | Implementation/test status | Gate / next action |
| --- | --- | --- |
| Campfire Acoustic/Core | Pending | Freeze exact voicings/reference hashes and recipe; verify provenance before copying code, otherwise write original implementation. Deterministic PCM/rate/seed/gain/tail/cache contract first. |
| Chordsmith/DJ/native DAW Campfire | Pending | Real audible paths, full voicings/strums/picking and explicit fallback limits; preserve old IDs/PCS1/JSON. |
| Both Godot export routes | Partial origin correction only | Chordsmith/Core and fully arranged native DAW audio need separate rendered reference, FX/automation/recording, captured playback and game-scene evidence. |
| DAW layout/accessibility | Pending beyond sample search/meter slice | Reproduce ordering/overflow at named window sizes/scales; native popover/focus/recording acceptance. |
| Chordsmith visual direction | No aesthetic selected | Prepare small alternatives for Sam; broad reskin awaits selection. This does not block reliability work. |
| Hear/compare/keep refinements | Pending | Contextual range/lead-in/tail/Stop, actionable reversible feedback, same-position A/B and stale-preview rejection; no autoplay. |
| Finish & Export | Pending | Existing DSP, subtle presets/dry bypass, measured loudness match, independent LUFS/truepeak calibration and decoded output parity. |
| Save/undo/media/plugin faults | Existing foundations retained | Extend targeted failure/cancel/reopen regressions rather than rebuild. |

## Release ledger

All new products/artifacts: **not published**. No installer has been prepared.
Core remains repository/workspace-only; no npm publication. Chordsmith and DJ
retain their existing itch channels and website mirrors. DAW retains its exact
GitHub/updater flow and unchanged itch bootstrapper. Godot retains three distinct
targets: Chordsmith itch addon ZIP, official Asset Store, Asset Library 5174.
Dashboard identity, advertised 4.4 versus tested 4.6.3 compatibility, addon-only
full-commit payload and remote hashes must be checked before submission.

No approval denial is outstanding. Initial sandbox denials for the owner Git
directory and Vite temporary-file rename were resolved using scoped approved
execution; no uncertain external mutation remains. The missing Playwright
browser was an environment prerequisite and is resolved. Remaining checks are
pending work/acceptance, not asserted passes.
