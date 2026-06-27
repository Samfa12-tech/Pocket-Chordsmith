# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.32` |
| Project schema version | `2` |
| Latest published version | `0.6.31` |
| Latest published tag | `pocket-daw-v0.6.31` |
| Latest published commit | `75efd9157cdf24cfb3b4fd8b20ba1cc3c0c54571` |
| Last installed-smoke version | `0.6.32` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-06-27T19:41:13.6062321+10:00` |
| Last installed-smoke installer | `Pocket DAW_0.6.32_x64-setup.exe` |
| Last installed-smoke SHA-256 | `4c35e0bb9deb4fbb8e63b39b7cd80229287c0f2499f8a611a734974524051893` |

## Installed-Smoke Notes

- Pocket DAW 0.6.32 was installed locally from the staged itch installer artifact and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- The staged installer SHA-256 matched releases/itch/pocket-daw-release-manifest-v0.6.32.json. The manifest records gitCommitSha ab2d5d70f13d915698bc0839fee9dc09efa9dc1b and dirtyWorkingTree true because the 0.6.32 version/status bump had not yet been committed when this local tester artifact was built.
- MCP live bridge reported Pocket DAW project/app version 0.6.32, schema 2, and loaded the Chordsmith-derived Codex Bass Live Smoke project.
- Project inspection confirmed the smoke clip transform gain was 1, saved bass track volume was 0.86, and the bass tone was warm_sub.
- Solo-bass smoke reset live bass volume from the user's 1.2 workaround back to 0.86, left clip gain at 1, and played through native-cpal with full native cache coverage, no scheduler misses, no late/skipped events, no graph rebuilds, no native fallback, and no hotspot signals.
- Full-mix smoke disabled bass solo with bass volume still 0.86 and played through native-cpal with full native cache coverage, no scheduler misses, no late/skipped events, no graph rebuilds, no native fallback, and no hotspot signals.
- Latest published version remains 0.6.31; 0.6.32 has not been pushed to GitHub or the itch windows-installer channel in this smoke pass.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
