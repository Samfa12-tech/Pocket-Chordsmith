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

## Review correction: shared buses and the pre-I/O frame

PR113 at `bd144f56ad906dc75388fe9929346f5d1634033f` is held. Independent engine
review found two real lifecycle defects despite its passing 52 checks. The
production FX hook clears prefixed shared-bus effects before checking whether
sample preview is enabled. It ran during the audition conductor's initial ready,
profile assignment and Play. The first asynchronous frame yield also had no
owned cancellation signal before an asset-loading job existed; destroying the
consumer there could strand its pending caller and resources.

The editor-only conductor now suppresses both sample-FX and guitar-FX lifecycle
hooks, including its initial default-profile ready. Existing routing still
applies. It neither deletes effects nor recreates guessed settings afterwards.
The new test reproduced nine shared-bus retention failures on the old conductor.
It now retains effect instances, order, storage properties, enabled flags and
bus send/volume/mute/solo/bypass across ready, profile, proven cold/warm Hear, Stop,
source invalidation and exit/free, on Master/Music_Master/Music_FX/Music_Guitar.

Preparation now owns a small root-attached cancellable frame wait before I/O,
alongside the existing owned asset-loading jobs. Cancellation/profile/exit resolve
that wait while the consumer still exists. Deterministic early-frame tests prove
busy=true, zero asset jobs and one held frame wait, then verify Stop, detach, free
and queue_free resolve the caller as cancelled and release both wait and consumer.
A reentrant Stop from busy_changed also cancels before preparation. The frame and
asset jobs are tool scripts so they execute in the actual editor as well as games.

The corrected full Godot gate passes 82 audition checks, 23 existing asynchronous
loading checks and 147 addon-only package entries. A separate actual EditorPlugin
probe confirms editor_hint=true, two real threaded assets prepared, no autoplay,
retained shared EQ identity/properties and removal of its audition consumer.
Initial editor probes' green bodies with exit leaks were rejected. The final
probe settles editor startup and exits outside its process-frame callback; it
passes the unchanged error/leak guard. Its orphan Node StringName diagnostic is
also present in the no-audition editor baseline, without an ObjectDB/resource leak.

Fresh corrected-source rendered WASAPI captures remain in `captures-corrected`:
all four UI/audio checks pass, both native modes compare all 216,000 reference
frames at max1.647e-6/RMS2.93e-7, and manual/natural endings become silent. Raw
leading-zero preparation/frame waits are .268042s and .801375s; last native
positions6.9093/6.5253 for endpoint6.5 demonstrate frame granularity and unresolved
performance budgets. These are not latency improvements, physical listening or
representative-game acceptance.

PR113 hosted CI38838189597 also failed one DJ async-import assertion and one DAW
post-dialog focus assertion; CodeQL38838189603 passed. Their independent controlled
diagnosis is preserved separately. This Godot correction does not clear those
browser gates or authorize publication of the original113 ZIP.
