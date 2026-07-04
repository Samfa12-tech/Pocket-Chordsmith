# Pocket DAW Architecture

Pocket DAW is a native-only Windows DAW in the Pocket Audio family.

It is built as a Tauri Windows desktop app. The TypeScript UI is not the
product boundary; the installed Windows app, native audio engine, native
recording path, native render/cache path, and `.pocketdaw` project format are
the product boundary.

## Core Invariant

Timing is central.

The native audio engine / sample clock owns:

- playback position
- scheduler timing
- recording placement
- loop boundaries
- render/cache timing
- export duration and alignment

The UI owns:

- display
- user commands
- editing gestures
- panels/controls
- status reporting

The UI must not drive musical timing.

## Required Separation

Pocket DAW should keep these systems separate:

1. Project model
2. Transport/timeline clock
3. Native audio engine
4. Scheduler
5. Native render/cache
6. WAV/stem export
7. Recording system
8. Mixer/effects
9. Command/undo system
10. UI layer
11. Release/smoke evidence

## Live Playback and Export Parity

Live playback, native render/cache, and WAV/stem export should interpret the
same project/timeline model wherever possible. Export must not use UI timing or
visual playhead state.

## Recording Alignment

Recorded material should be placed according to native transport/audio sample
position with appropriate latency/offset handling. Wall-clock/UI event time
should not be the source of truth for recording placement.

## Agent Rule

Do not implement Pocket DAW as a browser/Web Audio app. For DAW work, inspect
the native Windows/Tauri app, native audio bridge, renderer/exporter,
recording path, tests, and release status before editing.
