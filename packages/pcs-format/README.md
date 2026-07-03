# PCS Format

First shared Pocket Chordsmith / Pocket Audio format contract slice.

This package currently owns stable `PCS1:` prefix metadata, schema-16
`projectVersion` metadata, the legacy `schemaVersion` compatibility alias, basic
parser result/error types, top-level and declared-section field validation, and
fixtures that preserve unknown fields. It also exposes small helpers for
schema-16 song-sequence and per-section summaries so fixtures can prove that
Section A and song-sequence units are present without importing an app runtime.
Helpers accept both compact suffixed section fields such as `progressionA` and a
`sections.A.progression` object shape when present. It does not own app UI
defaults, full runtime normalization, or audio behavior.

The exported `PCS_FORMAT_SCOPE` and `PCS_FIXTURE_ROLES` constants are metadata
guardrails for the current scaffold. `fixtures/index.json` records the committed
fixture corpus and high-level expectations without making this package the
canonical owner of every app's import behavior yet.

## Future Compression Direction

Long-term planning should include a smart share-code/JSON compression format for
shorter Pocket Audio transfer codes, URLs, QR payloads, and mobile handoffs.
This should be treated as a family-level format project, not a quick encoder
swap: it would affect Pocket Chordsmith, Pocket DJ, Pocket DAW, the Godot addon,
Pocket Audio Core, hosted handoff pages, fixtures, migrations, and every import
fallback that currently accepts `PCS1:` or raw JSON. Any future compressed format
must keep old `PCS1:` codes readable, define clear version/prefix behavior, and
ship only after compatibility tests prove round-trips across the app family.

License/status: WIP private package scaffold, `UNLICENSED`, and `private: true`.
See the repository root `LICENSES.md` before reusing or redistributing package
code.

Do not move app-specific editor, DJ, DAW, or Godot runtime behavior here until the shared boundary is proven.
