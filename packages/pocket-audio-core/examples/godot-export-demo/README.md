# Godot Export Demo

This folder documents the Godot-facing Pocket Audio Core export flow.

The implementation lives in:

```text
packages/pocket-audio-core/src/export/godot-kit.js
```

## Quick Use

```js
import { createGodotExportKit, gamePackManifestPath, GODOT_EXPORT_PROFILES } from "../../src/index.js";

const kit = await createGodotExportKit(pcs1OrJson, {
  profile: GODOT_EXPORT_PROFILES.LOOP_KIT,
  sampleRate: 48000
});

const manifest = kit.manifest;
const files = kit.files;
const manifestPath = gamePackManifestPath("godot-adaptive-pack");
```

`files` is a `Map` of pack path to WAV `Blob`, using folders such as `audio/full/`, `audio/stems/`, `audio/sections/`, and `audio/samples/`.
Write the manifest to `manifestPath`, which is currently `manifests/godot-adaptive-manifest.json`.

## Profile Metadata Example

Core preserves Pocket Chordsmith family profile metadata in the manifest so Godot importers, runtime preview profiles, and game code can make routing decisions without reparsing the source project.

```js
const lofiKit = await createGodotExportKit({
  projectVersion: 16,
  title: "Rainy Shop Loop",
  audioProfile: "lofi_chill",
  lofiPreset: "lofi_koi_pond",
  lofiTexture: { enabled: true, tapeHiss: 0.045, vinylCrackle: 0.035 },
  drumKit: "lofi_tape_soft",
  drumGroovePreset: "lofi_sparse_clicks",
  bassTone: "rounded_triangle_bass",
  chordInstrument: "lofi_warm_pad",
  melodyInstrumentsA: ["tape_bell"],
  songSequence: ["A"],
  sectionBars: { A: 1 },
  progressionA: [0, 3, 4, 0],
  gridA: { kick: [1], snare: [0], hat: [1], bass: [1] }
});

console.log(lofiKit.manifest.audioProfile); // "lofi_chill"
console.log(lofiKit.manifest.lofi.drumKit); // "lofi_tape_soft"
console.log(lofiKit.manifest.soundRegistry.lofi.drumKits.lofi_tape_soft);
```

```js
const chipKit = await createGodotExportKit({
  projectVersion: 16,
  title: "Arcade Boss Loop",
  audioProfile: "chip_tune",
  chipPreset: "chip_neon_boss",
  chipTexture: { enabled: true, bitDepth: 0.32, sampleRateCrush: 0.22 },
  drumKit: "modern_chip_punch",
  drumGroovePreset: "chip_boss_half_time",
  bassTone: "bitcrush_bass",
  chordInstrument: "modern_chip_poly",
  melodyInstrumentsA: ["chip_pulse_lead"],
  songSequence: ["A"],
  sectionBars: { A: 1 },
  progressionA: [0, 5, 6, 4],
  gridA: { kick: [1], snare: [0], hat: [1], bass: [1] }
});

console.log(chipKit.manifest.audioProfile); // "chip_tune"
console.log(chipKit.manifest.chip.presetId); // "chip_neon_boss"
console.log(chipKit.manifest.soundRegistry.chip.drumKits.modern_chip_punch);
```

`manifest.events` also carries event-level `audioProfile`, `lofiPreset`, `chipPreset`, `drumKit`, `bassTone`, `instrument`, and enabled texture data where relevant. Godot can use those fields for preview routing, diagnostics, and adaptive state decisions while still treating rendered WAV assets as the parity-audio path.

## Profiles To Try

- `STEM_SYNC`: full-song stems plus `audio/full/full_mix.wav`.
- `LOOP_KIT`: section mixes and optional section stems.
- `HYBRID`: bed stems plus short sample/stinger placeholders.
- `PROCEDURAL_PREVIEW`: manifest only, labelled preview-only.

## Godot Import Sketch

1. Write all `kit.files` entries into a Godot folder such as `res://music/song_name/`.
2. Write the manifest as `manifests/godot-adaptive-manifest.json` under that same pack root.
3. Import WAV assets in Godot.
4. Use `PCSGamePackManifest` or game code to read the manifest and create a `PCSPlaybackProfile`.
5. Route stems to Godot buses.
6. Use `sections.*.loopStart` and `sections.*.loopEnd` for loop boundaries.
7. Use `events` for section, beat, and gameplay timing metadata.

The existing Godot chart import should remain intact. This export kit is the parity-audio path, not a replacement for editor chart inspection.

## Manual Verification Needed

Automated tests prove the manifest and generated WAV blobs exist and align. A real Godot editor pass is still needed to verify imported WAV settings, loop flags, bus routing, and conductor transitions.
