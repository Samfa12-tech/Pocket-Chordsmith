# New Game Audio Runtime Guide

Pocket Audio Core lets new HTML, canvas, Three.js, Babylon.js, and Capacitor games play Pocket Chordsmith music without embedding the Pocket Chordsmith editor UI.

Use this for new games first. Do not migrate older games until their music behavior is reviewed separately.

## Include The IIFE Build

For a single-file or no-build game, copy `packages/pocket-audio-core/dist/pocket-audio-core.iife.js` beside the game and load it before your game script:

```html
<script src="./pocket-audio-core.iife.js"></script>
<script>
const music = new PocketAudioCore.PocketAudio({ profile: "game" });
</script>
```

The IIFE build exposes `globalThis.PocketAudioCore`. It is intentionally lightweight and suitable for simple games, prototypes, and itch-style uploads.

## Import The ESM Build

For a module-based game:

```js
import { PocketAudio } from "./pocket-audio-core.esm.js";

const music = new PocketAudio({ profile: "game" });
```

During local repo development you can also import from `packages/pocket-audio-core/src/index.js`.

## Load A PCS1 String

Export or copy a share code from Pocket Chordsmith, then embed it as a string:

```js
const pcs1 = "PCS1:...";

await music.loadProject(pcs1);
```

For bigger projects, keep the string in a separate `.js` or `.json` file so the game source stays readable.

## Load JSON

Pocket Audio Core also accepts raw Pocket Chordsmith JSON objects and JSON strings:

```js
await music.loadProject(projectJsonObject);
await music.loadProject(JSON.stringify(projectJsonObject));
```

## Mobile Audio Unlock

Mobile browsers require audio to start from a user gesture. Use the first tap on your title screen, pause menu, or `Start` button:

```js
startButton.addEventListener("click", async () => {
  await music.resumeFromUserGesture();
  await music.play();
});
```

Do not try to auto-play music on page load. It will be blocked on many phones.

## Music States

Define a map that uses Pocket Chordsmith sections as game music states:

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
```

Queue state changes on a clean musical boundary:

```js
music.setMusicState("exploration");
music.queueMusicState("combat", { quantize: "bar" });
music.queueSection("victory", { quantize: "section" });
music.triggerStinger("danger");
```

In the current v0 runtime, `quantize` is preserved in events and diagnostics. Later scheduler passes can make the transition timing stricter without changing the call sites.

## Runtime Controls

Common game calls:

```js
music.setIntensity(0.7);
music.duck(true, { amount: 0.45, releaseMs: 500 });
music.lowpass(0.5);
music.setStemMute("melody", true);
music.setStemVolume("drums", 0.8);
```

Use stem controls for pause menus, underwater/filter moments, combat intensity, and dialogue ducking.

## Beat And Bar Callbacks

Listen to callbacks instead of polling when possible:

```js
music.on("beat", event => {
  hud.flashBeat(event.beat);
});

music.on("bar", event => {
  spawnOnBar(event.bar);
});
```

Use `music.getDiagnostics()` in development builds to inspect timeline event counts, current music state, current section, intensity, ducking, and scheduler missed ticks.

## CPU Guidance

- Prefer `profile: "game"` for low UI coupling and stable runtime behavior.
- Keep music state maps small and section-based.
- Avoid rebuilding music projects every frame. Load once, then call runtime controls.
- Use stem mute/volume and intensity before generating new arrangements.
- In heavy 3D scenes, avoid unnecessary visualizers and use beat/bar callbacks only for gameplay-relevant events.
- Check `missedSchedulerTickCount` in development builds while stress-testing render load.

## When To Use Pre-rendered Stems

Use pre-rendered stems instead of live synthesis when:

- the game has heavy CPU/GPU scenes,
- exact final mix quality matters more than live music manipulation,
- the target is older mobile hardware,
- you need deterministic audio across browsers,
- you need many simultaneous SFX voices.

Use live Pocket Audio Core when:

- the game needs section transitions,
- stems must mute/duck/react at runtime,
- the same song should adapt to game state,
- fast iteration from Pocket Chordsmith is more important than final mastering.

## Demo

Open:

```text
packages/pocket-audio-core/examples/game-runtime-demo/index.html
```

Serve the repo root locally for module imports:

```powershell
cd "C:\Users\sam_s\Documents\Pocket Chordsmith"
python -m http.server 8767 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8767/packages/pocket-audio-core/examples/game-runtime-demo/
```
