# Pocket DAW Timing Model

Date: 2026-07-04

## Core Rule

Pocket DAW has one authoritative playback timing source per backend:

- Native installed app: native audio engine status/sample clock
- Web fallback/dev path: Web Audio context clock

The UI playhead follows that transport clock. The UI does not advance playback timing on its own.

## Transport Ownership

- `AudioEngine` owns playback state, transport position, loop wrap handling, scheduler lookahead, and playhead ticks.
- Native playback position is anchored from native status updates and carried forward in a sample-domain transport clock between polls.
- `App.ts` reads transport snapshots and renders the playhead, but it is not the timing authority.

## Shared Time Conversions

Pocket DAW now keeps the following conversions in `src/daw/timeline.ts`:

- `samplesToSeconds`
- `secondsToSamples`
- `beatsToSeconds`
- `secondsToBeats`
- `beatsToSamples`
- `samplesToBeats`
- `barBeatTickToSamples`
- `samplesToBarBeatTick`

Tempo automation and meter-map aware conversions still route through the same timeline helpers used by transport and export.

## Live Playback And Export Parity

- `renderTimelineEvents()` remains the musical event source for live playback, native playback payloads, and offline export paths.
- Native WAV export and live native playback both build their interpretation from the same project/event timing model.
- The scheduler now works from one transport snapshot per pass instead of recomputing the current time repeatedly inside the same lookahead loop.

## Recording Placement

- Record start intent is still chosen from the transport/playhead state.
- Recorded media now stores sample-domain placement metadata such as `requestedStartSample`, `clipTimelineStartSample`, and `recordedBufferOffsetSamples`.
- Clip placement prefers that sample metadata when present, then falls back to the explicit manual track offset path.
- Manual recording offset remains the user-facing correction control until a stronger device-latency model exists.

## Cache Rules

- Native render cache is timing-dependent data, not project truth.
- Loop/playhead timing uses the transport clock whether playback is cached, procedural fallback, or mixed cached/runtime audio.
- Timing-affecting edits should invalidate or refresh timing-sensitive cache windows.

## Known Limits

- Native transport is still polled from the UI/runtime boundary; it is better anchored now, but not a direct audio-callback push into the UI.
- Automatic hardware-latency compensation is still not claimed.
- Tempo-map support exists in timeline math, but some playback/export paths still assume the current project tempo shape is modest rather than highly experimental.

## Manual Checklist

- Start playback and confirm the playhead follows audio rather than UI repaint speed.
- Enable a loop and confirm wrap stays musically aligned.
- Seek during playback and confirm stale notes/regions do not continue sounding.
- Export WAV and confirm duration matches the expected bars/beats.
- Record a short take and confirm the placed clip uses the expected timeline position plus any explicit manual offset.
