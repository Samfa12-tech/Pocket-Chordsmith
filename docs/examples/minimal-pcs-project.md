# Minimal PCS Project

This is a tiny Pocket Chordsmith-compatible JSON shape for docs and quick
experiments. It mirrors the minimal project used in Pocket Audio Core tests.

```json
{
  "projectVersion": 16,
  "title": "Minimal PCS Example",
  "key": "D",
  "scale": "minor",
  "bpm": 104,
  "timeSig": 4,
  "resolution": 4,
  "songSequence": ["A"],
  "sectionBars": {
    "A": 1
  },
  "progressionA": [0, 4, 5, 3],
  "gridA": {
    "kick": [1, 0, 0, 0],
    "snare": [0, 0, 1, 0],
    "hat": [1, 1, 1, 1],
    "bass": [1, 0, 0, 0]
  }
}
```

Use it with Pocket Audio Core:

```js
import {
  PocketAudio,
  normalisePocketChordsmithProject,
  parsePocketChordsmithInput
} from "../packages/pocket-audio-core/src/index.js";

const project = normalisePocketChordsmithProject(parsePocketChordsmithInput(jsonText));
const audio = new PocketAudio({ diagnostics: true });

await audio.loadProject(project);
audio.play();
```

For more complete fixtures, see:

- `packages/pocket-audio-core/tests/fixtures/`
- `packages/pocket-audio-core/examples/`
- `packages/pocket-audio-core/examples/godot-export-demo/README.md`
