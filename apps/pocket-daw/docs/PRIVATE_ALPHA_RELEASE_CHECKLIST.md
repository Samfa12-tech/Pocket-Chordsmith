# Pocket DAW Public Free Itch Release Checklist

This file replaces the older private-alpha checklist. Pocket DAW v0.5.6 is prepared as a free Windows desktop itch release candidate.

## Required Before Upload

- `npm ci`
- `npm run verify:versions`
- `npm test`
- `npm run build`
- `npm run package:preview`
- `cargo test` from `src-tauri` when Rust is available
- `npm run package:itch`
- `npm run verify:artifacts`
- Manual Windows smoke checklist completed against the exact portable ZIP hash, or the final verdict remains `GO WITH CAVEATS` / `NO-GO`

## Artifact Rules

- Primary itch artifact is the portable folder/ZIP: `releases/itch/pocket-daw-windows-x64-v0.5.6`.
- The portable ZIP must contain `Pocket DAW.exe` at the root with README, release notes, limitations, license/freeware notice and checksums.
- The ZIP must not be just an installer.
- NSIS/MSI installers are optional secondary downloads only.
- Browser preview ZIPs are not the main itch target.

## Signing

- Do not claim the app is signed unless signature verification records `signed`.
- If signing is required for a release gate, set `POCKET_DAW_REQUIRE_SIGNING=1` before `npm run verify:artifacts`.
- Do not commit `.pfx`, `.p12`, `.pem`, `.key`, secrets or signing credentials.

## Upload Commands

Preview only:

```powershell
butler push-preview releases/itch/pocket-daw-windows-x64-v0.5.6 samfa12/pocket-daw:windows-x64
```

First hidden upload:

```powershell
butler push releases/itch/pocket-daw-windows-x64-v0.5.6 samfa12/pocket-daw:windows-x64 --userversion 0.5.6 --hidden
```

Optional installer secondary channel:

```powershell
butler push releases/itch/installers/<installer-file-or-folder> samfa12/pocket-daw:windows-installer --userversion 0.5.6 --hidden
```

Do not run upload commands from automation unless a separate manual action explicitly instructs it. `npm run itch:push:hidden` refuses to upload unless `PUBLISH=1` is set.

## Do Not Package

- `.git`
- `.env`
- `node_modules`
- `target`
- source files
- source maps
- debug symbols
- logs
- private certificates or keys
- local test projects or user media
- absolute local machine paths in release text files
