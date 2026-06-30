# Pocket DAW Grounding Audit

Date: 2026-06-30

Scope: `apps/pocket-daw/` only, with `packages/pocket-audio-core/` checked only for DAW compatibility/parity evidence. No Godot addon files were inspected for changes or modified.

Paused implementation context: chat `019f0ca8-7b50-7250-aa79-fd2e8ffad075`, which had been advancing Pocket DAW through scoped MIDI, recording, export, render/cache, and game-pack reliability slices.

## Executive Summary

The branch is safe to continue as a development branch, but it is not safe to release or publish as-is. The source direction is mostly grounded in DAW value: timeline editing, MIDI import/editing, recording, source-safe audio clips, stem/game-pack export, native playback/rendering, cache reliability, and file-first automation. Automated coverage is broad and currently green across TypeScript, Vitest, Rust/Tauri, Playwright smoke, release packaging, itch artifact verification, Pocket Audio Core, and family parity.

The highest risk is architectural complexity, not test failure. Native render/cache logic and recording orchestration have grown into multi-path systems with several stale-state and parity risks. The current cache work appears useful for playback responsiveness and export reliability, but it is near the point where more cache-layer work would increase risk faster than user-facing value unless the policy is simplified and validated with installed-app smoke.

Recommendation: continue, but put implementation back behind a short stabilization gate. Do not rollback. Do not publish the current dirty tree as `0.6.34`. Split the branch before release if review or publication is the goal; otherwise continue in this branch with a freeze on broad cache/render architecture expansion.

## What Changed

Tracked diff against `main` under Pocket DAW:

- 85 tracked files changed.
- `+14,751 / -602` tracked lines before counting untracked new source/test files.
- 13 untracked source/test/doc files.
- No tracked changes found in `packages/pocket-audio-core/`.
- No tracked Godot addon changes found.

Largest changed source/test areas:

- `src/daw/midiClips.ts`: large MIDI import/editing authoring surface expansion.
- `src/app/ui.ts` and `src/app/App.ts`: new UI actions, inspector/export controls, recording and command wiring.
- `src/daw/clips.ts`: source-safe clip editing, audio actions, take/comp/range operations.
- `src/daw/exportJobs.ts`: stem/section/game-pack ZIP/export planning and manifests.
- `src/app/commands.ts`: undoable command layer for new clip/MIDI/routing/drum actions.
- `src-tauri/src/native_audio.rs`, `src-tauri/src/native_recording.rs`, `src-tauri/src/native_decode.rs`: native playback/rendering/recording/decode surface.
- Tests: 67 Vitest files now pass, including broad additions around MIDI, cache, export, routing, recording, MCP, and UI.

### Audio Engine

- Native/WebAudio playback paths were extended around runtime audio regions, native payload preparation, source-safe audio regions, generated events, pre-fader sends, drum branch routing/metering, reverse/phase/fades, and diagnostics.
- Native renderer contract and cache signature logic are now central to generated-stem/runtime-audio reuse.
- Relevant anchors: `src/audio/audioEngine.ts`, `src/audio/eventRenderer.ts`, `src/audio/audioRegions.ts`, `src/audio/offlineRender.ts`, `src/audio/nativeOfflineRender.ts`, `src/audio/nativeRenderCache.ts`, `src/native/audioPlayback.ts`, `src/native/mediaBridge.ts`, `src-tauri/src/native_audio.rs`.

### Render / Cache

- Native render cache now supports generated stems, runtime audio regions, partial/live cache windows, persisted cache hydration, source hashing, cache pruning, and cache invalidation across many project state changes.
- Cache signatures include renderer contract, recipe hash, stem render mode, drum-lane mix/FX, routing, send/FX, and source clip/window data.
- This is a real performance/export feature, but it is also the largest architectural risk.

### Recording

- Native recording now includes mono/stereo track mode, input preview, native frame anchors, dropped-frame counters, bounded ring buffering, recording WAV metadata, take grouping, and UI diagnostics.
- The app places completed native recordings as audio clips through the media pool and timeline command path.
- Relevant anchors: `src/app/App.ts`, `src/app/recordingOrchestration.ts`, `src/native/recordingBridge.ts`, `src/daw/audioClips.ts`, `src-tauri/src/native_recording.rs`.

### UI

- UI changed across mixer, timeline, inspector, piano roll, export details, drum branch rows, audio clip controls, MIDI controls, recording controls, and diagnostics.
- Rendering remains a hybrid: full shell rerenders plus live DOM updates for playhead, meters, transport, and controls.
- Relevant anchors: `src/app/App.ts`, `src/app/ui.ts`, `src/styles/base.css`, `src/styles/mixer.css`, `src/styles/timeline.css`.

### Timeline / Clip Editing

- Expanded range editing, source-safe audio clip operations, generated-pattern range handling, timeline markers/game-state cues, MIDI clip length/source windows, take grouping/comping foundations, and drum branch visibility/actions.
- Relevant anchors: `src/daw/clips.ts`, `src/daw/timeline.ts`, `src/daw/audioClips.ts`, `src/daw/midiClips.ts`, `src/daw/drumLanes.ts`.

### Import / Export

- MIDI import/edit/export is substantially broader.
- Stem WAV, section loop ZIP, Godot/web game packs, game-state markers, branch-aware drum stems, native Save As fallback, and game-pack verification were added or extended.
- New file-first MCP command coverage supports several app actions without UI automation.
- Relevant anchors: `src/audio/midiExport.ts`, `src/daw/exportJobs.ts`, `src/daw/exportProfiles.ts`, `src/daw/midiParser.ts`, `src/mcp/pocketDawMcp.ts`, `scripts/verify-game-pack.mjs`.

### Packaging / Build Tooling

- `package.json` adds `verify:game-pack`.
- Release status generation/validation was extended.
- Tauri/Cargo metadata remains aligned at `0.6.34`.
- `verify:itch` built local installer artifacts and verified them. These must remain local test artifacts and must not be published as a new `0.6.34` release from this dirty post-release tree.

### Tests

- Major test additions/changes cover MIDI, source-safe audio clips, export jobs/profiles, native render cache, native/offline render, recording alpha, MCP commands, routing commands, project round trips, UI rendering/actions, game-pack verifier/push bridge, and compatibility.

### Docs

- Current source/status docs were updated heavily: `POCKET_DAW_NORTH_STAR.md`, `WHAT_WORKS_AND_WHATS_NEXT.md`, `docs/CURRENT_RELEASE_STATUS.md`, several design plans, release notes template, Windows checklist, and the new game-pack smoke checklist.
- Some older release checklist docs remain stale and should be marked historical or rewritten from placeholders.

## Product Grounding Check

The branch is mostly aligned with the intended DAW use case:

- Timeline-based music editing: yes. Clip, range, MIDI, audio, generated-section, marker, routing and drum-branch work all attach to timeline editing.
- Reliable playback: yes in intent and tests, with strong native/WebAudio fallback coverage. Risk remains around cache staleness under live edits.
- Accurate recording alignment: partially. Tests cover placement and native frame counters, but not a true hardware round-trip latency assertion.
- Stable stem/render/export flow: yes in automated package/export tests; installed-app and target-runtime smoke remain manual.
- UI responsiveness: improving through render scheduler/live DOM updates, but still risky because full rerenders and imperative updates coexist.
- Pocket Chordsmith / Pocket Audio Core compatibility: currently strong. `packages/pocket-audio-core` tests and family parity passed.

Speculative or over-complex areas:

- More native render-cache layers should pause until the existing cache policy is simplified and manually smoke-tested in the installed app.
- Recording state should be consolidated before adding punch/comping or multitrack recording implementation.
- Browser fallback smoke is useful for development, but public product language should stay install-only.

## Architecture Review

### Current Audio Path

1. Project edits flow through app command helpers and `App.applyProjectState`.
2. `AudioEngine.syncProject` clones the project, rebuilds rendered events and audio regions, updates diagnostics, and decides whether native render/runtime caches can be reused, filtered, refreshed, or rebuilt.
3. Playback starts through the native path when available by building a native audio payload from project data, rendered events, and runtime/cache assets. WebAudio remains the fallback scheduler.
4. Full-song export prefers `renderProjectToNativeWavBlob`; if native rendering is unavailable it can fall back to browser offline WAV rendering.
5. Stem/section/game-pack exports build scoped render projects/plans, then render WAV blobs and package deterministic manifests/ZIPs.

Strengths:

- Live playback and export share core inputs: project data, rendered timeline events, audio regions, routing, FX and export profiles.
- Native and browser paths have broad unit coverage.
- Pocket Audio Core parity checks are still intact.

Main architecture risks:

- The cache path has several policy layers: full cache, partial cache, runtime audio cache, persisted cache hydration, stale-live-edit branches, and native restart coalescing.
- Export fallback from native to browser render is resilient but can hide native parity regressions unless diagnostics are asserted.
- App/UI/audio concerns still meet in large `App.ts` methods, especially recording, export, cache hydration, and project open/reset.

### Current Recording Path

1. User arms a live audio track and starts recording.
2. `startRecording` validates the installed/native runtime, one armed live track, saved-project requirement, start bar, count-in/pre-roll, timeline audio preparation, and native input preview.
3. Native CPAL recording starts with track/session/channel metadata and writes WAV output under project media.
4. `stopRecording` collects native stop results, decodes/imports the WAV, creates or updates a media pool item, places a timeline clip, and commits the project state.
5. Recording diagnostics include frame anchors, input/output metadata, dropped frames, timing source, and take grouping/channel metadata.

Strengths:

- Native frame counters, bounded buffers, writer tests, path safety, and mono/stereo tests are present.
- Timeline placement after recording is covered at helper level.

Main recording risks:

- Recording orchestration is a hand-rolled async state machine spread across `recordingStartToken`, `recording.status`, preview keys, timers, track selection, playback anchors and cleanup branches.
- True hardware round-trip latency/alignment remains unproven by automation.
- Project reset/open paths should consistently stop playback/recording and clear recording UI state through one helper before more recording features land.

## What Appears Solid

- Version and release status sync: `0.6.34`, schema `2`, generated current status doc is current.
- Automated JS/TS/Rust coverage is broad and currently green.
- Pocket Audio Core compatibility and family parity are passing.
- Release scripts enforce install-only public artifact shape; no script path appears to publish the browser preview as the public DAW.
- Game-pack verifier and export manifests are grounded in existing DAW export value.
- Source changes are scoped to Pocket DAW; shared core has no tracked changes in this worktree.
- Ignored generated outputs are mostly covered by repo/app `.gitignore`.

## What Appears Risky

### Critical

No current critical source break was found. The branch builds, tests, packages and verifies locally.

### High

1. Native render/cache complexity can create stale playback/export state after edits.
   - Evidence: `src/audio/audioEngine.ts` handles live edit staleness, partial cache coverage, prewarm/rebuild/restart, runtime cache merging and persisted cache hydration.
   - Impact: audio heard during playback can differ from export, or stale stems can survive edits.

2. Recording is not yet a single explicit session state machine.
   - Evidence: recording start/stop/cancel, native preview, count-in and clip placement live across `App.ts`, `recordingOrchestration.ts`, native bridge, and Tauri native recording.
   - Impact: cancel/project-swap/track-change races can misplace takes or leave stale preview/timing state.

3. Current dirty source can package as `0.6.34`, but `0.6.34` is already the published checkpoint.
   - Evidence: package/Tauri/Cargo/schema versions are intentionally still `0.6.34`; `verify:itch` produced valid local artifacts.
   - Impact: publishing these artifacts as `0.6.34` would blur the published baseline and updater evidence.

### Medium

4. UI render model mixes full `innerHTML` shell rerenders with live DOM mutation.
   - Impact: inspector scroll/state resets, visual timeline lag, or stale controls under playback/edit pressure.

5. Project open/import/demo/new flows manually reset overlapping state.
   - Impact: transport, recording, selection, cache or recent-file state can diverge between entry points.

6. Native and browser render fallback can hide native regressions.
   - Impact: export success may not prove the intended native renderer handled the project.

7. Generated drum branch overlays and MIDI conversion are source-preserving and useful, but add another layer of branch metadata.
   - Impact: visual branch tracks, source grids, and rendered events can drift if future edits do not preserve invariants.

### Low

8. Long-lived listeners/timers lack an obvious app teardown path.
   - Impact: mostly relevant only if the app is re-instantiated in-process.

9. Vite warnings remain: mixed Tauri static/dynamic imports and a large main chunk.
   - Impact: build noise and chunk size, not a current runtime failure.

## Performance Sanity Check

Likely heaviest runtime paths:

- `AudioEngine.syncProject`: full event/audio-region rebuild on project changes.
- Native render cache build/hydration: stem rendering, persisted WAV reads/writes, signature hashing, partial cache filtering.
- Export jobs: repeated scoped project cloning and WAV rendering for stems/sections/game packs.
- UI `render`: large shell rebuilds after state changes.
- Media import/reload: decode, waveform peak analysis, native cache repair, transient analysis.

Potential hitch sources:

- Repeated cache prewarm/rebuild around high-frequency UI edits.
- Full project serialization/cloning in command/app/cache paths.
- Waveform/transient work tied too closely to UI-triggered media operations.
- Full UI rerenders after operations that only need a small control update.

Minimal performance validation plan:

1. Add an installed-app performance smoke project with generated sections, MIDI clips, audio clips, branch drums and one recorded take.
2. Record diagnostics while doing: playback start/stop, loop playback, clip move/trim, MIDI note edit, branch lane edit, export WAV, build native cache.
3. Track `renderCountDuringPlayback`, scheduler gaps, slow native callback count, native cache hit/miss, stale-cache rebuild reason, max callback ms, JS render counts and export duration.
4. Establish simple budgets before more cache work: no audible dropouts, no long UI freeze during cache rebuild, no unexpected full cache rebuild from inspector-only edits.

## Test Results

All commands below were run locally on 2026-06-30.

Pocket DAW:

- `npm run verify:versions` - pass. Version sync OK: `0.6.34`, schema `2`; release status doc current.
- `npm run verify:native-sound-recipes` - pass. Native sound recipes up to date.
- `npx tsc --noEmit` - pass.
- `cargo test --manifest-path src-tauri\Cargo.toml` - pass. 107 passed, 0 failed.
- `npm test` - pass. 67 files, 723 tests passed.
- `npm run build` - pass. Vite warnings remain for mixed Tauri static/dynamic imports and one large chunk.
- `npm run verify:release` - pass. Ran Vitest, production build, browser preview package, and Tauri debug build.
- `npm run test:e2e` - pass. 7 Playwright browser-fallback smoke tests passed.
- `npm run verify:itch` - pass. Ran version checks, recipe checks, Vitest, build, Cargo tests, installer packaging, and artifact verification. It generated local ignored release artifacts. Manual installed-app smoke is still not run.

Pocket Audio Core compatibility:

- `npm test` in `packages/pocket-audio-core` - pass. 124 tests passed.
- `npm run verify:family-parity` in `packages/pocket-audio-core` - pass. Sound surface checks, 40 drift tests, Chordsmith browser trace comparison, 84 core fixture tests, and 77 Pocket DAW parity/import/render/export tests passed.

Tests not run:

- No manual installed-app recording hardware smoke.
- No manual exact-installer open/save/update smoke for the newly generated artifacts.
- No live Godot editor import/receiver smoke in this pass.
- No publish, push, or remote release action.

## Test Coverage Audit

Strong areas:

- Import/export, MIDI parsing/export, export jobs, export profile validation.
- Native render cache signatures, hydration, stale-path rejection, persisted cache safety, cache pruning.
- Pocket Chordsmith import compatibility and Pocket Audio Core parity.
- Project save/load round trip, migrations, invariants.
- MCP/file-first command coverage.
- Native audio and recording unit tests.

Partial areas:

- Recording latency/alignment: helper and native unit coverage exists, but no full hardware round-trip assertion.
- Playback/render parity: strong at shared/render-unit level, but weaker as an installed native runtime end-to-end.
- UI responsiveness: Playwright smoke exists, but not performance/scroll/state stress.
- Installer/native smoke: artifact packaging is verified; installed app behavior is not newly smoked for this dirty tree.

Recommended tests to add next:

1. Installed-app recording smoke: record a short take, reopen project, assert clip placement, metadata, playback audibility and export inclusion.
2. Native playback vs native/offline export parity for a project containing recorded audio, imported MIDI, branch drums, sends and generated clips.
3. Cache invalidation stress: edit generated/drum/MIDI/audio fields during playback and assert cache rebuild reason plus no stale rendered event/stem IDs.
4. Inspector/timeline UI stress: keep scroll/selection stable during playback while changing clip controls.
5. Installer smoke: launch exact generated setup artifact, open/save/reopen `.pocketdaw`, verify updater metadata, file association and deep link.

## Documentation Status

Solid/current:

- `apps/pocket-daw/README.md`: aligns with Windows desktop/install-only intent and bootstrapper/update flow.
- `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md`: generated and validated against `release-status.json`.
- `apps/pocket-daw/docs/GAME_PACK_EXPORT_SMOKE_CHECKLIST.md`: matches `verify:game-pack` script and current export-manifest surface.
- `apps/pocket-daw/docs/UPDATER_RELEASE_PIPELINE.md`: consistent with guarded publish policy.
- `apps/pocket-daw/WHAT_WORKS_AND_WHATS_NEXT.md` and `POCKET_DAW_NORTH_STAR.md`: broad, current, and explicit that several source-only items still require installed-app smoke.

Stale or ambiguous:

- `apps/pocket-daw/docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md` still pins `0.6.21` artifact names.
- `apps/pocket-daw/docs/ITCH_RELEASE_CHECKLIST.md` still pins `0.5.9` public alpha artifacts and butler command.
- `apps/pocket-daw/docs/PRIVATE_ALPHA_RELEASE_CHECKLIST.md` still pins `0.5.9` artifacts and butler command.
- `apps/pocket-daw/docs/ALPHA_TESTING_RELEASE_STATUS.md` is mostly useful historical context, but the top framing should clearly route readers to `CURRENT_RELEASE_STATUS.md` for living truth.

Specific stale docs found/fixed:

- Found the stale docs listed above.
- Fixed in this pass: only this audit report was added. The older release checklist files were not edited because they may be historical records; safer next action is to either retitle them as historical or convert hardcoded versions to placeholders in a dedicated docs cleanup.

## Current Known Limitations

- Manual installed-app smoke has not been run for the current dirty tree.
- Recording latency/alignment is not proven by hardware loopback or exact installed-app tests.
- Native render cache policy is complex and needs simplification before more cache work.
- Browser preview remains a dev/test fallback only; it is not a public DAW distribution target.
- Some release docs still contain historical hardcoded version numbers.
- Publishing another `0.6.34` artifact from this dirty tree would be misleading; next public binary should bump checkpoint metadata first.
- Live Godot receiver/import smoke was not part of this pass.
- Vite chunk/import warnings remain.

## Files That Should Not Be Committed

The following local generated/secret/output paths are ignored and should stay out of commits:

- `apps/pocket-daw/.env.tauri-signing.local`
- `apps/pocket-daw/node_modules/`
- `apps/pocket-daw/dist/`
- `apps/pocket-daw/src-tauri/target/`
- `apps/pocket-daw/src-tauri/gen/`
- `apps/pocket-daw/releases/`
- `apps/pocket-daw/playwright-report/`
- `apps/pocket-daw/test-results/`
- `apps/pocket-daw/tmp-vite-*.log`
- `packages/pocket-audio-core/dist/`

The untracked Pocket DAW source/test/doc files appear intentional and should be reviewed for commit rather than discarded:

- `apps/pocket-daw/docs/GAME_PACK_EXPORT_SMOKE_CHECKLIST.md`
- `apps/pocket-daw/scripts/verify-game-pack.mjs`
- `apps/pocket-daw/src-tauri/src/native_decode.rs`
- `apps/pocket-daw/src/daw/exportProfiles.test.ts`
- `apps/pocket-daw/src/daw/midiDrumConversion.ts`
- `apps/pocket-daw/src/native/gamePackPushBridge.ts`
- `apps/pocket-daw/tests/audioClipCommands.test.ts`
- `apps/pocket-daw/tests/clipCommands.test.ts`
- `apps/pocket-daw/tests/drumBranching.test.ts`
- `apps/pocket-daw/tests/gamePackPushBridge.test.ts`
- `apps/pocket-daw/tests/gamePackVerifier.test.ts`
- `apps/pocket-daw/tests/midiCommands.test.ts`
- `apps/pocket-daw/tests/routingCommands.test.ts`

## Recommended Immediate Next Steps

1. Continue the branch, but pause broad feature expansion for one stabilization slice.
2. Add an installed-app recording smoke or manual checklist run against the exact current artifact before trusting recording alignment.
3. Simplify or at least document the native cache policy: when to reuse, when to rebuild, when to fallback, and what diagnostics prove it.
4. Add a project-reset helper used by open/import/demo/new paths to stop playback/recording and clear transient UI/audio state consistently.
5. Fix/retitle stale release checklist docs so they cannot be mistaken for current `0.6.34` release instructions.
6. Before any public release, bump package/Tauri/Cargo/schema/release metadata to the next checkpoint and rebuild artifacts from a clean tree.

## Recommended Deferred Cleanups

- Split `App.ts` by extracting recording session orchestration, export orchestration, native cache UI orchestration and project loading/reset.
- Add a single recording-session object or explicit state machine.
- Add a cache policy diagram and cache source-hash fixture matrix.
- Reduce full shell rerenders for inspector/timeline-only interactions.
- Add teardown for app/window/audio timers if re-instantiation becomes possible.
- Revisit Vite chunk/import warnings after stabilization.

## Final Recommendation

Recommendation: continue, with a stabilization gate.

- Continue: yes, the branch is coherent and verified by broad automated checks.
- Pause: pause public release and broad cache/render expansion until installed-app smoke and cache policy simplification are done.
- Rollback: no rollback is justified by current evidence.
- Split branch: recommended before release or external review, because the change set is large and spans MIDI, recording, cache, export, UI and native code. Not required for local continuation.

Short version: the work is grounded and promising, but the next move should be making the bones sturdier, not adding another major cache/render feature.
