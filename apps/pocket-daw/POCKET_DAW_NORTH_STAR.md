# Pocket DAW North Star

This file exists so Pocket DAW does not drift into a small importer/exporter and forget its real destination.

## Product destination

Pocket DAW should eventually become the full desktop studio for the Pocket music family:

- Everything Pocket Chordsmith can do for composing songs.
- Everything Pocket Chordsmith can export or hand off.
- A real DAW timeline for arranging, recording, editing, mixing and rendering.
- A game-audio bridge for Godot and web games.
- A native Windows app first, with browser/dev mode only as a development convenience.

Pocket Chordsmith remains the fast sketchpad. Pocket DJ remains the live performance/remix surface. Pocket DAW becomes the deeper finishing, recording, mixing and export workspace.

## Non-negotiable long-term promise

A user should be able to start and finish a song inside Pocket DAW without needing to return to Pocket Chordsmith, while still being able to import, preserve and round-trip Pocket Chordsmith projects.

Pocket DAW should support:

- Make a song from scratch using the same composition powers as Pocket Chordsmith.
- Import or receive a `PCS1:` Pocket Chordsmith project.
- Push from Pocket Chordsmith to Pocket DAW.
- Preserve original Pocket Chordsmith source data.
- Edit Chordsmith-style sections, chords, drums, bass, melody and guitar inside Pocket DAW.
- Arrange sections on a timeline.
- Scrub the timeline and hear a live preview.
- Play from any bar or clip.
- Loop timeline regions and section regions.
- Record voice.
- Record instruments.
- Record multiple live tracks simultaneously when the connected audio hardware exposes enough inputs.
- Choose mono or stereo recording mode per live audio track, so vocals, guitars, synths and stereo instrument feeds can be captured correctly.
- Import common audio files such as `.wav`, `.mp3`, `.flac`, `.ogg`, `.aiff` and other practical desktop formats as timeline tracks/clips.
- Add and edit MIDI clips.
- Add and edit audio clips.
- Mix tracks, buses, returns and master output.
- Use automation lanes.
- Export full songs, stems, MIDI, section loops and game-ready packs.
- Export to multiple audio formats, sample rates, bit depths, channel modes and bitrate/quality targets where the format supports them.
- Push usable adaptive music assets to Godot.
- Eventually receive Pocket DJ performance/session data.

## Chordsmith parity target

Pocket DAW should not just import Chordsmith songs. It should eventually expose Chordsmith-level creation and editing:

- Key, scale, tempo, swing, time signature and resolution.
- Section IDs and section lengths.
- Song sequence / arrangement structure.
- Chord progression editing.
- Drum grid editing.
- Bass modes and bass notes.
- Melody tracks, instruments, octaves, mute, solo, pan, holds, slides and tuplets.
- Guitar enable state, tone, register, strum mode, volume and pattern editing.
- Chord settings, guitar settings, FX settings and sidechain settings.
- Share-code compatibility with `PCS1:`.

The internal DAW model must remain broader than Chordsmith. Chordsmith data is one source format and one generated-clip system, not the whole DAW model.

## Real DAW target

Pocket DAW should grow toward these DAW features:

- Multi-track timeline.
- Generated-section clips.
- Generated-pattern clips.
- MIDI clips.
- Audio clips.
- Audio file import for `.wav`, `.mp3`, `.flac`, `.ogg`, `.aiff` and similar desktop media.
- Automation clips and automation lanes.
- Markers and cue markers.
- Piano roll.
- Drum lane editor.
- Audio waveform display.
- Media pool.
- Render/freeze cache.
- Track routing.
- Bus tracks.
- Return tracks.
- Master track.
- Built-in FX chains.
- Shared Pocket Audio Core integration when the real core package/API is available, with Pocket DAW timeline events adapted into that engine rather than guessed from memory.
- Stem rendering.
- Full-song rendering.
- Multi-format export with format-specific quality controls, including WAV bit depth/sample rate, MP3 bitrate, FLAC compression and game-friendly compressed outputs.
- Timeline scrub and live preview.
- Recording lanes for microphone/voice and instruments.
- Simultaneous multitrack recording from multi-input interfaces, with explicit per-track mono/stereo input assignment.

## Recording target

Pocket DAW should support real live recording workflows once the native audio layer is mature:

- Arm and record multiple live tracks at the same time when the selected interface provides enough input channels.
- Assign each record-capable track to a specific hardware input, stereo input pair or later bus source.
- Set each live recording track to mono or stereo independently.
- Record vocals, guitars, keyboards, drum machines and external mixers without forcing every source into the same channel format.
- Keep recorded takes as audio clips linked to media-pool items, with project-relative media management later.
- Preserve timing, sample rate and channel metadata so exported stems and reopened projects stay aligned.
- Treat ASIO or another low-latency native backend as an important future layer for pro interfaces that do not expose all inputs cleanly through WASAPI.

## Desktop app shell target

Pocket DAW should feel like a real Windows desktop DAW, not only a web page wrapped in a window.

The app should grow a native-style top menu bar with familiar categories:

- File: new, open, save, save as, import audio/MIDI/Chordsmith, recent files, export, project settings and quit.
- Edit: undo, redo, cut, copy, paste, duplicate, delete, select, split and timeline edit commands.
- View: timeline zoom, mixer, inspector, media pool, piano roll, sequencers, automation lanes, meters, diagnostics and fullscreen.
- Track: add audio track, add MIDI track, add Chordsmith/generated instrument, add bus, add return and track routing.
- Transport: play, pause, stop, restart, record, loop, metronome, count-in and seek commands.
- Help: controls, documentation, diagnostics export, version/build info and feedback notes.

This menu structure should connect to the same command layer as keyboard shortcuts and toolbar buttons so the DAW does not grow duplicate behaviour paths.

## Media and export target

Pocket DAW should handle normal desktop music-production file workflows:

- Drag/drop or menu import of `.wav`, `.mp3`, `.flac`, `.ogg`, `.aiff` and other practical audio files as audio tracks or clips.
- Preserve imported media references in the media pool and project file without hiding where the source file came from.
- Generate waveform previews and peak data for imported clips.
- Support project-relative media management later, so projects can be moved or zipped without losing audio files.
- Export WAV for production/mastering.
- Export MP3 and other compressed formats for sharing.
- Export FLAC or other lossless formats where useful.
- Export game-friendly compressed formats and loop packs when the game-audio tools mature.
- Offer export profile controls for sample rate, bit depth, channel mode, normalization/limiting, dithering where relevant and bitrate/quality settings for compressed formats.

## Game music target

Pocket DAW should become the place where Pocket music turns into practical game assets:

- Godot adaptive music export pack.
- Web-game music export pack.
- Section loop exports.
- Stem exports by role.
- Markers for gameplay states such as calm, danger, combat, win, lose and menu.
- Push-to-Godot workflow.
- Clear metadata for loops, stems, BPM, key, scale, bars and cue points.

## Handoff target

Future handoff flows should include:

- Pocket Chordsmith to Pocket DAW.
- Pocket DAW to Pocket Chordsmith when editing source composition data is useful.
- Pocket DAW to Godot.
- Pocket DJ to Pocket DAW for captured performance/session arrangement.
- Pocket DAW to Pocket DJ for performance-ready sessions when useful.

As of v0.5.1, Pocket DAW can consume PocketHandoff envelopes and legacy Chordsmith import params from URL query/hash, `window.name` and localStorage. The remaining product work is the polished sender-side button flow, hosted smoke testing and richer handoff types.

## Build sequencing rule

Do not jump to flashy DAW surface area before the foundations are solid.

Preferred order:

1. Stabilise native project save/open and recent files.
2. Stabilise Chordsmith import and source preservation.
3. Add Chordsmith parity editing inside Pocket DAW.
4. Improve timeline play, scrub, seek and loop.
5. Add stronger mixer, meters and routing.
6. Add recording only after timeline/audio persistence is ready.
7. Add MIDI/audio clips and editors.
8. Add stem, section loop and Godot/web-game export packs.
9. Add Pocket DJ performance handoff.

## Current v0 boundary

The current v0 is only the first vertical slice. It proves:

- Native Windows packaging.
- Future-ready schema.
- Chordsmith import.
- Generated-section timeline clips.
- Playback.
- Simple mixer.
- `.pocketdaw` save/open.
- WAV/MIDI export.
- Audio and MIDI clip foundations.
- Basic automation, bus routing and stem/manifest-preview export foundations.
- Basic PocketHandoff ingestion into Pocket DAW.

It does not yet prove:

- Full Chordsmith editing parity.
- Fully manually verified native file dialogs in packaged builds.
- Polished sender-side push from Pocket Chordsmith to Pocket DAW.
- Push to Godot.
- Voice or instrument recording.
- Deep waveform/audio editing.
- Deep MIDI clip editor behavior beyond the compact piano-roll foundation.
- Full drawn automation editing and FX/tempo automation.
- Bundled stem/game export packs.
- Project-relative media relink/reload workflow.

Those missing pieces are not optional product ideas. They are part of the long-term Pocket DAW destination.

## Current next milestone

After v0.5.1 hardening, the next milestone should deepen media/export/native reliability:

- Manually verify native Open, Save, Save As, audio import and MIDI import in `npm run tauri:dev` and a packaged Windows build.
- Complete project-relative media path handling and a real relink/reload workflow for missing or external audio.
- Replace sequential stem downloads with browser-safe zip packaging or native pack export.
- Verify the Godot/Web game-pack ZIP exports, including manifest, source project, full mix, stems and section loops, in real target import workflows.
- Add push-to-Godot or native pack destination selection after the ZIP pack smoke is solid.
- Keep extending PocketHandoff into sender-side buttons and hosted smoke tests across Pocket Chordsmith, Pocket DJ and Pocket DAW.
- Larger Chordsmith editor coverage and source-roundtrip confidence beyond the current compact parity controls.
- Drum branching: double-click generated drums to explode them into separate kick, snare, hat and future kit-piece tracks with independent mixer, pan, gate, FX and routing control.
- Serious MIDI import: unlike Pocket Chordsmith's deliberately limited sketchpad import, Pocket DAW should eventually handle multi-track MIDI, channels, tempo maps, controllers, drums and editable clip conversion well enough for finished-project work.
- Desktop-grade generated playback: Pocket DAW may use a future Pocket Audio Core, cached samples, rendered voice assets or hybrid sample/synth playback when that gives more reliable performance.

Recording should wait until native file/audio persistence, meters, timeline seek/scrub, media pool relink and packaged-build QA are stronger.
