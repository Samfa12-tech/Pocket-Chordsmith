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
- Integration status: first-pass bridges exist for Pocket Chordsmith v68 and Pocket DJ v1g; Pocket DJ, Pocket DAW and Godot consume shared lofi metadata through their compatibility/import paths, but the shared family bridge is not full playback parity
- Render status: basic PCM/WAV and stem output using simplified procedural events, not exact Chordsmith/DJ/DAW/Godot sound parity
- Live playback status: browser event scheduler with simple Web Audio tones, not parity synths
- Game runtime status: `profile:"game"` supports music states, stingers, intensity, ducking, lowpass, stem controls, and diagnostics

## Lofi Chill Pack

The shared lofi/chillhop preset spec lives in `src/presets/lofi.js` and is exported from the package root. It defines the `lofi_chill` audio profile, eight preset IDs, soft instrument/tone IDs, lofi drum kit and groove IDs, texture defaults, and game intensity hints.

The shared procedural voice registries live in `src/sounds/lofi-registry.js` and `src/sounds/instruments.js`. They include the classic Chordsmith bass voice, lofi drum kits, bass tones, the full Chordsmith chord/melody instrument IDs, and the matching WebAudio voice curves. Add new sound IDs there first, then update app renderers against that registry. `validatePocketSoundRegistry()`, `validateLofiSoundRegistry()`, and `validatePocketInstrumentRegistry()` are covered by core and surface-drift tests so missing voice definitions are caught early.

When changing shared sound IDs, voice curves, or Pocket Pro EQ bands, run `npm run generate:sound-surfaces` from this package. It refreshes the generated Godot sample-preview constants and Pocket DAW native Rust sound recipes from the same core registries. CI/local release checks can use `npm run verify:sound-surfaces` to catch stale generated files before DAW, Chordsmith, DJ, and Godot drift apart.

For a fuller parity gate after changing sound features, run `npm run verify:family-parity` from this package. It checks generated sound surfaces, cross-app surface drift, Chordsmith browser trace parity, core render/Godot-pack fixtures, Pocket DAW Chordsmith import/render/export parity tests, and DAW-vs-Chordsmith browser event parity in one pass.

Use `../../docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md` before describing a change as sound parity. Core has deterministic event/render fixtures and first-pass exports, but exact app-to-app tone parity still needs the matrix's component gates and listening evidence.

Use `../../docs/POCKET_AUDIO_CORE_LIVE_ENGINE_EXTRACTION_GATE.md` before moving Pocket Chordsmith audible live playback or preview sounds behind Core. That gate keeps the current v68 bridge in diagnostic/export mode until event, sound, mobile, listening and rollback evidence all exist.

The shared guitar surface lives in `src/sounds/guitar.js`. It defines Chordsmith-compatible guitar tones, tone curves, registers, strum modes, pattern presets, fill styles, and the DAW step-edit cycle. Pocket DAW imports these definitions for Chordsmith import sanitizing, editor UI options, and WebAudio guitar rendering so `metal` and `western_twang` stay available wherever Chordsmith projects are edited or played.

Pocket DJ keeps local fallback constants for standalone use, but packaged/manual imports and handoffs now let Pocket Audio Core load before lofi project normalisation and read shared lofi preset, chord, melody, drum-kit, and bass-tone IDs from the package root when available.

The shared drum groove preset table lives in `src/patterns/drum-presets.js`. Pocket DAW imports that module for its Chordsmith beat-preset picker, and the core surface-drift tests compare it against the current Pocket Chordsmith HTML constants so future groove additions do not quietly split across apps.

The shared Chordsmith mix defaults live in `src/constants.js`, and Chordsmith WAV export staging lives in `src/performance/stem-mix.js`. Keep user-facing stem defaults and offline export headroom separate: DAW, DJ, Godot and Core should consume the shared helpers instead of copying stem gain ratios into app code.

`npm run compare:chordsmith-browser-trace` opens the current Chordsmith v68 browser app in Playwright, imports each committed fixture through `window.PocketChordsmithParityTrace.fromProject()`, and checks that Pocket Audio Core reproduces the Chordsmith-normalized event trace. The command also prints raw fixture drift, which is expected while legacy/raw Chordsmith JSON and app import rescaling still differ.

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
console.log(music.project.meta.audioProfile, music.project.meta.stylePreset);
music.play();
music.queueMusicState("combat", { quantize: "bar" });
music.triggerStinger("danger");
music.setIntensity(0.7);
music.duck(true, { amount: 0.45, releaseMs: 500 });
music.lowpass(0.5);
```

See `examples/game-runtime-demo/`, `../../docs/NEW_GAME_AUDIO_RUNTIME_GUIDE.md`, and `../../docs/ADAPTIVE_MUSIC_API.md`.

Minimal PCS data example: `../../docs/examples/minimal-pcs-project.md`.

## Godot Export Kits

```js
import { createGodotExportKit, GODOT_EXPORT_PROFILES } from "./dist/pocket-audio-core.esm.js";

const kit = await createGodotExportKit(pcs1OrJson, {
  profile: GODOT_EXPORT_PROFILES.LOOP_KIT,
  sampleRate: 48000
});
```

The first-pass kit returns a manifest plus WAV blobs for `STEM_SYNC` and `LOOP_KIT` workflows. `HYBRID` renders stem beds and placeholder sample/stinger assets for future kit work. `PROCEDURAL_PREVIEW` writes manifest metadata only, marks itself `previewOnly`, and is not a parity export. Lofi manifests preserve `audioProfile`, preset, texture, drum-kit, bass-tone, and instrument IDs, and include the shared lofi sound registry for game-pack tooling and preview runtimes.
Chip manifests preserve the matching `chip_tune` profile fields, chip preset, texture, drum-kit, groove, bass-tone, chord, and melody IDs, plus the shared chip sound registry.

This is a compatibility/export scaffold, not proof that Core renders the same sound as Chordsmith live playback, Pocket DAW native/cache output, or the Godot addon preview kit. Use it for deterministic metadata and fixture coverage; use DAW-rendered adaptive packs or app-specific smokes when production-grade audio parity matters. See `../../docs/GODOT_PARITY_EXPORT_WORKFLOW.md` and `examples/godot-export-demo/README.md`.

## Commands

```powershell
npm test
npm run compare:chordsmith-browser-trace
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
- Future/full Godot kit polish: high-fidelity sample kit assets, native procedural parity, editor import smoke, and production routing/conductor docs

These are represented by modules and public API seams so the later extraction prompts can fill them in without changing the high-level package shape.

See `../../docs/POCKET_AUDIO_CORE_MIDI_EXPORT_CHECKPOINT.md` before moving DAW or Chordsmith MIDI export behind Core; the exporter should wait for shared event-renderer parity gates rather than duplicating app-specific behavior early.
