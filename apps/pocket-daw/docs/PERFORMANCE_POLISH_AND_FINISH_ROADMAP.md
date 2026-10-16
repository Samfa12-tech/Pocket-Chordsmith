# Pocket DAW Performance, Polish and Finishing Roadmap

## Scope and priority

This is a proposed delivery sequence, not a release date or a new version promise.
It refines the foundation-first order in [North Star](../POCKET_DAW_NORTH_STAR.md)
and the [public roadmap](../../../docs/public-roadmap.md), without dropping
existing release, updater, media-portability, recording or game-pack commitments.

Owner priorities (2026-10-12):
1. Reduce interaction hitching and pauses during preparation. Cache work is a
   suspected contributor, not a diagnosed cause.
2. Polish finicky controls, button ordering and stacking/overflow that can push
   controls offscreen. These are owner reports; record reproducible cases before
   claiming a particular defect is confirmed.
3. Tighten Godot in-game performance and faithful sound from both Chordsmith and
   DAW exports.

Recommended additions are the focused Finish & Export workflow and reliability
regression coverage below. AudioMaster is inspiration for approachable finishing
UX only; this plan does not propose copying its code or importing its engine.

Baseline inspected: main `0c6975cadcd4aba0047ab94170a2adabc722517f`.
[Current release status](CURRENT_RELEASE_STATUS.md) records public/exact-installed
0.6.50 and source-only 0.6.51. Future evidence must identify its actual source
commit and installed artifact rather than imply this planning work was shipped.

## Audit follow-through: 2026-10-12

Current source-candidate progress is tracked in the
[15 October implementation ledger](../../../docs/POCKET_AUDIO_UPDATE_LEDGER_2026-10-15.md).
The table below preserves the planning baseline; source checks, installed
acceptance and publication remain separate in that ledger.

The [full dated audit](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md) preserves 13 source-reviewed findings,
commit-pinned evidence, existing mitigations, proposed fixes, regression risks
and validation plans at source `0c6975cadcd4aba0047ab94170a2adabc722517f`.
It is a static investigation, not proof of the reported hitches, measured
performance, successful runtime tests, an implemented fix or a shipped release.

Use this ledger when implementation resumes. Priority expresses investigation
order, not proven impact; collect the baseline first and keep fixes bounded.
Start with CACHE-02, then unchanged-playback/UI work, bounded reuse/cancellation
and measured stream continuity. Reproduce GODOT-01 and GODOT-02 before making
game-audio fidelity claims. UI-04 and larger export ownership changes follow
measurement. All entries start at **source-reviewed / test pending / fix pending**.

| ID and evidence | Priority | Next test and smallest candidate change | Runtime test | Fix | Verified update / evidence |
| --- | --- | --- | --- | --- | --- |
| [CACHE-01](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#cache-01) | P0 / staged | Measure restart/output gaps; prepare a safe stream/graph replacement preserving clock, tails and rollback. | Pending | Pending | None yet |
| [CACHE-02](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#cache-02) | P0 / first | Test Play–Stop–Play residency and retry counters versus Pause–Resume; reconcile confirmed native clears and bridge hints. | Pending | Pending | None yet |
| [CACHE-03](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#cache-03) | P0 | Warm, stop/pause, edit one lane and rebuild; retain bounded valid reusable assets without allowing stale playback. | Pending | Pending | None yet |
| [CACHE-04](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#cache-04) | P0 | Defer a stem render, edit/switch project and assert obsolete jobs stop dispatching; retain latest-state correctness. | Pending | Pending | None yet |
| [CACHE-05](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#cache-05) | P0 / early | Count unchanged-tick hash/compile work; reuse immutable revision facts and cover every sound-affecting invalidation. | Pending | Pending | None yet |
| [UI-01](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#ui-01) | P1 / early | Assert stable studio/input nodes while typing, IME, filters and keyboard shortcuts; patch only result regions. | Pending | Pending | None yet |
| [UI-02](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#ui-02) | P1 / early | Measure DOM query counts and stable readout children; validate add/remove/reorder, recording and accessibility. | Pending | Pending | None yet |
| [UI-03](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#ui-03) | P1 | Trace dense automation IPC and producer contention; batch/coalesce with generation ordering and compact status. | Pending | Pending | None yet |
| [UI-04](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#ui-04) | P2 | Profile regions × cache-items traversal; index metadata and prove unchanged visual output across seek/loop/cache swaps. | Pending | Pending | None yet |
| [GODOT-01](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#godot-01) | P1 / correctness first | Use audible A/B/repeated-section fixtures, seek and loops; make audio-set time origins explicit. | Pending | Pending | None yet |
| [GODOT-02](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#godot-02) | P1 / correctness first | Compare actual PCM/full mix and branch overlap; define alternative groups, gain, normalization and shared-FX semantics. | Pending | Pending | None yet |
| [EXPORT-01](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#export-01) | P2 / measure first | Profile IPC/peak memory for 4/16/32 stems; reduce copies or use native streaming while preserving export PCM and cancellation. | Pending | Pending | None yet |
| [GODOT-03](PERFORMANCE_AND_GODOT_AUDIT_2026-10-12.md#godot-03) | P1 | Measure cold/warm real-game transitions and teardown; prepare ahead with explicit readiness and bounded working sets. | Pending | Pending | None yet |

Session checklist:
- [ ] Reconcile each finding with current main and the installed build; record
  source changes since the pinned audit before assuming it still applies.
- [ ] Capture small/large owned fixtures and hardware/device/sample-rate/buffer
  settings; retain hashes and private fixture evidence without publishing audio
  or personal project paths.
- [ ] Add focused failing regression tests or a repeatable profiler/PCM capture.
  Record UI long tasks, native preparation, underruns/output gaps and memory
  separately. A source-level pattern is not itself a measured user-visible cause.
- [ ] Implement and review one bounded slice, preserving native-clock authority,
  valid cache invalidation, plugin isolation, effect tails and failure recovery.
- [ ] Run applicable source gates and actual Windows/Godot target checks; retain
  before/after traces with the same fixtures, explicit tolerances and limitations.
- [ ] Update the row with outcome (confirmed, narrowed, disproved or deferred),
  regression-test paths, fix PR/commit, exact runtime evidence and remaining work.
  Mark a fix verified only after its acceptance evidence exists; preserve the
  original audit as historical evidence rather than silently rewriting it.
- [ ] Keep test/fix completion separate from release/publication status. Follow
  the existing receipt-bound release process only when a release is intended.

## Next-update instrument slice: Campfire Acoustic

The [canonical Campfire Acoustic plan](../../../docs/CAMPFIRE_ACOUSTIC_NEXT_UPDATE_PLAN.md)
records the requested Towtal Chaos guitar addition across Core, Chordsmith, DJ,
native DAW and Godot. It is planned, with implementation and acceptance pending.
Keep the audit ledger and P0/P1 order intact; resolve blocking cache/timing issues
before adding the sound. DAW acceptance includes native live/offline rendering,
versioned cache invalidation, full voicing/strum/picking intent, installed listening
evidence and exports that agree with the reference. Godot uses prepared stems for
production parity, with optional native preview work separately gated.
This documentation does not start a build or alter release status.

## P0: Find and remove preparation hitches

The first outcome is responsive editing and transport interaction, not a generic
FPS or render-throughput target. Preserve the native Windows Tauri/Rust/CPAL
architecture and native sample-clock ownership.

Start from [native cache policy](NATIVE_RENDER_CACHE_POLICY.md),
[cache implementation](../src/audio/nativeRenderCache.ts), and existing
[cache tests](../tests/nativeRenderCache.test.ts). Signatures, reuse, invalidation,
stale-build rejection and cache diagnostics already exist; improve measured
bottlenecks rather than introduce a competing cache.

Acceptance:
- [ ] Capture repeatable small and representative large sessions with generated
  instruments, imported audio, MIDI, sample devices, FX and hosted plugins.
  Record track/clip/event counts, media sizes, project identity and hardware,
  Windows build, audio device/driver, buffer and sample rate.
- [ ] Trace cold and warm project open/import, first and repeated Play, seek,
  loop, source/instrument/sample changes, editing, undo/redo, save/reopen and
  export while interacting. Include cache miss, invalidation, eviction,
  hydration, rebuild and unchanged-project reuse.
- [ ] Break end-to-end action latency into UI work, serialization/IPC, queue wait,
  decoding, hashing, render/preparation, disk I/O and promotion. Correlate visible
  stalls with main-thread long tasks and existing build/hit/miss/discard counters;
  distinguish actual audio interruption from a stalled display.
- [ ] Record distributions and worst observed stalls, audio callback/underrun or
  dropout evidence, playback-start latency, CPU, memory and export load. Publish
  baseline traces and profiler findings, then set explicit regression budgets
  on named supported Windows test hardware. Do not promise arbitrary latency,
  track-count or zero-dropout figures before measurement.
- [ ] Use profiling to choose bounded background work, incremental reuse or job
  scheduling changes. Keep progress, Stop/Cancel and core navigation responsive;
  cancel superseded work and reject stale/version-mismatched results. Never
  promote an old project/instrument render after a later edit or project switch.
- [ ] Demonstrate unchanged source reuse without unnecessary rebuilds, bounded
  cache/decoded-buffer memory, correct eviction recovery and correct invalidation
  for sound/timing changes. Warm-cache speed must not hide a broken cold start.
- [ ] Retain before/after traces for the same fixtures and installed workflow;
  verify resulting sound, timing, saves and exports remain correct. No expensive
  preparation, allocation or blocking I/O may be moved into the audio callback.

## P1: Make the existing UI dependable

Build on the current studio rail, transport, docks and command layer rather than
adding more permanent buttons. Use the [function/action catalog](POCKET_DAW_ACTION_CATALOG.md)
to keep shortcuts, menus and toolbar actions consistent.

Acceptance:
- [ ] Turn the owner's examples into a small reproduction matrix: action order,
  selected track/clip, open docks, window dimensions, Windows display scaling and
  screenshots. Test the actual installed Windows app, not only browser dev mode.
- [ ] Define and document supported minimum and typical window sizes/scales;
  test minimum, common laptop and large displays, resize/maximize/restore, and
  display-scale changes with dense sessions, long names and expanded tools.
- [ ] Keep primary transport and current-context actions reachable. Use deliberate
  wrapping/overflow/scroll regions and predictable button ordering; opening an
  inspector or lower dock must not push essential controls offscreen.
- [ ] Test popover/menu/dialog anchoring, clipping and z-order near every edge,
  overlapping panels, repeated opening, scrolling and resizing. Dismissal and
  Escape restore sensible focus; controls cannot remain hidden behind overlays.
- [ ] Verify keyboard navigation, visible focus, tab order, shortcuts while text
  fields are focused, selection retention and consistent destructive-action
  placement. Preserve clear visual hierarchy between primary and advanced tools.
- [ ] Add focused layout/interaction regressions for confirmed cases, retain
  installed screenshots, and check that UI fixes do not restart playback,
  rebuild unchanged caches or lose unsaved edits.

## P1: Prove game-audio fidelity and runtime cost

Use the existing [Godot performance roadmap](../../../addons/pocket_chordsmith/docs/PERFORMANT_AUDIO_ROADMAP.md#priority-validation-track-game-performance-and-two-source-fidelity)
as the acceptance checklist. It covers Chordsmith/Core-rendered and native
DAW-rendered exports separately, deterministic fixtures, listening A/B, loop and
transition correctness, cold/warm loading, bounded memory and representative
real-game testing. A headless import or audible editor preview alone does not
prove the shipped game experience.

Retain the existing [game-pack smoke](GAME_PACK_EXPORT_SMOKE_CHECKLIST.md) and
[release fast path](RELEASE_TESTING_FAST_PATH.md). Push-to-Godot/native destination
selection remains after reliable ZIP/target smoke; deeper ASIO, simultaneous
multitrack capture and broad editor expansion remain later foundation-dependent
work, as already planned.

## P2: Finish & Export with existing Pocket DSP

Reuse the [master chain](../../../packages/pocket-audio-core/src/mastering/master-chain.js),
[QC](../../../packages/pocket-audio-core/src/mastering/qc.js) and
[release-mastering work](../../../docs/POCKET_RELEASE_MASTERING_STATUS.md).
This is an accessible native DAW workflow around existing capabilities, with a
validated native integration where needed, not a second DSP engine or a browser
DAW. Existing lofi/album results do not establish general mastering readiness.

Acceptance:
- [ ] Offer a small optional set of subtle starting presets and an obvious dry/
  bypass path. Explain the actual EQ/dynamics/limiting changes and keep original
  project/source audio intact. Never apply hidden normalization or chase loudness
  at the expense of intentional dynamics.
- [ ] Provide genuine loudness-matched before/after audition: same passage,
  alignment, channel path and measured comparison gain, with seamless switching
  and clearly separated monitor-only compensation from exported processing.
  Validate the matching method and disclose uncertainty until calibrated.
- [ ] Derive meter readings and warnings from actual processed/rendered audio,
  not preset labels or invented values. Cover clipping/non-finite samples,
  silence, true peak, loudness, dynamics and stereo/mono checks as appropriate.
- [ ] Calibrate LUFS and true-peak fixtures against an independently trusted
  reference: silence/short clips, gated signals, intersample peaks, transients,
  stereo/phase-heavy material and supported sample rates. Record reference
  version, fixture hashes, error tolerances and pass/fail evidence before making
  calibrated or release-grade claims. Core currently reports
  `estimated_pending_external_calibration`; keep that limitation visible.
- [ ] Prove preview/export agreement for the same settings, automation, gain,
  tail and channel treatment; decode/reanalyse the written export rather than
  treating a successful save as audio QC. Include vocals/live instruments and
  non-lofi material alongside existing generated fixtures.
- [ ] Preserve existing WAV 16/24-bit PCM, 32-bit float, channel/sample-rate,
  peak-normalization and Off/TPDF behavior; dither only at applicable final
  fixed-point conversion. FLAC/MP3/Ogg/Opus remain in the existing
  [multi-format plan](MULTI_FORMAT_EXPORT_PLAN.md), not duplicate new projects.
- [ ] Present export scope, destination, progress, cancellation, warnings and a
  concise result summary clearly; unsupported settings fail visibly rather
  than silently changing the sound or output format.

### Selection-scoped preview and feedback refinement

Apply the [cross-family hear/compare/keep interaction](../../../docs/public-roadmap.md#next-update-workflow-refinements-hear-compare-keep)
to selected loops and edits after the P0/P1 work. Extend the existing
[MIDI transcription/arrangement preview and one-command undo](MIDI_IMPORT_AND_CHORDSMITH_CONVERSION_PLAN.md#implemented-source-checkpoint--2026-07-14);
do not replace it or describe preview/undo as missing.

- [ ] Audition original/proposed versions at the same musical position using the
  native sample clock and the loudness-matching contract above. Keep comparison
  gain monitor-only; expose unavailable/uncalibrated comparisons honestly.
- [ ] Pair evidence-based feedback with an optional short listen-for A/B and a
  reversible action or manual override. Apply is one undoable edit; Discard leaves
  the source untouched. Verify Stop/Cancel, stale preview rejection, selection
  retention and bounded preparation without new cache churn or playback gaps.

## Cross-cutting reliability gates, not new feature claims

These are targeted recommended regressions around existing foundations.
Do not describe autosave, undo, portable media or plugin isolation as absent.

- [ ] Exercise edit -> undo/redo -> save/reopen across cache completion,
  cancellation and project switches. Inject failed/partial saves and missing
  media; retain the last valid project and actionable recovery state without
  claiming a failed save succeeded. Extend existing media-portability coverage.
- [ ] Extend the existing [VST3 crash-isolated host](VST3_BETA_FOUNDATION.md)
  and [compatibility matrix](VST3_COMPATIBILITY_MATRIX.md): scan/instantiate
  failure, hang/crash during playback/export, editor open/close, state save,
  reload and project shutdown. Verify bounded recovery/bypass, no stuck notes,
  orphaned sidecars or lost project/plugin state. Do not add another host.
- [ ] Audit capability and error UX at import, plugin, recording and export
  boundaries. Test known unsupported combinations against real capability
  reports so users see what is unavailable and why, with no silent fallback or
  misleading "supported" claim.

For each implementation slice, link its fixtures, source tests, exact installed
or target-runtime evidence and remaining limitations here. Use the ordinary
source checks from AGENTS.md; package/release only through a separately intended
release and the existing receipt-bound fast path.
