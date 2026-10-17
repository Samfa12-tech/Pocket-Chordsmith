# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.60` |
| Project schema version | `3` |
| Latest published version | `0.6.59` |
| Latest published tag | `pocket-daw-v0.6.59` |
| Latest published commit | `63c89d4687e7e8aea26287297ed83badcef6bc63` |
| Last installed-smoke version | `0.6.59` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-10-17T01:03:08.631Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.59_x64-setup.exe` |
| Last installed-smoke SHA-256 | `e809f816338df7f542184336925b1c5e13861a1ff9a8999594a595313069c3fd` |

## Installed-Smoke Notes

- Exact0.6.59 installer acceptance and evidence-only candidate verification completed before publication; GitHub published the frozen receipt-bound assets on2026-10-17 at01:21:47UTC without rebuilding/restaging.
- The current installer proved real PCM take/file integrity, connected loopMIDI and retained WAV/MIDI exports, with installed media/VST3 and target game-pack checks. Capture eligibility reused the directly retained0.6.57 fresh-audible baseline after fingerprint matching; no fresh0.6.59 microphone-listening pass is claimed.
- The initial100ms Stop diagnostic failed and remains retained; the separately named accepted companion measured asynchronous convergence. This is not a universal Stop-latency guarantee. Older failed/withheld candidates remain historical evidence.
- All11 GitHub assets were downloaded/hash-verified and both updater manifests serve0.6.59. The itch windows-installer channel contains full0.6.59 setup/MSI installers, build2142969/upload17913969; it currently contains no bootstrapper.
- See docs/releases/PUBLISHED_0.6.59_2026-10-17.md for the dated publication record and docs/releases/PREPUBLICATION_SOURCE_NOTES_0.6.59.md for verbatim earlier preparation snapshots. This later documentation commit is not the installer-tested commit; a future installer requires a new version/receipt.

## Unreleased Source-Only Notes

- 0.6.60 is an unpublished post-release documentation/status checkpoint: current release/support text and family metadata are reconciled to verified0.6.59 publication. Only the app version metadata advances to preserve the existing fail-closed release gate. No runtime feature, dependency, installer, receipt, hardware smoke or publication is added for0.6.60. Published/tested0.6.59 artifacts and all historical failures remain immutable.

## Installed-Smoke Exception

- No exception recorded; published installer checkpoints require matching exact installed-smoke evidence.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
