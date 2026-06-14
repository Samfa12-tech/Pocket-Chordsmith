# Pocket DAW Itch Alpha Release Checklist

Pocket DAW v0.5.9 is live for public Windows alpha testing on itch. It is distributed as an installed Windows app only.

- Itch page: `https://samfa12.itch.io/pocket-daw`
- Current version: `0.5.9`
- Primary channel: `windows-installer`
- Updater endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`

## Build And Verify

```powershell
npm ci
npm run verify:itch
```

This produces installer-focused release metadata:

- `releases/itch/installers/Pocket DAW_0.5.9_x64-setup.exe`
- `releases/itch/installers/Pocket DAW_0.5.9_x64-setup.exe.sig`
- `releases/itch/installers/Pocket DAW_0.5.9_x64_en-US.msi`
- `releases/itch/installers/Pocket DAW_0.5.9_x64_en-US.msi.sig`
- `releases/itch/pocket-daw-release-manifest-v0.5.9.json`
- `releases/itch/CHECKSUMS_SHA256_v0.5.9.txt`
- `releases/itch/FINAL_RELEASE_VERDICT_v0.5.9.md`
- `releases/itch/WINDOWS_SMOKE_CHECKLIST_v0.5.9.md`

Do not upload or document a user-facing portable app.

## Itch Setup

- Pricing: Free, or Name Your Own Price with $0 minimum if preferred.
- Classification/category: Tool.
- Platform: Windows.
- Release status: Alpha testing.
- Tags: music, daw, midi, songwriting, music-production, game-audio, windows, tauri, tool.
- AI disclosure: creator must fill this honestly before publishing.
- Do not set the page to HTML.
- Wording must say Pocket DAW is for arranging, editing and exporting Pocket Chordsmith projects, and is not yet a professional DAW replacement.
- Mention that Windows SmartScreen may appear because Authenticode signing is not currently claimed.
- Mention that Tauri updater `.sig` files are separate from Windows code signing.
- Do not describe the whole repo as fully MIT/open-source; licensing is mixed/source-available unless license files say otherwise.

## Upload Commands

Preview the installer folder with butler:

```powershell
butler push-preview releases/itch/installers samfa12/pocket-daw:windows-installer
```

Hidden installer upload:

```powershell
butler push releases/itch/installers samfa12/pocket-daw:windows-installer --userversion 0.5.9 --hidden
```

If the itch slug differs, replace `samfa12/pocket-daw`.

## Gate

Do not promote beyond alpha testing unless `FINAL_RELEASE_VERDICT_v0.5.9.md` is acceptable and the manual installed-app Windows smoke checklist is completed or the caveats are explicitly accepted.
