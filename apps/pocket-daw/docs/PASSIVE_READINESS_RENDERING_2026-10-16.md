# Passive readiness updates preserve export ownership

PR107's hosted browser run at
`f2ef0d382349de5a5c0e189192f96876af9c3471` passed 48 tests, failed the 1100×720
Finish reachability case, and skipped two long-worker checks. Discovery-specific
controlled tests passed. The remaining race was not dismissed as a test flake.

The 3500 ms startup updater callback still called `checkForUpdates(false)`, which
replaced the full shell at both check begin and completion. A controlled timer
and native-check handshake reproduce this against the old source: the ready
Finish button and unfinished QC field detach, with captured render stacks in
`checkForUpdates()`. The old root render counters advance 11→12 and 8→9.

The same readiness render guard now covers automatic updater begin/completion
and sound/VST discovery. State updates immediately; active Export/File keeps its
existing controls until an intentional surface change. The existing polite
transport-status node receives any notification directly, without replacing
fields. An available update stays retained and is accessible through Help; it
does not open a modal over the export owner. Open Add Track or updater panels
still refresh, and explicit updater checks retain their checking/result UI.

Update checks, the 3500 ms schedule, startup preference, native request, signing,
update endpoints, download/install/restart and release metadata are unchanged.
No automatic download or install is added.

Five new browser cases control both timer and native response: Finish/QC ×
available/no-update and a positive explicit-panel check. They retain strict
node identity, focus, unfinished value and render-count assertions at both begin
and completion. Available cases verify the visible status notification and
retained result in Help. The fixture never calls download/install. The two
old-source failures and render stacks are retained as counterexamples.

Local TypeScript/build, all 1235 DAW tests, five targeted cases and the full
56-test browser run pass (including both local long-worker checks). Exact
hosted/source review is pending. Tests use native command fixtures, not an installed updater service or
physical device. The capture fingerprint remains
`e4ec7e55c375f6d43a7683bca61b3a4a60a96f73f9df9c09d745b21066aff770`;
microphone testing is scoped omitted, not passed.

PR107's Godot correction is independently source-accepted with a clean hosted
22-check lifecycle result, fail-closed gate and 142-entry addon package. That
does not clear its DAW browser hold. The prior failed performance budgets and
bounded float32-to-PCM16 compatibility remain open/scoped as documented; no
installed, device, listening, release or full-family acceptance is implied.
