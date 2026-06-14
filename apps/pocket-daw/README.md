# Pocket DAW

Pocket DAW is a Windows desktop arrangement and production app for Pocket Chordsmith projects.

Current public status: **alpha testing on itch**, version `0.5.11`.

- Itch page: `https://samfa12.itch.io/pocket-daw`
- Project hub: `https://samfa12.com`
- Updater manifest: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`

## Install For Alpha Testing

1. Download Pocket DAW from itch.
2. Run the Windows setup EXE, or use the MSI if that is better for your Windows environment.
3. Launch Pocket DAW from the Start Menu or installed shortcut.
4. Confirm the version/build information in the About/Diagnostics panel.
5. Future versions should be tested through `Help -> Check for Updates` or the startup auto-check flow.

Pocket DAW is installed-app only for public alpha testing. Do not document, test, or publish a user-facing portable/extract-and-run app workflow. ZIPs, if any are generated later, are release/upload containers for installer artifacts only.

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
- Live recording, ASIO, full send/return processing, bundled game export packs and advanced pro DAW features are future work unless a later release explicitly says otherwise.
- Windows Authenticode signing is not currently claimed unless a release manifest proves it.
- Tauri updater signatures are generated separately as `.sig` files for updater validation.
- Windows SmartScreen may appear because the public alpha is not currently claimed as Authenticode-signed.
- The wider repo has mixed licensing/source-available boundaries; do not describe the whole repo as fully MIT/open-source unless the license files explicitly support that.
- Manual Windows smoke testing should be recorded against the exact itch/GitHub artifact hash.
