# Pocket DAW Current Release Status

Generated from `release-status.json`. Refresh with `npm run status:release`.

| Field | Value |
| --- | --- |
| Source version | `0.6.44` |
| Project schema version | `3` |
| Latest published version | `0.6.43` |
| Latest published tag | `pocket-daw-v0.6.43` |
| Latest published commit | `546228a333971c319808fda88d751a7cc8fc77b6` |
| Last installed-smoke version | `0.6.43` |
| Last installed-smoke result | `pass` |
| Last installed-smoke date | `2026-08-01T12:43:45.050Z` |
| Last installed-smoke installer | `Pocket.DAW_0.6.43_x64-setup.exe` |
| Last installed-smoke SHA-256 | `8e68415dcd4f8272a9a4a308d4950e8c2561feaf4bacbc8f1cb6fe7499f15b96` |

## Installed-Smoke Notes

- Pocket DAW 0.6.43 was built from clean commit 546228a333971c319808fda88d751a7cc8fc77b6; the release manifest recorded dirtyWorkingTree false before installation.
- The exact staged setup EXE was releases/updater/Pocket.DAW_0.6.43_x64-setup.exe with SHA-256 8e68415dcd4f8272a9a4a308d4950e8c2561feaf4bacbc8f1cb6fe7499f15b96, installed locally and re-hashed unchanged after final candidate verification.
- Installed smoke passed Samples Library, Quick Sampler, Drum Rack, schema-3 save/reopen, native audio capture/render/export, punch/take lanes, MIDI input, media portability and game-pack checks. The final input take was intentionally quiet at the user's request; rendered/exported audio audibility and the user's audio-path confirmation passed.
- The installed VST3 host passed scanning, instrument/effect processing, state round-trips, automation, factory programs, latency, tails, vendor-editor lifecycle and unload/reload recovery. The packaged sidecar SHA-256 was dac69b746657c4e241087c387ae16a3ceda9167b473db9f940de45cae01a19fc.
- Compatibility coverage includes unbundled official JS80P 4.0.2 and Surge XT 1.3.4 releases; Pocket DAW does not bundle, download or redistribute them.
- The final candidate gate passed 1109 Vitest tests, 158 native library tests, 5 sidecar unit tests, 98 Pocket DAW Chordsmith parity tests and 17 Chromium E2E tests, plus exact installed VST3, media-portability, punch/take and target-runtime evidence.
- 0.6.43 was published to GitHub release pocket-daw-v0.6.43 on 2026-08-01. Latest updater/bootstrapper manifests, remote setup download and SHA-256, release tag and origin/main were verified; itch remains on its stable unchanged bootstrapper payload.

## Unreleased Source-Only Notes

- 2026-08-01 source-only 0.6.44 MCP help hotfix: installed builds no longer display or copy source-checkout commands containing the developer build-machine path. The current project and live-bridge session file remain runtime-derived for each machine; neutral source templates appear only outside the installed runtime. Validation is intentionally limited to focused MCP/UI tests and installer/package checks for this surgical text-only update.
- 2026-07-17 post-release documentation and test-helper update: added the one-pass exact-artifact release fast path, corrected normal itch policy, recorded 0.6.41 process failures to avoid, and promoted the loopMIDI sender into a tracked reusable script.
- 2026-07-22 Pocket Audio sound-profile update: imports and renders PCS schema 17 profile identity, expressive events, Funk bass articulations, upgraded Metal texture, Western character, Chiptune channel controls, expanded drum lanes, capability diagnostics, and preserved unknown intent while retaining legacy schema-16 compatibility.

## Capability Claim Boundary

- Public release claims must be limited to the latest published version plus the exact installed-smoke evidence recorded above.
- Source-only notes describe current working-tree capability only; they are not public release claims until installed-app smoke and release metadata are refreshed.
- Candidate release claims require a fresh exact-artifact smoke attestation, a verified installed punch/take-lane smoke summary, verified game-pack ZIP evidence for any game-pack claim, and refreshed generated release status.

## Release Truth

The source version, latest public version, and last exact installed-smoke evidence may legitimately differ. A source version must not be described as public or installed-smoked unless this status file records matching evidence.
