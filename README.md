# Pocket Audio

Pocket Audio is a family of small music tools for sketching songs, performing
them live, arranging them for production, and moving adaptive music into games.
This repository is the public source home for the Pocket Audio family and the
Pocket Chordsmith Godot addon.

Licensing is mixed. Some parts are MIT, while several apps and packages are
currently source-available or WIP rather than broadly open-source licensed. See
`LICENSES.md` before reusing code.

Project hub: `https://samfa12.com`

## Components

| Component | Path | What it does | License status |
| --- | --- | --- | --- |
| Pocket Chordsmith | `apps/chordsmith-web/` | Browser music sketchpad for progressions, sections, drums, bass, melody, guitar, MIDI, WAV, JSON, and `PCS1:` share data. | Source-available, UNLICENSED |
| Pocket DJ | `apps/pocket-dj/` | Live performance/remix deck that imports Pocket Chordsmith songs and turns them into section pads, stem controls, loops, builds, drops, and FX. | Source-available, UNLICENSED |
| Pocket DAW | `apps/pocket-daw/` | Alpha-testing Windows desktop arrangement app for Pocket Chordsmith projects, distributed on itch with a Tauri installer/updater path. | Alpha-testing binary on itch; source-available, UNLICENSED |
| Pocket Audio Core | `packages/pocket-audio-core/` | Shared headless runtime/export scaffold for parsing, normalising, rendering timelines, Web Audio playback, WAV/stem output, and game-music APIs. | WIP/private package source, UNLICENSED |
| PCS Format | `packages/pcs-format/` | Future shared format definitions, fixtures, migrations, and compatibility helpers for `PCS1:` and related JSON. | WIP/private package scaffold, UNLICENSED |
| Pocket Chordsmith Godot addon | `addons/pocket_chordsmith/` | Godot editor/runtime addon that imports Pocket Chordsmith data, compiles chart resources, and drives conductor callbacks in games. | MIT |

Public app links already referenced in this repo:

- Pocket Chordsmith: `https://samfa12.itch.io/pocket-chordsmith`
- Pocket DJ: `https://samfa12.itch.io/pocket-dj`
- Pocket DAW alpha: `https://samfa12.itch.io/pocket-daw`

## Data Flow

```text
Pocket Chordsmith
  -> PCS1 share code / JSON
  -> Pocket DJ for live remixing
  -> Pocket DAW for arrangement and production experiments
  -> Pocket Chordsmith Godot addon for game integration
  -> Pocket Audio Core / PCS packages as shared compatibility layers
```

Pocket Chordsmith is the current authoring source. Pocket DJ and Pocket DAW
consume compatible song data rather than replacing the Chordsmith editor. The
Godot addon compiles exported data into lightweight chart resources and runtime
signals for games.

## Run The Main Apps

Pocket Chordsmith:

```powershell
cd apps/chordsmith-web
npm install
npm run dev
npm run build
npm run test:e2e
npm run package:itch
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

Pocket DAW is live for Windows alpha testing on itch. Treat
`apps/pocket-daw/docs/CURRENT_RELEASE_STATUS.md`, generated from
`apps/pocket-daw/release-status.json`, as the current source/public/smoke truth.
The current audited release truth is `0.6.34`; install from itch for normal
testing and use the in-app updater for future update tests rather than
redownloading manually each time. Installer packaging and smoke evidence should
be recorded against the exact generated artifact before publishing a new build.

Pocket Audio Core:

```powershell
cd packages/pocket-audio-core
npm install
npm test
npm run build
```

## Godot Addon

The addon path is intentionally stable:

```text
addons/pocket_chordsmith/
```

To use it in Godot:

1. Copy or install `addons/pocket_chordsmith/` into a Godot project.
2. Enable the `Pocket Chordsmith` plugin.
3. Open the `Chordsmith` editor screen.
4. Import Pocket Chordsmith JSON or paste a `PCS1:` share code.
5. Save the compiled chart resource.
6. Assign the chart to `PocketChordsmithConductor` in a scene.

The browser app can also push to an open Godot editor through the local receiver
at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`, with clipboard/manual
paste fallback if local push is blocked.

More addon docs:

- `addons/pocket_chordsmith/README.md`
- `addons/pocket_chordsmith/docs/GETTING_STARTED.md`
- `addons/pocket_chordsmith/docs/LEVEL_INTEGRATION.md`
- `addons/pocket_chordsmith/docs/SHIPPING_CHECKLIST.md`

## Examples

- Minimal PCS data example: `docs/examples/minimal-pcs-project.md`
- Pocket Audio Core browser examples: `packages/pocket-audio-core/examples/`
- Godot export sketch: `packages/pocket-audio-core/examples/godot-export-demo/README.md`
- Godot runtime bridge notes: `addons/pocket_chordsmith/docs/RUNTIME_BRIDGE.md`

## Contributing

Start with `CONTRIBUTING.md`. Good first areas are docs, examples, tests,
import/export compatibility, fixture coverage, Godot examples, and small CI or
metadata improvements. Avoid large product rewrites unless they are planned in
`docs/public-roadmap.md` or discussed first.

Security and responsible disclosure notes are in `SECURITY.md`.

## Project Notes

- Current Godot addon release: `1.1.7`.
- Keep `addons/pocket_chordsmith/` stable for Godot installs and addon-only packaging.
- Do not commit generated output: `node_modules/`, `dist/`, `src-tauri/target/`,
  installers, release zips, Playwright reports, or local `.pocketdaw` saves.
- GitHub source archives are full monorepo archives. Addon-only releases should
  use `addons/pocket_chordsmith/tools/package_pocket_chordsmith_addon.gd`.

For architecture context, see:

- `docs/architecture/POCKET_AUDIO_FAMILY.md`
- `docs/CROSS_APP_RELEASE_DASHBOARD.md`
- `docs/audits/POCKET_DAW_STABILIZATION_COVERAGE_2026-06-21.md`
- `docs/repo-consolidation/MIGRATION_PLAN.md`
- `PROJECT_MEMORY.md`
