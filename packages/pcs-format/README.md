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

License/status: WIP private package scaffold, `UNLICENSED`, and `private: true`.
See the repository root `LICENSES.md` before reusing or redistributing package
code.

Do not move app-specific editor, DJ, DAW, or Godot runtime behavior here until the shared boundary is proven.
