# Historical preparation snapshots through0.6.59

These are verbatim prepublication source notes, not current release claims.
The original full status remains immutable at tag pocket-daw-v0.6.59:
https://github.com/Samfa12-tech/Pocket-Chordsmith/blob/pocket-daw-v0.6.59/apps/pocket-daw/release-status.json

The dated publication record supersedes the old “no installer/public pass” statements.
All failed/withheld test results remain unchanged.

- 0.6.59 is a source-only passive-updater render correction over the accepted rustls security patch. A closed updater check now patches the transport status instead of rebuilding the whole studio at both begin/completion; explicit checks and visible/available updater panels retain their existing rendering. New production-browser controls preserve studio DOM for closed checks and retain available-update visibility. Native audio/capture, project schema, dependencies, TLS trust and updater policy are unchanged. No 0.6.59 installer or installed acceptance exists. Explicit UI Stop now refreshes cancelled audition controls immediately; previously an incidental startup redraw masked a disabled Hear button after Stop. The menu control now proves the startup callback ran while requiring no studio redraw, retaining focus checks; the pending-start control additionally requires Hear to re-enable before the stale completion is released.

- The accepted dependency-only 0.6.58 source at 1eecf8c8212171f240a078f7b977fc3a390c80c2 passed terminal CI and CodeQL, but preparation stopped before any native release build/package/receipt: 76/77 production browser cases passed and long-song worker UI responsiveness measured 184.9 ms against the unchanged 150 ms limit. One profiled diagnostic reproduced 179.1 ms and attributed consecutive full renders to checkForUpdates at startup. Both new closed-updater controls failed against the unchanged 0.6.58 production bundle before this fix. All failed logs, traces and profiler evidence remain retained; no installer or microphone action occurred.

- 0.6.58 is a source-only security replacement candidate: rustls 0.23.40 to 0.23.46 and its required rustls-webpki 0.103.13 to 0.103.14 patch. No app, updater-plugin, reqwest, capture, DSP, project-schema or signing-policy behavior is changed. No 0.6.58 installer, receipt, installed acceptance or publication exists. Review the exact source and locked Windows tests before preparing a replacement installer.

- The frozen 0.6.57 candidate at fc619a1dfaacf8c07b86147b5dcbf39058e56032 passed exact-installed candidate verification and independent acceptance. Its artifacts and private evidence remain immutable; publication was paused for the Windows rustls advisory. Earlier source-only status notes below are historical checkpoints, not the final 0.6.57 acceptance. That acceptance does not transfer to 0.6.58. Latest public release remains 0.6.50; historical published smoke fields remain unchanged.

- 0.6.57 is a separate source-only Library focus correction. A delayed background startup readiness refresh replaced live sample controls after selection, including unfinished search/IME and placement inputs. Readiness state still updates, but a focused Library workbench keeps its live DOM until an intentional surface change. Native clock, DSP, capture, project history and user update actions are unchanged. No0.6.57 installer or installed acceptance exists.

- Exact0.6.56 source38f70df received scoped transport/hint acceptance and terminal green CI/CodeQL. Its first preparation failed before packaging on a cold Finish deadline and Library focus loss. A controlled retry was deliberately stopped before packaging after the delayed Library focus loss reproduced in a real frontend. Neither attempt created an installer or receipt. All failures, diagnostic runs, interrupted output and frozen0.6.54/private0.6.53 evidence remain retained. No fresh microphone action occurred.

- 0.6.56 is a separate source-only correction to the main-based integration. Ordinary Play and Restart share preparation/request and engine-generation ownership so Stop, Pause, Seek or a newer start cannot be undone by a delayed completion. Existing MIDI/Finish ownership is composed, not replaced. Residency hints retain only the latest revision per asset, with at most256 entries and512 characters per key; forgotten hints preserve full-byte fallback. No0.6.56 installer or installed acceptance exists.

- Independent review reproduced ordinary Play-after-Stop on both0.6.54 and0.6.55 and unbounded hint history on0.6.55. The one0.6.55 preparation was stopped, with no receipt or installer created; partial outputs and all evidence remain retained. The exact3d1a810 full production suite separately passed62/62 with both unchanged150ms worker limits, but that does not waive the source correctness blockers. Frozen0.6.54 remains installed and unchanged; no microphone action occurred.

- The frozen 0.6.54 fa38172 installer and receipt remain immutable and unpublished. Sam confirmed the Undo/Redo export viewport fix; installed media, VST3, game-pack decoding and separate MIDI-only checks passed. Whole acceptance remains blocked on eligible capture evidence and remaining native manual scope. Bounded raw HTTP diagnostics reproduced 4.42/3.72-second warm Play delays; source-native instrumentation and the cache-retention correction require independent review and a new exact installer.

- The frozen0.6.53 candidate remains preserved and unpublished. Its fresh deliberately authorized microphone, connected loopMIDI, retained WAV/MIDI exports, installed media, VST3 and game-pack decode checks passed. Sam confirmed comparison, Stop and requested examples worked; Undo restored the mix but moved the export area out of view. That reproduced UI defect holds0.6.53. Neither its partial attestation nor source status is an overall installed pass.

- 0.6.52 is the unreleased replacement family candidate, based on independently accepted PR124 commit 497d2fa7c9c72d0bfe9febd1b417892f8fd52442. It retains bounded cache/residency and hydration recovery, Campfire Acoustic, finite native passage audition, reversible Finish comparison, calibrated meters/final WAV checks, arranged native Godot exports, and menu/focus/overflow corrections.

- The frozen 0.6.51 candidate is withheld after a native Open dialog blocked commands. This replacement makes file selection asynchronous, preserves Cancel without a second picker, and rejects stale project/recovery/MIDI startup and playback-preparation completions. The original 0.6.51 artifact and partial installed evidence remain preserved; they are not a complete installed pass for this replacement.

- Installer preparation, exact installed PCM/MIDI/export/device checks, retained listening evidence and parent review are separate gates. Candidate receipts and attestations identify tested bytes; this source status does not claim a new installed or public pass.

- The latest public and recorded installed-smoke version remains 0.6.50 at its exact tested commit. The unchanged itch bootstrapper is not a new full-installer upload target.
