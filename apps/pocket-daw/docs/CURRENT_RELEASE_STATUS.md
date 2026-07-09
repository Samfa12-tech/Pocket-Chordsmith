# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.40` |
| Project schema version | `2` |
| Latest published version | `0.6.38` |
| Latest published tag | `pocket-daw-v0.6.38` |
| Latest published commit | `811a5bebc3c3a1b115ba4e1a2044a1ec33c5dceb` |
| Last installed-smoke version | `0.6.40` |
| Last installed-smoke result | `partial` |
| Last installed-smoke date | `2026-07-09T10:18:22.129Z` |
| Last installed-smoke installer | `Pocket DAW_0.6.40_x64-setup.exe` |
| Last installed-smoke SHA-256 | `41c4ec77f9925f8155e2f5137c31fd7d68aaf322511cbc544c9d3d230cd6779b` |

## Installed-Smoke Notes

- Pocket DAW 0.6.40 was built from clean commit 5b7dfeaad867ce0584f3c16eb729623e0779926d; the release manifest recorded dirtyWorkingTree false before installation.
- The exact staged setup EXE was releases/itch/installers/Pocket DAW_0.6.40_x64-setup.exe with SHA-256 41c4ec77f9925f8155e2f5137c31fd7d68aaf322511cbc544c9d3d230cd6779b, installed locally, and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- Automated installed punch/take/export smoke reported Pocket DAW version 0.6.40, opened C:\Users\sam_s\AppData\Local\Temp\pocket-daw-punch-take-installed-smoke-g4Bahl\punch-take-lane-installed-smoke.pocketdaw, saved/reopened it, exported RIFF/WAVE and MIDI files, and passed invariant checks.
- The same smoke verified audio take-lane grouping, MIDI take-lane grouping, punched MIDI recording-take placement, range editing, save/reopen metadata, and parsed MIDI export including active pitches 83, 84 and 86 while excluding inactive sentinel pitches 82 and 85.
- `npm run verify:installed:punch-takes -- --summary C:\Users\sam_s\AppData\Local\Temp\pocket-daw-punch-take-installed-smoke-g4Bahl\punch-take-lane-installed-smoke-summary.json --installer C:\Users\sam_s\Documents\Pocket Chordsmith\apps\pocket-daw\releases\itch\installers\Pocket DAW_0.6.40_x64-setup.exe --require-export-files` passed against the exact smoke summary and installer hash.
- Recording hardware confidence is partial: audio recording started/stopped and wrote a 5.089977324263039 second, 48000 Hz mono WAV with 244320 captured native frames, but filePeak 0.0025634765625 and fileRms 0.00007378286087481344 did not satisfy the audible-audio gate. No OS MIDI input devices were detected, so connected MIDI input evidence was not captured.
- `npm run verify:itch` passed for 0.6.40 from the clean source commit, including version/status checks, native sound recipe freshness, 1016 Vitest tests, production build, 115 Rust tests, signed installer packaging, and release artifact verification.
- Historical 0.6.39 installed smoke remains the latest strict audible microphone plus connected loopMIDI evidence. 0.6.40 has not been published to GitHub latest, the public updater manifest, the bootstrapper manifest, or itch. Public release truth remains 0.6.38 until those publication steps are completed and verified.

## Unreleased Source-Only Notes

- 0.6.40 is an unpublished release-hardening candidate after the installed 0.6.39 manual notes. It routes Help/feedback links through the native OS opener, refreshes timeline M/S button state immediately while preserving the audio fast path, clears stale clip selection when track headers are selected so Delete does not remove an old clip, and defers the initial procedural fallback native-cache build/restart while playback is running.
- 0.6.40 has clean-source packaging and exact installed automated punch/take/export smoke evidence, but it is not public until the remaining manual Windows/hardware smoke, updater metadata, GitHub release, bootstrapper, and itch publication are completed and verified. Public release truth remains 0.6.38 until publication metadata changes.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
