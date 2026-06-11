# Pocket DJ

Pocket DJ is the standalone performance/remix companion for Pocket Chordsmith.

Pocket Chordsmith is the studio. Pocket DJ is the stage: import a Pocket Chordsmith song, trigger sections, mute stems, loop bars, shape FX, build tension, and drop back into the groove.

## Current Prototype Files

- `pocket_dj_v1_planning_doc.md` - product concept, MVP scope, acceptance criteria, roadmap, and design warnings.
- `pocket_dj_v1_codex_prompt.txt` - compact implementation prompt for building the prototype.
- `pocket_dj_v1g_core_bridge.html` - current standalone HTML prototype/build with Pocket Audio Core bridge diagnostics.
- `pocket_dj_v1f_push_handoffs.html` - previous push-handoff build.
- `pocket_dj_v1e_help_polish.html` - previous help-polish build.

## v1 Boundary

Pocket DJ v1 should prove the core idea:

- Import a `PCS1:` share code.
- Import raw Pocket Chordsmith JSON.
- Convert the song into a performance session.
- Show section pads A-H.
- Provide stem controls for drums, bass, chords, melody, and guitar.
- Support live section launching, mutes, loops, master filter, and simple build/drop FX.
- Stay mobile-first and performance-focused.
- Send the original source song back to Pocket Chordsmith with `Edit this song`, using a direct handoff when possible and copy/paste as fallback.

Pocket DJ should not become a second composition editor. Deep chord, melody, MIDI, guitar grid, and arrangement editing should stay in Pocket Chordsmith.

## Baseline Compatibility

Use Pocket Chordsmith v68 as the current import baseline:

- Share-code prefix: `PCS1:`
- Project schema version: `16`
- Sections: `A` through `H`
- Per-section chords, drums, bass, melody, guitar, time signature, and arrangement data
- JSON/share-code import logic compatible with `web-app/pocket_chordsmith_v68_core_bridge.html`
- Edit-back handoff opens Pocket Chordsmith with the original source song attached as `PCS1:` when possible, and still copies the code as fallback.

## Release Notes

### v1g Pocket Audio Core Bridge

- New file/version: `pocket_dj_v1g_core_bridge.html`.
- Updated to Pocket Audio Core `0.1.0-scaffold`.
- Project schema remains `16`; imports and edit-back handoffs still use `PCS1:`.
- Pocket Audio Core now handles local shared project load/timeline diagnostics and mirrors deck controls for play, stop, section queue, stem mute/volume, FX, build, and drop when the repo-local core module is available.
- Known limitations: the legacy Pocket DJ Web Audio scheduler/synth remains the audible playback fallback until full sound parity is proven; public itch deployment needs the core bundled beside the HTML before the bridge can load outside the repo.

## Next Work

Before extending the prototype, read `pocket_dj_v1_planning_doc.md`, then compare the import assumptions against `../web-app/POCKET_CHORDSMITH_CODEX_CONTEXT.md`.
