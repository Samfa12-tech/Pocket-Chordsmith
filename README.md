# Pocket Chordsmith Workspace

This working folder holds the three active Pocket Chordsmith projects plus local release, archive, and marketing material.

## Projects

- `web-app/` - the single-file browser Pocket Chordsmith app. Start here for HTML app work, itch.io web uploads, app context, and the composer skill.
- `godot-addon/` - the Godot addon release repository. This folder has its own `.git` history and should be treated as a separate project.
- `pocket_dj/` - the Pocket DJ prototype and planning workspace. This is the performance/remix companion app for Pocket Chordsmith projects.

## Local Working Folders

- `releases/godot-addon/` - previously built Godot addon ZIP packages.
- `archive/web-app-snapshots/` - older browser app HTML snapshots kept for reference.
- `archive/pocket_chordsmith_v65_complete_codex_instructions.md` - the v65 implementation brief.
- `marketing-assets/asset-store/` - asset-store thumbnails and promotional images.

## Git Layout

The root Git repo tracks the browser app workspace organisation and Pocket DJ prototype files. The Godot addon remains a nested repo and is ignored by the root repo so the two histories do not get tangled.

Current local state to remember:

- The root repo is a local workspace repo and currently has no remote configured.
- `godot-addon/` has its own remote: `https://github.com/Samfa12-tech/Pocket-Chordsmith.git`.
- The local Godot addon repo has release `1.1.5`; the GitHub remote currently appears to be behind that local release.

## Where To Work

- Codex workspace memory: `CODEX.md`
- Browser app changes: `web-app/`
- Browser app context/memory: `web-app/POCKET_CHORDSMITH_CODEX_CONTEXT.md`
- Godot addon changes: `godot-addon/`
- Pocket DJ prototype work: `pocket_dj/`

## Latest Browser App Build

Updated build:

- `web-app/pocket_chordsmith_v67_direct_godot_push.html`

v67 focuses on direct handoffs between Pocket Chordsmith, Pocket DJ, and the Godot addon.

Highlights:

- Send to DJ opens Pocket DJ with the current song attached as a `PCS1:` handoff, with copy/paste as fallback.
- Push to Godot first tries the local Godot addon receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`, then falls back to copying the `PCS1:` code and showing the paste/import path.
- Pocket DJ can send the original source song back to Pocket Chordsmith with Edit this song.
- The shared handoff format remains existing `PCS1:` project data.

Compatibility notes:

- Project schema remains `16`.
- v65 MIDI/guitar import polish and v64 western sound compatibility remain supported.
- DJ performance mutes, loops, and FX are not written back into Pocket Chordsmith.

## Next Major Work

The current planned feature family is the "Push to" additions. Before extending those, use the v67 browser app as the baseline and read the current project memory in `web-app/POCKET_CHORDSMITH_CODEX_CONTEXT.md`.
