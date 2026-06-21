# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.22` |
| Project schema version | `2` |
| Latest published version | `0.6.22` |
| Latest published tag | `pocket-daw-v0.6.22` |
| Latest published commit | `5cd186a22b6a8be9d706e1474b6a204ddbd065aa` |
| Last installed-smoke version | `0.6.22` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-06-21T02:32:28Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.22_x64-setup.exe` |
| Last installed-smoke SHA-256 | `c7adc2aea5595490e55dbb720bed6735cd91348caef69ef249f3ff1c0868a6b7` |

## Installed-Smoke Notes

- Installed smoke for 0.6.22 used the exact staged GitHub updater setup artifact, then verified the same SHA-256 from the published latest updater manifest.
- The smoke loaded the imported Chordsmith demo project, selected the Bass track, played through native-cpal with 24 cached assets, 60 cached regions, 0 procedural events, and no performance hotspot signals.
- The same installer payload was pushed to the itch windows-installer channel as userversion 0.6.22.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
