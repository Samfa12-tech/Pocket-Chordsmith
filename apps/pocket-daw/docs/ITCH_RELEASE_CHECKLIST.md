# Pocket DAW Itch Alpha Release Checklist (Historical v0.5.9)

Historical note: this checklist records the original `v0.5.9` full-installer itch release path. It is not the current release procedure and must not be used to publish a new Pocket DAW build. For current release truth and candidate packaging status, use `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md`.

Pocket DAW v0.5.9 was distributed as an installed Windows app only.

- Itch page: `https://samfa12.itch.io/pocket-daw`
- Historical version: `0.5.9`
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

## Historical Upload Commands

These commands are retained only to explain the old full-installer flow. Do not run them for a current release without first updating the checkpoint version and following the current release-status docs.

```powershell
butler push-preview releases/itch/installers samfa12/pocket-daw:windows-installer
```

Historical installer upload:

```powershell
butler push releases/itch/installers samfa12/pocket-daw:windows-installer --userversion 0.5.9
```

If the itch slug differs, replace `samfa12/pocket-daw`.

## Historical Gate

Do not promote beyond alpha testing unless `FINAL_RELEASE_VERDICT_v0.5.9.md` is acceptable and the manual installed-app Windows smoke checklist is completed or the caveats are explicitly accepted.
