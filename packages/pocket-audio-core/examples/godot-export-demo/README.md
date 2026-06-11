# Godot Export Demo

This folder documents the Godot-facing Pocket Audio Core export flow.

The implementation lives in:

```text
packages/pocket-audio-core/src/export/godot-kit.js
```

## Quick Use

```js
import { createGodotExportKit, GODOT_EXPORT_PROFILES } from "../../src/index.js";

const kit = await createGodotExportKit(pcs1OrJson, {
  profile: GODOT_EXPORT_PROFILES.LOOP_KIT,
  sampleRate: 48000
});

const manifest = kit.manifest;
const files = kit.files;
```

`files` is a `Map` of filename to WAV `Blob`.

## Profiles To Try

- `STEM_SYNC`: full-song stems plus `full_mix.wav`.
- `LOOP_KIT`: section mixes and optional section stems.
- `HYBRID`: bed stems plus short sample/stinger placeholders.
- `PROCEDURAL_PREVIEW`: manifest only, labelled preview-only.

## Godot Import Sketch

1. Write all `kit.files` entries into a Godot folder such as `res://music/song_name/`.
2. Write `manifest.json` beside them.
3. Import WAV assets in Godot.
4. Read the manifest from the addon or game conductor.
5. Route stems to Godot buses.
6. Use `sections.*.loopStart` and `sections.*.loopEnd` for loop boundaries.
7. Use `events` for section, beat, and gameplay timing metadata.

The existing Godot chart import should remain intact. This export kit is the parity-audio path, not a replacement for editor chart inspection.

## Manual Verification Needed

Automated tests prove the manifest and generated WAV blobs exist and align. A real Godot editor pass is still needed to verify imported WAV settings, loop flags, bus routing, and conductor transitions.
