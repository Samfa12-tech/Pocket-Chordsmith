# Pocket DAW v0.5.11 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

## Current Public Build

- Version: `0.5.11`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-installer`
- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.5.11-updater-test`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Source commit: see the `v0.5.11` GitHub release and generated release manifest.

## Current Artifact Hashes

- Setup EXE `Pocket DAW_0.5.11_x64-setup.exe`: `0f5a71de91916af76d46775d34c46bfb3dc2930ce79a44ababb572cb4da1b019`
- Setup EXE Tauri updater signature `Pocket DAW_0.5.11_x64-setup.exe.sig`: `d52ee3354dbb698acddf8fd615831a44fac1998b2e450be63907752b84b3fbef`
- MSI `Pocket DAW_0.5.11_x64_en-US.msi`: `b5a410a9cc8f6e5a4a56f864ed23f8c71954062e4243e7a928a0c655720fb89c`
- MSI Tauri updater signature `Pocket DAW_0.5.11_x64_en-US.msi.sig`: `28c4b72010c68cc66dc99e8ccc23d5c9dfc93818c4c710ab3df06effd6fa7f81`
- Updater setup EXE: `0f5a71de91916af76d46775d34c46bfb3dc2930ce79a44ababb572cb4da1b019`
- Updater manifest: generated as `releases/updater/pocket-daw-latest.json` for the `pocket-daw-v0.5.11-updater-test` release.

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
- Pocket Chordsmith "Send to Pocket DAW" did not work; paste/import fallback remains usable. v0.5.11 moves large handoff payload delivery to a loopback-only installed-app receiver because oversized custom-protocol URLs did not reliably reach the app.

## Current Caveats

- Manual Windows smoke testing is partially run and still tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Pocket Chordsmith direct "Send to Pocket DAW" handoff failed in the 2026-06-14 v0.5.9/v0.5.10 manual runs; retest v0.5.11 before closing the issue.
- Live recording, ASIO support, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
