# Pocket DAW

Pocket DAW is a Windows desktop arrangement and production app for Pocket Chordsmith projects.

Current public status: **free Windows alpha testing on itch**. Current source target: `0.6.11` bootstrapper close behavior and in-app MCP bridge setup.

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

## AI / MCP Integration

Run `npm run mcp:pocket-daw` to start the local stdio MCP bridge. It exposes structured tools for reading, validating, converting, editing and export-planning `.pocketdaw` projects without driving the UI. The installed app also has `Help -> Setup MCP Bridge`, which shows copy-ready command, Claude/JSON and Codex TOML snippets. Use computer/browser control for installed-app visual smoke, updater rehearsal, playback confidence and other runtime checks.

Release and update docs:

- `docs/ALPHA_TESTING_RELEASE_STATUS.md`
- `docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md`
- `docs/ITCH_RELEASE_CHECKLIST.md`
- `docs/UPDATER_RELEASE_PIPELINE.md`
- `docs/WINDOWS_TESTING_CHECKLIST.md`

## Current Caveats

- This is alpha-testing software, not a finished professional DAW.
- Live recording is an installed-app-only alpha slice: one armed mono live audio track, project-relative WAV takes under `project-media/recordings`, metronome/count-in, monitor while armed/recording, and same-track overwrite placement for new takes.
- v0.6.8 is the updater-visible native-cache diagnostics patch. It keeps the lofi/chillhop parity work, keeps manual Build Native Cache swapping active native playback to cached WAV regions, adds Native Playback/Native Cache readouts for cached regions, cached clips and procedural fallback events, and keeps lofi texture/noise ticks from falsely driving the Drums mixer meter.
- v0.6.9 is the native lofi-bass audibility hotfix. It removes the extra native-only bass output pad so procedural `warm_sub` bass matches the Chordsmith/WebAudio scale when the native cache is not active.
- v0.6.10 moves normal app distribution to GitHub updater releases plus an itch bootstrapper, and adds the first local MCP bridge for structured project automation.
- v0.6.11 makes the bootstrapper close after launching the verified setup EXE and adds `Help -> Setup MCP Bridge` with copy-ready MCP client snippets.
- ASIO, simultaneous multitrack capture, punch-in/out, comping, latency compensation UI, full send/return processing, bundled game export packs and advanced pro DAW features are future work unless a later release explicitly says otherwise.
- Windows Authenticode signing is not currently claimed unless a release manifest proves it.
- Tauri updater signatures are generated separately as `.sig` files for updater validation.
- Windows SmartScreen may appear because the public alpha is not currently claimed as Authenticode-signed.
- The wider repo has mixed licensing/source-available boundaries; do not describe the whole repo as fully MIT/open-source unless the license files explicitly support that.
- Manual Windows smoke testing should be recorded against the exact itch/GitHub artifact hash.
