# Pocket DAW vX.Y.Z - Free Windows Itch Release

## Download

- Primary download: portable Windows ZIP.
- Optional downloads: NSIS/MSI installers, only if generated and verified.
- Checksums: use `CHECKSUMS_SHA256_vX.Y.Z.txt`.
- Manifest: use `pocket-daw-release-manifest-vX.Y.Z.json`.

## What Changed

- 

## Install

1. Download the Windows ZIP.
2. Extract the ZIP.
3. Run `Pocket DAW.exe`.
4. If Windows SmartScreen appears on an unsigned build, only run it if you trust the download and verified the checksum.

## Signing

- Signature status:
- SmartScreen/unsigned warning expected:

Do not claim the app is signed unless verification proves it.

## Smoke Status

- Automated tests:
- Artifact verification:
- Windows manual smoke: NOT RUN / PASSED / FAILED
- Artifact hash tested:

## Known Limitations

- No live recording yet unless implemented.
- No ASIO backend yet.
- Imported audio decode/streaming remains limited.
- Godot/web exports are manifest previews unless full asset packs are implemented.
- Stem export limitations:
- Native cache hydration status:
- Automation limitations:
- Send/return limitations:
- No claim of professional DAW completeness.

## Butler Commands

```powershell
butler push-preview releases/itch/pocket-daw-windows-x64-vX.Y.Z samfa12/pocket-daw:windows-x64
butler push releases/itch/pocket-daw-windows-x64-vX.Y.Z samfa12/pocket-daw:windows-x64 --userversion X.Y.Z --hidden
```

Do not publish from automation without separate manual approval.
