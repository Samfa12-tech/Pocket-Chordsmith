# Pocket DAW v0.5.13 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

## Current Public Build

- Version: `0.5.13`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-installer`
- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.5.13-updater-test`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Source commit: see the `v0.5.13` GitHub release and generated release manifest.

## Current Artifact Hashes

- Setup EXE `Pocket DAW_0.5.13_x64-setup.exe`: generated from the release artifact.
- Setup EXE Tauri updater signature `Pocket DAW_0.5.13_x64-setup.exe.sig`: generated from the release artifact.
- MSI `Pocket DAW_0.5.13_x64_en-US.msi`: generated from the release artifact.
- MSI Tauri updater signature `Pocket DAW_0.5.13_x64_en-US.msi.sig`: generated from the release artifact.
- Updater setup EXE: generated from the release artifact.
- Updater manifest: generated as `releases/updater/pocket-daw-latest.json` for the `pocket-daw-v0.5.13-updater-test` release.

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
- Pocket Chordsmith "Send to Pocket DAW" woke Pocket DAW in v0.5.11/v0.5.12, but localhost payload delivery still did not arrive in Sam's installed-app run. v0.5.13 adds a downloaded PCS1 handoff-file fallback that Pocket DAW reads from Downloads via a tiny protocol URL.

## Current Caveats

- Manual Windows smoke testing is partially run and still tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Pocket Chordsmith direct "Send to Pocket DAW" handoff failed in the 2026-06-14 v0.5.9/v0.5.10 manual runs and woke without importing in v0.5.11/v0.5.12; retest v0.5.13 before closing the issue.
- Live recording, ASIO support, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
