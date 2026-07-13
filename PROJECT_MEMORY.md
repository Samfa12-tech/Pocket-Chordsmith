# Project Memory

Use this file first when returning to the Pocket Audio family monorepo.

## Current Shape

This repository is now the canonical public monorepo for:

- `apps/chordsmith-web/` - Pocket Chordsmith browser composition app.
- `apps/pocket-dj/` - Pocket DJ performance/remix app.
- `apps/pocket-daw/` - Pocket DAW native-only Windows Tauri desktop app.
- `addons/pocket_chordsmith/` - Godot addon path, kept stable for Godot installs and Asset Library packaging.
- `packages/pocket-audio-core/` - shared runtime/export package.
- `packages/pcs-format/` - future PCS format package scaffold.

## Pocket DAW Boundary

Pocket DAW is the native-only Windows DAW in the Pocket Audio family. It lives
under `apps/pocket-daw/` and is packaged as a Tauri Windows desktop app.

Do not treat Pocket DAW as a browser app, HTML5 app, Web Audio app, Pocket
Chordsmith screen, or Pocket DJ deck. Its UI may use Vite/TypeScript through
Tauri, but DAW implementation work must preserve the native Windows app,
native audio playback/recording/render/export path, installer/updater flow,
and `.pocketdaw` project boundary.

Central timing rule: the native audio engine/sample clock owns playback,
recording alignment, render/export timing, cache timing, and authoritative
playhead position. The UI only displays state and dispatches commands.

## Current Baselines

- Pocket Chordsmith web entry: `apps/chordsmith-web/index.html`.
- Pocket Chordsmith current build: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`.
- Pocket Chordsmith direct-Godot fallback/reference build: `apps/chordsmith-web/pocket_chordsmith_v67_direct_godot_push.html`.
- Durable Chordsmith app context: `apps/chordsmith-web/POCKET_CHORDSMITH_CODEX_CONTEXT.md`.
- Pocket DJ entry: `apps/pocket-dj/index.html`.
- Pocket DJ current build: `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`.
- Pocket DAW package root: `apps/pocket-daw/package.json`.
- Godot addon plugin config: `addons/pocket_chordsmith/plugin.cfg`.
- Godot addon release baseline: `1.1.9`.

## Current Notes And Known Gaps

### Current 2026-07-13 Pocket DAW Source Notes

- The unreleased Portable Projects + Media Recovery slice hardens native Collect Media against collisions, partial copies and false project-save success; identical-byte retries are idempotent, different-content overwrites are refused, and existing project-media names are reserved deterministically.
- Missing project media can recover playback from a decoded WAV cache without being mislabeled portable. Relink clears stale source analysis, project open clears cross-project runtime audio buffers, and final portability requires relink/recollection plus a successful native project save.
- Live bridge smoke now supports collect/reload/relink and explicit WAV, MIDI, stem ZIP, section-loop ZIP, Godot and Web pack exports. A 2026-07-13 native debug run passed delete-original-source, move-folder/reopen, cache fallback, relink/recollect, final reopen and all five tested non-MIDI artifacts; its Godot pack imported headlessly in Godot 4.6.3 with 464 compiled events.
- Release attestation now requires retained installer-bound media-portability evidence, punch/take evidence, game-pack ZIP evidence and Godot target-import evidence. This work remains source-only at `0.6.40`; do not describe it as installed or published until a new checkpoint is versioned and exact-installer smoke passes.

### Current 2026-07-09 Pocket DAW Notes

- Current Pocket DAW release truth is source `0.6.40`, latest published public updater release `0.6.40`, project schema `2`, and last installed-smoke `0.6.40` strict pass on 2026-07-09 against exact installer SHA-256 `41c4ec77f9925f8155e2f5137c31fd7d68aaf322511cbc544c9d3d230cd6779b`. Trust `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md` and `apps/pocket-daw/release-status.json` over older status prose when these differ.
- `0.6.40` shipped the 2026-07-07 installed-app hardening notes: native external Help/feedback links, immediate timeline M/S visual refresh, Delete safety after selecting a track header, and deferred initial procedural fallback native-cache build/restart while playback is running. It has clean-source packaging, exact installed strict punch/take/export smoke with audible microphone plus connected loopMIDI evidence, GitHub/updater/bootstrapper manifests verified, and itch channel `samfa12/pocket-daw:windows-installer` updated to build `#1783130`.

### Current 2026-07-05 Housekeeping Notes

- Project docs and filesystem were audited on 2026-07-05. The canonical navigation anchors remain `README.md`, `AGENTS.md`, this `PROJECT_MEMORY.md`, `docs/CROSS_APP_RELEASE_DASHBOARD.md`, `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md`, and `apps/chordsmith-web/POCKET_CHORDSMITH_CODEX_CONTEXT.md`.
- Historical 2026-07-05 Pocket DAW release truth was source `0.6.39`, latest published public updater release `0.6.38`, project schema `2`, and last installed-smoke `0.6.39` passing on 2026-07-04. For the current release truth, use the 2026-07-09 notes above plus the generated release-status files.
- `0.6.39` was a source-only recording confidence candidate until later `0.6.40` source hardening changes and publication. For current public release claims, use the generated release-status files.
- `docs/CROSS_APP_RELEASE_DASHBOARD.md` was refreshed against current component metadata. Use it for cross-app baselines, but treat generated/component release files as the source of truth for exact versions and smoke evidence.
- The loose root addon zip `pocket_chordsmith_godot_addon_1.1.8.zip` was moved out of the repository front door to ignored local storage at `releases/godot-addon/root-cleanup-2026-07-05/pocket_chordsmith_godot_addon_1.1.8_root-2026-06-29.zip` because a different `1.1.8` package already existed under `releases/godot-addon/`. Do not restore release zips to the repo root.

### Current 2026-07-01 Notes

- Lofi & Chill CD Baby upload was completed on 2026-07-01 from the Pocket Release Mastering Assistant output. The final local archive is `release/archive/cd-baby/lofi-and-chill-cd-baby-uploaded-2026-07-01.zip` with SHA-256 `611079EFE35C44ECFC03F06F57BC596F5AB9B920BE951DAFE50FB4D5AFCB84C5`. The archive includes the uploaded 16-bit/44.1 kHz stereo WAV set, manifests, reports, mix patches, master settings, source-project copies, extended source-project copies, and short-track extension notes.
- The Lofi & Chill closeout reclaimed local disk space by deleting rebuildable/generated working folders from `release/cd-baby-lofi-and-chill/`: stems, premaster WAVs, duplicate WAV24 masters, Spotify-native WAV24 copies, extended remaster scratch output, and the unpacked CD Baby upload WAV folder. Keep the archive plus small reports/settings/source JSON as the local release evidence.
- Current Lofi & Chill mastering QC is `7 PASS`, `19 WARN`, `0 FAIL`; every final uploaded track is at least 120 seconds, has no clipped samples, no non-finite samples, and stays within true-peak ceiling. WARNs are transient-limited or album-consistency warnings.
- Pocket Fish Tank Original release copy intentionally sets `melodyInstrumentsA` to `mellow_vibes` because the source JSON omitted the field and defaulted to `pulse`. The original source JSON remains untouched.
- Treat this phase as complete for the generated lofi/chill pack and CD Baby upload, but do not mark the mastering assistant broadly solid until real-world tests cover live instruments, vocals, wider panning, denser arrangements, phase-heavy stereo sources, and non-lofi material.
- Samfa12's Compilation Album #1 was harvested and packaged on 2026-07-01 from Spin Vector, Dust on the River, and Possum Cafe Pocket Chordsmith/Pocket Audio data. The run found 71 usable source cues/songs, selected 18 album tracks, expanded every selected track to at least 120 seconds, created 18 Pocket DAW projects, and rendered 18 mastered WAVs.
- The compilation closeout archive lives at `release/archive/samfa12-compilation-album-1/`. Keep the three ZIPs plus `.sha256.txt` files as local evidence: CD Baby WAV16 upload package, Spotify WAV24 master package, and Pocket DAW/source archive. Also keep `release/archive/samfa12-compilation-album-1/pocketdaw-projects/` as loose direct-open `.pocketdaw` copies and `release/archive/samfa12-compilation-album-1/cdbaby-wav16/` as loose CD Baby upload WAVs. The rebuildable staging folder `releases/samfa12-compilation-album-1/` was deleted after archive verification to reclaim about 3.8 GB.
- Compilation mastering QC: 18 tracks, 3 PASS, 15 WARN, 0 FAIL; every delivered WAV is stereo 44.1 kHz, at least 120.6 seconds, and has no clipped samples. WARNs are transient-limited/preserved-dynamics notes, not failed exports. Final store metadata still needs human legal/store values such as songwriter, genre, cover art, and ISRC where applicable.

### Current 2026-06-28 Notes

- 2026-06-28 post-reaudit anchors: use `docs/CROSS_APP_RELEASE_DASHBOARD.md` for the cross-app baseline and `docs/audits/2026-06-27-deep-audit-workplan.md` for the deep-audit loop. The workplan tracks mixed completion types: some rows are implementation plus tests, some are local installed smoke, some are manual checklist gates, and some are design/research anchors. Do not treat every completed row as a shipped product feature.
- Historical 2026-06-28 Pocket DAW release truth was the published `0.6.34` checkpoint recorded then in `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md` and `apps/pocket-daw/release-status.json`. Source commits after that published `0.6.34` release included docs, tests, and small source organization changes; do not package or publish another installer as `0.6.34` from a later commit. For the current release truth, use the 2026-07-05 notes above plus the generated release-status files.
- Pocket DAW Windows file association local smoke passed on 2026-06-28 against installed `0.6.34`: `.pocketdaw` registration, cold-start open, second-instance focus/open, live `open_project`, and `pocket-daw://` Chordsmith handoff coexistence. Keep exact-artifact update smoke as a gate for the next public checkpoint.
- Sam manually exported a Pocket DAW project as a game asset and imported it into Godot on 2026-06-28; it worked. Treat this as manual DAW -> Godot game-asset smoke evidence, not hosted CI and not proof of Chordsmith direct browser push.
- Chordsmith -> Godot direct browser push is not verified working from the live itch build. As of 2026-06-19, the Godot receiver can answer on localhost and pasted `PCS1:` share codes import in the Godot Chordsmith tab, but the browser button falls back to a form submit and still should be treated as not working until a fresh browser/Godot smoke proves the chart appears automatically.
- Godot editor preview is an audition/sample-kit path, not exact Chordsmith/DAW/DJ synth parity. Use pasted share-code import for chart timing checks and Pocket DAW Godot Adaptive Pack export for rendered audio parity checks.
- Godot addon `1.1.9` preserves Heavy Metal profile metadata and web-kit preview aliases for metal drums, basses, chords, leads, and guitar tones on top of the 1.1.8 preview-stem/performance baseline. Treat text-only Chordsmith import rendering as an editor/import preparation step with progress, not a gameplay runtime job.

### Historical Release Context

- Godot addon DAW-pack import editor smoke was confirmed on 2026-06-19: the `Import DAW Pack` button showed the Downloads ZIP, editor-window drag/drop imported it, and `Play Preview` sounded like the Pocket DAW export. Treat generated files under `res://music/pocket_chordsmith_packs/` as keeper game-project assets unless a later cleanup explicitly says otherwise.
- Shared sound-feature updates have a family parity gate: run `npm run verify:family-parity` from `packages/pocket-audio-core/`. Historical 2026-06-19 evidence passed the generated sound-surface check, cross-app surface-drift tests, Chordsmith browser trace parity for the v68 app, core event/render/Godot-pack fixtures, Pocket DAW Chordsmith import/render/export parity tests, direct DAW-vs-Chordsmith browser event parity for the committed fixture set, and Chordsmith mix-slider handoff into DAW track/master volumes.
- Latest test pushes for user smoke, 2026-06-19: Pocket Chordsmith was pushed to existing itch channel `samfa12/pocket-chordsmith:pocket-audio-core` as `lofi-parity-v68-20260619b` / build `#1736544`; Pocket DJ was pushed to `samfa12/pocket-dj:html` as `lofi-parity-v1g-20260619b` / build `#1736545`; Pocket DAW was pushed to `samfa12/pocket-daw:windows-installer` as version `0.6.9` / build `#1736808` and GitHub release `pocket-daw-v0.6.9`, with native-cache performance/readouts, corrected lofi Drums meter behavior, and native procedural `warm_sub`/lofi bass audibility updater-visible for installed-app smoke testing. The remote setup SHA-256 is `406bd7432dda5f4c3dfccb041c6e2362f5b683559476900f239ec46843d60f09`.
- Pocket DAW `0.6.9` hotfix context: Sam reported Bass meter activity but no audible soloed Warm Sub Bass in `C:\Users\sam_s\Music\lofi demo project.pocketdaw` on installed `0.6.8`; diagnostics showed native procedural fallback (`assetCount: 0`, `proceduralFallbackEventCount: 1010`) rather than cached stems, and the fix removed a native-only bass output pad so the bass renderer matches Chordsmith/WebAudio scale. Sam confirmed on 2026-06-19 that Bass is now audible in installed `0.6.9`.
- Pocket DAW `0.6.19` updater checkpoint, 2026-06-20: GitHub release `pocket-daw-v0.6.19` was published from source commit `eee587c9afc39d89fa7893ea8a98e730c948a5e9` with generated release manifest dirty flag `false`. The setup EXE `Pocket.DAW_0.6.19_x64-setup.exe` has SHA-256 `511143d2533046339fef6d818c854a1e9e5968901b0abd1f3023aa32f36fa79f`; the Tauri updater signature hash is `f0afdfed173c5e9e8695835399da0c55554ecee4c61f23cbbc94ec5bc34d1c72`. The MSI hash is `a0196e6d9fd9c76b1871a48b8e22057fada2f3ee0c03bd6347a3e58015f14a1d`, with signature hash `da88fc7b0e94efe919711101972c7aea779e7ef85a1b25d3282a14b4ad38fe1b`.
- Pocket DAW `0.6.19` bootstrapper context: `pocket-daw-bootstrapper-latest.json` was uploaded to the same GitHub latest release and reports version `0.6.19`, installer file `Pocket.DAW_0.6.19_x64-setup.exe`, and installer hash `511143d2533046339fef6d818c854a1e9e5968901b0abd1f3023aa32f36fa79f`. The itch channel remains a bootstrapper/downloader channel unless the bootstrapper executable itself changes.
- Pocket DAW `0.6.19` focus: native transport/cache alpha with native loop-region wrapping, native metronome rendering, latest-only native restart coalescing during rapid live composition edits, fresh native-cache reuse after live edits, narrower cache signatures, Save As title adoption from `.pocketdaw` filenames, guitar track metadata/active-state sync, and scroll-preserving routing/add/metronome interactions.
- Pocket DAW `0.6.34` bass parity checkpoint, 2026-06-27: installed-app smoke confirmed the bass sounds better after aligning the native/cached generated bass renderer with Chordsmith-style harmonic low-pass filtering and release-tail timing. The cache contract invalidates old generated bass stems so projects rebuild rather than replay stale harsh bass renders. GitHub release `pocket-daw-v0.6.34` was published from clean commit `1b89374ac9a7c53cca3ea936909db62984de9031`; the public updater setup EXE hash is `89625636a3e68c9162e0dd3ea5a5f48f12673d2cfc439dab03134c6ddcb75f67`. The itch `windows-installer` channel was updated to `bootstrapper-0.6.34`, and the bootstrapper upload now includes `index.html` so itch browser-mode requests do not fail with `asset not found: index.html`. Keep this as the current bass-tone baseline before changing DAW/Chordsmith bass again.

## Working Rules

- Do not move `addons/pocket_chordsmith/`.
- Treat root-level `web-app/`, `pocket_dj/`, `godot-addon/`, `archive/`, `releases/`, and `marketing-assets/` as local ignored reference folders if they exist on disk.
- The old standalone Pocket DAW checkout was archived to `archive/local-reference/pocket-daw-standalone-2026-06-13/`; do not use a root-level `pocket-daw/` folder for active work.
- Canonical app changes belong under `apps/`.
- Do not commit generated outputs: `node_modules/`, `dist/`, `src-tauri/target/`, installers, release zips, Godot `.import`/`.uid`, or local `.pocketdaw` saves.
- Keep Pocket DJ separate from the Chordsmith editor UI.
- Keep Pocket DAW `private: true` unless licensing and release boundaries are deliberately changed.
- Pocket DAW itch uploads must be native/installable builds only. Never publish the browser preview or `dist/` as a WebAudio/HTML5 itch channel.
- Pocket DAW public updater versions should be accumulated checkpoint releases, not one version per local change. Build and test changes locally until there is a coherent tester slice; publish a new GitHub/itch updater version only for intentional checkpoints or urgent blockers such as launch failure, broken updater, save/open corruption, or a major unusable audio path.
- Treat GitHub source archives as full monorepo archives; use `addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd` for addon-only release payloads.

## Useful Checks

```powershell
Test-Path addons\pocket_chordsmith\plugin.cfg
Test-Path apps\chordsmith-web\index.html
Test-Path apps\pocket-dj\index.html
Test-Path apps\pocket-daw\package.json

cd apps\pocket-daw
npm install
npm test
npm run build
```

Pocket DAW currently builds with a non-fatal Vite warning about mixed static/dynamic `@tauri-apps/api/core.js` imports.
