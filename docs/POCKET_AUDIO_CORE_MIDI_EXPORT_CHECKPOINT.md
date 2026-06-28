# Pocket Audio Core MIDI Export Checkpoint

This checkpoint records when MIDI export should move from app-local implementations into Pocket Audio Core.

Current status: not moved yet. Pocket DAW has a working MIDI export path in `apps/pocket-daw/src/audio/midiExport.ts`, and Pocket Audio Core has the intended API shape in `docs/POCKET_AUDIO_CORE_API_DRAFT.md`. The move should happen only after the shared event renderer is accepted as the authoritative event source for the family.

## Current DAW Behavior

Pocket DAW exports MIDI by:

- rendering timeline events through `renderTimelineEvents(project)`
- writing SMF format 1 for multi-track exports
- preserving project BPM and time signature as meta events
- mapping drums to channel 10 and generated instruments to stable channels
- applying clip transforms such as transpose and gain before scoped export
- supporting full-project, selected-clip, and selected-track export scopes

Current tests:

```text
apps/pocket-daw/tests/midiExport.test.ts
```

## Core Target

Pocket Audio Core should eventually expose:

```ts
exportMidi(projectOrShareCode, {
  scope: "sequence",
  timing: "quantized",
  exactDurations: true
});
```

The Core exporter must consume the same normalized project and deterministic event stream used by live playback, WAV render, stems, and Godot manifests. App wrappers can then call Core instead of maintaining separate event-to-MIDI writers.

## Readiness Gates

Do not move DAW MIDI export behind Core until these are true:

- Core can generate or accept the same event shape DAW currently exports, including drums, bass, chords, melody, guitar, imported MIDI clips, clip transforms, mute/solo, and scoped clip/track filters.
- Core has fixture coverage for note counts, track counts, channels, ticks, tempo, time signature, and end-of-track markers.
- Chordsmith/Core/DAW parity tests agree on tuplets, swing, holds, slides, chord voicing, guitar gates, humanize/performance timing mode, and drum accents.
- DAW can still export selected clip and selected track MIDI without losing DAW-only timeline context.
- The exported file parses through the existing MIDI parser and at least one external MIDI-capable tool in installed-app smoke.

## Adapter Direction

The migration should happen in two small steps.

1. Mirror DAW event-to-MIDI logic into a Core adapter.
   - Keep DAW calling its local exporter.
   - Add Core tests using DAW/Core fixture events.
   - Compare exported structural summaries, not byte-for-byte files at first.

2. Switch DAW to Core export behind a guarded wrapper.
   - Keep the existing DAW tests.
   - Add a fallback or fixture comparison during the first release.
   - Remove local duplication only after scoped full/clip/track exports pass.

## Event Contract

The Core MIDI exporter needs event fields equivalent to:

```text
time
duration
trackId
role
kind
midi
midiNotes
velocity
clipId
drumLane
tuplet
accent
```

DAW-only source context should remain outside Core unless it affects exported notes or timing:

```text
selected clip IDs
selected track IDs
track names
track order
project title
project BPM/time signature/PPQ
```

## Known Gaps

- Imported MIDI clips are DAW-native data today; Core does not yet own MIDI import or a full DAW timeline model.
- Chordsmith MIDI export has its own quantized/performance history that still needs event-level comparison before a shared exporter can replace it.
- External playback/listening smoke remains required for release confidence; structural parsing alone is not a musical verification.

## Verification Commands

Current DAW guard:

```powershell
cd apps/pocket-daw
npm test -- tests/midiExport.test.ts tests/eventRenderer.test.ts
```

Future Core guard:

```powershell
cd packages/pocket-audio-core
npm test -- tests/core-midi-export.test.js
```

The future test file name is intentional documentation, not a claim that Core MIDI export exists today.
