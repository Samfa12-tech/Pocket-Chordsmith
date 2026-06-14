# Pocket DAW Recording Alpha

Recording is now a narrow installed-app alpha slice for v0.6.0 source builds. It is intentionally not a professional DAW recording system yet.

## Implemented Slice

- Installed/Tauri app only; browser/dev recording remains unavailable.
- One armed live audio track at a time.
- Live vocal and live instrument tracks expose `M`, `S`, `R`, and `Monitor` controls in the timeline and mixer.
- Recording requires a saved `.pocketdaw` project before capture starts.
- Native CPAL capture writes mono PCM WAV takes under `project-media/recordings/` beside the saved project.
- Stopping a take adds a project-media Media Pool item and places an audio clip on the armed track at the original record start bar.
- Project schema now defaults `track.monitorEnabled` to `false` and stores project metronome settings.
- Metronome/count-in is audible in the installed app and is not included in WAV/MIDI exports.
- Diagnostics export includes recording status, armed tracks, monitored tracks and metronome/count-in settings.

## Still Out Of Scope

- ASIO.
- Simultaneous multitrack recording.
- Stereo track recording modes.
- Punch-in/out.
- Comping or take lanes.
- Latency compensation UI.
- FX monitoring.
- Input meters beyond current playback/mixer meters.
- Browser `getUserMedia` recording.

## Manual Installed Windows Smoke

| Test area | Steps | Expected result | Actual result | Pass/fail | Tester/date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Save prerequisite | Open or create a project, then Save As `.pocketdaw`. | Record can start only after a saved project path exists. | Manual / Not run | Manual / Not run |  | Browser/dev cannot verify native capture. |
| Device setup | Open Audio Settings, refresh devices, choose an input. | WASAPI input appears or a friendly no-input error is shown. | Manual / Not run | Manual / Not run |  | No ASIO in this slice. |
| Arm rule | Add Live Vocals and Live Instrument, arm one then the other. | Only one live track remains armed. | Manual / Not run | Manual / Not run |  | Covered by unit tests for state. |
| Monitor | Toggle Monitor on the armed track. | Monitor state changes; if enabled during recording, input is routed to output without FX. | Manual / Not run | Manual / Not run |  | Keep speaker/mic feedback risk in mind. |
| Count-in | Enable metronome/count-in and press Record. | One-bar count-in is heard before capture starts. | Manual / Not run | Manual / Not run |  | Click is not exported. |
| Record take | Record 5-10 seconds, then Stop Rec. | WAV is written under `project-media/recordings/`; clip appears on the armed track. | Manual / Not run | Manual / Not run |  | First slice is mono only. |
| Reload | Save, close, reopen the `.pocketdaw`. | Recorded clip reloads and plays. | Manual / Not run | Manual / Not run |  | Confirms durable project-media behavior. |
