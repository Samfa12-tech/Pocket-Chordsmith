# Pocket Chordsmith Codex Context

Use this file as stable project context for Codex before making any Pocket Chordsmith update.

Current baseline: `pocket_chordsmith_v68_core_bridge.html`
Previous direct-Godot baseline retained for fallback/reference: `pocket_chordsmith_v67_direct_godot_push.html`
Canonical monorepo path: `apps/chordsmith-web/`
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

These are the important current-v68 facts Codex should assume and verify in the file before editing:

- The app title is Pocket Chordsmith v68.
- `PROJECT_SCHEMA_VERSION` is currently 17. Schema 16 remains the supported legacy import/projection boundary.
- `SECTION_IDS` currently supports `["A","B","C","D","E","F","G","H"]`.
- `MAX_MELODY_TRACKS` is currently 6.
- MIDI ticks per quarter are currently 480.
- MIDI import is Advanced mode only.
- MIDI export supports quantized/performance style handling and exact MIDI durations.
- Existing data normalisation and import/export functions are important. Do not bypass them.
- Existing render, scheduler, playback and export functions are tightly connected. Changes must be tested across live playback, MIDI export and WAV export.
- Recent compatibility features include western procedural instruments, playback-section visual following, guitar fill/generation helpers, compact JSON export, and `Push to DJ` / `Push to Godot` handoffs using existing `PCS1:` codes.
- v67 upgraded `Push to Godot` to try the local Godot addon receiver first, then keep the v66 clipboard/paste fallback.
- v68 adds the first Pocket Audio Core bridge for local project load/timeline diagnostics and a core-first WAV export path when the local module is available.
- Mobile-to-desktop DAW/Godot handoff is intentionally a PCS1 transfer flow, not direct localhost push. `Send to Pocket DAW` and `Push to Godot` only reach apps on the same device; phone users should use Mobile transfer to open `https://samfa12.com/apps/pocket-audio-handoff/`. When the relay is available, Chordsmith/page create a short `SAM-...` code for desktop pickup; if not, the page falls back to hash links, copy, and `.pcs1.txt` download.
- New fields must remain optional and backwards compatible.

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

### Game runtime and export integration lessons

When generating or adapting Pocket Chordsmith output into browser games, especially WebGL-heavy games, the exported music engine must protect musical layers as well as raw performance. Do not rely on one global audio voice limit or one global overload guard.

Reference games in `C:\Users\sam_s\Documents` include Fish Tank, Ant Farm, Spin Vector, Possum Cafe, Moon Mower, Dust on the River and Party Bus. The lighter games show that a compact Pocket Chordsmith-style Web Audio runtime works well for HTML games: structured score data stays cheap, adaptive sections are easy, and no large audio-file pipeline is needed. Party Bus is the stress case because its Babylon scene, ultra graphics mode, enemies, shadows, bloom, lights and particles leave less main-thread room for last-moment audio node creation.

Reference lesson: the Party Bus performance/audio issue showed that a single global overload guard kept drums alive but starved chords, guitar, bass and melody under ultra graphics load. The engine looked stable because the beat survived, but the song lost its musical identity. Grouped budgets restored the beat, bass, harmony, chug/guitar and melody layers while still keeping total node count stable.

Best architecture for HTML games:

- keep Pocket Chordsmith as the musical brain: progression, beat, bass, chord/pad, guitar/chug, lead/melody, ambience and state/section data
- add a small game music runtime adapter around the score instead of pasting the full app engine into each game
- let the adapter own scheduling, voice groups, resource caching, node cleanup, debug counters and game-state transitions
- keep music state separate from the renderer; game scenes can request mode changes such as menu, calm, danger, return, victory or pause without directly creating audio nodes
- treat SFX as another budgeted role, not as a free unlimited path that can steal the music budget

Generated or adapted game music engines should use:

- audio-clock-based lookahead scheduling, usually around 0.18-0.36 seconds ahead
- a short scheduler interval, usually around 30-40 ms
- dropped-step recovery when the main thread stalls, by advancing past missed steps and counting them, not by slowing tempo or bunching late notes together
- dedicated buses or voice groups for beat, bass, chord/pad, guitar/chug, lead/melody, air/ambience and SFX
- per-role voice limits for beat, bass, chord/pad, guitar/chug, lead/melody, air/ambience and SFX, plus a total voice budget
- priority rules that preserve core musical identity layers under load instead of letting drums, ambience or SFX consume all voices
- cleanup, stop handling and disconnection of Web Audio nodes when each voice ends
- cached reusable noise buffers, distortion curves, impulse responses and other shared audio resources instead of rebuilding them per note
- sample-backed preview hits where they preserve the Pocket Chordsmith sound with less CPU, especially drums, guitar articulations, stingers and simple tonal preview layers
- prewarmed and decoded sample buffers after the first user audio unlock, with trimmed silent tails and a gain map per sample or layer
- debug counters in game builds for audio context state, active voices, per-group active counts, peak voices and dropped scheduler steps

For heavy browser games, a useful starting voice budget is:

- beat: 10
- bass: 4
- chord/pad: 8
- guitar/chug: 6
- lead/melody: 5
- air/ambience: 3
- SFX: 8
- total: 32

Treat these as starting points, not fixed rules. The important rule is that every musical role keeps a reserved lane, and SFX or dense hats should be dropped before bass, harmony or melody disappear.

Useful debug overlay shape:

```text
audio running  voices 21/32  peak 29
beat 4 bass 1 chord 3 chug 2 lead 1 air 0 sfx 3
dropped scheduler steps 2
```

Avoid these patterns in game exports:

- BPM-derived `setInterval()` that fires one music step at a time with only a tiny start offset
- creating noise buffers, distortion curves or impulse responses inside every note/hit function
- creating dense distorted chord/chug/lead stacks without per-role limits
- a single global voice cap or overload guard that preserves whichever role schedules first
- lowering tempo to recover from main-thread stalls
- counting FPS as proof that audio is healthy

Party Bus-specific diagnosis:

- Party Bus uses a fixed BPM step interval and schedules events only slightly ahead; ultra rendering stalls can make the scheduler itself late.
- Its danger/return music can trigger drums, bass, metal chords, chug and lead on the same step.
- Distorted voices create several oscillators/filters/waveshapers, and the current style of noise hit can allocate a fresh buffer per hit.
- The right first fix is not to remove the Chordsmith sound. Replace step-timer playback with lookahead scheduling, add grouped budgets, cache shared audio resources, disconnect ended nodes, and add audio counters to the existing debug overlay.

Stress-test exported or adapted engines in the heaviest graphics preset and densest gameplay state. FPS alone is not enough proof that audio is safe, because Web Audio scheduling and node creation still compete with game JavaScript on the main thread. A valid stress result should confirm that every role bus remains represented musically, not just that the beat stays audible.

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

### Local Node tooling

In this Codex desktop workspace, plain `node` may resolve to the protected Codex app package under `C:\Program Files\WindowsApps\...` and fail with `Access is denied`.

Use the bundled user-cache Node instead:

```powershell
& 'C:\Users\sam_s\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --version
```

For single-file HTML syntax checks, extract and parse the inline script with Node's `vm.Script`; do not run `node --check` directly against the `.html` file.

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

- shared game music runtime/export adapter for HTML games
- stronger game/adaptive music export guidance and examples
- Party Bus-style stress-test fixtures for heavy WebGL/Babylon scenes
- grouped voice budgets, debug counters and cached Web Audio resources in generated game engines
- improved sound design and tone shaping
- more demo songs
- Godot addon/runtime compatibility
- better mobile arrangement editing
- improved documentation and tooltips
- stronger MIDI import/export polish

When in doubt, protect the stable music-making core first.
