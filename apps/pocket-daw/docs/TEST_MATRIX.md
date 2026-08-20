# Pocket DAW Test Matrix

> Generated from `apps/pocket-daw/test-scope-manifest.json` by `node scripts/verify-test-scope-manifest.mjs --write-matrix`. Do not hand-edit this file.

Current inventory: 101 runnable test artifacts. The categories below identify the primary execution contract; evidence-validator tests are deterministic and do not claim that physical/manual evidence has occurred.

## Category totals

| Category | Test artifacts |
| --- | ---: |
| browser-e2e | 1 |
| compatibility-parity | 18 |
| integration | 23 |
| native-rust | 2 |
| release-contract | 15 |
| unit-domain | 27 |
| windows-contract | 15 |

## Inventory

| Test artifact | Primary category | Platforms | PR | Main | Release prepare | Ordinary Vitest | Evidence requirement | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/pocket-daw/tests/aiBridgeLiveCommands.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained integration coverage for live-command planning. |
| `apps/pocket-daw/tests/appInteractionSource.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Behavioral replacement is owned by the App interaction controller workstream. |
| `apps/pocket-daw/tests/audioClipCommands.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained domain command coverage. |
| `apps/pocket-daw/tests/audioClips.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained domain coverage. |
| `apps/pocket-daw/tests/audioEngine.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained deterministic audio-engine coverage. |
| `apps/pocket-daw/tests/automation.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained domain coverage. |
| `apps/pocket-daw/tests/automationSurface.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained surface parity coverage. |
| `apps/pocket-daw/tests/bassOverlays.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained schema/event overlay parity. |
| `apps/pocket-daw/tests/bootstrapperRelease.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained bootstrapper artifact contract. |
| `apps/pocket-daw/tests/chordOverlays.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained overlay parity. |
| `apps/pocket-daw/tests/chordsmithBrowserParity.test.ts` | compatibility-parity | linux | yes | yes | yes | yes | none (validator/fixture only) | Linux owns browser-parity coverage. |
| `apps/pocket-daw/tests/chordsmithEditor.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained editor integration. |
| `apps/pocket-daw/tests/chordsmithEditorCommands.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained command integration. |
| `apps/pocket-daw/tests/chordsmithStepGestures.test.ts` | integration | linux | yes | yes | yes | yes | none (validator/fixture only) | Deterministic gesture behavior; browser E2E supplements it. |
| `apps/pocket-daw/tests/clipCommands.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained domain coverage. |
| `apps/pocket-daw/tests/deepLinkBridge.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Windows bridge contract; selected subset may run on Windows. |
| `apps/pocket-daw/tests/demoProject.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained project fixture compatibility. |
| `apps/pocket-daw/tests/devices.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Mocked device integration, not hardware evidence. |
| `apps/pocket-daw/tests/diagnostics.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained diagnostics integration. |
| `apps/pocket-daw/tests/drumBranching.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained deterministic composition behavior. |
| `apps/pocket-daw/tests/e2e/smoke.spec.js` | browser-e2e | linux | yes | yes | yes | no | none (validator/fixture only) | Linux owns complete browser E2E. |
| `apps/pocket-daw/tests/eventRenderer.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained renderer behavior. |
| `apps/pocket-daw/tests/exportJobs.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained export plan behavior. |
| `apps/pocket-daw/tests/exportProfile.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained export-profile domain behavior. |
| `apps/pocket-daw/tests/externalLinkBridge.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native external-link fallback contract. |
| `apps/pocket-daw/tests/fileBridge.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native file bridge contract. |
| `apps/pocket-daw/tests/fileInputs.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained input handling behavior. |
| `apps/pocket-daw/tests/fileSizeLimits.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained bounded file-input validation. |
| `apps/pocket-daw/tests/fx.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained effect domain behavior. |
| `apps/pocket-daw/tests/fxProcessor.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained deterministic processor behavior. |
| `apps/pocket-daw/tests/gamePackPushBridge.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained game-pack handoff compatibility. |
| `apps/pocket-daw/tests/gamePackVerifier.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Automated ZIP validation; not Asset Library publication evidence. |
| `apps/pocket-daw/tests/hostedPlugins.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Mocks plugin-host contracts without a third-party plugin. |
| `apps/pocket-daw/tests/installedMediaPortabilitySmoke.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Fixture verifier only; installed smoke remains a release-workflow internal. |
| `apps/pocket-daw/tests/installedPunchTakeAudioInput.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Fixture verifier only; it neither launches nor claims an installed smoke. |
| `apps/pocket-daw/tests/installedVst3HostSmoke.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Fixture verifier only; external VST3 smoke remains release evidence. |
| `apps/pocket-daw/tests/instruments.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained deterministic instrument behavior. |
| `apps/pocket-daw/tests/keyboard.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained keyboard behavior. |
| `apps/pocket-daw/tests/manualFreshAudibleEvidence.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Validates evidence format; it does not create human-listening evidence. |
| `apps/pocket-daw/tests/mediaPool.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained media-pool domain coverage. |
| `apps/pocket-daw/tests/melodyOverlays.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained overlay parity. |
| `apps/pocket-daw/tests/midiClips.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained MIDI-clip domain coverage. |
| `apps/pocket-daw/tests/midiCommands.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained MIDI command behavior. |
| `apps/pocket-daw/tests/midiExport.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained MIDI export compatibility. |
| `apps/pocket-daw/tests/midiFaithfulConversion.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained faithful MIDI conversion contract. |
| `apps/pocket-daw/tests/midiParser.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained parser behavior. |
| `apps/pocket-daw/tests/mixerFastPath.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained mixer fast-path behavior. |
| `apps/pocket-daw/tests/nativeAudioPlayback.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Mocked native playback bridge contract. |
| `apps/pocket-daw/tests/nativeMediaBridge.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native media bridge contract. |
| `apps/pocket-daw/tests/nativeOfflineRender.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native offline-render bridge contract. |
| `apps/pocket-daw/tests/nativeRenderCache.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native render-cache bridge contract. |
| `apps/pocket-daw/tests/nativeRenderContract.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native renderer contract. |
| `apps/pocket-daw/tests/offlineRender.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Deterministic offline render behavior. |
| `apps/pocket-daw/tests/packageItchSigning.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Signing/package contract without publishing. |
| `apps/pocket-daw/tests/packagePreview.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Preview package contract. |
| `apps/pocket-daw/tests/parityFixtures.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Family parity fixture coverage. |
| `apps/pocket-daw/tests/pcsImport.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Schema 16/17 PCS import compatibility. |
| `apps/pocket-daw/tests/performanceHotPath.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Performance behavior without a timing threshold. |
| `apps/pocket-daw/tests/pocketAudioCoreAdapter.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Core adapter compatibility. |
| `apps/pocket-daw/tests/pocketDawMcp.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | MCP command integration. |
| `apps/pocket-daw/tests/pocketHandoff.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | DAW/Handoff schema compatibility. |
| `apps/pocket-daw/tests/projectInvariants.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Project invariants. |
| `apps/pocket-daw/tests/projectLoadState.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Project load-state integration. |
| `apps/pocket-daw/tests/projectRoundtrip.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | .pocketdaw round-trip compatibility. |
| `apps/pocket-daw/tests/publishedReleaseVerification.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Exact published release verification contract. |
| `apps/pocket-daw/tests/recentFiles.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Recent-file domain behavior. |
| `apps/pocket-daw/tests/recordingAlpha.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Deterministic recording model, not live input evidence. |
| `apps/pocket-daw/tests/releaseCandidateReceipt.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Retained immutable receipt tamper coverage. |
| `apps/pocket-daw/tests/releaseScripts.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Behavioral contract replacement is owned by the release-policy workstream. |
| `apps/pocket-daw/tests/releaseContract.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Declarative release-policy contract coverage. |
| `apps/pocket-daw/tests/releaseStatus.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Release truth generation contract. |
| `apps/pocket-daw/tests/renderScheduler.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Render scheduling behavior. |
| `apps/pocket-daw/tests/routing.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Routing domain behavior. |
| `apps/pocket-daw/tests/routingCommands.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Routing command behavior. |
| `apps/pocket-daw/tests/sampleLibrary.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Sample library integration. |
| `apps/pocket-daw/tests/schemaMigration.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Project/schema migration compatibility. |
| `apps/pocket-daw/tests/scrollReveal.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | UI scroll reveal behavior. |
| `apps/pocket-daw/tests/sessionBridge.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Native session bridge contract. |
| `apps/pocket-daw/tests/sessionImport.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Session import compatibility. |
| `apps/pocket-daw/tests/smokeAttestation.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Validates exact-evidence formats; it does not claim an installed or human smoke. |
| `apps/pocket-daw/tests/soundProfileEvolution.test.ts` | compatibility-parity | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Sound-profile compatibility. |
| `apps/pocket-daw/tests/timelineConversion.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Timeline conversion behavior. |
| `apps/pocket-daw/tests/timelineEditing.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Timeline editing behavior. |
| `apps/pocket-daw/tests/trackAdd.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Track-add UI integration. |
| `apps/pocket-daw/tests/ui.test.ts` | integration | linux | yes | yes | yes | yes | none (validator/fixture only) | Deterministic UI integration; browser E2E supplements it. |
| `apps/pocket-daw/tests/updaterBridge.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Tauri updater bridge contract. |
| `apps/pocket-daw/tests/updaterManifestScript.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Updater manifest contract. |
| `apps/pocket-daw/tests/vst3CommandContract.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | VST3 command/bridge contract. |
| `apps/pocket-daw/tests/vst3SaveOrchestration.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | VST3 save orchestration contract. |
| `apps/pocket-daw/tests/vst3SidecarPackaging.test.ts` | release-contract | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Sidecar hash/isolation packaging contract. |
| `apps/pocket-daw/src-tauri/tests/vst3_scanner_process.rs` | native-rust | windows | yes | yes | yes | no | none (validator/fixture only) | Rust process integration for scanner isolation. |
| `apps/pocket-daw/src-tauri/tests/vst3_session_process.rs` | native-rust | windows | yes | yes | yes | no | none (validator/fixture only) | Rust process integration for VST3 session isolation. |
| `apps/pocket-daw/src/audio/eventRenderer.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated renderer unit coverage. |
| `apps/pocket-daw/src/app/feedback.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated feedback/link behavior. |
| `apps/pocket-daw/src/app/keyboard.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated keyboard behavior. |
| `apps/pocket-daw/src/app/mcpSetup.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated MCP setup behavior. |
| `apps/pocket-daw/src/app/recordingOrchestration.test.ts` | integration | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated recording orchestration; no hardware evidence. |
| `apps/pocket-daw/src/app/updaterOrchestration.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated updater orchestration. |
| `apps/pocket-daw/src/daw/exportProfiles.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated export-profile domain behavior. |
| `apps/pocket-daw/src/daw/timeline.test.ts` | unit-domain | linux, windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated timeline domain behavior. |
| `apps/pocket-daw/src/plugins/vst3Foundation.test.ts` | windows-contract | windows | yes | yes | yes | yes | none (validator/fixture only) | Source-colocated VST3 foundation contract. |
