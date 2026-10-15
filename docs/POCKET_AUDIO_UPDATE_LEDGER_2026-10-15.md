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
| GODOT-01 | Prepared selection carries origin. Section sets are occurrence-local; full-song sets stay absolute; state origin is explicit/opt-in. Public seek repositions actual players. Empty selections stop obsolete audio. | Strengthened review/follow-on suite passes 48/48 on Dummy and rendered WASAPI: tone identity, repeated/automatic sections, empty-set silence, state origins, paused seek, ordinary pause/resume position and exclusive in-place player switching. Initial 16 position/nonzero checks were insufficient; see review history below. | Not published. No human listening claim. Two-source rendered-game fidelity, fractional/tempo-map and stress acceptance remain pending. |
| CACHE-01 | Pending | Source hypothesis only for actual gap duration. | Measure native stream continuity, tails and rollback before changing graph/stream ownership. |
| UI-03 | Pending | Source hypothesis; no new IPC batching. | Trace dense automation/mutex/underruns first. |
| UI-04 | Pending | No region-index optimization claimed. | Measure cache-region classification before change. |
| GODOT-02 | Partial: real Core recipe stems, shared texture bed, exclusive mix/layer and aggregate/branch selection, lossless WAV import, explicit 32-stream limit; DAW normalization/manifest alignment | Old sine-placeholder stem and reconstruction tests fail; corrected Core PCM passes. Rendered Core pack capture passes both player modes and mix choices. DAW export helper/metadata tests pass; independent stem processing is explicitly not guaranteed sum-equivalent. | Not published. Fully arranged native DAW recording/FX/automation PCM route, source-master equivalence and listening remain pending. |
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
| Campfire Acoustic/Core | Original recipe, offline and prepared existing live transport implemented/tested; product selectors pending | [Recipe 1 contract](CAMPFIRE_ACOUSTIC_CONTRACT_V1.md): exact voicings/reference hashes, deterministic PCM, bounded preparation/cache and explicit tails. No game code copied or licence changed. |
| Chordsmith/DJ/native DAW Campfire | Native renderer foundation implemented/tested; product integration pending | Original prepared Rust PCM matches Core; registries/import/selectors/browser/DJ, picking and native generated-cache tail assumptions still need integration. Preserve old IDs/PCS1/JSON. |
| Both Godot export routes | Core pack real-recipe and captured PCM route tested; DAW gain/alternatives contract tested | Core offline is its own reference; browser FX/master equivalence remains pending. Fully arranged native DAW recording/FX/automation still needs its own actual rendered reference and Godot capture. |
| DAW layout/accessibility | Pending beyond sample search/meter slice | Reproduce ordering/overflow at named window sizes/scales; native popover/focus/recording acceptance. |
| Chordsmith visual direction | Three alternatives prepared/tested in draft PR80, `4fbfc35f29cdefcff268b6da018049ceba0e2e62` | Offline interactive Set List/Pedal Board/Tape Notes study, validated at 1440/720/375/360 px. Broad reskin awaits Sam's choice; app unchanged. |
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

## Third source candidate: Godot export fidelity

Branch `codex/pocket-audio-godot-fidelity-20261015` follows the Core candidate
`b8bfa2addad49bd533c0036c10c5454cfea92119`. Two reproduced bugs in Core's stem
helper: it rendered sine placeholders instead of real instruments (Campfire
sample error 0.0658), and summed stems differed from its full mix by 0.315.
The helper now uses the real offline renderer. Ordinary stem tails share an
aligned duration; exact zero-tail loops remain exact. Enabled texture is one
separate shared bed. HYBRID also retains an authoritative full-mix reference.

The Godot importer formerly selected a Core full mix plus its stems, and DAW
aggregate drums plus branch files. These are now exclusive alternatives.
Adaptive layers remain the default; `playback_mix: "full-mix"` selects only the
reference and `drum_stems: "branches"` explicitly selects the drum branches.
Oversized synchronized imports fail at 32 streams instead of silently changing
player mode. Baked gains stay at unity unless intentionally remixed.

Actual rendered capture then failed because Godot 4.6.3's default WAV import
uses lossy QOA (full-mix max sample error 0.00873). The pack build tooling now
configures only pack-local res:// WAVs for lossless PCM, original rate/channels,
no normalization/trim, retaining explicit loop settings. Source WAV bytes and
external project audio assets are unchanged. Reimport is required. Uncompressed
memory cost and cold-loading budgets remain a separate pending gate.

The reusable native DAW game-pack helper now enforces the existing UI's stereo
PCM16/no-normalization/no-dither contract at a common rate for full mix, stems
and loops, without mutating the editable source. Metadata agrees with that
contract. Independent shared/master processing is explicitly not guaranteed to
sum to the full mix; native route fidelity is not inferred from Core results.

Executed: 180 Core tests; 29 focused DAW export tests; TypeScript; Godot schema,
trust boundary, 15 mix-selection/limit checks, 48 origin/ownership checks and
133-entry addon-only packaging. The Core rendered WASAPI comparison covers
96,000 stereo frames for each of four routes (mix/layers × synchronized/players),
including six layers with shared texture. Reports and before/fix evidence live
under `local-artifacts/scratch/validation/core-godot-pcm/` and
`local-artifacts/scratch/campfire-reference/godot-stem-before.log`.

Published: nothing. No exact installed candidate, human listening or native DAW
two-source parity pass is claimed. The importer still emits its pre-existing
NUL-check diagnostic during path validation; those guard rules were unchanged.

Independent review accepted the bounded source change at `68394c17` without a
confirmed blocking defect. It correctly identified that the verifier's 90%
reference coverage threshold could miss an ending. The correction requires
100% reference coverage, reports missing frames explicitly and checks the final
100 ms separately. Five tests include one-frame/480-frame capture truncation,
silence-padded early endings, gain/latency and invalid PCM. All four rendered
WASAPI routes pass again: 96,000/96,000 frames, zero missing frames, an audible
naturally decaying ending cue, and both deliberate truncations rejected for
each route. PCM16 sample/RMS and bounded
latency tolerances remain explicit in the report; no gain or duration fitting.

Review follow-through still includes rendered LOOP_KIT seam/end behavior,
nonzero-tail alignment and loud/clipping reconstruction. Four short Core
captures with conductor processing disabled are PCM delivery evidence only,
not continuous adaptive-loop, native DAW, browser-master or listening parity.
An additional late Campfire cue with a nonzero hard-cut ending failed the
unchanged sample tolerance (maximum error about 0.00281 in ordinary layers and
0.000306 synchronized). This is retained as a failed seam/end gate, not covered
by the naturally decaying fixture. Cause and correction remain pending.
Strict passing report: `core-godot-pcm/strict-ending-final-report.json`;
failed hard-cut report: `core-godot-pcm/run-R7Va79/parity-report.json`, both
under this review checkout's ignored validation directory.

## Second source candidate: Core Campfire foundation

Stacked branch `codex/pocket-audio-campfire-20261015` starts at the reliability
candidate `59f9c1e5ab3515f73af141c8e9d3bf3e15290584` (draft PR78). All PR78
hosted checks are green, including Windows native, browser E2E, all family
products, security/governance, Godot and both CodeQL languages. That CI status
does not turn an uninstalled source candidate into installed listening evidence.
The review correction at `ab0a29279c6ff1e63d906334f8f04bfa7a91a42d` is merged
forward into this branch without rewriting either candidate's history.

Implemented: original Core integer-delay pluck recipe, exact D/G/Bm/A voicings,
76 BPM strum/picking fixture, complete note identity, bounded mutation-safe LRU,
explicit reference-cut/optional fade tails and a prepared AudioContext playback
API with explicit start/cancel/Stop and no autoplay. The Core offline event path
now uses the PCM with shared stem gain, complete ordinary tails and exact
zero-tail loops. Rich JSON/PCS1 retains notes/direction/unknown source intent.
The existing Core live engine now prepares all reachable sections before setting
its audio clock, then schedules cached note voices only. It has a 16 MiB default
PCM budget, explicit oversized/missing-identity failure, cooperative cold-load
cancellation, stale-Play rejection and cancelled lookahead on section changes.
Explicit Stop/Pause cancels voices; natural completion retains tails. Legacy
app sound selectors and native renderers are not yet wired to it.

Tested: 10 reference dry PCM hashes at 44.1/48 kHz × MIDI 36/50/69/84/96;
26 focused deterministic tests; all 177 Core tests; actual Chromium
OfflineAudioContext produces the same 10 hashes at the requested onset and
keeps cancelled future voices silent. Live/offline strums at both rates and
directions match within 1.87e-9 per sample; captured browser output preserves
existing tails while cancelling obsolete lookahead. Full required family-parity gate passes,
including 1,170 DAW tests across 100 files. Reports are retained under ignored
`local-artifacts/scratch/campfire-reference/`. Physical output and human
listening are not inferred from OfflineAudioContext.

Published: **nothing**. No Core npm release. Remaining: integrate the existing
legacy browser/native/DJ paths, preserve portable source/intent, expose honest
capabilities, validate both Godot source routes and full-mix gain/FX semantics,
and complete listening/native acceptance before product release.

Current separate dependency note: GitHub alert 21 is medium-severity Rust
`glib` GHSA-wrw7-89jp-8q8g, not the npm source-map-js advisory. Locked Windows
target dependency inspection (`cargo tree --locked --target
x86_64-pc-windows-msvc -i glib`) reports no dependency. No Tauri/GTK upgrade was
made. The locked Linux dependency path is confirmed through GTK 0.18 and
Tauri 2.11.2 (muda/tao/wry/webkit2gtk), and needs deliberate upstream review;
do not turn the clean npm audits into an all-ecosystem advisory claim.
## Fourth source candidate: native Campfire renderer foundation

Branch `codex/pocket-audio-native-campfire-20261015` follows Godot fidelity
candidate `68394c17bbe19f1687275564e00beb27a360d373`. The original Rust note
recipe prepares immutable shared PCM before starting render work, with a 64 MiB
working-set limit and explicit unsupported-input failure. The existing native
graph reads prepared voices; no note synthesis is added to the audio callback.
Direction, seed, note gain, rate and optional fade match Core. Natural tails
survive native seek/cache pruning and ordinary WAV export; exact-loop/cache
modes retain explicit lengths. Muted tracks cannot extend the render with a
silent Campfire tail.

Renderer contract v37 fingerprints the new DSP module and export tail logic,
and includes recipe identity in generated cache hashes. Old generated caches
will rebuild once. Existing sound IDs/defaults, licences, dependencies,
capture/device plumbing and release versions remain unchanged.

Executed: eight focused native tests, including the real native playback
constructor; 10 independent dry-note hashes and four cross-engine event hashes;
184 Core tests; 64 focused cache/native-export tests and TypeScript; full native
192 passed/2 ignored; 283 Windows-contract tests; Clippy with warnings denied.
Final reports are under
`local-artifacts/scratch/validation/native-campfire-*.log`. Two existing manual
native tests (hosted-event benchmark and owned external session fixture) remain
ignored, not passed.

The capture fingerprint remains
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`;
recording input/capture code is unaffected. This source slice does not require
a fresh hands-on mic check, and does not count that omitted action as passed.
Exact-installed PCM/MIDI/export and eligible retained-baseline verification
remain required for a release candidate.

Published: nothing. Product selectors/import/rich handoffs, browser/DJ paths,
full voicings/picking and generated cache tail handling remain pending. In
particular, the existing 250 ms generated-stem tail assumption must be resolved
before exposing Campfire as a complete product feature. No full native-to-Godot
or listening claim follows from these code tests.

## Native Campfire review correction

Independent review of `86e5a4dd363c9ab3552f480633398195a571e040`
found that compiled routes looked up prepared Campfire PCM by ID alone. A bass
or another guitar instrument sharing that ID could acquire the wrong samples
and release duration. The mixed-instrument collision regression reproduces the
failure on that source. Prepared lookup now additionally requires the actual
Campfire guitar predicate. Existing mixed-instrument IDs stay accepted and keep
their original instrument route/release; duplicate Campfire IDs still fail.
Renderer contract v38 invalidates generated caches for this correction.

The regression covers ordinary bass, another guitar tone, and a bass carrying
the Campfire instrument string. All five native Campfire graph/constructor tests
pass after the correction. Full native regression passes 193 tests with two
existing manual tests ignored; Clippy passes with warnings denied. Reports are
`native-campfire-collision-before.log`, `native-campfire-collision-after.log`,
`native-campfire-review-full.log` and `native-campfire-review-clippy.log` under
the review checkout's ignored validation directory. Physical output and human
listening are not implied.

Native acceptance still requires full stereo graph parity at nonzero and long
song onsets and after seek. Direct prepared-event hashes and initial nonzero
samples do not establish that timing accuracy. Fixed cache tails, host/master
processing, exact installed output and listening remain separate gates.

## Independent review correction - GODOT-01 (historical evidence)

Independent review of `59f9c1e5ab3515f73af141c8e9d3bf3e15290584` correctly found
that the empty-selection path stopped layer players but retained their streams.
The subsequent start helper could replay stale A audio in an empty B section.
The strengthened fixture also reproduced an existing prepared-stem Pause gap:
chart pause alone left the actual players audible, including during paused seek.
These findings supersede the initial fixture's narrower acceptance; the initial
16 position/nonzero-PCM checks were insufficient to establish correct identity
or empty-set silence.

Fix: clear layer streams for empty selections and when handing ownership to the
synchronized player. Pause/unpause the actual players. A paused seek prepares
the set and records a pending start; Resume starts from the new origin. Ordinary
pause/resume preserves the paused player instead of rebuilding it.

Expanded acceptance uses captured 220/660/330/880 Hz identity, not nonzero peak
alone. It covers direct/repeated sections, absolute full-song origins,
nonempty-to-empty after both jump and seek, automatic B/repeated-A transitions
with conductor processing active, explicit state-local origins, paused silence,
paused seek and resumed origin. The reviewed baseline failed eight checks.
The fixed candidate passes all **34/34** on both warmed Dummy and rendered
Windows WASAPI with Godot 4.6.3. The final addon CI contract/accessibility/package
gate passes. Reports: `local-artifacts/scratch/validation/godot-origin/` files
`review-before.log`, `review-after.log`, `review-rendered-wasapi-final.log`, and
the sibling `godot-review-ci.log`. The missing-B warnings are expected fixture
diagnostics. No physical-speaker, human-listening, frame-budget or exact-installed
DAW claim follows from this result.
