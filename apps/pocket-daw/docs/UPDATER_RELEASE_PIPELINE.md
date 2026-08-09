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
npm run release:prepare
```

This runs every source gate once, builds/signs the Windows installers once, packages and verifies once, stages updater files, and writes an immutable candidate receipt. It does not upload to itch or GitHub.

For a full pre-public gate before an intentional checkpoint release, run:

```powershell
npm run release:prepare
```

`release:update` and `release:update:full` are safe aliases for this same complete pass. `verify:itch` is deprecated to it.

Same-version restaging is retired: `release:update:fast` fails without touching
artifacts. Release-note or manifest changes are package-producing changes and
require a new version and prepare receipt.

The normal exact-artifact checkpoint procedure is documented in
`RELEASE_TESTING_FAST_PATH.md`: build and stage once, smoke that setup EXE,
verify the candidate, then create the GitHub release from the already-staged
files without running another build.

After evidence-only `verify:candidate` writes its verification report, publish
the frozen candidate without a build or restage:

```powershell
$env:PUBLISH = "1"
npm run release:publish-exact -- --receipt <candidate-receipt.json> --verification-report <candidate-verification.json>
```

This re-hashes the receipt, all staged assets, and all evidence bound by the
verification report; creates the GitHub release at the receipt commit; then
verifies the live manifest and remote installer hash. The legacy
`release:update:publish` command is a safe alias for this exact-only path.

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

Before installed smoke, use the bundled one-pass release gate from
`apps/pocket-daw/`. Do not add separate duplicates of tests already run by the
guarded scripts:

```powershell
npm run release:prepare
```

After the candidate installer exists, validate the exact smoke attestation plus the installed punch/take-lane and media-portability summaries:

```powershell
npm run verify:smoke-attestation -- --attestation <path-to-smoke-attestation.json> --installer <setup.exe> --commit <full-source-sha>
npm run verify:installed:punch-takes -- --summary <punch-take-lane-installed-smoke-summary.json> --installer <setup.exe>
npm run smoke:installed:media-portability -- --installer <setup.exe> --require-installer
npm run verify:installed:media-portability -- --summary <installed-media-portability-smoke-summary.json> --installer <setup.exe> --require-installer
```

For a hardware-backed punch/take-lane candidate, pass the strict summary gates through the full candidate verifier. The command below is fresh-audible mode. When `RELEASE_TESTING_FAST_PATH.md` permits baseline reuse, omit `--require-audible-audio` and supply both exact `--audio-capture-baseline-attestation` and `--audio-capture-baseline-installer` paths instead. When that fast path permits the separately bound `manual-fresh-audible` mode, omit `--require-audible-audio` and supply `--manual-fresh-audible-evidence <manual-report.json>`. Export files and connected MIDI remain mandatory in all three modes:

```powershell
npm run smoke:installed:punch-takes -- --installer <setup.exe> --record-ms 10000 --midi-record-ms 10000 --require-audible-audio --require-midi-input --require-export-files
npm run smoke:installed:media-portability -- --installer <setup.exe> --require-installer
npm run verify:candidate -- --receipt <candidate-receipt.json> --attestation <path-to-smoke-attestation.json> --punch-take-summary <punch-take-lane-installed-smoke-summary.json> --media-portability-summary <installed-media-portability-smoke-summary.json> --vst3-host-summary <installed-vst3-host-smoke-summary.json> --require-audible-audio --require-export-files --require-midi-input --game-pack <pack.zip> --kind <godot-adaptive-pack|web-game-pack>
```

Guarded publication requires the immutable receipt and candidate-verification
report; it does not rebuild or reinterpret environment-bound evidence.

The standalone punch/take summary verifier checks the installer SHA-256 and accepts the known Pocket DAW setup filename normalization between local `Pocket DAW_...` NSIS artifacts and staged `Pocket.DAW_...` release assets. Archived standalone summaries may legitimately point at deleted temp export folders, but the candidate and publish verifiers now always require retained on-disk WAV/MIDI exports and connected MIDI input for the current exact installer. Strict export-file mode requires WAV sample data and parses the MIDI file bytes for active/inactive take-lane sentinel pitches. Strict MIDI-input mode requires a saved active punched MIDI input take with captured note pitches, matching capture/punch bars, punch mode metadata and take-lane placement evidence.

Use the tracked `scripts/send-loopmidi-smoke.ps1` sender for connected MIDI
input. Quote its full path when passing it to background PowerShell because the
repository path contains spaces. Start the installed app first, wait for its
bridge, start the sender, then use the proven ten-second audio and MIDI phases.
Do not shorten the first phase: a short phase can leave transport before the
punch window and create a zero-note lane even though loopMIDI is connected.

The media-portability smoke creates external WAV fixtures, collects and strictly saves them, deletes the original source folder, moves the complete project folder, reopens/reloads both assets, proves decoded-cache recovery remains cache-only, relinks/recollects the missing source, deletes the replacement source, reopens again, and writes WAV, stem ZIP, section-loop ZIP, Godot and Web packs. Its verifier binds installer filename/hash when `--require-installer` is used and re-hashes every retained evidence/export file. The smoke attestation separately requires the portability summary, game-pack ZIP evidence, and a Godot target-import report; notes such as `not run` or `waiver` cannot satisfy a pass attestation.

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
