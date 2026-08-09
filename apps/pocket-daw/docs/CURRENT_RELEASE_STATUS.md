# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.47` |
| Project schema version | `3` |
| Latest published version | `0.6.46` |
| Latest published tag | `pocket-daw-v0.6.46` |
| Latest published commit | `aa519f2fc26064f3804d9f9ee917d277a966d080` |
| Last installed-smoke version | `0.6.46` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-08-09T00:23:18.707Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.46_x64-setup.exe` |
| Last installed-smoke SHA-256 | `e58e3498d5b905c52d5cc439a2ad48aa3609cd60e7ac8be6b4c819e9c0a1e18e` |

## Installed-Smoke Notes

- Pocket DAW 0.6.46 was published and installed-smoked from exact clean commit aa519f2fc26064f3804d9f9ee917d277a966d080.
- The exact staged setup EXE was releases/updater/Pocket.DAW_0.6.46_x64-setup.exe with SHA-256 e58e3498d5b905c52d5cc439a2ad48aa3609cd60e7ac8be6b4c819e9c0a1e18e; the remote setup re-download hash matched and the release tag, origin/main and tested commit agreed.
- Installed smoke passed 10.049977 seconds of 48 kHz mono PCM capture (file peak 0.6365356, RMS 0.0381953), 16 loopMIDI notes, retained WAV/MIDI exports, media portability, installed VST3 hosting, and Godot/Chromium target packs. Audio evidence reused the directly eligible manual-fresh attestation with an unchanged semantic PCM v2 fingerprint while the current installer independently re-proved PCM, MIDI and export integrity.
- The installed VST3 host passed with packaged sidecar SHA-256 a83ebd41120efdd2313125567c4ee6bf6f3378b6d18bb92c01f44c8a38b57fcd.
- Compatibility coverage includes unbundled official JS80P 4.0.2 and Surge XT 1.3.4 releases; Pocket DAW does not bundle, download or redistribute them.
- Godot 4.6.3 runtime pack SHA-256 e0b423631d8124693650dc8ee22e037bbcb22bc13305cc14b1eb1202040489d0 and Chromium pack SHA-256 6a96bc139293ca30697ff5dd53314b06ed2b69cae732910839d3536930145af1 both passed.
- 0.6.46 was published to GitHub release pocket-daw-v0.6.46 on 2026-08-09; itch remains on its stable unchanged bootstrapper payload.

## Unreleased Source-Only Notes

- 2026-08-09 source-only 0.6.47 release-process checkpoint: consolidates repeated release gates into one immutable candidate-receipt prepare pass, evidence-only candidate verification, and exact frozen-asset publication. This exact committed source checkpoint may run its first release:prepare; no 0.6.47 installer has been built, installed-smoked, or published. After a 0.6.47 receipt exists, or if source/package-producing bytes change from that exact commit, bump to at least 0.6.48 before preparing again.

## Installed-Smoke Exception

- No exception recorded; published installer checkpoints require matching exact installed-smoke evidence.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
