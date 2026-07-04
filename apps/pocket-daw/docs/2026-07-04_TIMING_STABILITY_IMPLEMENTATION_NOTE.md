# Pocket DAW Timing Stability Implementation Note

Date: 2026-07-04

Scope: native Windows Pocket DAW timing, playback/export parity, and recording alignment only.

Intended code files for this pass:

- `apps/pocket-daw/src/daw/timeline.ts`
  Add explicit sample/second/beat/bar conversion helpers and tighten loop/time conversions around the transport clock.
- `apps/pocket-daw/src/audio/audioEngine.ts`
  Make native playback position derive from an audio-clock-oriented transport model, reduce UI-side timing drift, and keep loop/playhead updates transport-led.
- `apps/pocket-daw/src/audio/eventRenderer.ts`
  Keep live/export event interpretation on one timing path and add tests around edge timing behavior.
- `apps/pocket-daw/src/audio/nativeOfflineRender.ts`
  Keep native export duration and event interpretation aligned with the same timeline model used for live playback.
- `apps/pocket-daw/src\daw\audioClips.ts`
  Place recorded clips from sample-domain placement metadata when available, with manual-offset fallback kept explicit.
- `apps/pocket-daw/src/app/recordingOrchestration.ts`
  Add pure helpers for recording sample-placement metadata and timing diagnostics.
- `apps/pocket-daw/src/app/App.ts`
  Wire the recording stop path to persist sample-based placement metadata without moving timing ownership into the UI.

Intended test/docs files for this pass:

- `apps/pocket-daw/src/daw/timeline.test.ts`
- `apps/pocket-daw/src/app/recordingOrchestration.test.ts`
- `apps/pocket-daw/src/audio/eventRenderer.test.ts`
- `apps/pocket-daw/docs/RECORDING_SESSION_CLOCK.md`
- `apps/pocket-daw/docs/NATIVE_RENDER_CACHE_POLICY.md`
- `apps/pocket-daw/docs/TIMING_MODEL.md`

Out of scope for this pass unless a small compatibility change is required:

- `apps/chordsmith-web/`
- `apps/pocket-dj/`
- `addons/pocket_chordsmith/`
- broad product/UI redesign unrelated to timing correctness
