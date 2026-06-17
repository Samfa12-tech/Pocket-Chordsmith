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

## Working Rules

- Do not move `addons/pocket_chordsmith/`.
- Treat root-level `web-app/`, `pocket_dj/`, `godot-addon/`, `archive/`, `releases/`, and `marketing-assets/` as local ignored reference folders if they exist on disk.
- The old standalone Pocket DAW checkout was archived to `archive/local-reference/pocket-daw-standalone-2026-06-13/`; do not use a root-level `pocket-daw/` folder for active work.
- Canonical app changes belong under `apps/`.
- Do not commit generated outputs: `node_modules/`, `dist/`, `src-tauri/target/`, installers, release zips, Godot `.import`/`.uid`, or local `.pocketdaw` saves.
- Keep Pocket DJ separate from the Chordsmith editor UI.
- Keep Pocket DAW `private: true` unless licensing and release boundaries are deliberately changed.
- Pocket DAW itch uploads must be native/installable builds only. Never publish the browser preview or `dist/` as a WebAudio/HTML5 itch channel.
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
