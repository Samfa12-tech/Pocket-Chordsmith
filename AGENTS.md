# Pocket Chordsmith Agent Guide

Use this file as the low-token entrypoint for Codex and other coding agents.

## Start Here

1. Read `PROJECT_MEMORY.md` first for the current monorepo shape, baselines, ignored local reference folders, and release boundaries.
2. For browser app work, read `apps/chordsmith-web/POCKET_CHORDSMITH_CODEX_CONTEXT.md` before editing.
3. Inspect the current implementation before changing behavior; prefer small, surgical patches.

## Active Project Shape

- Browser composer: `apps/chordsmith-web/`
- Pocket DJ: `apps/pocket-dj/`
- Pocket DAW: `apps/pocket-daw/`
- Shared runtime/export package: `packages/pocket-audio-core/`
- Godot addon: `addons/pocket_chordsmith/`

Do not move `addons/pocket_chordsmith/`. Canonical app changes belong under `apps/`.

## Pocket DAW Native Windows Boundary

Pocket DAW is a native-only Windows desktop DAW under `apps/pocket-daw/`.

Do not implement Pocket DAW as:

- a browser/HTML5 app
- a standalone HTML file
- a Web Audio DAW
- a Pocket Chordsmith mode
- a Pocket DJ remix deck

Pocket DAW uses a Tauri shell and TypeScript UI, but DAW work must preserve
the native Windows app boundary and native audio
playback/recording/render/export paths.

Core invariant:

> The native audio engine / sample clock owns timing. The UI follows audio
> state; UI timers, animation frames, wall-clock callbacks, and visual
> playheads must not drive musical playback, recording placement,
> render/cache timing, or export duration.

For Pocket DAW tasks, inspect `apps/pocket-daw/`,
`apps/pocket-daw/src-tauri/`, Pocket DAW docs, tests, release status, and
native/audio bridge code before editing. Do not create a new web DAW.

## Local Skills

- Use `apps/chordsmith-web/skills/pocket-chordsmith-composer/SKILL.md` when creating, improving, validating, or exporting Pocket Chordsmith song JSON.
- Use `addons/pocket_chordsmith/SKILL.md` when modifying or integrating the Godot addon.

The composer skill must verify the current app constants and export/import contract before generating JSON. The current app may be newer than the skill text.

## Design Plugins

Do not load broad design guidance by default.

- Use Stark only for deliberate UI/UX, product-flow, visual redesign, platform, or design-token work.
- Use Universal Design Principles selectively for a named design question, such as creative-flow immersion, too many visible controls, accessibility, legibility, or information hierarchy.
- For ordinary audio/runtime/export fixes, use the project docs and local skills first.

## Guardrails

- Keep Pocket Chordsmith portable and mostly single-file unless a task explicitly changes that.
- Do not add external libraries, remote assets, or online-only dependencies by default.
- Preserve JSON import/export, share codes, save slots, autosave, MIDI export/import, WAV export, handoffs, sections, tuplets, holds, slides, bass, drums, guitar, and melody playback unless the task explicitly targets them.
- Keep generated outputs out of git: `node_modules/`, `dist/`, `src-tauri/target/`, installers, release zips, Godot `.import`/`.uid`, and local `.pocketdaw` saves.
- For Godot addon releases, use `addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd` for addon-only payloads.

## Pocket DAW Release Notes For Agents

- Read `apps/pocket-daw/docs/RELEASE_TESTING_FAST_PATH.md` before any checkpoint build or hardware smoke. Follow its one-pass order; do not reconstruct the release procedure from older checklist fragments.
- For Pocket DAW, work from `apps/pocket-daw/` and keep release metadata aligned across `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and `src/daw/schema.ts`.
- Use the bundled guarded commands rather than adding duplicate manual passes: build/stage with `npm run release:update:full`, run `npm run verify:itch` once, restage same-version artifacts with `npm run release:update:fast`, collect exact-installer evidence, then run `npm run verify:candidate` once.
- Commit release-script or doc fixes before the final `npm run package:itch`; the generated release manifest records the current commit and whether the working tree is dirty.
- Run one combined strict installed audio/MIDI/export smoke with `--record-ms 10000 --midi-record-ms 10000`. MIDI input is the agent's job through `scripts/send-loopmidi-smoke.ps1`; do not repeatedly ask the user to exercise the microphone.
- After exact-installer smoke, do not run an installer-producing command. In particular, `release:update:publish` rebuilds and must not be used against already-collected evidence. Publish the exact files already staged under `releases/updater/` and bind the release tag to the tested commit.
- GitHub release uploads may normalize installer asset names with spaces to dots, for example `Pocket.DAW_0.6.3_x64-setup.exe`. Generate the updater manifest with the actual downloadable asset URL and verify it with `curl -L -I`.
- Normal Pocket DAW checkpoints do not push itch. The existing `samfa12/pocket-daw:windows-installer` channel contains the stable bootstrapper; run `PUBLISH=1 npm run itch:push:bootstrapper` only when that bootstrapper payload changes. The full-installer itch push is an emergency/manual fallback.
- After uploading, verify both latest/download manifests, download and hash the remote setup EXE, check `gh release view`, and confirm the release tag, remote target commit, `origin/main`, and tested commit agree. Use `butler status` only to confirm the unchanged bootstrapper channel remains healthy.
