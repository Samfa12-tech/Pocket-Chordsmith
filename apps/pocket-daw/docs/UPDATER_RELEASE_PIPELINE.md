# Pocket DAW Updater Release Pipeline

Pocket DAW uses the official Tauri v2 updater plugin for installed desktop updates. The app checks a Pocket DAW-specific GitHub Releases manifest:

```text
https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json
```

Do not point the updater at raw git source or unsigned files. The updater manifest must reference signed release artifacts attached to a GitHub Release.

## Signing Keys

Generate Tauri updater signing keys with the Tauri CLI:

```powershell
npm run tauri signer generate -- --write-keys
```

Put the public key in `src-tauri/tauri.conf.json` at:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY"
    }
  }
}
```

The private key must never be committed. Store it outside the repo and provide it only during release builds:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "<private key path or private key contents>"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<private key password if one was set>"
```

## Build Signed Updater Artifacts

Run the normal Tauri release build with signing environment variables present:

```powershell
npm run tauri:build
```

Expected Windows updater artifacts include:

- `Pocket_DAW_<version>_x64-setup.exe`
- `Pocket_DAW_<version>_x64-setup.exe.sig`
- `Pocket DAW_<version>_x64_en-US.msi` if MSI bundling is enabled
- matching `.sig` files for signed MSI updater artifacts if generated
- release notes
- `pocket-daw-latest.json`
- `SHA256SUMS.txt`

The current config uses `bundle.createUpdaterArtifacts = true` and updater Windows `installMode = "passive"`.

## Create `pocket-daw-latest.json`

The updater manifest signature field must contain the contents of the `.sig` file, not a URL to the `.sig` file.

Example for Windows x86_64:

```json
{
  "version": "0.5.9",
  "notes": "Pocket DAW update notes here.",
  "pub_date": "2026-06-13T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENTS_OF_SIG_FILE_HERE_NOT_PATH",
      "url": "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/download/pocket-daw-v0.5.9-updater-test/Pocket_DAW_0.5.9_x64-setup.exe"
    }
  }
}
```

Helper command:

```powershell
npm run release:updater-manifest -- --artifact "releases/updater/Pocket_DAW_0.5.9_x64-setup.exe" --signature "releases/updater/Pocket_DAW_0.5.9_x64-setup.exe.sig" --url "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/download/pocket-daw-v0.5.9-updater-test/Pocket_DAW_0.5.9_x64-setup.exe" --notes "releases/itch/RELEASE_NOTES_v0.5.9.md"
```

This writes:

- `releases/updater/pocket-daw-latest.json`
- `releases/updater/SHA256SUMS.txt`

## Upload to GitHub Releases

Attach these files to the Pocket DAW GitHub Release:

- signed setup executable
- setup executable `.sig`
- optional signed MSI and `.sig`
- `pocket-daw-latest.json`
- `SHA256SUMS.txt`
- release notes

The latest release must expose:

```text
https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json
```

## Test an Update

Do not mark the updater production-ready until this passes on Windows:

1. Install an older signed Pocket DAW build normally.
2. Confirm the older build opens and shows the older version.
3. Create a newer signed GitHub Release with updater artifacts and `pocket-daw-latest.json`.
4. Open the older installed build.
5. Choose Help -> Check for Updates.
6. Confirm the app reports the newer version and release notes.
7. Choose Download and Install.
8. Confirm the updater downloads and installs without requiring a manual itch redownload.
9. Choose Restart Pocket DAW.
10. Confirm the restarted app shows the newer version and projects still open/play/save correctly.

Manual checks remain available. Startup auto-check is enabled for alpha testing, but it must not auto-download or auto-install.
