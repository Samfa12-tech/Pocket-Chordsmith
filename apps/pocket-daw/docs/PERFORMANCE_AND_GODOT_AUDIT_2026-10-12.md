# Pocket DAW: responsiveness, simplification and Godot audio audit

12 October 2026 · Source review at commit `0c6975cadcd4aba0047ab94170a2adabc722517f`

## Conclusion

There are credible implementation-level reasons to investigate the reported hitches. The best next step is a small measured reliability/performance pass, not another engine rewrite or more caching layers. This review identifies 13 investigation areas across cache lifecycle, UI/native control work, export memory and Godot playback. Several expose concrete state or timing-contract inconsistencies; their contribution to the reported pauses has not been measured.

**Scope:** static review of source, call chains and existing tests. No app execution, profiler, test suite, install or code changes. Source findings must be confirmed against the actual installed Windows build and representative projects. UI stalls, delayed preparation and audible dropouts are different symptoms and should be measured separately.

The [performance, polish and finishing roadmap](PERFORMANCE_POLISH_AND_FINISH_ROADMAP.md#audit-follow-through-2026-10-12) holds the prioritized test/fix ledger. [PR76](https://github.com/Samfa12-tech/Pocket-Chordsmith/pull/76) records the documentation change. This report does not add a release deadline or authorize implementation.

## Recommended order

1. **Reconcile explicit Stop with cache residency hints.** The exported Stop command clears Rust’s decoded cache while the TypeScript bridge retains its remembered revisions. Byte-backed assets can then trigger a failed metadata-only start and full-payload retry; file-backed assets may reread/decode directly. Pause and internal stream restarts are different paths. Start with a targeted lifecycle test and instrumentation before changing memory policy.
2. **Reduce repeat work in steady playback and ordinary UI actions.** Cache signatures are reconstructed during an unchanged native playback tick; meter lookups repeatedly scan the DOM; search inputs replace the entire studio. Use revision-based validation, stable UI nodes and scoped search-result updates. These are attractive small improvements with focused regression tests.
3. **Preserve reusable stem work and cancel obsolete work.** A stopped edit can discard the old cache before unaffected stems can be reused. Superseded builds reject their output only after completing their stem work. Separate current playback coverage from a bounded reusable asset store, and stop scheduling obsolete stem jobs.
4. **Measure and remove avoidable playback-stream replacement gaps.** Cache-window advances and cache promotion tear down and rebuild the native output stream. This is a real interruption mechanism, but actual audible gaps remain unmeasured. A prepared graph swap with the native stream kept alive is a larger, carefully gated change.
5. **Verify Godot section origins before performance claims.** Exported section loops start locally at zero, but their playback is given an absolute arrangement offset. Use an audible two-section fixture to verify onset/seek/loop behavior and make the audio origin explicit.
6. **Define faithful adaptive export.** Summing independently mastered or peak-normalized stems need not reproduce the mastered full mix. Drum aggregate and branch exports also need explicit alternative grouping. Keep a full-mix render as the reference and define the adaptive layer, shared-effects and gain contract.
7. **Reduce export copies and cold Godot transition work.** Whole WAVs cross IPC as numeric arrays; complete packs are retained and copied during ZIP assembly. Native file/stream ownership is the stronger long-term boundary. Godot cold stream loads are synchronous; existing prewarm APIs help but do not make them asynchronous.

## Simplifications worth investigating

- One native cache generation/residency contract instead of two optimistic notions of what is loaded.
- One prepared, immutable project revision for signature validation, compiled events and render payload reuse.
- A latest-generation cache build coordinator with bounded asset reuse and cancellation between jobs.
- Stable UI element maps and local result rendering rather than repeatedly rebuilding the application shell.
- Lightweight transport/control acknowledgments separate from memory diagnostics.
- Explicit audio-set origin and mix semantics in exported game packs rather than reconstructing intent from filenames or layer names.

These are simplification directions, not a request to rewrite everything at once. Preserve native-clock authority, effect tails, plugin isolation, valid cache invalidation, safe teardown and current keyboard behavior.

## First investigation session

Use a small and a large owned project, with exact build, device, sample-rate and buffer settings recorded. Compare cold Play, warm Play, Stop–Play and Pause–Resume; change one lane while stopped and while playing; type into the library during playback; cross a real cache-window boundary; export a representative multi-stem pack. Record UI long tasks, native start/restart time, cache decode/retry counts, obsolete stem work, IPC bytes, peak memory and audio output/underruns separately.

For Godot, use actual rendered audio fixtures from both Chordsmith and DAW. Test A/B/repeated-section offsets, seek and loop boundaries, cold/warm transitions and scene teardown in a real rendered game. Compare decoded PCM/reference mixes where appropriate and captured playback under controlled gain/sample-rate settings. Do not equate procedural preview or MIDI data with identical rendered timbre.

## Existing strengths to preserve

Native offline DSP already runs on a blocking worker, and the real-time CPAL callback consumes a ring buffer. Cache revision keys, bounded retention, preloading, stale-result rejection, restart coalescing and playback UI throttling already exist. The proposals below target gaps in those arrangements; they do not assume those safeguards are absent.

## Finding index and follow-through

Status on 2026-10-12: all 13 findings are **source-reviewed; runtime validation and fixes pending**. The IDs below are stable references; priorities and evidence belong in the [roadmap ledger](PERFORMANCE_POLISH_AND_FINISH_ROADMAP.md#audit-follow-through-2026-10-12). Preserve this source-pinned snapshot when later results confirm, narrow or disprove a hypothesis.

- [CACHE-01: Cache window advance and promotion recreate the CPAL stream](#cache-01)
- [CACHE-02: Stop clears native decoded cache but leaves the bridge's residency hints](#cache-02)
- [CACHE-03: Stopped composition edits discard the reusable stem cache](#cache-03)
- [CACHE-04: Superseded builds are rejected only after completing all stem work](#cache-04)
- [CACHE-05: Cache validation recompiles/hashes musical data on the UI thread, including every native tick](#cache-05)
- [UI-01: Patch library/search results instead of replacing the studio on every keystroke](#ui-01)
- [UI-02: Make live meters/readouts linear and change-only](#ui-02)
- [UI-03: Batch native mixer IPC and separate fast transport status from heavy diagnostics](#ui-03)
- [UI-04: Pre-index meter-only region classification](#ui-04)
- [GODOT-01: Section-local Godot loops are started with an absolute arrangement offset](#godot-01)
- [GODOT-02: Game-pack stems are not guaranteed to reconstruct the authored full mix](#godot-02)
- [EXPORT-01: Native export unnecessarily moves whole rendered audio into JS, and ZIP assembly duplicates the pack](#export-01)
- [GODOT-03: Godot cold loading remains synchronous at transition time](#godot-03)

## Detailed evidence and validation plans

The following sections include immutable source links, conditions, current safeguards/tests, minimal interventions and regression risks. No speedup percentages or confirmed user-visible cause are claimed.

# Pocket DAW loading/cache/preparation audit

Audited immutable commit: **0c6975cadcd4aba0047ab94170a2adabc722517f**, Samfa12-tech/Pocket-Chordsmith. The audit itself was a read-only source investigation: no application execution, installation, builds or tests. Subsequent documentation-only publication does not validate runtime behavior. Repository AGENTS.md, PROJECT_MEMORY.md, architecture and native-cache policy were read before source conclusions.

## Bottom line

The cache suspicion has credible code-backed candidates, but source alone cannot identify which caused the reported pauses. The strongest direct audio-gap candidate is **cache promotion/window advance stopping and rebuilding the native output stream**. There are also demonstrable cache-lifecycle inconsistencies, avoidable invalidation/recomputation, and non-cancellable old builds. Investigate the five findings below before adding more caches or changing the audio architecture.

Preserve native Windows Tauri/Rust/CPAL ownership. A delayed UI is not automatically an audio dropout. A slow cache build is not automatically work in the CPAL callback.

## Existing architecture and mitigations

- Native WAV/stem rendering already uses `spawn_blocking`; its runtime mutex is released before the full offline DSP/encoding loop. Moving this same loop off the window thread again is not a useful proposal. [src-tauri/src/native_audio.rs:1172–1226 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1172-L1226)
- CPAL output callbacks consume an output ring. A separate named native render thread generates blocks; it locks playback state, not the outer runtime mutex used by cache preload. Thus “decoding locks the audio callback” would be an unsupported claim. [src-tauri/src/native_audio.rs:1403–1439 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1403-L1439) [src-tauri/src/native_audio.rs:1454–1518 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1454-L1518)
- Native decoded assets have a 512 MiB retention budget, LRU eviction, revision keys and Arc pinning. Active memory can exceed the inactive-retention budget deliberately. Do not blindly evict live assets or interpret the limit as a total-memory cap. [src-tauri/src/native_audio.rs:1727–1849 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1727-L1849)
- Mixer-only controls have a fast path; playback pause/resume preserves the native session. Cold initial procedural fallback builds are deliberately deferred rather than always promoting while playing. [src/audio/audioEngine.ts:356–385 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L356-L385) [src/audio/audioEngine.ts:388–413 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L388-L413) [src/audio/audioEngine.ts:706–757 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L706-L757)
- There is 180 ms live-edit debounce, latest-pending restart coalescing, signature-based build deduplication, nearby asset preloading, payload windows, stale-result rejection and filtered stale-cache bridging. These are real mitigations, not missing features. Their remaining boundaries matter below.

## Relevant call chains and thread/data ownership

### Open a saved project
`openRawProjectText` parses, resets the project, writes autosave, renders UI, then starts native cache hydration without awaiting it. Hydration validates each stored item's source hash/path, sequentially requests WAV bytes, and materializes JS numeric arrays. Accepted cache is installed and nearby native assets are preloaded.

[src/app/App.ts:6487–6523 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L6487-L6523)
[src/audio/audioEngine.ts:235–249 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L235-L249)
[src/audio/nativeRenderCache.ts:385–438 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L385-L438)

The native cache read command synchronously checks size and reads the file; its result carries bytes. The TS bridge turns the returned numeric array into a Uint8Array/ArrayBuffer, then hydration turns it back into a number array. Persisted cache hydration currently reads every qualifying cache item, although subsequent native preloading/playback payloads are windowed. This is a concrete full-read/copy path, but not separately ranked without a memory/IPC trace.

[src-tauri/src/lib.rs:1364–1382 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/lib.rs#L1364-L1382)
[src/native/mediaBridge.ts:186–202 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/native/mediaBridge.ts#L186-L202)

### Start audio clips after reopening
App preparation shows a busy message and yields for paint, sequentially reloads missing timeline media, decodes it, updates waveform/analysis metadata, then prepares native runtime assets. Supported local original WAV paths avoid transferring their bytes again; other buffers may be encoded to WAV and converted to number arrays. Native start awaits asset preload, assembles payload, and invokes native start.

[src/app/App.ts:5358–5390 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L5358-L5390)
[src/app/App.ts:7157–7218 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L7157-L7218)
[src/audio/nativeRenderCache.ts:1412–1454 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L1412-L1454)
[src/audio/nativeRenderCache.ts:1537–1565 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L1537-L1565)
[src/audio/audioEngine.ts:728–746 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L728-L746)

### Generated cache build
Snapshot project → synchronously create per-clip/per-track build items and source hashes → sequentially render missing native stems → append runtime assets → accept only if project signature still matches → preload nearby assets → optionally promote via native restart. Scheduling the start with requestIdleCallback does not move synchronous TS hash/compile work to a worker.

[src/audio/audioEngine.ts:1023–1066 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1023-L1066)
[src/audio/audioEngine.ts:1146–1175 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1146-L1175)
[src/audio/nativeRenderCache.ts:114–186 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L114-L186)

## Five prioritized findings

<a id="cache-01"></a>

### 1. Cache window advance and promotion recreate the CPAL stream

**Static confidence: high. Causal confidence: plausible direct gap mechanism; audible duration and frequency unmeasured.**

A warmed payload window advances by `restartNativePlayback(... reason: "play-cache-window-advance")`. Fresh live-edit cache activation also restarts. The restart calls bridge `start`; Rust `start` immediately calls `self.stop()` before device selection, build_playback, asset decoding/graph setup, stream construction and `stream.play()`. Stop drops the current stream, signals the producer and joins it. This creates an explicit interval without the previous output stream. It also makes replacement failure consequential because the old stream has already been stopped.

[src/audio/audioEngine.ts:1280–1291 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1280-L1291)
[src/audio/audioEngine.ts:832–848 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L832-L848)
[src/audio/audioEngine.ts:786–805 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L786-L805)
[src-tauri/src/native_audio.rs:1365–1393 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1365-L1393)
[src-tauri/src/native_audio.rs:1411–1452 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1411-L1452)
[src-tauri/src/native_audio.rs:1523–1536 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1523-L1536)
[src-tauri/src/native_audio.rs:1710–1724 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1710-L1724)

**Conditions:** long cached sessions crossing payload windows; composition-cache promotion; transport/graph operations implemented as restart. Not every frame, every seek, or mixer move uses this route.

**Existing mitigation/tests:** windowing limits assets; preloading tries to remove decode from replacement; restart requests are coalesced; fallback event coverage is preserved. The window-advance unit test explicitly expects two starts, no new cache build, and a cache-window diagnostic. That is functional coverage, not native continuity evidence. [tests/audioEngine.test.ts:985–1052 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/audioEngine.test.ts#L985-L1052)

**Investigate:** first measure stop-to-first-output interval per restart reason with loopback capture. Then consider keeping the device/stream/output ring alive and swapping a prepared immutable playback graph at a native sample/block boundary; preserve native-clock authority and failed-swap rollback. Prepare before stopping as an incremental alternative where full stream preservation is too broad.

**Regression risks:** losing effect tails, hosted plug-in state, note releases, loop position, queued-ring generation semantics, late UI payloads and output-device changes. Do not paper over discontinuities by advancing musical time from a UI timer.

<a id="cache-02"></a>

### 2. Stop clears native decoded cache but leaves the bridge's residency hints

**Static confidence: high; deterministic lifecycle mismatch. Performance impact depends on asset sizes and path-vs-byte representation.**

`native_audio_stop` calls both runtime.stop and clear_decoded_asset_cache. The TS bridge `stop()` only invokes this command; its `knownNativeAssetRevisions` set is retained. On the next play, preload skips these “known” revisions and withCachedAssetHints strips bytes. A bytes-only generated/cache asset is then requested without resident data or source path. The bridge handles that specific error by retrying the entire original start payload with bytes. Rust bypasses cache lookup whenever bytes are supplied, so this retry decodes byte-backed payload assets again, including assets that might already have become resident.

[src-tauri/src/native_audio.rs:1294–1303 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1294-L1303)
[src/native/audioPlayback.ts:320–378 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/native/audioPlayback.ts#L320-L378)
[src/native/audioPlayback.ts:389–424 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/native/audioPlayback.ts#L389-L424)
[src-tauri/src/native_audio.rs:1727–1764 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1727-L1764)

**Conditions:** successful cached start/preload → Stop (not Pause) → Play using the same bridge and byte-backed assets. File-backed assets can re-read from their path instead of triggering the missing-bytes error, but the stale hint still skips intentional preload. Bounded-cache eviction can produce a similar mismatch even without Stop.

**Existing mitigation/tests:** one-shot full-payload retry and revision-specific keys already prevent many hard failures. The eviction test deliberately expects fallback with bytes; it does not prove hints match native residency after a stop. [tests/nativeAudioPlayback.test.ts:730–778 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/nativeAudioPlayback.test.ts#L730-L778)

**Investigate:** a mocked lifecycle test whose stop actually clears fake native residency, then a real native counter trace for preload/start/decode/retry across Play–Stop–Play versus Pause–Resume. Lowest-risk fix candidate: clear or generation-invalidate bridge hints when native cache clearing is confirmed; reconcile failed/uncertain stops safely. Longer-term simplification: native returns a cache-generation/residency contract instead of TS maintaining an independent optimistic set.

**Regression risks:** increased retransmission if hints are cleared too broadly; old command replies invalidating a new session; silently changing Stop's intentional memory-release policy. Keeping the decoded cache across Stop is a separate policy decision, not necessary for fixing stale hints.

<a id="cache-03"></a>

### 3. Stopped composition edits discard the reusable stem cache

**Static confidence: high. Extra rendering is conditional on a later rebuild, and should be measured at engine level.**

`syncProject` preserves the old render cache only if its whole-project signature matches or this is a live native composition edit. For an actual composition edit while stopped/paused, the signature changes and nativeRenderCache becomes null. Later ensureNativeRenderCache passes that now-null object as reusableCache. The builder already supports stable per-stem asset IDs and can reuse unaffected stems, but that capability is unavailable when its old asset bank was thrown away by the engine.

[src/audio/audioEngine.ts:278–310 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L278-L310)
[src/audio/audioEngine.ts:1036–1042 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1036-L1042)
[src/audio/nativeRenderCache.ts:138–159 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L138-L159)
[src/audio/nativeRenderCache.ts:998–1004 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L998-L1004)

**Conditions:** warm generated cache → edit bass/drum/melody/etc while not actively native-playing → manual build, persist/save-cache, or other subsequent full build. Initial Play may use procedural fallback, so do not claim every stopped edit blocks Play for a full build.

**Existing mitigation/tests:** direct builder tests demonstrate fewer renders after a single-lane edit **when the caller supplies the previous cache**. Live edits retain/filter the cache. The stopped engine invalidation route is the missing integration coverage. [tests/nativeRenderCache.test.ts:436–453 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/nativeRenderCache.test.ts#L436-L453)

**Investigate/simplify:** separate “playable current coverage” from “bounded reusable rendered assets.” Reject stale playback without deleting content-addressed stem bytes useful to future builds. Add an engine-level test that warms, stops, changes one lane, rebuilds, and asserts unaffected stems are not rendered again; include paused and mixer-only cases.

**Regression risks:** memory retention, cross-project asset contamination, renderer/recipe changes and invalid source hashes. Keep renderer contract/hash/source validation; never re-enable stale playback merely to preserve reusable data.

<a id="cache-04"></a>

### 4. Superseded builds are rejected only after completing all stem work

**Static confidence: high. The amount of wasted work and user-visible delay require profiling.**

If any cache build is running, a different requested build waits for it and recursively tries again. buildNativeRenderCache iterates all its build items and awaits each missing stem without an abort/generation callback. Only after the entire cache returns does the engine compare its signature to the current project and discard stale output. cancelLiveNativeRenderCacheRefresh cancels a timer and increments a promotion token; it does not stop the builder or Rust offline rendering already in flight.

[src/audio/audioEngine.ts:1023–1066 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1023-L1066)
[src/audio/nativeRenderCache.ts:138–186 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L138-L186)
[src/audio/audioEngine.ts:1190–1195 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1190-L1195)

**Conditions:** a relatively expensive build starts, then the user edits again or loads another project; the later build can wait behind obsolete stem renders. Debounce addresses edits before a build starts, not edits during it.

**Existing mitigation/tests:** same-signature build deduplication, 180 ms edit debounce, newest pending reason, stale-result rejection and promotion tokens. The rapid-edit test verifies no immediate restart/build and the latest pending reason; it does not verify cancellation after one native stem render has begun. [src/audio/audioEngine.ts:1119–1128 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1119-L1128) [tests/audioEngine.test.ts:1456–1503 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/audioEngine.test.ts#L1456-L1503)

**Investigate/simplify:** a latest-generation build coordinator with a cancellation check between stem jobs; allow the already-running Rust stem to finish initially, but stop scheduling further obsolete stems. Retain independently validated completed assets for reuse. Only add cooperative native cancellation if single-stem traces justify it. Avoid unconstrained Promise.all across stems: it can raise peak PCM memory and compete with live DSP.

**Validation:** defer the first render promise, edit the project, release the promise, and assert obsolete subsequent stems never dispatch, newest request completes, and stale cache never promotes. Trace queued/wasted stem seconds in real sessions.

**Regression risks:** starvation under continuous edits, discarded useful asset results, cancelled jobs publishing into the wrong project, promises never settling, stale pending reasons or incomplete cache falsely labeled full.

<a id="cache-05"></a>

### 5. Cache validation recompiles/hashes musical data on the UI thread, including every native tick

**Static confidence: high. UI-hitch causality and magnitude unmeasured; do not describe this as CPAL-callback work.**

Native playback runs a UI ticker every 35 ms. Each tick calls maybeScheduleProgressiveNativeRenderCacheRefresh, which calls readyNativeRenderCache before checking whether coverage is partial. When a native render cache exists, readyNativeRenderCache recomputes a whole-project JSON signature, including normalized source refs, clips and media metadata, even for unchanged full coverage.

[src/audio/audioEngine.ts:1232–1277 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1232-L1277)
[src/audio/audioEngine.ts:1007–1019 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1007-L1019)
[src/audio/nativeRenderCache.ts:644–719 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L644-L719)

During stale-cache bridging, filterNativeRenderCacheForProject validates every item. Each expectedNativeCacheSourceHashes invocation evaluates default full generated/runtime signatures, then generated stem hashes can clone a project, compile timeline events and stringify them. Build-item generation similarly computes a per-stem event hash synchronously before the first native render await, then actual rendering compiles the asset events again. This work occurs in ordinary TS calls; async/idle scheduling does not offload it.

[src/audio/nativeRenderCache.ts:529–530 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L529-L530)
[src/audio/nativeRenderCache.ts:572–624 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L572-L624)
[src/audio/nativeRenderCache.ts:931–955 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L931-L955)
[src/audio/nativeRenderCache.ts:1011–1059 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L1011-L1059)
[src/audio/nativeRenderCache.ts:1070–1121 ](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeRenderCache.ts#L1070-L1121)

**Conditions:** large normalized projects and cached full-song playback; source edits with many cached stem entries; cache build/hydration. Existing per-content deduplication may lower the cost of event compilation internally, but these call sites still clone/construct/stringify their inputs. No runtime cost has been measured.

**Investigate/simplify:** compute immutable revision/signature facts once per accepted project change, not once per visual/native-status tick. Pass precomputed whole-project signatures to all per-item validators. Cache compiled per-stem events by the same validated input revision and reuse them for both hash and native render payload, preserving sound/parity contracts. Profile before deciding whether a dedicated worker is necessary.

**Validation:** instrument counts/time for nativeRenderCacheSignature, nativeRuntimeAudioCacheSignature, source-hash compilation, project clones and native payload assembly; record WebView long tasks alongside native ring-underrun/output diagnostics. An unchanged full-cache playback test should assert no repeated source-hash work, plus correctness fixtures for every audio-affecting edit and renderer revision.

**Regression risks:** under-invalidation and stale audio are worse than slower hashing. Cover tempo/meter changes, source transforms, MIDI overlays, drum-lane FX/mix, sampler source revision, renderer contracts, and undo/redo. Keep transient mixer controls outside baked-stem invalidation where the current contract permits.

## Measurement plan before implementation

Use the installed native Windows app at the audited commit (or explicitly record the later build). Use owned/local fixtures, without changing projects in place. Record commit, project size, sample rate/device/buffer settings, asset sizes/counts, and warm/cold state.

1. **Separate symptoms:** timestamp UI unresponsiveness, native startup latency, native stream replacement intervals and captured audible discontinuities independently.
2. **Play/Stop/Pause matrix:** first cold Play, warmed Play, Pause–Resume, Stop–Play, and repeated Stop–Play. Count actual disk reads, decode calls, metadata-only start failures/full retries and cache-generation changes.
3. **Long cached session:** cross at least one actual payload-window boundary; compare native restart reason/count and gap in loopback capture. Current unit tests cannot validate hardware continuity.
4. **Edit matrix:** identical single-lane changes while stopped, paused and playing. Record unchanged-stem render count, discardedBuildCount, build elapsed time, runtime asset byte transfer and time until newest state becomes audible.
5. **Cancellation:** edits/project switch while a deliberately slow render is in flight. Test latest-state correctness and bounded wasted work separately.
6. **Open/hydrate matrix:** cold disk cache, persisted warm cache, stale renderer hash, partial/missing cache, source-media recovery, large audio stems. Track IPC bytes, array allocations, resident memory and synchronous TS long tasks. Existing sequential/full-byte hydration is a useful trace target, not proof of the reported symptom.
7. **Regression acceptance:** native-clock/loop/sample alignment, tail/parity, mixer fast path, audio-only project playback, missing-media recovery, sampler/VST3 behavior and output-device failures. Do not infer full acceptance from mocked TS tests. Add focused source tests first, then native/installed evidence if implementation is authorized.

No speedup, percentile, maximum pause or confirmed user-visible cause is claimed here. The ranked findings are implementation facts plus bounded hypotheses to validate.



---

# Pocket DAW UI/audio-path source audit
Exact source: `0c6975cadcd4aba0047ab94170a2adabc722517f`. Static source inspection; no app execution, build, test run or installed Windows profiling. Root AGENTS.md, PROJECT_MEMORY.md, ARCHITECTURE.md, APP_TS_RESPONSIBILITY_MAP.md and timing-stability note were read. Findings below are deterministic work patterns and proposed improvements, not measured explanations of the user's hitch.

<a id="ui-01"></a>

## 1. Patch library/search results instead of replacing the studio on every keystroke
**Priority: high; narrow UI-only intervention.**

The VST descriptor, VST parameter and sample-library input handlers call `render({preserveScroll:true})` synchronously for every input event ([src/app/App.ts:2004-2027](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L2004-L2027)). Render replaces `root.innerHTML`, rescans all buttons for tooltips, binds handlers again and restores scroll later ([src/app/App.ts:1778-1792](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L1778-L1792)). The shell includes the timeline, inspector, mixer and media pool even when only the library query changed ([src/app/ui.ts:95-121](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/ui.ts#L95-L121)). Timeline rows iterate the sorted clip list for every visible track ([src/app/ui.ts:678-703](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/ui.ts#L678-L703)); this amplifies whole-shell work for a large session.

**Trigger/impact:** typing in the Sounds Library or VST searches while playing or editing a large session rebuilds unrelated DOM. This can consume main-thread time, replace focused elements and force layout/scroll recovery. The code establishes unnecessary work; its contribution to observed pauses needs measurement.

**Existing mitigation to preserve:** `PlaybackRenderScheduler` defers project-driven full renders during playback ([src/app/renderScheduler.ts:33-49](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/renderScheduler.ts#L33-L49)), and mixer/step edits already have targeted fast paths. These direct search handlers bypass that scheduler. Merely deferring all search renders until playback stops would make search unusable.

**Minimal change:** extract result-list/filter rendering and patch only its container; keep search input and studio DOM stable. Optionally coalesce result computation once per animation frame, strictly as display work. Do not adopt a framework or redesign the shell. Avoid indiscriminately converting all full renders: mute/solo deliberately force visual refresh, covered by existing tests.

**Checks:** type character-by-character (including mid-string edits and IME composition), change filters, switch tabs, drag timeline/mixer simultaneously, preserve scroll, keyboard selection and Escape/return-focus behavior. Assert timeline/mixer node identity and full-render count do not change during typing. Important current contract: E2E fills sample search then presses Space and expects playback to start without changing the query ([tests/e2e/smoke.spec.js:327-355](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/e2e/smoke.spec.js#L327-L355)); sample search currently lacks the explicit `focus()` restoration present for VST search. Decide and test the intended shortcut/focus behavior rather than silently changing it as a performance fix.

<a id="ui-02"></a>

## 2. Make live meters/readouts linear and change-only
**Priority: high; small low-risk hot-path cleanup.**

Native ticker runs every 35 ms, with ordinary UI tick emission throttled to 66 ms ([src/audio/audioEngine.ts:1232-1267](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1232-L1267), [src/audio/audioEngine.ts:1757-1768](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1757-L1768)). Each emitted tick updates app state and calls `updateLiveDom` ([src/app/App.ts:494-515](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L494-L515)). For every track it performs three `findDataElement` lookups ([src/app/App.ts:1979-1988](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L1979-L1988)); that helper actually queries **all** nodes carrying the attribute, converts to an array, then filters by value ([src/app/App.ts:7698-7704](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L7698-L7704)). With one meter per track, this entails quadratic match/filter work plus repeated DOM queries. `setTransportReadout` also destroys and recreates strong/small children even when displayed text is unchanged ([src/app/App.ts:1938-1971](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L1938-L1971), [src/app/App.ts:1992-2001](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/app/App.ts#L1992-L2001)).

**Trigger/impact:** normal playback with many tracks, plus recording updates. Unnecessary selector traversal, allocations and DOM mutation occur even when most meter percentages and bar/beat text have not changed.

**Minimal change:** build maps of meter/readout elements once after each full render; update cached elements by track ID. Alternatively query each attribute once per live update and map in a single pass. Cache last displayed values; update text/style/ARIA only on change. Keep nodes stable, invalidate references whenever full root replacement occurs. Preserve recording input overrides and accessibility labels.

**Existing mitigation/tests:** UI tick throttling and live patches already prevent a full render per tick. Current performance tests protect graph/timeline identity on edits ([tests/performanceHotPath.test.ts:7-36](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/performanceHotPath.test.ts#L7-L36)), not selector counts or repeated node allocation. Add DOM-level regression tests for linear query count and stable readout children, track add/remove/reorder, unusual IDs, record monitoring, loop wrap and start/stop. Profile live-update p95/maximum durations before and after; do not increase or move musical scheduling onto RAF.

<a id="ui-03"></a>

## 3. Batch native mixer IPC and separate fast transport status from heavy diagnostics
**Priority: medium-high for dense automation; native changes need installed Windows verification.**

Every 35-ms native tick evaluates mixer controls for every track. A changed four-decimal volume/pan/audibility signature causes one asynchronous `updateTrack` IPC per track ([src/audio/audioEngine.ts:1211-1229](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1211-L1229)). Signatures suppress unchanged tracks, but moving automation can change many tracks each tick; there is no in-flight coalescing at this call site. Every Rust `native_audio_update_track` takes runtime and playback locks and then returns `runtime.status()` ([src-tauri/src/native_audio.rs:1307-1364](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1307-L1364)). Status takes the playback lock again and calculates asset diagnostics ([src-tauri/src/native_audio.rs:1869-1915](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1869-L1915)); active/resident byte calculations build fresh HashSets and scan asset references ([src-tauri/src/native_audio.rs:1852-1866](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1852-L1866), [src-tauri/src/native_audio.rs:1990-2006](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1990-L2006)).

**Why native context matters:** the render producer holds that same playback mutex while generating a 128-frame block ([src-tauri/src/native_audio.rs:1454-1507](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1454-L1507)). Thus expensive or frequent status/control work can contend with the producer. The actual current CPAL callbacks consume the output ring ([src-tauri/src/native_audio.rs:1413-1444](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1413-L1444)); it would be incorrect to say these status calculations run inside the real-time callback or prove an underrun.

**Existing mitigation:** normal status polling is already capped by a 120-ms interval and a single-in-flight guard ([src/audio/audioEngine.ts:1315-1334](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1315-L1334)), and unchanged mixer signatures skip sends. The per-track update responses still return full status. Consumed-position clocks, generation filtering and failure diagnostics must be retained.

**Minimal staged change:** batch all changed manual control patches into one native command and return one compact acknowledgment; maintain at most one in-flight latest pending batch, with deliberate ordering for mute/solo/seek/stop. Separate frequent transport/stream-health snapshots from on-demand asset-memory diagnostics, or cache memory accounting at asset-set changes. Do not merely slow automation evaluation: native sample-clock timing is the invariant. As a separate architectural follow-through, ordinary track automation should be evaluated from native transport, as hosted-plugin automation already is, rather than relying on UI delivery; that is a larger correctness change than IPC batching.

**Checks:** mixed automated/manual faders, folder solo, mute discontinuity, rapid seek/loop/stop/restart and failed commands. Validate native generation/status freshness; retain real-time ring isolation tests ([src-tauri/src/native_audio.rs:10331-10365](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L10331-L10365)) and consumed-clock/failure tests near line 10589. Extend bridge tests beyond the current single-update command mapping ([tests/nativeAudioPlayback.test.ts:904-933](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/nativeAudioPlayback.test.ts#L904-L933)). Measure command count, producer lock-wait/hold durations, ring underruns and audio output at the installed Windows boundary. At 32 changing tracks the source permits roughly 32 × 28.6 commands/sec before response or event-loop limits; this is an illustrative upper dispatch rate, not measured telemetry.

<a id="ui-04"></a>

## 4. Pre-index meter-only region classification
**Priority: medium/low; small independent optimization for long cached sessions.**

At most every 120 ms of playback time, `tapNativeRegionMeters` scans every cache region. Before checking whether the region is active at the playhead, it calls `nativeRegionIsGeneratedStem` ([src/audio/audioEngine.ts:1350-1362](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1350-L1362)), which linearly searches all render-cache items by asset ID ([src/audio/audioEngine.ts:1661-1664](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1661-L1664)). This is O(regions × cache items) metadata work for visual meter approximation, including distant or generated-stem regions that never reach the meter. Active regions additionally search tracks.

**Minimal change:** first apply cheap interval rejection; build a generated-stem asset-ID Set and track Map when the active cache/project identity changes. If profiling warrants it, maintain a sorted active-region index for visual meters, with explicit resets on seek/loop/cache replacement. Do not reuse UI meter values for actual DSP or claim they are measured PCM peaks.

**Existing mitigation:** 120-ms throttle; event meters already keep a forward event index ([src/audio/audioEngine.ts:1341-1347](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/audioEngine.ts#L1341-L1347)); generated stems are deliberately excluded to avoid false/duplicate metering. Preserve that distinction and mute/solo behavior.

**Checks:** overlapping imported clips, generated stems, cache generation replacement, reverse seeks and loop wraps, missing track metadata, and constant meter outputs before/after. A low-risk first patch only changes metadata lookups, not audio or cache lifecycle.

## Recommended measurement boundary
Record timings and counts around full shell render, live DOM update, native tick and IPC dispatch/round-trip; sample long-task observations where supported by the installed WebView. Existing performance diagnostics expose render counts and flag frequent playback renders, but count alone cannot identify duration or correlate a hitch with a native underrun. Compare cold/warm cache, stopped/playing search, small/large sessions, and sparse/dense automation. Keep browser-only UI tests as UI evidence; only Windows native playback evidence can establish audio impact.

No listeners-leak or callback-timing accusation is justified merely by the size of App.ts or repeated bind calls: replaced element listeners are collectible, and the current callback is ring-only. Cache build/restart opportunities are covered by the separate cache audit.



---

# Pocket DAW export and Godot playback audit
Source pinned to `0c6975cadcd4aba0047ab94170a2adabc722517f`. Static source review; no application, build, benchmark, install or test suite performed. Findings are code evidence and predicted consequences, not measured regressions.

## Executive result
Keep the native DAW engine and sample clock. The most useful changes are (1) correct section-local audio origins, (2) define a genuinely faithful game-pack mix contract, (3) keep long export/ZIP buffers in native ownership, and (4) prepare Godot audio before transition boundaries. Avoid turning the Godot sample-preview implementation into another production synthesizer.

<a id="godot-01"></a>

## 1. Section-local Godot loops are started with an absolute arrangement offset
**Confidence: high source-level correctness finding; reproduce with audible PCM before patch.**

- DAW section loops become section-local streams: [addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd:168–184](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd#L168-L184).
- Sequence navigation selects an absolute arrangement tick, then prepares the current section's streams: [addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:1203–1225](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L1203-L1225).
- The selected stem map prefers section stems over full-song stems: [addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:2120–2136](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L2120-L2136).
- Starting playback always uses `current_tick * seconds_per_tick`, including those section-local streams: [addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:2104–2117](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L2104-L2117).

For A then B, with B beginning at 2 seconds and B's standalone loop only 2 seconds long, entering B attempts to play its local file from 2 seconds rather than zero. Depending on the stream, this can skip the opening or reach its end immediately. Repeated arrangement sections compound the same origin mismatch.

**Existing coverage:** [addons/pocket_chordsmith/tools/validate_adaptive_stems.gd:97–128](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/tools/validate_adaptive_stems.gd#L97-L128) checks A/B mapping using missing WAV/OGG paths; it cannot establish the audible playback offset. The DAW's exact-duration check is good and orthogonal: [apps/pocket-daw/src/audio/nativeOfflineRender.ts:18–28](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeOfflineRender.ts#L18-L28); [apps/pocket-daw/tests/nativeOfflineRender.test.ts:306–351](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/nativeOfflineRender.test.ts#L306-L351) tests rejection of appended loop tails.

**Smallest safe fix:** make the selected audio set carry its time origin (full-song, section-local, or explicit state-local). Subtract the corresponding arrangement occurrence start only for local streams. Preserve absolute seeking for full-song stems. Do not infer this from layer name or filename. Consider returning a small prepared-set object rather than repeatedly deriving map and timing independently.

**Validation:** render different onset impulses/tones for A and B, each one bar; test first B, repeated A/B, seek halfway through B, queued transitions, loops, both synchronized and per-layer modes. Capture actual Godot output and assert onset and loop length within a specified sample/timing tolerance. Include fractional sections and tempo-map cases. This is a high-value fidelity fix before performance tuning.

<a id="godot-02"></a>

## 2. Game-pack stems are not guaranteed to reconstruct the authored full mix
**Confidence: high for independently applied nonlinear processing/normalization; medium-high for overlapping drum exports until actual rendered fixture is checked.**

Game packs render the full mix once and then independently render every isolated stem:
[apps/pocket-daw/src/daw/exportJobs.ts:700–724](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/daw/exportJobs.ts#L700-L724).
Isolation leaves the master, buses and returns enabled:
[apps/pocket-daw/src/daw/exportJobs.ts:401–431](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/daw/exportJobs.ts#L401-L431).
The native mix renderer applies master effects and a final `tanh` soft limit per render:
[apps/pocket-daw/src-tauri/src/native_audio.rs:3154–3173](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L3154-L3173) and [apps/pocket-daw/src-tauri/src/native_audio.rs:6978–6980](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L6978-L6980).
Game-pack stems also inherit the full-song export profile, so peak normalization can be independently applied to each stem:
[apps/pocket-daw/src/audio/nativeOfflineRender.ts:9–38](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeOfflineRender.ts#L9-L38).

Summing separately limited/compressed/peak-normalized stems is mathematically different from processing their sum once. Shared sidechains, nonlinear sends and plugin state need similarly explicit semantics. This is not a demand that separate synth engines be bit-identical; it is a mix-routing contract inside the DAW export.

There is another reason not to treat every exported artifact as a simultaneously active layer: a branched drum project exports both `drums` and individual drum branches:
[apps/pocket-daw/src/daw/exportJobs.ts:304–320](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/daw/exportJobs.ts#L304-L320).
The importer maps every manifest stem into the playback set:
[addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd:152–174](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd#L152-L174).
The conductor starts every mapped layer by default:
[addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:2048–2059](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L2048-L2059).
The branch test confirms the aggregate and alternatives coexist and branch isolation re-enables the parent:
[apps/pocket-daw/tests/exportJobs.test.ts:41–69](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/exportJobs.test.ts#L41-L69).
This deserves an impulse-based overlap test, rather than assuming all manifest stems are a disjoint partition.

**Existing coverage:** game-pack tests inspect metadata, file counts and mocked render outputs, including acceptance of peak normalization, rather than summed PCM:
[apps/pocket-daw/tests/exportJobs.test.ts:407–447](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/exportJobs.test.ts#L407-L447).
Native cache-stem parity tests are valuable but concern internal pre-mix cache stems, a different path:
[apps/pocket-daw/src-tauri/src/native_audio.rs:9854–9924](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L9854-L9924).

**Smallest safe fix:** for exact authored sound, offer the rendered full mix as the unambiguous default playback set. For adaptive layers, explicitly define a partition, alternative groups, a common gain reference, the shared-FX policy and which processing is already baked. Do not silently change existing exports' sound or globally remove their mastering. Full mix should remain the audible reference, not an extra layer to sum over stems. Avoid per-stem peak normalization in a new reconstruction-oriented profile.

**Validation:** a dry linear reference should reconstruct to within its quantization/dither tolerance. With nonlinear/shared processing, either derive a valid common processing strategy or label/measure the intended difference; assess onset, gain, loudness, true peak, spectral/envelope changes and listening. Use drum branches, sends, sidechain and hosted-plugin fixtures. No universal bit-exact claim across Chordsmith, native DAW and Godot procedural playback is warranted.

<a id="export-01"></a>

## 3. Native export unnecessarily moves whole rendered audio into JS, and ZIP assembly duplicates the pack
**Confidence: high structural performance opportunity; quantify wall time and memory before prioritizing implementation.**

- Rust DSP and WAV encoding already run on `spawn_blocking`, with the runtime lock dropped before the long render. Preserve this:
[apps/pocket-daw/src-tauri/src/native_audio.rs:1172–1226](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L1172-L1226).
- Rust produces a complete WAV byte vector:
[apps/pocket-daw/src-tauri/src/native_audio.rs:2456–2481](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L2456-L2481).
- The bridge requires a JS array of bytes, then native export converts it to a typed array and Blob:
[apps/pocket-daw/src/native/mediaBridge.ts:221–242](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/native/mediaBridge.ts#L221-L242); [apps/pocket-daw/src/audio/nativeOfflineRender.ts:28–38](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/nativeOfflineRender.ts#L28-L38).
- Additional channel conversion, peak normalization and bit-depth processing materialize buffers in JS, including a final explicit copy:
[apps/pocket-daw/src/audio/offlineRender.ts:363–379](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/audio/offlineRender.ts#L363-L379).
- Game packs retain every rendered Blob until packaging:
[apps/pocket-daw/src/daw/exportJobs.ts:700–736](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/daw/exportJobs.ts#L700-L736).
- ZIP preparation materializes every entry as bytes, computes CRC synchronously, and concatenates one full ZIP before making its Blob:
[apps/pocket-daw/src/daw/zipArchive.ts:18–65](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/daw/zipArchive.ts#L18-L65), [apps/pocket-daw/src/daw/zipArchive.ts:148–181](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src/daw/zipArchive.ts#L148-L181).

A five-minute stereo 48 kHz 24-bit WAV is about 86.4 MB of PCM. Multiple full-length stems multiply this before the JS numeric-array overhead and ZIP copies. Exact heap overhead depends on the WebView implementation; no multiplier is asserted. Sequential rendering already limits concurrent DSP, but does not bound retained output memory.

**Smallest safe fix:** first remove avoidable final ZIP concatenation by constructing a Blob from properly typed header/data parts, with regression checks. The stronger native-only path is render/convert/CRC/write to a scoped native temporary file or streaming archive, return metadata/handle/progress, and only pass preview-sized data through IPC. Keep browser-oriented utilities where other callers actually need them, rather than replacing the DAW architecture. Preserve existing export semantics, especially deterministic dither, 24/32-bit handling, exact loop length and plugin isolation. Avoid parallelizing all stems: that can worsen memory and plugin ownership.

**Existing coverage:** Rust tests cover native PCM16/24/float32 encoding; JS tests cover bit depth, mono, normalization, dither and exact duration:
[apps/pocket-daw/src-tauri/src/native_audio.rs:9393–9468](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/src-tauri/src/native_audio.rs#L9393-L9468); [apps/pocket-daw/tests/nativeOfflineRender.test.ts:58–245](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/apps/pocket-daw/tests/nativeOfflineRender.test.ts#L58-L245).
They do not establish bounded peak export memory.

**Profiling:** same native project, 30 s/5 min, 4/16/32 stems, cold/warm cache; measure Rust RSS, WebView heap/RSS, IPC payload size/time, conversion/CRC/ZIP time, longest UI stalls and cancellation cleanup. Compare decoded PCM/hash where conversion is unchanged, and ZIP entries/CRC/manifests. Do not claim a speed percentage without this evidence.

<a id="godot-03"></a>

## 4. Godot cold loading remains synchronous at transition time
**Confidence: high structural finding; game impact depends on prewarming and asset size.**

State transitions prepare the stem set immediately:
[addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:1095–1107](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L1095-L1107).
Preparation loads each stream:
[addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:2035–2077](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L2035-L2077).
A cache miss performs direct WAV loading or `load(path)` synchronously:
[addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:2206–2230](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L2206-L2230).
The default ready/play warmup excludes stems:
[addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:133–142](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L133-L142) and [addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:219–226](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L219-L226).
The available `prewarm_section`/`prewarm_audio` APIs mitigate cold misses, but do their work synchronously:
[addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:498–549](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L498-L549).
The stream cache is retained until profile change/tree exit; prewarming every possible song is therefore not a free solution.

**Smallest safe fix:** request the next section/state's imported resources ahead of the musical boundary using Godot's background ResourceLoader API; only consume after loaded status. Prepare player/scene objects on the main thread. Keep the old set playing, or report not-ready, rather than blocking at the transition boundary. Use explicit current/next/pinned working sets and a byte-aware policy before adopting global eager preloading. Raw user:// WAV loading needs its own safe worker/decode path or an import/preparation step; do not assume `load_threaded_request` covers that direct loader unchanged.

**Existing mitigations:** prewarm signatures deduplicate assets, stream caching exists, and a preview performance profiler records cold/warm startup and native slice cost:
[addons/pocket_chordsmith/tools/profile_pocket_chordsmith_preview_performance.gd:48–135](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/tools/profile_pocket_chordsmith_preview_performance.gd#L48-L135).
Godot's official documentation confirms regular load blocks and threaded get also blocks unless readiness is checked:
[Godot 4.6 background loading](https://docs.godotengine.org/en/4.6/tutorials/io/background_loading.html).

**Validation:** measure cold/warm transition frame p50/p95/max, loaded bytes, audio underruns and onset/phase alignment in a real rendered game at target hardware settings. Include level teardown, rapid state changes and missing assets. Profile waveform/render preparation separately from actual playback.

## Faithful sound and Godot 4.6.3 recommendation
The official [4.6.3 stable archive](https://godotengine.org/download/archive/4.6.3-stable/) and [release announcement](https://godotengine.org/article/maintenance-release-godot-4-6-3/) verify this release exists. Use the user's 4.6.3 target for validation; this review does not claim it is the latest available engine today.

The supported conductor, compiled chart and rendered audio route is the right game boundary. Keep original Chordsmith/DAW sources and the exact rendered reference together with provenance (source hash, engine/render version, sample rate, format, frame count, origin, loop points, gain and baked effects).

Godot preview is intentionally distinct: native preview building during playback defaults off, with ordinary samples used on native-cache miss:
[addons/pocket_chordsmith/resources/pcs_playback_profile.gd:28–53](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/resources/pcs_playback_profile.gd#L28-L53); [addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd:1324–1408](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd#L1324-L1408).
The validator explicitly has a native-preferred versus default-fallback mode:
[addons/pocket_chordsmith/tools/validate_pocket_chordsmith_sample_preview.gd:43–48](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/tools/validate_pocket_chordsmith_sample_preview.gd#L43-L48) and [addons/pocket_chordsmith/tools/validate_pocket_chordsmith_sample_preview.gd:104–124](https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/0c6975cadcd4aba0047ab94170a2adabc722517f/addons/pocket_chordsmith/tools/validate_pocket_chordsmith_sample_preview.gd#L104-L124).
Do not enable heavy on-demand synthesis merely to call preview faithful. Prepared native preview can improve auditioning; shipping exact sound should use source-engine renders.

PCM delivery parity means verify decoded asset PCM, then captured Godot playback at known gain/bus/sample-rate settings, accounting for resampling/output latency. Procedural/event parity means notes, pitches, starts/durations, articulation, envelopes, mix and timing within a documented tolerance; MIDI is performance data and does not carry a synthesizer's timbre.

One additional guard worth adding with import validation: Godot 4.6 [AudioStreamSynchronized](https://docs.godotengine.org/en/4.6/classes/class_audiostreamsynchronized.html) has MAX_STREAMS = 32. The conductor passes arbitrary map size directly to it at lines 2048–2056. Reject or deliberately partition oversized sets; silently switching to independently started players is not proof of sample-aligned output.

