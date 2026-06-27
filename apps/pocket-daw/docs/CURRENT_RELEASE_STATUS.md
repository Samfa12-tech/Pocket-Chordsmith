# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.34` |
| Project schema version | `2` |
| Latest published version | `0.6.34` |
| Latest published tag | `pocket-daw-v0.6.34` |
| Latest published commit | `1b89374ac9a7c53cca3ea936909db62984de9031` |
| Last installed-smoke version | `0.6.34` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-06-27T20:50:25.9480617+10:00` |
| Last installed-smoke installer | `Pocket DAW_0.6.34_x64-setup.exe` |
| Last installed-smoke SHA-256 | `67665c5917a3b6c3a102daa066fd463ec2750ed1eed502d99577c62c6b58e20d` |

## Installed-Smoke Notes

- Pocket DAW 0.6.34 was installed locally from the staged itch installer artifact and launched from C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe.
- The staged installer SHA-256 matched releases/itch/pocket-daw-release-manifest-v0.6.34.json. The manifest records gitCommitSha 6df2186334b365c3499616d69f86372c2f019e29 and dirtyWorkingTree true because the 0.6.34 bass-renderer/version/status changes had not yet been committed when this local tester artifact was built.
- MCP live bridge reported Pocket DAW project/app version 0.6.34, schema 2, and loaded C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw.
- The native render contract invalidated the old generated-stem cache: MCP reported 70 stale source hashes, rebuilt 70 generated regions, and finished with full native cache coverage and no generated stem render failures.
- User live-listening smoke confirmed the bass sounds better in the installed app after the Chordsmith-style harmonic low-pass and release-tail native renderer fix.
- Playback/performance smoke ran through native-cpal with no scheduler misses, no late/skipped events, no graph rebuilds, no native fallback, max native callback about 3.4 ms, and slowCallbackCount 0.
- Pocket DAW 0.6.34 was published to GitHub release pocket-daw-v0.6.34 from clean source commit 1b89374ac9a7c53cca3ea936909db62984de9031 on 2026-06-27.
- The public latest updater manifest reports version 0.6.34 and the downloaded setup EXE Pocket.DAW_0.6.34_x64-setup.exe matched SHA-256 89625636a3e68c9162e0dd3ea5a5f48f12673d2cfc439dab03134c6ddcb75f67.
- The itch windows-installer channel now reports bootstrapper-0.6.34; a fetched channel copy contains index.html, README_FIRST.txt, CHECKSUMS_SHA256.txt, and Pocket_DAW_Itch_Bootstrapper_v0.6.34.exe so browser-mode itch requests no longer fail with missing index.html.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
