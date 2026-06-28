# Pocket DAW App.ts Responsibility Map

Date: 2026-06-28

This map began as the TASK-11 architecture checkpoint from the 2026-06-27 deep audit. It documents the current responsibilities in `src/app/App.ts`, records the selected updater orchestration seam, and tracks the first TASK-12 extraction.

## Current Shape

`src/app/App.ts` is the browser/Tauri application coordinator. It owns the live `AppState`, the `AudioEngine` instance, delegated DOM events, render scheduling, native bridge calls, file import/export orchestration, and release/update UI state.

The file is large because it sits at the boundary between pure project commands, native bridge APIs, the renderer, and transient browser UI details. Most project mutations already route through command modules in `src/app/commands.ts`, state helpers in `src/app/state.ts`, and domain helpers under `src/daw/`, `src/audio/`, and `src/native/`.

## Responsibility Map

| Area                           | App.ts anchors                                                                                                                                       | Current responsibility                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boot and runtime binding       | constructor, `mount`, `bindDeepLinkHandoffs`, `bindProjectFileLaunches`, `configureAiBridgeFromPreference`                                           | Create initial state, create `AudioEngine`, register tick callbacks, start bridge/listener setup, and load startup handoffs/files.                     |
| Handoff and file-launch intake | `consumeHandoff`, `openProjectFileLaunch`, `recordHandoffResult`, `recordHandoffBridgeStatus`, `importText`                                          | Accept `PCS1:`, PocketHandoff and `.pocketdaw` launch inputs, record status, preserve recovery snapshots, and route successful imports into app state. |
| AI/MCP live bridge             | `bindAiBridgeRequests`, `handleAiBridgeRequest`, `handleAiBridgeControl`, `applyAiBridgeLiveCommands`                                                | Expose live status, diagnostics and constrained transport/mixer controls to the local bridge.                                                          |
| Rendering and DOM patching     | `render`, `captureScrollSnapshot`, `restoreScrollSnapshot`, `updateLiveDom`, `updateChordsmithStepDom`, `updateTrackSelectionDom`, `updateStatusDom` | Render full app shell when needed and patch hot live playback/selection/status DOM without forcing full rerenders.                                     |
| DOM event delegation           | `bind`, `handleDelegatedClick`, `dispatch`, pointer/wheel handlers                                                                                   | Translate UI events into state commands, file/native bridge calls, or transport actions.                                                               |
| Updater panel                  | `scheduleStartupUpdateCheck`, `checkForUpdates`, `downloadAndInstallUpdate`, `applyUpdaterProgress`, `restartAfterUpdate`                            | Maintain update panel state while delegating actual update work to `src/native/updaterBridge.ts`.                                                      |
| Transport and metronome        | `playTransport`, `restartTransport`, `seekToBar`, metronome helpers                                                                                  | Coordinate audio preparation, engine transport, playhead state, and browser metronome clicks/count-in.                                                 |
| Recording alpha orchestration  | `toggleRecording`, `startRecording`, `stopRecording`, recording/input monitor helpers                                                                | Validate installed-app recording requirements, start/stop native capture, place recorded takes, save the project, and keep monitor UI state current.   |
| Chordsmith editor gestures     | step selection/drag/shortcut helpers, `applyChordsmithEditorEdit`                                                                                    | Translate grid gestures and keyboard shortcuts into command updates while preserving live playback and selection UI.                                   |
| Project state application      | `applyProjectState`, `scheduleRender`, `renderSchedulerCallbacks`                                                                                    | Commit command results, sync audio engine scopes, debounce autosave, and schedule render intensity.                                                    |
| Track/mixer controls           | mixer gesture helpers, mute/solo/monitor helpers                                                                                                     | Preview and commit track mixer state, sync audio-engine track audibility, and manage input monitoring side effects.                                    |
| Imports and media pool         | `importAudioMedia`, `addDecodedAudioMedia`, `reloadAudioMedia`, `relinkAudioMedia`, `importMidiMedia`, `addImportedMidiMedia`                        | Bridge browser/native file choices into project media, decode/cache audio, analyze waveforms, and import MIDI.                                         |
| Project open/save/recovery     | `openProject`, `openNativeProjectWithRecovery`, `openRawProjectText`, `saveProject`, autosave/recovery helpers                                       | Load/save `.pocketdaw`, hydrate native cache references, recover autosaves, track recents, and adopt file titles.                                      |
| Export jobs and native cache   | `exportWav`, MIDI export helpers, `freezeSelectedClip`, `exportStems`, `exportSectionLoops`, `exportGamePack`, `buildNativeCache`                    | Hydrate audio buffers, render/download artifacts, assemble game packs, and persist/prune native WAV cache references.                                  |
| Diagnostics and support        | `exportDiagnostics`, `copyDiagnostics`, `copyMcpSetup`, `testAiBridgeConnection`, `sendFeedbackEmail`                                                | Generate tester diagnostics, copy/download fallback text, and open support/product links.                                                              |

## Existing Boundaries To Preserve

- Pure project mutations should stay in `src/app/commands.ts`, `src/daw/*`, and `src/audio/*`.
- Native side effects should stay behind `src/native/*` bridge modules.
- `renderAppShell` should remain the UI HTML owner; `App.ts` should not grow a second renderer.
- `AudioEngine` remains the live playback and native-cache runtime owner.
- Recording planning helpers already live in `src/app/recordingOrchestration.ts`; keep expanding that style before adding more recording branches to `App.ts`.

## TASK-12 Seam

Extract updater panel orchestration first.

Why this is the lowest-risk seam:

- The updater methods are compact and contiguous.
- They already delegate all native update behavior to `src/native/updaterBridge.ts`.
- They touch a small, named state subset: `showUpdaterPanel`, `updaterStatus`, `updaterMessage`, `updaterCurrentVersion`, `updaterAvailableVersion`, `updaterReleaseNotes`, `updaterDownloadProgress`, `updaterAutoCheckOnStartup`, and `status`.
- They do not edit project data, timeline clips, audio buffers, native cache files, recording takes, or autosave/recovery payloads.
- The UI action surface is only `updater-open`, `updater-close`, `updater-check`, `updater-download-install`, `updater-restart`, and startup auto-check.

Pure tail helpers such as `sourceCacheOptions`, `stringInput`, `numberInput`, and readout formatters are the lowest-risk mechanical extraction. They are a good warm-up if the first code-moving pass needs to be almost zero-behavior-risk, but they are not enough to satisfy the audit's "orchestration service" intent by themselves.

Implemented TASK-12 shape:

- Add `src/app/updaterOrchestration.ts`.
- Move updater state transitions into pure helpers: `beginUpdaterCheck`, `applyUpdaterCheckResult`, `beginUpdaterDownload`, `applyUpdaterInstallResult`, `applyUpdaterProgress`, and `applyUpdaterRelaunchResult`.
- Keep `App.ts` responsible for native bridge calls and `render({ preserveScroll: true })`.
- Add focused unit tests in `src/app/updaterOrchestration.test.ts`.

Avoid extracting file open/save, recording, native cache or game-pack export first. Those paths have broader side effects and should wait until updater extraction proves the pattern.

## Validation

For this map-only TASK-11 change:

```powershell
cd apps/pocket-daw
npm test
npm run build
```

For the TASK-12 updater extraction:

```powershell
cd apps/pocket-daw
npm test -- src/app/updaterOrchestration.test.ts tests/updaterBridge.test.ts
npm test
npm run build
npm run test:e2e
```

If updater runtime behavior changes, also run an installed-app smoke for `Help -> Check for Updates` before publishing a checkpoint.
