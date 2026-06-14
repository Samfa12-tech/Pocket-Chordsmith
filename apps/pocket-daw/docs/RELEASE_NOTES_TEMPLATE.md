# Pocket DAW vX.Y.Z - Free Windows Alpha

## Download

- Primary download: Windows installer.
- Expected installer artifacts: setup EXE, setup EXE `.sig`, MSI if generated, MSI `.sig` if generated.
- Checksums: use `CHECKSUMS_SHA256_vX.Y.Z.txt`.
- Manifest: use `pocket-daw-release-manifest-vX.Y.Z.json`.

Pocket DAW is installed-app only. Do not document a public portable/extract-and-run app workflow.

## What Changed

-

## Install

1. Download the Windows installer.
2. Run the setup EXE, or use the MSI if that is better for your Windows environment.
3. Launch Pocket DAW from the Start Menu or installed shortcut.
4. If Windows SmartScreen appears on an unsigned build, only run it if you trust the download and verified the checksum.

## Signing

- Windows Authenticode signature status:
- SmartScreen/unsigned warning expected:
- Tauri updater `.sig` files present:

Tauri updater signatures are separate from Windows code signing. Do not claim the app is Authenticode-signed unless verification proves it.

## Smoke Status

- Automated tests:
- Artifact verification:
- Windows installed-app manual smoke: NOT RUN / PASSED / FAILED
- Installer hash tested:

## Known Limitations

- Live recording status: if this is v0.6.0 or later, describe the installed-app mono recording alpha; otherwise say no live recording yet.
- No ASIO backend yet.
- Imported audio decode/streaming remains limited.
- Full send/return processing remains incomplete unless implemented.
- Godot/web exports are manifest previews unless full asset packs are implemented.
- Stem export limitations:
- Native cache hydration status:
- Automation limitations:
- No claim of professional DAW completeness.

## Public Wording

Pocket DAW is a free Windows alpha for arranging, editing and exporting Pocket Chordsmith projects. It is not yet a professional DAW replacement. The v0.6.0 recording alpha is one installed-app mono track only. ASIO, simultaneous multitrack recording, full send/return processing, full bundled game export packs and advanced pro DAW features are future work unless this release explicitly implements them.

The repo has mixed licensing/source-available boundaries; do not describe the whole repo as fully MIT/open-source unless the license files explicitly support that.

## Butler Commands

```powershell
butler push-preview releases/itch/installers samfa12/pocket-daw:windows-installer
butler push releases/itch/installers samfa12/pocket-daw:windows-installer --userversion X.Y.Z
```

Do not publish from automation without separate manual approval.
