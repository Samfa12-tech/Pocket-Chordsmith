# Project Memory

Use this file first when returning to the Pocket Audio family monorepo.

## Current Shape

This repository is now the canonical public monorepo for:

- `apps/chordsmith-web/` - Pocket Chordsmith browser composition app.
- `apps/pocket-dj/` - Pocket DJ performance/remix app.
- `apps/pocket-daw/` - Pocket DAW Vite/TypeScript/Tauri app.
- `addons/pocket_chordsmith/` - Godot addon path, kept stable for Godot installs and Asset Library packaging.
- `packages/pocket-audio-core/` - shared runtime/export package.
- `packages/pcs-format/` - future PCS format package scaffold.

## Current Baselines

- Pocket Chordsmith web entry: `apps/chordsmith-web/index.html`.
- Pocket Chordsmith current build: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`.
- Pocket Chordsmith direct-Godot fallback/reference build: `apps/chordsmith-web/pocket_chordsmith_v67_direct_godot_push.html`.
- Durable Chordsmith app context: `apps/chordsmith-web/POCKET_CHORDSMITH_CODEX_CONTEXT.md`.
- Pocket DJ entry: `apps/pocket-dj/index.html`.
- Pocket DJ current build: `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`.
- Pocket DAW package root: `apps/pocket-daw/package.json`.
- Godot addon plugin config: `addons/pocket_chordsmith/plugin.cfg`.
- Godot addon release baseline: `1.1.7`.

## Current Notes And Known Gaps

### Current 2026-06-28 Notes

- 2026-06-28 post-reaudit anchors: use `docs/CROSS_APP_RELEASE_DASHBOARD.md` for the cross-app baseline and `docs/audits/2026-06-27-deep-audit-workplan.md` for the deep-audit loop. The workplan tracks mixed completion types: some rows are implementation plus tests, some are local installed smoke, some are manual checklist gates, and some are design/research anchors. Do not treat every completed row as a shipped product feature.
- Current Pocket DAW release truth is still the published `0.6.34` checkpoint recorded in `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md` and `apps/pocket-daw/release-status.json`. Source commits after the published `0.6.34` release include docs, tests, and small source organization changes; do not package or publish another installer as `0.6.34` from a later commit. Bump the next checkpoint and align package, Tauri, Cargo, schema/release metadata before publishing any new binary.
- Pocket DAW Windows file association local smoke passed on 2026-06-28 against installed `0.6.34`: `.pocketdaw` registration, cold-start open, second-instance focus/open, live `open_project`, and `pocket-daw://` Chordsmith handoff coexistence. Keep exact-artifact update smoke as a gate for the next public checkpoint.
- Sam manually exported a Pocket DAW project as a game asset and imported it into Godot on 2026-06-28; it worked. Treat this as manual DAW -> Godot game-asset smoke evidence, not hosted CI and not proof of Chordsmith direct browser push.
- Chordsmith -> Godot direct browser push is not verified working from the live itch build. As of 2026-06-19, the Godot receiver can answer on localhost and pasted `PCS1:` share codes import in the Godot Chordsmith tab, but the browser button falls back to a form submit and still should be treated as not working until a fresh browser/Godot smoke proves the chart appears automatically.
- Godot editor preview is an audition/sample-kit path, not exact Chordsmith/DAW/DJ synth parity. Use pasted share-code import for chart timing checks and Pocket DAW Godot Adaptive Pack export for rendered audio parity checks.

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
