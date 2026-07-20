# Pocket Chordsmith Migration Notes

This repository is now the public Pocket Audio family monorepo. Use the current
consolidation map for repo-level migration work:

- `docs/repo-consolidation/MIGRATION_PLAN.md`
- `docs/repo-consolidation/CONSOLIDATION_REPORT.md`

The Godot addon migration guide still lives with the addon source:

- `addons/pocket_chordsmith/MIGRATION.md`

## PCS schema 17 and sound profiles

PCS schema 17 is additive and keeps the existing `PCS1:` envelope. Existing
schema-16 and older projects continue to import. Projects that use expressive
events, expanded drum lanes, or first-class Western/Funk identity should be
saved as schema 17.

- Keep `soundProfile.id`, `soundProfile.preset`, `recipeVersion`, and unknown
  profile parameters when moving projects between family apps.
- Keep sparse `sections.*.tracks.*.events` data authoritative when it exists.
- Use the PCS Format legacy projector only when an older target requires
  schema 16; inspect its structured loss report before distributing the result.
- Do not overwrite a rich source project with a lossy projection. Consumers
  retain it under compatibility metadata when they must render a fallback.
- Stable profile IDs are `standard`, `lofi_chill`, `chip_arcade`,
  `western_frontier`, `heavy_metal`, and `funk_groove`.

The complete contract and backend responsibilities are documented in
`docs/SOUND_PROFILE_EVOLUTION_ARCHITECTURE.md`.

GitHub source archives now contain the full monorepo. For addon-only publishing,
use the dedicated Godot addon packaging path documented in
`docs/release-checklists/README.md` instead of relying on repository archive
filters.
