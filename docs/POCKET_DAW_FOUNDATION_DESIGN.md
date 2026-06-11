# Pocket DAW Foundation Design

Date: 2026-06-11

## 1. Product Vision

Pocket DAW should feel like a small, approachable browser DAW: Audacity/Fruity Loops plus Pocket Chordsmith.

The DAW is not only a Chordsmith editor. It should support timeline audio production: imported clips, recorded audio, MIDI-like lanes, drum machines, samplers, automation, bus routing, render/bounce, and full-song export.

Pocket Chordsmith remains the fast composition sketchpad. Pocket DJ remains the performance deck. Pocket DAW becomes the arrangement, editing, audio-production, and mixdown workspace.

## 2. How Pocket Audio Core Fits

Pocket Audio Core is one engine inside Pocket DAW, not the whole DAW.

Use Pocket Audio Core for:

- importing `PCS1:` and raw Pocket Chordsmith JSON,
- normalising Chordsmith-compatible projects,
- playing Chordsmith-compatible clips,
- rendering Chordsmith clips to audio,
- rendering Chordsmith stems,
- preserving section/event timing,
- exporting compatibility data for Pocket DJ and Godot.

Do not force audio tracks, mic recordings, sample clips, piano-roll clips, bus routing, waveform editing, or project save/load to live inside Pocket Audio Core.

## 3. Track And Lane Model

Suggested top-level model:

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

Track types:

- `AudioTrack`: waveform clips, imported audio, recorded audio.
- `MidiTrack`: piano-roll/MIDI-like note clips and instrument assignment.
- `PocketChordsmithTrack`: Chordsmith source clips powered by Pocket Audio Core.
- `DrumMachineTrack`: pattern clips and sample kits.
- `SamplerTrack`: pitched or one-shot sample clips.
- `BusTrack`: routing, group processing, sidechain targets.

All track types share common fields:

```json
{
  "id": "track_1",
  "type": "AudioTrack",
  "name": "Lead Vocal",
  "clips": [],
  "mixer": { "volume": 0.9, "pan": 0, "mute": false, "solo": false, "bus": "master" },
  "automation": []
}
```

## 4. Clip Model

Every clip has timeline placement and type-specific payload:

```json
{
  "id": "clip_1",
  "type": "AudioClip",
  "trackId": "track_1",
  "startBeat": 16,
  "lengthBeats": 8,
  "offsetSeconds": 0,
  "gain": 1,
  "fadeInBeats": 0,
  "fadeOutBeats": 0,
  "loop": false,
  "payload": {}
}
```

Common clip operations:

- trim,
- split,
- move,
- copy,
- loop,
- mute,
- clip gain,
- fades,
- bounce/freeze.

Clip types can include:

- `AudioClip`,
- `MidiClip`,
- `PocketChordsmithClip`,
- `DrumPatternClip`,
- `SamplerClip`,
- `AutomationClip`.

## 5. Audio Import And Recording Model

Audio assets should live in `assets.audio` and be referenced by clips:

```json
{
  "assets": {
    "audio": {
      "asset_1": {
        "name": "guitar_take.wav",
        "mimeType": "audio/wav",
        "durationSeconds": 18.4,
        "sampleRate": 44100,
        "channels": 2,
        "source": "import"
      }
    }
  }
}
```

Supported sources:

- imported WAV,
- imported MP3/OGG where browser decoding supports it,
- mic recording where permission/browser allows it,
- rendered/bounced clips from Pocket Audio Core,
- rendered/bounced stems.

Recording should create an asset first, then place an `AudioClip` on the selected track.

## 6. Chordsmith Project Lane Model

`PocketChordsmithTrack` or `PocketChordsmithClip` can contain:

- raw Pocket Chordsmith project JSON,
- `PCS1:` source,
- selected section or sequence,
- loop range,
- render settings,
- stem split settings,
- Pocket Audio Core version used.

Example:

```json
{
  "type": "PocketChordsmithClip",
  "startBeat": 0,
  "lengthBeats": 32,
  "payload": {
    "sourceType": "PCS1",
    "source": "PCS1:...",
    "sectionSelection": ["A", "B"],
    "loopRange": { "startSection": "A", "endSection": "B" },
    "renderSettings": { "sampleRate": 44100, "profile": "offline" },
    "stemSplit": { "enabled": true, "stems": ["drums", "bass", "chords", "melody", "guitar"] },
    "coreVersion": "0.1.0-scaffold"
  }
}
```

It should be able to:

- play live through Pocket Audio Core,
- render to an audio clip,
- render to stems,
- send source project back to Pocket Chordsmith,
- send a performance version to Pocket DJ.

## 7. Piano-Roll / MIDI-Like Lane Model

`MidiTrack` should not be limited to Chordsmith scale grids.

Suggested clip payload:

```json
{
  "type": "MidiClip",
  "payload": {
    "instrument": "internal_synth_1",
    "notes": [
      { "startBeat": 0, "durationBeats": 1, "midi": 60, "velocity": 0.8 }
    ],
    "controller": []
  }
}
```

Later compatibility:

- import MIDI into piano-roll clips,
- convert selected MIDI clips into Chordsmith melody lanes where possible,
- export MIDI from MIDI tracks independently from Chordsmith exports.

## 8. Mixer Model

Mixer should be DAW-native and track-based:

```json
{
  "mixer": {
    "tracks": {
      "track_1": { "volume": 0.9, "pan": 0, "mute": false, "solo": false, "bus": "master" }
    },
    "buses": {
      "master": { "volume": 1, "fx": [] },
      "music": { "volume": 0.9, "fx": [] },
      "vocals": { "volume": 0.85, "fx": [] }
    }
  }
}
```

Pocket Audio Core stem routing should map into DAW mixer lanes or sub-buses when a Chordsmith clip is expanded to stems.

## 9. FX And Automation Model

FX should be DAW-native and attach to tracks, buses, clips, or sends:

- EQ/filter,
- delay,
- reverb,
- compressor/limiter,
- gain,
- pan,
- sidechain/ducking,
- future plugin slots.

Automation should target any stable parameter:

```json
{
  "target": "track_1.mixer.volume",
  "points": [
    { "beat": 0, "value": 0.75, "curve": "linear" },
    { "beat": 16, "value": 1, "curve": "ease" }
  ]
}
```

Pocket Audio Core FX can remain inside Chordsmith clips before render, while DAW FX process the rendered/live output after routing.

## 10. Offline Render / Bounce Model

The render graph should mix heterogeneous tracks:

1. Decode audio assets.
2. Render Pocket Chordsmith clips through Pocket Audio Core.
3. Render MIDI/sampler/drum clips through DAW engines.
4. Apply clip gain/fades.
5. Route through track mixer.
6. Apply sends/buses.
7. Apply master processing.
8. Encode WAV/stems.

Bounce/freeze:

- `PocketChordsmithClip` -> `AudioClip`
- `PocketChordsmithClip` -> multiple stem `AudioClip`s
- `MidiClip` -> `AudioClip`
- track -> audio stem
- full project -> WAV

## 11. Project Save Format

Pocket DAW save format should be independent from Pocket Chordsmith schema:

```json
{
  "app": "PocketDAW",
  "projectVersion": 1,
  "title": "New Track",
  "timeline": {
    "bpm": 120,
    "timeSig": 4,
    "tempoMap": [],
    "markers": [],
    "arrangementSections": []
  },
  "tracks": [],
  "mixer": {},
  "automation": [],
  "assets": {}
}
```

Chordsmith clips keep their original source inside clip payloads so they can round-trip back to Pocket Chordsmith.

## 12. Export To WAV / Stems

Export modes:

- full mix WAV,
- selected track WAV,
- selected bus WAV,
- all tracks as stems,
- Chordsmith clip stems,
- Godot kit export through Pocket Audio Core,
- DJ handoff package for Chordsmith-derived material.

Stem export should preserve:

- file naming,
- track/bus identity,
- sample rate,
- render start/end,
- silence padding for alignment.

## 13. Export / Import Compatibility

Pocket Chordsmith compatibility:

- import `PCS1:` as `PocketChordsmithClip`,
- import raw project JSON as `PocketChordsmithClip`,
- send original source back to Pocket Chordsmith for editing,
- optionally replace clip source when edited song returns.

Pocket DJ compatibility:

- send a Chordsmith clip/source to Pocket DJ as `PCS1:`,
- optionally send a performance/session wrapper later,
- do not convert DAW-only audio edits into Pocket Chordsmith data.

Godot compatibility:

- export Chordsmith clips or full Chordsmith-derived sections through Pocket Audio Core Godot kits,
- export DAW full mixes/stems through DAW render paths,
- keep chart import separate from parity audio export.

## 14. Exceeding Chordsmith Without Breaking Parity

Pocket DAW can exceed Chordsmith by keeping a layered architecture:

- Chordsmith-compatible data stays in `PocketChordsmithClip` payloads.
- Pocket Audio Core handles Chordsmith-compatible timing/rendering.
- DAW tracks handle broader audio production.
- DAW-specific edits happen above or around the Chordsmith source, not inside it.
- Sending back to Chordsmith sends the original or explicitly edited Chordsmith project only.
- Bounced audio/stems can preserve DAW edits without pretending those edits are valid Chordsmith schema.

This lets Pocket DAW add waveform editing, recording, piano roll, samplers, buses, and long arrangements without damaging Chordsmith parity.

## First Implementation Recommendation

Build in this order:

1. Timeline shell with tracks and clips.
2. Audio clip lane with imported WAV.
3. Chordsmith lane powered by Pocket Audio Core.
4. Simple mixer with volume/mute/solo.
5. Render/export full mix.
6. Save/load project JSON.

Avoid building the entire DAW at once. The first release should prove the editing timeline, asset model, and one core-backed Chordsmith lane.

## Design-Step Test Plan

No full implementation tests are required for this design prompt.

When code is added, start with:

- project save/load round trip,
- audio asset import smoke,
- Chordsmith lane `PCS1:` import,
- Pocket Audio Core render-to-clip smoke,
- full mix export smoke,
- send-back source integrity check for Pocket Chordsmith,
- send-to-DJ source handoff check.
