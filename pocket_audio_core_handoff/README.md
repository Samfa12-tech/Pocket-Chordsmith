# Pocket Audio Core Handoff Pack

This pack is designed for Codex work on a new shared audio engine branch called **Pocket Audio Core**.

The goal is not to immediately rewrite existing games. The goal is to design and build a reusable, tested, versioned audio runtime that new games can use first, then migrate Pocket Chordsmith, Pocket DJ, Pocket DAW, and Godot workflows when the core is proven.

## Files

- `pocket_audio_core_project_brief.md` - project brief and architectural direction.
- `versioning_and_release_policy.md` - how core updates should flow into Pocket Chordsmith, Pocket DJ, Pocket DAW, Godot, and new games.
- `prompts/00_master_context_prompt.md` - paste this at the start of a new Codex session.
- `prompts/01_design_inventory_prompt.md` - audit/extraction design prompt.
- `prompts/02_core_scaffold_prompt.md` - create the initial core package and API surface.
- `prompts/03_extract_engine_prompt.md` - extract current Pocket Chordsmith/DJ audio logic into the core.
- `prompts/04_parity_harness_prompt.md` - build tests/golden fixtures to prove identical timing and sound.
- `prompts/05_integrate_chordsmith_dj_prompt.md` - update Pocket Chordsmith and Pocket DJ to use the shared core.
- `prompts/06_new_game_runtime_prompt.md` - API and starter integration for new HTML/Three/Babylon games.
- `prompts/07_godot_export_parity_prompt.md` - Godot export/import workflow with parity-first stems/kits.
- `prompts/08_pocket_daw_foundation_prompt.md` - Pocket DAW architecture: broader than Chordsmith, but Chordsmith-compatible.

## Recommended order

1. Run `00_master_context_prompt.md` in a fresh Codex session.
2. Run `01_design_inventory_prompt.md` to inspect the current code and produce the migration plan.
3. Run `02_core_scaffold_prompt.md` to create the core package.
4. Run `03_extract_engine_prompt.md` only after the scaffold is reviewed.
5. Run `04_parity_harness_prompt.md` before wiring the core into real apps.
6. Use prompts 05-08 as integration phases, not all at once.

## Key principle

Pocket Audio Core is the shared sound truth. Pocket Chordsmith, Pocket DJ, Pocket DAW, Godot exports, and new games should not drift into separate implementations of the same instruments, scheduler, effects, or project normalisation.
