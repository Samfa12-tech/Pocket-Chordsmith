# Pocket Audio Core

Pocket Audio Core is the shared, headless Web Audio runtime planned for the Pocket Chordsmith family. It is intended to become the common parser, normaliser, event renderer, scheduler, instrument layer, stem mixer, FX layer, offline renderer, and adaptive game-music API used by Pocket Chordsmith, Pocket DJ, Pocket DAW, new browser games, and Godot export workflows.

This package is currently a v0 extraction. It provides a real public API shape, defensive `PCS1:`/JSON parsing, a minimal normalised project model, deterministic timeline events, lightweight transport methods, event subscriptions, and a basic dependency-free WAV/stem render path. It does not claim exact timing, sound, instrument, FX, MIDI, or Godot parity yet.

License/status: WIP private package source, `UNLICENSED`, and `private: true`.
See the repository root `LICENSES.md` before reusing or redistributing package
code.

## Current Status

- Core version: `0.1.0-scaffold`
- Supported source prefix: `PCS1:`
- Initial source schema target: Pocket Chordsmith schema `16`
- Integration status: first-pass bridges exist for Pocket Chordsmith v68 and Pocket DJ v1g; Pocket DAW and Godot consume shared lofi metadata through their compatibility/import paths
- Render status: basic PCM/WAV and stem output using simplified procedural events
- Live playback status: browser event scheduler with simple Web Audio tones, not parity synths
- Game runtime status: `profile:"game"` supports music states, stingers, intensity, ducking, lowpass, stem controls, and diagnostics

## Lofi Chill Pack

The shared lofi/chillhop preset spec lives in `src/presets/lofi.js` and is exported from the package root. It defines the `lofi_chill` audio profile, eight preset IDs, soft instrument/tone IDs, lofi drum kit and groove IDs, texture defaults, and game intensity hints.

`normalisePocketChordsmithProject()` preserves optional lofi metadata without bumping schema `16`: `audioProfile`, `lofiPreset`, `stylePreset`, `lofiTexture`, `drumKit`, `drumGroovePreset`, and `bassTone`. Missing fields still normalise to the standard clean profile.

The lofi sounds are procedural approximations. No external sample packs are bundled or required.

## Usage

```js
import {
  PocketAudio,
  parsePocketChordsmithInput,
  normalisePocketChordsmithProject
} from "./dist/pocket-audio-core.esm.js";

const project = normalisePocketChordsmithProject(parsePocketChordsmithInput(pcs1OrJson));
const audio = new PocketAudio({ diagnostics: true });

await audio.loadProject(project);
await audio.resume();
audio.play();
audio.queueSection("B", { quantize: "bar" });
audio.setStemVolume("drums", 0.8);
audio.setStemMute("melody", true);
audio.setFx({ filter: 0.8, echo: 0.1, reverb: 0.2 });
audio.stop();
```

## Game Runtime

```js
const music = new PocketAudio({
  profile: "game",
  musicStates: {
    exploration: { sequence: ["A", "B"], loop: true },
    combat: { sequence: ["C", "D"], loop: true, intensity: 0.8 },
    victory: { section: "E", thenReturnTo: "exploration" },
    danger: { stinger: "crash", thenReturnTo: "combat" }
  }
});

await music.loadProject(pcs1OrJson);
await music.resumeFromUserGesture();
music.play();
music.queueMusicState("combat", { quantize: "bar" });
music.triggerStinger("danger");
music.setIntensity(0.7);
music.duck(true, { amount: 0.45, releaseMs: 500 });
music.lowpass(0.5);
```

See `examples/game-runtime-demo/`, `docs/NEW_GAME_AUDIO_RUNTIME_GUIDE.md`, and `docs/ADAPTIVE_MUSIC_API.md`.

Minimal PCS data example: `../../docs/examples/minimal-pcs-project.md`.

## Godot Export Kits

```js
import { createGodotExportKit, GODOT_EXPORT_PROFILES } from "./dist/pocket-audio-core.esm.js";

const kit = await createGodotExportKit(pcs1OrJson, {
  profile: GODOT_EXPORT_PROFILES.LOOP_KIT,
  sampleRate: 48000
});
```

The kit returns a manifest plus WAV blobs for `STEM_SYNC`, `LOOP_KIT`, `HYBRID`, or `PROCEDURAL_PREVIEW` workflows. See `docs/GODOT_PARITY_EXPORT_WORKFLOW.md` and `examples/godot-export-demo/README.md`.

## Commands

```powershell
npm test
npm run build
```

The build script writes:

```text
dist/pocket-audio-core.esm.js
dist/pocket-audio-core.iife.js
```

The current build is intentionally simple and dependency-free. A later extraction phase can replace it with a production bundler once the module graph is larger.

## Stubbed Areas

- Full Chordsmith procedural drums, bass, chords, melody, and guitar
- Chordsmith FX parity
- High-fidelity offline full-mix rendering
- High-fidelity stem rendering
- MIDI export
- Godot stem/manifest export

These are represented by modules and public API seams so the later extraction prompts can fill them in without changing the high-level package shape.
