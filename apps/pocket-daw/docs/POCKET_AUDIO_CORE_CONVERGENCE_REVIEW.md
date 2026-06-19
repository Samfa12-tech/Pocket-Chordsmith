# Pocket Audio Core Convergence Review

Date: 2026-06-11

## Search result

No Pocket Audio Core implementation was available in this checkout during the v0.5.1 hardening pass.

Checked:

- Local and remote branches: only `main` / `origin/main` were present.
- Remote heads matching `audio`, `core`, `PAC` or `pocket`: no matches.
- Repository files matching `pocket-audio-core`, `PocketAudioCore`, `audio-core`, `audioCore`, `core-audio` or `PAC`: no implementation files found.

## Current local audio shape

Pocket DAW currently has its own working audio surface:

- `src/audio/eventRenderer.ts` creates `RenderedEvent` objects from generated Chordsmith clips and MIDI clips.
- `src/audio/audioEngine.ts` schedules those events for live playback.
- `src/audio/offlineRender.ts` renders full-song WAV output.
- `src/audio/audioBufferCache.ts` stores runtime-only decoded audio buffers for imported audio clips.
- `src/daw/exportJobs.ts` plans stems and section loops, and assembles Godot/web game-pack ZIPs with rendered audio, manifests and source project JSON.

## Adopted in v0.5.1

Added `src/audio/pocketAudioCoreAdapter.ts` as a small convergence adapter. It normalizes `RenderedEvent` into a stable event contract with:

- `startSeconds` and `durationSeconds`
- clamped MIDI notes
- clamped velocity and pan
- stable role/kind/track IDs
- instrument/articulation defaults

This is intentionally non-invasive. It does not change the current playback engine, event renderer or offline renderer.

## v0.6 fixture guardrail

`tests/pcsParityFixtures.ts` and `tests/parityFixtures.test.ts` now cover realistic Chordsmith source cases through DAW import, render events and the adapter shape. These fixtures are the first comparison target when the real Pocket Audio Core package/API arrives.

## Deferred

Do not replace the audio engine or event renderer until the actual Pocket Audio Core code/API is available. The next safe step is to import or link the real core package/branch, compare its event model to `PocketAudioCoreEvent`, then migrate one narrow path at a time with playback/export tests.

## Recommendation

Keep the adapter as the bridge layer for now. When Pocket Audio Core arrives, make the adapter either:

- the translation layer from Pocket DAW timelines into the shared core, or
- the compatibility shim that lets current Pocket DAW tests compare old and new render events side by side.
