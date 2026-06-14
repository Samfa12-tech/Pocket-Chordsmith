# Pocket DAW v0.5.10 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

## Current Public Build

- Version: `0.5.10`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-installer`
- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.5.10-updater-test`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Source commit: see the `v0.5.10` GitHub release and generated release manifest.

## Current Artifact Hashes

- Setup EXE `Pocket DAW_0.5.10_x64-setup.exe`: `d83c158595e125acfecd6f4e00385cfc68de0b8ea4dee7cf30c804a6d0b0ccff`
- Setup EXE Tauri updater signature `Pocket DAW_0.5.10_x64-setup.exe.sig`: `7074efe271963a1e63d287eb72edff563e83a929b1b6fe3110915f0df6dacd3f`
- MSI `Pocket DAW_0.5.10_x64_en-US.msi`: `961d6d7c0d6b3f618e362ae725f888a718871dbe80bc319f1d4865cd7aaaa989`
- MSI Tauri updater signature `Pocket DAW_0.5.10_x64_en-US.msi.sig`: `cb6c261dda591eece633e2109716039387e871df00af837346407fff796be848`
- Updater setup EXE: `d83c158595e125acfecd6f4e00385cfc68de0b8ea4dee7cf30c804a6d0b0ccff`
- Updater manifest: generated as `releases/updater/pocket-daw-latest.json` for the `pocket-daw-v0.5.10-updater-test` release.

## Alpha Testing Guidance

- Use the itch installer build for all public alpha testing.
- Launch from the Start Menu or installed shortcut; do not run Pocket DAW from an extracted app folder.
- Future updates should be tested through the installed app updater, not by manually redownloading every build.
- The app checks GitHub Releases for signed Tauri updater artifacts.
- The app must not be described as complete, professional DAW software, or Authenticode-signed unless verification proves those claims.
- Tauri updater `.sig` files are separate from Windows Authenticode signing, so SmartScreen may still appear.

## Manual Smoke Evidence

Partial installed-app smoke run by Sam on 2026-06-14 against v0.5.9:

- App opened and diagnostics export worked; diagnostics reported appVersion `0.5.9`.
- Demo loaded and played audibly.
- Pasting a Pocket Chordsmith share code into Pocket DAW worked.
- Importing raw Pocket Chordsmith JSON into Pocket DAW worked.
- Saved `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`, closed/reopened Pocket DAW, reopened the saved project, and playback worked.
- Re-exported diagnostics reported Imported Chordsmith Project with 7 clips, 12 tracks, 973 generated events, `sourceRefCount: 1`, and WASAPI/native device status available.
- Pocket Chordsmith "Send to Pocket DAW" did not work; paste/import fallback remains usable. v0.5.10 includes a deep-link/second-instance handoff fix that still needs installed-app smoke verification.

## Current Caveats

- Manual Windows smoke testing is partially run and still tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Pocket Chordsmith direct "Send to Pocket DAW" handoff failed in the 2026-06-14 v0.5.9 manual run; retest v0.5.10 before closing the issue.
- Live recording, ASIO support, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
