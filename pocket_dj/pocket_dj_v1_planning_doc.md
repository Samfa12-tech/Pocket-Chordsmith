# Pocket DJ v1 Planning and Use Case Document

## 1. Working Title

**Pocket DJ**

Possible alternatives:
- Pocket Decks
- Chordsmith DJ
- Pocket Remix
- Pocket Groovebox
- Pocket Jam Deck

Recommended title for v1: **Pocket DJ**

This is the clearest name and immediately communicates the intended use case. It also fits naturally beside **Pocket Chordsmith** as a companion app.

---

## 2. Core Concept

**Pocket DJ** is a standalone, mobile-first remix and live-performance app built around Pocket Chordsmith project compatibility.

Pocket Chordsmith is the composition tool. Pocket DJ is the performance tool.

The app allows users to import Pocket Chordsmith JSON files or `PCS1:` share codes and instantly turn them into a live remix deck with section pads, track mutes, loops, builds, drops, filters and effects.

The app should feel related to Pocket Chordsmith, but not like a stripped-down version of it. Pocket DJ should have its own identity: fast, tactile, playful, performance-focused and visually energetic.

### One-line pitch

**Pocket DJ turns your Pocket Chordsmith songs into live remix decks. Import a share code, trigger sections, mute tracks, loop bars, build tension and drop the beat.**

---

## 3. Relationship to Pocket Chordsmith

Pocket Chordsmith should remain the **studio**.

Pocket DJ should become the **stage**.

### Pocket Chordsmith does:
- chord writing
- melody writing
- drum programming
- bass programming
- guitar pattern editing
- MIDI import/export
- detailed arrangement
- section editing
- songwriting and composition

### Pocket DJ does:
- performance
- remixing
- section launching
- live looping
- track muting
- filtering
- build/drop macros
- live FX
- performance recording, later
- export of DJ sessions, later

Pocket DJ should not become another editor. If the user wants to change chords or notes, they should go back to Pocket Chordsmith.

---

## 4. Compatibility Goal

Pocket DJ v1 must import existing Pocket Chordsmith projects.

The current Pocket Chordsmith v64 structure uses:
- Share code prefix: `PCS1:`
- Project schema version: `16`
- Section IDs: `A, B, C, D, E, F, G, H`
- Maximum bars per section: `4`
- Song sequence support
- Per-section chord progressions
- Per-section drum grids
- Per-section melody tracks
- Per-section bass data
- Per-section guitar patterns
- FX, sidechain, swing, BPM, key and scale settings

Pocket DJ should support:
- pasted `PCS1:` share codes
- raw Pocket Chordsmith JSON
- later, its own `PDJ1:` share codes

---

## 5. Recommended App Boundary

Pocket DJ should be standalone.

It may reuse selected Pocket Chordsmith code, but it should not simply duplicate the whole Chordsmith interface.

### Reuse from Pocket Chordsmith
- JSON/share-code parsing
- project sanitisation logic
- timing/scheduler concepts
- Web Audio synthesis functions
- section playback logic
- drum, bass, chord, melody and guitar playback functions
- FX bus concepts
- WAV export logic later

### Do not reuse directly
- full composer grid UI
- full advanced editing panels
- MIDI import UI
- melody note editor
- chord palette editor
- drum preset editor
- guitar grid editor
- full settings system unless simplified

Pocket DJ needs its own streamlined performance UI.

---

## 6. Target User

Pocket DJ is for people who already have or can receive a Pocket Chordsmith song and want to perform with it.

### Primary user scenarios

#### Scenario 1: Chordsmith creator performs their own song
A user makes a song in Pocket Chordsmith, exports a share code, opens Pocket DJ, pastes the code and performs the song live with section pads, mutes, loops and effects.

#### Scenario 2: User remixes a shared Chordsmith song
A user receives a Pocket Chordsmith share code from someone else. They paste it into Pocket DJ and immediately start remixing it without needing to understand the composition interface.

#### Scenario 3: Quick mobile jam
A user opens Pocket DJ on a phone, loads a saved project, taps section pads, filters the track, drops the bass back in and records or exports the result later.

#### Scenario 4: Game/music asset prototyping
The user imports a Chordsmith arrangement and experiments with live variations that could later become game music states, loops or performance exports.

---

## 7. Product Feel

Pocket DJ should feel:
- immediate
- tactile
- darker and more neon than Pocket Chordsmith
- mobile-first
- performance-first
- fun within five seconds
- less technical than Chordsmith
- suitable for phones in portrait orientation
- usable on desktop with mouse and keyboard

### Design tone

Pocket Chordsmith feels like a compact composition studio.

Pocket DJ should feel like a pocket-sized club controller.

Suggested visual style:
- deep navy or near-black background
- neon cyan, magenta, violet, lime or amber accents
- glowing section pads
- large rounded buttons
- animated beat pulse
- fixed bottom transport
- clear track strips
- minimal text while performing

---

## 8. Core Differentiating Factor

Pocket DJ is not a normal DJ app based on MP3 files.

Its point of difference is that it performs **structured musical data**.

Because it imports Pocket Chordsmith projects, it understands:
- BPM
- key
- scale
- chord progression
- sections
- song sequence
- drum grid
- bass pattern
- melody tracks
- guitar rhythm
- swing
- FX settings

This allows Pocket DJ to create musical transitions, builds, drops and loops without slicing audio.

### Unique value

Most DJ apps mix finished audio.

Pocket DJ remixes the musical structure itself.

This means it can:
- loop sections cleanly
- mute musical layers cleanly
- queue section changes on the bar
- filter individual generated parts
- create smart builds
- create musical drops
- transpose later
- generate fills later
- adapt arrangements later

---

## 9. v1 Product Goal

Pocket DJ v1 should prove the core idea:

> Import a Pocket Chordsmith song and perform it live using section pads, track controls, loops and effects.

v1 should prioritise:
- compatibility
- fun
- simple performance controls
- stable playback
- mobile usability

v1 should not prioritise:
- deep editing
- MIDI import
- two-deck mixing
- full export suite
- complex automation
- advanced sound design

---

## 10. MVP Feature List

### 10.1 Import

Pocket DJ v1 must support:

- Paste `PCS1:` share code
- Paste raw Pocket Chordsmith JSON
- Detect invalid input and show friendly errors
- Sanitise imported data using Pocket Chordsmith-compatible logic
- Convert imported project to an internal Pocket DJ session

Import screen should have:
- large paste area
- Import button
- Load demo button
- Recent sessions list, if local save is included in v1
- brief compatibility note

Suggested wording:

> Paste a Pocket Chordsmith share code or project JSON to turn it into a live remix deck.

---

### 10.2 Project Metadata Display

After import, show:
- title if available later
- key
- scale
- BPM
- time signature
- swing amount
- number of active sections
- source app: Pocket Chordsmith
- source schema version

Current Pocket Chordsmith projects may not have a formal title field, so v1 can show:

> Imported Chordsmith Project

or allow Pocket DJ to add a local session name.

---

### 10.3 Transport

Required controls:
- Play
- Stop
- Restart
- Tap tempo, optional
- Master volume
- Current section display
- Queued section display
- Beat/bar progress indicator

Transport should remain accessible at all times.

Recommended behaviour:
- fixed bottom bar on mobile
- compact top or side transport on desktop
- visual beat pulse when playing

---

### 10.4 Section Pads

Pocket DJ should convert Pocket Chordsmith sections into large performance pads.

Required pads:
- A
- B
- C
- D
- E
- F
- G
- H

Each pad should show:
- section letter
- bar count
- activity state
- current/queued state

Example:

```text
A
4 bars
```

Pad states:
- inactive/empty
- available
- currently playing
- queued
- looping

Recommended tap behaviour:
- tap: queue section at next bar
- double tap: jump immediately, optional
- long press: loop section
- swipe up: build into section, later
- swipe down: strip down section, later

v1 should support at least:
- tap to queue next section
- highlight current section
- highlight queued section

---

### 10.5 Launch Quantisation

Section changes must be musical.

Default launch mode:
- **Next bar**

Optional launch modes:
- Instant
- Next beat
- Next bar
- End of section

For v1, only two modes are necessary:
- Next bar
- Instant

Recommended v1 default:
- Next bar

This avoids ugly mid-beat jumps.

---

### 10.6 Track Strips

Pocket DJ should simplify Pocket Chordsmith parts into performance stems.

Required v1 stems:
- Drums
- Bass
- Chords
- Melody
- Guitar
- FX or Master FX

Each stem should have:
- mute
- solo, optional for v1
- volume
- simple activity meter
- optional filter send later

Recommended display:

```text
DRUMS   [M] [S]  Volume
BASS    [M] [S]  Volume
CHORDS  [M] [S]  Volume
MELODY  [M] [S]  Volume
GUITAR  [M] [S]  Volume
```

If the imported song has no guitar enabled, the guitar strip should be hidden, dimmed or labelled as inactive.

If there are multiple melody tracks, v1 should combine them into one Melody stem. Advanced individual melody stem control can come later.

---

### 10.7 Effects

v1 should include a small number of high-impact DJ effects.

Required v1 effects:
- master filter
- echo/delay amount
- reverb amount
- reset FX

Recommended v1 interface:
- XY pad
- X axis: filter cutoff
- Y axis: echo/reverb send

Additional buttons:
- Echo Out
- Reset FX
- Build
- Drop

Not all need to be technically deep in v1. They need to feel good and be reliable.

---

### 10.8 Build and Drop Macros

This should become Pocket DJ’s signature feature.

#### Build button

While held or tapped, Build should gradually:
- increase filter brightness
- increase delay/reverb
- thin or mute bass slightly
- optionally increase hats or snare density later
- increase perceived tension
- queue a target section if one is selected

#### Drop button

Drop should:
- restore filter
- restore bass
- bring drums back strongly
- trigger crash or accent if available
- move to queued section on the next bar if a section is queued
- reset temporary build effects

v1 can implement simple versions:
- Build raises filter and FX
- Drop resets filter and FX and restores muted parts

Later versions can add generated fills, risers and smarter rhythmic changes.

---

### 10.9 Loop Controls

v1 loop controls:
- Loop current section
- Exit loop

Optional v1.1:
- 1 bar loop
- 2 bar loop
- 4 bar loop
- 8 bar loop
- loop current bar
- stutter loop

For v1, section looping is enough.

---

### 10.10 Local Save

Pocket DJ should allow local browser saves.

Recommended v1:
- autosave last imported session
- save current DJ session to localStorage
- load last session
- clear session

This should save:
- source project
- track volumes
- mutes
- FX settings
- preferred launch mode
- loop state
- local session name

---

## 11. Pocket DJ File Format

Pocket DJ should eventually have its own share-code prefix:

```text
PDJ1:
```

This should not replace `PCS1:`. It should wrap a source Pocket Chordsmith project with DJ performance settings.

### Recommended PDJ1 structure

```json
{
  "app": "PocketDJ",
  "djVersion": 1,
  "source": {
    "app": "PocketChordsmith",
    "sourcePrefix": "PCS1",
    "projectVersion": 16,
    "project": {}
  },
  "deck": {
    "name": "Imported Chordsmith Project",
    "bpm": 112,
    "key": "G",
    "scale": "major",
    "timeSig": 4,
    "swing": 0.05
  },
  "performance": {
    "launchQuantize": "bar",
    "currentSection": "A",
    "queuedSection": null,
    "loopMode": "off",
    "loopSection": null,
    "trackVolumes": {
      "drums": 1,
      "bass": 1,
      "chords": 1,
      "melody": 1,
      "guitar": 1
    },
    "trackMutes": {
      "drums": false,
      "bass": false,
      "chords": false,
      "melody": false,
      "guitar": false
    },
    "trackSolos": {
      "drums": false,
      "bass": false,
      "chords": false,
      "melody": false,
      "guitar": false
    },
    "fx": {
      "filter": 0,
      "echo": 0,
      "reverb": 0,
      "sidechain": 0
    }
  }
}
```

For v1, exporting `PDJ1:` is optional but recommended if the app is already stable.

Priority order:
1. Import `PCS1:`
2. Save local DJ session
3. Export `PDJ1:` later

---

## 12. Mapping Pocket Chordsmith Data to Pocket DJ

### Global project fields

Map:
- `bpm` to deck BPM
- `key` to deck key
- `scale` to deck scale
- `timeSig` to deck time signature
- `swing` to deck swing
- `sectionBars` to section pad lengths
- `songSequence` to suggested auto-play order

### Section data

For each section A-H:

Map:
- `progressionA` etc to Chords stem
- `gridA` etc to Drums stem
- `gridTupletsA` etc to Drum timing details
- `melodyTracksA` etc to Melody stem
- `melodyInstrumentsA` etc to Melody sound selection
- `melodyOctavesA` etc to Melody octave data
- `melodyMuteA` etc to imported melody mute state
- `melodySoloA` etc to imported melody solo state
- `melodyPanA` etc to stereo placement
- `melodyHoldA`, `melodySlideA`, `melodyTupletsA` etc to melody playback behaviour
- `bassNotesA`, `bassHoldA`, `bassSlideA`, `bassAccentA` etc to Bass stem
- `guitarPatternA` etc to Guitar stem

### Global sound settings

Map:
- `chordInstrument` to Chords sound
- `chordPlayMode` to Chords articulation
- `chordRhythmMode` to Chords rhythm
- `guitarEnabled` to Guitar stem visibility/activity
- `guitarTone` to Guitar sound
- `guitarRegister` to Guitar register
- `guitarStrumMode` to Guitar articulation
- `guitarVolume` to initial Guitar stem volume
- `fxDelay`, `fxReverb`, `fxChorus`, `fxFlanger`, `fxMix` to starting FX
- `sidechainOn`, `sidechainAmount` to Pump/Sidechain control

---

## 13. Internal Architecture

Recommended top-level modules inside the single-file HTML:

```text
1. Constants
2. Compatibility parser
3. Project sanitiser
4. DJ session converter
5. Audio engine
6. Scheduler
7. Section launcher
8. Stem mixer
9. FX engine
10. UI renderer
11. Touch/mouse handlers
12. Local save/load
13. Share-code import/export
14. Demo project
```

### Suggested function names

```js
const PCS_SHARE_PREFIX = "PCS1:";
const PDJ_SHARE_PREFIX = "PDJ1:";
const POCKET_DJ_VERSION = 1;

function parseAnyImportText(text) {}
function parsePocketChordsmithShareCode(text) {}
function parsePocketChordsmithJson(text) {}
function sanitizePocketChordsmithProject(raw) {}
function createDjSessionFromChordsmithProject(project) {}
function exportPocketDjSession(session) {}
function buildPocketDjShareCode(session) {}
function parsePocketDjShareCode(text) {}

function startPlayback() {}
function stopPlayback() {}
function queueSection(sectionId) {}
function jumpToSection(sectionId) {}
function setLaunchQuantize(mode) {}
function toggleSectionLoop(sectionId) {}

function setStemMute(stemId, muted) {}
function setStemSolo(stemId, soloed) {}
function setStemVolume(stemId, value) {}

function setMasterFilter(value) {}
function setEchoAmount(value) {}
function setReverbAmount(value) {}
function triggerBuild() {}
function triggerDrop() {}
function resetFx() {}

function saveLocalSession() {}
function loadLocalSession() {}
function clearLocalSession() {}
```

---

## 14. Audio Engine Notes

Pocket DJ should use Web Audio API, consistent with Pocket Chordsmith.

Audio should be generated, not streamed.

Required buses:
- master
- drums
- bass
- chords
- melody
- guitar
- FX send
- delay
- reverb
- filter

Suggested bus structure:

```text
Drums  → drumGain   → masterFilter → masterGain
Bass   → bassGain   → masterFilter → masterGain
Chords → chordGain  → masterFilter → masterGain
Melody → melodyGain → masterFilter → masterGain
Guitar → guitarGain → masterFilter → masterGain

FX sends → delay/reverb → masterGain
```

For v1, a single master filter is enough.

Later versions may add per-stem filters.

---

## 15. Scheduler Requirements

Pocket DJ must remain rhythmically stable.

Requirements:
- keep the existing lookahead scheduler concept
- schedule events ahead of time
- do not rely on visual frame timing for audio
- support queued section changes
- support loop mode
- support swing
- respect imported time signature
- respect imported resolution where needed
- do not cut notes harshly unless doing intentional DJ effects

### Section queue logic

When a section pad is tapped:
- if launch mode is `bar`, queue the section for the next bar boundary
- if launch mode is `instant`, stop current section and start selected section immediately
- show the queued section visually
- when the transition occurs, update current section display

### Loop logic

If loop current section is active:
- the current section repeats
- queued sections either wait until loop is disabled or replace the loop target depending on selected mode
- v1 should use the simpler behaviour: queued sections wait until loop is disabled

---

## 16. UI Layout v1

### Mobile portrait layout

Recommended structure:

```text
[Top Bar]
Pocket DJ | BPM | Key | Settings

[Now Playing]
Current section | queued section | beat/bar pulse

[Section Pads]
A B
C D
E F
G H

[Track Strips]
Drums
Bass
Chords
Melody
Guitar

[FX / Performance]
XY Pad
Build | Drop | Echo Out | Reset

[Bottom Transport]
Play | Stop | Loop | Import
```

### Desktop layout

Desktop can use wider columns:

```text
Left: Import / project info / transport
Centre: Section pads and visualiser
Right: Track strips and FX
```

But v1 should be designed mobile-first.

---

## 17. Touch and Mouse Behaviour

Pocket DJ should work well on:
- Android phone
- iPhone
- desktop browser
- local standalone HTML file
- itch.io page
- Android WebView/Capacitor later

Controls should support:
- tap
- hold
- drag
- mouse click
- mouse drag

Avoid requiring:
- right click
- hover-only controls
- keyboard shortcuts
- tiny sliders
- precise desktop-style interactions

Buttons and pads should be large.

Minimum comfortable touch target:
- 44px height
- preferably larger for performance pads

---

## 18. Visual Feedback

Pocket DJ should always show what is happening.

Required visual feedback:
- current section highlighted
- queued section pulsing
- active beat pulse
- stem meters or activity lights
- mute/solo state clearly visible
- filter/FX amount visible
- build/drop state visible
- import errors visible

Optional:
- animated circular beat ring
- small waveform-like generated visualiser
- neon pad glow
- haptic feedback where supported

---

## 19. v1 Screens

### Screen 1: Import / Start

Purpose:
- paste a Pocket Chordsmith share code or JSON
- load a demo
- load last session

Controls:
- paste area
- Import button
- Load Demo button
- Load Last Session button
- short explanation

### Screen 2: Deck

Purpose:
- perform the imported song

Controls:
- transport
- section pads
- track strips
- FX controls
- loop button
- build/drop buttons

### Screen 3: Settings

Purpose:
- simple performance options

Settings:
- launch quantise: next bar / instant
- master volume
- visual intensity
- show/hide inactive stems
- reset session
- export session, later
- import new song

Do not add too many settings in v1.

---

## 20. v1 Acceptance Criteria

Pocket DJ v1 is successful when:

### Import
- A valid `PCS1:` share code imports successfully.
- A valid raw Pocket Chordsmith JSON project imports successfully.
- Invalid input shows a friendly error.
- Imported key, scale, BPM, time signature and sections display correctly.

### Playback
- The imported project plays.
- Drums, chords, bass, melody and guitar are audible when present.
- Timing is stable.
- Section lengths are respected.
- Swing is respected enough to feel consistent with Chordsmith.

### Section performance
- Section pads A-H appear.
- Empty/inactive sections are visually dimmed.
- Tapping a section queues or launches it.
- Current section is highlighted.
- Queued section is highlighted.
- Section change occurs cleanly.

### Mixer
- Drums, Bass, Chords, Melody and Guitar stems are shown.
- Mute controls work.
- Volume controls work.
- Guitar stem is inactive or hidden when no guitar part exists.

### FX
- Master filter works.
- Echo/reverb controls work or at least map to imported FX bus reliably.
- Reset FX restores a clean mix.
- Build and Drop provide an obvious musical effect.

### Mobile
- UI is usable in portrait orientation.
- Controls are large enough for touch.
- No essential control is hidden off screen.
- App works as a standalone HTML file on Android browser.

### Persistence
- Last imported session can be saved locally.
- Reloading the app can restore the last session, if included in v1.

---

## 21. Explicit Non-Goals for v1

Do not build these in v1:
- full chord editing
- full melody editing
- MIDI import
- MIDI export
- full WAV export unless easy to port
- two-deck mixing
- online sharing backend
- login/accounts
- multiplayer
- sample/audio file importing
- full automation recording
- complex per-track synth editing
- advanced arrangement editor

These can come later.

---

## 22. Future Roadmap

### v1.1
- export `PDJ1:` share codes
- record performance moves
- improved visualiser
- 1-bar, 2-bar and 4-bar loops
- echo-out transition
- better build/drop macros
- keyboard shortcuts for desktop

### v1.2
- WAV export of DJ performance
- performance automation playback
- snapshots/scenes
- remix presets
- stem-level filters
- generated drum fills
- generated risers

### v2
- two-deck mode
- crossfade between two Pocket Chordsmith projects
- automatic tempo matching
- key-compatible mixing suggestions
- auto-DJ mode
- live arrangement recorder
- send arrangement back to Pocket Chordsmith
- Android app wrapper via Capacitor

---

## 23. Risks and Design Warnings

### Risk 1: It becomes too similar to Pocket Chordsmith
Avoid this by keeping Pocket DJ performance-focused and hiding editing tools.

### Risk 2: Too many controls
The app must be playable quickly. Prioritise pads, mutes, loops and FX.

### Risk 3: Timing instability
Audio scheduling is more important than visual polish. Section transitions must feel musical.

### Risk 4: Import incompatibility
Pocket Chordsmith’s schema may evolve. Keep the parser defensive and tolerant.

### Risk 5: Mobile clutter
Use large controls and collapsible panels. Do not copy Chordsmith’s dense editor layout.

---

## 24. Recommended Codex Build Prompt

Use the separate `pocket_dj_v1_codex_prompt.txt` file when starting implementation.

---

## 25. Recommended First Implementation Steps

### Step 1
Create a fresh standalone file:

```text
pocket_dj_v1.html
```

Do not modify Pocket Chordsmith directly.

### Step 2
Copy only the minimum required compatibility utilities:
- Base64 URL encode/decode
- `PCS1:` parser
- project sanitiser
- constants for sections and schema handling

### Step 3
Create a simple import screen.

### Step 4
Create a DJ session object from imported Chordsmith data.

### Step 5
Render metadata and section pads.

### Step 6
Implement basic playback.

### Step 7
Implement section queueing.

### Step 8
Implement stem gain controls.

### Step 9
Implement filter and FX.

### Step 10
Polish mobile UI and save/load.

---

## 26. Final Product Principle

Pocket DJ should not ask the user to compose.

It should invite the user to play.

The ideal first experience is:

```text
Paste code.
Press play.
Tap section B.
Mute melody.
Hold build.
Hit drop.
Smile.
```

That is the app.
