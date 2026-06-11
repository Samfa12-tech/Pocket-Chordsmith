# Codex Prompt 06 — New Game Runtime Integration Kit

Design and implement a lightweight Pocket Audio Core integration kit for new games.

## Goal

Make it easy for future HTML, Three.js, Babylon.js, and mobile web/Capacitor games to use Pocket Chordsmith music without embedding the full Pocket Chordsmith UI.

This is for new games first. Do not migrate old games unless explicitly requested.

## Required deliverables

Create:

```text
packages/pocket-audio-core/examples/game-runtime-demo/
docs/NEW_GAME_AUDIO_RUNTIME_GUIDE.md
docs/ADAPTIVE_MUSIC_API.md
```

## Runtime API

Support common game calls:

```js
const music = new PocketAudio({ profile: "game" });
await music.loadProject(pcs1OrJson);
await music.resumeFromUserGesture();
music.play();
music.stop();

music.setMusicState("exploration");
music.queueMusicState("combat", { quantize: "bar" });
music.queueSection("victory", { quantize: "section" });
music.triggerStinger("danger");
music.setIntensity(0.7);
music.duck(true, { amount: 0.45, releaseMs: 500 });
music.lowpass(0.5);
music.setStemMute("melody", true);
music.setStemVolume("drums", 0.8);
```

## Music state mapping

Support a small state map format:

```json
{
  "exploration": { "sequence": ["A", "B"], "loop": true },
  "combat": { "sequence": ["C", "D"], "loop": true, "intensity": 0.8 },
  "victory": { "section": "E", "thenReturnTo": "exploration" },
  "danger": { "stinger": "crash", "thenReturnTo": "combat" }
}
```

## Engine profiles

Support or document profiles:

- `composer` - full responsive editor playback.
- `dj` - performance controls and build/drop.
- `game` - stable low-overhead runtime.
- `offline` - rendering/export.

For games, prioritise:

- low UI coupling
- stable scheduling under render load
- stem muting/ducking
- section transitions on beat/bar/section
- low memory overhead
- diagnostics for missed scheduler ticks

## Demo

The game runtime demo should show:

- a simple canvas or DOM game loop
- user gesture to start audio
- exploration/combat/victory buttons
- intensity slider
- mute melody/drums buttons
- beat/bar callback display
- no full Chordsmith editor UI

## Documentation

The guide should explain:

- how to include the IIFE build in a single-file game
- how to import the ESM build
- how to embed a `PCS1:` string
- how to load JSON
- how to queue sections cleanly
- how to handle mobile browser user-gesture audio unlock
- how to reduce CPU in heavy scenes
- when to use pre-rendered stems instead of live synthesis

## Do not

- Do not add Babylon/Three as required dependencies.
- Do not assume games use one engine.
- Do not build a visualiser unless it is tiny and optional.
- Do not migrate old games now.
