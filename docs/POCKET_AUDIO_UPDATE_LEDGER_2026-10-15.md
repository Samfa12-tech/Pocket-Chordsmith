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
by the naturally decaying fixture. The later prepared-WAV ending slice below
diagnoses and corrects this retained failure without relaxing measurement.
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

## Fifth source candidate: imported guitar and complete cache tails

Branch `codex/pocket-audio-campfire-cache-tails-20261015` follows the corrected
native candidate `569d0da08a07620ae9d16f770d7dfdd2734e40dc` and includes the
strict Godot measurement correction. Enabled authored rich guitar was imported
as inactive/muted if its legacy step pattern was empty. A regression reproduced
this silent route; import now recognizes authored rich events while preserving
an explicitly disabled guitar track. Explicit event up/down direction takes
precedence over the legacy strum default. Source data is not mutated.

Generated Campfire cache requests now include the complete prepared note plus
strum tail instead of assuming 250 ms. Rendered duration and persisted tail
metadata survive reuse/hydration; an explicit body duration prevents adjacent
clips' overlapping natural tails from being mistaken for overlapping musical
bodies and discarded. Tail-policy identity invalidates the previous cache.
The reviewed baseline requests 2.25 seconds for the late four-note strum where
3.331 seconds is required; the new regression fails on that exact difference.

Executed: 113 affected cache/import/engine/renderer-contract tests and
TypeScript pass after merging the reviewed native guard. The new cache test
uses bridge output metadata to verify dispatch lengths, reuse and reload; it is
not rendered/native PCM parity. All 189 Core tests and the complete family gate
pass, including 1,173 DAW tests across 100 files.
Reports: `campfire-rich-import-before.log` and
`campfire-cache-tail-before.log`, `campfire-cache-import-final.log`,
`campfire-cache-core-final.log` and
`campfire-cache-family-final.log` under ignored validation artifacts.

Published: nothing. Product selectors and full stereo graph parity at long
onsets/seek, installed output, host/master behavior, two Godot source routes and
listening remain pending. Capture/input plumbing remains unchanged.

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

## Sixth source candidate: native Campfire frame alignment

Branch `codex/pocket-audio-native-frame-parity-20261015` follows cache/import
candidate `508ec03037f91d40ed810ebe9979064c8c61789b`. Expanded full stereo graph
measurement reproduced onset error up to 0.04916 and tail-seek error up to
0.0002731 at later song positions. Subtracting accumulated floating seconds and
then flooring could select the preceding prepared PCM frame.

Campfire now aligns absolute native positions and event onsets on the output
sample grid before selecting PCM. Core floors absolute event onsets, while
native current output positions and strum offsets round to their sample grid.
Normal/cache event scans compare floored onset frames directly with the rounded
current output frame while keeping
future legacy events silent, including
when one sorts just before a due Campfire event. Native clock ownership and
existing recipes' timing stay intact. Renderer contract v41 invalidates affected
caches. No callback synthesis or new dependency is introduced.

Executed: 195 native tests pass, two existing manual tests ignored; Clippy with
warnings denied; 284 Windows-contract tests; complete family parity including
1,173 DAW tests; organization/governance/whitespace checks. The graph regression
covers both rates, six onset positions up to two hours, seeks 1.1 seconds into
tails, fractional floored onsets and nearby legacy events in both render modes.
The reproducible `verify-native-campfire-graph.mjs` captures 32 full stereo
outputs and compares every frame against canonical Core PCM plus documented
native dry source/track pan, track gain and soft limiting. All 1,825,884 frames
match exactly; declared maximum/RMS limits remain 1e-7/1e-8 with no latency/gain
fit. The original 26 integer-onset captures passed before an additional source
read caught the wrong nearest-onset convention in the first fractional test.
The correction now retains four fractional-onset captures too, and rejects
nonfinite/negative native onsets explicitly. Original reports:
`native-campfire-frame-before.log`, `native-campfire-frame-*.log` and
`native-campfire-graph/run-An9frk/parity-report.json` under ignored validation.
Corrected 30-capture report: review checkout `native-campfire-graph-floor.log`.

Further independent review of `b4073d53885cdca516f21869868c1f066f81d62b`
reproduced two remaining failures: a later bass sharing a Campfire ID extended
the Mix WAV from 1.581 to 2.581 seconds, and fractional onset 0.999999 after a
two-hour-position preroll was due by PCM lookup but skipped by the seconds-based
scan cutoff. Mix tail sizing now requires the Campfire instrument predicate;
both scans use the same floored-onset/rounded-output frame comparison as PCM.
Regressions cover mixed bass/other guitar IDs and retain both long-position
near-frame-end stereo captures. Updated 32-output report is review checkout
`native-campfire-graph/run-aBsW3h/parity-report.json`; baseline failures are in
`native-campfire-review2-before.log`. Full native/lint reruns are retained in
`native-campfire-review2-full.log` and `native-campfire-review2-clippy.log`.
The final review source also passes 284 Windows-contract checks and a fresh full
family gate, including 1,173 DAW tests. Those reports are
`native-campfire-review2-windows.log` and `native-campfire-review2-family.log` in
the review checkout. Fresh exact-head hosted CI remains required before source
acceptance.

Published: nothing. These are short prerolls and seeks at named positions, not
two hours of continuous callbacks. Installed devices, hosted/master FX, browser
master, both complete Godot routes and listening remain separate acceptance.
Capture/input plumbing is unchanged; omitted mic interaction is not passed.

## Seventh source candidate: prepared Godot WAV endings

Branch `codex/pocket-audio-godot-ending-20261015` follows corrected native
candidate `b4073d53885cdca516f21869868c1f066f81d62b`. The retained late Campfire
hard-cut capture failed by 0.00281 in ordinary players and 0.000306 synchronized.
Godot 4.6.3's own mixer applies a 64-frame stream-end lookahead fade, and its
WAV resampler has an end-history boundary. A private PCM transport guard now
moves those boundaries into silence after the complete authored body.

New pack imports enable `preserve_prepared_wav_endings`; existing profiles keep
their previous default. Opt-out is explicit. Only non-looping PCM WAV resources
are guarded; source files and caller-owned/imported resources stay unchanged.
Authored looping streams retain their mode/points/length. Compressed WAVs stay
unchanged with a lossless-import warning. Guard size is source/mix-rate-aware,
8–4096 source frames (132 frames at 48/48 kHz). Prewarm and repeat preparation
reuse one prepared cache entry per path; profile replacement clears it. A
transient body copy and cold-load/working-set budgets remain GODOT-03 work.

Executed: 13 ownership/cache/rate/loop checks; 17 pack-selection checks; all 48
origin/pause/resume/seek/ownership scenarios on Dummy with the guard enabled;
schema/trust/accessibility and 134-entry addon-only package gate; 189 Core tests;
complete family parity including 1,173 DAW tests. Rendered WASAPI passes all
four hard-cut and all four natural-ending routes, comparing every one of 96,000
stereo reference frames per route and rejecting deliberately missing-final-frame
and silence-padded endings. Maximum error is 0.00006211; original PCM16 sample/
RMS tolerances remain unchanged. Source WAV hashes and explicit loop choice
remain preserved. The following 100 ms of all eight captures is silent.
Rendered WASAPI also passes all 48 guard-enabled origin/pause/seek scenarios.

Evidence under ignored validation: `godot-ending-ci-final.log`,
`godot-ending-core.log`, `godot-ending-family.log`,
`core-godot-pcm/run-McJaIT/parity-report.json` (hard cut),
`core-godot-pcm/run-AZMenQ/parity-report.json` (natural), and
`godot-ending-origin-rendered.log` and `godot-ending-post-body-silence.json`.
The earlier failed report remains intact in
the review checkout at `core-godot-pcm/run-R7Va79/parity-report.json`.

Published: nothing. Transport silence is not an authored natural tail or a
loop-seam fix. Rendered LOOP_KIT seams/endings, nonzero-tail alignment, loud/
clipping reconstruction, browser master, fully arranged native DAW-to-Godot,
installed-device output, real-game performance and human listening remain
independent acceptance work. No new installer or public artifact was produced.

## Eighth source candidate: Core Campfire mixer gain

Branch `codex/pocket-audio-campfire-mixer-20261015` follows Godot ending candidate
`c0310dcd304551372bbba871e64dc661c06ea190`, which includes the native review
corrections. A new regression reproduced Campfire output at guitar volume zero.
Actual Chromium live/offline comparison also failed at zero volume: offline
used a fixed default gain while live used the normalized project mixer.

Core full-mix and aligned-stem rendering now pass the normalized guitar mixer
to the Campfire PCM path. Volume and mute apply consistently; the original
default gain, note recipe, seed, strum, tail and old instruments are unchanged.
Direct event-buffer calls retain the existing default unless an explicit
`stemMix.guitar` is supplied. No shared/browser master parity is implied.

Audio-time browser suspension also reproduced mute leaving an existing tail
audible. Prepared voices now share an updateable output gain with anchored
five-millisecond ramps. Live volume/mute changes update existing and already
scheduled strum voices without resynthesis, retriggering, moving their note
position or discarding their natural tails. Stop holds the current automation
value before fading; rapid same-time changes cannot jump to an earlier target.
Review found a queued-string exception: cancelling its future onset automation
could expose GainNode's default gain of one. A Chromium capture 0.026 seconds
into the strum reproduced a 0.113575 maximum sample error. Each voice now sets
its intrinsic gain while still silent. Stop immediately cancels not-yet-started
strings and applies the release only to already sounding voices.

Executed: all 192 Core tests; 20 real Chromium OfflineAudioContext live/offline
cases at 44.1/48 kHz, up/down, volumes 0/0.2/0.66/0.9 and mute set before Play.
All pass with maximum error 1.87e-9. The 10 independent dry PCM hashes still
match. Decoded STEM_SYNC/HYBRID WAV full mixes and guitar stems retain zero and
non-default gains at PCM16 precision. Complete family parity passes, including
1,173 DAW tests. Six additional browser captures suspend at actual audio times
to mute both future strum starts and already sounding notes, unmute at the same
position, then change volume. Every sample through the five-ms ramps is compared
against the unfitted PCM/gain reference; muted windows are exactly silent and
the resumed tail stays aligned. No PCM rebuild/new note start occurs in the API
regression. Organization/governance/whitespace checks pass. All seven default-
gain WAV hashes still match the retained Godot rendered reference byte for byte.

Evidence under ignored validation: `campfire-mixer-before.log`,
`campfire-mixer-browser-before.log`, `campfire-mixer-after.log`,
`campfire-mixer-browser-after.log`, `campfire-mixer-core-final.log`,
`campfire-mixer-family-final.log`, and
`campfire-mixer-godot-reference-hashes.json`.
Live control evidence: `campfire-live-mixer-before.log`,
`campfire-live-mixer-after.log` (intermediate ramp failure retained), and
`campfire-live-mixer-final.log`.
Review validation: `campfire-queued-gain-before.log` retains the audible default-
gain failure. `campfire-queued-gain-final.log` includes six dynamic captures and
12 additional mute/volume/Stop captures precisely one or two audio frames before
the second string onset at both rates. Suspension's actual quantum-rounded audio
time is asserted. Every output sample is checked against the unfitted five-ms
gain reference (maximum error below 3.8e-8, RMS below 5.4e-10); no prepared PCM or
voice is added by the controls. All 192 Core tests pass again. The existing
Chordsmith builder regenerated the tracked embedded WAV worker and the exact
`verify:single-file` freshness gate passes; the validator was not changed.

Published: nothing. This validates Campfire gain and existing prepared voices;
adding unprepared note identities still needs preparation. Product
selectors, full voicings/picking in the authoring apps, legacy fallback/DJ,
installed/native and full two-source Godot acceptance remain pending. No physical
output or listening claim follows from OfflineAudioContext.


## Ninth source candidate: native Campfire render window and tail frames

Based on corrected Core mixer candidate 8179c736cd0f4b5039a63ea32282f74f7e858ce0.
New real native WAV regressions reproduced three duration errors: a note at or
after the requested body extended output by 1.581 seconds; explicitly zero
velocity/track/master gain still added a silent tail; fractional onset rounding
added one quiet frame. A later onset could also enter an earlier pluck's valid
tail extension.

Ordinary Mix export now extends only audible, enabled, native-owned Campfire
notes that start inside the requested body. The prepared voice end uses the
same floored onset frame plus exact prepared PCM frame count as the renderer.
The extended window cannot admit a new Campfire onset beyond its original body.
A complete Campfire tail beyond the existing 600-second native render limit
returns an explicit error before allocation rather than silently truncating it.
Exact-duration MixExact/CacheStem behavior, live scheduling and other sound
recipes retain their existing paths. This is a bounded Campfire rule, not a
claim that general recording/hosted-plugin range cropping has been fixed.
Cache renderer identity advances to v42-680a0e22-campfire-acoustic-r1.

Executed: 199 Rust tests pass, two existing tests remain ignored; Clippy with
warnings denied passes. Endpoint/future onsets produce exactly the requested
silent body; zero-gain cases assert numerical silence, including signed zero.
A distinct future pitch cannot enter another note's tail (byte-identical WAV
comparison). Fractional onsets at both 44.1/48 kHz have exact expected WAV byte
counts. The 600-second policy test proves rejection without a long allocation.
All 32 real native stereo graph captures still match the unfitted Core plus
explicit dry native gain/pan/soft-limit reference exactly (1,825,884 frames).
Windows contract: 284 pass. Fresh Core build and required family gate pass,
including 1,173 DAW tests. Organization, governance and whitespace checks pass.

Retained failing/passing logs in ignored local-artifacts/scratch/validation:
native-campfire-tail-window-before.log, -after.log (intermediate signed-zero
assertion corrected), -final.log, -full.log, -clippy.log, -graph.log,
-windows.log and -family.log. The graph script retains all 32 actual f32 captures
and parity-report.json in its printed run directory.

Published: nothing. Installed device, decoded persisted-cache, full arranged
DAW/Godot, browser-master, plugin/recording/automation and human listening gates
remain open. Input/capture plumbing is unchanged; microphone interaction is
scoped omitted, never recorded as passed.

CI follow-up at 4c5b94b: run 38748408943 passed native tests but failed
warnings-denied Clippy on two test-only constant-size chunks_exact calls. The
initial local Clippy scope omitted test targets. Both assertions now use typed
as_chunks arrays, without suppressions or runtime changes. The exact CI command
cargo clippy --manifest-path apps/pocket-daw/src-tauri/Cargo.toml --all-targets
-- -D warnings now passes locally, as does the exact default cargo test command
(199 library tests, two ignored; one additional harness test passes, one ignored).
Logs: native-tail-ci-clippy-all-targets.log and native-tail-ci-cargo-test.log in
the primary checkout's ignored validation directory. Renderer identity is
unchanged because this follow-up changes tests only. Fresh exact-head hosted
CI and parent review remain pending.

## Tenth source candidate: prepared Campfire sample-grid starts

Based on native tail candidate 75aec991885c290e3bfa004f3e5824a2cc939308.
Real Chromium fractional-start probes reproduced interpolated prepared PCM:
NoteBank maximum error 0.004574 at 44.1 kHz, and the separate public prepared
playback helper 0.064688. A further one-frame pre-onset Stop probe reproduced
a 0.074598 peak from the queued helper.

Both prepared APIs now use the canonical floored onset frame, clamped to the
current audio frame. Each NoteBank string adds its rounded strum offset as an
integer frame before converting to AudioContext seconds. No note PCM, recipe,
master chain or transport clock is replaced. The public helper immediately
cancels a not-yet-started voice on Stop, retaining its five-ms release for a
sounding voice. PR86's accepted intrinsic-gain initialization is retained.

Executed in Chromium 153.0.8010.12: six bank captures at fractional offsets
0.4/0.6/0.999999 and full 32-beat D/G/Bm/A reference arrangements at 76 BPM,
both 44.1/48 kHz. Every frame matches canonical PCM plus explicit validation gain
0.1 and center pan, without fitting: maximum error below 2.8e-9, RMS below
7.2e-11. Six mono public-helper fractional captures are sample-identical. Four
public-helper Stops one/two frames before onset are exactly silent. The actual
suspend frame is asserted. All 20 static, six dynamic and 12 bank queued-control
captures and ten independent raw PCM hashes pass again. The queued control
fixture uses a quarter-frame requested offset so the floored second-string onset
is exactly one/two frames after the asserted suspension, avoiding quotient
roundtrip ambiguity in the test itself. Queued maximum error remains below
4.7e-8. Preparation never autoplays or synthesizes inside schedule.

All 192 Core tests and fresh family parity (including 1,173 DAW tests) pass.
The unchanged Chordsmith builder regenerates the affected embedded worker;
verify:single-file passes. Organization/governance/whitespace gates pass.
Retained ignored logs in the second checkout: campfire-prepared-frame-grid-before,
-after, -final, -core-final, -family-final, -chordsmith-build; helper failures in
campfire-prepared-helper-before and campfire-prepared-helper-stop-before (all
.log). This tests real rendered browser audio, not physical output or listening.

Published: nothing. Existing product selectors/full authoring paths, warm reuse,
installed-device and full two-source Godot acceptance remain active work.

## Eleventh source candidate: compact Core Campfire authoring

Core now recognizes the prepared Campfire identity in compact guitarTone data,
using a separate POCKET_PREPARED_GUITAR_TONES registry. The eight amplifier IDs,
configurations and old-song power chords remain unchanged. Accidentally asking
the amplifier lookup for a prepared tone fails explicitly. Product selectors
are not exposed before their audible routes are connected.

Compact Campfire events use full major/minor four-note voicings, preserving the
canonical D/G/Bm/A inversions in all three registers, plus the existing up/down
controls. The shared mixer applies volume once; open note velocity is one and
an accent explicitly carries 1.28 independently of the mixer. Recipe 1, 27-ms
strum and reference-cut tail identity are explicit. JSON and unchanged PCS1
round-trip this data. Rich explicit note arrays retain all notes/extensions.

Capability reports now disclose that compact seventh chords use the triad
voicing (use explicit rich notes to preserve sevenths), and unsupported Campfire
chug/scratch/expressive techniques use a natural pluck. Source intent remains
preserved. This does not pretend the amplifier's gates are acoustic techniques.

A real browser muted-start probe first lost all compact guitar notes, then a
retained-timeline probe lost the initial sounding tail (maximum error 0.006882).
Campfire timelines now retain muted onsets and prepared dispatch uses gain zero
instead of deleting the voice. Unmute resumes its exact current sample without
retriggering or rebuilding PCM. Other instrument mute policies are unchanged.

Executed: 197 Core tests pass; all-key major/minor thirds, all registers of the
reference voicings, unchanged old power chords/gain, JSON/PCS1, explicit accent
velocity, capability warnings and muted voice/cache reuse. Sixteen actual
Chromium scheduled compact live/offline captures span 44.1/48 kHz, down/up,
volumes 0/0.2/0.9 and muted-start/unmute. Every frame passes unfitted comparison:
maximum error below 3.8e-9, RMS below 1.3e-10. The four muted-start cases resume
the first pluck in place and clock the later three full chords correctly.
Existing prepared-frame/control/reference/hash captures pass again. Required
family parity passes including 1,173 DAW tests. Canonical Chordsmith worker
rebuild/freshness and organization/governance/whitespace gates pass.

Evidence in second checkout ignored validation: campfire-compact-authoring-
initial.log, -focused.log; campfire-compact-browser-before.log and
campfire-compact-browser-muted-dispatch-before.log retain actual failures;
campfire-compact-browser-final.log, campfire-compact-core-final.log,
campfire-compact-family-final.log and campfire-compact-chordsmith-build.log.
Published: nothing. Core-only authoring integration; full Chordsmith/DJ/native
selectors/workflows, picking controls, warm preparation, installed/human output
and both Godot authoring-source acceptance remain active work.

PR90 review correction: compact sus2/sus4 chords, like sevenths, use the current
major/minor Campfire voicing and now explicitly report approximation for both
raw and normalized projects. Source chordType is retained. Explicit rich sus2/
sus4 note arrays remain exact through normalization and timeline generation.
The missing truth-reporting case was identified at 388271a; no DSP/voicing
algorithm changed in this correction. Core suite198 and family1173 DAW gates,
canonical artifact rebuild/freshness and focused reporting/pitch regressions
pass. Logs: campfire-suspended-core-final.log, -family-final.log,
-chordsmith-build.log, -focused-final.log in the primary validation directory.
Fresh exact-head CI and parent re-review remain pending after this correction.

## Chordsmith Campfire usable authoring integration (local candidate)

Connects the existing browser transport/sample clock to the shared prepared Core
voice bank; no second live scheduler. Campfire full voicings, exact imported
poly/single notes, up/down strum and non-destructive section strum/pick controls
are audible. Manual grid data survives performance selection and Undo. Existing
four-bar section limits remain. JSON/PCS1 schema and amplifier IDs are unchanged.
Rich Campfire fractional ticks, low/zero velocity, seed, direction and unknown
fields survive import. Generated generic MIDI mirrors are not used for compact
Campfire because they lose velocity/recipe/direction; authored rich tracks remain.

Cold Play is cancellable. Warm replay reuses PCM without new buffers. Key edits
prepare missing identities outside the scheduler, keep the same bank and leave
sounding tails intact. Preparation has the existing 16-MiB bound, atomic staged
promotion, cancellation and stale-request guards. These are focused prepared
instrument changes, not a general cache rewrite.

MIDI uses canonical guitar notes and 27-ms strum timing, including exact rich
pitches; pure Campfire receives steel-string GM program25. Core worker WAV is the
supported Campfire render path; the old synth fallback explicitly refuses it
rather than silently sounding like an amplifier. Actual UI-worker output SHA256
matches direct Core WAV for the tested phrase. Core module compression uses the
already installed Chordsmith compressor; no dependency or CSP changes.

Executed before theme integration: Core202 passed; family parity passed including
1173 DAW tests; browser112 desktop/touch passed; genre audio-quality5 passed;
composer34 deterministic plans passed; lint/typecheck/format/size passed.
Size1061408/1100000 active and893379/900000 modular. A sandbox Temp EPERM prevented
one unit run before tests executed; escalation rerun pending. More actual MIDI
byte checks and theme integration gates follow. Failed generated-mirror parity
probe retained alongside passing corrections in ignored chordsmith-campfire logs.
No physical listening or device acceptance is claimed. No published files.

Explicit remaining limitation: a live section mixing prepared Campfire and amp
voices is rejected with a Core-WAV instruction; offline Core supports it. This
slice is not full family acceptance. DJ/native controls, remaining DAW UX and
finishing, both Godot source routes/runtime/scene checks and exact installed
candidate/human output acceptance remain active. Capture plumbing unchanged:
microphone omission remains scoped and is not a passed hands-on test.

## Approved Chordsmith theme candidate

Sam approved the three PR80 visual directions inside the existing theme system,
with Chordsmith/Samfa12 blue as default. Branch
`codex/chordsmith-existing-themes-20261016` follows corrected Core mixer PR86.
Set List, Pedal Board and Tape Notes extend the existing selector, sanitizer and
applyTheme path; old IDs/default, saved choices and song/editor data remain.
Actual palette, control and typography integration covers the full editor,
Settings, fixed transport and tooltips without a second editor/theme manager.

Executed: 104 existing desktop/touch smoke cases plus two new persistent
save/load/undo cases pass. All seven choices preserve non-theme exported song
fields; new choices also survive autosave and JSON restoration. 32 actual
Simple/Advanced layouts at 1440/720/375/360 have no page overflow or escaped
transport. Eight screenshots inspected; three touch theme/save flows pass.
Measured primary text tokens exceed 4.88:1 and control borders exceed 3.06:1.
Source/freshness/type/format/size/organization/governance/whitespace gates pass.
See docs/design/CHORDSMITH_THEME_INTEGRATION_2026-10-15.md for evidence and limits.
Published: nothing. Physical phones/screen readers/scaling remain unclaimed.
Audio routes, broader authoring controls and other family work remain active.

Combined candidate verification: 114 desktop/touch tests passed, including actual
Export MIDI button bytes decoded back to exact notes/onsets/program25. Core202,
family1173, genre5, composer34, four WAV budget units, lint/type/format/size,
generated freshness, production build, repository organization/security/sound
contract/governance checks pass. The sandbox-only unit EPERM is resolved by the
successful escalation run; no product test was counted as passing from that error.

Exact Firefox155/WebKit26.6 binaries were installed into ignored task validation,
without package changes. Required cross-browser baseline8 pass. New Campfire/theme
cases: Firefox5 pass; WebKit2 export/theme pass,3 live-audio skipped. An actual
WebKit probe proved both AudioContext and webkitAudioContext are absent in the
Windows binary before preparation begins; raw failed checks and diagnostic are
retained. A capability requirement skips those live cases honestly. This is not
Safari/macOS/iOS live acceptance and no mocked audio substitutes were used.

Approved PR88 themes are combined through a455475d4f661cfd2e2983d711edb0f69cfc8c14;
blue default and saved choices remain. Local reviewed-source itch package built
successfully, not uploaded. Candidate is for parent source review/CI, not release.
Size1066549/1100000 active and894424/900000 modular. Main/owner checkout unchanged.


## DJ prepared Campfire and shared precision integration candidate

DJ now preserves imported campfire_acoustic rather than silently replacing it
with high_gain. Its existing scheduler dispatches canonical Core note descriptors
to the prepared PCM bank through the existing guitar mixer. Full voicings,
up/down strums, exact picked rich notes and non-destructive strum/pick source
performance work in actual desktop/touch browsers and standalone file URLs.
Saved DJ sessions retain original PCS source data and do not autoplay. Session
replacement/clear drops old prepared residency; Stop cancels cold preparation;
stale completion cannot start playback. Explicit restart cancels old prepared
sources but reuses PCM. Mute/unmute changes the existing bus without retriggering
or stopping the sounding sources. An unavailable prepared Core fails visibly
without amplifier fallback. Mixed amp/prepared same-section live playback remains
explicitly unsupported. No new DJ timbre selector: this is the imported-song deck.

A stronger DJ/producer probe found a shared precision gap after PR91: source JSON
retained tick123.5, but Core normalized it to123. A Campfire instrument alias also
fell back to an amplifier. Campfire-only normalization now retains fractional
tick/durationTicks and maps that explicit alias; old instruments retain their
existing normalization policy. Direct Core test and actual Chordsmith/DJ prepared
tick/time assertions pass. Do not count PR91 alone as exact fractional playback
acceptance; this stacked correction is needed. Original source/unknown fields
remain unchanged. Canonical Chordsmith embedded Core artifacts regenerated.

Passed: Core203; family parity including1173 DAW; Chordsmith producer8 desktop/
touch; DJ26 desktop,4 additional touch and4 Firefox new workflows;6 required
Firefox/WebKit baseline;6 scheduler tests;lint/type/format/size/freshness, local
itch packaging and repo/security/governance gates. WebKit4 new live cases are
SKIPPED because the Windows binary has no AudioContext, not audio passes. The
renderer-unavailable check is explicit fault injection, not listening evidence.
Current DJ size225078/300000. Exact DJ lockfile installed offline without script,
manifest/lockfile or version changes. Raw identity/precision failures and passing
logs: ignored local-artifacts/scratch/validation/pocket-dj-campfire-*.log.

Local package prepared only, SHA256
9485f696c4da7e9d47fb7a45e725d5ec95e84880855df1c3f114da4bcb33938f.
Not published, not a final release installer/physical listening acceptance.
Native DAW compact controls/performance, remaining DAW UX/finishing, both full
Godot source/runtime routes and exact installed acceptance remain active.

PR91 review correction: custom-ID rich tracks with role:guitar now use the same
stem/role/ID precedence and case handling as Core for Campfire detection, authored
part UI, and scoped Clear/Fill replacement. Explicit non-guitar stems override a
guitar role/ID. The retained failing regression first left guitarEnabled false
when omitted. Corrected desktop/touch custom-role flow passes actual Play,
decoded Export MIDI bytes, UI-worker/direct-Core WAV hash equality, Clear/Undo,
unknown track metadata and preservation of a melody-stem guitar-role lookalike.
All116 desktop/touch cases pass;lint/type/format/size/whitespace pass. Rebuilt
canonical HTML, size1066805 active/894680 modular. Logs chordsmith-campfire-role-
{before,after,full,build}.log in primary ignored validation. Hosted exact-head
review/CI pending. These establish scheduling/export routing, not full-bus live
PCM or physical listening. Shared fractional timing correction remains in PR92.

PR92 role follow-through: includes PR91 correction83ddfd47 and applies identical
Core stem/role/ID precedence to DJ activation/detection. A custom-ID uppercase
role:guitar source first reproduced guitarActive=false; corrected Play and saved
session restore pass desktop/touch/Firefox, with explicit stem-over-role negative
check. DJ desktop27 pass, new role touch/Firefox2 pass, merged Chordsmith custom
role Play/MIDI/WAV/Undo2 pass;lint/type/format/size/whitespace pass. Size225098.
Earlier prepared/source/cancellation/mute/restart tests remain passing in full
27-case desktop run. Raw role failures retained in primary ignored validation.
No live full-bus PCM/listening claim follows from these scheduler/export tests.

## Native Campfire authoring candidate (2026-10-16)

Implemented on top of accepted PR91/92. Native guitar tone now accepts the
separate prepared Campfire ID without changing the eight legacy amp IDs. Compact
notes use Core full major/minor voicings; per-section Grid / strum + pick uses a
shared clock-free intent helper, existing native timeline/sample clock and clip
transforms. D/G/Bm/A at76 BPM retains24 events, quiet picks,27ms strums and exact
15-second onset. High automatic picking is explicitly refused rather than
clamped. Exact rich fractional ticks, voices, velocity, seed and unknown source
metadata survive save/reopen. Core stem > role > ID ownership is shared for this
new path; explicit other-stem tracks remain untouched.

Prepared note velocity and native clip gain0..4 are independent. The Rust path
validates gain before preparation, reuses immutable prepared PCM and applies gain
in the existing native source graph. Explicit gain0 adds no audible tail. Native
renderer cache contract changes to v43/a3073ea9 so older rendered assets cannot
silently survive the new source behavior. Legacy events omit clipGain and retain
their existing behavior.

Both inline timeline and inspector show the active automatic performance as
readonly, retain stored Grid and focus, and explain exact imported-note ownership.
An explicit rhythm preset replaces only guitar events using the selected tone;
whole-project Undo restores source notes and metadata. MIDI bytes carry full
ordered voicings,27ms timing, quiet picks, existing guitar channel8 and GM25 for
pure Campfire tracks, while mixed/authored program tracks retain their programs.

Tested: Core203; family parity including1185 DAW tests; Windows contracts284;
complete DAW shell browser20; regenerated Chordsmith desktop/touch Campfire10;
TypeScript and DAW production UI build; Rust Clippy-Dwarnings and full lib200pass,
2ignored. Existing real native dry stereo graph captures32/32 at44.1/48kHz match
Core reference exactly including long onsets/fractional onsets/tail seeks. New
native source-gain test covers0/0.4/1/4, PCM reuse and invalid values. Test manifest
104 artifacts, repo/security/sound/governance, whitespace and generated freshness
pass. Chordsmith active1067177/1100000 and modular894680/900000 bytes.

Failed probes retained: initial reference float accumulation, native renderer
contract missing hash, and browser duplicate-step selector exposed an actual
inline/inspector display mismatch; all corrected and corresponding gates rerun.
Ignored evidence: local-artifacts/scratch/validation/native-campfire-authoring-*.log
and native-campfire-graph/run-*/. Regenerated canonical Chordsmith HTML includes
the shared planner; no dependency, licence, version or capture-plumbing changes.

Not published. Source candidate only: no new installer or real device/listening
acceptance, no complete authored song/full-bus nonlinear mix parity claim from the
single-source reference captures. Two ignored Rust tests are not passes. Existing
Windows WebKit live-audio limitation remains. Mic is scoped omitted, not passed;
retain Sam's hands-on check if final shared risk requires it. Core repo-only/no
npm, no Reef Sweep/PR75/dependency merges. Remaining whole-family Godot runtime
routes, layout/BeatStitch/finishing and exact installed acceptance remain active.

## Godot prepared cache and loading-scene preparation (2026-10-16)

Actual Godot4.6.3 reproduction found two residency failures: set_playback_profile
cleared the stream cache but retained the old prewarm signature, so identical
paths skipped reload; warm lookup checked disk before consulting resident PCM.
Resetting the signature with cache invalidation and checking residency before I/O
fix both. Explicit profile replacement still releases old resources; missing
uncached files remain rejected. The failing probe is retained.

The optional prewarm_sections_async loading-scene API reuses existing prepared
stream machinery, yields between assets, deduplicates PCM, never starts playback,
and returns explicit cancellation/failure/loaded/cache/max-asset-time diagnostics.
Explicit cancel and profile replacement invalidate queued work before another
asset load, preventing stale requests from filling a replacement cache. Existing
synchronous APIs and playback behavior remain available. README gives the awaited
loading-scene integration and states that each individual file still decodes
synchronously: this is not background decoding or a frame-time guarantee.

Tested: complete real Godot gate, including schema/trust/mix17/ending13/new
residency8/section-origin engine-bus capture/editor accessibility and addon-only
packaging135 entries, passed. Runtime probe checks exact192000-byte WAV PCM,
cooperative frame yields, no autoplay, duplicate residency, explicit/profile
cancellation, same-path profile reload, warm lookup after disk removal and stale
resource release. One small-file diagnostic measured cold2022us, warm10us,
maxasset1954us; not a general performance budget. CI-import package is temporary,
not a published payload. Repo/security/governance/whitespace pass.

Retained logs: local-artifacts/scratch/validation/godot-cache-residency-
{before,after,cooperative,final}.log. Initial cooperative test expected three
completed frames from three process_frame signals; Godot emits before increment,
so actual completed-frame delta is two. Corrected assertion and reran full gate.
No audio parity/listening claim follows from residency tests. Large-file cold
load/working-set budgets, real prepared LOOP_KIT transitions, full authored-song
Core/native two-source capture and exact installed/listening gates remain active.
No source-engine recipes copied into the MIT addon and no licence/version changes.

## Godot prepared section-loop PCM correction (2026-10-16)

Extended the existing Core -> WAV kit -> real Godot conductor -> engine-bus
capture to LOOP_KIT and three repeats. Before correction all4 routes failed:
fullmix/layers with synchronized/separate players. First-loop body could be cut
roughly38ms early and later repeats drifted (peak mismatch about0.13). This is
runtime evidence, beyond manifest/import parity. Raw run-vWDXaN and loop-window
analysis retained; first probe's stream count was corrected to inspect the active
section selection instead of empty full-song paths.

LOOP_KIT now opts into Godot-native whole-body WAV repetition. Only identical,
currently playing native prepared loop sets continue across automatic boundaries;
explicit seeks, different assets and other profiles use their existing restart
path. Caller-owned PCM/authored loop points are never mutated. Preparation uses
its own cache policy, clears stale selection identity on profile replacement and
participates in existing prewarm identity. The import option
loop_prepared_sections:false retains legacy restart behavior. No gameplay synth,
per-note nodes, sample scheduler or source recipe copy was added.

Tested: all4 Dummy and all4 actual rendered WASAPI routes pass3 repeats with
288000 reference frames each, finite samples, full ending coverage and existing
PCM16 max/RMS limits. Worst sample error0.0000621043 and RMS0.0000177803; fullmix
peakerror0.0000021682. Negative truncated/silence-padded endings are rejected.
Source WAV hashes survive import. Ordinary STEM_SYNC hardcut4-route PCM regression
passes, preserving explicit Disabled loop choice. Complete Godot gate passes:
mix20, ending17, residency8,56 section-origin/seek/A-B switch captures (8 new
native-loop control scenarios), schema/trust/editor checks and135 addon-only
package entries. Repo/security/governance/whitespace and Node syntax pass.

Evidence: ignored local-artifacts/scratch/validation/godot-loop-pcm-*.log and
core-godot-pcm/run-prlFOq (Dummy loops), run-ZA4HEq (ordinary ending), run-9dRiEM
(actual rendered WASAPI loops, parity-report.json and rendered-pack-runtime.png).
Godot4.6.3 official,48kHz, OpenGL3.3/NVIDIA RTX5050 Laptop GPU. This is engine-bus
PCM with actual WASAPI selected, not a human listening or physical output capture.
The verifier now fails closed if the requested driver is not used and records
engine metadata on new runs.

Not published. Native DAW fully arranged recording/FX/automation route remains
independent. Same-body loop proof does not establish sample-accurate transitions
to different assets, crossfades, representative-game/SFX-load budgets or full
Core/browser nonlinear-master identity. Existing path guard String.chr(0) emits
Unexpected NUL warnings during manifest validation; no SCRIPT ERROR occurred.
That safety guard is unchanged under the no-security-change instruction.
PR93 review correction: reproduced enabled Campfire empty Grid -> strum/pick
leaving its track inactive/muted. Performance edits now synchronize source track
activation without changing explicit mixer mute. Prepared Campfire empty imports
retain inactivity separately from mute (source disable still mutes); legacy amp
import policy stays unchanged. No source guitarEnabled flag is silently enabled.
New regressions cover empty Grid -> automatic -> Grid, native payload audibility
and24 prepared events,48 decoded MIDI notes, explicit empty-track mixer mute,
explicit source disable, and exact Undo. Actual shell UI checks inactivity/mute
controls and multiple Undo steps. Targeted59 and TypeScript pass; full shell21
pass. First complete source run could not find the installed browser executable
(1173passed/14skipped); rerun uses the retained browser path, not counted as a
product test failure/pass. Raw before/after/setup logs retained under primary
local-artifacts/scratch/validation/native-campfire-empty-grid-*.log. No Rust,
recording/capture, version or dependency changes; no installed/listening claim.
Final corrected source gate1187/1187 passed with the installed browser path;
production UI build, repository/security/manifest104/whitespace also pass.

## PR95 continuous-loop clock review correction

Reviewer reproduced a separate clock gap after PCM looping was fixed. Automatic
continuous repeats still called seek_tick at the section boundary, dropping late
frame overshoot/fractional ticks and resetting the wall-clock anchor while native
PCM continued. Actual six-case reproduction on unchanged7cfb5ea6 failed allcases:
30 irregular delta frames lost up to757.44ticks on sequence repeats and13.44ticks
on arrangement repeats; beat/queued transition assertions also failed.

Continuous sequence and arrangement repeats now translate the existing clock
anchor to the new occurrence and retain fractional elapsed remainder. Explicit
seeks and different-asset restarts keep their established path. The player itself
continues; the correction adds no PCM generation or scheduling engine.

Corrected local six-case probe passes on Godot4.6.3 Dummy: four deterministic
cases each30 deliberately late fractional frames, beaterror0, maxclockerror below
1.2e-11ticks; two actual wall-clock cases wait until absolute late boundaries at
2.020/4.033/6.009seconds, preserve the original anchor and execute a later queued
transition. Running player phase is measured with a150ms driver-buffer bound;
this is not physical/human listening evidence. Only four cases check a queued
transition; the two arrangement-only cases explicitly report unchecked/null.
Complete Godot gate passed with136 addon-only entries and existing56 origin/
seek/switch captures,20mix/17ending/8residency/schema/trust/editor checks.

Evidence in primary local-artifacts/scratch/validation: godot-loop-clock-
{before,after,final-gate}.log and loop-clock-review/before-3emlZm/clock.log. The
strict old-head snapshot uses the same tightened fixture and fails, confirming
regression sensitivity. Stopped streams are drained before test shutdown.
Repo/security/governance/whitespace pass; no dependencies/version/licence changes.

Fresh rendered WASAPI PCM rerun is INCOMPLETE, not passed: escalated execution
transport disconnected after3/4 captures in run-8Yb8PV; no final report. A default
sandbox retry crashed during lossless import before capture. Existing pre-clock
PCM evidence remains scoped to that earlier head. Source/runtime-clock proof is
complete; exact hosted CI/re-review and fresh rendered/installed acceptance remain
pending. GitHub draft update uses the connected API because privileged local
Git execution is unavailable. Worktree source/records are preserved for later
normal Git reconciliation; no release/main merge or device/listening claim.

## Full native arrangement asset selection (bounded follow-up to PR95)

Implemented: low-level playback_scope arrangement selects global full-song stems
at origin zero and ignores section/state overrides, including on hand-authored
profiles. Existing adaptive scope remains default. Full mix/layers remain
exclusive; invalid scope and section-only arrangement requests fail explicitly.
Arrangement scope does not enable LOOP_KIT section repetition on full-song files.
This selects assets only. High-level DAW import still compiles embedded PCS;
native edited timeline compilation, tempo/meter/seeks/end integration remains
unfinished and must not be described as completed native DAW game integration.

Reproducible verify-native-godot-route.ts uses production native WAV worker and
production portable-media/game-pack builders through a test-only file transport.
It creates a moved/transposed/gain-adjusted Campfire arrangement plus collected
stereo generated WAV media with source trim/fades, low-pass/master compressor and
clip gain automation. Seven actual native WAV exports and production ZIP verifier
pass; Godot Dummy captures all four full-mix/layer sync/separate routes. Captured
full mix compares with decoded native full mix; layers compare with decoded
selected native stems, never claiming nonlinear shared-effects sum equivalence.
Only latency is fitted, no gain/time scaling; silence mutants must fail. This
fixture disables chart progression and proves prepared asset selection/PCM only.
Generated test media is not a physical recording; Tauri IPC and installed/device/
human listening acceptance are not tested by this fixture.

Tested: complete Godot4.6.3 gate passes 30 mix-contract checks, 64 origin/seek/
switch PCM scenarios (8 arrangement-scope regressions),17 endings,8 residency,
6 clock cases/schema/trust/editor checks and136 addon-only package entries.
Real native fixture run-SHgeQD compares425127 reference frames (8.8568125seconds)
in all4routes, worstmax1.6540288925170898e-6/RMS2.97520290942293e-7;
all4 silence mutants rejected. Rust200 pass/3ignored (new native export fixture
is intentionally invoked by the route verifier),fmt/Clippy-Dwarnings, script
strict types, exportJobs29, repo/security/governance/whitespace pass.

Environment evidence: default sandbox first Rust run191pass/9fail/3ignored due
access-denied temporary atomic renames; process-only TEMP/TMP into workspace
then gives200pass. Initial Godot default-user-data launch crashed; process-only
APPDATA into workspace plus local self-contained installed4.6.3 copy runs all
gates successfully. No host security/configuration/dependency changes.

PR95 corrected immutable5007dbd125d8c1b39b715fc8b13ece269d40511d now also has
fresh completed rendered WASAPI48k three-repeat evidence run-r4AF7w (primary
checkout): all4 routes cover288000referenceframes, worstmax6.210431456565857e-5/
RMS1.7922591953146787e-5. Conductor blob remains reviewed d433d2b9c762b6d0a5887df9cc498a9a3fe149ce.
Exact CI/CodeQL and independent source re-review accepted. Earlier interrupted/
crashed runs are retained as unsuccessful, superseded by this completed run.
No physical/human listening claim. Published:none. Versions unchanged.

Remaining user-facing scope: native/Core both-source game timeline acceptance;
DAW layout/window scaling/focus/popovers/shortcuts; BeatStitch contextual audible
selection/lead-in/tail/Stop and reversible same-position A-B/Apply/Discard/Undo,
no autoplay and stale rejection; finishing subtle presets/dry bypass/loudness A-B/
external measurement calibration/decoded outputs; final installed candidate and
retained real exports/device acceptance; reviewed release targets/version truth.
No Sam input currently required. Mic/capture unchanged, scoped omission not pass.

## DAW desktop command menu polish

Implemented: bounded scrollable menus with explicit disclosure state, predictable
click/keyboard opening and hover switching after opening. Arrow/Home/End/letter
navigation owns menu keys before timeline shortcuts. Escape/Tab/outside dismissal,
visible root focus after dialogs, and open/focus/scroll retention across startup
status refreshes extend the existing shell/action dispatcher. No project/audio/
recording/cache timing changes. Existing studio composition/command order stays.

Reproduced old behavior in production UI: last Edit command y651 outside800x600
stress window; Escape retained the focused menu. Raw failures retained in
primary validation desktop-menus-static-before.log. Native configured minimum is
1100x720; initial1440x920.800x600 is browser stress, not native minimum. Allthree
geometries tested. Browser DPR1.25/1.5 touch-capable emulation is not actual
Windows display scaling/physical touch/WebView2 acceptance.

Tested: final fullsource1187/1187, UI/shortcut98, full browser shell27/27, scaled
menu12/12 (DPR1.25 +DPR1.5-touch), types/productionbuild/manifest105/repo/security/
governance/whitespace pass. Six menu scenarios include a deterministic timed
startup status refresh while scrolled/focused; original selected clip count is
preserved while menu letters/arrows run. Screenshot edit-menu-constrained.png
visually inspected. Build assets are fulfilled in Playwright via optional
POCKET_DAW_UI_STATIC_DIR because default sandbox loopback sockets are denied;
normal CI retains Vite. No host/security/browser-policy settings changed.
Initial source gate blocked on unmapped new test (now properly mapped), old
hover-only test and test locator/geometry races corrected; unsuccessful runs
retained, never counted as passed. Atomic bounds assertions survive legitimate
shell refreshes without permitting an invisible or clipped menu.

Artifacts: desktop-menus-{static-before,after-build,full-source-final,all-final,
dpr-final}.log; Playwright results/screenshots. Scope and exact window truth in
apps/pocket-daw/docs/DESKTOP_MENU_POLISH_2026-10-15.md. Installed native layout/
scaling/dense-session/other popover edges and final release acceptance remain.
Published:none; version/dependencies unchanged. Mic scoped omission, not pass.

Next requested user-facing work: contextual selection audition/Stop with native
clock and safe cancellation, reversible compare/Apply/Discard/Undo, subtle native
finishing/dry/loudness comparison/measured warnings/calibration/decoded outputs;
then complete two-source Godot game timeline acceptance and exact installed/
release targets. Existing save/undo/media/plugin isolation foundations retained.
No Sam input currently required; no work on Reef Sweep or unrelated PRs.

## DAW contextual selection audition

Implemented: explicit range or selected-clip-span Hear this bit in the timeline
and inspector, visible bars/lead-in/tail, Stop during preparation/playback, no
autoplay, native-only capability reporting and recording guard. Native sample
clock owns the <=120-second bound including context and final10ms monitor fade;
consumed-clock status avoids early completion from render-ahead. Project loop is
bypassed for the preview only. Native WAV worker strips monitor bounds and its
export bytes are unchanged. Source/selection/settings/transport revisions reject
stale preparation and guard media/metadata promotion. Existing late-start-after-
Stop and stale-Stop-position-reset races were reproduced and fixed with tokens.
Internal renderer contract v44-selection-audition-66b32035 matches source; no
dependency/product release version change.

Tested: fullsource1197/1197, Windowscontract284, Rust204pass/3ignored,
Clippy-Dwarnings, fullbrowser31/31, types/productionbuild/manifest107 and
repo/security/governance/whitespace pass. Native four-test subset covers actual
44.1/48k rendered sample frames, consumed-clock status, validation and export
byte separation. Browser native IPC is mocked control sequencing, not device
audio. Final visible-range adjustment rechecked productionbuild +5 browser
cases; selection-audition-context.png inspected at1280x720 with inspector.
Logs native-audition-*.log retain original race failures and successful gates.

Published:none. No installer or installed/device/listening acceptance claimed.
Native capture fingerprint unchanged e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770;
mic scoped omitted, not passed; final shared-output device acceptance remains.
Existing native Stop clears decoded residency, so no zero-allocation/warm latency
claim. Same-position A/B/Apply/Discard/Undo, finishing/loudness/calibration,
fully arranged native Godot timeline/game integration and final installed/release
scope remain active. Details: apps/pocket-daw/docs/SELECTION_AUDITION_2026-10-15.md.

PR98 review correction: source acceptance remains pending until the corrected
head is reviewed. An evicted-asset metadata start could retry with bytes after
Stop or a newer start; stale engine reply guards alone did not prevent native
reactivation. Four actual bridge command-sequence regressions reproduced the
old bug. Separate transport ownership now gates initial/retry invocation and
replies; delayed Stop/Pause/Resume/Seek cannot dispatch over a newer start.
Eight new regressions and all94 bridge/engine/audition tests pass. Native Rust,
capture code and audio payloads unchanged; no repeated native/device claim.
Raw audition-bridge-retry-before/after logs retained. Godot timeline WIP is
preserved in a separate worktree; this correction contains only bridge/tests/docs.

## Native DAW Godot high-level arrangement clock

Implemented: nativeTimeline v1 exported from the same bounded native playback
PPQ/time helper, with bar/meter/clip placement/markers and original portable
source retained. High-level Godot import now compiles the native clock instead
of the embedded PCS source; one global daw_arrangement defaults to the exact
native full mix and uses actual WAV duration/tails. Native-only mapped clock,
seek, beat/bar/marker signals and player-consumed ending guard preserve queued
audio. Editor distinguishes prepared arrangements and disables procedural render.
Core/Chordsmith/legacy source routes stay unchanged. Explicit size/meter limits
and no per-note reconstruction/adaptive native section remix claim documented.

Runtime before probe reproduced4s PCS chart vs8.8568125s actual native arrangement.
Final source1208/typesproductionbuild pass after integrating corrected98
6f7446e062acc20f0f74d99f74ee2a549fd459d8; targeted73 also checks actual tempo
automation and meter denominator. Final Godot4.6.3 completegate pass with21 new
native assertions, existing30mix/17ending/8residency/6clock/64origin and138 addon
package entries. Repo/security/governance/manifest107/whitespace pass.

Real native7WAV worker->productionpack->highlevel chart with processing active:
final RENDERED WASAPI48k fullmix/layers×separate/synchronized4/4 PCM comparisons
pass complete425127frames8.8568125s, naturalend and silence-mutant rejection.
Worstmax1.6540288925170898e-6/RMS2.97520290942293e-7. Selected layer references are
independent native stems. Local run-1QILLX retains raw native inputs/WAVs/ZIP,
final capture log, wasapi-capture/highlevel-parity-report.json and inspected PNG.
Detailed failures, reruns and evidence limits in
apps/pocket-daw/docs/NATIVE_GODOT_TIMELINE_2026-10-15.md. Initial missing browser
path1186pass14skip fixed with14-suite rerun; final integrated1208 gate passed.
First capture script parse/diagnostic frame-limit runs were not passed.

Published:none; updated addon source required, public1.2.0 compatibility/release
version still to reconcile. No physical mic/recording/listening, installed DAW/
Tauri IPC, full-game SFX/load/working-set or seamless native full-arrangement
loop claim. Generated-media recording path +native FX/automation fixture only.
Next: remaining reversible audition/finishing/QC/calibration/decoded outputs,
broader two-source game acceptance and exact installed/reviewed release targets.
No Sam input blocker; all original whole-family scope remains active.

## Existing Core meter correction and external reference

Implemented original K-weighting coefficient/rate-transform correction and32tap
Blackman-sinc4x truepeak estimation in the existing offline analyzer. Baseline
installedFFmpeg9 comparisons reproduced33/40LUFS +35/40defaultpeak passes; Kfix
alone40/40LUFS. Final63/63LUFS +63/63peak passes7rates ×9 original generated
mono/stereo fixture families. Explicitfloat64 4xSWR/astats peak reference avoids
defaultmode192k resolution limits; retains originalebur128peak too. Intermediate
S16autonegotiated/clippedreference49/56failed, preservednotpassed. Finalbounds
0.15LU/0.2dB, worst0.056508LU/0.010227dB. Input+binarySHA256 and external numeric
readings frozen forCI; no FFmpegruntime dependency/sourcecodecopy/licencechange.

Corebuild/full208/208pass inclrelease-mastering;5newtests exercise63hashedexternal
reference cases, analyticalcounterexamples andfailclosedparsing. Existingpublic
estimatedstatusretained. Twelve ordinaryrenderPCMhashes +alloriginalsource/share/
normalized/eventfilesverifiedunchanged. Goldenupdater'sunwantedtimestamps/old
normalizationmetadata refreshcaught/restoredownoutputto99base beforeverification;
onlymeter goldenfields retained. Reproduce/details/docs/AUDIO_METER_CALIBRATION_2026-10-15.md.

No newaccounts/dependencies/publication/CoreNPM/installedcandidate/micpass.
Futureexplicitmasterrendersmaychangeduetocorrectedtrim/limiterQCdecisions;
existingexportedfilesuntouched. Nativefinishpresets/monitorgain/seamlessAB/
ApplyDiscardUndo/decodedformats/nativeintegration/vocal-liveacceptance remain.
Fullfamilygame/load/installed/releasegatesremainactive. Sourcecandidatepending
familyconsumerchecks/review; no Sam input blocker.

## Prepared native Finish comparison foundation (candidate after PR100)

Implemented: two aligned, already rendered PCM tracks share the existing native
sample clock. One generation-checked A/B command crossfades over 10 ms without
restarting transport or output. Neutral-path validation rejects processing,
loop/metronome, transforms and boost gains. Prepared audio bypasses the ordinary
centre pan/master attenuation and soft limit already present in its source WAV.
The existing AudioEngine owns playback; its project mixer/cache refresh path is
excluded during this bounded monitor. Stop, edits and delayed capability/start
requests retain the existing ownership guards. Old native versions fail closed.

Original, 30 Hz tidy, gentle 25 Hz/1.3:1 glue and managed-effects bypass proposals
use existing FX. Source/user FX stay intact; replacing managed effects removes
only their automation and one normal Undo restores the complete prior project.
Matching attenuates to the quieter measured LUFS with shared -1 dBTP headroom;
monitor gain is never written to the project. Measurements remain estimates.

Tested: DAW full 1216/1216, then added automation/Undo regression passed with
contract check (6/6) and TypeScript. Rust full 208 passed, 3 pre-existing ignored;
Clippy/build, manifest108, tooling7 and security governance pass. Native PCM test
reproduced extra centre-pan attenuation before fixing it; final 44.1/48 kHz
samples preserve phase/level across rapid A/B reversals and continuous frame
count. Native command rejects stale generation/stopped playback. No physical
output/listening acceptance inferred. Capture fingerprint unchanged at e4ec7e55
(full value in retained fingerprint output); microphone omitted for this slice,
not passed. First unscoped Vitest invocation included a Node tooling suite and
lacked the browser path; corrected manifest-driven full run passed. Logs retained.

Not yet implemented by this foundation: preparation/analysis worker, long-song
cancellation responsiveness, measured rendered-output warnings, UI Apply/Discard,
preview/export decoded parity and installed acceptance. No public release,
installer build, new dependency/account/licence/security change or Core npm.

## Finish workflow and cancellable file-backed preparation (candidate after PR101)

Implemented: Export/Finish UI prepares Original vs subtle tidy/glue/managed
bypass without autoplay or source mutation, exposes visible passage/lead/tail,
optional listening cues, estimated decoded-PCM LUFS/true peak and actionable
warnings, A/B/Stop/Apply/Discard/one existing Undo. Stale project/selection/settings/
transport and delayed commands cannot promote old proposals. Native monitor v2
adds ordered side changes so a late older A/B command cannot override the latest
choice. Recording blocks preparation/play/apply; shared capture plumbing unchanged.

Prepared prefix WAVs use the existing native DSP worker and owned cache IDs,
max two 128 MiB files and existing 600-second history limit; audible passage <=120
seconds. Binary Response IPC plus transfer-to-worker avoids JSON preview sample
arrays. Core analysis runs off UI/live callback; Abort terminates its worker and
native render checks cancellation between128-frame blocks. Current decode/bank/
plugin setup completes its operation first. Ready files are removed on discard/
shutdown; next reservation sweeps only abandoned native-named preview files,
preserving active/unrelated files. No project media/source file write. Explicit
bounds and conservative meter labels retained.

Real additional export bug: actual command adapter coerced requested float32 to
PCM16. New actualworker regression FAILED oldadapter (format1 vs3), then passed
corrected adapter byte-for-byte against direct float renderer. Defaults16/24
unchanged; explicit float/dither intermediate now retains precision. Renderer
contract v46-float-preview-80005e03 includes the bitdepth adapter. Final normalized/
encoded output still requires decoded reanalysis; preview readings are not final
file readings.

Tested: final full DAW1226/1226, Rust213pass/3existingignored, fullbrowser39/39
(including8Finish checks), types/build/Clippy, manifest111/tooling7, repository/
security/workflowpins/soundprofile6surfaces/whitespace. Native cancellation test
stops at128frames, no partial WAV. File persistence never overwrites existing
files; cleanup preserves active/unrelated entries. Actual float worker counterexample
log retained. Browser command fixtures establish control behavior only; real
production worker transfers/analyzes five-minute48k stereo115200044-byte PCM,
completes with continued UI heartbeats and cancels after actual analysis starts.
Observed completed runs ~6.1-7.2sec and UI maxgaps109.5-138.3ms (diagnostic,
not universal budgets); raw final reports retained. Tests requiring production
static transport explicitly skip without it; skipped is not passed. Screenshot
inspection caught narrow-column clipping; full-width row/scroll preservation and
all-control/readings reachability now pass at1100x720 and800x600stress.

Capture fingerprint exact e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770;
microphone scoped omission, notpass. Documentation:
apps/pocket-daw/docs/FINISH_COMPARISON_2026-10-16.md. Pending: combined real native
preset/render/monitor integration, real vocal/live listening, decoded normalized/
encoded output parity/reanalysis, installed Windows/WebView/scaling/device and
remaining family acceptance/review/release targets. No installer/publication/new
accounts/dependencies/licence/security changes/Core npm. No Sam input blocker.

PR101 exact60b7c9f5a844887fb0f7cae1490dba6c882cf44f hostedCI38813156609 and
CodeQL38813156556 terminalgreen; scoped skipped jobs remain skipped. Parent source
review not inferred. Website editorial commit b2469ac41f721074868b89d1fbab9ccfea56e34f
must be preserved from fresh website main for any later product-bundle publication.

## Actual native Finish monitor and written WAV verification (candidate after PR102)

Reproduced two format gaps: actual native float32 output was rejected by Core's
shared decoder (format3/bits32); explicit stereo PCM16 conversion incorrectly
returned a float32 blob through a presumed-16-bit fast path. Core now reads
IEEEfloat32 without losing precision/stereo/overrange/nonfinite diagnostics,
retaining PCM16/24 behavior. DAW conversion honours explicit16 while retaining
normalPCM16 passthrough with only44headerbytes inspected. Two prior IPC-contract
fixtures used invalid4byteRIFF placeholders; replaced with valid48byteWAV headers
rather than accepting corrupt transport. No musical renderer/source/schema change.

Actualnative Original/tidy/glue rendered from retained99 generated recorded-media/
Campfire/FX/automation fixture, full8.8568125s48k/425127frames. Extended existing
ignored test transport captures actual prepared-monitor DSP plus atomic side
commands (producerclock only): maxPCMerror4.0978193283081055e-8/RMS1.3039068936530938e-9,
continuous switchpositions/framecounts/generation and rapidreverse. Reanalyzed
matchedpassages both-30.174001LUFS. Seven actualwrittenWAVs(stereo16/24/float32,
mono16,16/24TPDF,normalized24) decode withcorrectformat/channels/frames andPCM
quantization/dither bounds.7/7externalLUFS+7/7explicit4xfloat64TPpass FFmpeg9,
worst0.026009LU/0.008178dB. Normalizedsamplepeak0.95 producesestimated+0.271217dBTP
andrealheadroomwarning; provesfinaldeliveryanalysisneeded. This verifiesoutputQC,
not yetexportUIpresentation. NonWAVformatsremainstaged.

FullCorebuild212/212, DAW1228/1228/types/build, Rust213/3existingignored+Clippy,
actualnative4rendercaptures, Chordsmith/DJunchangeddeterministicHTMLfreshness/size,
repo/security/workflowpins/sound6/whitespacepass. CoreGoldensunchanged; no updater
run. Earlier firstharnessassetmissingname/error andcounterexamples retained,
notpasses. Currentraw actualsuccesslocal-artifacts/scratch/validation/native-finish/
run-avkZJ0, sharednative-finish-*.log; seeNATIVE_FINISH_PCM_VALIDATION_2026-10-16.md.
No installedTauriIPC/physicalrecording/deviceconsumed/humanvocal-liveacceptance;
noinstaller/publication/deps/accounts/licence/securitychanges/CoreNPM.
Remainingfinal-deliveryQCUI,explicitfloat32Godotruntimeacceptance,fullgameSFX/coldwarm/
working-setandcrossfamilyinteraction,installed/scaling/device/listening,versions/
advisories/review/publicationtargetsremainactive. Nohardenvironmentblocker.
102exact26f91469912063928b1f4c0309b21671839911dbCI38816510250/CodeQL38816510257terminal
green; scoped skippedjobsarenotpassed. Parentreviewnotinferred.

## Cold hydration ownership correction (follow-up to held PR102/103)

Parent review found successful cold audio hydration installs replacePresent's
clone but callback passed the original object; strict owner identity rejected
both Finish and contextual audition before native preparation. Reproduced old
first-use Finish and audition failures with saved external generated WAV media.
Fix returns currentProject(this.state) after replacement to both existing owner
callbacks and autosave. Strict cancellation/identity guards are unchanged.

Six new browser regressions pass: first cold FinishReady/noautoplay, reopened
cold media/Ready, oneApplyUndo, cold firstauditionPlaying, delayed read after
concurrentStop/edit forbothflows (six testcases with combined assertions).
Focused relatedbrowser16/16 +fullDAW1228/1228/types/build/repo/security/whitespace
pass. BrowserusesrealAudioContextdecodeofgeneratedWAV andmockednativefile/command
transport; no physicalrecording/nativeDSP/device/listening claim. Old2failure
counterexample log retained; corrected reports underlocal-artifacts/scratch/
validation/hydration-owner. Existing Core/Rust/long-worker/otherbrowser checks
notrerun for this narrowUIownership correction. Captureplumbing unchanged.

Review status:101foundation and103incremental source accepted, but102/103stack
held until this correction is independently reviewed. Preserve alloldheads.
Hosted103browser37passed/2skipped, NOT39hostedpasses; prior39-pass heartbeat/
long-worker evidence is local and remains separate acceptance. Newshortfull
checklist docs/POCKET_AUDIO_CURRENT_CHECKLIST.md.

DeliveryQCWIP preserved in exactstashf3a578b56b1708db7e26295e47eba584fb03efe9 on
codex/daw-delivery-qc-20261016. Resume onlyafterintegratingthiscorrection; it has
noUI/committeddeliveryQCclaim yet. Rest of originalfamily task remainsactive.
No installer/release/merge/deps/accounts/licence/security/CoreNPM change.

## Hydration accepted; final-download WAV QC source slice

PR104 exact65534010c704fdb3633a8a549db1f7d8b1d4fd7b independently accepted;
source owner/clone blocker cleared. Exact CI38820399984/CodeQL38820399393 success;
hosted browser43passed/2long-worker skipped, frontend1228passed/types/build.
Syntheticmerge dbedf69f102f7dac8727c27de739124b6e3f8528 into unchanged103head.
Installed/device/listening/fullfamily gates remain open.

Delivery QC resumed on isolated branch based104; originalstashf3a578b retained.
Full WAV hands immutable finalBlob todownload and a cancellable dedicated worker,
measures full output afterchannel/depth/dither/normalization, showsformat/frames/
estimatedLUFS/truepeak+existing measuredwarnings, optionalWebCryptoSHA/reportJSON.
No autoplay/projectprocessing/passlabel; successfulcheck meansanalysiscomplete.
128MiB/600sec/mono-stereo/8–192k limits explicit; busyplayback/capture defers/cancels;
cancel/retry/latestgeneration preservedownload. PartialDOMrefresh preservesfocus/
unfinishedtailinput; projectchange labelsoldfile. Ordinary coldexport hydration
nowrejects lateedit replacement. CoreWAV rejectsinvalid frame/rate metadata.

Local Core213/213, DAW1235/1235, typecheck/build, targetedbrowser22/22 including
two real long-worker checks. FinaldownloadedfixturePCM/report decoded independently;
one initialbrowserdownloadcanceled, isolatedretry+whole22rerunpassed, failurelog
retained. FixturegeneratedPCM/mocknativecommands isnotnativeDSP evidence.
800x600 controls/readings reachableinexisting scrollarea/nohorizontaloverflow.
Prior103realnative seven writtenWAV/reference evidence reused separately; no new
Rust/native/installed/device/humanlistening run. Capture fingerprinte4ec7e55...
unchanged; mic scoped omitted, NOTpassed. SeeDELIVERY_WAV_QC_2026-10-16.md.
Fullgamefloat32/runtime/loadbudgets, remainingcrossfamilyBeatStitch/Hear/phoneUX,
dense/scaling/installedPCM/devices/listening, versions/advisories/review/publication
remainactive. No newinstaller/merge/release/deps/account/licence/security/CoreNPM.

## Godot imported worker preparation and measured runtime limits

PR105 deliveryQC exact158b7f11623a22dc3ab4442927ea12b875edd272 remotelyconfirmed
draftattached; CI38822567029/CodeQL38822567991 terminalsuccess. Source review
pending; no publication. PR104coldhydration independently accepted asabove.

Update: PR105independentlyacceptedsource; all13CIjobsandbothCodeQLlanguagesgreen.
HostedCore213/DAW1235/browser47passed2longworkersskipped. Decoderdoesnotvalidate
enclosingRIFFlength; nonblockingforown-exportQC, notgeneralfilecertification.

Newisolatedcodex/godot-runtime-audio-budget-20261016 source usesGodot'sthreaded
loader for importedres stems in explicit section/globalnativearrangementasync
preparation. Existingplayers/clocks/PCMending policyretained. Rootownedjobsdrain
requestedI/O aftercancel/exit/free; consumerdetachwhilealivefixesreproducedfreed
coroutine/profileleak. Explicit/profile/inplace/exitcancelrejectoldcachepromotion.
CancellationdoesnotabortGodot'salreadyrequesteddiskoperation. RawWAVdecodeand
preparedPCMguardcopy stillsynchronousandmeasured, neverclaimed16msguarantee.
19regressionchecks passedinclglobalnative/noautoplay/samePCM/dedupe/warmidentity/
cancel/exit/free/missingassets; verbosefinalnoobjects/resourcesleaked. Initial
invalidtesttype/free-locked-object/too-earlycleanup assertions retainedasfailed
experiments,notpasses. Onehungisolatedtest stoppedonlyafterexactPID/pathverification.
FullGodotregressionand141entryaddononlypackagegatepassed; no newreleaseZIP claim.
Finalgate afteracceptancedoc/testwaitupdate passed142addononlyentries; no new
runtime/native/recording changesafterthatgate.

Original8x60sPCM16/48kstereosyntheticfixture shows29-31mscolddisk+preparation;
threadedreprotool shows19.837msremainingmainprep/21.113msmaxcoldframe,0.435msmax
warmPlay,8residentstreams92,164,224logicalPCMbytes. Headlessbaseline/music/SFX
maxframes17.708/16.758/16.700ms,23SFXrequests/nonzerobusPCM. RenderedWASAPI/NVIDIA5050
GL3.3driver610.47baselinealready604.347msmax/513.332msp95;renderedframebudgetFAILED.
One60HzframecoldpreparebudgetFAILED; warm2ms/headless33ms/fixturePCMboundpassed.
Thesearemeasuredsyntheticlimits,notfullgame/peakworking-set/longsession/listening.
Reproharnessscripts/verify-godot-audio-budget.mjs retainsrawarrays/inputhashes/logs;
initialSFXprobehadfullcapturebufferfrombaselinephases,correctedexplicitdrainand
retainedfailedzeroprobe,nofalseSFXpass. No graphics/securitysettingschanges.

Actualretainednativefloat32fullmix compatibilityfixture (productionpackstillPCM16)
playedfull425127frames8.8568125sec48kthroughhighlevelnativechartin4WASAPIroutes.
GodotconvertsfloatWAVtoPCM16;max3.05148e-5/RMS1.33918e-5,boundednotfloatbitexact.
Unchanged16bitlayersmax1.654e-6/RMS2.975e-7; allnaturalending/silencemutantsrejected.
Captureisenginebusnotdeviceconsumed/humanlistening/installedDAW/physicalmicrophone.
Sourceactualgeneratedrecordedmedia+Campfire/FX/automation/tailretained. See
addons/pocket_chordsmith/docs/RUNTIME_AUDIO_ACCEPTANCE_2026-10-16.md forscope,
failedbudgetsandremainingfullgame/scaling/interactions/installed/review/releases.
Public4.4advertisingvs4.6.3testingstillreleasegate. No version/licence/accounts/
credentials/securitysettings/dependencies/CoreNPM/productpublicationchanges.

## PR106 hosted blockers: reproduced and corrected in follow-up

Preserve106head844370fb1afcf338186f129a7b55dbf075120534. ExactCI38825154382
browser45pass2fail2longskip; CodeQL38825154407 bothlanguagespassed. Godotjob
116730818455 printedSCRIPTERRORpreviouslyfreedinstance at_free_subject:122 then
failures[]/19checks/exit0. ItsnominalgreenisINVALID, notclean19/19acceptance.
Downloadedexactbrowserartifact12014607942 andGodotstdout, retainedlocally.

BrowsertraceappRenderCount10->11->12whileQCfieldfocused; secondreadyFinishcontrol
detached. Deterministictwo-backsignalreproholdsactualnative startupstarter-sounds/
VSTbeta repliesuntilfield/Finishready, thenreleases. Oldsourcefailsboth; captured
stacksidentify initializeSoundLibrary andrefreshVst3Foundationfullshellrender.
CorrectionkeepsstateupdatesbutdeferspassiveshelldiscoveryreplacementwhileExport/
Fileisactive; nextintentionalrenderusesfreshstate, openAddTrackrefreshesnow.
No testsweakened; existinginput/focus/value/renderCountandcontrolreachability
assertionsretained. Newcontrolledregressionspassandrelated24browserpassedincl
2reallongworkers. Broaderstartup/UI/fullfrontendcheckscompleting.

Godotcorrectionusestestconductorfactory+delayedcompletionjob:realrequeststarts,
completionheldthroughconsumerdetach/free, explicitpending/already-freedassertions
beforecompletionrelease, theneventualcleanup. Defaultproductionfactoryunchanged
jobclass.22targetchecks+fullfailclosedGodotgate142addonentriespassedlocally.
Gate+measurementrunner nowrejectunexpectedSCRIPTERROR orobject/resourceleakseven
exit0.6Nodeguardregressionspass, realhostedexceptionreplayisrejected; all26root
toolingtests passed. Existingordinarywarningsnotmisclassifiedasexceptions.
Previousperformancefailedtargetsandfloat32->PCM16boundedcompatibilityretained,
no newruntimePCM/device/listening/fullgameclaimfromthisgatelifecyclecorrection.

Capturefingerprinte4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770
unchanged; mic scoped omittedNOTpass. FirstDAWfullrun1221pass14unrunbecausebrowser
pathenvmissing, corrected14browser-paritytests passed; fullcleanrununderway.
No Core/Rust/music-PCM/installed/physical/listeningrerunorpublication.
ChordsmithcontextWIPstashedb62bcdcf4b5de65201187a80eab167ad635f28e0 onexistingbranch
codex/chordsmith-contextual-audition-20261016:16desktop/touchbrowserpass;unitTEMP
EPERMblockedrunnotpass. OriginaloldQCstashf3a578b retained; ownerworkpreserved.
AlloriginalfamilyUI/interaction/game/installed/version/advisory/review/publictarget
gatesremainactive. No Horde/spend/accounts/credentials/licence/securitychanges.

Final localcorrectiongates: cleanfullDAW1235/1235 and fullbrowser51/51 (including
2reallongworker checks, no skips) passed.22controlledGodotlifecyclechecksandfull
failclosedGodot142-entrygatepassed; roottooling26/26including6newparsertests;
typecheck/build/repo/security/governance/pins/manifest112/whitespacepassed.
Nativecapturefingerprintunchanged. Fullbrowserbroadeningjustifiedbychangedglobal
startup/discoveryUI, includinglibrary/narrowlayouts, notcount-onlyreruns.
Earliermissingbrowserenvfailureandcorrected14targetrunretained; finalcleanrun
supersedesitwithoutcallingunruncheckspassed. Source/exacthostedreviewpending.
