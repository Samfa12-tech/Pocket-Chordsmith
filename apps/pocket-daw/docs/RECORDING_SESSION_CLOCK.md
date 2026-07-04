# Recording Session Clock

Pocket DAW recording timing is explicit and sample-domain aware. It still avoids hidden automatic latency compensation, but recorded takes now persist a timeline-sample placement model so clip placement can follow audio-engine timing metadata instead of raw UI timing alone.

## Values

- `recording.sessionId`: app-owned recording generation used to reject stale async work.
- `startBar` / `captureStartTransportSeconds`: requested timeline placement chosen by the transport/UI.
- `requestedStartSample`: requested transport start converted into the project timeline sample domain.
- `clipTimelineStartSample`: clip placement sample after applying the explicit/manual track offset.
- `clipTimelineStartBar`: bar position derived from `clipTimelineStartSample`.
- `playbackCaptureAnchor.renderedFrameCount`: native playback output frame counter snapshot near capture request.
- `playbackStopAnchor.renderedFrameCount`: native playback output frame counter snapshot near capture stop.
- `playback*Anchor.sampleRate`: native playback output sample rate for the anchor snapshot.
- `nativeCaptureStartInputFrame` / `nativeFirstInputFrame`: CPAL input callback frame counters stored on recorded media metadata after stop.
- `nativeCaptureSampleRate`: CPAL input sample rate stored on recorded media metadata.
- `recordedBufferOffsetSamples`: first captured-input offset inside the recorded buffer, preserved for diagnostics.
- `estimatedOutputLatencySamples`: current device/output buffer estimate from Pocket DAW audio settings.
- `track.metadata.recordingLatencyOffsetSeconds`: optional per-live-track manual placement offset. Positive values place future takes earlier; negative values place them later.
- `clip.metadata.latencyCompensationRequestedSeconds` / `latencyCompensationAppliedSeconds`: requested and actually applied manual placement offset saved on placed recording clips.
- `playbackStartedAtMonotonicMs` / `captureRequestedAtMonotonicMs`: browser presentation timestamps only.

## Current Guarantee

Recorded clips now prefer persisted sample-domain placement metadata when it is present on the recorded media item. The clip start is resolved from `clipTimelineStartSample` in the project timeline sample rate, with the existing manual track offset still acting as the explicit user control. Pocket DAW still records native input/output frame evidence and dropped-frame counters so a take can be audited later.

## Not Claimed

- No shared input/output hardware clock is claimed.
- No automatic overdub alignment or hidden device-specific latency estimate is applied yet.
- Manual offsets are user/project settings and are not inferred from hardware diagnostics.
- Browser monotonic timestamps are not sample accurate.
- `recordedBufferOffsetSamples` and playback anchors are diagnostic evidence, not a proof of perfect round-trip latency.
