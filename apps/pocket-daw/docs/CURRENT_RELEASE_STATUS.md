# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.51` |
| Project schema version | `3` |
| Latest published version | `0.6.50` |
| Latest published tag | `pocket-daw-v0.6.50` |
| Latest published commit | `ec3f783b24abdd85d46229c2893ea953e96248cd` |
| Last installed-smoke version | `0.6.50` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-10-01T05:52:59.122Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.50_x64-setup.exe` |
| Last installed-smoke SHA-256 | `150e006b74b0d2675f361305c3b582b2ca41b82335f5451e0c39835c7dd4ad98` |

## Installed-Smoke Notes

- 0.6.50 was published from exact tested commit ec3f783b24abdd85d46229c2893ea953e96248cd using one prepare pass, fresh-audible installed evidence, evidence-only candidate verification, and exact publication without rebuilding or restaging.
- Fixes whole-row melody instrument changes, blocking native stem renders, and playback recovery after decoded cache eviction. Installed Melody 3 changes persisted in all A-H source arrays, and native Play passed on the original and reopened test song.
- The combined installed smoke retained 10.049977 seconds of 48 kHz mono microphone PCM (peak 0.4734497, RMS 0.0545173), 19 live loopMIDI notes, punched take lanes, and verified WAV/MIDI exports.
- Installed media portability, deterministic VST3 instrument/effect hosting, and owned MIDI conversion passed. Godot 4.6.3 and Chromium 149 decoded all six final pack WAVs with nonzero PCM and exact section-loop durations.
- CI including Windows native, and both CodeQL languages passed on the release commit. All 11 public receipt-bound assets were downloaded and hash-verified; both latest manifests report 0.6.50 and the setup URL returns HTTP 200. The unchanged itch bootstrapper was not repushed.
- Exact installer and full direct fresh-audible evidence are retained under ignored local-artifacts/archive/packages/pocket-daw/0.6.50-ec3f783b and local-artifacts/release-evidence/pocket-daw/0.6.50-sound-fixes for future fingerprint-compatible baseline reuse.

## Unreleased Source-Only Notes

- 0.6.51 is a source-only release-status checkpoint. No 0.6.51 installer, candidate receipt, installed smoke, or publication exists. The public 0.6.50 installer remains bound to its exact tested commit.

## Installed-Smoke Exception

- No exception recorded; published installer checkpoints require matching exact installed-smoke evidence.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
