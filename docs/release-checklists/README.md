# Release Checklists

Use these notes before tagging or publishing any Pocket Audio family artifact.

## Web App

- Confirm `apps/chordsmith-web/index.html` redirects to the intended current build.
- Serve `apps/chordsmith-web/` locally and smoke test demo load, play/stop, JSON import/export, `PCS1:` import/export, WAV export, and mobile width.
- Verify `Push to DJ` and `Push to Godot` still preserve handoff payloads.
- Run `npm run package:itch` from `apps/chordsmith-web/` and confirm the zip contains `index.html`, `pocket_chordsmith_v68_core_bridge.html`, and `pocket-audio-core/` fallback files at the root.

## Pocket DJ

- Confirm `apps/pocket-dj/index.html` redirects to the intended current build.
- Smoke test `PCS1:` import, raw JSON import, demo load, play/stop, section queueing, mutes, build/drop, and edit-back handoff.
- Keep Pocket DJ as a performance/remix deck, not a second Chordsmith editor.

## Pocket DAW

```powershell
cd apps/pocket-daw
npm install
npm test
npm run build
```

- Keep `package.json` `private: true`.
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, installers, or local `.pocketdaw` saves.
- Run a clean native Tauri package check before publishing installers.

## Godot Addon

- Confirm `addons/pocket_chordsmith/plugin.cfg` exists and the version matches release docs.
- Package addon-only releases through `addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd` or the equivalent Godot export workflow.
- Treat GitHub source archives as full monorepo archives, not addon-only downloads.
- Confirm release exports exclude Godot `.uid` and `.import` metadata.
- Verify the local push receiver path still works in an open Godot editor.
