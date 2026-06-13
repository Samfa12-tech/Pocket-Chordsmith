# Pocket DAW Itch Build, Push, and Updater Test

This document is the operator checklist for publishing a Pocket DAW Windows build to itch, pushing the matching source to GitHub, and then testing the in-app Tauri updater from an installed build.

## Current Alpha Release

- App: Pocket DAW
- Version: `0.5.9`
- Schema version: `2`
- Itch project: `samfa12/pocket-daw`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Public site link: `https://samfa12.com`
- Primary install/update test channel: `windows-installer`
- Portable archive channel: `windows-x64`
- Updater endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`

## Package Requirements for Itch

Pocket DAW is a desktop app. For normal playtesting, the portable ZIP is convenient. For updater testing, use the installer build because Tauri's Windows updater is designed around an installed app.

The itch release should include:

- Portable folder/ZIP for manual download:
  - `releases/itch/pocket-daw-windows-x64-v0.5.9/`
  - `releases/itch/pocket-daw-windows-x64-v0.5.9.zip`
- Installer folder for update testing:
  - `releases/itch/installers/`
  - `Pocket DAW_0.5.9_x64-setup.exe`
  - `Pocket DAW_0.5.9_x64-setup.exe.sig`
  - `Pocket DAW_0.5.9_x64_en-US.msi`
  - matching `.sig` if Tauri generates it
- Release metadata:
  - `CHECKSUMS_SHA256_v0.5.9.txt`
  - `pocket-daw-release-manifest-v0.5.9.json`
  - `RELEASE_NOTES_v0.5.9.md`
  - `README_FIRST_v0.5.9.txt`
  - `KNOWN_LIMITATIONS_v0.5.9.md`
  - `WINDOWS_SMOKE_CHECKLIST_v0.5.9.md`
  - `FINAL_RELEASE_VERDICT_v0.5.9.md`

Do not upload raw source, private signing keys, `.env`, `.pfx`, `node_modules`, `target`, debug symbols, source maps, or local machine paths.

## Signing Requirements

The updater public key is committed in `src-tauri/tauri.conf.json`. The private key must remain outside the repo.

On this machine the private key path is:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.pocket-daw-secrets\tauri-updater.key"
```

No private key password is currently set for this local test key. If a password is added later:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password>"
```

## Build Locally

From `apps/pocket-daw`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.pocket-daw-secrets\tauri-updater.key"
npm run verify:versions
npm test
npm run build
npm run package:preview
npm run package:itch
npm run verify:artifacts
```

`npm run package:itch` builds the Tauri release, writes the portable itch folder/ZIP, stages installer artifacts, generates checksums, and writes the final verdict.

## Push to Itch

Preview the portable folder:

```powershell
butler push-preview releases/itch/pocket-daw-windows-x64-v0.5.9 samfa12/pocket-daw:windows-x64
```

Butler `push-preview` in v15.27.0 does not accept `--userversion`; keep `--userversion` on the actual `push` commands below.

Push portable folder hidden:

```powershell
butler push releases/itch/pocket-daw-windows-x64-v0.5.9 samfa12/pocket-daw:windows-x64 --userversion 0.5.9
```

Push installer folder hidden for updater testing:

```powershell
butler push releases/itch/installers samfa12/pocket-daw:windows-installer --userversion 0.5.9
```

After upload, inspect the itch page and keep the release wording as alpha testing until the manual smoke status justifies stronger wording.

## Push to GitHub

From the repo root:

```powershell
git status --short
git add apps/pocket-daw
git commit -m "Add Pocket DAW updater release path"
git push origin main
```

The GitHub commit should match the source used to produce the itch artifacts.

## First Update Test Plan

After this build is uploaded:

1. Start from an installed Pocket DAW `0.5.9` build.
2. Confirm it opens normally.
3. Open Pocket DAW.
4. Confirm Help -> Check for Updates opens the updater panel.
5. Confirm it reports the next Pocket DAW version after the GitHub Release and `pocket-daw-latest.json` are live.
6. Build future update-test patches with the same updater private key.
7. Generate a GitHub updater manifest for the next patch, for example:

```powershell
npm run release:updater-manifest -- --artifact "releases/updater/Pocket_DAW_0.5.10_x64-setup.exe" --signature "releases/updater/Pocket_DAW_0.5.10_x64-setup.exe.sig" --url "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/download/pocket-daw-v0.5.10-updater-test/Pocket_DAW_0.5.10_x64-setup.exe" --notes "releases/itch/RELEASE_NOTES_v0.5.10.md"
```

8. Create a GitHub Release such as `pocket-daw-v0.5.10-updater-test`.
9. Upload:
    - setup exe
    - setup exe `.sig`
    - optional MSI and `.sig`
    - `pocket-daw-latest.json`
    - `SHA256SUMS.txt`
    - release notes
10. Reopen the installed `0.5.9` build.
11. Use Help -> Check for Updates, or wait for the startup auto-check.
12. Download and install the update from inside Pocket DAW.
13. Restart Pocket DAW.
14. Confirm the app reports the new version and normal project open/save/playback still works.

Do not mark the updater production-ready until an installed older build updates successfully to a newer signed GitHub Release build on Windows.
