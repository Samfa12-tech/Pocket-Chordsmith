# PCS Format

First shared Pocket Chordsmith / Pocket Audio format contract slice.

This package currently owns stable `PCS1:` prefix metadata, schema-16 metadata,
basic parser result/error types, top-level and section-field validation, and
fixtures that preserve unknown fields. It also exposes small helpers for
schema-16 song-sequence and per-section summaries so fixtures can prove that
Section A and song-sequence units are present without importing an app runtime.
It does not own app UI defaults or full runtime normalization.

License/status: WIP private package scaffold, `UNLICENSED`, and `private: true`.
See the repository root `LICENSES.md` before reusing or redistributing package
code.

Do not move app-specific editor, DJ, DAW, or Godot runtime behavior here until the shared boundary is proven.
