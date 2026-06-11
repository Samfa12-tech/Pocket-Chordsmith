# Pocket Audio Family

Pocket-Chordsmith is the canonical public monorepo for the Pocket Audio family: browser composition, live performance, desktop production, shared data/runtime packages, and the Godot game integration addon.

Current Godot addon release: `1.1.6`, with direct local Push-to-Godot browser handoff support.

## Projects

- `apps/chordsmith-web/` - Pocket Chordsmith web, the composition sketchpad/studio for writing progressions, sections, drums, bass, melody, guitar, MIDI exports, WAV exports, and `PCS1:` share data.
- `apps/pocket-dj/` - Pocket DJ, the standalone live performance/remix deck. It imports `PCS1:`, share-code, and raw Pocket Chordsmith JSON, then turns songs into section pads, stem controls, loops, and FX.
- `apps/pocket-daw/` - Pocket DAW, the private desktop/native arrangement and production app built with Vite, TypeScript, and Tauri.
- `addons/pocket_chordsmith/` - Pocket Chordsmith Godot addon. This path is intentionally preserved for Godot addon installs and release packaging.
- `packages/pcs-format/` - future shared PCS format definitions, migrations, fixtures, and compatibility helpers.
- `packages/pocket-audio-core/` - shared playback/export/runtime work for web, DJ, DAW, and game runtimes.

## Current App Entries

- Pocket Chordsmith web: `apps/chordsmith-web/index.html`
- Pocket DJ: `apps/pocket-dj/index.html`
- Pocket DAW: `apps/pocket-daw/package.json`
- Godot addon plugin: `addons/pocket_chordsmith/plugin.cfg`

## Godot Addon

The addon imports Pocket Chordsmith JSON/share-code data into compiled Godot chart resources, then drives runtime music callbacks through a lightweight conductor node.

Pipeline:

```text
Pocket Chordsmith JSON -> importer/schema migrator -> PCSChartResource -> PocketChordsmithConductor
```

Push-to-Godot from the browser app:

1. In Pocket Chordsmith, open Settings > Project & export.
2. Click `Push to Godot`.
3. If the addon is enabled in an open Godot editor, the browser app sends the `PCS1:` song code to the local receiver at `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot`.
4. The `Chordsmith` tab imports and compiles the song.
5. Click `Save Chart Resource` to save the compiled `.tres` or `.res` chart.
6. If local push is unavailable, paste the copied `PCS1:` code manually in the addon.

## Data Flow

Pocket Chordsmith creates song projects and exports `PCS1:`/JSON. Pocket DJ imports those projects for live remixing, Pocket DAW imports them for native arrangement and production, and the Godot addon consumes compatible chart/runtime data for games.

Pocket Audio Core and PCS format packages are the long-term shared layer for making playback, conversion, export, and compatibility feel consistent across the family. This consolidation pass keeps that direction explicit without forcing every app onto one engine at once.

## Development Notes

- Keep `addons/pocket_chordsmith/` stable for Godot users.
- Keep Pocket DJ separate from the Chordsmith editor UI.
- Keep Pocket DAW `private: true` unless licensing and release boundaries are deliberately changed.
- Do not commit generated app output such as `node_modules/`, `dist/`, `src-tauri/target/`, installers, release zips, or local `.pocketdaw` demo saves.

See `docs/architecture/POCKET_AUDIO_FAMILY.md` and `docs/repo-consolidation/MIGRATION_PLAN.md` for the consolidation map.
