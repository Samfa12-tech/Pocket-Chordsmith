# Pocket Audio Core Inventory

Date: 2026-06-11

Pocket Audio Core is intended to become the shared, headless audio/runtime layer for Pocket Chordsmith, Pocket DJ, Pocket DAW, new browser games, and parity-first Godot export workflows. This inventory captures the current audio, import/export, scheduling, and handoff code before extraction. No app behaviour was changed during this pass.

Post-consolidation note: this report was written before the public monorepo layout was finalized. The canonical paths are now `apps/chordsmith-web/`, `apps/pocket-dj/`, `apps/pocket-daw/`, `addons/pocket_chordsmith/`, `packages/pocket-audio-core/`, and `packages/pcs-format/`. Historical references to `web-app/`, `pocket_dj/`, `godot-addon/`, `pocket-daw/`, and `pocket_audio_core_handoff/` describe the source layout at the time of this inventory.

## Current Project Structure

- `apps/chordsmith-web/` contains the current Pocket Chordsmith browser app. The active build is now `pocket_chordsmith_v68_core_bridge.html`, with `index.html` redirecting to it.
- `apps/pocket-dj/` contains the standalone Pocket DJ prototype. The active build is now `pocket_dj_v1g_core_bridge.html`.
- `apps/pocket-daw/` contains the imported Pocket DAW app source.
- `addons/pocket_chordsmith/` contains the Godot addon. It imports/compiles Pocket Chordsmith data, exposes a direct localhost Push-to-Godot receiver, and provides Godot-native conductor/runtime assets.
- `packages/pocket-audio-core/` contains the shared package created from this architecture branch.

Historical note: root Git status before the original documentation pass showed the old dirty `pocket-daw` gitlink plus the untracked `pocket_audio_core_handoff/` pack. Those folders are no longer canonical source paths after the monorepo consolidation.

## Pocket Chordsmith Browser App

Main file now: `apps/chordsmith-web/pocket_chordsmith_v68_core_bridge.html`

Historical source file for this inventory: `web-app/pocket_chordsmith_v67_direct_godot_push.html`

Pocket Chordsmith is currently the canonical source for the musical project format and the richest procedural Web Audio implementation.

### Constants And Runtime State

- `SHARE_CODE_PREFIX = "PCS1:"`, `PROJECT_SCHEMA_VERSION = 16`, MIDI PPQ, handoff keys, Godot push endpoints, instrument enums, voice limits, and scheduler timing live near lines 860-887.
- The global mutable `state` object spans project metadata, section data, mixer values, instrument settings, XY pad state, autosave, WAV state, and transport state near lines 908-927.
- Audio graph globals include master, role gains, FX nodes, limiter, scheduler state, and active voice pools near lines 929-940.

Core extraction implication: Pocket Audio Core should not inherit this UI-bound global state shape. It should provide a normalized project model, an engine state model, and app adapters that map to existing UI state.

### Share-Code Parsing And Project Normalisation

- `sanitizeProjectData(raw)` is the current main browser normalizer for schema 16-style projects. It handles key, scale, time signature, BPM, swing, UI mode, chord and melody settings, guitar settings, FX, section bars, song sequence, holds, slides, tuplets, bass lanes, and guitar patterns.
- `buildShareCode()` creates `PCS1:` by base64url encoding `JSON.stringify(exportProject())`.
- `parseShareCode(text)` decodes `PCS1:` and returns `sanitizeProjectData(parsed)`.
- `parseProjectText(text)` accepts either raw JSON or `PCS1:`.
- `exportProject()` emits the current persisted Pocket Chordsmith JSON.
- `importProject(rawData)` sanitizes and writes normalized data back into UI state.

Extraction candidates:

- `parseProjectText`
- `buildShareCode`
- base64url helpers
- schema constants
- project normalizer/migrations
- section data normalizers
- tuplet/hold/slide/guitar/bass lane normalizers

Risk: Pocket DJ and Pocket DAW already contain parallel normalizers with slightly different defaults and allowed ranges. Pocket Audio Core should become the only source of truth for schema normalization.

### Timeline, Scheduler, And Event Generation

- `buildStepTimeline`, `stepDurationForIndex`, `spanDurationForSteps`, `tripletTimesForSpan`, and related helpers calculate swing and tuplet timing.
- `buildSequenceEvents()` builds full-song event data for export/offline paths.
- `buildPlaybackPlan(mode)` creates section or sequence step plans.
- `schedulePlanStep(item, time)` schedules drums, bass, guitar, chords, melody, XY pad pulses, humanize offsets, sidechain ducks, and UI highlights.
- `scheduler()` uses an audio-clock lookahead loop with `SCHEDULER_LOOKAHEAD_SECONDS = 0.22` and `SCHEDULER_INTERVAL_MS = 25`.
- `startPlayback()` initializes the plan, audio context, and scheduler.

Extraction candidates:

- deterministic timeline/event renderer independent of DOM
- live scheduler that consumes event streams
- transport state machine for section/sequence playback
- humanize and swing helpers with deterministic seeds
- role/stem event metadata for drums, bass, chords, melody, guitar

Risk: current live scheduling and export event generation are not a clean single path. A parity phase must compare current app event traces against the new core before integration.

### Web Audio Instruments And FX

- `ensureAudio()` builds the live Web Audio graph: role gains, dry/synth/FX buses, delay, chorus, flanger, convolution reverb, FX wet master, tone filter, master limiter, and destination routing.
- Live instruments include procedural drums, bass, chord instruments, melody instruments, XY pad voices, guitar voices, metronome, and voice pruning.
- Important live functions include `playKick`, `playSnare`, `playHat`, `playBass`, `playChord`, `playLead`, `playLeadInstrument`, `playLeadPhraseInstrument`, `playGuitarVoice`, and `scheduleGuitarStep`.
- FX parameters include delay, chorus, flanger, reverb, FX mix, sidechain/pump, and master/chord/beat/lead/guitar volumes.

Extraction candidates:

- audio context wrapper
- reusable role buses and mixer
- voice manager and voice limits
- drum, bass, chord, melody, guitar synth modules
- FX modules for delay, chorus, flanger, reverb, filter, limiter, and sidechain
- deterministic shared buffers/impulses/noise generation

Risk: some instruments are more advanced in Pocket Chordsmith than Pocket DJ and Pocket DAW. Core should start from the Chordsmith implementation, then expose simpler presets for DJ/game use.

### WAV And Offline Rendering

- `exportWavFile()` uses `OfflineAudioContext`.
- `makeOfflineTone`, `makeOfflineChordTone`, `makeOfflineLeadPhrase`, `makeOfflineToneSlide`, `makeOfflineKick`, `makeOfflineSnare`, `makeOfflineHat`, and `renderGuitarOffline` mirror live synthesis for export.
- `writeWavFromBuffer(buffer)` encodes the rendered buffer to a WAV blob.

Extraction candidates:

- offline renderer using the same event stream and instrument modules as live playback
- WAV encoder
- stem renderer by role
- render profile support for sequence, section, loop, and game pack exports

Gap: current Pocket Chordsmith renders full WAV output but does not yet expose true per-stem rendering.

### MIDI Import And Export

- `buildQuantizedMidiEvents()` and `buildPerformanceMidiEvents()` convert Chordsmith events to MIDI event data.
- `exportMidiFile()` writes MIDI.
- MIDI import hooks include file input handling plus `importMidiFile(file)` and related MIDI parsing/conversion helpers.

Extraction candidates:

- event-to-MIDI conversion
- MIDI constants and tick conversion
- MIDI import parser only if the core is expected to normalize incoming MIDI into Chordsmith-compatible lanes

Boundary: MIDI import may remain an app-level composition feature at first, while MIDI export from the normalized event stream belongs in the core.

### Push And Handoff Hooks

- `pushToPocketDj()` builds a `PCS1:` code, stores a `PocketHandoff` envelope, copies fallback text, and opens Pocket DJ.
- `pushToGodot()` builds `PCS1:`, tries POST to the local Godot addon receiver, and falls back to clipboard/paste.
- `postCodeToGodotReceiver()` posts JSON to `http://127.0.0.1:9087/pocket-chordsmith/push-to-godot` and localhost fallback.

Extraction boundary: handoff transport is app-level. Core should expose share-code import/export and optional Godot/game pack generation, not own browser navigation or clipboard UI.

## Pocket DJ Prototype

Main file now: `apps/pocket-dj/pocket_dj_v1g_core_bridge.html`

Historical source file for this inventory: `pocket_dj/pocket_dj_v1f_push_handoffs.html`

Pocket DJ currently duplicates enough Chordsmith parsing and audio code to perform imported songs as a live deck.

### Parser And Session Normalisation

- Constants include `PCS1:`, `PDJ1:`, schema 16, stems, scheduler timing, default stem volumes/mutes, and DJ FX defaults near lines 258-278.
- `parsePocketChordsmithShareCode`, `parsePocketDjShareCode`, `parsePocketChordsmithJson`, and `parseAnyImportText` handle import text.
- `sanitizePocketChordsmithProject(raw)` creates a DJ-friendly normalized Chordsmith project.
- `createDjSessionFromChordsmithProject(project)` wraps the source project in a `PocketDJ` session with deck and performance state.
- `normalizePocketDjSession(raw)` restores a DJ session while preserving source Chordsmith project data.
- `buildSourcePocketChordsmithShareCode()` returns only the source project as `PCS1:` for "Edit this song".

Extraction candidates:

- reuse core `PCS1` parsing and normalization
- keep DJ session/performance state in Pocket DJ, outside the core
- keep `PDJ1` as a DJ wrapper, not a core requirement for the first pass

Risk: Pocket DJ's sanitizer allows BPM 40-240 and assumes higher default resolution than the Chordsmith simple-mode import path. The core needs deliberate compatibility policy here.

### Live Audio And Mixer

- `ensureAudio()` builds DJ role gains, master filter, limiter, FX send, delay, reverb, and master output.
- Instruments include simplified `playKick`, `playSnare`, `playHat`, `playBass`, `playChord`, `playMelody`, and `playGuitar`.
- `applyMixerAndFx()` applies stem gain, master volume, filter cutoff, echo, reverb, and FX send.
- Stems are `drums`, `bass`, `chords`, `melody`, and `guitar`.

Extraction candidates:

- DJ should eventually consume the same core instrument modules and stem mixer as Pocket Chordsmith.
- DJ-specific controls should map to core stem volumes, mutes, filter, echo/reverb sends, build/drop macros, loop state, and section queue commands.

Gap: DJ currently has no offline render path and no real stem export. It performs live only.

### Scheduler, Launch, Build, And Drop

- `scheduleStep(section, step, time)` schedules imported section content into DJ stems.
- `schedulerTick()` uses a lookahead loop with `LOOKAHEAD_SECONDS = 0.22` and `SCHEDULER_MS = 25`.
- `advanceStepAfterScheduling()` handles section boundaries, launch quantization, queued sections, sequence playback, loop current section, and drop boundary timing.
- Build/drop macros live in `triggerBuild`, `triggerDrop`, `startPerformanceMacro`, `playBuildRiser`, and `playDropImpact`.

Extraction candidates:

- core adaptive transport API should support `queueSection`, launch quantize, loops, sequence playback, and game states.
- DJ build/drop can either live in Pocket DJ as a macro over core controls or become an optional core performance utility.

## Pocket DAW

Folder: `pocket-daw/`

Pocket DAW already contains the cleanest modular TypeScript shape and should heavily inform Pocket Audio Core, while remaining broader than the core.

### Existing Relevant Modules

- `src/compatibility/pcsParser.ts` implements `PCS1:` and `PDJ1:` parse helpers and `buildPocketChordsmithShareCode`.
- `src/compatibility/pcsSanitizer.ts` defines `SanitizedPcsProject`, `SanitizedPcsSection`, and a defensive sanitizer for imported Chordsmith data.
- `src/compatibility/pcsToDaw.ts` converts sanitized Chordsmith projects to `.pocketdaw` timeline clips, tracks, source refs, FX, and export profiles.
- `src/audio/eventRenderer.ts` renders generated-section clips into deterministic events for drums, bass, chords, melody, and guitar.
- `src/audio/audioEngine.ts` provides a class-based live Web Audio engine with track outputs, scheduler diagnostics, meters, loop seek, and FX chain routing.
- `src/audio/offlineRender.ts` renders the DAW project to WAV with `OfflineAudioContext`.
- `src/audio/midiExport.ts` exports rendered events to MIDI.
- `src/audio/instruments.ts` schedules instrument events into Web Audio nodes.
- `src/audio/fxProcessor.ts` connects DAW FX chains.
- `src/daw/schema.ts`, `mixer.ts`, `fx.ts`, `routing.ts`, `tracks.ts`, and `exportProfiles.ts` represent DAW-specific structures that should stay larger than Pocket Audio Core.

Core extraction implication: many concepts are already well factored here, but the DAW version is not guaranteed to match Pocket Chordsmith sound yet. Treat it as a modular prototype, not the canonical sound source.

### DAW Boundary

Pocket DAW should host Pocket Audio Core lanes but must not be reduced to them. Audio clips, sample media, recording, piano-roll clips, automation, mixer routing, and DAW-only export workflows stay in the DAW.

## Godot Addon

Folder now: `addons/pocket_chordsmith/`

Historical source folder for this inventory: `godot-addon/`

Godot is currently an import/compiler/runtime ecosystem, not a Web Audio parity runtime.

### Import And Compile

- `addons/pocket_chordsmith/import/pcs_json_importer.gd` parses JSON/share-code input and builds import reports.
- `addons/pocket_chordsmith/import/pcs_schema_migrator.gd` normalizes imported project dictionaries.
- `addons/pocket_chordsmith/import/pcs_chart_compiler.gd` compiles projects into chart resources with chord, drum, bass, guitar, melody, and marker events.
- `addons/pocket_chordsmith/import/pcs_chart_build_tools.gd` supports compile file/folder, web sound kit generation, and integration reports.
- `addons/pocket_chordsmith/editor/pcs_main_screen.gd` handles UI import, paste, compile, preview, save, and direct push receiver startup.
- `addons/pocket_chordsmith/editor/pcs_push_receiver.gd` exposes the editor-only localhost receiver for browser Push-to-Godot.

### Runtime And Audio

- `addons/pocket_chordsmith/runtime/pocket_chordsmith_conductor.gd` drives chart playback, section queues, music states, stingers, stem sync, sample preview, bus routing, and event signals.
- `addons/pocket_chordsmith/resources/pcs_playback_profile.gd` defines playback backends and paths for stems, samples, buses, and preview assets.
- `addons/pocket_chordsmith/runtime/PocketChordsmithPlayer.gd` is an older procedural preview/reference path, not a parity guarantee.
- `addons/pocket_chordsmith/editor/pcs_audio_bus_tools.gd` creates recommended Godot music buses and preview effects.

Core extraction implication: Godot should receive assets/manifests generated by Pocket Audio Core for true sound parity. Godot-native procedural playback should be clearly labelled preview unless parity tests prove otherwise.

## Duplication Map

| Area | Pocket Chordsmith | Pocket DJ | Pocket DAW | Godot |
| --- | --- | --- | --- | --- |
| `PCS1:` parsing | Yes, canonical browser helper | Yes, duplicate helper | Yes, TypeScript helper | Yes, importer path |
| Schema normalisation | Yes, schema 16 rich UI model | Yes, DJ-friendly duplicate | Yes, modular sanitizer | Yes, GDScript migrator |
| Timeline/event generation | Live plan plus export events | Live schedule only | Modular event renderer | Chart compiler |
| Live Web Audio | Rich procedural engine | Simplified procedural deck | Modular engine | No Web Audio |
| Stem mixer | Role gains, not true exported stems | DJ stems and mutes | DAW tracks/mixer | Godot buses/stems |
| FX | Delay/chorus/flanger/reverb/sidechain | Filter/echo/reverb/build/drop | FX chains | Godot bus/sample/stem controls |
| WAV/offline | Full WAV render | None | Full WAV render | Generates/uses sound kit assets |
| MIDI export | Yes | No | Yes | Event resource export, not MIDI-focused |
| MIDI import | Yes, Advanced mode | No | Planned/import buttons guarded | No |
| Godot handoff | Direct local POST plus clipboard fallback | No direct Godot path | Planned | Receiver/import/compiler |

## Prompt 01 Traceability Matrix

| Inventory item | Current source/function anchors | Core decision | Data fields touched | Tests needed | Key risk |
| --- | --- | --- | --- | --- | --- |
| `PCS1:` parsing/building | Chordsmith `buildShareCode`, `parseShareCode`, `parseProjectText`; DJ `parsePocketChordsmithShareCode`; DAW `pcsParser.ts`; Godot importer | Move to core, app wrappers temporarily call core | share prefix, encoded JSON, project schema | valid/invalid `PCS1`, raw JSON, roundtrip, corrupted base64 | Divergent error handling and fallback behavior |
| Raw JSON import/export | Chordsmith `exportProject`, `importProject`, `parseProjectText`; DJ `parsePocketChordsmithJson`; DAW `parseAnyImportText` | Move parsing/normalization to core; keep UI import/export buttons in apps | all project JSON fields | raw JSON fixture import/export snapshots | UI state and saved project shape are currently intertwined |
| Schema normalisation | Chordsmith `sanitizeProjectData`; DJ `sanitizePocketChordsmithProject`; DAW `pcsSanitizer.ts`; Godot `pcs_schema_migrator.gd` | Move to core and keep Godot migrator aligned until Godot consumes manifests/assets | schema/projectVersion, defaults, legacy aliases | schema 16 fixture snapshots, legacy alias tests | Different defaults between apps can change sound |
| Section A-H handling | Chordsmith `SECTION_IDS`, `SECTION_PROP_GROUPS`, `getSectionData`, `sectionPropKey`; DJ `sanitizeSection`; DAW `SanitizedPcsSection` | Move runtime section model to core; keep UI section editing in apps | `gridA-H`, `melodyTracksA-H`, `progressionA-H`, `sectionBars` | every section active/inactive, section length, missing section defaults | Section data is wide and easy to partially migrate |
| Song sequence handling | Chordsmith `sequenceList`, `sanitizeSongSequence`, `buildPlaybackPlan`; DJ `sanitizeDjSequence`, sequence controls; DAW clip conversion | Move deterministic sequence timeline to core; keep app sequence UI | `songSequence`, max slots, section IDs | A-B-C-D-A sequence event trace | DJ performance sequence must not overwrite source composition |
| Time/BPM/swing/resolution | Chordsmith `beatDur`, `stepDurationForIndex`, `buildStepTimeline`; DJ `beatDur`, `stepDuration`; DAW event renderer timing | Move timing helpers to core | `bpm`, `timeSig`, `swing`, `resolution`, `lastAdvancedResolution` | 3/4, 4/4, swing, resolution 1/2/4/8/16 | Simple mode resolution differs from advanced/editor expectations |
| Tuplet/triplet handling | Chordsmith `normalizeTupletStarts`, `tripletTimesForSpan`, `gridTripletStart`, `melodyTripletStart`; DJ `isTupletStart`; DAW event renderer | Move event semantics to core; keep UI gesture/editing in apps | `gridTupletsA-H`, `melodyTupletsA-H` | overlapping cleanup, event times, MIDI ticks, WAV duration | Triplets must match live, MIDI, and WAV |
| Chord/scale generation | Chordsmith `generateAvailableChords`, chord helpers; DJ `scalePcs`, `makeChord`; DAW event renderer chord helpers | Move musical theory helpers to core | `key`, `scale`, `chordType`, `progressionA-H` | major/minor degrees, chord type, transposition | Duplicate chord voicing can change perceived identity |
| Drum playback | Chordsmith `playKick`, `playSnare`, `playHat`, drum schedule branch; DJ drum functions; DAW `scheduleInstrumentEvent` | Move synth and event role to core | `gridA-H.kick/snare/hat`, accents, tuplets | event trace, live smoke, offline render | DJ drums are simplified and can drift from Chordsmith |
| Bass playback | Chordsmith `playBass`, `playBassPhrase`, `bassStepMidiAt`; DJ `playBass`, `bassMidiAt`; DAW bass event helpers | Move event and synth to core | `bassMode`, `grid.bass`, `bassNotes`, `bassHold`, `bassSlide`, `bassAccent`, `bassOn` | auto/manual, holds, slides, accents, tuplets | Manual bass rules differ by sanitizer |
| Chord playback | Chordsmith `playChord`, chord tone/config helpers; DJ `playChord`; DAW chord events | Move synth/event to core | `chordsOn`, `chordInstrument`, `chordRhythmMode`, `chordPlayMode`, `chordOctave`, `chordVol` | instruments, strum/arp/block, rhythm modes, octave | Offline/live chord instrument parity is complex |
| Melody playback | Chordsmith `playLeadInstrument`, `playLeadPhraseInstrument`; DJ `playMelody`; DAW melody events | Move event/synth to core | melody tracks, instruments, octaves, mute/solo/pan, hold/slide/tuplet | multi-track, mute/solo, pan, slides, tuplets | Multiple melody tracks and XY pad behavior need careful staging |
| Guitar playback | Chordsmith `scheduleGuitarStep`, `playGuitarVoice`, `renderGuitarOffline`; DJ `playGuitar`; DAW guitar events | Move event/synth to core | `guitarEnabled`, `guitarTone`, `guitarRegister`, `guitarStrumMode`, `guitarVolume`, `guitarPatternA-H` | articulations, register, strum direction, holds | Guitar is one of the largest sound-parity gaps |
| FX | Chordsmith `ensureAudio`, `applyFxSettings`, sidechain helpers; DJ `applyMixerAndFx`; DAW `fxProcessor.ts` | Move reusable FX modules to core; app macro/UI controls stay in apps | delay, chorus, flanger, reverb, filter, sidechain, FX mix | parameter mapping, ramp smoothing, sidechain duck | Chordsmith and DJ expose different FX controls |
| Live scheduler | Chordsmith `scheduler`, `startPlayback`; DJ `schedulerTick`; DAW `AudioEngine` scheduler | Move scheduler/transport primitives to core | playback mode, section, sequence, loop state | lookahead timing, late-event diagnostics, pause/seek | UI updates must stay separated from audio scheduling |
| Voice limiting/pruning | Chordsmith active voice pools and `LIVE_*_VOICE_LIMIT`; DAW diagnostics; DJ lacks rich limits | Move to core voice manager | active voices by role, limits, fades | stress tests, role budgets, no stuck nodes | Global limits can keep drums alive while starving harmony/melody |
| Offline/WAV render | Chordsmith `exportWavFile`, `makeOffline*`, `writeWavFromBuffer`; DAW `offlineRender.ts` | Move to core with same event/instrument path | render scope, sample rate, tail, mix settings | WAV header/duration, event count, stem duration | Current Chordsmith live/offline code can drift |
| MIDI import/export | Chordsmith MIDI import/export helpers; DAW `midiExport.ts` | Move MIDI export to core; defer MIDI import unless needed | PPQ 480, export mode, chord export, exact durations | MIDI note counts/tracks/ticks | MIDI import is composition UI, not required for core v0 |
| Pocket DJ performance | DJ `createDjSessionFromChordsmithProject`, `scheduleStep`, mixer, queue/build/drop/loop functions | Core supplies audio and transport primitives; DJ owns performance session | stem volumes/mutes, launch quantize, queued section, loop, build/drop FX | import-to-play, queue boundaries, build/drop macros | DJ changes must not become source composition edits |
| Godot expectations | Godot importer/compiler, `PCSMainScreen`, `PCSPushReceiver`, conductor, playback profile | Core exports manifests/assets; Godot owns editor/runtime conductor | chart events, playback profile, stems, samples, buses, states | manifest import, stem pack smoke, addon import | Native procedural preview is not exact parity |

Live playback path today:

```text
Pocket Chordsmith UI state -> buildPlaybackPlan/scheduler -> schedulePlanStep -> procedural Web Audio voices/FX
Pocket DJ session -> schedulerTick -> scheduleStep -> simplified procedural Web Audio voices/stem mixer/FX
Pocket DAW project -> renderTimelineEvents -> AudioEngine scheduler -> scheduleInstrumentEvent
Godot chart -> PocketChordsmithConductor -> Godot streams/samples/stems/native preview
```

Offline/render path today:

```text
Pocket Chordsmith exportProject/buildSequenceEvents -> OfflineAudioContext makeOffline* -> writeWavFromBuffer
Pocket DAW renderTimelineEvents -> OfflineAudioContext scheduleInstrumentEvent -> encodeWav
Godot build tools -> generated web sound kit/profile and compiled chart resources
Pocket DJ -> no offline render path yet
```

## Highest-Risk Parity Issues

1. Multiple normalizers have different defaults, ranges, and assumptions.
2. Live playback and offline rendering in Pocket Chordsmith are separate enough to drift.
3. Pocket DJ instruments are simplified and do not sound identical to Pocket Chordsmith.
4. Pocket DAW has a clean engine shape but is not yet proven sound-equivalent.
5. Godot procedural preview cannot be treated as exact Web Audio parity.
6. Humanize, swing, tuplets, holds, slides, guitar holds, sidechain, and build/drop need deterministic event fixtures.
7. Current app-level handoff code should stay outside the core to avoid coupling audio code to browser windows, clipboard, and itch behavior.

## Recommended Source Of Truth For Extraction

- Parser and normalizer: start from Pocket Chordsmith v67 behaviour, compare against Pocket DAW's modular sanitizer, then make one tested TypeScript/JavaScript implementation.
- Deterministic event renderer: start from Pocket Chordsmith `buildSequenceEvents()` and scheduler semantics, cross-check with Pocket DAW `eventRenderer.ts`.
- Live Web Audio instruments: start from Pocket Chordsmith procedural instruments and FX, because they are the richest current sound identity.
- Engine class shape and diagnostics: borrow structure from Pocket DAW `AudioEngine`.
- DJ adaptive controls: preserve Pocket DJ's section queue/build/drop UX as a consumer of core APIs.
- Godot parity: generate stems, loops, stingers, sample kits, and event manifests from the core rather than porting Web Audio synthesis to GDScript.

## Practical Checks Run During Inventory

- `rg --files`
- `git status --short --branch --untracked-files=all`
- `git status --short --branch` inside `pocket-daw`
- `git status --short --branch` inside `godot-addon`
- Targeted `rg` searches over Chordsmith, DJ, DAW, and Godot source files for parser, normalizer, scheduler, audio, FX, WAV, MIDI, and handoff symbols
- `git diff --check` from the root workspace: passed
- Historical Node `vm.Script` parse of scripts inside `web-app/pocket_chordsmith_v67_direct_godot_push.html` and `pocket_dj/pocket_dj_v1f_push_handoffs.html`: passed
- ASCII check for the three new docs with `rg -n "[^\x00-\x7F]"`: passed, no matches
- `npm test` inside `pocket-daw`: passed, 16 test files and 57 tests
