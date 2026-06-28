# Pocket DAW

Pocket DAW is a Windows desktop arrangement and production app for Pocket Chordsmith projects.

Current public status: **free Windows alpha testing on itch**. Treat `docs/CURRENT_RELEASE_STATUS.md`, generated from `release-status.json`, as the current source/public/smoke truth. The current audited release truth is `0.6.34`.

- Itch page: `https://samfa12.itch.io/pocket-daw`
- Project hub: `https://samfa12.com`
- Updater manifest: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Itch bootstrapper manifest: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-bootstrapper-latest.json`

## Install For Alpha Testing

1. Download Pocket DAW from itch.
2. Run the itch bootstrapper. It downloads the latest setup EXE from GitHub Releases, verifies its SHA-256 hash, and launches the verified installer.
3. Launch Pocket DAW from the Start Menu or installed shortcut.
4. Confirm the version/build information in the About/Diagnostics panel.
5. Future versions should be tested through `Help -> Check for Updates` or the startup auto-check flow.

Pocket DAW is installed-app only for public alpha testing. Do not document, test, or publish a user-facing portable/extract-and-run app workflow. ZIPs, if any are generated later, are release/upload containers for installer artifacts only.

Pocket DAW uses signed Tauri updater artifacts from GitHub Releases. The app is not updated from raw git source.

## Local Development

```powershell
npm install
npm test
npm run build
npm run tauri:dev
```

## Lofi Chill Pack

Pocket DAW's Chordsmith compatibility layer accepts the optional lofi profile fields from Pocket Chordsmith JSON and `PCS1:` payloads. Imported lofi projects get soft track presets for drums, bass, chords, melody, ambience, and a gentle lofi master chain with conservative low-pass, saturation, compression/limiting, and optional texture metadata.

The demo helpers expose a lofi Chordsmith template project for future template-picker UI and import/export tests. Rendered Chordsmith stems remain the recommended game handoff when exact live/export parity matters.

## Release Checks

```powershell
npm run verify:versions
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run release:update:full
```

Use `npm run release:update` for a local signed updater package without the full test gate, `npm run release:update:fast` only for manifest/release-note rehearsal against existing same-version installers, and `PUBLISH=1 npm run release:update:publish` only when an accumulated public checkpoint should go live. Public checkpoint releases publish GitHub updater assets and `pocket-daw-bootstrapper-latest.json`; they do not push itch.

Use `npm run package:itch-bootstrapper` and `npm run verify:itch-bootstrapper` to build the stable itch downloader. Upload it with `PUBLISH=1 npm run itch:push:bootstrapper` only when the bootstrapper itself changes. The old full-installer itch scripts remain as a manual fallback.

Before describing any release as sound-parity work, check `../../docs/POCKET_AUDIO_SOUND_PARITY_MATRIX.md` and record the component-specific automated gates plus installed-app listening evidence.

## AI / MCP Integration

Run `npm run mcp:pocket-daw` to start the local stdio MCP bridge. It exposes structured tools for reading, validating, converting, editing and export-planning `.pocketdaw` projects without driving the UI.

The file bridge can also arrange a `.mid` file into a generated Chordsmith-style heavy-metal Pocket DAW project with metal drums, bass, distorted lead, rhythm guitar and a muted raw-MIDI reference clip via `pocket_daw_arrange_midi`.

Pocket DAW `0.6.13` added `Help -> AI / MCP Bridge` in the installed app. The panel keeps copy-ready command, Claude/JSON and Codex TOML snippets, and can enable a token-protected live localhost bridge for the running app. Live MCP tools can read app status, control transport, select tracks/clips, save an already-saved project and apply safe mixer edits. File/project MCP tools still work while Pocket DAW is closed. Use computer/browser control for installed-app visual smoke, updater rehearsal, playback confidence and other runtime checks.

Pocket DAW current updater-visible checkpoint and exact-artifact smoke evidence are recorded in `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md`.

Release and update docs:

- `docs/CURRENT_RELEASE_STATUS.md`
- `docs/ALPHA_TESTING_RELEASE_STATUS.md`
- `docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md`
- `docs/ITCH_RELEASE_CHECKLIST.md`
- `docs/UPDATER_RELEASE_PIPELINE.md`
- `docs/WINDOWS_TESTING_CHECKLIST.md`

Architecture docs:

- `docs/APP_TS_RESPONSIBILITY_MAP.md`
- `docs/DRUM_BRANCHING_PLAN.md`
- `docs/FILE_ASSOCIATION_IMPLEMENTATION_PLAN.md`
- `docs/MIDI_IMPORT_AND_CHORDSMITH_CONVERSION_PLAN.md`
- `docs/MULTI_FORMAT_EXPORT_PLAN.md`
- `docs/STEREO_MULTITRACK_RECORDING_PLAN.md`
- `docs/ASIO_LOW_LATENCY_BACKEND_SPIKE.md`
- `docs/PUNCH_COMPING_TAKE_LANES_PLAN.md`

## Current Caveats

- This is alpha-testing software, not a finished professional DAW.
- Live recording is an installed-app-only alpha slice: one armed mono live audio track, saved-project prerequisite, project-relative WAV takes under `project-media/recordings`, metronome/count-in, monitor while armed/recording, and same-track overwrite placement for new takes.
- v0.6.8 is the updater-visible native-cache diagnostics patch. It keeps the lofi/chillhop parity work, keeps manual Build Native Cache swapping active native playback to cached WAV regions, adds Native Playback/Native Cache readouts for cached regions, cached clips and procedural fallback events, and keeps lofi texture/noise ticks from falsely driving the Drums mixer meter.
- v0.6.9 is the native lofi-bass audibility hotfix. It removes the extra native-only bass output pad so procedural `warm_sub` bass matches the Chordsmith/WebAudio scale when the native cache is not active.
- v0.6.10 moves normal app distribution to GitHub updater releases plus an itch bootstrapper, and adds the first local MCP bridge for structured project automation.
- v0.6.11 makes the bootstrapper close after launching the verified setup EXE and adds `Help -> Setup MCP Bridge` with copy-ready MCP client snippets.
- v0.6.12 corrects the MCP setup snippets to use a tested Windows `cmd` argument-array launch shape.
- v0.6.13 adds `Help -> AI / MCP Bridge` and live app MCP tools for status, transport, selection and safe mixer edits.
- v0.6.19 adds native loop/metronome playback, latest-only native restarts during rapid live composition edits, better native-cache reuse after live edits, Save As title adoption from `.pocketdaw` filenames, and refreshed release/bootstrapper manifests.
- Historical v0.6.22 checkpoint: cached-playback UI fixes from source commit `5cd186a22b6a8be9d706e1474b6a204ddbd065aa` and exact-artifact installed smoke for setup SHA-256 `c7adc2aea5595490e55dbb720bed6735cd91348caef69ef249f3ff1c0868a6b7`.
- Installed-app note: Windows `.pocketdaw` association, cold-start launch, second-instance launch, live project-open, and `pocket-daw://` Chordsmith handoff coexistence passed local installed `0.6.34` smoke on 2026-06-28. Keep File -> Open / Ctrl+O as the fallback and keep association smoke in future public release checkpoints.
- ASIO, simultaneous multitrack capture, stereo recording modes, punch-in/out, comping, latency compensation UI, FX monitoring, MP3/FLAC/compressed game-pack export, full send/return processing and advanced pro DAW features are future work unless a later release explicitly says otherwise. Stereo/multitrack recording direction is tracked in `docs/STEREO_MULTITRACK_RECORDING_PLAN.md`; ASIO/low-latency backend research is tracked in `docs/ASIO_LOW_LATENCY_BACKEND_SPIKE.md`; punch/comping/take-lane direction is tracked in `docs/PUNCH_COMPING_TAKE_LANES_PLAN.md`; multi-format export direction is tracked in `docs/MULTI_FORMAT_EXPORT_PLAN.md`.
- Windows Authenticode signing is not currently claimed unless a release manifest proves it.
- Tauri updater signatures are generated separately as `.sig` files for updater validation.
- Windows SmartScreen may appear because the public alpha is not currently claimed as Authenticode-signed.
- The wider repo has mixed licensing/source-available boundaries; do not describe the whole repo as fully MIT/open-source unless the license files explicitly support that.
- Manual Windows smoke testing should be recorded against the exact itch/GitHub artifact hash.
