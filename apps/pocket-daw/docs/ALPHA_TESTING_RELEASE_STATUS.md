# Pocket DAW v0.6.12 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

This file records the current source baseline and the latest completed public installed-release evidence. Current source target is `0.6.13` AI / MCP bridge v1.

## Current Source Baseline

- Version: `0.6.13`
- Source delta after published `0.6.12`: `Help -> AI / MCP Bridge`, token-protected live localhost bridge, and MCP live tools for status, transport, selection and safe mixer edits.
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-installer`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Release artifact status: `0.6.12` GitHub updater assets and bootstrapper assets are published; itch channel `windows-installer` now points at bootstrapper build `#1737936` with user version `bootstrapper-0.6.12`.
- Source commit at packaging time: `ea14a2c0e519119e063571db57979ea2c41b714e`.
- Generated manifest note: dirty working tree was `false`.

## Current Local Artifact Record

The current published artifact record is `0.6.12`. These artifacts passed automated verification and upload checks. Manual installed-app smoke is pending for the updater-visible MCP setup panel and the refreshed bootstrapper auto-close behavior.

- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.12`
- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737936`, user version `bootstrapper-0.6.12`.
- Setup EXE `Pocket.DAW_0.6.12_x64-setup.exe`: `5acd4f48b9f2c3b81999fa4ee058fce181932f84ef8d5b5abd2e5b0f9833a692`
- Setup EXE Tauri updater signature `Pocket.DAW_0.6.12_x64-setup.exe.sig`: `0ac228dea3869f2b3997cbce6ad6636ded0d819ebf26373bf7563ff09cec5f22`
- MSI `Pocket.DAW_0.6.12_x64_en-US.msi`: `4eefaa67516add7d0ecf46a8addeb616125d41de8d2e25ad29e3d4266e5b7335`
- MSI Tauri updater signature `Pocket.DAW_0.6.12_x64_en-US.msi.sig`: `9766f7a2deb4610e44b58101bd3e0317f2b4d8b2160799aeec87cb441a5b9212`
- Bootstrapper `Pocket_DAW_Itch_Bootstrapper_v0.6.12.exe`: `3e8ffcdceb9d76d622fe90194c52552384384a3fcc8ead0fb87cde4d976f1294`
- Release manifest `pocket-daw-release-manifest-v0.6.12.json`: `b6c0084ac77719a2c094df490f31463310dc695a98f03e6cb8560faa8bad9a0d`

Previous completed public updater artifact record:

- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.11`
- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737902`, user version `bootstrapper-0.6.11`.
- Setup EXE `Pocket.DAW_0.6.11_x64-setup.exe`: `ac1e923662fef3f9df7f3e42d97607e5862a7c392b659cc84d89e343e45816f9`
- Bootstrapper `Pocket_DAW_Itch_Bootstrapper_v0.6.11.exe`: `c1e95390938153028640915fdf8f4ee2cceb67a3867679602cd606226a65c47d`
- Release manifest `pocket-daw-release-manifest-v0.6.11.json`: `27c55bc98f70ea3c7f2bbaa3f1af0f1711dd84d49e00475fe2567613709f34a4`

Older completed public updater artifact record:

- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.10`
- Itch channel `samfa12/pocket-daw:windows-installer` build `#1737832`, user version `bootstrapper-0.6.10`.
- Setup EXE `Pocket.DAW_0.6.10_x64-setup.exe`: `c893ddcc545738c79fb72bd486b75cbe263534b466fcd4d2f593574d509fd00e`
- Bootstrapper `Pocket_DAW_Itch_Bootstrapper_v0.6.10.exe`: `5e966c6a1ef1397484ded8d5ae1f9c9bbdb5a3f3d4dd5cbc451c41ec83570e68`
- Release manifest `pocket-daw-release-manifest-v0.6.10.json`: `9f32807443c4c2927592bd35a00923fb24cf4a6a5e60f4d31993ccd26c85b350`

Older completed public updater artifact record:

- Setup EXE `Pocket DAW_0.6.9_x64-setup.exe`: `406bd7432dda5f4c3dfccb041c6e2362f5b683559476900f239ec46843d60f09`
- Setup EXE Tauri updater signature `Pocket DAW_0.6.9_x64-setup.exe.sig`: `6b6ec01f1707e2b06d5a92c86d844de5db0e89b86868cd7bcfb8e28d29a2ed8f`
- MSI `Pocket DAW_0.6.9_x64_en-US.msi`: `41220a60798fd95f9c41e2b5776f48234355203e4b3a28257b428a13bf4f085d`
- MSI Tauri updater signature `Pocket DAW_0.6.9_x64_en-US.msi.sig`: `dd1b90ff162ac69ebff91067ad9599ae9be73d4e7cd1d1cf7de0033d33db9df0`
- Release manifest `pocket-daw-release-manifest-v0.6.9.json`: `1caea3cfd20c48bc156f97d6887f5ddfa76fbeb1ada459831eb8cda80464bcc2`
- Final verdict: `GO WITH CAVEATS - ready only if caveats are acceptable`.

Older completed public updater artifact record:

- GitHub updater release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.3`
- Source commit: `d61e787c620d75664cf870f04e31eb436535dfe0` in the generated `0.6.3` release manifest.

## Alpha Testing Guidance

- Use the itch installer build for all public alpha testing.
- Launch from the Start Menu or installed shortcut; do not run Pocket DAW from an extracted app folder.
- Future updates should be tested through the installed app updater, not by manually redownloading every build.
- The app checks GitHub Releases for signed Tauri updater artifacts.
- The app must not be described as complete, professional DAW software, or Authenticode-signed unless verification proves those claims.
- Tauri updater `.sig` files are separate from Windows Authenticode signing, so SmartScreen may still appear.

## Manual Smoke Evidence

Current `0.6.12` installed-app smoke status: Pending. Sam should update/install to `0.6.12`, open Help -> Setup MCP Bridge, copy a config snippet, and verify the refreshed bootstrapper closes after launching setup.

`0.6.13` AI / MCP bridge smoke is pending until the updater checkpoint is installed. Required focus: open Help -> AI / MCP Bridge, enable the live bridge, run `pocket_daw_live_status` from Codex, test play/pause/stop/restart/seek, select a track/clip, apply Bass volume/pan/mute through MCP, save an already-saved project, then close Pocket DAW and confirm live tools return unavailable while file MCP tools still work.

Required `0.6.12` focus:

- Confirm About/Diagnostics reports app version `0.6.12` and the expected build/commit metadata.
- Re-open the reported `lofi demo project.pocketdaw`, solo Bass at 100-120%, and confirm native procedural Warm Sub Bass is audible when the native cache is not active. Passed by Sam on 2026-06-19 for installed `0.6.9`.
- Import a known lofi/chillhop Chordsmith project and confirm lofi source notes, imported Chordsmith mix/volume values, soft track presets, gentle master-chain slots, playback, save/reopen, and WAV/MIDI export behavior.
- Press Build Native Cache on the imported lofi project and confirm generated tracks play through cached WAV regions with low or zero procedural fallback events until a source-changing edit invalidates the cache.
- While native playback is running, press Build Native Cache after a generated-section edit and confirm playback restarts cleanly at the current position using fresh cached WAV regions without ongoing crackle/slowdown.
- Confirm the Media Pool Native Playback line and About/Diagnostics Native Cache line report cached regions/clips and procedural fallback events clearly before and after Build Native Cache.
- Confirm the Drums mixer meter follows actual drum hits during cached lofi playback and does not stay active solely from lofi texture/noise ticks.
- Re-run the live recording alpha smoke: saved project prerequisite, one armed live track, monitor toggle, metronome/count-in, project-media WAV take creation, and reopen/playback of the recorded clip.
- Re-check updater behavior through `Help -> Check for Updates` or startup notification when a newer signed updater release is staged.
- Confirm normal Chordsmith PCS1/raw JSON/PocketHandoff imports still work and preserve source BPM/new-project semantics.

Historical partial installed-app smoke run by Sam on 2026-06-14 against v0.5.9/v0.5.13 updater flow:

- App opened and diagnostics export worked; diagnostics reported appVersion `0.5.9`.
- Demo loaded and played audibly.
- Pasting a Pocket Chordsmith share code into Pocket DAW worked.
- Importing raw Pocket Chordsmith JSON into Pocket DAW worked.
- Saved `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`, closed/reopened Pocket DAW, reopened the saved project, and playback worked.
- Re-exported diagnostics reported Imported Chordsmith Project with 7 clips, 12 tracks, 973 generated events, `sourceRefCount: 1`, and WASAPI/native device status available.
- Updater rehearsal from v0.5.10 onward succeeded through Help -> Check for Updates; v0.5.13 is now served by the GitHub updater manifest.
- Pocket Chordsmith "Send to Pocket DAW" now succeeds in the installed v0.5.13 app after hard-refreshing Chordsmith; Pocket DAW opens/imports through the downloaded PCS1 handoff-file fallback.
- WAV export completed successfully for `C:\Users\sam_s\Downloads\imported-chordsmith-project.wav`.
- MIDI export completed to `C:\Users\sam_s\Downloads\imported-chordsmith-project.mid`; Codex structural inspection found 6 parseable tracks, 869 note-on events with matching note-offs, 4/4 time signature and clean end-of-track markers. It still needs a real MIDI-player/DAW playback check.

## Current Caveats

- Manual Windows smoke testing for `0.6.12` is pending and is tracked in `docs/WINDOWS_TESTING_CHECKLIST.md`; MCP setup panel and bootstrapper auto-close are the current published-artifact focus. `0.6.13` AI / MCP live bridge smoke joins the updater checkpoint gate.
- Itch upload for `0.6.12` is complete on `samfa12/pocket-daw:windows-installer` build `#1737936`; GitHub latest updater assets and bootstrapper assets were published and the remote setup EXE hash was verified as `5acd4f48b9f2c3b81999fa4ee058fce181932f84ef8d5b5abd2e5b0f9833a692`.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Pocket Chordsmith direct "Send to Pocket DAW" is passing in the v0.5.13 installed-app smoke run; keep paste/import as a fallback for browsers that block downloads or custom protocol launches.
- v0.5.14 source changes fixed Chordsmith BPM/new-project import semantics, MIDI import/export structure, About/Diagnostics placement and update-available notification behavior.
- v0.6.0 source changes add a narrow installed-app mono recording alpha: one armed live track, monitor toggle, metronome/count-in and project-media WAV take creation.
- v0.6.3 source changes polish the live-recording path: armed input metering before recording, active monitor updates, timeline-scroll preservation around track controls/recording previews, transport/backing playback while recording, same-track overwrite placement for recorded takes, tidier mixer/transport UI, and darker bass playback closer to Pocket Chordsmith exported stems.
- v0.6.4 source changes add lofi/chillhop Chordsmith import compatibility, soft track presets, and a gentle lofi master-chain profile while preserving the v0.6.3 recording/mixer polish.
- v0.6.6 source changes add an updater-visible parity build on top of the v0.6.5 work: Chordsmith mix-slider handoff into DAW track/master volumes, shared sound-surface gates, DAW-vs-Chordsmith browser event parity, per-drum lane mixer/FX scaffolding, and refreshed Godot game-pack import paths.
- v0.6.7 source changes make manual Build Native Cache immediately override active native generated-track playback with cached WAV regions until source hashes change.
- v0.6.8 source changes add visible Native Playback/Native Cache readouts for cached regions, cached clips and procedural fallback events, and keep lofi texture/noise ticks from falsely driving the Drums mixer meter.
- v0.6.9 source changes restore native procedural `warm_sub`/lofi bass audibility by matching the Chordsmith/WebAudio bass output scale when cached stems are unavailable.
- ASIO support, simultaneous multitrack recording, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
