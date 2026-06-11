# Pocket DAW v0.5.1 Hardening Notes

Date: 2026-06-11

## Scope

This pass hardens v0.5.0 into v0.5.1. It does not try to turn the current export/media scaffolds into final release-grade systems. The focus is overlap-free layout zones, PocketHandoff ingestion, honest export labels, clearer media status, native release scripts and a Pocket Audio Core convergence review.

## Baseline audit

Commands run before code changes:

- `npm install`: passed, 51 packages audited, 0 vulnerabilities.
- `npm test`: passed, 22 test files and 74 tests.
- `npm run build`: passed.
- `npm run package:preview`: passed and wrote `releases/pocket-daw-browser-preview-v0.5.0.zip`.
- `npm run verify:release`: initially failed during `tauri:debug` because `src-tauri/target/debug/pocket-daw.exe` was locked by a running `pocket-daw` process.
- `npm run tauri:debug`: passed after stopping the locked debug executable.

The locked executable was an environment/process issue rather than a compile failure. It is still worth noting because the native debug verifier cannot replace the debug executable while that app is running.

## Adopted fixes

- Bumped app/package/native metadata to `0.5.1`.
- Replaced the app shell's fixed six-row grid with explicit zones: menu, transport, studio, mixer, export, media and import.
- Bounded the mixer as its own scrollable zone so track strips cannot spill into export/media panels.
- Made timeline scrolling grid-based inside the studio zone instead of using a fixed height subtraction.
- Made export, media and import panels use auto-sized rows and responsive grids instead of relying on cramped fixed row heights.
- Added UI smoke coverage for the rendered zone order.
- Added PocketHandoff envelope support for URL query/hash, raw hash envelope, `window.name`, localStorage and legacy `pcs1`, `pcs`, `code` and `import` params.
- Added successful-import cleanup for consumed URL, `window.name` and storage handoff sources.
- Renamed Godot/Web export UI labels to "Manifest Preview" and updated runtime status wording to avoid implying full asset-pack generation.
- Kept stem export described as one WAV download per stem in sequence.
- Expanded Media Pool status labels to distinguish `Available in runtime`, `External unloaded`, `Browser runtime-only`, `Missing`, `Unresolved` and `Project`.
- Added a guarded disabled `Reload Media` scaffold for reloadable external audio items.
- Added `tauri:build` and `verify:native-release`; full native release bundling is opt-in through `--native-release` or `POCKET_DAW_NATIVE_RELEASE=1`.
- Added a small Pocket Audio Core adapter around `RenderedEvent` as a safe convergence point.

## Deferred work

- The `Reload Media` control is disabled in v0.5.1. Native byte reload/relink needs an explicit file-picker/path authorization flow before it should mutate media buffers.
- Godot/Web exports remain JSON manifest previews. They are not zip packs and do not push to Godot yet.
- Stem export still downloads sequential WAV files rather than a single bundled archive.
- Pocket Audio Core replacement/integration is deferred until the actual core package, branch or API contract is present in this checkout.
- Manual native dialog QA is still required in `npm run tauri:dev` or a packaged Windows build before private alpha.

## Verification

Final release commands run for this pass:

- `npm test`: passed, 25 test files and 83 tests.
- `npm run build`: passed.
- `npm run package:preview`: passed and wrote `releases/pocket-daw-browser-preview-v0.5.1.zip`.
- `npm run verify:release`: passed, including native debug build.
- `npm run verify:native-release`: passed, including full Tauri release bundling.

Native artifacts built:

- `src-tauri/target/debug/pocket-daw.exe`
- `src-tauri/target/release/pocket-daw.exe`
- `src-tauri/target/release/bundle/msi/Pocket DAW_0.5.1_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Pocket DAW_0.5.1_x64-setup.exe`

Rendered smoke check through the in-app browser at `http://127.0.0.1:5177/`:

- Page title: `Pocket DAW`.
- DOM contained the Pocket DAW app shell.
- Console warning/error log: empty for the checked tab.
- No Vite/framework error overlay detected.
- Adjacent layout zones reported no overlap for menu/transport, transport/studio, studio/mixer, mixer/export, export/media and media/import.
- Zone heights after final CSS: studio 320px, mixer 276px, media 144px in the 1280x720 viewport, with vertical shell scrolling.
- Interaction proof: the transport `Add Track` button resolved to one control and opened the Add Track modal.
- Browser screenshot capture timed out in the in-app browser backend, so visual evidence is from DOM layout rectangles rather than an attached screenshot.

If `npm run verify:release` or `npm run verify:native-release` fails while replacing `src-tauri/target/debug/pocket-daw.exe`, close the running Pocket DAW debug app and rerun the command.

## Release suitability

v0.5.1 is suitable as a technical preview build. It is close to a private-alpha candidate for trusted testers, but should not be called private alpha until native dialog QA, media relink/reload, bundled game exports and installer/signing expectations are manually verified.
