# Native output acceptance (Windows device)

The automated native tests check queue ownership, consumed transport position,
discontinuity flushing, silence classification and stream-failure status. They
do not measure speaker or driver latency. `positionSeconds` is the last frame
consumed by the CPAL callback. `outputDiagnostics.renderedPositionSeconds` may
lead it; `queueDelaySeconds` covers queued PCM only, while
`deviceOutputLatencySeconds` is `null` until measured externally.

Seek, pause/resume and discrete mute/solo changes request a new output queue
generation. Continuous volume/pan automation follows the render worker and may
take up to the bounded queue duration to reach CPAL; it does not repeatedly
flush the device queue.

Use an installed build from the exact candidate being accepted and a physical
Windows output device. Keep the project, device, sample rate, buffer setting,
build hash and any loopback recording with the test record.

1. Put isolated full-scale-safe click/impulse markers on a track at known bar
   boundaries, with at least one marker immediately before and after a loop
   boundary. Capture the output with a calibrated WASAPI loopback or external
   recorder when available. Compare the markers with polled `positionSeconds`,
   `renderedPositionSeconds`, `queueFrames` and `queueDelaySeconds`. Report
   observed offsets and spread; do not infer physical latency from queue size.
2. Play at different supported output buffer settings. Repeatedly pause,
   resume, seek before/after a marker, toggle mute/solo and loop. Listen and
   inspect the recording for pre-command PCM appearing after the first callback
   that observes a new queue generation. One callback already in progress and
   the physical device buffer may still present earlier sound.
3. Repeat under sustained CPU/plugin load. `underrunFrameCount` and
   `underrunCallbackCount` should stay stable in normal playback. If they rise,
   retain the corresponding `queueFrames`, `lastRenderMicros`,
   `maxRenderMicros`, `slowRenderBlockCount`, callback timings and device
   setting. Paused/discontinuity silence should increase
   `intentionalSilenceFrameCount` without adding starvation counts.
4. Unplug or disable the selected output device during playback. Confirm the
   app stops showing healthy playback, reports the stream error and permits a
   fresh play after the device is restored or another output is selected.
5. Record an input click against a playback marker, then inspect the WAV and
   the recording's native playback/capture anchors and input-frame metadata.
   Capture placement is bar/input-frame based; any measured offset must be
   assessed before changing placement or compensation logic.

Keep automated correctness, loopback measurements and human audible judgement
as separate evidence in the test record.
