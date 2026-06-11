# Codex Prompt 03 — Extract Engine Logic Into Pocket Audio Core v0

Now begin the first real extraction into `packages/pocket-audio-core`.

## Goal

Move the reusable audio/runtime logic from the current Pocket Chordsmith and Pocket DJ code into Pocket Audio Core without breaking the existing apps.

This pass should produce a usable v0 core that can load a Pocket Chordsmith project, generate a timeline, play it, and render at least a basic WAV or offline buffer.

## Extract in this order

1. Constants and field names.
2. Share-code parsing/building.
3. Project normalisation/migration.
4. Section and sequence helpers.
5. Scale/chord helpers.
6. Timeline/event generation.
7. Stem bus/mixer creation.
8. Live scheduler.
9. Instrument/synth functions.
10. FX functions.
11. Offline renderer.
12. Diagnostics.

## Important behaviour to preserve

The core must preserve existing behaviour for:

- project schema 16-style data
- section IDs A-H
- maximum section bars currently used by Chordsmith
- key/scale/timeSig/BPM/swing/resolution
- chord type, chord instrument, chord play mode, rhythm mode, octave
- drum grid and drum accents
- drum tuplets/triplets
- melody tracks, instruments, octaves, mute/solo/pan
- melody holds/slides/tuplets
- bass manual/auto modes, notes, holds, slides, accents
- guitar enabled/tone/register/strum/pattern/volume
- FX delay/reverb/chorus/flanger/mix where present
- sidechain/pump settings
- song sequence
- section launch/queue logic where relevant

## Event timeline first

Before audio playback, build a deterministic event timeline API:

```js
const project = normalisePocketChordsmithProject(raw);
const timeline = buildPocketAudioTimeline(project, { scope: "sequence" });
```

Timeline events should include enough information for:

- live playback
- offline render
- MIDI export later
- visual/game callbacks
- Godot event manifests

Suggested event shape:

```js
{
  time: 1.5,
  duration: 0.25,
  step: 12,
  bar: 1,
  beat: 4,
  sectionId: "A",
  stem: "drums",
  type: "kick",
  velocity: 1,
  accent: false,
  tuplet: false
}
```

Do not overfit this exact shape if a better one emerges, but document it.

## Live engine

Implement/reuse:

- `PocketAudio.loadProject(input)`
- `PocketAudio.play()`
- `PocketAudio.stop()`
- `PocketAudio.restart()`
- `PocketAudio.queueSection(sectionId, options)`
- `PocketAudio.setSequence(sequence)`
- `PocketAudio.setLoop(options)`
- `PocketAudio.setStemVolume(stem, value)`
- `PocketAudio.setStemMute(stem, muted)`
- `PocketAudio.setFx(fx)`
- `PocketAudio.triggerBuild(options)`
- `PocketAudio.triggerDrop(options)`
- beat/bar/section event callbacks

## Offline render

Implement or partially implement:

- render full sequence to `AudioBuffer`
- render full sequence to WAV Blob or Uint8Array
- render stems where practical
- include all audible parts that live playback includes

If some instruments are not yet included, document the gap clearly.

## Existing apps

Do not wire Pocket Chordsmith or Pocket DJ to the core yet unless specifically safe and isolated.

You may create a small example page:

```text
packages/pocket-audio-core/examples/basic-html/index.html
```

The example should:

- load a built-in demo project
- play/stop
- queue a section
- adjust stem volume
- render a short WAV if implemented

## Tests

Add/extend tests for:

- schema normalisation
- timeline event counts
- timeline durations
- swing timing
- triplet timing
- section sequence timing
- held notes
- bass/guitar/melody event generation
- live engine construction
- offline render duration

Report commands run and limitations.

## Do not

- Do not rewrite app UIs.
- Do not remove old app functions yet.
- Do not claim exact parity until the parity harness passes.
- Do not introduce large dependencies without justification.
