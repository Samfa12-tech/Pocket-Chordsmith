# Codex Prompt 01 — Design and Inventory Report

We are starting the Pocket Audio Core project.

Do not perform the full extraction yet. First, inspect the current project and produce a detailed design/inventory report.

## Goal

Identify exactly what needs to move from Pocket Chordsmith and Pocket DJ into a shared **Pocket Audio Core** package, while keeping current apps stable.

## Inspect

Find and document the current implementation of:

1. `PCS1:` share-code parsing and building.
2. Raw JSON project import/export.
3. Project/schema normalisation.
4. Section A-H data handling.
5. Song sequence handling.
6. Time signature, BPM, swing and grid resolution handling.
7. Tuplet/triplet handling.
8. Chord/scale generation.
9. Drum grid playback.
10. Bass playback including manual/auto, holds, slides and accents.
11. Chord playback including chord instrument, rhythm mode, play mode and octave.
12. Melody playback including multiple tracks, mute/solo/pan, instruments, holds, slides and tuplets.
13. Guitar playback including guitar enabled, tone, register, strum mode, volume and pattern data.
14. FX: delay, reverb, chorus, flanger, filter, sidechain/pump.
15. Live lookahead scheduler.
16. Voice limiting / voice pruning / safe fadeouts.
17. Offline/WAV rendering.
18. MIDI import/export functions and which parts should or should not move to core.
19. Pocket DJ session conversion, stem mixer, queueing, build/drop, loop, FX controls.
20. Godot addon chart/export expectations, if present.

## Deliverables

Create or update:

```text
docs/POCKET_AUDIO_CORE_INVENTORY.md
docs/POCKET_AUDIO_CORE_EXTRACTION_PLAN.md
docs/POCKET_AUDIO_CORE_API_DRAFT.md
```

The inventory must include:

- source file/function names
- whether each function should move to core, stay in app UI, or be duplicated temporarily
- data fields touched
- live playback path
- offline render path
- tests needed
- known risks

The extraction plan must include phases:

1. Schema/normalisation.
2. Timeline/event generation.
3. Live engine.
4. Offline renderer.
5. Stem mixer/FX.
6. Game/adaptive API.
7. Pocket DJ integration.
8. Pocket Chordsmith integration.
9. DAW foundation.
10. Godot export parity.

The API draft must propose a small public API for:

- loading projects/share codes
- live playback
- section queueing
- sequence playback
- stem mixer controls
- FX controls
- game state/adaptive music
- offline WAV/stem rendering
- event subscriptions
- diagnostics

## Rules

- Do not rewrite existing apps yet.
- Do not remove old functions yet.
- Do not break current single-file HTML builds.
- Be honest about any part of the codebase that is too tangled or risky.
- Use concrete function names and file paths from the current repo.

## Tests

No full test suite is required in this step, but run syntax/static checks if possible and report commands used.
