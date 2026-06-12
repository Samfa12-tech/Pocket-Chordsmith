# Pocket DAW v0.6 Foundation Notes

This note tracks the v0.6-readiness work that follows the v0.5.1 hardening pass.

## Media Persistence

- Media Pool status now distinguishes project media, runtime-loaded audio, external unloaded media, browser runtime-only imports, missing media and unresolved media.
- Imported native audio records the original URI and media reference kind.
- Browser imports remain runtime-only because the browser does not expose a durable source path after import.
- `createCollectMediaPlan()` produces a deterministic JSON plan with copy, already-project and blocked buckets.
- Native copy/relink is still guarded; use the plan to review what would be collected before enabling mutation.

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
- Recording arm controls are disabled and route to a clear prerequisite message.

## Recording Prep

- Track schema already has `recordKind`, `armed` and `inputDeviceId` placeholders.
- Live vocal/instrument tracks can be created as future routing placeholders.
- No microphone permissions, native capture, waveform recording or recorded clip generation are enabled.
- Recording should wait for project media copy/relink, device selection, latency settings, armed-track rules, meters and reload-safe saved clips.
