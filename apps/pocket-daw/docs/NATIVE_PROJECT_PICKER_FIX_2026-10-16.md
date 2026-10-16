# Native project picker responsiveness

Sam's installed 0.6.51 test successfully imported the Campfire fixture through
Import Paste, but Play and live frontend status remained pending while the
original Open dialog was still open behind another window. Closing that dialog
started the music; Sam confirmed the guitar sounded good. A subsequent read-only
status response took 111.9275 ms and retained the same unsaved imported project.
Native file selection itself was not accepted by that test.

The existing `open_project_file` command synchronously displayed the dialog on
Tauri's command caller thread. It now yields asynchronously and runs the existing
rfd picker plus bounded file read in `spawn_blocking`. The locked Windows rfd
backend initializes and releases its own STA COM context around the dialog.
No dependency, audio engine, clock, capture, device or permission change is made.

Native cancellation has a distinct result from an unavailable native runtime.
Cancel and native errors do not launch a second browser picker. Each window
allows one pending project picker. A changed project, save identity or recording
generation rejects late completion, including after recovery awaits. Active
audio/MIDI recording prevents project Open, and recording started during a picker
also prevents replacement. Transport controls remain on their existing paths.

Native Chordsmith/DJ JSON selection uses the existing family text importer and
its recovery snapshot. Pocket DAW documents, including JSON-wrapped DAW projects,
retain native save-path adoption and recovery-candidate checks. Files with a
`.pocketdaw` suffix retain strict Pocket DAW parsing.

Validation includes a held fake picker: its first future poll returns Pending,
the picker executes on a different thread, and unrelated runtime work completes
before release. Selected contents, Cancel, read errors and worker failure are
covered. Frontend coordination covers duplicate requests, stale results, result
routing, cancellation and recording protection. These are source/native unit
checks, not a Windows file-dialog acceptance claim.

The native capture fingerprint remains
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`.
A fresh hands-on microphone check is omitted for this source slice, not passed.
Any later exact installer must still satisfy retained-baseline eligibility and
the required actual PCM/MIDI/export smoke.

This is a source-only review candidate. No new installer has been prepared or
installed, and the frozen 0.6.51 receipt/setup and current unsaved user project
are preserved. A reviewed replacement requires a new version and one-pass
candidate preparation, followed by actual native selection, Cancel, Stop/status
responsiveness and current-project preservation checks. Other native dialogs are
outside this bounded correction. No publication or merge is implied.

## App ownership review follow-up

Independent review reproduced two gaps in the first source candidate: pending
Web MIDI access was invisible to the picker guard, and delayed recovery discovery
could display an old file's modal prompt after project replacement. The outer
guard prevented the latter project load, but did not prevent the stale prompt.

MIDI startup now takes its own generation before awaiting access and exposes a
pending flag to project Open. Duplicate starts are suppressed; MIDI Record again
or MIDI Stop cancels preparation. Project reset invalidates pending startup and
detaches its active MIDI handler. Access, error and transport completions check
project/track/generation ownership, so an old request cannot attach a handler or
clear a newer session. The picker also snapshots this generation. Recovery
discovery checks the same guard before prompting or reporting errors; a late
picker error cannot replace a newer project's status either.

The regression suite imports and calls the actual App methods, including project
reset, native-open recovery and MIDI startup. Only device access, picker and UI
rendering boundaries are substituted; method bodies and isCurrent are not copied
or mocked. The exact prior source fails twelve of thirteen cases while its normal
positive control passes. Corrected source passes all thirteen plus six coordinator
checks; the full PR source scope passes 1,254 tests in 108 files and TypeScript.
An existing constructor-bypassing bridge harness was initialized with the new
fields after its two MIDI cases exposed missing fixture state; assertions remain.

These are source integration regressions, not native MIDI/device acceptance.
Capture fingerprint is unchanged. No Rust code, frozen installer, running app or
source head under independent review was modified. A replacement build remains
held until this separately reviewable follow-up is accepted.

## Stopped-transport continuation correction

Review of the next source candidate found that its integration hosts all reported
an already-playing engine. When starting MIDI from stopped transport, the actual
Play path awaited timeline/native preparation and could then call engine.play on
a replacement project before the MIDI caller checked ownership again.

MIDI startup now passes its ownership predicate into Play and timeline hydration/
preparation. Checks occur after busy-paint, hydration and native-preparation awaits
and before engine.play, metronome, plugin-boundary sync or late UI updates. The
existing hydrator's owned metadata-repair callback advances the expected project
identity; legitimate reload analysis does not cancel its own startup. A busy
owner lets MIDI Stop clear its own overlay without an older completion clearing
a newer preparation's state. Project reset invalidates that UI owner as well.

The expanded suite calls the actual imported MIDI-start, Play, preparation,
hydration, Stop and reset methods. Native/file/device and rendering boundaries
are substituted, without mocking the ownership predicate. It covers delayed
native preparation/reset, Stop, delayed paint, old/new preparation completion,
normal stopped startup, actual hydration metadata repair and Stop during delayed
file loading. No native-device or installed-app acceptance is inferred.

This follow-up preserves the exact PR123 head for review. No native Rust/audio
clock/capture source or dependency changes, installer preparation or running-app
control is included. The semantic capture fingerprint remains unchanged; future
exact-installer PCM/MIDI/export and native picker acceptance remain mandatory.

Final source evidence:20/20 focused integration cases; exact prior PR123 source
rejects five of those cases while fifteen controls pass. Full PR source1261 tests
in108files and TypeScript pass. Initial negative-run setup errors (sandbox TEMP
rename before tests and an unreleased fake preparation) are retained; corrected
controls run actual assertions with workspace TEMP. No failed control is relabeled.
