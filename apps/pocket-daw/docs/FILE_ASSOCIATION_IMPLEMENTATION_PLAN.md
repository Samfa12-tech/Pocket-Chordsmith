# Pocket DAW File Association Implementation Plan

Date: 2026-06-28

This plan covers the Windows `.pocketdaw` double-click and Open With work tracked by the deep-audit Wave 2 file-association tasks.

## Current Wiring

- `src-tauri/tauri.conf.json` already declares a bundled file association for `pocketdaw` with the `Pocket DAW Project` description.
- `src-tauri/Cargo.toml` includes `tauri-plugin-single-instance` for desktop builds.
- `src-tauri/src/lib.rs` emits `pocket-daw-second-instance` with `argv` and `cwd`, focuses the main window, and exposes `initial_launch_args`.
- `src/native/deepLinkBridge.ts` already extracts `.pocketdaw` paths from startup arguments, second-instance arguments, quoted paths, and `file:///` URLs.
- `src/app/App.ts` already calls `openInitialProjectFileLaunch()` and `bindProjectFileLaunches()` during startup.
- `tests/deepLinkBridge.test.ts` covers protocol filtering and `.pocketdaw` path extraction.

## Implementation Steps

1. Verify the packaged installer writes the Windows association.
   - Install the generated setup EXE on a clean or association-reset Windows profile.
   - Check Windows Settings -> Apps -> Default apps -> Choose defaults by file type for `.pocketdaw`.
   - Confirm Pocket DAW appears as an Open With option even before making it the default.

2. Verify cold-start file launch.
   - Save a valid `.pocketdaw` project from Pocket DAW.
   - Close Pocket DAW.
   - Double-click the saved project.
   - Expected: Pocket DAW launches, opens the file, adopts the file label/title, hydrates project-adjacent media/cache where available, and does not re-import any stale handoff payload.

3. Verify second-instance file launch.
   - Open Pocket DAW to a different project.
   - Double-click another saved `.pocketdaw`.
   - Expected: the existing window focuses and opens the clicked file through the `pocket-daw-second-instance` path.

4. Verify Open With behavior.
   - Right-click a `.pocketdaw` file and choose Open With -> Pocket DAW.
   - Repeat once with Pocket DAW closed and once while it is already running.

5. Verify malformed and unsupported launch arguments.
   - Launch with a `.txt` path, a missing `.pocketdaw` path, and a malformed `file://` URL.
   - Expected: unsupported paths are ignored; unreadable `.pocketdaw` paths report a visible status without crashing.

6. Verify coexistence with handoff URLs.
   - Use Pocket Chordsmith Send to Pocket DAW after file-launch smoke.
   - Expected: `pocket-daw://` handoffs still import through deep-link/local/download fallback paths, and `.pocketdaw` argv filtering does not consume protocol URLs.

## Automated Coverage To Keep

- `npm test -- tests/deepLinkBridge.test.ts tests/fileBridge.test.ts`
- `cargo test --manifest-path src-tauri/Cargo.toml tests::native_cache_paths_stay_under_project_cache`
- `npm run verify:versions` before release packaging.

## Manual Release Gate

TASK-18 may only be marked complete after a packaged Windows installer has passed:

- `.pocketdaw` association visible in Windows Open With.
- Cold double-click opens the clicked project.
- Second-instance double-click focuses the existing app and opens the clicked project.
- File -> Open still works after association testing.
- Pocket Chordsmith handoff still works after association testing.

## 2026-06-28 Installed 0.6.34 Smoke Evidence

- Windows registry/Open With evidence: HKCU/HKCR `.pocketdaw` defaults and OpenWithProgids include `Pocket DAW Project`; the ProgID open command points at `C:\Users\sam_s\AppData\Local\Pocket DAW\pocket-daw.exe "%1"`.
- Cold-start shell launch opened `C:\Users\sam_s\AppData\Local\Temp\pocket-daw-file-assoc-smoke\task18-second-instance-open.pocketdaw` in installed `0.6.34`.
- Second-instance shell launch reused the existing `pocket-daw.exe` process, focused the running app path, and loaded the clicked temp project.
- Live `open_project` reopened `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`, covering the app project-open path after association testing.
- A real `pocket-daw://handoff?pocketHandoff=...` URL with the `Basic 4/4 Major` PCS1 fixture imported successfully after association testing.
- Supporting automated gates passed: `npm test -- tests/deepLinkBridge.test.ts tests/fileBridge.test.ts tests/pocketHandoff.test.ts tests/pcsImport.test.ts`, `npm run verify:versions`, and `cargo test --manifest-path src-tauri/Cargo.toml tests::native_cache_paths_stay_under_project_cache`.
