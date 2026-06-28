# Pocket Audio Family Release Dashboard

Last refreshed: 2026-06-28 from local repo metadata and project docs.

This dashboard is a manually maintained cross-app index. It does not replace component release manifests, itch/GitHub evidence, or installed-app smoke records. Use it to find the current baseline, the validation gate to run before edits, and the release-truth anchor for each surface.

## Current Baselines

| Surface | Current local baseline | Public/release truth anchor | Validation gate | Release boundary |
| --- | --- | --- | --- | --- |
| Pocket Chordsmith web composer | `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`; schema `16` | `apps/chordsmith-web/POCKET_CHORDSMITH_CODEX_CONTEXT.md`; `PROJECT_MEMORY.md` for latest itch push notes | `cd apps/chordsmith-web; npm run test:e2e` | Portable browser app. Keep mostly single-file and preserve `PCS1:`, JSON import/export, share codes, MIDI, WAV, sections, tuplets, holds, slides, bass, drums, guitar, melody, and handoffs. |
| Pocket DJ | `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`; package `1.0.0` | `apps/pocket-dj/README.md`; `apps/pocket-dj/docs/PDJ1_SESSION_FORMAT.md` for future session boundary | `cd apps/pocket-dj; npm run test:e2e` | Hosted web performance/remix app. `PDJ1` should capture performance state without rewriting the source `PCS1` composition. |
| Pocket DAW | source/public checkpoint `0.6.34`; `.pocketdaw` schema `2` | `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md`, generated from `apps/pocket-daw/release-status.json` | `cd apps/pocket-daw; npm run verify:versions; npm test; cargo test --manifest-path src-tauri/Cargo.toml` | Installed Windows alpha. Public itch channel is `samfa12/pocket-daw:windows-installer`; do not publish a browser/HTML5 DAW app. |
| Pocket Audio Core | package `0.1.0-scaffold` | `packages/pocket-audio-core/README.md`; `docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md`; `docs/POCKET_AUDIO_CORE_MIDI_EXPORT_CHECKPOINT.md` | `cd packages/pocket-audio-core; npm test; npm run build; npm run verify:family-parity` | Shared runtime/export scaffold. Do not claim full sound parity until fixture, browser trace, DAW, and Godot evidence support it. |
| PCS Format | package `0.1.0-scaffold` | `packages/pcs-format/README.md` | `cd packages/pcs-format; npm test; npm run build` | Shared format contract slice for `PCS1:`, schema-16 metadata, parser result/error types, field validation, and fixtures. It is not the full app behavior owner yet. |
| Godot addon | addon `1.1.7` in `addons/pocket_chordsmith/` | `addons/pocket_chordsmith/README.md`; `addons/pocket_chordsmith/plugin.cfg`; `addons/pocket_chordsmith/docs/HEADLESS_VALIDATION.md` | Godot headless gates in `HEADLESS_VALIDATION.md`; addon package via `tools/package_pocket_chordsmith_addon.gd` | Reusable Godot addon. Keep addon-only packaging under `addons/pocket_chordsmith/` and exclude generated `.import`, `.uid`, `.godot/`, export builds, and local caches. |

## Current Audit Loop

The active audit workplan is:

```text
docs/audits/2026-06-27-deep-audit-workplan.md
```

Current audit-loop state:

- The named deep-audit rows in `docs/audits/2026-06-27-deep-audit-workplan.md` are marked done in `codex/audit-wave-1`.
- `TASK-18` now has installed Windows `0.6.34` evidence for `.pocketdaw` association, cold-start launch, second-instance launch, live project open, and `pocket-daw://` Chordsmith handoff coexistence.
- Larger release confidence still depends on normal exact-artifact release smoke, updater smoke, and any publishing checklist required for the next public checkpoint.

## Release Notes For Agents

- DAW release truth is exact-artifact based. If a source version, public updater version, itch upload, and installed-smoke version differ, trust `apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md` for what can be claimed.
- Chordsmith and Pocket DJ hosted builds should keep `index.html` and package root layout valid before itch upload.
- Godot addon releases should use the addon packager, not a monorepo archive, when a clean addon-only payload is required.
- Core and PCS Format are scaffolds with important contracts. Treat their tests as boundary guards, not proof that every app has migrated to them.
- Design docs added by the deep audit are release-planning anchors, not promises that features are implemented.

## Useful Commands

```powershell
# Chordsmith browser composer
cd apps/chordsmith-web
npm run test:e2e

# Pocket DJ
cd apps/pocket-dj
npm run test:e2e

# Pocket DAW
cd apps/pocket-daw
npm run verify:versions
npm test
cargo test --manifest-path src-tauri/Cargo.toml

# Pocket Audio Core
cd packages/pocket-audio-core
npm test
npm run build
npm run verify:family-parity

# PCS Format
cd packages/pcs-format
npm test
npm run build
```
