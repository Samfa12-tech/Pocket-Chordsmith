# Pocket Chordsmith Codex Context

Use this file as stable project context for Codex before making any Pocket Chordsmith update.

Current baseline: `pocket_chordsmith_v61_rock_guitar_fix.html`  
Project type: single-file, mobile-first browser music sketchpad  
Core build style: HTML, CSS and JavaScript in one file unless a specific update deliberately changes that  

---

## 1. Product identity

Pocket Chordsmith is a mobile-first browser music sketchpad for quickly building musical ideas that can also scale into deeper song sketches.

It is not just a chord toy. It now includes:

- chord progression building
- drum sequencing and live drum pad playback/recording
- bass sequencing
- multiple melody tracks
- chromatic/free-note melody mode
- holds, slides and tuplet/triplet markers
- section-based arrangement
- up to eight song sections, A-H
- timeline/song sequence arrangement
- JSON export/import
- share code export/import
- browser save slots and autosave
- MIDI export
- MIDI import in Advanced mode
- WAV export
- mobile-first UI
- Simple and Advanced modes

The app should remain immediately usable by beginners while still offering deeper composition tools in Advanced mode.

---

## 2. Non-negotiable design rules

### Simple mode stays simple

Simple mode must remain clean, friendly and beginner safe.

Do not expose every new feature in Simple mode. A simple toggle, preset or friendly default is acceptable, but deeper controls belong in Advanced mode.

### Advanced mode can be powerful

Advanced mode is where complex tools should live:

- MIDI import
- detailed melody tools
- detailed arrangement tools
- advanced export settings
- detailed instrument controls
- experimental or composer-facing features

### Mobile-first always

Every UI change must be checked at phone width.

Avoid controls spilling off screen. Avoid dense text walls. Prefer compact controls, short labels and tooltips.

### Preserve existing work

Do not break existing projects, local save slots, autosave, JSON import/export, share codes, MIDI export, WAV export, section playback, melody playback, triplets, holds, slides, drum sequencing or bass sequencing.

All new data fields must be optional and backwards compatible.

### Surgical updates

Do not rewrite unrelated systems just to add a feature.

Inspect the current architecture first, then patch the smallest safe area. Add helper functions with clear names rather than scattering logic through unrelated code.

### No external dependencies by default

Pocket Chordsmith should remain portable and easy to host on itch.io as a single HTML file. Avoid external libraries, remote assets or online-only dependencies unless explicitly requested.

### Output safety

Audio features must avoid painful harshness and clipping. Use sensible gain staging, filtering, limiting/compression where practical, and conservative defaults.

---

## 3. Current known architecture facts

These are the important current-v61 facts Codex should assume and verify in the file before editing:

- The app title is Pocket Chordsmith v61.
- `PROJECT_SCHEMA_VERSION` is currently 16.
- `SECTION_IDS` currently supports `["A","B","C","D","E","F","G","H"]`.
- `MAX_MELODY_TRACKS` is currently 6.
- MIDI ticks per quarter are currently 480.
- MIDI import is Advanced mode only.
- MIDI export supports quantized/performance style handling and exact MIDI durations.
- Existing data normalisation and import/export functions are important. Do not bypass them.
- Existing render, scheduler, playback and export functions are tightly connected. Changes must be tested across live playback, MIDI export and WAV export.

Useful areas to inspect before most changes:

- state/default project creation
- schema version and project normalisation
- section data creation and syncing
- save/load slots
- autosave
- JSON import/export
- share code import/export
- UI rendering functions
- playback scheduler
- live synth functions
- offline/WAV render functions
- MIDI export functions
- MIDI import parser and importer
- melody track normalisation
- tuplet/triplet normalisation

---

## 4. Locked feature behaviour

### Sections and arrangement

Pocket Chordsmith supports sections A-H.

Each section can hold its own progression, drums, bass, melody and related data. The arrangement/song sequence can chain sections into a longer song.

Any update touching playback, export, import or UI must respect section-specific data and the full song arrangement.

### Grid resolution

The app supports straight grid resolutions such as full, half, quarter, eighth and sixteenth.

Changing resolution must preserve the musical intent of existing notes. Do not duplicate notes incorrectly when increasing resolution. Do not truncate playback length when moving between resolutions.

### Triplets and tuplets

Triplets are not a separate resolution.

They are tuplet markers on the normal grid:

- user places two adjacent notes/hits
- user marks the two-cell span as a triplet
- the two-cell span plays three evenly spaced events in the time of those two cells
- triplet starts must not overlap
- consecutive triplets should use clean pairs such as 1-2, 3-4, 5-6
- triplets must work in live playback, MIDI export and WAV export

Do not convert this into swing. Do not add a separate triplet grid resolution unless explicitly requested in a future update.

### MIDI import

MIDI import is Advanced mode only.

Current expected import behaviours include:

- `.mid` and `.midi`
- format 0 and 1
- tempo detection
- time signature fallback
- drum channel mapping
- bass mapping
- melody import
- spreading simultaneous upper notes across multiple melody tracks where possible
- respecting the current maximum melody track count

Do not make MIDI import visible or cluttered in Simple mode.

### MIDI export

Do not break existing MIDI export.

MIDI export should continue to preserve:

- drum export
- bass export
- chord export options where present
- melody export
- holds
- slides where represented
- triplet timing
- quantized/performance logic
- exact durations when enabled

Any new musical lane or instrument should export to MIDI where practical, but never by breaking the existing tracks.

### WAV export

WAV export should include all currently audible musical parts.

Any new audio engine or instrument must be included in offline rendering if it is included in live playback.

### Melody system

The melody system supports multiple tracks and must remain intact.

Important behaviours:

- up to 6 melody tracks
- active melody track selection
- mute/solo/pan support where present
- per-track instruments where present
- octave handling
- holds
- slides
- tuplets/triplets
- chromatic/free-note mode

Do not simplify the melody system to add new features.

### Drum system

The drum system includes sequenced drums and live drum pad playback/recording.

Beat cells cycle through off/hit/accent style states. Existing drum timing, triplets and export must continue working.

### Bass system

The bass system includes manual bass sequencing with accents, holds and slides.

Do not break bass export, bass playback or bass interaction when adding chord/guitar features.

---

## 5. Coding expectations

Before changing code:

1. Inspect the relevant existing functions.
2. Identify the current data shape.
3. Identify save/load and normalisation paths.
4. Identify live playback path.
5. Identify offline/WAV export path.
6. Identify MIDI export path.
7. Identify UI render path.
8. Make the smallest safe change.
9. Add backwards-compatible defaults.
10. Test old projects and new projects.

Preferred implementation style:

- clear helper functions
- defensive checks
- optional new data fields
- normalise missing/legacy data
- no global sprawl where avoidable
- avoid duplicate logic between live playback and offline export where practical
- comments for tricky timing logic
- no removal of established features without explicit instruction

Useful naming patterns:

- `createXState()`
- `normaliseXState()`
- `ensureXLength()`
- `renderXPanel()`
- `scheduleXStep()`
- `playXVoice()`
- `exportXToMidi()`
- `importXFromProject()`
- `serializeXData()`

---

## 6. UI and UX rules

Pocket Chordsmith is often used on phones.

UI rules:

- Big enough touch targets.
- No controls hidden below unreachable areas.
- Avoid horizontal overflow.
- Avoid long labels in crowded rows.
- Prefer compact panels.
- Prefer progressive disclosure.
- Prefer tooltips for explanations.
- Keep Simple mode minimal.
- Put serious editor controls in Advanced mode.
- Use friendly labels in UI and clearer technical names in code.

When adding a feature, include:

- a simple default or preset
- a safe reset path
- clear feedback/status message when user action succeeds or fails
- no confusing silent failure

---

## 7. Audio engine rules

The app uses Web Audio style synthesis.

Audio rules:

- Avoid harsh, piercing or unexpectedly loud sounds.
- Use conservative default gain.
- Use filtering to control high end.
- Avoid clipping.
- Prefer short release tails for dense rhythmic parts.
- Mobile performance matters.
- Avoid spawning excessive nodes for very dense patterns where a simpler approach works.
- Live playback and WAV export should match as closely as practical.

For distorted sounds:

- Distortion must be controlled.
- High gain should not just mean louder.
- Use filtering/EQ/cab-style shaping.
- Low end should not explode in volume.
- Palm-muted sounds should be shorter and tighter than open sounds.

---

## 8. Project compatibility rules

Every new feature must consider these compatibility paths:

- New blank project
- Existing local autosave
- Existing browser slot
- Existing JSON import
- Existing share code import
- Legacy project normalisation
- MIDI export
- WAV export
- Advanced/Simple mode switching
- Section switching
- Song arrangement playback
- Mobile portrait layout

Missing new data must never crash old projects.

When adding a new property to state, also update:

- default state creation
- project export
- project import
- normalisation/migration
- section copy/sync if section-based
- autosave/browser slot flow if needed
- share code flow if needed
- any UI reset/demo logic if relevant

---

## 9. Testing checklist for every update

Minimum tests after each change:

1. Load the app without errors.
2. Start a new project and press Play.
3. Switch Simple and Advanced modes.
4. Change resolution and confirm playback length is correct.
5. Add drum hits and accents.
6. Add bass notes, holds and slides.
7. Add melody notes across multiple melody tracks.
8. Add triplets and confirm they play correctly.
9. Use consecutive triplets and confirm no overlaps or skipped notes.
10. Create sections A, B and C, then arrange them in the song sequence.
11. Export JSON and import it back.
12. Save to browser slot and reload it.
13. Export share code and import it back.
14. Export MIDI.
15. Export WAV.
16. Confirm MIDI import remains Advanced mode only.
17. Check mobile-width layout.
18. Confirm no console errors.

For larger feature updates, also test older JSON/share code data if available.

---

## 10. Versioning and release notes

When Codex completes an update:

- increment the visible version if the app has a visible version marker
- summarise the update clearly
- list changed functions
- list new data fields
- list migration/backwards compatibility decisions
- list known limitations
- list tests performed
- do not claim tests were performed unless they actually were

Recommended response format after coding:

```text
Updated build:
- pocket_chordsmith_vXX_feature_name.html

What changed:
- ...

New data fields:
- ...

Functions touched:
- ...

Compatibility notes:
- ...

Tests run:
- ...

Known limitations:
- ...
```

---

## 11. Current roadmap priorities

Likely future updates may include:

- rock/metal guitar rhythm engine
- power chord and chug sequencing
- improved sound design and tone shaping
- more demo songs
- game/adaptive music export improvements
- Godot addon/runtime compatibility
- better mobile arrangement editing
- improved documentation and tooltips
- stronger MIDI import/export polish

When in doubt, protect the stable music-making core first.
