# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.37` |
| Project schema version | `2` |
| Latest published version | `0.6.36` |
| Latest published tag | `pocket-daw-v0.6.36` |
| Latest published commit | `c9376495b5f6b4f1ca56548352f01deefb0faad1` |
| Last installed-smoke version | `0.6.36` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-07-03T07:43:38.1694606Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.36_x64-setup.exe` |
| Last installed-smoke SHA-256 | `f074559250cae55bbd22932391b4ba75acc96f95d860f2941d9c5fb46e1e2a85` |

## Installed-Smoke Notes

- Pocket DAW 0.6.36 was installed locally from the exact staged updater setup EXE and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- The exact staged setup EXE SHA-256 was f074559250cae55bbd22932391b4ba75acc96f95d860f2941d9c5fb46e1e2a85 and the smoke attestation validated against commit c9376495b5f6b4f1ca56548352f01deefb0faad1.
- MCP live bridge reported Pocket DAW project/app version 0.6.36, schema 2, Imported Chordsmith Project, 12 tracks and 7 clips.
- MCP play started native-cpal playback; the immediate stop request timed out while the native render cache was building, then follow-up status recovered with transport stopped, native render cache coverage full, 66 assets, 70 regions, 7 cached clips, zero procedural fallback events, zero generated stem render failures and no scheduler/cache hotspot signals.
- Sam manually smoke-tested save/load on 2026-07-03, Pocket Audio handoff push from samfa12.com into Pocket DAW, and audible playback/listening quality.
- The public GitHub latest updater manifest reports version 0.6.36 and the downloaded setup EXE Pocket.DAW_0.6.36_x64-setup.exe matched SHA-256 f074559250cae55bbd22932391b4ba75acc96f95d860f2941d9c5fb46e1e2a85.
- The public bootstrapper manifest reports version 0.6.36 and installer SHA-256 f074559250cae55bbd22932391b4ba75acc96f95d860f2941d9c5fb46e1e2a85.
- GitHub release pocket-daw-v0.6.36 was published with 10 assets and marked latest. Itch remains on the existing bootstrapper channel; the bootstrapper now resolves the new GitHub installer.

## Unreleased Source-Only Notes

- 0.6.37 candidate keeps the 0.6.36 timeline-first UI direction while preserving the lower dock for the Music preset, keeping timeline tools collapsed by default, and preserving scroll when opening panels.
- 0.6.37 candidate includes hardened installed Pocket Audio handoff import handling for downloaded/opened payloads from samfa12.com.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
