# Pocket DAW

Pocket DAW is a native-only Windows desktop arrangement and production app in
the Pocket Audio family.

It is built as a Tauri Windows app with a TypeScript UI and native audio
playback/recording/render/export paths.

Pocket DAW is not:

- a browser DAW
- an HTML5 app
- a Web Audio app
- Pocket Chordsmith
- Pocket DJ

Current public status: **free Windows alpha testing on itch**.

For current source/public/smoke truth, use:

- `docs/CURRENT_RELEASE_STATUS.md`
- `release-status.json`

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

Source commits after the last published checkpoint are unreleased until a
new checkpoint is deliberately versioned, packaged, hashed, smoke-tested, and
published. Do not create a new installer from a later commit while leaving the
app/package/Tauri metadata at the previous public checkpoint.

## Local Development

```powershell
npm install
npm test
npm run build
npm run tauri:dev
```

## Timing Model

Pocket DAW's core invariant:

> The native audio engine / sample clock owns timing. The UI follows audio
> state; it does not drive musical timing.

Playback, recording placement, loop boundaries, native render/cache, and
export length must be derived from the native transport/audio timeline, not
from UI animation frames, wall-clock timers, or visual playhead position.

## Chordsmith Profile Imports

Pocket DAW's Chordsmith compatibility layer accepts the optional lofi profile fields from Pocket Chordsmith JSON and `PCS1:` payloads. Imported lofi projects get soft track presets for drums, bass, chords, melody, ambience, and a gentle lofi master chain with conservative low-pass, saturation, compression/limiting, and optional texture metadata.

Current source builds also accept Chordsmith heavy-metal profile metadata. Imported metal projects keep the selected preset/profile metadata, use metal preset defaults for omitted drums, bass, chord/lead voices and guitar setup, and pass those IDs into browser/native playback payloads. This is source-only until the next exact installed-app smoke confirms the packaged audio path.

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
For already-imported MIDI clips, `pocket_daw_apply_commands` supports `convert_midi_arrangement` to map drums, bass, chord groups and melody into generated overlays while preserving the raw MIDI clip as the DAW source.

Pocket DAW `0.6.13` added `Help -> AI / MCP Bridge` in the installed app. The panel keeps copy-ready command, Claude/JSON and Codex TOML snippets, and can enable a token-protected live localhost bridge for the running app. Live MCP tools can read app status, control transport, select tracks/clips, save an already-saved project, write explicit-path WAV/MIDI smoke exports and apply safe mixer edits. File/project MCP tools still work while Pocket DAW is closed. Use computer/browser control for installed-app visual smoke, updater rehearsal, playback confidence and other runtime checks.

The live bridge is local-only and token-protected. Anyone or any process with
access to this Windows user account and the session file can control the enabled
live bridge, so enable it only for trusted local automation sessions.

Pocket DAW current updater-visible checkpoint and exact-artifact smoke evidence are recorded in `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md`.

User and agent help docs:

- `docs/POCKET_DAW_FUNCTION_REFERENCE.md`
- `docs/POCKET_DAW_ACTION_CATALOG.md`

Release and update docs:

- `docs/CURRENT_RELEASE_STATUS.md`
- `docs/ALPHA_TESTING_RELEASE_STATUS.md`
- `docs/ITCH_BUILD_PUSH_AND_UPDATE_TEST.md`
- `docs/ITCH_RELEASE_CHECKLIST.md`
- `docs/UPDATER_RELEASE_PIPELINE.md`
- `docs/WINDOWS_TESTING_CHECKLIST.md`

Architecture docs:

- `docs/ARCHITECTURE.md`
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
- Use `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md` for any
  current version/source/public/smoke claim. Versioned bullets below are
  historical context unless they explicitly point back to those release-truth
  files.
- Current source may contain unreleased docs, tests, or source organization
  work after the latest published checkpoint. Publish the next binary only
  after bumping the checkpoint version and updating the release truth with
  exact-artifact smoke evidence.
- Live recording is an installed-app-only alpha slice: one armed mono live audio track, saved-project prerequisite, project-relative WAV takes under `project-media/recordings`, metronome/count-in, monitor while armed/recording, and same-track overwrite placement for new takes.
- v0.6.8 is the updater-visible native-cache diagnostics patch. It keeps the lofi/chillhop parity work, keeps manual Build Native Cache swapping active native playback to cached WAV regions, adds Native Playback/Native Cache readouts for cached regions, cached clips and procedural fallback events, and keeps lofi texture/noise ticks from falsely driving the Drums mixer meter.
- v0.6.9 is the native lofi-bass audibility hotfix. It removes the extra native-only bass output pad so procedural `warm_sub` bass matches the Chordsmith/WebAudio scale when the native cache is not active.
- v0.6.10 moves normal app distribution to GitHub updater releases plus an itch bootstrapper, and adds the first local MCP bridge for structured project automation.
- v0.6.11 makes the bootstrapper close after launching the verified setup EXE and adds `Help -> Setup MCP Bridge` with copy-ready MCP client snippets.
- v0.6.12 corrects the MCP setup snippets to use a tested Windows `cmd` argument-array launch shape.
- v0.6.13 adds `Help -> AI / MCP Bridge` and live app MCP tools for status, transport, selection and safe mixer edits.
- v0.6.19 adds native loop/metronome playback, latest-only native restarts during rapid live composition edits, better native-cache reuse after live edits, Save As title adoption from `.pocketdaw` filenames, and refreshed release/bootstrapper manifests.
- Historical v0.6.22 checkpoint: cached-playback UI fixes from source commit `5cd186a22b6a8be9d706e1474b6a204ddbd065aa` and exact-artifact installed smoke for setup SHA-256 `c7adc2aea5595490e55dbb720bed6735cd91348caef69ef249f3ff1c0868a6b7`.
- Historical installed-app note: Windows `.pocketdaw` association, cold-start launch, second-instance launch, live project-open, and `pocket-daw://` Chordsmith handoff coexistence passed local installed `0.6.34` smoke on 2026-06-28. Keep File -> Open / Ctrl+O as the fallback and keep association smoke in future public release checkpoints; use `release-status.json` for the current public checkpoint.
- The latest published updater checkpoint and its exact installed-smoke notes are recorded in `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md`. That is the source of truth for any current public release claim.
- Published `0.6.38` includes a first user-facing punch/take-lane workflow for one armed live audio track, Web MIDI input capture that starts transport with automatic punch-out onto selected MIDI tracks, live-bridge recording option/start/stop/toggle controls for installed-app smoke, plus audio/MIDI take-lane timeline activation/archive/split behavior and export filtering. The public checkpoint has exact-artifact smoke attestation and release metadata; strict audible-input and real connected-controller MIDI claims still require dedicated hardware smoke before broader claims.
- ASIO, simultaneous multitrack capture, stereo recording modes, dedicated lane subtracks/collapse/solo, full polished comping UI, automatic latency compensation UI, FX monitoring, multi-input MIDI routing/overdub polish, MP3/FLAC/compressed game-pack export, full send/return processing and advanced pro DAW features are future work unless a later release explicitly says otherwise. Stereo/multitrack recording direction is tracked in `docs/STEREO_MULTITRACK_RECORDING_PLAN.md`; ASIO/low-latency backend research is tracked in `docs/ASIO_LOW_LATENCY_BACKEND_SPIKE.md`; punch/comping/take-lane direction is tracked in `docs/PUNCH_COMPING_TAKE_LANES_PLAN.md`; multi-format export direction is tracked in `docs/MULTI_FORMAT_EXPORT_PLAN.md`.
- Windows Authenticode signing is not currently claimed unless a release manifest proves it.
- Tauri updater signatures are generated separately as `.sig` files for updater validation.
- Windows SmartScreen may appear because the public alpha is not currently claimed as Authenticode-signed.
- The wider repo has mixed licensing/source-available boundaries; do not describe the whole repo as fully MIT/open-source unless the license files explicitly support that.
- Manual Windows smoke testing should be recorded against the exact itch/GitHub artifact hash.
