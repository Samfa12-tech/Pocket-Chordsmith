# Native Audio Convergence

Pocket DAW should move toward one authoritative installed-app audio path instead of maintaining separate WebAudio cached rendering and Rust procedural playback that only approximate each other.

## Direction

- Keep `renderTimelineEvents()` / `RenderedEvent` as the compatibility boundary. Chordsmith imports, MIDI clips, holds, slides, tuplets, guitar direction, and future project translations should become normalized event data there.
- Keep `packages/pocket-audio-core/src/sounds/*` as the shared sound recipe source. Native recipe tables should be generated from those files, not hand-maintained in Rust.
- Make native CPAL/Rust the installed-app synth and DSP target. WebAudio can remain useful for browser-family apps, but Pocket DAW cached playback and live fallback should not keep separate instrument semantics.
- Long term, render-cache stems should be produced by the same native event renderer used for live native playback, so cached and procedural playback differ only by pre-rendered buffer timing/storage, not by instrument implementation.

## Current Progress

- Native payloads preserve bass and melody `slideMidi` / `slideOffset`.
- Native payloads preserve guitar `direction`.
- Native bass and melody renderers use continuous pitch ramps from the shared event data.
- Native generated bass now applies Chordsmith-style harmonic low-pass filtering for saw/square/triangle waves in Rust, so cached/native bass tone is not left with harsh unfiltered upper harmonics.
- Native accented bass now preserves the Chordsmith-style release tail instead of ending at the shorter base note duration.
- Native guitar rendering respects up-strum note order.
- Native square-wave recipes now render square waves instead of falling back to sawtooth.
- Generated native lead extra recipes preserve `slideFreqMul` and `peakScale` from Pocket Audio Core.

## Remaining Work

- Move native render-cache generation off WebAudio `OfflineAudioContext` and onto the Rust/native renderer.
- Add broader cached-vs-native parity fixtures that compare deterministic rendered buffers or feature metrics across melody, chords, guitar, drums, FX, sidechain and more bass tone variants.
- Finish recipe parity for any fields still approximated in native, especially richer FX tails and modulation behavior.
- Remove or quarantine WebAudio-only synthesis paths from installed Pocket DAW once native cache rendering is proven.
- Keep browser Chordsmith/Pocket DJ compatibility through the project/event translation layer rather than by making every app share the same runtime backend.
