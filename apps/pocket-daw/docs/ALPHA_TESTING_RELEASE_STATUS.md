# Pocket DAW v0.6.34 Alpha Testing Release Status

Pocket DAW is now live for public Windows alpha testing on itch and linked from `samfa12.com`.

This file records the current source baseline and the latest completed public installed-release evidence. Current source target is `0.6.34` bass parity/cache alpha. The machine-readable current status is `../release-status.json`; regenerate `CURRENT_RELEASE_STATUS.md` with `npm run status:release`.

## Current Source Baseline

- Version: `0.6.34`
- Source delta after published `0.6.31`: Pocket DAW generated bass parity work for the installed/native path. Native cached/procedural bass now uses Chordsmith-style harmonic low-pass filtering for richer waves, keeps accented release tails alive, and bumps the native render-cache contract so old generated bass stems are rebuilt.
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Primary itch channel: `windows-installer`
- Updater manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Bootstrapper manifest endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-bootstrapper-latest.json`
- Release artifact status: `0.6.34` is the current public GitHub updater release and itch bootstrapper target.
- Published source commit: `1b89374ac9a7c53cca3ea936909db62984de9031`.
- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.34`
- Itch channel status: `samfa12/pocket-daw:windows-installer` reports user version `bootstrapper-0.6.34`.
- Itch launch fallback: the bootstrapper upload includes `index.html` linking to `Pocket_DAW_Itch_Bootstrapper_v0.6.34.exe` so itch browser-mode requests no longer fail with `asset not found: index.html`.

## Current Local Artifact Record

The current installed-smoke artifact record is `0.6.34`. Local artifacts passed automated verification and installed-app smoke through MCP and user listening; the public GitHub updater artifact was then published from clean `main` and verified by downloading the latest manifest setup URL.

- Public updater setup EXE `Pocket.DAW_0.6.34_x64-setup.exe`: `89625636a3e68c9162e0dd3ea5a5f48f12673d2cfc439dab03134c6ddcb75f67`
- Local installed-smoke setup EXE `Pocket DAW_0.6.34_x64-setup.exe`: `67665c5917a3b6c3a102daa066fd463ec2750ed1eed502d99577c62c6b58e20d`
- Local smoke project: `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`
- MCP live bridge reported app/project version `0.6.34`, full generated native cache coverage after rebuilding stale cache entries, and no generated stem render failures.
- Playback/performance smoke reported native-cpal playback with no scheduler misses, no late/skipped events, no graph rebuild spikes, no native fallback, and `slowCallbackCount` 0.
- User listening smoke confirmed: "IT SOUNDS BETTER!!"

Current completed public updater artifact record:

- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.34`
- Itch channel `samfa12/pocket-daw:windows-installer` build `#1755005`, user version `bootstrapper-0.6.34`.
- Setup EXE `Pocket.DAW_0.6.34_x64-setup.exe`: `89625636a3e68c9162e0dd3ea5a5f48f12673d2cfc439dab03134c6ddcb75f67`
- Release target commit: `1b89374ac9a7c53cca3ea936909db62984de9031`
- Release asset count: `10`
- Latest updater manifest reports version `0.6.34`.
- Laptop itch bootstrapper smoke: Sam manually installed the bootstrapper from itch, used it to reinstall Pocket DAW on a laptop, and confirmed it works great.

Previous completed public updater artifact record:

- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.21`
- Setup EXE `Pocket.DAW_0.6.21_x64-setup.exe`: `e69c57292bbb4f29a9d3f6ec36bd78346249f30c4f48932f071dfffcdc1412d8`
- Setup EXE Tauri updater signature `Pocket.DAW_0.6.21_x64-setup.exe.sig`: `63b1cab939c3b1c8f962da81c318349d5c821a08a5b5f4608f2b54c646b80c10`
- MSI `Pocket.DAW_0.6.21_x64_en-US.msi`: `117cbb2b7b17f3c06cada3805175e5b2e482538d66cf240aca050e3368cccb7f`
- MSI Tauri updater signature `Pocket.DAW_0.6.21_x64_en-US.msi.sig`: `52f1d17752d66e19a493db97031158395bf0f031c749fd8b19bc9691abd1afcd`
- Release manifest `pocket-daw-release-manifest-v0.6.21.json`: `38a2d0eb3fc663654fe69044d5c28724149be8dbbc16cba6053911345b7a60fb`
- Bootstrapper manifest `pocket-daw-bootstrapper-latest.json` reports version `0.6.21`, installer `Pocket.DAW_0.6.21_x64-setup.exe`, and installer SHA-256 `e69c57292bbb4f29a9d3f6ec36bd78346249f30c4f48932f071dfffcdc1412d8`.
- Latest updater and bootstrapper manifests both report version `0.6.21`.

Previous completed public updater artifact record:

- GitHub release: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/tag/pocket-daw-v0.6.13`
- Setup EXE `Pocket.DAW_0.6.13_x64-setup.exe`: `a7ac2494b4bf3b96502bacfd58af3d06dc8efc17d75d297042a1ec10a0a37fc6`
- Setup EXE Tauri updater signature `Pocket.DAW_0.6.13_x64-setup.exe.sig`: `e90bad5f4a76d894f310c6574f25aa3a8be51c4ed8ee0d897ff8e845282e762a`
- MSI `Pocket.DAW_0.6.13_x64_en-US.msi`: `8ecdf68d931caedc75ef5aa55b147e946226820ec3f37b17af620030bf469676`
- MSI Tauri updater signature `Pocket.DAW_0.6.13_x64_en-US.msi.sig`: `a8eb2ca0e4dbd7d3930d83c607fb254dab93ba7695603ef7d2d3b5ad345e47c2`
- Release manifest `pocket-daw-release-manifest-v0.6.13.json`: `ec16776ae1047391723f8cbdaf206d0ec66ba420aa4168ee563a9422ef2eaadd`

Previous completed public updater artifact record:

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

Current `0.6.34` installed-app smoke status: Passed for local installer bass parity. Sam confirmed the installed DAW bass sounds better after the native renderer/cache rebuild. Public GitHub updater publication is complete; update-through-app smoke remains a useful follow-up for a currently installed older build.

`0.6.34` smoke keeps the `0.6.13` AI / MCP bridge gate. Required bridge focus for the next public updater pass: update through the installed app, open Help -> AI / MCP Bridge, enable the live bridge, run `pocket_daw_live_status` from Codex, test play/pause/stop/restart/seek, select a track/clip, apply Bass volume/pan/mute through MCP, save an already-saved project, then close Pocket DAW and confirm live tools return unavailable while file MCP tools still work.

Required installed smoke focus:

- Confirm About/Diagnostics reports app version `0.6.34` and the expected build/commit metadata.
- Re-open a Chordsmith-imported project with generated Bass, let stale native cache rebuild, and confirm the bass tone matches Chordsmith closely without the previous distorted/harsh upper harmonics.
- Confirm accented generated bass notes do not click or vanish early during cached/native playback.
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

- Public `0.6.34` GitHub updater publication is complete and tracked in `docs/CURRENT_RELEASE_STATUS.md`; do not republish a later source tree as another `0.6.34` artifact. Update-through-app smoke from an older installed build remains a useful follow-up for the next checkpoint.
- Itch remains on the existing bootstrapper upload unless the bootstrapper itself changes. Future source changes after `0.6.34` are unreleased until the next checkpoint metadata is bumped and exact-artifact smoke is recorded.
- Windows Authenticode signing is not currently claimed.
- Tauri updater signatures are present as `.sig` files for updater validation.
- Pocket Chordsmith direct "Send to Pocket DAW" is passing in the v0.5.13 installed-app smoke run; keep paste/import as a fallback for browsers that block downloads or custom protocol launches.
- v0.5.14 source changes fixed Chordsmith BPM/new-project import semantics, MIDI import/export structure, About/Diagnostics placement and update-available notification behavior.
- v0.6.0 source changes add a narrow installed-app mono recording alpha: one armed live track, saved-project prerequisite, monitor toggle, metronome/count-in and project-media WAV take creation.
- v0.6.3 source changes polish the live-recording path: armed input metering before recording, active monitor updates, timeline-scroll preservation around track controls/recording previews, transport/backing playback while recording, same-track overwrite placement for recorded takes, tidier mixer/transport UI, and darker bass playback closer to Pocket Chordsmith exported stems.
- v0.6.4 source changes add lofi/chillhop Chordsmith import compatibility, soft track presets, and a gentle lofi master-chain profile while preserving the v0.6.3 recording/mixer polish.
- v0.6.6 source changes add an updater-visible parity build on top of the v0.6.5 work: Chordsmith mix-slider handoff into DAW track/master volumes, shared sound-surface gates, DAW-vs-Chordsmith browser event parity, per-drum lane mixer/FX scaffolding, and refreshed Godot game-pack import paths.
- v0.6.7 source changes make manual Build Native Cache immediately override active native generated-track playback with cached WAV regions until source hashes change.
- v0.6.8 source changes add visible Native Playback/Native Cache readouts for cached regions, cached clips and procedural fallback events, and keep lofi texture/noise ticks from falsely driving the Drums mixer meter.
- v0.6.9 source changes restore native procedural `warm_sub`/lofi bass audibility by matching the Chordsmith/WebAudio bass output scale when cached stems are unavailable.
- ASIO support, simultaneous multitrack recording, punch-in/out, full comping/take lanes, automatic latency detection/compensation, FX monitoring, full send/return processing, bundled game export packs, and professional DAW completeness remain out of scope for the current alpha.
