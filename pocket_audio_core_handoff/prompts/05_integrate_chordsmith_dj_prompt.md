# Codex Prompt 05 — Integrate Pocket Audio Core Into Pocket DJ and Pocket Chordsmith

Only run this after Pocket Audio Core has a working scaffold, event timeline tests, and at least basic live/offline playback.

## Goal

Update Pocket DJ and Pocket Chordsmith to use the same Pocket Audio Core version for shared playback/rendering behaviour while preserving their existing UI roles.

Pocket Chordsmith remains the studio/composer.
Pocket DJ remains the stage/performance deck.

## Integration order

1. Integrate Pocket DJ first.
2. Run parity tests.
3. Integrate Pocket Chordsmith playback path.
4. Run parity tests again.
5. Integrate/offload WAV export only after live playback is stable.
6. Keep legacy app functions available temporarily as fallback/reference until parity is proven.

## Pocket DJ requirements

Pocket DJ should stop maintaining copied versions of:

- project normaliser
- chord/scale logic
- instrument synth functions
- stem buses
- scheduler
- build/drop musical behaviour where core owns it
- WAV/stem render when added

Pocket DJ should keep its own UI:

- import screen
- section pads
- stem controls
- loop/queue controls
- build/drop buttons
- performance session wrapper `PDJ1:` if present
- local save UI

Pocket DJ should call core APIs such as:

```js
audio.loadProject(pcsProjectOrShareCode)
audio.play()
audio.stop()
audio.queueSection(sectionId, { quantize })
audio.setStemVolume(stem, value)
audio.setStemMute(stem, muted)
audio.setFx(fx)
audio.triggerBuild(options)
audio.triggerDrop(options)
```

## Pocket Chordsmith requirements

Pocket Chordsmith should keep its UI/editor state and controls, but shared audio behaviour should move to the core:

- live playback
- preview sounds
- section/song playback timeline
- instrument rendering
- FX rendering
- WAV export/rendering where safe
- project normalisation where safe

Do not break:

- Simple/Advanced mode separation
- MIDI import/export
- JSON and `PCS1:` import/export
- melody tracks
- holds/slides/tuplets
- guitar controls
- drum pad live recording
- undo/autosave
- handoff buttons
- Godot push

If a feature cannot yet move safely, leave it in Chordsmith temporarily and document it as a remaining legacy path.

## Core version display

Add a small developer/about entry to both apps showing:

```text
Pocket Audio Core: x.y.z
Project schema support: 16-...
```

## Version/update notes

Update release notes for both apps:

```text
- Updated to Pocket Audio Core x.y.z.
- Playback and rendering now use the shared core engine.
- Project schema remains unchanged unless explicitly changed.
- Known limitations: ...
```

## Testing

Run:

- core tests
- Pocket DJ import/play/queue/mute/build/drop smoke
- Pocket Chordsmith demo play smoke
- JSON export/import round trip
- `PCS1:` share-code round trip
- WAV export smoke
- mobile-width layout smoke
- browser console error check

Create:

```text
docs/POCKET_AUDIO_CORE_APP_INTEGRATION_REPORT.md
```

Include:

- core version used
- files changed
- features using core
- features still using legacy app code
- tests run
- known limitations

## Do not

- Do not redesign the UI.
- Do not migrate old games.
- Do not remove legacy paths until parity is verified.
- Do not change project schema unless absolutely necessary and documented.
