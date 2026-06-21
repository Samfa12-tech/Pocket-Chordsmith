# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.25` |
| Project schema version | `2` |
| Latest published version | `0.6.24` |
| Latest published tag | `pocket-daw-v0.6.24` |
| Latest published commit | `a316eb8a207f0d77fd3c17aef4f0af1176de13d1` |
| Last installed-smoke version | `0.6.24` |
| Last installed-smoke result | `not-run` |
| Last installed-smoke date | `2026-06-21T03:21:10Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.24_x64-setup.exe` |
| Last installed-smoke SHA-256 | `b3d8f0a218b97f31984223b1069d3c2e8c73bd4d0c7a22cd21c026ddd1e70984` |

## Installed-Smoke Notes

- Pocket DAW 0.6.24 was published to GitHub latest for a manual auto-update smoke before merging to main.
- The latest updater manifest resolves to pocket-daw-v0.6.24 and the remote setup SHA-256 matches the staged artifact.
- This tester build keeps the previous rendered native cache active during live composition rebuilds so discarded cache builds do not trigger full procedural fallback.
- The guarded itch push refused without a passing exact-artifact smoke attestation, so the itch installer channel remains pending until manual smoke evidence is available.
- Installed-app/manual smoke is intentionally pending until Sam tests the auto-update path.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
