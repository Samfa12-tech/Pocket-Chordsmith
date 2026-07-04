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
- Clip inspector take-lane controls can make overlapping audio or MIDI clips into take lanes, then activate, archive/restore and split/comp grouped take clips.
- Playback, audio rendering and MIDI export ignore inactive or archived take lanes by durable take metadata, not just by the clip mute flag.
- No hidden latency compensation or automatic take alignment is applied.
- Live tracks expose an explicit manual latency offset in milliseconds; positive values place future takes earlier, negative values place them later, and raw recorded WAV media is not rewritten.
- Project schema now defaults `track.monitorEnabled` to `false` and stores project metronome settings.
- Metronome/count-in is audible in the installed app and is not included in WAV/MIDI exports.
- Diagnostics export includes recording status, armed tracks, monitored tracks and metronome/count-in settings.
- MIDI take lanes currently cover imported or timeline-edited MIDI clips, user-created take-lane grouping, UI-created MIDI take clips, Web MIDI input capture that starts transport with automatic punch-out onto the selected MIDI track, live-bridge punched MIDI recording-take placement from note events, take activation/archive/comp metadata, event playback and MIDI export. Source tests cover fake Web MIDI capture; real connected-controller installed smoke is still required.
- Candidate installed builds can run `npm run smoke:installed:punch-takes -- --installer "<setup.exe>"` after enabling Help -> AI / MCP Bridge, then `npm run verify:installed:punch-takes -- --summary "<summary.json>" --installer "<setup.exe>"` against the generated summary. The smoke records the optional installer path/SHA-256 in its summary, creates throwaway project-relative WAV fixtures and MIDI clips, asserts the live bridge advertises audio recording option/start/stop/toggle controls plus MIDI recording start/stop/toggle controls, starts/stops live audio recording when the installed machine has a usable native input path or records an expected guard result when it does not, asserts successful live audio recording creates a durable timeline clip and active grouped take-lane clip, verifies the saved project-relative native recording WAV file exists and matches project metadata, records byte-level WAV sample-rate/channel/frame-count/peak/RMS evidence, sets Punch plus Take Lane mode through `pocket_daw_live_control:set_recording_options`, drives punch take-lane placement, comp editing, live-bridge MIDI take-lane grouping with `create_take_lane_group`, live-bridge punched MIDI recording-take placement with `place_midi_recording_take`, live-bridge MIDI take-lane range editing, save/reopen metadata assertions and explicit WAV/MIDI exports through the running app, checks WAV headers, records export size/SHA-256 evidence, and parses MIDI export for active/inactive take-lane sentinels. The verifier rejects stale installer hashes, guard-only audio evidence, weak recorded-media evidence and inactive MIDI sentinel leakage. Add `--require-export-files` when the generated summary's `wavPath` and `midiPath` should still resolve to on-disk RIFF/WAVE and MThd export artifacts; strict export-file mode requires WAV sample data, parses MIDI sentinels from the file bytes, and compares `wavSha256`/`midiSha256` plus size evidence when present. For real microphone/interface smoke, run the smoke with a longer capture such as `--record-ms 5000`, then add `--require-audible-audio` to the verifier so short, silent or near-silent captures do not satisfy the hardware signal gate; strict mode checks the recorded WAV bytes, not just project metadata. For real connected MIDI controller smoke, run the smoke with a longer MIDI capture window such as `--midi-record-ms 5000`, play notes during the MIDI punch/capture window, then add `--require-midi-input` to the verifier; strict mode rejects guarded Web MIDI results, start/stop-with-no-notes results and unpunched MIDI takes, requiring a saved active punched MIDI input take with note pitches, matching capture/punch bars, punch mode metadata and take-lane placement evidence. Human listening is still required before public audio-quality claims.

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
- Release-ready hardware MIDI capture claims beyond the current Web MIDI installed-app smoke gate.

## Manual Installed Windows Smoke

| Test area | Steps | Expected result | Actual result | Pass/fail | Tester/date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Save prerequisite | Open or create a project, then Save As `.pocketdaw`. | Record can start only after a saved project path exists. | Manual / Not run | Manual / Not run |  | Browser/dev cannot verify native capture. |
| Device setup | Open Audio Settings, refresh devices, choose an input. | WASAPI input appears or a friendly no-input error is shown. | Manual / Not run | Manual / Not run |  | No ASIO in this slice. |
| Arm rule | Add Live Vocals and Live Instrument, arm one then the other. | Only one live track remains armed. | Manual / Not run | Manual / Not run |  | Covered by unit tests for state. |
| Monitor | Toggle Monitor on the armed track. | Monitor state changes; if enabled during recording, input is routed to output without FX. | Manual / Not run | Manual / Not run |  | Keep speaker/mic feedback risk in mind. |
| Count-in | Enable metronome/count-in and press Record. | One-bar count-in is heard before capture starts. | Manual / Not run | Manual / Not run |  | Click is not exported. |
| Manual latency offset | Set a live track latency offset such as `25 ms`, record a short take, then inspect the placed clip metadata via diagnostics or MCP. | The new clip is placed earlier by the requested offset, reports requested/applied latency metadata, and the source WAV media remains unchanged. | Manual / Not run | Manual / Not run |  | This is explicit placement correction, not automatic latency detection. |
| Record take | Record 5-10 seconds, then Stop Rec. | WAV is written under `project-media/recordings/`; clip appears on the armed track. | Manual / Not run | Manual / Not run |  | First slice is mono only. For bridge-assisted evidence, use `npm run smoke:installed:punch-takes -- --installer "<setup.exe>" --record-ms 5000`, then verify with `--require-audible-audio`; still listen to the take before public claims. |
| Punch replace | Select a visible punch range, enable Punch, choose Replace, start before punch-in, record, then stop. | The raw WAV remains under `project-media/recordings/`; only the punch window is committed to the timeline and overlapped material is trimmed around that window. | Manual / Not run | Manual / Not run |  | Requires installed source build or later exact artifact with this source. |
| Punch take lane | Select a visible punch range, enable Punch, choose Take Lane, record over existing material, then stop. | Existing overlapping material is preserved as an inactive take lane and the new punched take is the active audible lane. | Manual / Not run | Manual / Not run |  | Confirms non-destructive lane workflow. |
| Save/reopen take lanes | Save, close, reopen the `.pocketdaw`, then inspect and activate archived/inactive take lanes. | Take group IDs, lane indexes, active lane state, punch metadata and raw media references survive reload. | Manual / Not run | Manual / Not run |  | Also covered by source-level tests. |
| Export audible lane | Export WAV and MIDI from a project with inactive or archived take lanes. | Only the active or comp-selected take lane is audible/exported; inactive lanes remain available in the project. | Manual / Not run | Manual / Not run |  | MIDI applies to imported/timeline MIDI takes, Web MIDI input takes and live-bridge MIDI recording-take placement. `npm run smoke:installed:punch-takes` covers the fixture version through the installed live bridge; real MIDI input hardware still needs smoke. |
| MIDI input recording | Connect a MIDI keyboard/controller, select a MIDI track, press MIDI Rec, play a short phrase, then press Stop MIDI. With Punch enabled, start before punch-in and let transport reach punch-out. | Transport starts when MIDI Rec begins; a MIDI input take clip appears on the selected MIDI track, punched takes stop at punch-out, note pitch/velocity/channel data is editable in the Piano Roll, and save/reopen plus MIDI export preserve the captured notes. | Manual / Not run | Manual / Not run |  | Web MIDI availability depends on the runtime and attached device; source tests cover fake-device capture only. When hardware is available, run `npm run smoke:installed:punch-takes -- --installer "<setup.exe>" --midi-record-ms 5000`, play notes during the MIDI capture window, then verify with `--require-midi-input`; strict mode requires an actual saved punched MIDI take with captured notes. |
| Reload | Save, close, reopen the `.pocketdaw`. | Recorded clip reloads and plays. | Manual / Not run | Manual / Not run |  | Confirms durable project-media behavior. |
