# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.31` |
| Project schema version | `2` |
| Latest published version | `0.6.30` |
| Latest published tag | `pocket-daw-v0.6.30` |
| Latest published commit | `ad9a36fe5597e80b2a960425fda21723ebb04b11` |
| Last installed-smoke version | `0.6.30` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-06-27T10:45:13.5780752+10:00` |
| Last installed-smoke installer | `Pocket.DAW_0.6.30_x64-setup.exe` |
| Last installed-smoke SHA-256 | `15cc80cf3ab996a80be202f8423ac11634e023f20351427bfcea8529313c07fb` |

## Installed-Smoke Notes

- Pocket DAW 0.6.30 was installed from the exact staged setup artifact and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- The latest updater manifest resolves to pocket-daw-v0.6.30 and the remote setup SHA-256 matches the smoked staged artifact.
- The itch windows-installer channel reports version 0.6.30 on build #1753856.
- The installed smoke loaded C:\Users\sam_s\Music\lofi demo project.pocketdaw, confirmed app/project version 0.6.30, and played via native-cpal with WebAudio not-created.
- Cold stale-cache playback started with proceduralFallbackEventCount 1010, then built a full native render cache while playing: coverage full, assetRegionCount 50, cachedClipCount 10, buildCount 1, pendingReason null, and proceduralFallbackEventCount 0.
- Native callback diagnostics during the smoke reported maxCallbackMicros 722, slowCallbackCount 0, no scheduler misses, no audio graph reconfigures, and no performance hotspot signals.
- This tester build includes full-cache coverage during native payload windowing so cached generated tracks do not keep scheduling audible procedural fallback events outside the current WAV payload window.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
