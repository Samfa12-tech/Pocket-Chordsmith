# ADR: Exact MIDI Chord Overlays And PCS1 Compatibility

**Status:** Accepted for the 2026-07-14 source checkpoint  
**Scope:** Pocket DAW MIDI transcription and future Chordsmith-web compatibility

## Decision

Faithful MIDI chord transcription uses Pocket DAW's existing chord-overlay metadata as the canonical exact representation. Each event keeps its MIDI pitch set, velocity, duration and source note provenance. Faithful playback suppresses the generated schema progression so exact overlays are not doubled by simplified chords.

The overlay contract has one velocity and duration per chord onset. Faithful Apply is therefore blocked, with an explicit loss warning, when a source chord requires unequal per-note velocities/durations, pitch deduplication, singleton storage, timing collisions or duration capping. Changing tempo/meter maps and non-/4 meters are likewise kept as raw MIDI rather than mislabeled lossless.

No Pocket Chordsmith project-schema bump is introduced in this update. The 74-bar validation case fits schema 16 because A-H support up to 16 bars each (128 unique bars).

## Compatibility boundary

Schema-16 PCS1 progression data has one global chord type and scale-degree progression slots. It cannot exactly represent mixed qualities, exact voicings or the final parallel-major tonic in the validation fixture.

Therefore:

- `.pocketdaw` keeps the exact chord overlays.
- Any future PCS1 progression copy derived from exact overlays must be labeled `simplified` and include a loss report.
- Pocket DAW does not currently claim a DAW-to-PCS1 exact export.
- Chordsmith-web optional overlay round-trip is deferred until an extension can be ignored safely by existing schema-16 readers and verified across Pocket Chordsmith, Pocket DAW, Pocket DJ, shared runtime/export code and Godot import boundaries.

## Consequences

This preserves exact DAW playback/edit provenance now without silently changing the Pocket Audio family contract. The tradeoff is that exact mixed-quality chord editing remains DAW-local for this checkpoint.
