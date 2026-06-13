# Pocket DAW v0.5.9 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

## Current Public Build

- Version: `0.5.9`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-x64`
- Optional installer channel: `windows-installer`
- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.5.9-updater-test`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Source commit: `5f67856b91a9155ad805931539719d56938d9b69`

## Current Artifact Hashes

- Portable itch ZIP: `e96d5dfff117a302fef1376c0a9ffa46bba80f4ca046a633dd5c09e189b61a72`
- Portable EXE: `dc9c7914d94177d2fa2f9a768135d81a18fab9c0e4a9e384790b81d918189c65`
- Updater setup EXE: `bd45352218567cb3a9ccf3166a3935c15182c6c53808b1234744858e9a7f9732`
- Updater manifest: `09ab4bd94d4cad96266fc1899d1168ac63ff339b9ebcff14357848143ddd47f1`

## Alpha Testing Guidance

- Use the itch installer build when testing the in-app updater.
- Use the itch portable ZIP for extract-and-run smoke tests.
- Future updates should be tested through the installed app updater, not by manually redownloading every build.
- The app checks GitHub Releases for signed Tauri updater artifacts.
- The app must not be described as complete, professional DAW software, or Authenticode-signed unless verification proves those claims.

## Current Caveats

- Manual Windows smoke testing is still tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Live recording, ASIO support, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
