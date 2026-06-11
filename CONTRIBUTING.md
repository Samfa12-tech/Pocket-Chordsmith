# Contributing

Thanks for helping with Pocket Audio. This repository is still settling into a
public monorepo shape, so small, reviewable contributions are the best fit.

## Before You Start

- Read `LICENSES.md`; the repo has mixed licensing.
- Keep `apps/pocket-daw/` private-boundary and WIP unless a maintainer explicitly changes that status.
- Do not move `addons/pocket_chordsmith/`; Godot installs and release tooling depend on that path.
- Do not commit generated output such as `node_modules/`, `dist/`, release zips, installers, Playwright reports, or `src-tauri/target/`.

## Good First Areas

- Documentation fixes and link cleanup.
- Small examples for `PCS1:`, JSON import/export, and Pocket Audio Core usage.
- Test fixtures for import/export compatibility.
- Playwright or Node tests around existing behavior.
- Godot addon examples, getting-started notes, and runtime callback snippets.
- CI, package metadata, and release-checklist improvements.

## Development Checks

Run only the checks relevant to the files you changed, plus broader checks when
you touch shared data or package boundaries.

Pocket Audio Core:

```powershell
cd packages/pocket-audio-core
npm install
npm test
npm run build
```

Pocket Chordsmith web:

```powershell
cd apps/chordsmith-web
npm install
npm run build
npm run test:e2e
```

Pocket DJ:

```powershell
cd apps/pocket-dj
npm install
npm run test:e2e
```

Pocket DAW:

```powershell
cd apps/pocket-daw
npm install
npm test
npm run build
```

## Pull Request Guidelines

- Keep changes scoped to one purpose.
- Explain the affected component and license/status boundary if relevant.
- Include tests run and any skipped manual checks.
- Avoid product rewrites in drive-by PRs. Open an issue or discussion first for
  larger editor, runtime, audio-engine, or DAW changes.
