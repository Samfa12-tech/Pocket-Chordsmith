# Pocket DAW Updater Release Pipeline

Pocket DAW uses the official Tauri v2 updater plugin for installed desktop updates. The app checks a Pocket DAW-specific GitHub Releases manifest:

```text
https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json
```

Do not point the updater at raw git source or unsigned files. The updater manifest must reference signed release artifacts attached to a GitHub Release.

## Future Distribution Direction

The intended long-term itch role is a stable Pocket DAW downloader/installer package rather than a manually redownloaded app for every patch. Testers should be able to install from itch once, then move to the newest signed build through the in-app Tauri updater served from GitHub Releases. Keep the itch installer channel healthy as the bootstrap path, but prefer GitHub/Tauri auto-update for routine version-to-version movement.

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

On the local Windows release machine, the project can load the updater signing key through:

```powershell
npm run signing:check
npm run tauri:build:installers
npm run package:itch
```

The helper reads `.env.tauri-signing.local` when present, accepts `TAURI_SIGNING_PRIVATE_KEY` key contents or `TAURI_SIGNING_PRIVATE_KEY_FILE`, then falls back to:

```text
%USERPROFILE%\.pocket-daw-secrets\tauri-updater.key
```

`.env.tauri-signing.local` is ignored by git. Do not commit the private key or a file containing private key contents. `package:itch` builds installers with Tauri's built-in updater signing disabled, then signs the generated EXE/MSI updater artifacts directly with the local private key and an explicit empty password argument.

## Efficient Updater Package Commands

Use accumulated DAW release checkpoints by default. Do not bump/publish a new public updater version for every local change unless the fix is urgent enough for testers immediately.

Release frequency policy:

- Keep ordinary DAW fixes and feature work local until they form a coherent tester slice.
- Use local signed packages for private validation without publishing a new updater version.
- Publish public updater versions for deliberate checkpoints, not every commit or small patch.
- Allow immediate hotfix releases only for urgent blockers such as launch failure, broken updater flow, project save/open corruption, or a major unusable audio path.
- Keep unreleased notes as "next build pending" until the checkpoint is intentionally packaged and published.

For a normal local signed updater package, run:

```powershell
npm run release:update
```

This verifies version and native sound recipe sync, builds/signs the Windows installers once, packages the itch installer folder, verifies release artifacts, copies the updater files into `releases/updater/`, and writes `pocket-daw-latest.json` plus `SHA256SUMS.txt`. It does not upload to itch or GitHub.

For a full pre-public gate before an intentional checkpoint release, run:

```powershell
npm run release:update:full
```

This adds `npm test` and `cargo test`, then builds/signs the installers once. It replaces the older manual habit of running a full gate and then repeating build/package/copy/manifest steps by hand.

For release-note or manifest-only rehearsal using existing signed installers for the same version, run:

```powershell
npm run release:update:fast
```

The fast path reuses existing version-matched installers and is blocked from publishing. Use it only when the native app binary has not changed.

For an intentional public release after deciding the accumulated slice should go out:

```powershell
$env:PUBLISH = "1"
npm run release:update:publish
```

This runs the full gate, packages/stages the updater files, pushes the itch installer channel, creates the GitHub release, then verifies the live updater manifest, release asset hash and butler channel status. It refuses to publish if `PUBLISH=1` is not set, if `--fast` is used, or if the GitHub release tag already exists.

Current itch policy is bootstrapper-first: GitHub Releases host the signed updater installers and manifests, while the itch `windows-installer` channel hosts `releases/itch-bootstrapper/upload/`. That upload contains the bootstrapper EXE, README, checksums, and an `index.html` fallback so itch browser-mode requests do not fail with `asset not found: index.html`. Use the full installer itch package only as a manual fallback.

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

Do not mark an updater checkpoint production-ready until this passes on Windows against exact artifacts.

Before publishing or staging the candidate, run the release gate from `apps/pocket-daw/`:

```powershell
npm run verify:versions
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run release:update:full
```

After the candidate installer exists, validate the exact smoke attestation:

```powershell
npm run verify:smoke-attestation -- --attestation <path-to-smoke-attestation.json> --installer <setup.exe> --commit <full-source-sha>
```

Manual update-through-app smoke:

1. Install an older signed Pocket DAW build normally.
2. Confirm the older build opens and shows the older version.
3. Create or stage a newer signed GitHub Release with updater artifacts and `pocket-daw-latest.json`.
4. Open the older installed build.
5. Choose Help -> Check for Updates.
6. Confirm the app reports the newer version and release notes.
7. Choose Download and Install.
8. Confirm the updater downloads and installs without requiring a manual itch redownload.
9. Choose Restart Pocket DAW.
10. Confirm the restarted app shows the newer version/build metadata.
11. Open a `.pocketdaw` saved before the update.
12. Confirm the project opens, plays, saves, and reopens after the update.
13. Record the old version, new version, source commit, installer filename, installer SHA-256, updater manifest URL, release tag, smoke attestation path, tester, date, and result in `docs/WINDOWS_TESTING_CHECKLIST.md` or the generated release-status evidence.

Manual checks remain available. Startup auto-check is enabled for alpha testing, but it must not auto-download or auto-install.
