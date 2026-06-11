# Pocket Audio Core App Integration Report

Date: 2026-06-11

Core version used: `0.1.0-scaffold`

Project schema support: `16`

## Files Changed

- `packages/pocket-audio-core/src/export/wav.js`
- `packages/pocket-audio-core/tests/core.test.js`
- `pocket_dj/pocket_dj_v1g_core_bridge.html`
- `pocket_dj/README.md`
- `web-app/pocket_chordsmith_v68_core_bridge.html`
- `web-app/index.html`
- `web-app/README.md`

## Pocket DJ Integration

New app build: `pocket_dj_v1g_core_bridge.html`

Pocket DJ now loads Pocket Audio Core from the repo-local source module when served locally and keeps the legacy DJ audio engine as the audible fallback. The deck meta grid displays:

- `Audio Core`
- `Schema`

Core-backed or core-mirrored areas:

- source project load into `PocketAudio`
- shared timeline diagnostics
- play/stop transport mirroring
- section queue mirroring
- stem mute and volume mirroring
- FX mirroring
- build/drop mirroring

Still using legacy Pocket DJ app code:

- audible Web Audio scheduler and synth voices
- visual transport scheduler
- DJ session wrapper and local save
- deck UI, pads, mixer, FX controls, handoff UI

## Pocket Chordsmith Integration

New app build: `pocket_chordsmith_v68_core_bridge.html`

`web-app/index.html` now redirects to v68.

Core-backed or core-mirrored areas:

- current project load into `PocketAudio`
- shared timeline diagnostics in Settings > Project & export
- transport start/stop mirroring
- WAV export tries Pocket Audio Core first when the local module is available

Still using legacy Pocket Chordsmith app code:

- audible live playback scheduler and synth voices
- preview sounds
- grid/editor state
- MIDI import/export
- JSON and `PCS1:` import/export
- melody/guitar/bass/drum editing
- Godot push
- legacy OfflineAudioContext WAV exporter as fallback when core is unavailable

## Fixes Made During Integration

- The first Chordsmith WAV smoke stayed on `Rendering WAV (34s audio)...` for the legacy OfflineAudioContext path in the in-app browser. v68 now attempts the Pocket Audio Core WAV renderer first and falls back to the legacy exporter only if the core cannot load.
- The Pocket Audio Core WAV encoder wrote the channel array into the WAV header instead of the numeric channel count. This is fixed and covered by a regression test.
- Pocket DJ mobile layout overflowed at 390px after adding the long Audio Core meta value. The v1g CSS now constrains the app/deck/panels/meta grid with `min-width:0`, `width:100%`, and `max-width:100%`.

## Tests Run

- `node` inline HTML script syntax check:
  - `pocket_dj/pocket_dj_v1g_core_bridge.html` passed.
  - `web-app/pocket_chordsmith_v68_core_bridge.html` passed.
- `npm test` in `packages/pocket-audio-core`: 38 tests passed.
- Pocket DJ browser smoke on `http://127.0.0.1:8767/pocket_dj/pocket_dj_v1g_core_bridge.html`:
  - Load Demo passed.
  - Play passed.
  - Queue section passed.
  - Bass mute passed.
  - Build/Drop passed.
  - Audio Core and Schema cards displayed.
  - Console errors: none.
- Pocket Chordsmith browser smoke on `http://127.0.0.1:8767/web-app/pocket_chordsmith_v68_core_bridge.html`:
  - Demo load passed.
  - Play/Stop passed.
  - JSON export/import round trip passed.
  - `PCS1:` share-code export/import round trip passed.
  - WAV export completed through Pocket Audio Core and produced a blob download link.
  - Core status reported `973 timeline events` for the demo.
  - Console errors: none.
- Mobile-width smoke at 390px:
  - Pocket DJ v1g: no horizontal overflow after CSS fix.
  - Pocket Chordsmith v68: no horizontal overflow.
  - Console errors: none.

## Known Limitations

- Public itch builds will need the core module bundled beside the single-file HTML apps before dynamic core loading works outside the repo/local-server layout.
- Pocket DJ audible playback still comes from the legacy DJ scheduler/synth until full sound parity is proven.
- Pocket Chordsmith audible live playback and preview sounds still come from the legacy Chordsmith scheduler/synth.
- Pocket Audio Core WAV rendering is a deterministic first-pass renderer. It is useful for shared export plumbing and smoke testing, but it is not yet signed off for full sound parity with the richer Chordsmith live engine.
- The legacy Chordsmith OfflineAudioContext exporter remains as fallback/reference, but it hung during the in-app browser smoke before the core fallback was added.
