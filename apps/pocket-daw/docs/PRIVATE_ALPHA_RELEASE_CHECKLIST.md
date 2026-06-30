# Pocket DAW Private/Public Alpha Release Checklist

Pocket DAW public alpha distribution is installer-only.

Current release truth lives in `release-status.json` and generated `docs/CURRENT_RELEASE_STATUS.md`. The versioned artifact names below are historical examples from the old full-installer itch flow; do not publish a current build from this checklist without first bumping the checkpoint metadata and recording exact-artifact smoke evidence.

## Release Gate

- Package/version/Tauri/Cargo versions match.
- `npm test` passes.
- `npm run build` passes.
- `npm run package:itch` generates setup/MSI installer artifacts and `.sig` updater signatures.
- `npm run verify:artifacts` passes.
- Manual Windows installed-app smoke checklist is completed against the exact installer hash, or the final verdict remains `GO WITH CAVEATS` / `NO-GO`.
- SmartScreen/AuthentiCode status is documented honestly.
- Tauri updater `.sig` files are documented separately from Windows code signing.

## Historical Full-Installer Artifact Expectations

- Historical fallback itch artifact folder: `releases/itch/installers/`.
- Setup EXE: `Pocket DAW_0.5.9_x64-setup.exe`.
- Setup EXE updater signature: `Pocket DAW_0.5.9_x64-setup.exe.sig`.
- MSI: `Pocket DAW_0.5.9_x64_en-US.msi`.
- MSI updater signature: `Pocket DAW_0.5.9_x64_en-US.msi.sig`.
- Root release metadata includes checksum, release manifest, release notes, known limitations, installed-app smoke checklist and final verdict.

Do not package standalone `Pocket DAW.exe` or a public app archive as a release channel.

## Historical Upload Commands

These commands are retained for emergency full-installer fallback context only. Normal public checkpoints use GitHub updater releases plus the itch bootstrapper unless the bootstrapper itself changes.

Preview:

```powershell
butler push-preview releases/itch/installers samfa12/pocket-daw:windows-installer
```

Historical installer upload:

```powershell
butler push releases/itch/installers samfa12/pocket-daw:windows-installer --userversion 0.5.9
```

## Updater Rehearsal

1. Install the current public version normally.
2. Stage or publish the next signed version on GitHub Releases.
3. Open the installed current app.
4. Check for updates.
5. Download/install the update.
6. Relaunch.
7. Verify the version changed.
8. Verify a previous project still opens.

Do not record updater success until the installed app actually updates and relaunches on Windows.
