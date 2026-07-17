# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.41` |
| Project schema version | `2` |
| Latest published version | `0.6.40` |
| Latest published tag | `pocket-daw-v0.6.40` |
| Latest published commit | `8a69c90fc2ab1721873a658f0b240502aceffe25` |
| Last installed-smoke version | `0.6.40` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-07-09T10:27:59.364Z` |
| Last installed-smoke installer | `Pocket DAW_0.6.40_x64-setup.exe` |
| Last installed-smoke SHA-256 | `41c4ec77f9925f8155e2f5137c31fd7d68aaf322511cbc544c9d3d230cd6779b` |

## Installed-Smoke Notes

- Pocket DAW 0.6.40 was built from clean commit 5b7dfeaad867ce0584f3c16eb729623e0779926d; the release manifest recorded dirtyWorkingTree false before installation.
- The exact staged setup EXE was releases/itch/installers/Pocket DAW_0.6.40_x64-setup.exe with SHA-256 41c4ec77f9925f8155e2f5137c31fd7d68aaf322511cbc544c9d3d230cd6779b, installed locally, and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- Strict installed punch/take/export smoke reported Pocket DAW version 0.6.40, opened C:\Users\sam_s\AppData\Local\Temp\pocket-daw-punch-take-installed-smoke-nm2OdA\punch-take-lane-installed-smoke.pocketdaw, saved/reopened it, exported RIFF/WAVE and MIDI files, and passed invariant checks.
- The same smoke verified audio take-lane grouping, MIDI take-lane grouping, punched MIDI recording-take placement, range editing, save/reopen metadata, and parsed MIDI export including active pitches 83, 84 and 86 while excluding inactive sentinel pitches 82 and 85.
- `npm run verify:installed:punch-takes -- --summary C:\Users\sam_s\AppData\Local\Temp\pocket-daw-punch-take-installed-smoke-nm2OdA\punch-take-lane-installed-smoke-summary.json --installer C:\Users\sam_s\Documents\Pocket Chordsmith\apps\pocket-daw\releases\itch\installers\Pocket DAW_0.6.40_x64-setup.exe --require-audible-audio --require-midi-input --require-export-files` passed against the exact smoke summary and installer hash.
- The live audio recording smoke captured audible microphone evidence: 10.06997732426304 seconds, 48000 Hz mono, 483360 captured native frames, filePeak 0.60931396484375, and fileRms 0.04333584582306064.
- The connected MIDI recording smoke used loopMIDI Port as the OS MIDI input, captured a durable active punched MIDI take with 46 notes, and recorded pitches 60, 64, 67, 72, 76, 79, 84 and 88 during the strict MIDI input window.
- `npm run verify:itch` passed for 0.6.40 from the clean source commit, including version/status checks, native sound recipe freshness, 1016 Vitest tests, production build, 115 Rust tests, signed installer packaging, and release artifact verification.
- 0.6.40 was published to GitHub release pocket-daw-v0.6.40, the public updater manifest, the bootstrapper manifest, and itch channel samfa12/pocket-daw:windows-installer on 2026-07-09. GitHub latest/download manifests and the remote setup EXE SHA-256 were verified after publication; butler status reported windows-installer build #1783130 at version 0.6.40.

## Unreleased Source-Only Notes

- 2026-07-13 source-only Portable Projects + Media Recovery slice: strict collect/save ordering, collision-safe and idempotent native copies, honest decoded-cache recovery, project-load runtime-cache clearing, live collect/reload/relink controls, explicit stem/loop/Godot/Web export controls, installer-bound portability evidence verification, and stricter smoke-attestation evidence requirements. Native debug smoke passed collect, source deletion, folder move/reopen, cache fallback, relink/recollect, five export artifacts and Godot 4.6.3 headless pack import; this is not yet an installed or published release claim.
- 2026-07-14 source-only Faithful MIDI Transcription slice: explicit faithful-versus-arrange intent, independent role assignments, exact supported timing resolution, sequential A-H packing at up to 16 bars per section, exact melody and chord overlays, no generated accompaniment by default, raw-reference retention, structured conversion history and one-command undo. Local validation against Sam's owned Billions of Years fixture passed at 86 BPM, F-sharp minor, 4/4, 74 source and destination bars, A-E section lengths 16/16/16/16/10, 244 melody attacks, 148 chord overlays containing 453 MIDI notes, final four F-sharp-major voicings, and zero generated bass, drums or guitar. Exact mixed-quality overlays remain DAW-local and schema-16 PCS1 progression output is labeled simplified; this is not yet an installed or published release claim.
- 2026-07-17 release-candidate hardening: installed punch/take evidence now normalizes project and installer paths before native recording, native string errors remain actionable, section-loop renders explicitly activate their generated section tracks, and WAV export duration no longer applies the transport's one-second safety floor to valid sub-second loops. Focused target smoke found and fixed a silent 0.25-bar Web/Godot loop; a fresh exact installer and target reports remain required before publication.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
