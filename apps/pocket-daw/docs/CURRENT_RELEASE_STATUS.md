# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.39` |
| Project schema version | `2` |
| Latest published version | `0.6.38` |
| Latest published tag | `pocket-daw-v0.6.38` |
| Latest published commit | `811a5bebc3c3a1b115ba4e1a2044a1ec33c5dceb` |
| Last installed-smoke version | `0.6.39` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-07-04T10:41:13.136Z` |
| Last installed-smoke installer | `Pocket DAW_0.6.39_x64-setup.exe` |
| Last installed-smoke SHA-256 | `bf4c30ec43f498043935c0a1c84f34ea1a428435056dd8db3d89b33b88809b18` |

## Installed-Smoke Notes

- Pocket DAW 0.6.39 was built from clean commit dc2ce7e72992e2fe0aab8741eb4825f6fea78315, installed locally from the exact staged setup EXE, and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- The exact staged setup EXE SHA-256 was bf4c30ec43f498043935c0a1c84f34ea1a428435056dd8db3d89b33b88809b18 and the release manifest recorded dirtyWorkingTree false before installation.
- Strict installed punch/take-lane smoke reported Pocket DAW version 0.6.39, opened C:\Users\sam_s\AppData\Local\Temp\pocket-daw-0639-strict-smoke-d5958ea65da54c86ac577b922df1991c\punch-take-lane-installed-smoke.pocketdaw, saved/reopened it, exported RIFF/WAVE and MIDI files, and passed invariant checks.
- The live audio recording smoke used the internal Microphone Array path with an audible local cue and required audible audio evidence. The recorded project-relative WAV was 6.1 seconds, 48000 Hz mono, 292800 captured native frames, filePeak 0.177276611328125, and fileRms 0.015734772423645123.
- The connected MIDI recording smoke used loopMIDI Port as the OS MIDI input, captured a durable active punched MIDI take with 2 notes, and recorded pitches 84 and 88 during the strict MIDI input window.
- The same smoke verified MIDI take-lane grouping, punched MIDI recording-take placement, range editing, save/reopen metadata, and parsed MIDI export including active pitches 83, 84 and 86 while excluding inactive sentinel pitches 82 and 85.
- `npm run verify:installed:punch-takes -- --summary C:\Users\sam_s\AppData\Local\Temp\pocket-daw-0639-strict-smoke-d5958ea65da54c86ac577b922df1991c\punch-take-lane-installed-smoke-summary.json --installer C:\Users\sam_s\Documents\Pocket Chordsmith\apps\pocket-daw\src-tauri\target\release\bundle\nsis\Pocket DAW_0.6.39_x64-setup.exe --require-audible-audio --require-midi-input --require-export-files` passed against the exact smoke summary and installer hash.
- `npm run verify:itch` passed for 0.6.39 from the clean source commit, including version/status checks, native sound recipe freshness, 1008 Vitest tests, production build, 114 Rust tests, signed installer packaging, and release artifact verification.
- 0.6.39 has not been published to GitHub latest, the public updater manifest, the bootstrapper manifest, or itch. Public release truth remains 0.6.38 until those publication steps are completed and verified.

## Unreleased Source-Only Notes

- 0.6.39 is a source-only recording confidence candidate with exact installed-app audible microphone and connected loopMIDI evidence. It is not public until updater, GitHub release, bootstrapper, and itch publication are completed and verified.
- The checkpoint focus is recording trust: stricter installed punch/take smoke flags, clearer take-lane state feedback, diagnostics for selected input/channel/sample-rate/media-path evidence, and no expansion into simultaneous multitrack, ASIO, plugin hosting, full comp UI, or pitch-preserving time-stretch.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
