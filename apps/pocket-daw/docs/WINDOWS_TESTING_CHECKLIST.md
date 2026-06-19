# Pocket DAW Windows Installed-App Smoke Checklist

Run this against the exact installed Windows alpha from itch/GitHub release artifacts. Do not use an extracted portable app folder.

Current alpha target:

- App: Pocket DAW
- Version: `0.6.9` source target; installed-app smoke for `0.6.9` is Partial
- Source commit at packaging time: `e74cb5249505e0145b462ad7b19d4f24f666b826`
- Generated manifest note: dirty working tree was `true` because the parity/release pass was uncommitted during local packaging.
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Itch channel: `windows-installer`
- Updater endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Setup EXE: `Pocket DAW_0.6.9_x64-setup.exe`
- Setup EXE SHA-256: `406bd7432dda5f4c3dfccb041c6e2362f5b683559476900f239ec46843d60f09`
- Setup EXE updater signature: `Pocket DAW_0.6.9_x64-setup.exe.sig`
- Setup EXE updater signature SHA-256: `6b6ec01f1707e2b06d5a92c86d844de5db0e89b86868cd7bcfb8e28d29a2ed8f`
- MSI: `Pocket DAW_0.6.9_x64_en-US.msi`
- MSI SHA-256: `41220a60798fd95f9c41e2b5776f48234355203e4b3a28257b428a13bf4f085d`
- MSI updater signature: `Pocket DAW_0.6.9_x64_en-US.msi.sig`
- MSI updater signature SHA-256: `dd1b90ff162ac69ebff91067ad9599ae9be73d4e7cd1d1cf7de0033d33db9df0`
- SmartScreen/code signing: Windows Authenticode signing is not currently claimed.
- Tauri updater signatures: `.sig` files are updater-validation signatures and are separate from Windows code signing.

Manual smoke status: `0.6.9` PARTIAL. Sam confirmed the reported soloed Warm Sub Bass is audible in installed `0.6.9`; the wider installed-app checklist remains pending. Historical evidence below is useful context but does not verify the current baseline.

Historical manual evidence from Sam on 2026-06-14:

- Pocket DAW opened and diagnostics export worked.
- Pocket DAW updated successfully through the installed app updater to v0.5.13.
- Demo loaded and played audibly.
- Pocket Chordsmith "Send to Pocket DAW" worked in v0.5.13 after hard-refreshing Chordsmith; the installed app opened and the sent song imported.
- Handoff/import BPM issue found: source Pocket Chordsmith project was 136 BPM, but Pocket DAW imported/exported it at 112 BPM, likely from the current DAW project/default.
- WAV export created `C:\Users\sam_s\Downloads\imported-chordsmith-project.wav` and was confirmed working by Sam.
- MIDI export created `C:\Users\sam_s\Downloads\imported-chordsmith-project.mid`; Codex structural inspection found parseable MIDI chunks/events, but playback quality was not externally verified.
- Pasting a Pocket Chordsmith share code into Pocket DAW worked.
- Importing raw Pocket Chordsmith JSON into Pocket DAW worked.
- Saved `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`, closed Pocket DAW, reopened Pocket DAW, reopened the saved project, and playback worked.
- Diagnostics evidence:
  - `C:\Users\sam_s\Downloads\untitled-project-diagnostics.json`: v0.5.9, Untitled Project, 2 clips, 7 tracks, `sourceRefCount: 1`.
  - `C:\Users\sam_s\Downloads\imported-chordsmith-project-diagnostics.json`: v0.5.9, Imported Chordsmith Project, 7 clips, 12 tracks, 973 generated events, `sourceRefCount: 1`, WASAPI/native device status available.

| Test area | Steps | Expected result | Actual result | Pass/Fail | Tester/Date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Install / launch | Clean install from the current public setup EXE or MSI. | Installer completes and creates the expected installed app entries. | Manual / Not run | Manual / Not run |  |  |
| Install / launch | Launch Pocket DAW from the Start Menu or installed shortcut. | Installed app opens without needing an extracted app folder. | App opened; exact launch surface not recorded. | Partial | Sam / 2026-06-14 | Confirm Start Menu/installed shortcut explicitly on next pass. |
| Install / launch | Launch after reboot if practical. | Installed app still launches normally after Windows restart. | Manual / Not run | Manual / Not run |  |  |
| Install / launch | Open About/Diagnostics and confirm app version/build id. | Version `0.6.9` and build/commit information are visible or explicitly unavailable. | Manual / Not run | Manual / Not run |  | Historical v0.5.13 diagnostics evidence exists, but does not verify v0.6.9. |
| Install / launch | Open and close the About/Diagnostics panel at installed-app desktop size. | Panel renders below the top menu/control bars and the close button remains clickable. | About panel rendered underneath the control bar; close control was not reachable. | Fail | Sam / 2026-06-14 | Fix next: move modal/panel down or constrain it within the visible app content area. |
| Install / launch | Uninstall, reinstall, then open the app. | Expected user data is preserved or loss/caveat is documented; reinstall does not corrupt projects. | Manual / Not run | Manual / Not run |  |  |
| Basic audio | Load Demo, press Play, then Stop and Restart. | Demo plays audibly, stops, and restarts from the expected position. | Demo loaded and played audibly. | Pass | Sam / 2026-06-14 | Stop/restart not separately recorded. |
| Basic audio | Move/scroll the timeline and open/close the inspector while playing. | No crackle/glitch, no major hitch, and playback remains usable during basic UI movement. | Manual / Not run | Manual / Not run |  |  |
| Chordsmith import | Import a PCS1 share code if supported by the public build. | Pocket Chordsmith project imports and timeline populates. | Pasted Pocket Chordsmith share code into Pocket DAW; import worked. | Pass | Sam / 2026-06-14 |  |
| Chordsmith import | Import raw Pocket Chordsmith JSON. | Project imports without dropping source fields. | Imported Pocket Chordsmith JSON into Pocket DAW; import worked. | Pass | Sam / 2026-06-14 |  |
| Chordsmith import | Import a known lofi/chillhop Chordsmith project. | Lofi source notes, imported Chordsmith mix/volume values, soft track presets, gentle master-chain slots, playback, save/reopen and WAV/MIDI export behavior are confirmed. | Manual / Not run | Manual / Not run |  | v0.6.9 source target. Use a known lofi fixture or generated lofi template. |
| Native cache | Press Build Native Cache on the imported lofi project, then play while watching About/Diagnostics. | Generated tracks play from cached WAV regions with low or zero procedural fallback events until a source-changing edit invalidates the cache. | Manual / Not run | Manual / Not run |  | v0.6.7 performance patch focus. |
| Native cache | While native playback is running, press Build Native Cache again after a generated-section edit. | Playback restarts cleanly at the current position using fresh cached WAV regions without ongoing crackle/slowdown. | Manual / Not run | Manual / Not run |  | v0.6.7 performance patch focus. |
| Native cache | Inspect the Media Pool Native Playback line and About/Diagnostics Native Cache line before and after Build Native Cache. | The readout changes from procedural or bypassed playback to cached regions/clips and reports low or zero procedural fallback events for generated tracks. | Manual / Not run | Manual / Not run |  | v0.6.8 diagnostics patch focus. |
| Mixer meters | Play an imported lofi project with native cache active, including a sparse or no-drum section. | The Drums meter follows drum hits and does not stay active only because lofi texture/noise events are present. | Manual / Not run | Manual / Not run |  | v0.6.8 mixer-meter patch focus. |
| Mixer/audio state | Re-open the reported lofi demo project, solo Bass, and set Bass volume between 100-120%. | Warm Sub Bass is audible and the Bass meter corresponds to audible low-end/body, including when native cache diagnostics show procedural fallback events. | Bass is audible in installed `0.6.9`. | Pass | Sam / 2026-06-19 | v0.6.9 native bass hotfix focus. |
| Chordsmith import | Import PocketHandoff if supported by the public build. | Handoff imports once and does not repeat after reload. | Pocket Chordsmith "Send to Pocket DAW" worked in v0.5.13 after hard-refreshing Chordsmith; the sent song imported into the installed app. | Pass | Sam / 2026-06-14 | Uses downloaded PCS1 handoff-file fallback when localhost delivery is unavailable; paste/import fallback still works. |
| Chordsmith import | Import PocketHandoff tempo/project state. | Imported project keeps the exact source BPM and behaves as a new imported project; any open project is autosaved before replacement. | Source Chordsmith project was 136 BPM, but Pocket DAW imported/exported it at 112 BPM. Import replaced the currently open workspace. | Fail | Sam / 2026-06-14 | Fix next: preserve exported BPM exactly, import as a new project, and autosave the open project before loading handoff/import. |
| Chordsmith import | Save, close, reopen, and inspect imported source data. | Source Chordsmith data remains preserved after saving/reopening. | Saved/reopened imported project and playback worked; diagnostics report `sourceRefCount: 1` and source title `Imported Chordsmith Project`. | Pass | Sam / 2026-06-14 | Saved file: `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`. |
| Project workflow | Create/open a project, save a `.pocketdaw` file, close app, reopen app, reopen saved `.pocketdaw`. | Timeline and imported source data remain intact. | Saved imported project, closed/reopened Pocket DAW, reopened saved `.pocketdaw`, and project played well. | Pass | Sam / 2026-06-14 | Evidence diagnostics after reopen: 7 clips, 12 tracks, 973 events. |
| Editing | Move/trim/split/duplicate/delete a basic timeline clip. | Clip edits apply to the selected clip only and survive save/reopen. | Manual / Not run | Manual / Not run |  |  |
| Editing | Edit a generated section and repeat several inspector edits. | Generated-section edits are audible and inspector does not jump unexpectedly. | Manual / Not run | Manual / Not run |  |  |
| Editing | Edit drum sequencer steps while playing or after playback. | Drum edits produce audible changes. | Manual / Not run | Manual / Not run |  |  |
| Editing | Change one track/section, then inspect demo and unrelated sections. | Unrelated demo/sections do not mutate unexpectedly. | Manual / Not run | Manual / Not run |  |  |
| Mixer/audio state | Adjust track volume, mute, solo if present, and pan. | Audio/state changes match the control without corrupting other tracks. | Manual / Not run | Manual / Not run |  |  |
| Mixer/audio state | Adjust FX controls, routing/bus controls and automation if exposed. | Controls persist, export safely, and guarded scaffolds stay honest where incomplete. | Manual / Not run | Manual / Not run |  |  |
| Live recording | Save the project as a `.pocketdaw` file, then press Record without an armed live track. | App gives a friendly "arm one live audio track" message and does not create media. | Manual / Not run | Manual / Not run |  | v0.6.0 installed app only. |
| Live recording | Add Live Vocals and Live Instrument, arm one then the other. | Only one live audio track remains armed at a time; `M`, `S`, `R`, `Monitor` controls are reachable in timeline/mixer. | Manual / Not run | Manual / Not run |  | Unit-covered; installed UI still needs smoke. |
| Live recording | Refresh audio devices, choose an input, enable Monitor, and toggle it off/on. | Monitor state changes; no feedback loop occurs when monitor is off. | Manual / Not run | Manual / Not run |  | Keep speakers/headphones safe while testing. |
| Live recording | Enable metronome, press Record, wait for one-bar count-in, record 5-10 seconds, then Stop Rec. | Count-in/click is audible, WAV is written under `project-media/recordings/`, and a clip appears on the armed live track at the original start bar. | Manual / Not run | Manual / Not run |  | Mono capture only. |
| Live recording | Save, close, reopen the `.pocketdaw`, then play the recorded clip. | Recorded project-media WAV reloads and plays. | Manual / Not run | Manual / Not run |  | Confirms durable take persistence. |
| Import/export | Import an audio clip if exposed and place it on the timeline. | Media appears with clear embedded/collected/referenced/cached/missing state; audible if loaded. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Import MIDI if exposed. | MIDI item/clip appears and is readable/editable. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Export WAV and open the file in a player. | WAV file is created and playable. | Exported WAV at `C:\Users\sam_s\Downloads\imported-chordsmith-project.wav`; Sam confirmed it works correctly. | Pass | Sam / 2026-06-14 |  |
| Import/export | Export MIDI and open it in a MIDI-capable tool. | MIDI file is created and readable. | Exported MIDI at `C:\Users\sam_s\Downloads\imported-chordsmith-project.mid`; Codex structural parse found 6 tracks, 869 note-ons with matching note-offs, 4/4 and clean end-of-track markers. | Partial | Sam + Codex / 2026-06-14 | Playback quality not externally verified. File inherited incorrect 112 BPM and declares format 0 with 6 tracks, so MIDI export needs follow-up. |
| Import/export | Export stems if exposed. | Stem files are created and playable/readable. | Manual / Not run | Manual / Not run |  |  |
| Safety | Try an oversized import for project, audio or MIDI. | Friendly rejection appears before whole-file read; app does not hang/crash. | Manual / Not run | Manual / Not run |  |  |
| Safety | Open malicious/unsafe metadata fixture. | Unsafe HTML/script/event/CSS is not executed or rendered raw. | Manual / Not run | Manual / Not run |  |  |
| Safety | Open a corrupted project file. | Friendly error is shown and the app remains open. | Manual / Not run | Manual / Not run |  |  |
| Updater | Install the current public version, then stage/publish a newer signed updater release. | Update manifest is reachable and points at the staged installer artifact. | Manual / Not run | Manual / Not run |  |  |
| Updater | Open installed app and check for updates. | Updater reports the staged newer version and release notes. | Help -> Check for Updates found newer releases during the v0.5.10-v0.5.13 rehearsal. | Pass | Sam / 2026-06-14 | Startup auto-notification was not observed; manual check worked. |
| Updater | Download/install update, relaunch, and verify version. | Update installs/relaunches and version changes. | Update installed and relaunched successfully through the installed app updater; latest confirmed version is v0.5.13. | Pass | Sam / 2026-06-14 | Auto-check notification still needs separate polish. |
| Updater | Open a project saved before the update. | Previous project still opens after update. | Manual / Not run | Manual / Not run |  |  |
