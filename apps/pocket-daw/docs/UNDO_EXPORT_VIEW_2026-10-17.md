# Undo keeps the Finish/export controls visible

Sam's exact-installed0.6.53 check reported: “Pressing undo closed the export
area window. the rest worked as intended.” The installed state afterward
retained the owned Campfire project, Guitar gain1.2, stopped transport and
unarmed/unmonitored tracks. The other requested checks were confirmed by Sam:
silent Prepare, comparison playback/side switching/Stop and requested,
non-applicable examples. This is bounded human feedback, not measured timing
or complete-device parity.

The existing browser command/control fixture reproduced the viewport loss:
after Apply and the Finish Undo button, the enabled Prepare control still
existed but had viewport ratio0. The previous test checked only that Undo was
disabled afterward, so it missed the lost editing context. This reproduces a
redraw/scroll defect; it does not establish that a separate native window
actually closed.

0.6.54 preserves the current scroll snapshot for button/menu Undo and Redo,
and keyboard Ctrl+Z/Ctrl+Y. Both routes retain the existing project history,
autosave, audio synchronization and render scheduling. No composition,
recording, playback-clock, audio recipe, gain proposal or export algorithm is
changed. The regression now verifies Prepare remains in the viewport after
Finish Undo and keyboard Redo/Undo, alongside the original gain proposal and
single Undo-step assertions. These are UI/control fixtures, not physical
output or new exact-installed acceptance.

The exact0.6.53 installer, receipt, first failed preflight and successful fresh
microphone/MIDI/export evidence remain immutable. Its successful deliberate
microphone take is10.069977s,483360frames at48kmono, peak0.2952575684 and
RMS0.04098569371;19 actual loopMIDI notes and retained WAV/MIDI exports passed
in the same run. The first quiet preflight never reached record_start; the
successful retry followed Sam's corrected direct “Ready—humming now” reply
and used unchanged source harness/thresholds. No full0.6.53 acceptance is
claimed: this reported UI defect holds that candidate, and native import/menu/
updater scope remains separate.

0.6.54 is source-only until reviewed and separately prepared. It has no
installer or exact-installed acceptance. The full semantic capture fingerprint
must still be checked by the release workflow; fresh0.6.53 PCM evidence must
not be relabeled as same-run0.6.54 evidence or silently treated as an eligible
whole-candidate baseline while its attestation is blocked. No microphone
capture or installation follows from this source patch.

Public DAW remains0.6.50; Chordsmithv70/DJv1i web publication and the held
Godot addon boundary are unchanged. Integration must preserve the accepted
live web fixes and avoid promoting held addon changes. No monorepo merge or
publication is part of this patch.

Validation: the added viewport assertion failed on unchanged0.6.53 source
with Prepare at viewport ratio0. After the fix, all37 existing Finish/menu
Chromium cases passed, including button Undo and keyboard Redo/Undo remaining
in view. The manifest-selected source scope completed1,090 tests across92
files:1,076 passed on the first run; the browser-parity suite could not find
Chromium, then its14 tests passed when rerun alone with the retained browser
path. Both the failed environment log and corrected run remain retained.
TypeScript/UI build, version/release-status/CI checks, generated governance
and whitespace validation passed. The semantic capture fingerprint remains
`e9da9acb8d6235a4f26f74f1c3601289d77c4125299cb345bb0fbf82956c8bce`.
No native rebuild, installer creation, installation, physical capture or
publication was run for0.6.54.
