# Pocket DAW v0.6 Foundation Notes

This note tracks the v0.6-readiness work that follows the v0.5.1 hardening pass.

## Media Persistence

- Media Pool status now distinguishes project media, runtime-loaded audio, external unloaded media, browser runtime-only imports, missing media and unresolved media.
- Imported native audio records the original URI and media reference kind.
- Browser imports remain runtime-only because the browser does not expose a durable source path after import.
- `createCollectMediaPlan()` produces a deterministic JSON plan with copy, already-project and blocked buckets.
- Native Collect Media can copy external audio beside a saved `.pocketdaw` project under `project-media/`, then update media-pool refs to project media.
- Native Reload/Relink can refresh audio buffers for project/external media in the installed app.
- Browser runtime-only media still cannot be collected because browsers do not expose a durable source path after import.

## MIDI Import Boundary

- Current MIDI import creates editable MIDI media/clips and preserves parsed track, channel, PPQ, tempo/time-signature and note metadata.
- Full multitrack/channel/controller/tempo-map import and automatic Chordsmith arrangement conversion remain future work.
- `MIDI_IMPORT_AND_CHORDSMITH_CONVERSION_PLAN.md` keeps ordinary import and future Chordsmith conversion as separate commands.

## Drum Branching Boundary

- Current generated Drums stay compact by default, with per-lane mix/FX metadata on the parent Drums track.
- `DRUM_BRANCHING_PLAN.md` defines a future source-preserving branch workflow for Kick, Snare, Hat and future kit-piece child tracks.
- Branch views should edit the same Chordsmith source data instead of duplicating unsynced drum grids.

## Native Playback Cache

- Native playback payloads support optional cached WAV assets and timeline regions alongside procedural events.
- Generated Chordsmith section clips can prewarm runtime stem WAV assets while the installed app is idle, then prefer those regions during native playback.
- Runtime-loaded audio clips can be encoded as native WAV regions when decoded buffers are available.
- Diagnostics report asset/region counts, hit/miss counts, procedural fallback events, runtime-audio misses, prewarm state and stale-build discards.
- Persistent on-disk cache storage, native decode/streaming and worker/Rust cache builds remain follow-up work.

## Export Packs

- Full mix and stem WAV export remain the real audio export paths.
- Game manifests now use deterministic pack folders: `audio/full/`, `audio/stems/`, `audio/sections/`, `manifests/` and `source/`.
- Manifest warnings call out runtime-only media, missing/unresolved media and muted tracks.
- Section-loop audio rendering and ZIP/native pack assembly are still planned-render follow-up work.

## Chordsmith To DAW Handoff

- Pocket DAW consumes `PocketHandoff` envelopes from URL query/hash, raw hash, `window.name`, same-origin localStorage and legacy import parameters.
- Pocket Chordsmith now exposes `Send to Pocket DAW` beside `Send to DJ`.
- The sender preserves the original PCS1 source code and uses `kind: "chordsmith-to-daw"`.
- Clipboard/manual paste fallback remains available if popups or storage are blocked.

## Compatibility Fixtures

- `tests/pcsParityFixtures.ts` contains small PCS1/JSON source fixtures for simple loops, multi-section sequence timing, manual bass, multi-lane melody tuplets/slides and guitar/global metadata.
- `tests/parityFixtures.test.ts` verifies DAW timeline clips, rendered events and the Pocket Audio Core adapter shape.
- Real Pocket Audio Core output comparison is documented as a gap until the actual core package/API is present in this checkout.

## Private Alpha Polish

- Transport shows app version, environment and current file label/path.
- Controls/help panel exposes copyable diagnostics via the existing diagnostics export.
- Media and export actions report safer statuses instead of implying unfinished native behavior is complete.
- Recording controls now expose the v0.6.0 alpha slice: one armed live track, monitor toggle, metronome/count-in and project-media WAV clip creation in installed builds.

## Recording Alpha

- Track schema includes `recordKind`, `armed`, `inputDeviceId` and `monitorEnabled`.
- Project metadata includes metronome settings for enabled state, count-in bars and volume.
- Native CPAL recording commands can start/stop/status one mono input capture and write PCM WAV files under `project-media/recordings/`.
- Stop-recording imports the take as project media and places an audio clip on the armed live track.
- Live tracks can store an explicit manual recording latency offset; future placed takes move earlier/later by that offset while the raw WAV media remains unchanged and requested/applied offset metadata is saved on the clip.
- Browser/dev recording remains disabled.
- Remaining work: ASIO, simultaneous multitrack/stereo capture, punch-in/out, full comping/take lanes, automatic latency detection/compensation and FX monitoring.
- Future stereo/multitrack recording design is tracked in `STEREO_MULTITRACK_RECORDING_PLAN.md`; it keeps the no-hidden-compensation rule and requires explicit channel assignment plus grouped take metadata before implementation.
- ASIO/low-latency backend research is tracked in `ASIO_LOW_LATENCY_BACKEND_SPIKE.md`; the current release path remains CPAL/WASAPI-first.
- Punch-in/out, non-destructive take lanes and comping are tracked in `PUNCH_COMPING_TAKE_LANES_PLAN.md`; the current release still uses same-track overwrite placement for recorded takes.
