# Pocket DAW Windows Testing Checklist

Run this checklist against a packaged Windows build, not only the Vite browser preview.

## Install And Launch

- [ ] Verify installer SHA-256.
- [ ] Launch installer.
- [ ] Record any SmartScreen/signing warning.
- [ ] Launch Pocket DAW after install.
- [ ] Confirm the app shell is not blank.
- [ ] Confirm transport shows the expected version.

## Project Files

- [ ] Create a new project.
- [ ] Save As to a named `.pocketdaw` file.
- [ ] Edit a clip or mixer value.
- [ ] Save.
- [ ] Close and reopen the app.
- [ ] Open the saved project.
- [ ] Confirm recent project label/path is correct.

## Media

- [ ] Import a WAV file from a normal user folder.
- [ ] Place it on the timeline.
- [ ] Save, close and reopen.
- [ ] Confirm Media Pool status clearly reports loaded, external unloaded, missing or unresolved.
- [ ] Import a MIDI file and confirm the MIDI clip and piano-roll inspector appear.
- [ ] Export Collect Media Plan and inspect copy/blocked items.

## Playback And Editing

- [ ] Play, pause and stop.
- [ ] Scrub timeline.
- [ ] Toggle loop and Loop Selected.
- [ ] Add/rename/delete marker.
- [ ] Move, copy, paste, split, trim and mute a clip.
- [ ] Confirm meters move and no panels overlap.

## Export

- [ ] Export full WAV.
- [ ] Export full MIDI.
- [ ] Export stems and confirm multiple files.
- [ ] Export section manifest.
- [ ] Export Godot manifest.
- [ ] Export web-game manifest.
- [ ] Confirm manifest warnings are honest for missing/runtime-only media.

## Diagnostics And Guardrails

- [ ] Export diagnostics JSON.
- [ ] Confirm diagnostics include version, environment, selected project, track/mixer and audio scheduler info.
- [ ] Open Add Track and confirm recording language says capture is not enabled yet.
- [ ] Confirm Arm controls are disabled for live audio tracks.

## Result

- Overall result: NOT RUN
- Tester:
- Date:
- Installer path:
- Notes:
