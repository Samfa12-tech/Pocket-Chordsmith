# Pocket DAW Recording Alpha

Recording is a narrow installed-app alpha slice in current v0.6.x builds. It is intentionally not a professional DAW recording system yet.

## Implemented Slice

- Installed/Tauri app only; browser/dev recording remains unavailable.
- One armed live audio track at a time.
- Live vocal and live instrument tracks expose `M`, `S`, `R`, and `Monitor` controls in the timeline and mixer.
- Recording requires a saved `.pocketdaw` project before capture starts.
- Native CPAL capture writes mono PCM WAV takes under `project-media/recordings/` beside the saved project.
- Stopping a take adds a project-media Media Pool item and places an audio clip on the armed track according to the selected transport recording mode.
- The transport exposes `Punch` and `Replace` / `Take Lane` controls in current source builds.
- Punch recording uses an explicit timeline range with `timeline.selection.source = "punch"` and requires the playhead or requested recording start to be at or before the punch-in bar.
- Replace mode keeps the current same-track overwrite behavior, with punch replace limited to the visible punch window.
- Take Lane mode keeps older overlapping material in a grouped inactive lane and makes the newest take the active audible lane; raw recorded media remains in the Media Pool.
- Clip inspector take-lane controls can activate, archive/restore and split/comp grouped audio or MIDI take clips.
- Playback, audio rendering and MIDI export ignore inactive or archived take lanes by durable take metadata, not just by the clip mute flag.
- No hidden latency compensation or automatic take alignment is applied.
- Live tracks expose an explicit manual latency offset in milliseconds; positive values place future takes earlier, negative values place them later, and raw recorded WAV media is not rewritten.
- Project schema now defaults `track.monitorEnabled` to `false` and stores project metronome settings.
- Metronome/count-in is audible in the installed app and is not included in WAV/MIDI exports.
- Diagnostics export includes recording status, armed tracks, monitored tracks and metronome/count-in settings.
- MIDI take lanes currently cover imported or timeline-edited MIDI clips, take activation/archive/comp metadata, event playback and MIDI export. They are not live MIDI capture.

## Still Out Of Scope

- ASIO.
- Simultaneous multitrack recording.
- Stereo track recording modes.
- Dedicated lane subtracks, lane collapse/expand and lane solo controls.
- Full polished comp-lane editing UI beyond grouped same-track split/activate/archive controls.
- Automatic latency detection/compensation.
- FX monitoring.
- Input meters beyond current playback/mixer meters.
- Browser `getUserMedia` recording.
- Live MIDI capture.

## Manual Installed Windows Smoke

| Test area | Steps | Expected result | Actual result | Pass/fail | Tester/date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Save prerequisite | Open or create a project, then Save As `.pocketdaw`. | Record can start only after a saved project path exists. | Manual / Not run | Manual / Not run |  | Browser/dev cannot verify native capture. |
| Device setup | Open Audio Settings, refresh devices, choose an input. | WASAPI input appears or a friendly no-input error is shown. | Manual / Not run | Manual / Not run |  | No ASIO in this slice. |
| Arm rule | Add Live Vocals and Live Instrument, arm one then the other. | Only one live track remains armed. | Manual / Not run | Manual / Not run |  | Covered by unit tests for state. |
| Monitor | Toggle Monitor on the armed track. | Monitor state changes; if enabled during recording, input is routed to output without FX. | Manual / Not run | Manual / Not run |  | Keep speaker/mic feedback risk in mind. |
| Count-in | Enable metronome/count-in and press Record. | One-bar count-in is heard before capture starts. | Manual / Not run | Manual / Not run |  | Click is not exported. |
| Manual latency offset | Set a live track latency offset such as `25 ms`, record a short take, then inspect the placed clip metadata via diagnostics or MCP. | The new clip is placed earlier by the requested offset, reports requested/applied latency metadata, and the source WAV media remains unchanged. | Manual / Not run | Manual / Not run |  | This is explicit placement correction, not automatic latency detection. |
| Record take | Record 5-10 seconds, then Stop Rec. | WAV is written under `project-media/recordings/`; clip appears on the armed track. | Manual / Not run | Manual / Not run |  | First slice is mono only. |
| Punch replace | Select a visible punch range, enable Punch, choose Replace, start before punch-in, record, then stop. | The raw WAV remains under `project-media/recordings/`; only the punch window is committed to the timeline and overlapped material is trimmed around that window. | Manual / Not run | Manual / Not run |  | Requires installed source build or later exact artifact with this source. |
| Punch take lane | Select a visible punch range, enable Punch, choose Take Lane, record over existing material, then stop. | Existing overlapping material is preserved as an inactive take lane and the new punched take is the active audible lane. | Manual / Not run | Manual / Not run |  | Confirms non-destructive lane workflow. |
| Save/reopen take lanes | Save, close, reopen the `.pocketdaw`, then inspect and activate archived/inactive take lanes. | Take group IDs, lane indexes, active lane state, punch metadata and raw media references survive reload. | Manual / Not run | Manual / Not run |  | Also covered by source-level tests. |
| Export audible lane | Export WAV and MIDI from a project with inactive or archived take lanes. | Only the active or comp-selected take lane is audible/exported; inactive lanes remain available in the project. | Manual / Not run | Manual / Not run |  | MIDI applies to imported/timeline MIDI takes, not live MIDI capture. |
| Reload | Save, close, reopen the `.pocketdaw`. | Recorded clip reloads and plays. | Manual / Not run | Manual / Not run |  | Confirms durable project-media behavior. |
