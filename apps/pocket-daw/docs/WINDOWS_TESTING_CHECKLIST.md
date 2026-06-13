# Pocket DAW Windows Smoke Checklist

Run this against the exact packaged Windows alpha build from itch, not only Vite dev mode or the browser preview. Fill every row before claiming Windows smoke passed.

Current alpha target:

- Version: `0.5.9`
- Itch page: `https://samfa12.itch.io/pocket-daw`
- Portable ZIP hash: `e96d5dfff117a302fef1376c0a9ffa46bba80f4ca046a633dd5c09e189b61a72`
- Updater setup EXE hash: `bd45352218567cb3a9ccf3166a3935c15182c6c53808b1234744858e9a7f9732`

| Check | Expected result | Actual result | Pass/Fail/Not Run | Notes | Tester | Date | Artifact hash tested |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clean Windows machine or clean Windows user profile. | Clean state or caveats recorded. |  | Not Run |  |  |  |  |
| Download/extract the exact portable ZIP. | ZIP extracts successfully. |  | Not Run |  |  |  |  |
| Verify SHA-256 against `CHECKSUMS_SHA256.txt`. | Hash matches. |  | Not Run |  |  |  |  |
| Run `Pocket DAW.exe`. | App launches without installer. |  | Not Run |  |  |  |  |
| Confirm version shown in UI is correct. | Transport shows current version. |  | Not Run |  |  |  |  |
| Load demo project. | Demo loads. |  | Not Run |  |  |  |  |
| Press Play. | Playback starts. |  | Not Run |  |  |  |  |
| Confirm playback audible. | Audio is audible. |  | Not Run |  |  |  |  |
| Confirm diagnostics show expected native/backend status. | Diagnostics are honest. |  | Not Run |  |  |  |  |
| Paste valid PCS1 code. | PCS1 imports. |  | Not Run |  |  |  |  |
| Import raw Pocket Chordsmith JSON. | JSON imports. |  | Not Run |  |  |  |  |
| Test PocketHandoff import if applicable. | Handoff imports once and clears. |  | Not Run |  |  |  |  |
| Open `.pocketdaw`. | Project opens. |  | Not Run |  |  |  |  |
| Save `.pocketdaw`. | Project saves. |  | Not Run |  |  |  |  |
| Save As `.pocketdaw`. | New file saves. |  | Not Run |  |  |  |  |
| Reopen saved project. | Saved state persists. |  | Not Run |  |  |  |  |
| Import audio file. | Media appears or friendly error is shown. |  | Not Run |  |  |  |  |
| Place audio on timeline. | Audio clip appears. |  | Not Run |  |  |  |  |
| Import MIDI file. | MIDI clip appears. |  | Not Run |  |  |  |  |
| Edit MIDI note. | MIDI edit persists. |  | Not Run |  |  |  |  |
| Export WAV. | WAV exports. |  | Not Run |  |  |  |  |
| Export MIDI. | MIDI exports. |  | Not Run |  |  |  |  |
| Export stems. | Stem WAVs export. |  | Not Run |  |  |  |  |
| Export section/Godot/web manifest previews. | JSON manifests export with honest warnings. |  | Not Run |  |  |  |  |
| Build Native Cache on saved project. | WAV cache and renderCache metadata are written. |  | Not Run |  |  |  |  |
| Close app. | App exits cleanly. |  | Not Run |  |  |  |  |
| Reopen project. | Project opens. |  | Not Run |  |  |  |  |
| Confirm cache hydration or documented fallback behaviour. | Hydration counts or fallback limitation are clear. |  | Not Run |  |  |  |  |
| Move clip. | Clip moves. |  | Not Run |  |  |  |  |
| Duplicate clip. | Duplicate appears. |  | Not Run |  |  |  |  |
| Copy/paste clip. | Pasted clip appears. |  | Not Run |  |  |  |  |
| Split clip. | Clip splits. |  | Not Run |  |  |  |  |
| Trim clip. | Trim updates. |  | Not Run |  |  |  |  |
| Delete clip. | Clip is removed. |  | Not Run |  |  |  |  |
| Loop selected. | Loop region matches selected clip. |  | Not Run |  |  |  |  |
| Clear loop. | Loop clears. |  | Not Run |  |  |  |  |
| Add/rename/delete marker. | Marker operations work. |  | Not Run |  |  |  |  |
| Chordsmith drums step edit. | Drum step changes. |  | Not Run |  |  |  |  |
| Chordsmith bass edit. | Bass step changes. |  | Not Run |  |  |  |  |
| Chordsmith melody edit. | Melody step changes. |  | Not Run |  |  |  |  |
| Chordsmith guitar edit. | Guitar step changes. |  | Not Run |  |  |  |  |
| Chordsmith section bars. | Section length updates. |  | Not Run |  |  |  |  |
| Chord change. | Chord updates. |  | Not Run |  |  |  |  |
| Confirm inspector scroll does not jump. | Scroll position remains stable. |  | Not Run |  |  |  |  |
| Mixer mute. | Mute works. |  | Not Run |  |  |  |  |
| Mixer solo. | Solo works. |  | Not Run |  |  |  |  |
| Mixer volume. | Volume works. |  | Not Run |  |  |  |  |
| Mixer pan. | Pan works. |  | Not Run |  |  |  |  |
| Bus route. | Routing updates. |  | Not Run |  |  |  |  |
| Automation point add/edit/delete. | Automation updates. |  | Not Run |  |  |  |  |
| FX add/remove and export. | FX changes persist/export. |  | Not Run |  |  |  |  |
| Audio Settings device probe. | Devices or honest error shown. |  | Not Run |  |  |  |  |
| Oversized audio or MIDI file. | Friendly size-limit error shown. |  | Not Run |  |  |  |  |
| Malicious `.pocketdaw` fixture. | No unsafe HTML/script/event/CSS injection appears. |  | Not Run |  |  |  |  |
| No local dev URLs, debug windows, or console spam. | Normal usage is clean. |  | Not Run |  |  |  |  |
| App exits/restarts cleanly. | Restart succeeds. |  | Not Run |  |  |  |  |
