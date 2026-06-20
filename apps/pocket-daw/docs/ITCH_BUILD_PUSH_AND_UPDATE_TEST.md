# Pocket DAW Itch Build, Push, and Updater Rehearsal

This is the operator checklist for publishing Pocket DAW as a free installed Windows alpha, pushing the matching source to GitHub, and rehearsing the in-app Tauri updater from an installed build.

Current policy: normal Pocket DAW app checkpoints ship through GitHub Releases and the in-app Tauri updater. Itch should host the stable bootstrapper/downloader and only needs a new upload when the bootstrapper itself changes.

## Current Alpha Release

- App: Pocket DAW
- Version: `0.6.19`
- Schema version: `2`
- Itch project: `samfa12/pocket-daw`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Public site link: `https://samfa12.com`
- Primary install/update test channel: `windows-installer`
- Updater endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Bootstrapper endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-bootstrapper-latest.json`
- Setup EXE: `Pocket.DAW_0.6.19_x64-setup.exe`
- MSI: `Pocket.DAW_0.6.19_x64_en-US.msi`

Pocket DAW is installed-app only. Do not publish or test a user-facing portable app workflow.

## Package Requirements for Itch

Normal itch upload:

- Bootstrapper upload folder:
  - `releases/itch-bootstrapper/upload/`
  - `Pocket_DAW_Itch_Bootstrapper_v<version>.exe`
  - `README_FIRST.txt`
  - `CHECKSUMS_SHA256.txt`

The bootstrapper fetches `pocket-daw-bootstrapper-latest.json`, downloads the latest setup EXE from GitHub Releases, verifies SHA-256, and launches the verified installer.

Manual fallback only:

The old full-installer itch release path still stages installer artifacts and release metadata for emergencies:

- Installer upload folder:
  - `releases/itch/installers/`
  - `Pocket DAW_0.5.13_x64-setup.exe`
  - `Pocket DAW_0.5.13_x64-setup.exe.sig`
  - `Pocket DAW_0.5.13_x64_en-US.msi`
  - `Pocket DAW_0.5.13_x64_en-US.msi.sig`
  - `CHECKSUMS_SHA256.txt`
  - release notes, limitations, license/freeware notice and installed-app smoke checklist
- Release metadata:
  - `CHECKSUMS_SHA256_v0.5.13.txt`
  - `pocket-daw-release-manifest-v0.5.13.json`
  - `RELEASE_NOTES_v0.5.13.md`
  - `README_FIRST_v0.5.13.txt`
  - `KNOWN_LIMITATIONS_v0.5.13.md`
  - `WINDOWS_SMOKE_CHECKLIST_v0.5.13.md`
  - `FINAL_RELEASE_VERDICT_v0.5.13.md`

Do not upload raw source, private signing keys, `.env`, `.pfx`, `node_modules`, `target`, debug symbols, source maps, local machine paths, standalone `Pocket DAW.exe`, or a user-facing app archive.

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

Windows Authenticode signing is separate from Tauri updater signatures. SmartScreen may appear unless the installer is Authenticode-signed.

## Build Locally

From `apps/pocket-daw`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.pocket-daw-secrets\tauri-updater.key"
npm run verify:versions
npm test
npm run build
npm run release:update:full
npm run package:itch-bootstrapper
npm run verify:itch-bootstrapper
```

`npm run release:update:full` builds and verifies the Tauri updater package. `npm run package:itch-bootstrapper` builds the small itch downloader. `npm run package:itch` remains available for the manual full-installer fallback.

## Push to Itch

Preview the bootstrapper folder:

```powershell
butler push-preview releases/itch-bootstrapper/upload samfa12/pocket-daw:windows-installer
```

Butler `push-preview` in v15.27.0 does not accept `--userversion`; keep `--userversion` on the actual `push` command below.

Push the bootstrapper folder to the public installed-app channel only when the bootstrapper changed:

```powershell
$env:PUBLISH = "1"
npm run itch:push:bootstrapper
```

After upload, inspect the itch page and keep the release wording as alpha testing. The v0.5.13 handoff/update smoke evidence is recorded in `docs/WINDOWS_TESTING_CHECKLIST.md`; broader Windows QA remains partial.

## Push to GitHub

From the repo root:

```powershell
git status --short
git add apps/pocket-daw
git commit -m "Harden Pocket DAW installed alpha release"
git push origin main
```

The GitHub commit should match the source used to produce the itch artifacts.

## Updater Rehearsal Checklist

Do not mark the updater production-ready until this passes on Windows:

1. Install the current public Pocket DAW version normally from the setup EXE or MSI.
2. Publish or stage the next signed version on GitHub Releases.
3. Open the installed current app.
4. Use Help -> Check for Updates, or wait for startup auto-check.
5. Confirm the update manifest is reachable and reports the staged newer version.
6. Download and install the update from inside Pocket DAW.
7. Relaunch Pocket DAW.
8. Verify the visible version changed.
9. Verify a project saved by the previous version still opens, plays and saves.

Generate a GitHub updater manifest for the next patch, for example:

```powershell
npm run release:updater-manifest -- --artifact "releases/updater/Pocket_DAW_0.5.13_x64-setup.exe" --signature "releases/updater/Pocket_DAW_0.5.13_x64-setup.exe.sig" --url "https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/download/pocket-daw-v0.5.13-updater-test/Pocket_DAW_0.5.13_x64-setup.exe" --notes "releases/itch/RELEASE_NOTES_v0.5.13.md"
```

Upload to the GitHub Release:

- setup EXE
- setup EXE `.sig`
- optional MSI and `.sig`
- `pocket-daw-latest.json`
- `SHA256SUMS.txt`
- release notes

Do not invent a successful updater result. Record it in the checklist only after the installed app updates and relaunches successfully.
