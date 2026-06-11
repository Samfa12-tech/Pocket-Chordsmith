# Pocket Audio Core Extraction Plan

Date: 2026-06-11

This plan creates Pocket Audio Core without rewriting Pocket Chordsmith, Pocket DJ, Pocket DAW, or existing games first. The first goal is a reusable engine package with parity fixtures and adapters. App integration comes only after the core proves it can import and render existing Pocket Chordsmith material correctly.

## Architecture Target

Create:

```text
packages/pocket-audio-core/
  src/
    index.ts
    constants.ts
    schema/
    music/
    events/
    engine/
    synth/
    fx/
    export/
    adaptive/
    diagnostics/
  tests/
    fixtures/
    golden/
  examples/
    basic-html/
    game-runtime-demo/
```

Build outputs:

```text
dist/pocket-audio-core.esm.js
dist/pocket-audio-core.iife.js
dist/pocket-audio-core.d.ts
```

The package should be browser-first, dependency-light, and usable in single-file HTML builds, Vite apps, itch uploads, and future Capacitor builds.

## Non-Goals For This Phase

- Do not rewrite Pocket Chordsmith UI.
- Do not rewrite Pocket DJ UI.
- Do not migrate existing games.
- Do not make Pocket DAW smaller or Chordsmith-only.
- Do not replace Godot runtime audio with a native procedural parity promise.
- Do not add backend, accounts, or cloud sync.
- Do not change Pocket Chordsmith project schema yet; keep current schema 16 compatibility.

## Phase 0: Freeze Reference Fixtures

Purpose: capture today before extracting anything.

Tasks:

1. Export fixture projects from Pocket Chordsmith v67 covering:
   - simple 4/4 major triads
   - 3/4 time
   - swing
   - drum tuplets
   - melody tuplets
   - held melody notes
   - melody slides
   - bass manual notes
   - bass holds/slides/accents
   - guitar enabled with holds/chugs/accents
   - multiple melody tracks with mute/solo/pan
   - FX and sidechain
   - A-H song sequence
2. Store raw JSON and `PCS1:` versions under `packages/pocket-audio-core/tests/fixtures/pcs16/`.
3. Add an event-trace exporter to the current app only if necessary, behind a development-only helper.
4. Record current Pocket Chordsmith, Pocket DJ, Pocket DAW, and Godot addon versions in a compatibility matrix.

Exit criteria:

- Fixtures are committed.
- Current apps still behave unchanged.
- There is a written "known current drift" note before any refactor starts.

## Phase 1: Package Scaffold

Purpose: create the package with types, tests, and build outputs but minimal implementation.

Tasks:

1. Add `packages/pocket-audio-core/package.json`.
2. Add TypeScript or plain JS source depending on the repo's chosen direction. TypeScript is preferred because Pocket DAW already uses it.
3. Configure ESM and IIFE/browser-global builds.
4. Export placeholder modules and public types.
5. Add test runner scripts for schema and event tests.
6. Add README and compatibility matrix.

Exit criteria:

- `npm test` or equivalent passes in the new package.
- ESM and IIFE builds are generated.
- No consuming app has been changed yet.

## Phase 2: Parser And Normalizer

Purpose: unify `PCS1:` and raw JSON handling.

Source material:

- Pocket Chordsmith `sanitizeProjectData`, `buildShareCode`, `parseShareCode`, `parseProjectText`, `exportProject`, `importProject`.
- Pocket DAW `src/compatibility/pcsParser.ts` and `pcsSanitizer.ts`.
- Pocket DJ `parseAnyImportText` and `sanitizePocketChordsmithProject`.
- Godot `pcs_schema_migrator.gd` for cross-checking import assumptions.

Core modules:

```text
schema/share-code.ts
schema/normalise-project.ts
schema/migrations.ts
schema/project-types.ts
```

Public functions:

- `parsePocketChordsmithProject(input)`
- `parseShareCode(code)`
- `buildShareCode(project)`
- `normaliseProject(raw, options)`
- `validateProject(raw)`
- `getCompatibilityInfo()`

Rules:

- Accept raw Pocket Chordsmith JSON and `PCS1:`.
- Keep saved project schema separate from core version.
- Preserve unknown original fields where DAW-style roundtrip needs them.
- Normalize into a runtime model with explicit sections A-H, lanes, transport metadata, and mixer defaults.
- Keep app UI-only fields optional or outside the runtime model where possible.

Exit criteria:

- All fixture JSON and `PCS1:` codes normalize.
- Normalization snapshots are stable.
- Differences from Pocket DJ and Pocket DAW existing defaults are documented.

## Phase 3: Deterministic Timeline/Event Renderer

Purpose: generate one event stream for playback, MIDI, WAV, stems, games, and Godot manifests.

Source material:

- Pocket Chordsmith `buildSequenceEvents`, `buildPlaybackPlan`, `schedulePlanStep`, tuplet helpers, chord/scale helpers, bass/melody phrase helpers, and guitar helpers.
- Pocket DAW `src/audio/eventRenderer.ts`.
- Godot `pcs_chart_compiler.gd` for manifest shape and event fields.

Core modules:

```text
music/scales.ts
music/chords.ts
events/render-events.ts
events/timing.ts
events/roles.ts
events/event-types.ts
```

Output event model should include:

- role/stem: `drums`, `bass`, `chords`, `melody`, `guitar`, `marker`
- kind: `kick`, `snare`, `hat`, `bass`, `chord`, `melody`, `guitar`, `marker`
- section id and arrangement index
- absolute seconds
- absolute ticks
- source step/bar/beat
- duration
- MIDI note(s)
- velocity/accent
- instrument/articulation
- pan
- slide metadata
- tuplet metadata

Exit criteria:

- Strict event-trace tests pass for fixtures.
- Event renderer handles sequence and single-section scopes.
- Event renderer is deterministic when humanize is disabled or seeded.

## Phase 4: Live Web Audio Engine

Purpose: provide shared browser playback for apps and games.

Source material:

- Pocket Chordsmith `ensureAudio`, procedural instruments, FX graph, voice pools, sidechain, and scheduler.
- Pocket DAW `AudioEngine` class structure, diagnostics, mixer, loop seek, and FX chain ideas.
- Pocket DJ stem mixer and launch/build/drop behavior.

Core modules:

```text
engine/audio-context.ts
engine/live-engine.ts
engine/scheduler.ts
engine/transport.ts
engine/voice-manager.ts
engine/buses.ts
synth/drums.ts
synth/bass.ts
synth/chords.ts
synth/melody.ts
synth/guitar.ts
synth/noise.ts
fx/delay.ts
fx/reverb.ts
fx/chorus.ts
fx/flanger.ts
fx/filter.ts
fx/sidechain.ts
fx/dynamics.ts
diagnostics/metrics.ts
```

Rules:

- Scheduler uses audio clock lookahead, not animation frames.
- Visual callbacks are separated from audio scheduling.
- Role voice budgets protect bass, chords, melody, and guitar from being starved by drums or game load.
- Shared resources such as noise buffers and impulse responses are cached.
- Diagnostics include context state, scheduled/skipped events, active voices by role, peak voices, and dropped scheduler windows.

Exit criteria:

- Basic HTML demo plays fixture projects.
- Live event timings match event renderer.
- No app integration yet.

## Phase 5: Offline WAV And Stem Rendering

Purpose: make render parity use the same core event stream and instrument modules.

Source material:

- Pocket Chordsmith `exportWavFile`, offline synth functions, and `writeWavFromBuffer`.
- Pocket DAW `offlineRender.ts`.

Core modules:

```text
export/offline-renderer.ts
export/wav.ts
export/stems.ts
export/render-profile.ts
```

Outputs:

- full-song WAV
- selected section WAV
- loop WAV
- role stems
- optional event manifest JSON

Exit criteria:

- WAV header/duration tests pass.
- Offline full mix and stems are generated for fixtures.
- Offline event count matches timeline event count by role.

## Phase 6: MIDI Export

Purpose: put event-to-MIDI export behind the shared event renderer.

Source material:

- Pocket Chordsmith `buildQuantizedMidiEvents`, `buildPerformanceMidiEvents`, `exportMidiFile`.
- Pocket DAW `midiExport.ts`.

Core modules:

```text
export/midi.ts
export/midi-writer.ts
```

Rules:

- Keep PPQ default at 480.
- Export drums, bass, chords, melody tracks, and guitar separately where practical.
- Preserve exact-duration vs performance-duration options.
- MIDI import can remain app-level until a later phase.

Exit criteria:

- MIDI blobs/files generate for all core fixtures.
- Basic MIDI parsing smoke check confirms tracks and note counts.

## Phase 7: Adaptive/Game API

Purpose: support new browser games without embedding editor UI.

Core modules:

```text
adaptive/game-state-controller.ts
adaptive/music-state-map.ts
adaptive/stingers.ts
adaptive/section-router.ts
```

Capabilities:

- `queueSection`
- `queueSequence`
- `setMusicState`
- `setLoop`
- `triggerStinger`
- `setStemVolume`
- `setStemMute`
- `setFx`
- event callbacks for beat, bar, section, marker, state change, and diagnostics

Exit criteria:

- A minimal game-runtime demo can switch menu/calm/danger/victory states.
- Heavy-scene guidance is documented.

## Phase 8: App Integration Order

Integrate only after parser, event, live playback, and offline tests are stable.

Recommended order:

1. Pocket DJ first, because it has fewer composition editing paths and already behaves like a core consumer.
2. New small browser game demo.
3. Pocket DAW Chordsmith lane, while keeping DAW-only clips/routing/media outside the core.
4. Pocket Chordsmith playback/export paths after parity is proven.
5. Godot export workflow for core-rendered stems/kits/manifests.
6. Existing games only when the core has proven game diagnostics and stress behavior.

## Integration Boundaries

### Pocket Chordsmith

Keep:

- composition UI
- project editing
- MIDI import UI
- local save/autosave UI
- Push to app buttons and clipboard/window handoff UI

Move to core when proven:

- parser/share-code helpers
- project normalization
- timeline/event renderer
- live playback engine
- offline WAV render
- MIDI export
- stem render/game export

### Pocket DJ

Keep:

- deck UI
- performance/session state
- `PDJ1` wrapper
- launch mode, build/drop UI, loop controls
- edit-back handoff UI

Move to core:

- `PCS1` parser/normalizer
- event renderer
- live playback instruments
- stem mixer
- section queue and quantized transition primitives

### Pocket DAW

Keep in DAW:

- audio clips, imported files, recording
- piano roll and free MIDI clips
- mixer routing, automation, project save/open, media pool
- DAW export profiles beyond Chordsmith parity

Use core for:

- Chordsmith-compatible lanes
- source-backed section clips
- event render parity
- render-to-audio/stem freeze of Chordsmith lanes
- game/Godot pack generation

### Godot

Keep in Godot:

- editor importer
- chart resources
- conductor
- runtime section/state/stinger control
- native buses and game signals

Generate from core:

- stems
- loops
- stingers
- sample kits
- event manifests
- compatibility metadata

Label as preview unless parity-proven:

- Godot-native procedural sound generation

## Versioning Policy

- Pocket Audio Core uses semantic versioning: `0.x` until apps depend on it.
- Pocket Chordsmith project schema remains separate: current browser handoff schema is `16`.
- Every core release needs a compatibility matrix:
  - core version
  - supported PCS schemas
  - supported share prefixes
  - consumer app versions
  - Godot addon compatibility
  - golden fixture status
  - known parity limitations
- Every consuming app update should mention the core version even when UI is unchanged.

## First Milestone Definition

Pocket Audio Core `0.1.0` should be considered done when:

- It imports raw Pocket Chordsmith JSON and `PCS1:`.
- It normalizes schema 16 fixtures.
- It generates deterministic event traces for drums, bass, chords, melody, and guitar.
- It plays fixture projects in a minimal browser demo.
- It renders full WAV output.
- It can render at least role-separated stem buffers or stem WAVs.
- It exports basic MIDI from the event stream.
- It exposes diagnostics.
- It has a compatibility matrix and changelog.

## Rollback Strategy

- Keep app integration behind a branch and/or build version.
- Preserve the current single-file Chordsmith and DJ builds until parity tests and manual playback checks pass.
- Keep previous core builds under `core-releases/<version>/` or package tags.
- Do not migrate saved project schemas as part of core adoption unless a separate schema bump is explicitly planned.
