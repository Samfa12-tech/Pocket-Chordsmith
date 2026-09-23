# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.50` |
| Project schema version | `3` |
| Latest published version | `0.6.49` |
| Latest published tag | `pocket-daw-v0.6.49` |
| Latest published commit | `a8ebe0b6525f9f7679e0028d5b98db0d0f6bf2ca` |
| Last installed-smoke version | `0.6.49` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-09-23T05:49:39.778Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.49_x64-setup.exe` |
| Last installed-smoke SHA-256 | `4125cf21080310a9413c4bedf7c7155d5ef8d500ffd3ad9fe451021f78196829` |

## Installed-Smoke Notes

- 0.6.49 was published from the exact installer-tested commit a8ebe0b6525f9f7679e0028d5b98db0d0f6bf2ca. The 0.6.48 candidate remained unpublished after its installed Godot section-loop duration failure.
- The exact setup EXE SHA-256 is 4125cf21080310a9413c4bedf7c7155d5ef8d500ffd3ad9fe451021f78196829. Evidence-only verify:candidate passed in fresh-audible mode; release:publish-exact uploaded and reverified 11 receipt-bound assets without rebuilding or restaging.
- The installed 48 kHz mono microphone take lasted 10.039977 seconds (file peak 0.5115356, RMS 0.0460856); the same strict run captured 20 loopMIDI notes in a punched take lane and retained WAV/MIDI exports.
- Installed media portability and deterministic VST3 host smoke passed. The packaged VST3 sidecar SHA-256 was f2b5e909f142d00cadcdfbf7e44c970c23a645204000f6d42fd1cee4f241ddd8.
- Godot 4.6.3 target-runtime pack SHA-256 8f3ae90a5a383ca6c368e8832bbdc11fb2a5b94dcad89e3d3c7fa76d97f16359 and Chromium Web Audio pack SHA-256 3f79574edfdf9e236d26fc175efcf33759891e9a59865a306be75842dad762d2 passed, including exact section-loop duration checks.
- CI, Pocket DAW Windows native and CodeQL passed on the release commit. The public latest updater and bootstrapper manifests report 0.6.49, the setup URL returns HTTP 200, and the remote installer hash matches the tested setup. The unchanged itch bootstrapper was not repushed.

## Unreleased Source-Only Notes

- 0.6.50 is a source-only release-status/documentation checkpoint after the exact 0.6.49 publication. No 0.6.50 installer or updater has been prepared or published; any future package requires a new clean 0.6.50 candidate and full release evidence.

## Installed-Smoke Exception

- No exception recorded; published installer checkpoints require matching exact installed-smoke evidence.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
