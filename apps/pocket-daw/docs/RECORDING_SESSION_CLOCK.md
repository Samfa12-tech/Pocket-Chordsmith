# Recording Session Clock

Pocket DAW recording timing is currently diagnostic and explicit. It does not apply hidden latency compensation.

## Values

- `recording.sessionId`: app-owned recording generation used to reject stale async work.
- `startBar` / `captureStartTransportSeconds`: requested timeline placement chosen by the transport/UI.
- `playbackCaptureAnchor.renderedFrameCount`: native playback output frame counter snapshot near capture request.
- `playbackStopAnchor.renderedFrameCount`: native playback output frame counter snapshot near capture stop.
- `playback*Anchor.sampleRate`: native playback output sample rate for the anchor snapshot.
- `nativeCaptureStartInputFrame` / `nativeFirstInputFrame`: CPAL input callback frame counters stored on recorded media metadata after stop.
- `nativeCaptureSampleRate`: CPAL input sample rate stored on recorded media metadata.
- `playbackStartedAtMonotonicMs` / `captureRequestedAtMonotonicMs`: browser presentation timestamps only.

## Current Guarantee

Recorded clips stay at the requested timeline placement. Pocket DAW records native input/output frame evidence and dropped-frame counters so a take can be audited later, but it does not move clips automatically from those measurements.

## Not Claimed

- No sample-locked playback/capture clock is claimed.
- No device latency estimate is applied.
- No automatic overdub alignment or latency compensation is applied.
- Browser monotonic timestamps are not sample accurate.
