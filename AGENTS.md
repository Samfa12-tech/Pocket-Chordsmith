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
