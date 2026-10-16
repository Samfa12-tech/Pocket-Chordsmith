# Prepared passage audition

The optional editor panel provides **Hear this bit** and **Stop audition** for
already prepared audio. Opening it or changing controls never starts audio.
It shows the range, one or two lead-in bars, a 0.5/1/2-second tail allowance and
a manual listening cue. It does not make a quality finding.

For Core/Chordsmith charts, choose From and To sections with prepared section
files. Hear uses the last source bars, the production queued section transition,
the first target bar and available source tail. The first arrangement occurrence
of each section supplies its origin. This previews the existing cut transition;
it adds no crossfade or adaptive remix implementation.

For native DAW packs, choose a bar in the native transport map. Hear uses the
original global arrangement, including its recorded-media path, FX and automation,
with preceding bars and bounded available tail. Native edits belong in DAW and
require re-export. Section/state remixes cannot replace that arrangement.

Missing assets, passages over 120 seconds, dynamic streams and authored looping
files have explicit import/render or ordinary Play Preview fallbacks. No new
gameplay synthesis, playable examples or proposal Apply/Discard is implied.

## Ownership and ending

An isolated prepared-only conductor clones the chart/profile. It disables source
callbacks, synthesis, music-state behavior, sequence wrap and chart-end truncation.
Production preparation, players, transitions and native seek/origin paths remain
in use. Warm auditions reuse prepared PCM. Hear writes no source file, saved
resource, mix or bus layout.

Stop, source changes, reimport/reload, ordinary preview/jump, refresh and editor
removal invalidate ownership before cancellation. Root-owned threaded jobs drain
after exit/free. Post-preparation snapshots reject unannounced in-place profile
changes. File identity adds size/modification time at requests and preparation
completion, with editor signals and direct-stream change watchers. This is not
cryptographic per-frame file-integrity certification.

The endpoint follows the minimum reported position of active prepared players.
An advanced chart clock cannot cut off PCM before that position reaches the end.
If all assigned players finish first, the chart clock closes the silent passage.
Stops are serviced by editor frames and may overshoot during a frame stall; this
is not sample-exact scheduling or a device-consumed timestamp. See official
[AudioStreamPlayer position documentation](https://docs.godotengine.org/en/4.6/classes/class_audiostreamplayer.html)
and [EditorFileSystem signals](https://docs.godotengine.org/en/4.6/classes/class_editorfilesystem.html).

## Executed evidence and limits

Godot 4.6.3 control tests pass 52 checks: finite range/fallback, cold/warm resources,
production transition, PCM-position versus chart-clock ending, source immutability,
native routing, direct-resource/reimport invalidation, loop/dynamic rejection and
controlled Stop/profile/chart/exit/free during a held real threaded request.
Completion is released after exit/free is proven, followed by bounded job cleanup.
The controlled position override is a regression seam, not listening evidence.

A rendered OpenGL/WASAPI 48 kHz scene instantiated the actual main-screen controls.
Screenshots at 1280x920 and 1100x720 show the expanded panel; all seven controls
fit at the smaller size. Opening/selecting did not autoplay, Hear retained focus,
and manual Stop captured nonzero audio followed by silence. A generated 220-to-440
Hz section fixture reached the target and ended silently. That characterization
does not certify a gapless or level-matched musical transition.

The native fixture reuses the retained production native-worker export with
generated recorded media, Campfire, FX/automation and tails. Separate and
synchronized full-mix players reproduce all 216,000 reference frames from 2.0
through 6.5 seconds. Maximum absolute error is 0.000001647, RMS 0.000000293; silence
mutants are rejected. Both end silently with zero capture-buffer discarded frames.
Buffer accounting is not a device-dropout measurement.

The second rendered run includes 0.534708 seconds of all-zero preparation/frame
wait before native separate-player PCM and 0.022708 seconds before synchronized
PCM. The original 0.5-second raw-capture alignment rejected the former. Comparison
now removes only proven all-zero leading capture frames and reports that wait
separately; gain, reference duration and source frames are never fitted/removed.
This does not pass cold-loading or frame-time budgets. Observed last positions
were about 6.696 seconds for a 6.5-second endpoint, showing frame stop granularity.

The full gate initially rejected an intermittent leaked RefCounted object in the
existing async-loading test despite its 22-check summary/exit zero. One of five
isolated verbose repetitions reproduced it. The final consumer now finishes
deferred teardown before quit and is asserted freed. Five subsequent isolated
verbose runs are clean with 23 checks. The full fail-closed gate then passed with
52 new checks and 145 addon-only files before this report was added. The leak/error
guard remains unchanged; this scoped repetition is not universal leak acceptance.

Raw logs, generated scene/probe, screenshots, four float PCM captures and comparison
JSON are retained under ignored local-artifacts/scratch/validation/godot-editor-audition.
They are local evidence, not addon dependencies. Existing NUL-decoding and missing
recommended-bus warnings also occur in the retained native baseline. Script
exceptions and leaked objects remain failures.

Representative game/load/unload, long-session/working-set, performance budgets,
physical output and human listening remain open in
[runtime acceptance](RUNTIME_AUDIO_ACCEPTANCE_2026-10-16.md). No version, licence,
account, credential, dependency, capture-engine or public-payload change here.
