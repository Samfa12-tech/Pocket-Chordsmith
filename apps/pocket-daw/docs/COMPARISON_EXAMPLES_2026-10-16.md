# Additional edit comparison and playable examples

0.6.53 is a separate source candidate. The frozen 0.6.52 installer, receipt,
verification and current installed application remain unchanged. No new installed
acceptance follows from source or browser command-fixture tests.

The existing Finish & Compare native renderer now also supports a bounded edit:
lower the selected non-master track's fader by 3 dB. Select a clip or edit range,
select the track, then choose Selected track -3 dB. The proposal uses the existing
track-volume command data model; it preserves source, FX, automation and media.
Native rendering retains the prefix needed for effect/automation history. A/B
uses the existing sample-clock monitor and loudness matching. A solo track may
sound unchanged after matching; mute, solo and automation can also mask a fader
change. The interface makes no automatic audibility or quality claim.

Prepare never autoplays. Apply commits one existing Undo step; Discard removes
temporary files without editing the project. Selection, selected track, source
and transport changes invalidate old proposals. Recording blocks preparation,
playback and Apply. Existing cancellation and ordered side-change guards remain.

What to listen for now includes Hear original/proposed example buttons. These
are playable examples on the user's selected passage and chosen starting point,
with the existing preset's musical cue. Each explicit Hear action may prepare
temporary audio, then play the requested side. No disclosure or selection starts
audio. Stop rejects late preparation and prevents delayed autoplay. A/B keeps
the same native position; stopped examples replay the same range.

Example sessions disable Apply and this panel's Undo, and the command handler
independently rejects Apply. The example cannot be stored as project edits or
save over the source. A normal Prepare creates a separate applicable proposal.
The disclosure stays open across preparation/status renders and example controls
participate in existing focus restoration. This extends the existing native
renderer, monitor, analysis worker and Undo; it adds no browser audio engine.

Unit tests cover the exact track-volume delta, preserved project structures,
one-step Undo and recording/example UI guards. Browser tests cover real worker
analysis and command/control lifecycle with generated PCM; those commands are
fixtures, not installed native DSP or physical output evidence. Source checks,
native integration, independent review and a separately versioned verified
installer remain distinct gates. No fresh microphone claim is made. Godot's
existing runtime/performance holds are unchanged.

## Source validation checkpoint

Focused unit tests: 15 passed; comparison/worker browser tests: 31 passed.
TypeScript and UI build passed. Wider source checks passed 1,263 tests across
108 files, with 321 Windows-contract tests across 32 files. Version and release
truth validators passed for this uncommitted source state; that does not certify
a new installer. A real disclosure-closing bug found in browser validation was
fixed, and earlier failing runs remain retained separately.

The track-gain diagnostic additionally exercised the retained 0.6.52 Rust test
binary after checking all 15 Rust source files byte-identical to this candidate.
It rendered 425,127 frames at 48 kHz and checked the sample-clock comparison
monitor against independently mixed/crossfaded PCM. Original/proposed PCM
differed by up to 0.01085918; matched readings were both -30.171498 LUFS;
monitor maximum error was 3.38e-8, RMS 1.15e-9. This is actual native DSP evidence
with a retained compatible binary, not a fresh 0.6.53 build, installed IPC test,
physical-device output or listening acceptance. The script and unique local
summary retain binary hashes and source comparisons for review.
