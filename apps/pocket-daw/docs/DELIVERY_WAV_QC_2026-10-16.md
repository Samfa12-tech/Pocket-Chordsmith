# Final WAV check

Full WAV export now sends the same immutable Blob to download and a dedicated
analysis worker. Last WAV check appears in Export and File. It measures the
complete final PCM after normalization, channel conversion, bit depth and dither;
Finish's selected preview measurements are separate. A normalized output can
have safe sample peaks and still trigger the measured true-peak warning.

The panel reports decoded format, duration, frames, estimated integrated LUFS and
true peak, with existing nonfinite/full-scale/DC/correlation warnings. Silence
or short audio gets an unavailable loudness reading. Check complete means the
analysis completed, not that audio quality passed. Save audio report retains the
file name, byte count, estimates, warnings and optional SHA-256 (where WebCrypto
is available). It identifies bytes handed to download; it cannot attest that the
operating system saved a file. No autoplay or automatic project processing.

The worker transfers its input buffer and can be terminated. Playback or capture
activity defers/cancels it; the requested download remains intact. Cancelled and
failed checks can be retried until a newer download replaces their immutable
Blob. Successful checks release the Blob. Limits are 128 MiB, mono/stereo,
8–192 kHz and 600 seconds; unsupported/oversized files are explicitly unchecked.
Worker completion updates only the panel, preserving other unfinished fields,
focus and scroll. Later edits mark the result as belonging to the prior download.

The ordinary cold-export hydration path also rejects replacement after a
concurrent project edit. It retains PR104's installed-clone owner correction.
Shared WAV decode now rejects invalid frame alignment, zero channels/rate and
inconsistent byte-rate metadata rather than reporting misleading measurements.

## Validation and boundaries

- Local Core 213/213 and DAW 1235/1235; TypeScript/production build passed.
- Local targeted browser 22/22, including cold/reopened hydration, concurrent
  Stop/edit, final downloaded float WAV/report decode, cancellation/late results,
  deferred playback and the two real long-worker checks. The downloaded fixture
  uses generated PCM and mocked native commands; it is not native DSP evidence.
- The final-file browser assertion initially saw one cancelled browser download;
  isolated retry and the complete 22-test rerun succeeded. The earlier failure is
  retained in local logs. Download requested is deliberately not saved-file proof.
- The 800×600 panel's heading, status, warning and report control are independently
  reachable within the existing scroll area, with no horizontal overflow.
- The capture fingerprint remains
  `e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`.
  Capture plumbing is unchanged; microphone testing is scoped omitted, not passed.
- PR103's actual native seven-format WAV/reference evidence is retained separately.
  This slice changes no Rust renderer, native clock or capture implementation.
  Final installed-app PCM/download behaviour, devices, listening and physical
  microphone acceptance remain distinct gates. No installer or public release.

PR104 is independently accepted in source at
`65534010c704fdb3633a8a549db1f7d8b1d4fd7b`; exact CI38820399984 and
CodeQL38820399393 succeeded. Hosted browser was 43 passed / 2 long-worker skipped,
and frontend 1228 passed. This resolves the cold-hydration source hold; it does
not complete the full-family release gates.
