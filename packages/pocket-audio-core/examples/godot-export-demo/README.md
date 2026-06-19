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
