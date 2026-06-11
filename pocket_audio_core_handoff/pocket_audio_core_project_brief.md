# Pocket Audio Core Project Brief

## 1. Working title

**Pocket Audio Core**

Possible package names:

- `pocket-audio-core`
- `@samfa12/pocket-audio-core`
- `pocket-core-audio`

Recommended public name: **Pocket Audio Core**

Recommended package name if private/local: `pocket-audio-core`

---

## 2. Core concept

Pocket Audio Core is a shared, headless Web Audio runtime for the Pocket Chordsmith family.

It should contain the reusable music engine that currently exists partly inside Pocket Chordsmith and partly inside Pocket DJ:

- project parsing and normalisation
- `PCS1:` share-code support
- section and song-sequence timing
- scale/chord logic
- drum, bass, chord, melody, guitar playback
- held notes, slides, tuplets/triplets, swing and accents
- stem mixer and FX buses
- live lookahead scheduler
- offline render / WAV export path
- adaptive music API for games
- parity tests and golden fixtures

Pocket Chordsmith remains the composition UI. Pocket DJ remains the performance UI. Pocket DAW becomes a larger DAW host. Godot gets compiled charts and rendered/audio-kit outputs. New games can embed the lightweight runtime.

Pocket Audio Core must not become a visual UI framework.

---

## 3. Product goal

The long-term goal is:

> A Pocket Chordsmith project should sound the same when used in Pocket Chordsmith, Pocket DJ, Pocket DAW, a new HTML/Three/Babylon game, and the Godot export pipeline.

For web apps, that means they should use the same code path.

For Godot, exact parity should be achieved primarily through core-rendered stems, loops, stingers, sample kits or deterministic event exports, rather than separate hand-written native approximations.

---

## 4. Important boundary

Pocket Audio Core is not the whole DAW.

Pocket DAW should be broader than Pocket Chordsmith and broader than Pocket Audio Core. It may include:

- audio tracks
- imported samples and recordings
- clip editing
- timeline editing
- waveform display
- fades and gain envelopes
- piano-roll/MIDI-style clips
- mixer channels
- automation lanes
- non-Chordsmith instruments
- DAW-level effects and mastering
- stem rendering and bounce-in-place

Pocket Audio Core should provide the **Chordsmith-compatible engine lane** inside the DAW, not limit the DAW to Chordsmith-style section grids.

A good mental model:

```text
Pocket DAW
├─ audio tracks / clips / samples
├─ piano roll / MIDI-like clips
├─ mixer / FX / automation / export
└─ Pocket Audio Core lanes
   ├─ imported PCS1 projects
   ├─ Chordsmith section clips
   ├─ generated drums/bass/chords/melody/guitar
   └─ render-to-audio / render-to-stems
```

---

## 5. Existing app context

Current Pocket Chordsmith is a single-file browser app. The current workspace describes `web-app/` as the browser app workspace and `godot-addon/` as a separate nested repository for the Godot addon.

Pocket Chordsmith already has important audio behaviours that must not regress:

- schema compatibility, currently around project schema 16 in the current handoffs
- `PCS1:` share-code import/export
- chord, melody, drum, bass and guitar playback
- section A-H data
- song sequence playback
- grid resolutions
- tuplets/triplets
- swing
- MIDI import/export paths
- WAV export
- live drum pad recording quantised against audio scheduler state
- chord voice limiting/fading for stability
- distinct procedural chord and melody instruments

Pocket DJ already uses the right high-level model: import Pocket Chordsmith data, convert it into a performance deck, keep editor UI out, and use Web Audio buses and a lookahead scheduler.

---

## 6. Why build the core

The benefit is not visual polish. The benefit is audio correctness, shared compatibility, and maintainability.

Without Pocket Audio Core, every app or game risks copying and diverging:

- parser differences
- scheduler differences
- stem mixer differences
- instrument differences
- offline render differences
- section transition differences
- export/import bugs

With Pocket Audio Core:

- one bug fix improves all future apps
- one instrument update lands everywhere
- one schema normaliser handles old projects
- Pocket DJ and Pocket Chordsmith sound identical
- Pocket DAW can import Chordsmith projects without a separate imitation engine
- games can use adaptive music without carrying a full editor
- Godot exports can be generated from the same musical truth

---

## 7. Non-goals for v0

Do not attempt these in the first core build:

- full UI rewrite of Pocket Chordsmith
- visual DJ redesign
- migration of every old game
- full DAW implementation
- replacing Godot native audio runtime for shipped games
- web backend/accounts/cloud sync
- sample-library marketplace
- plugin architecture
- full AudioWorklet rewrite
- WASM DSP rewrite

The first milestone is extraction, parity and stable reuse.

---

## 8. Technical target

Recommended implementation style:

- plain JavaScript or TypeScript compiled to JavaScript
- no heavy runtime dependency
- browser-first
- works in normal web pages, itch.io, local files where possible, Android browser, and Capacitor later
- distributable as ESM and browser global/IIFE
- deterministic offline rendering where possible
- clear public API
- defensive normalisation of imported projects
- optional diagnostics and performance metrics

Recommended package outputs:

```text
dist/pocket-audio-core.esm.js
dist/pocket-audio-core.iife.js
dist/pocket-audio-core.d.ts
```

Recommended source layout:

```text
packages/pocket-audio-core/
  src/
    index.ts
    constants.ts
    schema/
      parse-share-code.ts
      normalise-project.ts
      migrations.ts
      project-types.ts
    music/
      scales.ts
      chords.ts
      timeline.ts
      sections.ts
      midi-events.ts
    engine/
      audio-context.ts
      buses.ts
      scheduler.ts
      live-engine.ts
      offline-renderer.ts
      voice-manager.ts
      diagnostics.ts
    synth/
      drums.ts
      bass.ts
      chords.ts
      melody.ts
      guitar.ts
      noise.ts
      envelopes.ts
    fx/
      filter.ts
      delay.ts
      reverb.ts
      sidechain.ts
      dynamics.ts
    adaptive/
      game-state-controller.ts
      music-state-map.ts
    export/
      wav.ts
      stems.ts
      godot-kit.ts
  tests/
    fixtures/
    golden/
    schema.test.ts
    timeline.test.ts
    scheduler.test.ts
    offline-render.test.ts
  examples/
    basic-html/
    game-runtime-demo/
```

If the repo is staying single-file-first for now, the same design can still be used internally and bundled into one file later.

---

## 9. Public API shape

The API should be small enough for games and flexible enough for apps.

Suggested v0 API:

```js
import { PocketAudio } from "./dist/pocket-audio-core.esm.js";

const audio = new PocketAudio({
  latencyMode: "interactive",
  diagnostics: true
});

await audio.loadProject(projectOrShareCode);
await audio.resume();
audio.play();
audio.stop();
audio.restart();

audio.queueSection("B", { quantize: "bar" });
audio.setSection("A", { immediate: true });
audio.setSequence(["A", "B", "C", "A"]);
audio.setLoop({ section: "C", enabled: true });

audio.setStemVolume("drums", 0.9);
audio.setStemMute("melody", true);
audio.setFx({ filter: 0.8, echo: 0.1, reverb: 0.2 });
audio.triggerBuild({ bars: 2 });
audio.triggerDrop({ targetSection: "D", quantize: "bar" });

audio.on("beat", event => {});
audio.on("bar", event => {});
audio.on("section", event => {});
audio.on("marker", event => {});

const wav = await audio.renderWav({ scope: "sequence" });
const stems = await audio.renderStems({ scope: "sequence" });
```

Also provide a no-class convenience API if easier for small games:

```js
PocketAudioCore.loadProject(code);
PocketAudioCore.play();
PocketAudioCore.queueSection("combat", { quantize: "bar" });
```

---

## 10. Compatibility model

Pocket Audio Core should accept:

- raw Pocket Chordsmith JSON
- `PCS1:` share codes
- future normalised `PocketAudioProject` objects
- optional `PDJ1:` wrappers if useful later

It should output:

- normalised project object
- section timeline/event traces
- audio playback
- offline WAV render
- optional stem WAVs
- optional game/adaptive runtime state map
- Godot-compatible generated assets or manifests

The core must keep legacy project compatibility separate from runtime state. A saved old project should normalise into the same runtime model every time.

---

## 11. Exact-sound policy

“Exactly the same” should be interpreted as:

### Web apps

Pocket Chordsmith, Pocket DJ and Pocket DAW should use the same Pocket Audio Core version and the same instrument/FX/scheduler implementation. They should not maintain separate copied synth functions.

### Offline export

WAV and stem export should use the same offline renderer as the apps, not a separate approximation.

### Godot

Godot should not be expected to sound exactly like Web Audio if it uses a separate native procedural approximation. For true parity, Godot should receive one or more of:

- core-rendered stems
- core-rendered loops
- core-rendered stingers
- generated drum/accent sample kits
- event manifests aligned to the same timeline

Godot can still use native buses, effects and conductor logic for runtime adaptation, but the actual sounds should come from assets generated by the core where exact parity matters.

### Testing

Use event-trace parity and audio-render parity checks. Event parity should be strict. Audio parity can use deterministic same-runtime tests and tolerant audio metrics where browser/OS floating-point behaviour differs.

---

## 12. Performance principles

Pocket Audio Core should be designed for games getting heavier.

Priorities:

- scheduler must not depend on animation frames
- schedule ahead with a safe lookahead window
- use smoothed AudioParam ramps instead of abrupt changes
- cap active voices
- fade/steal voices safely
- minimise AudioNode churn during playback
- reuse buffers, noise sources and static resources where possible
- separate visual callbacks from audio scheduling
- provide diagnostics for missed scheduling windows and voice counts
- support adaptive quality profiles if needed

Potential future optimisations:

- AudioWorklet for specific DSP bottlenecks only after profiling
- stem pre-rendering for mobile games
- hybrid generated/stem playback for heavy scenes
- lazy-loading instrument packs later

---

## 13. Testing and validation

Minimum fixtures:

1. Basic 4/4 major triads, no swing.
2. 3/4 time signature.
3. Swing groove.
4. Triplets/tuplets.
5. Held melody notes.
6. Bass holds/slides/accents.
7. Guitar enabled with patterns.
8. Multiple melody tracks with mute/solo/pan.
9. Sidechain/pump.
10. Section sequence A-B-C-D-A.
11. Section queue and loop behaviour.
12. FX build/drop behaviour.

Minimum tests:

- schema normalisation tests
- share-code round trip tests
- timeline event generation tests
- scheduler transition logic tests
- offline renderer duration tests
- WAV header and duration tests
- stem render existence/duration tests
- browser smoke test on a simple demo
- parity test comparing current app event trace to core event trace before integration

---

## 14. Migration strategy

Do not begin by replacing every app.

Recommended order:

1. Create Pocket Audio Core design and package scaffold.
2. Extract normalisation and event/timeline logic.
3. Add offline render and basic live playback.
4. Build parity harness using fixtures from current Pocket Chordsmith exports.
5. Build a tiny test page using the core.
6. Integrate with Pocket DJ first, because it is already performance-focused and simpler than Chordsmith.
7. Integrate with Pocket Chordsmith after parity is proven.
8. Use core in new games only.
9. Build DAW around the core as a host, not as a limitation.
10. Update Godot exporter to use core-rendered stems/kits for parity-first shipped audio.

---

## 15. Acceptance criteria for v0

Pocket Audio Core v0 is successful when:

- it imports valid `PCS1:` share codes and raw Pocket Chordsmith JSON
- it normalises schema 16-style projects defensively
- it generates the same event timeline as the source app for fixtures
- it plays drums, bass, chords, melody and guitar where present
- it respects section bars, song sequence, swing, time signature and resolution
- it respects holds, tuplets/triplets and accents enough for parity fixtures
- it provides stem mute/volume and basic FX controls
- it renders a WAV of a sequence
- it can render stems or at least per-stem offline buffers
- it exposes beat/bar/section events for games
- it has a small integration demo
- it documents its version and compatibility matrix

---

## 16. Acceptance criteria for v1

Pocket Audio Core v1 is successful when:

- Pocket DJ and Pocket Chordsmith both use the same core build for playback
- exported Chordsmith projects sound the same in Pocket DJ without copied synth code
- Pocket DAW can import a Chordsmith project as a core-backed lane
- new games can use the core without carrying the full Chordsmith UI
- Godot can receive core-rendered stems/kits/manifests
- release policy forces a core update to be tested in Chordsmith, DJ, DAW and Godot workflows before publication

---

## 17. Final design principle

Pocket Audio Core should be boring in the best way.

It should not be flashy. It should be the stable engine underneath the flashy tools.

When the composer, DJ deck, DAW, Godot addon and games all disagree, Pocket Audio Core is the source of truth.
