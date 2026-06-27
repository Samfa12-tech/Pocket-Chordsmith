# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.31` |
| Project schema version | `2` |
| Latest published version | `0.6.31` |
| Latest published tag | `pocket-daw-v0.6.31` |
| Latest published commit | `75efd9157cdf24cfb3b4fd8b20ba1cc3c0c54571` |
| Last installed-smoke version | `0.6.31` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-06-27T16:57:06.2246129+10:00` |
| Last installed-smoke installer | `Pocket DAW_0.6.31_x64-setup.exe` |
| Last installed-smoke SHA-256 | `57115ae7701af0ad8831a6c601939f4b519edd86fbdf486f4bcf5b66a7bf36a1` |

## Installed-Smoke Notes

- Pocket DAW 0.6.31 was installed from the exact staged itch installer artifact and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- MCP live bridge reported Pocket DAW project/app version 0.6.31, schema 2, and loaded the Chordsmith-derived Codex Bass Live Smoke project.
- The bass-solo smoke project played through native-cpal for a 27.7s diagnostics window with WebAudio not-created, full native cache coverage, 11 bass events, renderCountDuringPlaybackDelta 1, no scheduler misses, no late/skipped events, no graph rebuilds, and no hotspot signals.
- The latest updater manifest resolves to pocket-daw-v0.6.31 and the remote setup SHA-256 matches the smoked staged artifact.
- The itch windows-installer channel reports version 0.6.31 on processed revision #1754598 from upload #17913969.
- MCP save_current succeeded for C:\Users\sam_s\AppData\Local\Temp\codex-bass-live-smoke.pocketdaw.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
