# Audit Fix Notes

Branch: `fix/monorepo-audit-cleanup`

## Files Changed

- `.gitattributes`
  - Removed addon-only `export-ignore` rules so GitHub source archives represent the full public monorepo.
- `MIGRATION.md`
  - Replaced the stale addon-only migration guide with pointers to repo consolidation docs and the addon-local migration guide.
- `PROJECT_MEMORY.md`
  - Recorded the source archive/addon package boundary for future maintenance.
- `docs/release-checklists/README.md`
  - Added web zip validation expectations and the addon-only package path.
- `.github/workflows/ci.yml`
  - Added CI covering repo hygiene, Pocket Audio Core, Chordsmith web, Pocket DJ, and Pocket DAW.
- `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`
  - Fixed Pocket Audio Core import paths for the monorepo layout and packaged web fallback.
  - Updated local Pocket DJ handoff path to `apps/pocket-dj`.
- `apps/chordsmith-web/vite.config.js`
  - Added v68 as a production build input.
- `apps/chordsmith-web/tests/smoke.spec.js`
  - Updated smoke tests from v67 to v68 and added a Pocket Audio Core status check.
- `apps/chordsmith-web/scripts/package-itch.mjs`
  - Builds Pocket Audio Core, bundles core source/dist fallbacks into `dist/pocket-audio-core/`, copies `icon.png`, creates the itch zip under `releases/chordsmith-web/`, and validates required zip entries.
- `apps/chordsmith-web/scripts/serve-repo.mjs`
  - Added repo-root static server for browser smokes so monorepo-relative package imports resolve.
- `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`
  - Fixed Pocket Audio Core import paths for the monorepo layout and packaged fallback.
- `apps/pocket-dj/package.json`, `apps/pocket-dj/package-lock.json`, `apps/pocket-dj/playwright.config.js`, `apps/pocket-dj/scripts/serve-repo.mjs`, `apps/pocket-dj/tests/core-smoke.spec.js`
  - Added a lightweight browser smoke test proving Pocket DJ loads a demo through Pocket Audio Core.

## Validation Run

- `npm install` in `packages/pocket-audio-core`
- `npm install` in `apps/chordsmith-web`
- `npm install` in `apps/pocket-dj`
- `npm install` in `apps/pocket-daw`
- `npm test` in `packages/pocket-audio-core` - 44 passed
- `npm run build` in `packages/pocket-audio-core`
- `npm test` in `apps/pocket-daw` - 83 passed
- `npm run build` in `apps/pocket-daw` - passed with the existing Vite mixed static/dynamic import warning for `@tauri-apps/api/core.js`
- `npm run build` in `apps/chordsmith-web`
- `npm run test:e2e` in `apps/chordsmith-web` - 6 passed
- `npm run test:e2e` in `apps/pocket-dj` - 1 passed
- `npm run package:itch` in `apps/chordsmith-web`
- Package script zip validation and `tar -tf releases/chordsmith-web/pocket-chordsmith-web.zip` confirmed root entries including:
  - `index.html`
  - `pocket_chordsmith_v68_core_bridge.html`
  - `icon.png`
  - `pocket-audio-core/src/index.js`
  - `pocket-audio-core/dist/pocket-audio-core.esm.js`

## Skipped Or Manual Checks

- Godot editor addon enablement was not run locally.
- Native Tauri installer packaging was not run; only the DAW web/TypeScript build and tests were run.
- The itch zip was generated and validated locally, but upload/publish was not performed.

## `.gitattributes` Decision

Chose Option A: remove addon-only source archive filtering. This makes GitHub source archives match the public monorepo and avoids hiding `apps/`, `packages/`, and docs from source downloads.

Addon-only releases should be produced through `addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd` or the equivalent Godot export workflow. The Godot Asset Library path stays safe because addon release payloads are now explicitly documented as a packaging step instead of an implicit repository archive behavior.
