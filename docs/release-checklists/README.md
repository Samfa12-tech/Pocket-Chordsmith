# Release Checklists

Use these notes before tagging or publishing any Pocket Audio family artifact.

## Release-Hardening Patch Checks

- Chordsmith: run `npm run build`, `npm run test:e2e`, and `npm run package:itch`; verify the Settings export dropdown lists Section A-H, Export All Sections, and Export Song Sequence; verify section WAV export maps to the selected section scope instead of the song sequence.
- Pocket DJ: run `npm run test:e2e` and `npm run package:itch`; verify the packaged demo deck loads Pocket Audio Core from `./pocket-audio-core/...` rather than falling back to legacy-only status.
- Pocket Audio Core: run `npm test` and `npm run build`; keep `scope:"section"`, `scope:"sequence"`, and `scope:"all"` timeline behavior covered by tests.
- Pocket DAW: run `npm test`, `npm run build`, and `npm run verify:versions`; installer packaging still needs a Rust/Tauri-capable Windows release machine before publishing.
- Pocket DAW sound-parity release checks must include a known lofi/chillhop Chordsmith project with non-default master/chord/beat/lead/guitar volumes, a Chordsmith/DJ/DAW A/B, per-drum lane mixer/FX smoke, and a Godot Adaptive/Game Pack import smoke.
- Use `../POCKET_AUDIO_SOUND_PARITY_MATRIX.md` before writing sound-parity claims in release notes.
- Godot addon: no runtime validation is implied by web/package checks; release validation still needs Godot 4.x and the active game project.

## Web App

- Confirm `apps/chordsmith-web/index.html` redirects to the intended current build.
- Serve `apps/chordsmith-web/` locally and smoke test demo load, play/stop, JSON import/export, `PCS1:` import/export, WAV export, and mobile width.
- If port `4174` is already occupied, run the Chordsmith Playwright smoke with an alternate port, for example `$env:PORT='4184'; npm run test:e2e`.
- Verify the Settings export dropdown covers Section A-H plus all sections and song sequence, and that section WAV export uses the matching selected scope.
- Verify `Push to DJ` and `Push to Godot` still preserve handoff payloads.
- Run `npm run package:itch` from `apps/chordsmith-web/` and confirm the zip contains `index.html`, `pocket_chordsmith_v68_core_bridge.html`, and `pocket-audio-core/` fallback files at the root.

## Pocket DJ

- Confirm `apps/pocket-dj/index.html` redirects to the intended current build.
- Smoke test `PCS1:` import, raw JSON import, demo load, play/stop, section queueing, mutes, build/drop, and edit-back handoff.
- Run `npm run package:itch` and confirm the zip contains `index.html`, `pocket_dj_v1g_core_bridge.html`, and `pocket-audio-core/` fallback files at the root.
- Keep Pocket DJ as a performance/remix deck, not a second Chordsmith editor.

## Pocket DAW

```powershell
cd apps/pocket-daw
npm install
npm test
npm run build
npm run verify:native-release
```

- Keep `package.json` `private: true`.
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, installers, or local `.pocketdaw` saves.
- Run a clean native Tauri package check before publishing installers.
- Publish Pocket DAW to itch only as a native/installable Windows build, normally the `windows-installer` channel.
- Do not upload the browser preview zip, `dist/`, or any HTML5/WebAudio build to itch for Pocket DAW.

## Godot Addon

- Confirm `addons/pocket_chordsmith/plugin.cfg` exists and the version matches release docs.
- Package addon-only releases through `addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd` or the equivalent Godot export workflow.
- Treat GitHub source archives as full monorepo archives, not addon-only downloads.
- Confirm release exports exclude Godot `.uid` and `.import` metadata.
- Verify the local push receiver path still works in an open Godot editor.
