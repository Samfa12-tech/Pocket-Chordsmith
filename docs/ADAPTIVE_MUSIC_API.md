# Adaptive Music API

Pocket Audio Core exposes a compact adaptive runtime API through `PocketAudio`.

## Profiles

- `composer`: full responsive editor playback. Used by Pocket Chordsmith-style authoring tools.
- `dj`: performance controls, stem mixing, build/drop, and section launch behavior.
- `game`: stable low-overhead runtime for browser and mobile games.
- `offline`: rendering and export workflows.

Pass the profile at construction time:

```js
const music = new PocketAudio({ profile: "game" });
```

The current profile is available in `music.profile` and `music.getDiagnostics().profile`.

## Construction

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

You can also add or replace state maps later:

```js
music.defineMusicStates(stateMap);
```

## Project Loading

```js
await music.loadProject(pcs1OrJson);
await music.resumeFromUserGesture();
music.play();
```

`loadProject` accepts:

- `PCS1:` share code
- raw Pocket Chordsmith JSON object
- raw JSON string
- already-normalised `PocketAudioProject`

## Transport

```js
music.play();
music.stop();
music.pause();
music.restart();
music.queueSection("B", { quantize: "bar" });
music.setSequence(["A", "B", "C"]);
music.setLoop({ enabled: true, sectionId: "A" });
```

`queueSection` also accepts a music-state name when the state map defines it:

```js
music.queueSection("victory", { quantize: "section" });
```

## Music States

```js
music.setMusicState("exploration");
music.queueMusicState("combat", { quantize: "bar" });
music.triggerStinger("danger");
```

State map fields:

- `sequence`: array of Pocket Chordsmith section IDs.
- `section`: single section ID.
- `loop`: boolean.
- `intensity`: `0..1`.
- `fx`: patch object passed to `setFx`.
- `lowpass`: `0..1`.
- `duck`: boolean or options object.
- `stems`: stem patch map, for example `{ melody: { mute: true } }`.
- `stinger`: stinger name.
- `thenReturnTo`: state name for follow-up behavior.

The v0 runtime stores transition intent and emits events. Future scheduler passes can make quantized state changes stricter without changing these API calls.

## Runtime Controls

```js
music.setIntensity(0.7);
music.duck(true, { amount: 0.45, releaseMs: 500 });
music.lowpass(0.5);
music.setStemMute("melody", true);
music.setStemVolume("drums", 0.8);
music.setFx({ reverb: 0.2, echo: 0.1 });
```

Stem IDs:

- `drums`
- `bass`
- `chords`
- `melody`
- `guitar`

## Events

```js
const offBeat = music.on("beat", event => {});
const offBar = music.on("bar", event => {});
const offState = music.on("musicState", event => {});
const offQueued = music.on("musicStateQueued", event => {});
const offStinger = music.on("stinger", event => {});
const offDuck = music.on("duck", event => {});
const offLowpass = music.on("lowpass", event => {});
```

Call the returned function to unsubscribe:

```js
offBeat();
```

## Diagnostics

```js
const diagnostics = music.getDiagnostics();
```

Diagnostics include:

- `profile`
- `projectLoaded`
- `timelineEventCount`
- `currentSection`
- `currentMusicState`
- `queuedMusicState`
- `intensity`
- `ducking`
- `scheduledEventCount`
- `schedulerTickCount`
- `missedSchedulerTickCount`

Use missed scheduler ticks to detect heavy render scenes that are starving music scheduling.

## Offline Rendering

```js
const wav = await music.renderWav({ sampleRate: 44100 });
const stems = await music.renderStems({ stems: ["drums", "bass"] });
```

Offline rendering currently uses the v0 deterministic renderer. It is useful for plumbing, tests, and previews, but it is not final sound-parity rendering.
