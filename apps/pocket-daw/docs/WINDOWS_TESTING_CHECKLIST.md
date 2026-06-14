# Pocket DAW Windows Installed-App Smoke Checklist

Run this against the exact installed Windows alpha from itch/GitHub release artifacts. Do not use an extracted portable app folder.

Current alpha target:

- App: Pocket DAW
- Version: `0.5.9`
- Source commit: `5f67856b91a9155ad805931539719d56938d9b69`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Itch channel: `windows-installer`
- Updater endpoint: `https://github.com/Samfa12-tech/Pocket-Chordsmith/releases/latest/download/pocket-daw-latest.json`
- Setup EXE: `Pocket DAW_0.5.9_x64-setup.exe`
- Setup EXE SHA-256: `bd45352218567cb3a9ccf3166a3935c15182c6c53808b1234744858e9a7f9732`
- Setup EXE updater signature: `Pocket DAW_0.5.9_x64-setup.exe.sig`
- MSI: `Pocket DAW_0.5.9_x64_en-US.msi`
- MSI SHA-256: `5079819d323102cd1e8b186c0c63beb42ef1fee8cf353e15562e1ca36e4347fe`
- MSI updater signature: `Pocket DAW_0.5.9_x64_en-US.msi.sig`
- SmartScreen/code signing: Windows Authenticode signing is not currently claimed.
- Tauri updater signatures: `.sig` files are updater-validation signatures and are separate from Windows code signing.

Manual smoke status: PARTIAL RUN - Sam, 2026-06-14

Manual evidence from Sam on 2026-06-14:

- Pocket DAW opened and diagnostics export worked.
- Demo loaded and played audibly.
- Pocket Chordsmith "Send to Pocket DAW" did not work.
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
| Install / launch | Open About/Diagnostics and confirm app version/build id. | Version `0.5.9` and build/commit information are visible or explicitly unavailable. | Diagnostics exported from installed app; JSON reports appVersion `0.5.9`. | Pass | Sam / 2026-06-14 | Evidence files in `C:\Users\sam_s\Downloads`. |
| Install / launch | Uninstall, reinstall, then open the app. | Expected user data is preserved or loss/caveat is documented; reinstall does not corrupt projects. | Manual / Not run | Manual / Not run |  |  |
| Basic audio | Load Demo, press Play, then Stop and Restart. | Demo plays audibly, stops, and restarts from the expected position. | Demo loaded and played audibly. | Pass | Sam / 2026-06-14 | Stop/restart not separately recorded. |
| Basic audio | Move/scroll the timeline and open/close the inspector while playing. | No crackle/glitch, no major hitch, and playback remains usable during basic UI movement. | Manual / Not run | Manual / Not run |  |  |
| Chordsmith import | Import a PCS1 share code if supported by the public build. | Pocket Chordsmith project imports and timeline populates. | Pasted Pocket Chordsmith share code into Pocket DAW; import worked. | Pass | Sam / 2026-06-14 |  |
| Chordsmith import | Import raw Pocket Chordsmith JSON. | Project imports without dropping source fields. | Imported Pocket Chordsmith JSON into Pocket DAW; import worked. | Pass | Sam / 2026-06-14 |  |
| Chordsmith import | Import PocketHandoff if supported by the public build. | Handoff imports once and does not repeat after reload. | Pocket Chordsmith "Send to Pocket DAW" did not work. | Fail | Sam / 2026-06-14 | Needs investigation in the handoff/deep-link path; paste/import fallback works. |
| Chordsmith import | Save, close, reopen, and inspect imported source data. | Source Chordsmith data remains preserved after saving/reopening. | Saved/reopened imported project and playback worked; diagnostics report `sourceRefCount: 1` and source title `Imported Chordsmith Project`. | Pass | Sam / 2026-06-14 | Saved file: `C:\Users\sam_s\Music\imported-chordsmith-project test.pocketdaw`. |
| Project workflow | Create/open a project, save a `.pocketdaw` file, close app, reopen app, reopen saved `.pocketdaw`. | Timeline and imported source data remain intact. | Saved imported project, closed/reopened Pocket DAW, reopened saved `.pocketdaw`, and project played well. | Pass | Sam / 2026-06-14 | Evidence diagnostics after reopen: 7 clips, 12 tracks, 973 events. |
| Editing | Move/trim/split/duplicate/delete a basic timeline clip. | Clip edits apply to the selected clip only and survive save/reopen. | Manual / Not run | Manual / Not run |  |  |
| Editing | Edit a generated section and repeat several inspector edits. | Generated-section edits are audible and inspector does not jump unexpectedly. | Manual / Not run | Manual / Not run |  |  |
| Editing | Edit drum sequencer steps while playing or after playback. | Drum edits produce audible changes. | Manual / Not run | Manual / Not run |  |  |
| Editing | Change one track/section, then inspect demo and unrelated sections. | Unrelated demo/sections do not mutate unexpectedly. | Manual / Not run | Manual / Not run |  |  |
| Mixer/audio state | Adjust track volume, mute, solo if present, and pan. | Audio/state changes match the control without corrupting other tracks. | Manual / Not run | Manual / Not run |  |  |
| Mixer/audio state | Adjust FX controls, routing/bus controls and automation if exposed. | Controls persist, export safely, and guarded scaffolds stay honest where incomplete. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Import an audio clip if exposed and place it on the timeline. | Media appears with clear embedded/collected/referenced/cached/missing state; audible if loaded. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Import MIDI if exposed. | MIDI item/clip appears and is readable/editable. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Export WAV and open the file in a player. | WAV file is created and playable. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Export MIDI and open it in a MIDI-capable tool. | MIDI file is created and readable. | Manual / Not run | Manual / Not run |  |  |
| Import/export | Export stems if exposed. | Stem files are created and playable/readable. | Manual / Not run | Manual / Not run |  |  |
| Safety | Try an oversized import for project, audio or MIDI. | Friendly rejection appears before whole-file read; app does not hang/crash. | Manual / Not run | Manual / Not run |  |  |
| Safety | Open malicious/unsafe metadata fixture. | Unsafe HTML/script/event/CSS is not executed or rendered raw. | Manual / Not run | Manual / Not run |  |  |
| Safety | Open a corrupted project file. | Friendly error is shown and the app remains open. | Manual / Not run | Manual / Not run |  |  |
| Updater | Install the current public version, then stage/publish a newer signed updater release. | Update manifest is reachable and points at the staged installer artifact. | Manual / Not run | Manual / Not run |  |  |
| Updater | Open installed app and check for updates. | Updater reports the staged newer version and release notes. | Manual / Not run | Manual / Not run |  |  |
| Updater | Download/install update, relaunch, and verify version. | Update installs/relaunches and version changes. | Manual / Not run | Manual / Not run |  |  |
| Updater | Open a project saved before the update. | Previous project still opens after update. | Manual / Not run | Manual / Not run |  |  |
