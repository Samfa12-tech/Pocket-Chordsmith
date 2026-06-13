# Pocket DAW

Pocket DAW is a Windows desktop arrangement and production app for Pocket Chordsmith projects.

Current public status: **alpha testing on itch**, version `0.5.9`.

- Itch page: `https://samfa12.itch.io/pocket-daw`
- Project hub: `https://samfa12.com`
- Updater manifest: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`

## Install For Alpha Testing

1. Download Pocket DAW from itch.
2. Prefer the Windows installer when testing in-app updates.
3. Use the portable Windows ZIP when you want an extract-and-run copy.
4. Launch Pocket DAW and confirm the version shown in the header.
5. Future versions should be tested through `Help -> Check for Updates` or the startup auto-check flow.

Pocket DAW uses signed Tauri updater artifacts from GitHub Releases. The app is not updated from raw git source.

## Local Development

```powershell
npm install
npm test
npm run build
npm run tauri:dev
```

## Release Checks

```powershell
npm run verify:versions
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run verify:itch
```

Release and update docs:

- `docs/ALPHA_TESTING_RELEASE_STATUS.md`
- `docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md`
- `docs/ITCH_RELEASE_CHECKLIST.md`
- `docs/UPDATER_RELEASE_PIPELINE.md`
- `docs/WINDOWS_TESTING_CHECKLIST.md`

## Current Caveats

- This is alpha-testing software, not a finished professional DAW.
- Windows Authenticode signing is not currently claimed unless a release manifest proves it.
- Tauri updater signatures are generated separately as `.sig` files for updater validation.
- Live recording and ASIO support are not complete.
- Manual Windows smoke testing should be recorded against the exact itch/GitHub artifact hash.
