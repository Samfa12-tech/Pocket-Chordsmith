# Pocket Audio Family Consolidation Inventory

## Source Repositories And Folders

### Public `Pocket-Chordsmith`

- Inspected: current checkout and shallow clone from `https://github.com/Samfa12-tech/Pocket-Chordsmith`.
- Apparent current role: public Godot addon repository plus local family workspace.
- Important files: `addons/pocket_chordsmith/plugin.cfg`, addon runtime/editor/import/tools/resources/audio/docs, root addon `README.md`, `CHANGELOG.md`, `MIGRATION.md`, `LICENSE`.
- Apparent current version: Godot addon `1.1.6`.
- Likely stale files: older top-level workspace-only layout references that described `godot-addon/` as a separate nested repo.
- Likely release artifacts: local `releases/`, addon zips, prompt-pack zips.
- Do not copy: nested `.git` directories, release zips, `_tmp/`, generated caches.
- Proposed destination: keep addon source at `addons/pocket_chordsmith/`.

### Private `pocket-chordsmith-web`

- Inspected: shallow clone from `https://github.com/Samfa12-tech/pocket-chordsmith-web`.
- Apparent current role: older private browser app repo.
- Important files: `index.html`, `README.md`, `CHANGELOG.md`, `REPO_SETUP_NOTES.md`.
- Apparent current version: older than the local v67/v68 builds.
- Likely stale files: single older web snapshot compared with local `web-app/pocket_chordsmith_v68_core_bridge.html`.
- Likely release artifacts: none found in the shallow clone.
- Do not copy: older app snapshot as the current build.
- Proposed destination: reference only; prefer local `web-app/` for `apps/chordsmith-web/`.

### Local `web-app/`

- Inspected: `web-app/` in this workspace.
- Apparent current role: newest Pocket Chordsmith browser app workspace.
- Important files: `index.html`, `pocket_chordsmith_v68_core_bridge.html`, `pocket_chordsmith_v67_direct_godot_push.html`, `demo.json`, `icon.png`, `background.png`, `POCKET_CHORDSMITH_CODEX_CONTEXT.md`, `skills/pocket-chordsmith-composer/SKILL.md`, package/test scripts.
- Apparent current version: v68 current, v67 retained as direct Godot push baseline.
- Likely stale files: v61-v66 HTML builds are useful snapshots, not current entry points.
- Likely release artifacts: `dist/`, `node_modules/`, Playwright outputs.
- Do not copy: `node_modules/`, `dist/`, `playwright-report/`, `test-results/`, `.codex-server-logs/`, random zips.
- Proposed destination: `apps/chordsmith-web/`, with older intentional snapshots under `apps/chordsmith-web/archive/`.

### Local `pocket_dj/`

- Inspected: `pocket_dj/` in this workspace.
- Apparent current role: standalone Pocket DJ prototype and planning workspace.
- Important files: `pocket_dj_v1g_core_bridge.html`, `pocket_dj_v1f_push_handoffs.html`, `pocket_dj_v1_planning_doc.md`, `pocket_dj_v1_codex_prompt.txt`, `README.md`.
- Apparent current version: v1g current, v1f retained for push-handoff reference.
- Likely stale files: v1e help-polish snapshot.
- Likely release artifacts: none found.
- Do not copy: none beyond old snapshots unless intentionally archived.
- Proposed destination: `apps/pocket-dj/`, docs under `apps/pocket-dj/docs/`.

### Private `pocket-daw`

- Inspected: shallow clone from `https://github.com/Samfa12-tech/pocket-daw` and the local nested `pocket-daw/` working tree.
- Apparent current role: Vite/TypeScript/Tauri Pocket DAW app.
- Important files: `package.json`, `package-lock.json`, `index.html`, `src/`, `src-tauri/`, `scripts/`, `tests/`, `tsconfig.json`, `WHAT_WORKS_AND_WHATS_NEXT.md`, `POCKET_DAW_NORTH_STAR.md`, relevant docs.
- Apparent current version: package version `0.5.1`; local tree includes newer uncommitted Pocket Audio Core/handoff integration files not present in the shallow clone.
- Likely stale files: generated logs and release copies.
- Likely release artifacts: `node_modules/`, `dist/`, `src-tauri/target/`, installers, release packages.
- Do not copy: nested `.git`, `node_modules/`, `dist/`, `src-tauri/target/`, generated installers, release zips, logs.
- Proposed destination: `apps/pocket-daw/`.

### Local `packages/pocket-audio-core/`

- Inspected: `packages/pocket-audio-core/` in this workspace.
- Apparent current role: existing shared runtime/export package scaffold and early implementation.
- Important files: `package.json`, `src/`, `tests/`, `scripts/`, examples, golden fixtures.
- Apparent current version: `0.1.0-scaffold`.
- Likely release artifacts: `dist/`.
- Do not copy: generated `dist/`.
- Proposed destination: keep at `packages/pocket-audio-core/`.

### New `packages/pcs-format/`

- Inspected: not previously present.
- Apparent current role: future shared PCS format package.
- Proposed destination: scaffold at `packages/pcs-format/`.
