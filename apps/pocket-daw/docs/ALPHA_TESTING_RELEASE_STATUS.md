# Pocket DAW v0.5.13 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

This file records the last completed public installed-release artifact set. Current source target is `0.6.0` recording alpha; do not reuse the v0.5.13 hashes for a v0.6.0 installer.

## Current Public Build

- Version: `0.5.13`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-installer`
- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.5.13-updater-test`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Source commit: see the `v0.5.13` GitHub release and generated release manifest.

## Current Artifact Hashes

- Setup EXE `Pocket DAW_0.5.13_x64-setup.exe`: `f5c28e1280598cd5f0bd61258a6102affa08c9bd99b0a9706cec08eda7f87233`
- Setup EXE Tauri updater signature `Pocket DAW_0.5.13_x64-setup.exe.sig`: `82277a2eb50f886b625e511816aa7e80ca06f1e3f9781eb53ced3508dfc2dedd`
- MSI `Pocket DAW_0.5.13_x64_en-US.msi`: `49861de4120c9338deb342984299af8b3d87769dccb860aa7d3f24aa2002ad81`
- MSI Tauri updater signature `Pocket DAW_0.5.13_x64_en-US.msi.sig`: `1478c20ec209952e4a14a86ac95f857f2d09961087039ec7f2a8ad819047633f`
- Updater setup EXE: `f5c28e1280598cd5f0bd61258a6102affa08c9bd99b0a9706cec08eda7f87233`
- Updater manifest: `f60cf66954a840296e6109a8f5a27b4b1f0c6536cdbf004ebc6849291ff901fa`

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
- Updater rehearsal from v0.5.10 onward succeeded through Help -> Check for Updates; v0.5.13 is now served by the GitHub updater manifest.
- Pocket Chordsmith "Send to Pocket DAW" now succeeds in the installed v0.5.13 app after hard-refreshing Chordsmith; Pocket DAW opens/imports through the downloaded PCS1 handoff-file fallback.
- WAV export completed successfully for `C:\Users\sam_s\Downloads\imported-chordsmith-project.wav`.
- MIDI export completed to `C:\Users\sam_s\Downloads\imported-chordsmith-project.mid`; Codex structural inspection found 6 parseable tracks, 869 note-on events with matching note-offs, 4/4 time signature and clean end-of-track markers. It still needs a real MIDI-player/DAW playback check.

## Current Caveats

- Manual Windows smoke testing is partially run and still tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Pocket Chordsmith direct "Send to Pocket DAW" is passing in the v0.5.13 installed-app smoke run; keep paste/import as a fallback for browsers that block downloads or custom protocol launches.
- v0.5.14 source changes fixed Chordsmith BPM/new-project import semantics, MIDI import/export structure, About/Diagnostics placement and update-available notification behavior, but those fixes still require installed artifact verification when publishing a newer public release.
- v0.6.0 source changes add a narrow installed-app mono recording alpha: one armed live track, monitor toggle, metronome/count-in and project-media WAV take creation. Installed Windows recording smoke remains Manual / Not run until a v0.6.0 installer is built and tested.
- ASIO support, simultaneous multitrack recording, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
