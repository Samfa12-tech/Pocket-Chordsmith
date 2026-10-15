# Finish comparison candidate

This source candidate builds on the prepared native monitor in PR101. It is not
a published release or installed-device/listening acceptance.

## User flow

Select clips or an edit range, then open Export / Finish & Compare. The passage
uses the visible Hear this bit lead-in and tail settings. Choose Original,
Low-end tidy, Gentle glue or managed Finish-effects bypass. A always preserves
the current mix; Original asks for a proposed starting point before preparation.

Prepare renders two versions and measures their decoded PCM without autoplay or
editing the project. A/B starts only on request, then switches the same native
sample clock with a 10 ms crossfade. Stop cancels preparation or stops comparison;
a stopped/finished comparison can replay the same passage. Apply commits the
proposed effects in one existing Undo step. Discard removes the temporary preview.
Project, selection, settings or another transport action invalidates old previews.
Recording blocks preparation/play/apply. A late side reply cannot undo Stop, and
ordered native side commands reject an older delayed choice.

Managed presets preserve other master FX. Replacing/removing managed effects
removes only their automation; Undo restores effects and automation together.
Matching attenuates to the quieter measured loudness and adds common headroom
to keep estimated peaks at or below -1 dBTP. Monitor gains are never exported or
stored in the project. Measured passage warnings report full-scale/non-finite
samples, estimated peak headroom, DC offset and negative stereo correlation.
Meter labels remain estimates; no certification or automatic quality pass.

## Runtime and limits

The existing native worker renders from time zero through the selected ending,
preserving effect/automation history. It writes exact-duration stereo float WAVs
in an owned application-cache directory. Registered IDs own at most two 128 MiB
files; the existing 600-second native render ceiling remains. The audible
passage is at most 120 seconds. Later passages/high rates may exceed the byte
bound and receive an explicit error. This is a bounded prefix preview, not an
arbitrary-length streaming render.

Binary Response IPC sends an ArrayBuffer directly to a dedicated worker using
transfer ownership. Core's existing analyzer measures the actual decoded preview
WAV passage off the UI/live callback. Stop terminates that worker and marks native
render cancellation. Native encoding checks cancellation between 128-frame
blocks; current media/bank/plugin setup and a currently executing DSP call finish
their operation first. No partial WAV becomes ready. No JSON sample-array copy
is added for preview output. Native playback reads the prepared files directly.
Discard/shutdown removes owned ready files; the next reservation sweeps only
abandoned native-named files in this dedicated cache, preserving active and
unrelated files. Project/media files and portable source assets are unchanged.

The monitor capability advances to version 2 for ordered side changes; old
backends fail closed before two assets can start. Existing project playback,
recording, export defaults and source formats keep their contracts. Capture
fingerprint remains
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`.
Microphone testing is scoped out for this source slice, not passed. Shared
output/installed-device and listening acceptance remains before release.

## Additional export correctness fix

The actual native command adapter previously converted requested float32 output
to PCM16, even though the lower-level renderer supported float WAVs. An actual
worker regression fails on that adapter (format 1 instead of IEEE-float format
3). The corrected adapter retains 32-bit precision and produces bytes identical
to the direct renderer. Default 16-bit and requested 24-bit behavior remains.
This also corrects the float intermediate used by explicit dither paths. Final
normalized/encoded delivery files still need decoded reanalysis and acceptance;
preview measurements are not final-export measurements.

## Evidence and remaining acceptance

Full source validation: 1,226 DAW checks, 213 Rust tests with three existing
ignored, TypeScript/build, Clippy, manifest 111 and existing tooling checks.
Native tests cover continuous 44.1/48 kHz PCM/phase, rapid reversing crossfades,
generation/side ordering, cancellation and file ownership/cleanup. Browser
command fixtures verify interaction only, never native DSP or physical output.

A real production worker analyzed a generated five-minute, 48 kHz, stereo float
WAV (115,200,044 bytes). Completed runs took about 6.1-7.2 seconds while UI
heartbeats continued (observed maximum gaps 109.5-138.3 ms). A separate test waits
for worker analysis to start, cancels, and confirms continued UI heartbeats and
no completion; the unit client verifies AbortSignal actually terminates its
worker. These are local diagnostic measurements, not universal performance
budgets. Raw reports remain under local-artifacts/scratch/validation/finish-workflow
and shared validation logs. Tests requiring the production static transport are
explicitly skipped if that transport is absent; a skip is not a pass.

Remaining: actual combined native preset/render/monitor integration and real
vocal/live listening, normalized/encoded output parity/reanalysis, installed
Windows/WebView/scaling/device acceptance and the rest of the family checklist.
No installer, public upload, dependency/account/licence/security change or Core
npm publication is part of this candidate.
