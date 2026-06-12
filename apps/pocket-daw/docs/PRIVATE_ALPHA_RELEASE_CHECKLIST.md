# Pocket DAW Private Alpha Release Checklist

Use this checklist when preparing a trusted Windows private-alpha build. Do not publish a public release from this checklist alone.

## Version Source Of Truth

- `package.json` version
- `src/daw/schema.ts` `POCKET_DAW_VERSION`
- `src-tauri/Cargo.toml` package version
- `src-tauri/tauri.conf.json` app version
- Release notes and verification docs under `docs/`

All version fields should match before packaging.

## Build Commands

```powershell
cd "C:\Users\sam_s\Documents\Pocket Chordsmith\apps\pocket-daw"
npm test
npm run build
npm run verify:release
npm run verify:native-release
```

`verify:release` runs tests, production build, browser preview packaging and a Tauri debug build. `verify:native-release` opts into full native bundling and should be used only when preparing a candidate installer.

Pocket DAW itch uploads must use the native/installable output only. Do not publish the browser preview zip, `dist/`, or an HTML5/WebAudio channel for Pocket DAW.

## Expected Outputs

- Local browser preview only, never itch: `releases/pocket-daw-browser-preview-v0.5.2.zip`
- Debug app: `src-tauri/target/debug/pocket-daw.exe`
- Windows installer: `src-tauri/target/release/bundle/nsis/Pocket DAW_0.5.2_x64-setup.exe`
- MSI if produced: `src-tauri/target/release/bundle/msi/Pocket DAW_0.5.2_x64_en-US.msi`

Generated outputs must not be committed.

## Checksums

PowerShell:

```powershell
Get-FileHash "src-tauri\target\release\bundle\nsis\Pocket DAW_0.5.2_x64-setup.exe" -Algorithm SHA256
Get-FileHash "src-tauri\target\release\bundle\msi\Pocket DAW_0.5.2_x64_en-US.msi" -Algorithm SHA256
```

Node cross-platform:

```powershell
node -e "const{createHash}=require('crypto');const{readFileSync}=require('fs');for(const f of process.argv.slice(1)){console.log(createHash('sha256').update(readFileSync(f)).digest('hex'), f)}" "path\to\artifact"
```

## Manual QA

- Complete `WINDOWS_TESTING_CHECKLIST.md`.
- Confirm `v0.5.2` displays in the app.
- Export diagnostics during packaged playback and confirm `audio.playbackBackend` is `native-cpal`.
- Stress playback by scrolling, dragging mixer controls and editing Chordsmith steps; do not accept a build that falls back to Web Audio for generated playback in the installed app.
- Confirm `.pocketdaw` save/open and Save As paths.
- Import audio and MIDI from real folders.
- Reopen the project and confirm media status is honest.
- Export full WAV, MIDI, stems, section manifest, Godot manifest and web manifest.
- Export diagnostics and attach it to any tester bug report.

## Known Limitations To Disclose

- No real recording yet.
- Native relink/copy media is not enabled; collect-media plan export is available.
- Game packs are deterministic manifests plus current renderable assets, not bundled ZIP packs.
- Unsigned installers may trigger Windows warnings.
- Browser preview cannot persist local file paths and must not be used for itch distribution.

## Rollback

- Keep the prior installer and SHA-256 in the private-alpha channel.
- If the new installer fails launch/save/open tests, remove it from the channel and restore the previous package.
- Keep tester project files; do not overwrite user `.pocketdaw` saves during rollback.

## Do Not Commit

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `releases/*.zip`
- installers, MSI files, Playwright reports, traces or local `.pocketdaw` saves
