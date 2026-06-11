# Codex Prompt 08 — Pocket DAW Foundation With Pocket Audio Core

Design the Pocket DAW architecture around Pocket Audio Core, without limiting the DAW to Chordsmith-style projects.

## Goal

Pocket DAW should be more like Audacity/Fruity Loops plus Pocket Chordsmith.

Pocket Audio Core should provide Chordsmith-compatible lanes and rendering, but the DAW itself should support broader timeline/audio production workflows.

## Important boundary

Pocket Audio Core is not the full DAW.

Pocket DAW should host Pocket Audio Core as one engine/lane type among others.

## Required design document

Create:

```text
docs/POCKET_DAW_FOUNDATION_DESIGN.md
```

Cover:

1. DAW product vision.
2. How Pocket Audio Core fits inside it.
3. Track/lane model.
4. Clip model.
5. Audio import/recording model.
6. Chordsmith project lane model.
7. Piano-roll/MIDI-like lane model.
8. Mixer model.
9. FX and automation model.
10. Offline render/bounce model.
11. Project save format.
12. Export to WAV/stems.
13. Export/import compatibility with Pocket Chordsmith and Pocket DJ.
14. How DAW can exceed Chordsmith without breaking Chordsmith parity.

## Suggested track model

```text
PocketDawProject
├─ timeline
│  ├─ tempo map
│  ├─ markers
│  └─ arrangement sections
├─ tracks
│  ├─ AudioTrack
│  ├─ MidiTrack
│  ├─ PocketChordsmithTrack
│  ├─ DrumMachineTrack
│  ├─ SamplerTrack
│  └─ BusTrack
├─ mixer
├─ automation
└─ assets
```

## Pocket Chordsmith lane

A `PocketChordsmithTrack` or clip should be able to contain:

- raw PCS project JSON
- `PCS1:` source
- section selection
- loop range
- render settings
- stem split settings
- core version used

It should be able to:

- play live through Pocket Audio Core
- render to audio clip
- render to stems
- send project back to Pocket Chordsmith
- send performance version to Pocket DJ

## DAW-specific features not limited by Chordsmith

Pocket DAW may include:

- audio tracks and clips
- external WAV/MP3/OGG import if supported
- waveform display
- trim/split/move/copy clips
- clip gain/fades
- recording from mic where browser permits
- piano roll
- sampler
- automation lanes
- bus routing
- master channel
- bounce/freeze tracks
- arrangement timeline longer than section A-H
- tempo map later
- non-Chordsmith instruments later

## Integration with Pocket Audio Core

Use Pocket Audio Core for:

- importing Chordsmith projects
- playing Chordsmith-compatible clips
- rendering Chordsmith clips to audio/stems
- shared Chordsmith instrument sounds
- shared section/event timing
- compatibility with Pocket DJ and Godot export

Do not force all DAW tracks to use Pocket Audio Core.

## First implementation recommendation

Do not build the whole DAW at once.

First build:

1. timeline shell
2. audio clip lane with imported WAV
3. Chordsmith lane powered by Pocket Audio Core
4. simple mixer with volume/mute/solo
5. render/export full mix
6. save/load project JSON

## Tests

For the design step, no full implementation tests are required. If code is added, include smoke tests for project save/load and core-backed Chordsmith lane import.

## Do not

- Do not make Pocket DAW a clone of Pocket Chordsmith.
- Do not make Pocket Audio Core carry all DAW responsibilities.
- Do not block future audio clips/samples/recording because they do not fit Chordsmith schema.
