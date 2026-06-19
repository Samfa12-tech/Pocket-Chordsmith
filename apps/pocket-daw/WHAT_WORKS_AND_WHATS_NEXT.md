# Pocket DAW v0.6.10 - What Works and What's Next

## Current public alpha

Pocket DAW is live for Windows alpha testing on itch at `https://samfa12.itch.io/pocket-daw` and linked from `https://samfa12.com`.

- Current source target: `0.6.10` bootstrapper/updater workflow and MCP bridge alpha
- Last completed public artifact record in this repo: `0.6.10`
- Last installed public smoke evidence in this repo: `0.6.9` partial; `0.6.10` bootstrapper install smoke remains pending
- Primary itch channel: `windows-installer`
- GitHub updater manifest: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Current source commit: `8fa90decbfb0c90bc4aef5e17963afc8028e9231`

This is alpha-testing software, not a finished professional DAW. Future installed-app updates should be tested through the Tauri updater flow instead of requiring testers to manually redownload every build.

## v0.6.10 Bootstrapper And MCP Bridge - bootstrapper smoke pending

`0.6.10` moves normal public app updates to GitHub Releases plus the Tauri updater. The itch channel should now carry the small bootstrapper upload from `releases/itch-bootstrapper/upload/`; it downloads the latest GitHub setup EXE, verifies SHA-256 from `pocket-daw-bootstrapper-latest.json`, and launches the verified installer.

This release also adds `npm run mcp:pocket-daw`, a local stdio MCP bridge for structured project read/validate/import/edit/export-plan tasks. Computer/browser control remains the right path for installed-app visual QA, playback confidence and updater smoke.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737791`, user version `bootstrapper-0.6.10`, now carries the bootstrapper-only upload instead of the full setup/MSI installer pair.
- GitHub release `pocket-daw-v0.6.10` was published with setup EXE/MSI, updater signatures, release manifest, checksums, `pocket-daw-latest.json`, `pocket-daw-bootstrapper-latest.json`, and `Pocket_DAW_Itch_Bootstrapper_v0.6.10.exe`.
- Remote setup EXE SHA-256 was verified as `c893ddcc545738c79fb72bd486b75cbe263534b466fcd4d2f593574d509fd00e`.
- Bootstrapper EXE SHA-256 is `acb60b6c38226f67186b7a1d644504b4ffae7abb4e4d1f43fa13a3a2bbe8230f`.

## v0.6.9 Native Lofi Bass Hotfix - installed smoke pending

`0.6.9` is the current installer/updater test build. It keeps the `0.6.8` native-cache diagnostics patch and fixes native procedural `warm_sub`/lofi bass playback so soloed imported bass remains audible when the native cache is not active.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1736808`, user version `0.6.9`.
- GitHub release `pocket-daw-v0.6.9` was published with the current setup EXE/MSI, updater signatures, release manifest, checksums and `pocket-daw-latest.json`.
- The GitHub latest updater manifest points at `Pocket.DAW_0.6.9_x64-setup.exe`.
- Remote setup EXE SHA-256 was verified as `406bd7432dda5f4c3dfccb041c6e2362f5b683559476900f239ec46843d60f09`.

Installed-app smoke for `0.6.9` should re-open the reported `lofi demo project.pocketdaw`, confirm About/Diagnostics reports `0.6.9`, solo Bass at 100-120%, and verify the audible bass matches the moving Bass meter.

Installed-app bass smoke result: Sam confirmed on 2026-06-19 that Bass is audible in installed `0.6.9`.

Shared parity gate result: `npm run verify:family-parity` from `packages/pocket-audio-core/` passed on 2026-06-19, covering shared sound-surface freshness, cross-app drift tests, Chordsmith browser trace parity, core event/render/Godot pack fixtures, and DAW Chordsmith import/render/export parity tests.

## v0.6.8 Native Cache Diagnostics Patch - installed smoke pending

`0.6.8` was the previous installer/updater test build. It keeps the `0.6.7` native-cache performance patch, adds Native Playback/Native Cache readouts in the Media Pool and About/Diagnostics panels so testers can confirm cached regions, cached clips and procedural fallback events while A/B testing imported lofi projects, and stops lofi texture/noise ticks from falsely driving the Drums mixer meter.

Published evidence as of 2026-06-19:

- Itch channel `samfa12/pocket-daw:windows-installer` build `#1736802`, user version `0.6.8`.
- GitHub release `pocket-daw-v0.6.8` was published with the then-current setup EXE/MSI, updater signatures, release manifest, checksums and `pocket-daw-latest.json`.
- The GitHub latest updater manifest pointed at `Pocket.DAW_0.6.8_x64-setup.exe` before `0.6.9` replaced it.
- Remote setup EXE SHA-256 was verified as `57635be4f5b509e27584e820956752155870709d9ad97ebcf619ecdeebd8c577`.

The same native-cache and Drums-meter smoke remains part of the `0.6.9` installed-app pass before calling the baseline fully verified.

## v0.6.4 Lofi/Chillhop Compatibility Alpha

- Pocket DAW accepts optional lofi/chillhop Pocket Chordsmith fields such as `audioProfile`, `lofiPreset`, `stylePreset`, `lofiTexture`, `drumKit`, `drumGroovePreset`, and `bassTone` without changing the `.pocketdaw` schema.
- Imported lofi projects receive soft DAW track presets for drums, bass, chords, melody, ambience, and master output while preserving original Chordsmith source fields.
- Lofi imports add a gentle master chain with conservative low-pass, warmth/saturation, glue compression/limiting, and optional bit-colour metadata.
- The lofi template helper creates a Study Room-style Chordsmith project for future template-picker UI and import/export tests.
- The v0.6.3 live-recording and mixer polish remains part of the current baseline.
- Required installed smoke for this baseline: lofi import, recording alpha, updater behavior, save/open/reopen, WAV/MIDI export sanity, and exact artifact-hash tracking.

## v0.6.3 Live Recording And Mixer Polish Alpha

- Live-vocals mixer input controls are compact and stable, and small timeline track-label buttons no longer inherit rounded strip styling.
- Timeline/mixer Mute, Solo, Arm, Monitor and input edits preserve scroll while playback/recording is running.
- Timeline recording preview clicks are non-seeking so they cannot jump the playhead or scroll position.
- Record now starts/resumes playback from the captured record start bar after count-in so unmuted backing tracks play while recording.
- Monitor toggles and mixer gain/pan changes now update the active native CPAL monitor stream during an in-progress take.
- Stopping a take records over overlapping same-track audio clips and preserves only the non-overlapping left/right material.
- Mixer/transport polish keeps timeline scroll stable around track controls, restores live armed-input metering, and darkens Pocket DAW bass playback toward Pocket Chordsmith export parity.

## v0.6.0 Recording Alpha

- Added installed-app-only native CPAL mono recording commands for one armed live audio track.
- Recording now requires a saved `.pocketdaw` project so WAV takes are written under `project-media/recordings/`.
- Stop Record imports the take as a project-media Media Pool item and places an audio clip on the armed track at the original record start bar.
- Added transport `Record`, metronome toggle, recording timer/count-in status, and timeline/mixer `M`, `S`, `R`, `Monitor` controls for live tracks.
- Added project metronome settings and `track.monitorEnabled` defaults/migration while preserving existing save compatibility.
- Added metronome/count-in click playback that is not included in WAV/MIDI exports.
- Added diagnostics fields for recording state, armed tracks, monitor-enabled tracks and metronome/count-in settings.
- Added Rust tests for WAV writer/path safety and TypeScript tests for migration defaults, metronome timing, live track arm/monitor controls and recorded clip placement.
- Still out of scope: ASIO, simultaneous multitrack recording, stereo recording modes, punch-in/out, comping/take lanes, latency compensation UI and FX monitoring.

## v0.5.14 Stabilization Pass - source changes pending installed release

- Fixed Standard MIDI File import for real-world format 1 files with a tempo/meta track followed by note tracks. The parser now reads each `MTrk` chunk length before calculating the track end, preserves overlapping same-pitch notes, validates chunk boundaries, and reports malformed track headers with track/byte context.
- Added compact synthetic MIDI regression fixtures for the Zelda-style shape: format 1, PPQ 1024, metadata-only tempo track, and a separate piano note track. The full third-party MIDI file is not committed.
- MIDI import metadata now keeps parsed track count and track summaries while preserving the existing single MIDI clip workflow for compatibility.
- Fixed full-song MIDI export so multi-track exports declare SMF format 1 correctly and preserve the project BPM tempo event.
- Chordsmith/PCS1/raw JSON import now saves a separate pre-import recovery snapshot before replacing the visible project, then opens the imported song as a fresh unsaved project.
- Added regression coverage that PCS1 and raw Chordsmith JSON imports preserve source BPM, including the 136 BPM smoke-test case.
- Raised and inset modal panels so About/Diagnostics and updater dialogs render above the installed-app menu/transport bars with reachable close controls.
- Startup update checks now stay quiet when no update is available, but open the updater panel when an update is found.

## North star

The durable product destination is tracked in `POCKET_DAW_NORTH_STAR.md`.

Pocket DAW should eventually do everything Pocket Chordsmith can do for song creation, plus real DAW work: native timeline arrangement, simultaneous mono/stereo multitrack recording with suitable hardware, MIDI/audio clips, imported audio-file tracks, mixing, automation, live preview, timeline scrub, multi-format export with bitrate/quality controls, stem export, Godot/web-game packs, push from Pocket Chordsmith to Pocket DAW, and push from Pocket DAW to Godot.

## v0.5.13 Public Alpha Follow-Up Notes

- Pocket Chordsmith direct "Send to Pocket DAW" is passing in the installed v0.5.13 smoke run through the downloaded PCS1 handoff-file fallback.
- Handoff/import BPM preservation still needs a fix: Sam's source Pocket Chordsmith project was 136 BPM, but Pocket DAW imported/exported it at 112 BPM, likely from the current DAW project/default. Import should preserve the exported BPM exactly.
- Handoff/import should behave like opening a new imported project, not silently mutate the currently open project. If a project is already open, Pocket DAW should autosave it before loading the imported handoff.
- WAV export was manually confirmed working for `C:\Users\sam_s\Downloads\imported-chordsmith-project.wav`.
- MIDI export produced `C:\Users\sam_s\Downloads\imported-chordsmith-project.mid`; structural inspection parsed 6 tracks and 869 note-on events with matching note-offs, but the file inherits the wrong 112 BPM and declares format 0 despite multiple tracks, so MIDI export needs external playback verification and a header/tempo follow-up.
- About/Diagnostics panel placement needs a UI fix: in the installed Windows app it can render underneath the top control bar, leaving the close control unreachable. Move it down or constrain it to the visible content area in the next update.

## What works now

- Browser-runnable Vite + TypeScript app in `pocket-daw`.
- Native Windows Tauri v2 app wrapper in `src-tauri`.
- Native CPAL playback backend for generated Pocket Chordsmith and MIDI-preview event playback in the installed app.
- Native CPAL recording alpha for one armed mono live track in installed builds, with saved-project prerequisite and project-media WAV take creation.
- Future-ready `.pocketdaw` JSON schema with source refs, timeline clips, tracks, automation, routing, media pool, render cache, export profiles and import history.
- Defensive Pocket Chordsmith import for `PCS1:` share codes and raw JSON.
- `.pocketdaw` open/save roundtrip.
- Pocket DJ source-session import when the original Chordsmith project is available in the DJ session.
- Unknown Chordsmith fields are preserved in `sourceRefs[].original`.
- Chordsmith `songSequence` converts to `generated-section` clips on a generic timeline.
- Fallback conversion uses active sections A-H if no usable sequence exists.
- Desktop DAW shell with transport, track list, timeline, inspector, mixer and import/export panel.
- Desktop-style menu strip for File, Edit, View, Track, Transport and Help commands.
- Public alpha release is live on itch and documented in `docs/ALPHA_TESTING_RELEASE_STATUS.md`.
- Installed builds can check GitHub Releases for signed Tauri updater artifacts, with startup auto-check enabled for alpha testing and manual `Help -> Check for Updates` still available.
- Native-aware project workflow for New, Open, Save and Save As, with browser download/open fallback when the Tauri shell is unavailable.
- Current project file label/path tracking and richer recent-project records where native paths are available.
- Clip selection, move left/right by snap or whole-bar keyboard shortcuts, copy, paste, duplicate, split, trim, delete and mute.
- Timeline zoom, bar/beat snap, click-to-seek, drag-to-scrub, playhead/cursor display and loop region controls.
- Timeline workspace can be drag-resized, the inspector can be hidden/resized, and mixer/channel controls move lower as the timeline expands.
- Generated-section clips have a cyan snap-move drag rail and a green right repeat rail for extending sections as linked copies.
- Set loop to selected clip and clear loop actions.
- Basic marker lane with add, rename and delete support using the existing marker schema.
- Visible Media Pool panel with item metadata, missing/external status, guarded future import buttons and render-cache relationship display.
- Chordsmith parity editor in the inspector for section scope, globals, chords, drums, bass, melody and guitar settings.
- Section editor can follow the selected generated-section clip or manually target Sections A-H.
- Chordsmith step editors page through the full section length instead of only the first compact step slice.
- Cross-platform browser preview packaging writes a versioned zip with current docs at the root.
- Release verification can run tests, production build, browser preview packaging and native debug build when the Rust/Tauri toolchain is available.
- Free public itch release automation now stages installed Windows setup/MSI artifacts and updater `.sig` files under `releases/itch/installers/`.
- Release manifests and SHA-256 checksum files are generated from actual artifacts instead of copied by hand.
- Untrusted `.pocketdaw`/JSON project rendering is hardened for names, IDs, data attributes and inline colors.
- Native and browser fallback imports reject oversized project, MIDI and audio files before whole-file reads.
- Persisted native cache hydration can read valid `project-cache/native-audio/*.wav` entries when source hashes match.
- Full native release bundling is now explicit through `npm run verify:native-release` / `npm run tauri:build`.
- The main app shell uses explicit layout zones for menu, transport, studio, mixer, export, media and import so lower panels do not rely on implicit grid rows.
- PocketHandoff import can consume URL query/hash envelopes, raw hash envelopes, `window.name`, localStorage and legacy `pcs1`/`pcs`/`code`/`import` params.
- Consumed PocketHandoff payloads are cleared after a successful import so reloads do not repeat the handoff.
- Audio import can decode supported files into a runtime buffer cache and add source metadata to the Media Pool.
- Audio Media Pool items can be placed on the timeline as audio clips on an audio track.
- Audio clips render as separate audio regions for live playback and full-song WAV export when their decoded buffers are available.
- Lightweight waveform peak metadata is stored for imported audio and shown in the Media Pool/timeline.
- MIDI import can parse `.mid`/`.midi` files into Media Pool items and editable MIDI timeline clips.
- MIDI clips play through the built-in preview synth and participate in full-song WAV rendering.
- Selected MIDI clips show a compact piano-roll inspector for add/delete/move/pitch/duration/velocity edits.
- Selected tracks can create/edit basic volume and pan automation lanes in the inspector.
- Live playback and offline WAV export apply first-pass track volume/pan automation.
- Tracks can be routed to master or to created bus tracks; return tracks are scaffolded with guarded send metadata.
- Stem WAV export is available as sequential browser downloads for generated/audio/MIDI track groups.
- Section-loop WAV export is available as sequential browser downloads with a JSON loop manifest; Godot adaptive pack and web game pack exports now build collected ZIP packs with rendered audio, manifest metadata and the source `.pocketdaw` JSON.
- Media Pool status distinguishes runtime-loaded audio, external unloaded paths, browser runtime-only imports, missing/unresolved items and project media.
- Native Collect Media copies external audio beside a saved `.pocketdaw` file under `project-media/` and updates media-pool refs to durable project media.
- Native Reload and Relink can refresh project/external audio buffers in the installed app.
- Build Native Cache writes generated-section and runtime-loaded audio WAV assets beside a saved project under `project-cache/native-audio/`.
- Native render-cache metadata records stable `assetRelativePath`, `nativePath`, sample metadata, `sourceHash`, byte length and `durableCacheReady` state inside optional `project.renderCache` metadata.
- Native render-cache prewarm can build generated-section stem WAV assets while idle in the installed app, so ready caches are preferred without blocking the Play command.
- Runtime-loaded audio clips can be encoded into native WAV asset regions for CPAL playback when their decoded buffers are available.
- Native playback diagnostics now report cached asset/region counts, render-cache metadata count, hit/miss counts, procedural fallback events, runtime-audio region misses, prewarm state and discarded stale builds.
- Pocket Audio Core convergence is documented, with a small rendered-event adapter added while the real core package/branch remains absent from this checkout.
- Live playback now returns to the loop start when the playhead reaches the loop end.
- Track mute, solo, volume and pan editing.
- Timeline and mixer track headers expose `M`, `S`, `R` and `Monitor` controls for live audio tracks; arming is limited to one live track at a time.
- Undo/redo for clip and mixer edits.
- Web Audio lookahead playback scheduler remains as a browser/dev fallback, not the product playback target.
- Generated drums, bass, chords, melody and guitar are audible when source data exists.
- Offline full-song WAV export.
- Full-song MIDI export with separate drums, bass, chords, melody and guitar tracks.
- Autosave/recovery through browser local storage as an emergency recovery path rather than the main project workflow.
- Tests for PCS1 decoding, raw JSON import, timeline conversion, roundtrip, migrations, section lengths, unknown-field preservation and export profile presence.

## v0.1.1 Controls + Feedback

- Mixer controls are now labeled as Volume and Pan.
- Pan readouts show center/left/right values.
- Mute and Solo buttons use full labels.
- Track strips show Active, Muted, Solo or Inactive state.
- Mixer meters are now live audio peak meters instead of static volume bars.
- Transport shows Playing/Stopped state and a clearer bar readout.
- Timeline grid supports click-to-seek by bar.
- A compact Controls panel explains import, transport, timeline, mixer, save and export controls.

## v0.1.2 Playback Stability + Debug

- Playback ticks now update only live DOM readouts for playhead, meters and transport state instead of re-rendering the whole app every beat.
- The audio engine no longer advances via a wall-clock fallback when the AudioContext is not actually running.
- Scheduler tick updates are throttled to reduce playback CPU load.
- Guitar generated events now carry the imported guitar tone and use a clearer, louder generated guitar voice.
- Added an Export Diagnostics button for capturing project, UI, mixer and audio scheduler state as JSON.
- Added a debug native build script: `npm run tauri:debug`.

## v0.1.3 Workflow Core + FX + Audio I/O Probe

- Added DAW-style keyboard controls, including Space play/pause, Home Bar 1, M/S/R track controls, clip movement, duplicate/delete, zoom, save/open/export and Add Track.
- Added Pause semantics so Space preserves the playhead; Stop and Bar 1 remain explicit reset controls.
- Added Add Track for Live Vocals, Live Instrument and Chordsmith instrument roles.
- Added schema v2 with per-track FX chains and audio device settings.
- Added built-in Web Audio FX chains with utility, filters, EQ, dynamics, saturation, delay, reverb, modulation and tremolo/autopan options.
- FX Return no longer exposes mute/solo; Master no longer exposes solo.
- Added native Tauri/CPAL audio device probing for WASAPI-visible devices, with browser MediaDevices fallback in dev mode.
- Prepared `generated-pattern`/Chordsmith beat sequencer boundaries for the next v0.2 editor milestone.

## v0.1.4 Visual Sequencers + Compact Import Fix

- Added selected-section Chordsmith visual editing inside the Pocket DAW inspector.
- Chord progression, section length, drum grid, bass notes, melody notes and guitar pattern steps can now be edited from Pocket DAW.
- Edits update the preserved Chordsmith normalized source while keeping unknown imported fields intact.
- Section length edits resync generated-section clip lengths, marker positions and timeline bar count.
- Visual sequencer edits flow through the existing undo/redo, autosave, playback, WAV export and MIDI export paths.
- Added tests for edited section/chord/drum/bass/melody/guitar data roundtripping and rendering into events.
- Fixed compact Pocket Chordsmith v16 imports so 64-step section arrays keep their original timing instead of being stretched out of the audible section window.

## v0.1.5 Native Workflow + Render Pipeline Foundation

- Added defensive Tauri native project file commands for Open, Save and Save As.
- Save writes back to the current native project path when one exists; Save As chooses a new path and updates the app's current file label.
- Open accepts `.pocketdaw` and JSON project files in the native shell, while the browser file picker remains the fallback for preview/dev mode.
- Recent projects can now retain both user-facing labels and native paths when available.
- Added a compact desktop-style menu strip wired through the same shared action dispatch as toolbar buttons and shortcuts.
- Refactored timeline rendering into clip resolvers: `generated-section` is now one resolver, while future `generated-pattern`, `midi`, `audio`, `automation` and `marker` clips safely render no events until implemented.
- Loop playback now seeks back to the loop start when playback reaches the loop end, without relying on full app rerenders per tick.
- Added tests for native file bridge behavior, menu action wiring, unsupported clip-type safety and loop seek calculations.

## v0.1.6 Timeline, Transport and Editing Feel

- Improved timeline seeking so the ruler/grid can be clicked or dragged for scrub-style playhead movement.
- Added a visible cursor line distinct from the live playhead and selected clip outline.
- Transport now shows a clearer bar/beat readout instead of only a decimal bar.
- Added UI snap mode for Bar, Beat and Off; toolbar clip movement respects the selected snap while keyboard arrows remain whole-bar movement.
- Added split selected clip at playhead.
- Added generated-section trim start/end controls, with source-offset metadata so trimmed/split clips affect playback and export windows.
- Added copy/paste selected clip at the playhead.
- Added loop-to-selected-clip and clear-loop actions.
- Added a marker lane with add-at-playhead, rename and delete actions.
- Added shortcuts for split, loop selected, add marker and clip copy/paste.
- Added tests for split, trim, loop-to-clip, marker roundtrip/delete, snap helpers and generated clip render-window behavior.

## v0.1.7 Media Pool Foundation and Visual Material Browser

- Added a visible Media Pool panel between the mixer and import area.
- Media Pool items now display name, kind, duration, sample rate, channel count, file size, URI, missing/external/project status and linked render cache entries.
- Added guarded Import Audio, Import MIDI and Add Rendered Stem buttons with disabled states so unfinished import/playback features are not presented as complete.
- Expanded `src/daw/mediaPool.ts` into pure helpers for create, add, find, metadata update, item patching, missing/unresolved marking, external marking, safe unused removal, status reporting and render-cache relationship lookup.
- Media metadata preserves unknown future fields during updates.
- `.pocketdaw` roundtrip preserves media pool and render cache entries.
- Migration continues to initialize empty media pool and render cache arrays for older projects.
- Added tests for media pool helpers, render-cache links, metadata preservation, project roundtrip, old-project migration and visible Media Pool UI.
- Audio-file clip playback, waveform decoding and real MIDI/audio import remain later phases.

## v0.2.0 Chordsmith Parity Editor Expansion

- Expanded the Chordsmith inspector editor beyond selected-clip-only editing with Follow Clip and manual Section A-H targeting.
- Added page controls for full-section step editing, so longer imported sections can be edited past the first visible slice.
- Added source-backed global controls for key, scale, BPM and swing.
- Time signature and resolution remain visible/preserved but guarded from editing in this pass because changing them safely requires resampling section grids.
- Melody editing now supports lane selection plus instrument, octave, pan, mute and solo controls.
- Melody note edits now preserve and expose hold, slide and tuplet rows.
- Bass editing now exposes auto/manual mode plus manual note, hold, slide and accent rows.
- Drum editing now uses clearer lane labels and exposes tuplet rows while preserving imported rhythm detail.
- Guitar editing now exposes enabled, tone, register, strum mode and volume controls plus pattern editing.
- Expanded original Chordsmith source-shadow sync so supported parity edits roundtrip through `sourceRefs[].original` without dropping unknown future fields.
- Added tests for later-page step edits, globals, melody lane settings, guitar settings, source preservation and UI controls.

## v0.2.1 Release Hygiene, Packaging and Native Verification Prep

- Bumped package, schema-export version and native app metadata to v0.2.1 while leaving schema version 2 unchanged.
- Replaced the PowerShell-only browser preview zip step with a cross-platform Node packager using `adm-zip`.
- Browser preview zip names now come from `package.json`, for example `releases/pocket-daw-browser-preview-v0.2.1.zip`.
- Preview packages include `index.html` at the zip root, built assets and current docs.
- Release docs in `releases/` are refreshed from the root docs whenever `npm run package:preview` runs.
- Added `npm run verify:release` to run tests, production build, browser preview packaging and native debug verification when `cargo` is available.
- Reviewed frontend/Rust native project file command names: `open_project_file`, `save_project_file_as` and `write_project_file` match.
- Added defensive validation for malformed native open/save payloads while preserving browser fallback behavior.
- Added tests for preview zip naming/root contents and native open/cancel/error behavior.

## v0.3.0 Audio Media Import and Audio Clip Foundation

- Added native-aware audio import with a Tauri audio file picker/read command and browser file-input fallback.
- Supported first-pass extensions are `.wav`, `.mp3`, `.ogg`, `.flac`, `.aiff` and `.aif`, subject to the current Web Audio decoder.
- Added a runtime-only audio buffer cache keyed by `mediaPoolItemId`; decoded `AudioBuffer` data is not serialized into `.pocketdaw`.
- Imported audio creates `audio` Media Pool items with name, URI/path where available, MIME type, duration, sample rate, channel count, size and waveform peak metadata.
- Browser-preview imports are marked runtime-only because the selected file bytes are not safely persisted in the project file.
- Added Place on Timeline for audio Media Pool items; it creates an audio track if needed and an `audio` clip linked to the media item.
- Added audio region rendering alongside generated note events, with source offset, duration, gain and basic fade fields prepared in clip metadata.
- Live playback schedules decoded audio clips at natural speed and seeks into clips by source offset when playback starts inside them.
- Offline WAV export includes decoded audio clips when their runtime buffers are available.
- Missing or undecoded audio media is skipped rather than crashing playback/export.
- Media Pool and timeline now show lightweight waveform-style previews for imported audio.
- Import MIDI and rendered-stem actions remain guarded for later prompts.
- Added tests for audio media creation, project roundtrip, audio clip placement, audio region calculation, missing media warnings and updated Media Pool UI.

## v0.4.0 MIDI Clips and Piano Roll Foundation

- Added native-aware MIDI import with a Tauri `.mid`/`.midi` file picker/read command and browser file-input fallback.
- Added a small Standard MIDI File parser for PPQ-timed format 0/1 files, note on/off events, track names, tempo and time signature metadata.
- Imported MIDI creates `midi` Media Pool items plus a linked `midi` timeline clip on a MIDI track.
- MIDI clip note data is stored in `.pocketdaw` clip metadata so imported notes survive save/open roundtrips.
- Timeline rendering now shows MIDI clips on MIDI rows with a compact note strip.
- Live playback and offline WAV export schedule MIDI clip notes through the built-in preview synth.
- The selected MIDI clip inspector includes a compact piano-roll foundation for adding, deleting, moving, transposing, resizing and velocity-editing notes.
- Unsupported MIDI events such as controllers, program changes, aftertouch, pitch bend and sysex are ignored without crashing and counted in metadata.
- Added tests for MIDI parsing fixtures, unsupported event handling, import-to-media-and-clip behavior, note edit helpers, render events and UI editor markup.

## v0.5.0 Automation, Mixer Routing and Export Foundations

- Expanded automation helpers for lane creation, point add/update/delete, clamped evaluation, hold/linear curves and track volume/pan target paths.
- Added selected-track automation UI for Volume multiplier and Pan lanes, including enable/disable, add-at-playhead, point value/bar edits and deletion.
- Live playback applies automation on scheduler ticks with smoothed gain/pan updates, without forcing full app rerenders.
- Offline WAV export applies track volume/pan automation at a fixed useful render resolution.
- Added bus track creation, return track creation, output routing to Master or bus tracks and routing-cycle protection.
- Bus routing is respected in live playback and offline WAV export. Full send/return processing remains guarded.
- Added stem export planning for Drums, Bass, Chords, Melody, Guitar, Audio tracks and MIDI tracks.
- Stem WAV export renders each stem as a sequential browser download by reusing offline render with filtered audible tracks.
- Added section-loop WAV export with section ID/name, start/end bars, BPM, key, scale, time signature, loop duration and intended pack paths.
- Added Godot adaptive pack and web game pack ZIP exports with project metadata, source project JSON, rendered full mix, stems, section loops, markers and deterministic pack paths.
- Added tests for automation helpers/evaluation, routing helpers/cycle prevention, export job helpers/manifests and roundtrip preservation.

## v0.5.1 Release Hardening, Layout and Handoff

- Bumped app, package and native metadata to v0.5.1.
- Fixed the shell layout by replacing the old six-row grid with explicit top-level zones for menu, transport, studio, mixer, export, media and import.
- Bounded the mixer and let export/media/import panels auto-size so timeline, mixer, export panel, media pool and import controls no longer compete for the same fixed rows.
- Added UI smoke coverage for layout-zone order.
- Added PocketHandoff envelope ingestion for URL query/hash, raw hash envelope, `window.name`, localStorage and legacy import params.
- Added successful handoff cleanup so URL/window/storage payloads do not re-import on reload.
- Historical v0.5.1 note: Godot and web-game exports were labelled as JSON-only previews at that point; current builds export collected pack ZIPs.
- Clarified stem export as one WAV download per stem in sequence.
- Expanded Media Pool status wording and added a disabled `Reload Media` scaffold for external audio that needs a future relink/reload flow.
- Added `tauri:build` and `verify:native-release` so full native release bundling is available as an explicit release check.
- Added `docs/V0_5_1_HARDENING_NOTES.md` and `docs/POCKET_AUDIO_CORE_CONVERGENCE_REVIEW.md`; preview packages now include those docs under `docs/`.

## v0.6 Foundation Readiness

- Added `docs/v0.5.1-verification.md` as the explicit verification gate with Windows installer/manual checks marked NOT RUN where they were not performed.
- Added private-alpha release docs: `PRIVATE_ALPHA_RELEASE_CHECKLIST.md`, `RELEASE_NOTES_TEMPLATE.md` and `WINDOWS_TESTING_CHECKLIST.md`.
- Added `docs/V0_6_FOUNDATION_NOTES.md` and `docs/RECORDING_PREP.md` to track media persistence, export pack, handoff, parity fixture and recording prerequisites.
- Media Pool now has a deterministic collect-media plan export that separates copyable external files, project media and blocked runtime-only/missing media.
- Game manifests now use deterministic pack paths under `audio/full/`, `audio/stems/`, `audio/sections/`, `manifests/` and include warnings for runtime-only/missing media and muted tracks.
- Pocket Chordsmith now has a visible `Send to Pocket DAW` handoff path using PocketHandoff URL/window/localStorage/clipboard fallbacks.
- Added PCS parity fixtures covering simple loops, multi-section timing, manual bass, multi-lane melody tuplets/slides and guitar/global metadata.
- Recording moved from placeholder to a v0.6.0 installed-app alpha slice: one armed mono live track, monitor toggle, metronome/count-in and project-media WAV clip creation.
- Added a safe `src/audio/pocketAudioCoreAdapter.ts` bridge for future Pocket Audio Core alignment without replacing the current playback/render engine.

## Browser preview

Run:

```powershell
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Packaging status

Release hygiene commands for this pass:

```powershell
npm run verify:versions
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run verify:itch
```

Current v0.6.6 local release verification target:

- `npm run verify:versions`: checks package, lockfile, Tauri, Cargo and schema version sync.
- `npm test`: runs the automated TypeScript/Vitest suite.
- `npm run build`: runs TypeScript and Vite production build.
- `cargo test --manifest-path src-tauri/Cargo.toml`: runs the native Rust test suite.
- `npm run package:preview`: writes the browser preview zip for local/dev preview only; it is not a public Pocket DAW app distribution channel.
- `npm run package:itch`: builds/stages installer artifacts, updater `.sig` files, release docs, manifest and checksums.
- `npm run verify:artifacts`: verifies generated hashes, ZIP layout, forbidden files and signing policy.
- `npm run verify:itch`: runs the local release gate with no upload.

Primary itch release artifacts are generated under:

```text
releases/itch/installers/Pocket DAW_0.6.6_x64-setup.exe
releases/itch/installers/Pocket DAW_0.6.6_x64-setup.exe.sig
releases/itch/installers/Pocket DAW_0.6.6_x64_en-US.msi
releases/itch/installers/Pocket DAW_0.6.6_x64_en-US.msi.sig
releases/itch/pocket-daw-release-manifest-v0.6.6.json
releases/itch/CHECKSUMS_SHA256_v0.6.6.txt
releases/itch/FINAL_RELEASE_VERDICT_v0.6.6.md
```

The installed Windows setup/MSI artifacts are the public itch artifacts. The browser preview ZIP is a local/dev preview helper, not the Pocket DAW public distribution target.

The native Windows debug app can be checked with:

```powershell
npm run tauri:debug
```

If the shell cannot find the Rust toolchain, prepend Cargo to PATH first:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
npm run tauri:debug
```

Historical installers and debug executables may remain in `releases/`, but they are not current v0.6.6 alpha artifacts unless regenerated by `npm run package:itch`. Native save/open dialogs, native audio import and native MIDI import are implemented through defensive Tauri commands with browser fallbacks, and installed Windows smoke evidence is tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`.

## Manual checklist

- Load demo project.
- Paste a PCS1 code.
- Load a PocketHandoff URL or `window.name`/localStorage payload and confirm it imports once, then does not re-import on reload.
- Import raw JSON.
- Press play.
- Mute drums.
- Solo bass.
- Move a section clip.
- Change snap mode between Bar and Beat.
- Duplicate a section clip.
- Copy and paste a section clip.
- Split a section clip at the playhead.
- Trim the start and end of a generated-section clip.
- Delete a section clip.
- Enable loop region.
- Set loop to the selected clip.
- Clear loop.
- Add, rename and delete a marker.
- Confirm the Media Pool empty state is visible.
- Confirm the timeline, mixer, export panel, media pool and import controls occupy separate visible zones without overlap.
- Import a MIDI file and confirm a MIDI Media Pool item plus MIDI clip appear.
- Select the MIDI clip and edit notes in the piano-roll inspector.
- Select a track, create Volume automation, add/edit/delete a point and confirm playback volume changes.
- Create a Bus track, route Bass or Melody to it, and confirm playback/export still works.
- Export Stem WAVs and confirm sequential downloads are produced.
- Export Section Loop WAVs, Godot Game Pack and Web Game Pack; inspect the JSON metadata inside each pack.
- Confirm Add Rendered Stem remains disabled/guarded.
- Confirm external unloaded audio shows a guarded Reload Media scaffold instead of pretending relink is complete.
- Open a project with media pool entries and confirm metadata/status/cache links survive save and reopen.
- Create a New Project.
- Open a `.pocketdaw` or JSON project.
- Save `.pocketdaw`.
- Save As to a different `.pocketdaw` path in the native shell.
- Reopen `.pocketdaw`.
- Export WAV.
- Export MIDI.
- Open Audio Settings and refresh device list.
- Add a Live Vocals track.
- Add FX to a track and export WAV.

## v0.2.1 release QA checklist

- Create a New Project.
- Open a `.pocketdaw` file.
- Save to the current project path in the native shell.
- Save As to a new `.pocketdaw` path in the native shell.
- Confirm recent project labels and native paths are shown correctly.
- Confirm browser fallback open/save still works outside Tauri.
- Run `npm run package:preview`.
- Confirm `releases/pocket-daw-browser-preview-v0.2.1.zip` exists.
- Confirm the preview zip has `index.html` at the root.
- Run `npm run verify:release`.
- Mark native Tauri project dialogs verified only after checking them in `npm run tauri:dev` or a packaged Windows build.

## v0.3.0 audio QA checklist

- Import a small `.wav` file in browser preview.
- Confirm the audio item appears in the Media Pool with duration, sample rate, channels, size and waveform preview.
- Place the audio item on the timeline.
- Press play and confirm the audio clip is heard when the runtime buffer is still loaded.
- Seek into the middle of the audio clip and confirm playback starts from the matching source offset.
- Export WAV and confirm decoded audio clips are included.
- Save and reopen `.pocketdaw`; confirm media metadata persists but browser-selected bytes are not embedded.
- In native/Tauri, import an audio file and confirm the Media Pool stores the native path/URI.
- Confirm unsupported formats show a friendly decode error and do not crash.

## v0.4.0 MIDI QA checklist

- Import a small `.mid` file in browser preview.
- Confirm the MIDI item appears in the Media Pool with note count and PPQ metadata.
- Confirm a MIDI clip appears on the timeline and the inspector shows the piano-roll editor.
- Add, delete, move, transpose, resize and change velocity for at least one note.
- Press play and confirm MIDI clip notes are audible through the preview synth.
- Export WAV and confirm MIDI clip notes are included.
- Save and reopen `.pocketdaw`; confirm MIDI note metadata persists.
- In native/Tauri, import a MIDI file and confirm the Media Pool stores the native path/URI.
- Confirm MIDI files with unsupported controller/program/pitch events do not crash.

## v0.5.0 automation/routing/export QA checklist

- Select Bass, create a Volume automation lane, add a point at the playhead, set one point lower and press play.
- Create a Pan automation lane and confirm the inspector shows editable point values.
- Save and reopen `.pocketdaw`; confirm automation lanes and bus routing survive.
- Add a Bus track and route Bass to the bus, then export WAV.
- Add a Return track and confirm it is clearly scaffolded/guarded rather than pretending send processing is complete.
- Export Stem WAVs; confirm the browser downloads each planned stem sequentially.
- Export Section Loop WAVs, Godot Game Pack and Web Game Pack; confirm section WAV downloads complete and the pack ZIPs contain manifest JSON, source `.pocketdaw`, full mix, stems, section loops and markers.

## v0.5.1 hardening QA checklist

- Confirm the first screen shows distinct menu, transport, studio, mixer, export, media and import zones.
- Confirm the mixer scrolls inside its own zone when many track strips are present.
- Confirm export/media/import panels stay below the mixer and do not overlap each other.
- Open a URL with `?pcs1=` or `#pcs1=` and confirm Pocket DAW imports the payload once.
- Open a URL with a PocketHandoff envelope and confirm the URL is cleaned after successful import.
- Historical v0.5.1 check: Godot/Web exports were JSON-only then; current builds should show game-pack ZIP export controls.
- Confirm external audio with a known path but no runtime buffer shows `External unloaded`.
- Confirm browser-only imports still show as runtime-only after reopening a project without embedded bytes.
- Run `npm run verify:native-release` on a machine with Cargo/Tauri available before distributing native test builds.

## Current editor boundary

## v0.5.2 Desktop Audio Pivot

- Pocket DAW is now treated as an installable computer app, not a Web Audio product.
- Installed playback attempts the native CPAL backend first for generated Chordsmith and MIDI-preview rendered events.
- Web Audio remains available only as a fallback when the Tauri/native command path is unavailable.
- The diagnostics export reports `playbackBackend`, `nativeAudio`, scheduler gaps, late/skipped events, graph reconfigure counts, project sync mode and `renderCountDuringPlayback`.
- Mixer volume, pan, mute and solo update native track controls without rebuilding the project.
- Badly late Web Audio fallback drums/hats are skipped instead of bunched at the current audio time.
- The native playback path is still a first event-synth implementation, not final parity instruments or native audio-file streaming.
- Audio-file import still depends on WebView decoding and runtime buffers; native Symphonia-style decoding is the next desktop-grade step.

v0.5.2 moved generated playback out of the browser timing path, but Pocket DAW is still not a full professional mixing/export console. Automation is limited to track volume multiplier and pan; there are no drawn lanes, FX-parameter automation, tempo automation or automation clips. Bus routing is supported, but full send/return processing is still guarded. Stem and standalone section-loop export still use sequential browser WAV downloads; Godot/web-game exports now produce collected ZIP packs with manifest metadata, source project JSON, full mix, stems and section-loop WAVs. Audio clips still have no time-stretching/warping, no recording, no waveform editing and no persistent native decoded media cache. Runtime-loaded audio clips can now feed native WAV regions, but durable native decode/streaming is still a later desktop-grade step.

## What should come next

- First priority after the collected Godot/Web pack slice: manually smoke the ZIP contents in Godot/web-game import workflows and then add push-to-Godot or native pack destination selection.
- Keep this export-pack path ahead of deeper recording work, ASIO, simultaneous multitrack capture, or broad DAW editor expansion.
- Manually verify native Open, Save and Save As inside `npm run tauri:dev` or a packaged native build.
- Manually verify that packaged playback diagnostics show `playbackBackend: native-cpal` while scrolling, dragging mixer controls and editing Chordsmith steps.
- Add installer signing/version metadata polish.
- Extend Pocket Chordsmith to Pocket DAW push/handoff into a polished cross-app button flow and live-host smoke test.
- Add Pocket DAW to Godot push/export workflow.
- Add multi-select, cut and select-range editing when the timeline model is ready for it.
- Add stronger live preview from any clip edge/selection and better scrub-audition behavior.
- Add Chordsmith FX and sidechain parity controls after the core musical lanes stay stable.
- Add timeline visualisation for generated and audio material: waveform-style previews for audio clips, plus useful energy/note-density lanes for generated Chordsmith tracks.
- Add a drum-track branch/explode workflow: double-click a generated Drums track or clip to create separate Kick, Snare, Hat and future kit-piece tracks with independent volume, pan, gate, FX and routing.
- Bring over all live-playback Pocket Chordsmith drum instruments and kit variations so branched drum tracks can use the same source sounds rather than a reduced DAW-only kit.
- Add longer-form performance tracing for expensive arrangements.
- Manually verify project-relative media collect/reload/relink in the packaged app and harden edge cases from real projects.
- Replace sequential stem downloads with browser-safe zip packaging or a native pack exporter.
- Expand export profiles beyond WAV/MIDI to support multiple formats, sample rates, bit depths, channel modes and bitrate/quality targets.
- Render individual section-loop WAVs and bundle them with Godot/web-game manifests.
- Add richer clip transform behaviour for transpose, gain and stem mutes.
- Hydrate native playback from persisted `project-cache/native-audio` WAVs on project open, so reopening a cached project does not need to rebuild section stems.
- Add voice/instrument recording once native file/audio persistence is ready, including simultaneous multitrack recording on multi-input hardware.
- Add per-track mono/stereo recording mode and hardware input assignment for live audio tracks.
- Expand MIDI import into a deeper DAW feature: robust multi-track import, channel/instrument mapping, tempo-map handling, controller preservation, drum-lane mapping and richer piano-roll editing.
- Move imported audio-file decoding and streaming into Rust/native code, then replace the first CPAL event synth with cached samples, rendered voice assets or a hybrid sample/synth backend where it improves desktop DAW reliability without removing editability.

## Sample-backed playback lessons

Pocket DAW should reuse the Godot addon's `audio/web_kit` sample set as a seed library for the first sample-backed generated engine. The most immediately useful assets are the drum one-shots (`kick`, `snare`, `hat`, accent/open variants, `clap`), guitar articulation hits (`guitar_chug`, `guitar_open`, `guitar_accent`, `guitar_scratch`), stingers, and the basic bass/chord/melody preview tones. Treat these as bundled preview/performance assets, not the final high-fidelity instrument library.

The Godot addon also gives Pocket DAW a proven implementation pattern: preload/cache small WAVs before playback, trim silent tails, keep gain maps per sample/layer, drop badly late hits instead of playing catch-up bursts, keep verbose pitch/sample logging off during playback, and route drum/guitar/melody/bass/chord material through stable buses instead of rebuilding work per note.

Pocket Chordsmith web can borrow the same lightweight lessons without becoming a DAW: cache generated buffers, prewarm common kits after first user audio unlock, avoid console logging in dense playback, drop very late hits instead of bunching them, and prefer sample-backed drums/guitar articulations where they preserve the Pocket Chordsmith sound with less CPU.

## v0.5.3 Editor Stability

- Chordsmith sequencer edits snapshot/restore intentional scroll panes so the inspector no longer jumps to the top after step clicks.
- Drum, bass and melody step clicks patch the visible step cell directly instead of replacing the whole shell for every edit.
- Chordsmith editor changes now use the composition-event sync path, keeping project-load sync reserved for open/import/new/demo-style changes.
- Native CPAL playback bypasses stale pre-render WAV regions after live Chordsmith edits and restarts from the current position using updated procedural events.
- Diagnostics now report native render-cache bypass state, build count, last build duration and last build reason.
- Native render-cache prewarm now avoids building cache assets directly inside the Play command; deeper worker/Rust cache building remains a follow-up.
- `docs/v0.5.3-editor-stability.md` tracks the manual smoke focus and the remaining limitation that persistent cache storage/native decode still need a later pass.

## v0.5.4 Native Cache Foundation

- Bumped app/package/native metadata to v0.5.4 while keeping the persisted project schema at version 2.
- Native cache assets now carry stable project-relative WAV targets under `project-cache/native-audio/`.
- Added Tauri commands to write/read native cache WAV assets with path traversal protection.
- Added a Build Native Cache media command for saved projects; it renders generated section stems and runtime-loaded audio clips, writes WAV assets, merges optional render-cache metadata, and saves the project refs.
- Native playback payloads remain backward-compatible and still carry in-memory WAV bytes for the current CPAL region player.
- Persistent cache hydration from disk was the next cache step in v0.5.4; v0.5.5 added guarded hydration for valid saved WAV cache assets.

## v0.5.8 Itch Release Readiness

- Bumped app/package/native metadata to v0.5.8 while keeping persisted project schema version 2.
- Added earlier Windows itch packaging experiments; current policy supersedes them with installer-only distribution under `releases/itch/installers/`.
- Refined timeline defaults for the updater test build: 240 px/bar startup zoom, live zoom slider resizing, and row/ruler layering so track headers scroll under the bar/time ruler instead of covering it.
- Fixed inline Chordsmith sequencer rows so drum, bass, melody and guitar grids start exactly on bar 1 with no text-label offset.
- Moved inline lane labels into the left track header and added direct timeline controls for BPM, key, scale, time signature, sequencer resolution and Add Section.
- Added release manifest, SHA-256 checksum generation, artifact verification and a final verdict file.
- Added free itch page copy and a table-based Windows smoke checklist.
- Current policy makes installers the only public Pocket DAW distribution path.
- Added a guarded butler push script that refuses to upload unless `PUBLISH=1` is set.
- Hardened string-rendered UI output against malicious project-controlled IDs, colors, names, media fields and automation IDs.
- Normalized loaded `.pocketdaw`/JSON tracks, clips, media, markers and automation lanes to prevent render/layout crashes.
- Added project, MIDI, audio and native-cache size limits before whole-file reads.
- Added persisted native cache hydration from saved `project-cache/native-audio/*.wav` files when source hashes match, with diagnostics for hydrated, stale, invalid and failed cache entries.

## v0.5.9 Alpha Testing Release

- Updated app/package/native metadata to v0.5.9 while keeping persisted project schema version 2.
- Published/uses the alpha-testing itch installer channel at `samfa12/pocket-daw:windows-installer`.
- Added `docs/ALPHA_TESTING_RELEASE_STATUS.md` as the current public alpha status anchor.
- Added a Pocket DAW app README that points testers to itch, the updater endpoint and local verification commands.
- Treats Pocket DAW as installed-app only for public alpha testing; updater confidence comes from the installed app.
- Published the GitHub updater release `pocket-daw-v0.5.9-updater-test` with `pocket-daw-latest.json`, setup EXE, `.sig`, checksums and release notes.
- Added resizable timeline workspace controls so the mixer moves lower as the timeline grows.
- Added inspector hide/show and inspector width resize controls.
- Added generated-section drag rails: cyan for snap-move, green for linked repeat/extend copies.
- Added Ctrl/Meta-wheel and touch/pinch timeline zoom handling.
- Added native titlebar-safe spacing so the desktop menu remains visible in the installed Windows shell.
- Updated README and release docs from WIP/private-alpha wording to public alpha testing wording.
