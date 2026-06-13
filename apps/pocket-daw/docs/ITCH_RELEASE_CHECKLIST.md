# Pocket DAW Itch Release Checklist

Pocket DAW v0.5.5 is a free Windows desktop downloadable app. The portable Windows ZIP is the primary itch upload.

## Build And Verify

```powershell
npm ci
npm run verify:itch
```

This produces:

- `releases/itch/pocket-daw-windows-x64-v0.5.5/`
- `releases/itch/pocket-daw-windows-x64-v0.5.5.zip`
- `releases/itch/pocket-daw-release-manifest-v0.5.5.json`
- `releases/itch/CHECKSUMS_SHA256_v0.5.5.txt`
- `releases/itch/FINAL_RELEASE_VERDICT_v0.5.5.md`

## Itch Setup

- Pricing: Free, or Name Your Own Price with $0 minimum if preferred.
- Classification/category: Tool.
- Platform: Windows.
- Release status: In development/public alpha unless manual QA justifies Released.
- Tags: music, daw, midi, songwriting, music-production, game-audio, windows, tauri, tool.
- AI disclosure: creator must fill this honestly before publishing.
- Do not set the page to HTML unless uploading a separate browser preview build.

## Upload Commands

Prefer pushing the portable folder with butler:

```powershell
butler push-preview releases/itch/pocket-daw-windows-x64-v0.5.5 samfa12/pocket-daw:windows-x64
butler push releases/itch/pocket-daw-windows-x64-v0.5.5 samfa12/pocket-daw:windows-x64 --userversion 0.5.5 --hidden
```

Manual browser upload may use `releases/itch/pocket-daw-windows-x64-v0.5.5.zip`.

Optional installer secondary channel:

```powershell
butler push releases/itch/installers/<installer-file-or-folder> samfa12/pocket-daw:windows-installer --userversion 0.5.5 --hidden
```

If the itch slug differs, replace `samfa12/pocket-daw`.

## Gate

Do not publish publicly unless `FINAL_RELEASE_VERDICT_v0.5.5.md` is acceptable and the manual Windows smoke checklist is completed or the caveats are explicitly accepted.
