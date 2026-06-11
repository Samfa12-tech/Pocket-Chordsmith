# Pocket Chordsmith Workspace

This working folder holds the active Pocket Chordsmith family projects plus local release, archive, package, and marketing material.

## Projects

- `web-app/` - the single-file browser Pocket Chordsmith app. Start here for HTML app work, itch.io web uploads, app context, and the composer skill.
- `godot-addon/` - the Godot addon release repository. This folder has its own `.git` history and should be treated as a separate project.
- `pocket_dj/` - the Pocket DJ prototype and planning workspace. This is the performance/remix companion app for Pocket Chordsmith projects.
- `packages/pocket-audio-core/` - the shared parser, timeline, render, adaptive music, and export package for the Pocket Chordsmith family.
- `pocket-daw/` - nested Pocket DAW app/repo. Treat its internal history separately from the root workspace unless intentionally updating the subproject pointer.

## Local Working Folders

- `releases/godot-addon/` - previously built Godot addon ZIP packages.
- `archive/web-app-snapshots/` - older browser app HTML snapshots kept for reference.
- `archive/pocket_chordsmith_v65_complete_codex_instructions.md` - the v65 implementation brief.
- `marketing-assets/asset-store/` - asset-store thumbnails and promotional images.

## Git Layout

The root Git repo tracks the browser app workspace organisation, Pocket DJ prototype files, docs, and the Pocket Audio Core package. The Godot addon and Pocket DAW folders have their own nested histories and should be handled deliberately so the histories do not get tangled.

Current local state to remember:

- Root GitHub target: `https://github.com/Samfa12-tech/Pocket-Chordsmith`.
- `godot-addon/` has its own nested repo for addon-specific release work.
- `pocket-daw/` has its own nested repo; do not stage the root gitlink unless the workspace is intentionally pointing at a new Pocket DAW commit.

## Where To Work

- Codex workspace memory: `CODEX.md`
- Browser app changes: `web-app/`
- Browser app context/memory: `web-app/POCKET_CHORDSMITH_CODEX_CONTEXT.md`
- Godot addon changes: `godot-addon/`
- Pocket DJ prototype work: `pocket_dj/`
- Pocket Audio Core package work: `packages/pocket-audio-core/`

## Latest Browser App Build

Updated build:

- `web-app/pocket_chordsmith_v68_core_bridge.html`

v68 focuses on the first Pocket Audio Core bridge while preserving direct handoffs between Pocket Chordsmith, Pocket DJ, and the Godot addon.

Highlights:

- Send to DJ opens Pocket DJ with the current song attached as a `PCS1:` handoff, with copy/paste as fallback.
- Push to Godot first tries the local Godot addon receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`, then falls back to copying the `PCS1:` code and showing the paste/import path.
- Pocket DJ can send the original source song back to Pocket Chordsmith with Edit this song.
- Pocket Chordsmith v68 and Pocket DJ v1g load Pocket Audio Core locally for shared timeline diagnostics and control mirroring where safe.
- Pocket Audio Core now includes game runtime and Godot export kit docs/APIs.
- The shared handoff format remains existing `PCS1:` project data.

Compatibility notes:

- Project schema remains `16`.
- v65 MIDI/guitar import polish and v64 western sound compatibility remain supported.
- DJ performance mutes, loops, and FX are not written back into Pocket Chordsmith.

## Pocket Audio Core Reports

Start with:

- `docs/POCKET_AUDIO_CORE_COMPLETION_REPORT.md`
- `docs/POCKET_AUDIO_CORE_APP_INTEGRATION_REPORT.md`
- `docs/POCKET_AUDIO_CORE_PARITY_REPORT.md`
- `docs/NEW_GAME_AUDIO_RUNTIME_GUIDE.md`
- `docs/GODOT_PARITY_EXPORT_WORKFLOW.md`
- `docs/POCKET_DAW_FOUNDATION_DESIGN.md`
