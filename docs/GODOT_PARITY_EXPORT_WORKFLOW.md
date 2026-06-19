# Godot Parity Export Workflow

Pocket Audio Core is the sound-truth layer for Pocket Chordsmith-to-Godot parity.

The safest route is to export audio assets and manifests from Pocket Audio Core, then let Godot use its native audio players, buses, conductor nodes, transitions, ducking, and signals to perform those assets. Godot games do not need to run JavaScript at runtime.

## Core Rule

Exact parity requires core-rendered assets.

Godot-native procedural playback is useful for fast editor preview, but it must be labelled `PROCEDURAL_PREVIEW` unless it has been tested against core-rendered output.

## Export Module

Core export API:

```js
import { createGodotExportKit, GODOT_EXPORT_PROFILES } from "./pocket-audio-core.esm.js";

const kit = await createGodotExportKit(pcs1OrJson, {
  profile: GODOT_EXPORT_PROFILES.LOOP_KIT,
  sampleRate: 48000
});

console.log(kit.manifest);
console.log([...kit.files.keys()]);
```

`kit.files` is a `Map<string, Blob>` where each key is the filename referenced by the manifest.
Pocket DAW packages this manifest at `manifests/godot-adaptive-manifest.json`; the shared pack folder and manifest names are generated into the Godot addon constants.

## Profiles

### STEM_SYNC

Use this when the Godot scene should play aligned full-song stems through native buses.

Generated assets:

```text
audio/stems/drums.wav
audio/stems/bass.wav
audio/stems/chords.wav
audio/stems/melody.wav
audio/stems/guitar.wav
audio/full/full_mix.wav
manifests/godot-adaptive-manifest.json
```

Best for:

- stem mute/solo in Godot,
- bus effects in Godot,
- linear or mostly linear playback,
- synchronized music beds.

### LOOP_KIT

Use this when Godot should transition between sections.

Generated assets:

```text
audio/sections/section_A_mix.wav
audio/sections/section_B_mix.wav
audio/sections/section_C_mix.wav
audio/sections/section_D_mix.wav
audio/stems/section_A_drums.wav
audio/stems/section_A_bass.wav
...
manifests/godot-adaptive-manifest.json
```

Best for:

- game state transitions,
- section pads,
- conductor-controlled loops,
- combat/exploration/victory section switching.

### HYBRID

Use this when the game needs a bed plus short accents/stingers/samples.

Generated assets:

```text
audio/stems/bed_drums.wav
audio/stems/bed_bass.wav
audio/stems/bed_chords.wav
audio/stems/bed_melody.wav
audio/stems/bed_guitar.wav
audio/samples/kick.wav
audio/samples/snare.wav
audio/samples/crash.wav
audio/samples/victory_stinger.wav
manifests/godot-adaptive-manifest.json
```

Best for:

- runtime accents,
- stingers,
- Godot-native SFX timing,
- mixed live/sample workflows.

Current v0 sample assets are placeholders and should be replaced as the generated sample kit matures.

### PROCEDURAL_PREVIEW

Use this for editor convenience only.

Generated assets:

```text
manifests/godot-adaptive-manifest.json
```

This profile marks the manifest as `previewOnly: true`.

## Manifest Shape

The generated manifest follows this shape:

```json
{
  "app": "PocketAudioCoreGodotKit",
  "coreVersion": "0.1.0-scaffold",
  "profile": "LOOP_KIT",
  "sourceProjectSchema": 16,
  "bpm": 118,
  "timeSig": 4,
  "swing": 0.04,
  "sampleRate": 48000,
  "sequence": ["A", "B"],
  "sections": {
    "A": {
      "bars": 4,
      "duration": 8.135,
      "loopStart": 0,
      "loopEnd": 8.135,
      "assets": {
        "mix": "audio/sections/section_A_mix.wav",
        "drums": "audio/stems/section_A_drums.wav",
        "bass": "audio/stems/section_A_bass.wav"
      }
    }
  },
  "assets": {},
  "events": [
    { "time": 0, "sectionId": "A", "bar": 1, "beat": 1, "type": "section_start" }
  ]
}
```

Loop points are section-relative and should be fed into the Godot conductor for clean loop boundaries.

## Godot Import Flow

1. Export a `PCS1:` or JSON song from Pocket Chordsmith.
2. Run `createGodotExportKit` in a desktop/web tooling step.
3. Write every `kit.files` entry to a Godot project folder.
4. Write `kit.manifest` as `manifest.json`.
5. Import WAVs into Godot.
6. Let `PCSGamePackManifest` or project code read `manifests/godot-adaptive-manifest.json`.
7. Use native Godot `AudioStreamPlayer` nodes/buses to play stems or section loops.
8. Use manifest `events` for section starts, beat/bar metadata, and gameplay signals.

`addons/pocket_chordsmith/import/pcs_game_pack_manifest.gd` can turn a DAW/Core manifest into a `PCSPlaybackProfile` using the existing conductor fields:

```gdscript
var tools := PCSChartBuildTools.new()
var result := tools.create_playback_profile_from_game_pack_manifest(
	"res://music/my_song/manifests/godot-adaptive-manifest.json",
	"res://music/my_song/my_song_profile.tres"
)
```

For `LOOP_KIT`, section assets are mapped into `playback_profile.stem_sets`. For `STEM_SYNC`, full-song stems are mapped into `playback_profile.stem_paths`. For `HYBRID`, bed stems and sample/stinger assets are mapped into the existing profile dictionaries.

Do not remove the existing chart import. The chart importer remains useful for editor inspection and procedural preview. The parity workflow adds rendered audio assets beside it.

## Updating The Godot Addon

When Pocket Audio Core changes:

1. Check `coreVersion` in exported manifests.
2. Confirm `sourceProjectSchema`.
3. Re-run manifest generation tests.
4. Import a small `LOOP_KIT` into Godot.
5. Confirm loop points, section durations, and stem alignment.
6. Label any native procedural preview as preview unless tested against exported core assets.

## Tests

Current automated coverage:

- manifest generation,
- section durations,
- loop point correctness,
- rendered file existence,
- stem duration alignment,
- event timeline export,
- profile behavior for `STEM_SYNC`, `LOOP_KIT`, `HYBRID`, and `PROCEDURAL_PREVIEW`.

Runtime Godot editor import still needs manual verification in an open Godot project.
