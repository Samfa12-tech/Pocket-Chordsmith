# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.38` |
| Project schema version | `2` |
| Latest published version | `0.6.38` |
| Latest published tag | `pocket-daw-v0.6.38` |
| Latest published commit | `811a5bebc3c3a1b115ba4e1a2044a1ec33c5dceb` |
| Last installed-smoke version | `0.6.38` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-07-04T05:37:07.244Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.38_x64-setup.exe` |
| Last installed-smoke SHA-256 | `9a6b3b3722879e28b2cd8bbfee915619dbeff6a85da810b198b3fada98fdebf7` |

## Installed-Smoke Notes

- Pocket DAW 0.6.38 was installed locally from the exact staged updater setup EXE and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- The exact staged setup EXE SHA-256 was 9a6b3b3722879e28b2cd8bbfee915619dbeff6a85da810b198b3fada98fdebf7 and the smoke attestation validated against commit 811a5bebc3c3a1b115ba4e1a2044a1ec33c5dceb.
- Installed punch/take-lane smoke reported Pocket DAW version 0.6.38, opened C:\Users\sam_s\AppData\Local\Temp\pocket-daw-punch-take-installed-smoke-vnJ9sC\punch-take-lane-installed-smoke.pocketdaw, saved/reopened it, exported RIFF/WAVE and MIDI files, and passed invariant checks.
- The live audio recording smoke added one durable timeline clip, one grouped take-lane clip, one take group and one active take; it wrote a project-relative native recording WAV with 48000 Hz mono metadata and 26400 captured native frames. The automated input capture was silent on this machine, so strict audible-audio evidence is not claimed.
- The same smoke verified MIDI take-lane grouping, punched MIDI recording-take placement, range editing, save/reopen metadata, and parsed MIDI export including active pitches 83, 84 and 86 while excluding inactive sentinel pitches 82 and 85. MIDI input recording was correctly guarded unavailable because no MIDI input devices were present.
- `npm run verify:installed:punch-takes -- --summary <summary.json> --installer <setup.exe>` passed against the exact smoke summary and installer hash.
- `npm run verify:release` passed, including CI workflow verification, Pocket Audio family parity, 1008 Vitest tests, production build, preview package, and Tauri debug build. `cargo test --manifest-path src-tauri/Cargo.toml` and the native tests inside `npm run verify:itch` also passed with 114 Rust tests.
- `npm run verify:itch` passed for 0.6.38, including signed installer packaging and release artifact verification.
- GitHub release pocket-daw-v0.6.38 was published with 10 assets and marked latest. An earlier 0.6.38 GitHub release asset set had a different timestamped setup hash, so the release assets and notes were clobber-updated with the exact staged artifact that was installed and smoke-tested.
- The public GitHub latest updater manifest reports version 0.6.38 and the downloaded setup EXE Pocket.DAW_0.6.38_x64-setup.exe matched SHA-256 9a6b3b3722879e28b2cd8bbfee915619dbeff6a85da810b198b3fada98fdebf7.
- The public bootstrapper manifest reports version 0.6.38 and installer SHA-256 9a6b3b3722879e28b2cd8bbfee915619dbeff6a85da810b198b3fada98fdebf7. Itch remains on the existing bootstrapper channel build bootstrapper-0.6.34 because the bootstrapper binary did not change; it now resolves the new GitHub installer.

## Unreleased Source-Only Notes

- No unreleased source-only notes recorded.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
