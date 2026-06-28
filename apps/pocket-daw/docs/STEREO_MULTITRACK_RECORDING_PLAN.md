# Stereo And Multitrack Recording Plan

This is the design anchor for moving beyond the current recording alpha. It does not change the current shipped behavior: Pocket DAW still records one armed mono live track in the installed app, requires a saved project, writes project-relative WAV takes under `project-media/recordings/`, and does not apply hidden latency compensation.

## Current Baseline

- `src/daw/schema.ts` already has `Track.recordKind`, `Track.armed`, `Track.inputDeviceId`, `Track.monitorEnabled`, and `MediaPoolItem.channels`.
- `src/daw/mixer.ts` currently enforces a single armed record-capable track.
- `src/app/App.ts` starts recording only when exactly one live track is armed and the project has a saved file path.
- `src/native/recordingBridge.ts` exposes one `trackId`, one input device, one monitor route, capture counters, dropped-frame counters, and one stop result.
- `src-tauri/src/native_recording.rs` owns one native input stream/writer and currently collapses input frames to mono channel 0.
- `docs/RECORDING_SESSION_CLOCK.md` is the timing contract: placement stays at the requested start, diagnostic clock evidence is stored, and no automatic compensation is applied.

## Design Goals

- Preserve every existing mono recording project, track, media item, and clip without migration churn.
- Make channel assignment explicit. Do not infer stereo or multitrack recording just because a device reports multiple supported channels.
- Record simultaneous takes from one shared capture session clock instead of starting independent track recordings that drift apart.
- Store enough metadata to audit channel assignment, file placement, capture timing, and dropped frames later.
- Keep monitoring safe by default. No FX monitoring or complex send/return monitoring should be claimed in the first stereo/multitrack slice.
- Keep latency compensation visible and opt-in. The app may store calibration evidence before it applies offsets.

## Proposed Schema Direction

Keep current fields and add future optional metadata in a backwards-compatible shape.

Track-level input assignment should be explicit:

```ts
type RecordingInputMode = "mono" | "stereo" | "split-mono";

interface TrackRecordingInput {
  deviceId: string | null;
  mode: RecordingInputMode;
  channelIndex?: number;
  channelPair?: [number, number];
}
```

Recorded media should carry take/session metadata in `MediaPoolItem.metadata`:

```ts
interface RecordingTakeMetadata {
  importMode: "native-recording";
  takeGroupId: string;
  recordingSessionId: number;
  trackId: string;
  deviceId: string | null;
  inputMode: "mono" | "stereo" | "split-mono";
  channelMap: number[];
  requestedStartBar: number;
  requestedStartSeconds: number;
  captureSampleRate: number;
  captureStartInputFrame: number | null;
  firstInputFrame: number | null;
  droppedInputFrameCount: number;
  latencyCompensationAppliedSeconds: 0;
}
```

`takeGroupId` is the key addition for simultaneous capture. It lets parallel files move through UI, diagnostics, cleanup, and future comping as one recorded performance without forcing grouped clips to become a new clip type immediately.

Punch-in/out, take-lane auditioning and comp selection are tracked separately in `PUNCH_COMPING_TAKE_LANES_PLAN.md`. This stereo/multitrack plan should provide grouped capture identity that the take-lane plan can reuse, but it should not claim comping behavior by itself.

## Native Capture Direction

The native layer should move from "one stream, one writer" to "one stream, many channel writers" for multitrack:

1. Resolve the selected input device once.
2. Open one CPAL input stream with the actual device sample rate and channel count.
3. Build a capture plan from armed tracks and explicit channel assignments.
4. In each input callback, route samples to one or more WAV writers:
   - mono track: one selected channel into a mono WAV.
   - stereo track: selected channel pair into a stereo WAV.
   - split mono: separate selected channels into separate mono WAVs tied to one take group.
5. Store shared callback frame counters plus per-writer first-frame and dropped-frame counters.
6. Stop all writers together and return one grouped result to TypeScript.

The actual capture sample rate from the device remains authoritative. If it differs from the requested project sample rate, the stop result should report that fact rather than silently pretending the request won.

## UI And Safety

- Keep the current one-track mono UI until the native grouped result path exists.
- When stereo/multitrack controls appear, label input mode and channel assignment directly, for example `Mono Ch 1`, `Stereo Ch 1-2`, or `Split Ch 1 -> Vocals, Ch 2 -> Guitar`.
- Warn when a saved channel assignment is unavailable on the current device.
- Allow multiple armed tracks only after channel assignments are valid and non-overlapping, unless the user deliberately chooses duplicated monitoring/capture.
- Keep monitor defaults conservative. Monitor off should remain safe, and monitor on should avoid feedback-prone routing.
- Treat FX monitoring as a later feature until the native path can prove stable latency and routing.

## Latency Strategy

The current no-hidden-compensation rule stays in force:

- Do not move recorded clips automatically based on device latency guesses.
- Store playback/capture anchors, capture frames, sample rates, and dropped-frame counters.
- Add future calibration as a visible command that writes a measured profile.
- If compensation is later applied, store `latencyCompensationAppliedSeconds` and keep the raw diagnostic fields.

## Verification Targets

- Existing mono alpha tests continue to pass without schema migration surprises.
- A stereo recording fixture creates a two-channel WAV and records `channels: 2` plus channel-pair metadata.
- A split-mono fixture records two mono files from one shared capture session and one shared `takeGroupId`.
- Simultaneous captures have matching requested start metadata and comparable first-frame evidence.
- Dropped-frame counters are preserved per take and surfaced in diagnostics.
- Same-track overwrite behavior remains correct for mono recordings and has an explicit grouped policy before multitrack overwrite ships.
- Browser/dev mode still reports recording as installed-app only.

## Release Boundary

Until the grouped native capture path and tests exist, release notes should continue to say: one armed mono live track only; no stereo modes, simultaneous multitrack capture, punch-in/out, comping, latency compensation UI, ASIO, or FX monitoring.
