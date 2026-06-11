# Codex Prompt 02 — Create Pocket Audio Core Scaffold

Create the initial Pocket Audio Core package scaffold. Do not integrate it into Pocket Chordsmith or Pocket DJ yet.

## Goal

Create a clean, reusable, browser-first audio package that can later become the shared engine for Pocket Chordsmith, Pocket DJ, Pocket DAW and new games.

## Package location

Prefer:

```text
packages/pocket-audio-core/
```

If the repo is single-file-only and has no package tooling, create a clean folder anyway and provide a simple build/test script.

## Required files

Create:

```text
packages/pocket-audio-core/README.md
packages/pocket-audio-core/package.json
packages/pocket-audio-core/src/index.js or src/index.ts
packages/pocket-audio-core/src/constants.js
packages/pocket-audio-core/src/schema/parse-share-code.js
packages/pocket-audio-core/src/schema/normalise-project.js
packages/pocket-audio-core/src/schema/migrations.js
packages/pocket-audio-core/src/music/scales.js
packages/pocket-audio-core/src/music/chords.js
packages/pocket-audio-core/src/music/timeline.js
packages/pocket-audio-core/src/engine/audio-context.js
packages/pocket-audio-core/src/engine/buses.js
packages/pocket-audio-core/src/engine/scheduler.js
packages/pocket-audio-core/src/engine/live-engine.js
packages/pocket-audio-core/src/engine/offline-renderer.js
packages/pocket-audio-core/src/engine/voice-manager.js
packages/pocket-audio-core/src/synth/drums.js
packages/pocket-audio-core/src/synth/bass.js
packages/pocket-audio-core/src/synth/chords.js
packages/pocket-audio-core/src/synth/melody.js
packages/pocket-audio-core/src/synth/guitar.js
packages/pocket-audio-core/src/fx/filter.js
packages/pocket-audio-core/src/fx/delay.js
packages/pocket-audio-core/src/fx/reverb.js
packages/pocket-audio-core/src/fx/sidechain.js
packages/pocket-audio-core/src/adaptive/game-state-controller.js
packages/pocket-audio-core/src/export/wav.js
packages/pocket-audio-core/src/export/stems.js
packages/pocket-audio-core/tests/fixtures/README.md
packages/pocket-audio-core/examples/basic-html/index.html
```

If TypeScript is used, include a build that emits JavaScript. If plain JavaScript is used, include JSDoc types where helpful.

## Public API target

Expose something close to:

```js
import { PocketAudio, parsePocketChordsmithInput, normalisePocketChordsmithProject } from "pocket-audio-core";

const audio = new PocketAudio({ diagnostics: true });
await audio.loadProject(input);
await audio.resume();
audio.play();
audio.stop();
audio.queueSection("B", { quantize: "bar" });
audio.setStemVolume("drums", 0.8);
audio.setStemMute("melody", true);
audio.setFx({ filter: 0.8, echo: 0.1, reverb: 0.2 });
const wavBlob = await audio.renderWav({ scope: "sequence" });
```

## Minimum implementation for this scaffold

This step can include placeholders/stubs where extraction has not happened yet, but the shape must be real and documented.

Implement at least:

- constants for core version, `PCS1:`, section IDs and stem IDs
- base64url encode/decode helpers
- `parsePocketChordsmithInput(input)` that accepts raw JSON objects, JSON strings and `PCS1:` strings
- `normalisePocketChordsmithProject(raw)` with a minimal defensive normalised model
- simple `PocketAudio` class with load/play/stop stubs that do not crash
- event emitter or simple subscribe/unsubscribe mechanism
- docs explaining what is stubbed and what will be extracted later

## Build outputs

Add a simple way to produce:

```text
dist/pocket-audio-core.esm.js
dist/pocket-audio-core.iife.js
```

If the build is not implemented yet, document the planned command and create a basic `dist/README.md`.

## Tests

Add minimal tests for:

- base64url round trip
- `PCS1:` parse round trip
- raw JSON parse
- normalise minimal project
- API class construction/load/stop without errors

Report commands run.

## Rules

- Do not modify Pocket Chordsmith or Pocket DJ in this step.
- Do not claim feature parity yet.
- Keep package lightweight.
- Avoid heavy dependencies.
