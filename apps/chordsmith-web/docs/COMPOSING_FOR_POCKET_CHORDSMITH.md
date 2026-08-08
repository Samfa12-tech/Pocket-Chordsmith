# Composing for Pocket Chordsmith v68 / PCS Schema 17

This versioned instruction replaces historical guidance that required native
schema-16 output. The current app and its export/import implementation are the
authority when they differ from examples or older prompts.

## Authoring Contract

- Generate native schema 17 by default (`projectVersion: 17`).
- Use explicit rich `sections.A` through `sections.H` fields and sparse note
  events for expressive intent. Keep the compact per-section A-H fields required
  by the current app's editable grid/export contract.
- Preserve unknown root, profile, section, track and event fields. Do not erase
  rich intent merely because a current renderer does not understand it.
- Write melody attacks as explicit note events with pitch, step/tick, duration
  and expressive fields where available. Blank sustain cells are not a safe
  substitute for an explicit generated phrase.
- Emit schema 16 only when a named target cannot read schema 17. Use the app's
  compatibility projection, retain the rich source, and inspect every entry in
  the structured loss report before distributing the projection.

## Current Shape

- Sections are `A` through `H`.
- `sectionBars` defines the played length of each section.
- `songSequence` contains only `A`-`H` and defines full-song playback order.
- Rich tracks live under `sections.<ID>.tracks.<role>.events`.
- `formatFeatures` and `soundProfile` carry negotiated schema-17 capabilities
  and rendering identity.
- Schema 16 remains importable as a legacy-safe compatibility boundary; it is
  not the default authoring target.

Before creating JSON, inspect
`apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html` for
`PROJECT_SCHEMA_VERSION`, `SECTION_IDS`, limits, `sanitizeProjectData()`,
`exportProject()`, `projectToSchema16()` and the current capability/loss-report
logic. The local composer skill at
`apps/chordsmith-web/skills/pocket-chordsmith-composer/SKILL.md` has the detailed
field contract.

## Required Validation

1. Parse the generated JSON.
2. Import it into the current v68 app.
3. Select Section A and confirm its chord, drum, bass, guitar and explicit
   melody-note events survived normalisation.
4. Press Section A play and confirm the section starts and stops normally.
5. Press Play Song and confirm the complete `songSequence` plays in order.
6. Export schema 17, re-import it, and compare the musical/rich intent.
7. If a schema-16 target is required, export the compatibility projection and
   inspect its loss report; do not describe a lossy projection as exact.

Repository paths are `apps/chordsmith-web/`, `apps/pocket-dj/`,
`apps/pocket-daw/`, `apps/pocket-audio-handoff/`,
`packages/pocket-audio-core/`, `packages/pcs-format/` and
`addons/pocket_chordsmith/`. Historical `web-app/` or nested `godot-addon/`
workspace instructions are not current.
