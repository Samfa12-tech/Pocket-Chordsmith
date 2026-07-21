# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.42` |
| Project schema version | `2` |
| Latest published version | `0.6.41` |
| Latest published tag | `pocket-daw-v0.6.41` |
| Latest published commit | `15761a1ff2dd6dbba70698c343b7181095a7a7e6` |
| Last installed-smoke version | `0.6.41` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-07-17T07:21:51.646Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.41_x64-setup.exe` |
| Last installed-smoke SHA-256 | `ee347b4786a1e6477d9a07659bc920fb126323dc3243f8b452df3170b0954174` |

## Installed-Smoke Notes

- Pocket DAW 0.6.41 was built from clean commit 15761a1ff2dd6dbba70698c343b7181095a7a7e6; the release manifest recorded dirtyWorkingTree false before installation.
- The exact staged setup EXE was releases/updater/Pocket.DAW_0.6.41_x64-setup.exe with SHA-256 ee347b4786a1e6477d9a07659bc920fb126323dc3243f8b452df3170b0954174, installed locally, launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe, and re-hashed unchanged after final candidate verification.
- One combined strict installed smoke captured 10.069977 seconds of 48000 Hz mono audio with filePeak 0.021575927734375 and fileRms 0.0017969736972514663, plus 19 loopMIDI notes in an unmuted active punched MIDI take lane spanning bars 7-9.
- The same installed smoke exported retained WAV and MIDI files and passed strict audible-audio, connected-MIDI, take-lane-placement, captured-pitch, installer-hash and export-file verification.
- Installed media-portability smoke passed collect, folder move/reopen, original deletion, decoded-cache-only recovery, relink/recollect, final portable reopen, WAV/stem/section-loop/Godot/Web exports and evidence re-hashing.
- Godot 4.6.3 imported and runtime-validated the final pack with 464 events and two STEM_SYNC stems; Chromium decoded the final Web full mix, stems and audible exact-duration 0.508475-second section loop and completed offline rendering.
- Sam's owned Billions of Years MIDI passed faithful conversion with 74 bars, 244 melody attacks, 148 chord events containing 453 notes, exact resolution 4, raw MIDI retained and zero generated accompaniment; owned files were excluded from git and public packages.
- The final candidate gate passed 1037 Vitest tests, 115 Rust tests, 14 Chromium E2E tests, smoke attestation, installed punch/take verification, media portability and both game-pack verifiers.
- 0.6.41 was published to GitHub release pocket-daw-v0.6.41 on 2026-07-17. GitHub latest updater/bootstrapper manifests, remote setup HTTP response and downloaded setup SHA-256 were verified; the release tag and origin/main pointed at the exact tested commit. Itch was correctly left on its stable unchanged bootstrapper payload.

## Unreleased Source-Only Notes

- 2026-07-17 post-release documentation and test-helper update: added the one-pass exact-artifact release fast path, corrected normal itch policy, recorded 0.6.41 process failures to avoid, and promoted the loopMIDI sender into a tracked reusable script.
- 2026-07-22 Pocket Audio sound-profile update: imports and renders PCS schema 17 profile identity, expressive events, Funk bass articulations, upgraded Metal texture, Western character, Chiptune channel controls, expanded drum lanes, capability diagnostics, and preserved unknown intent while retaining legacy schema-16 compatibility.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
