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
