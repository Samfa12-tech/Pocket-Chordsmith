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

Pocket DAW should not become an AI-generation-first product. Its center is a capable, free DAW that makes Pocket Chordsmith, Pocket DJ and Godot workflows stronger through native timeline, editing, mixing, recording and export features.

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
- Add MIDI tracks, add and edit MIDI clips.
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
- Shared media portability verification across media pool, diagnostics, save/reopen recovery and game-pack export, with share-safe embedded project copies that avoid local path leakage.
- Render/freeze cache.
- Track routing.
- Bus tracks.
- Return tracks.
- Master track.
- Built-in FX chains.
- Insert effects and instrument chains that are stored as normal project data, exposed in the mixer/editor UI and respected by playback/export.
- MIDI quantization, swing/groove tools, controller editing and deeper piano-roll workflows.
- Audio transient quantization, warp markers, time-stretch, pitch-shift and source-preserving clip analysis.
- Vocal pitch correction/autotune-style correction after pitch analysis, audio preservation and monitoring latency are reliable.
- Plugin hosting research for CLAP, VST3, LV2 or other formats, only after the native mixer, automation, render and crash-boundary contracts are mature.
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

The shell should borrow useful non-AI DAW patterns from tools such as Greysound: a persistent left studio rail for Library, Clips, Media Pool, Project, Export, Diagnostics, Pocket handoff and Godot tools; a compact always-visible top transport/status strip; and a lower dock that flips between Mixer, Inserts, Sends, Automation, Piano Roll, Audio Editor and Export Details for the same selected tracks. Source now has a first persistent studio rail that routes Library, Project, Clips, Media, Mixer, MIDI, Audio, Export, Godot, Pocket, Diagnostics and Help through the normal command layer.

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

Pocket DAW can consume PocketHandoff envelopes and legacy Chordsmith import params from URL query/hash, `window.name` and localStorage. The remaining product work is the polished sender-side button flow, hosted smoke testing, richer handoff types, and exact update-through-app smoke for public checkpoints.

## Build sequencing rule

Do not jump to flashy DAW surface area before the foundations are solid.

Preferred order:

1. Release-state hygiene and installed reliability: Open, Save, Save As, recent files, media relink/reload, diagnostics, updater checks and exact release smoke tests.
2. Pocket ecosystem polish: Chordsmith import/edit parity, Pocket DJ handoff, Godot/web-game ZIP packs, manifest correctness and push-to-Godot after ZIP smoke is reliable.
3. Non-destructive editing foundation: clip gain, fades/crossfades, source offsets, contextual edit menus, stronger split/trim/range selection and source-preserving destructive-looking operations. Source now has a first-class timeline edit range plus Range Clip, Range Loop, Copy Range, Cut Range, Clear Range, generated-section/generated-pattern/audio/MIDI Split Range, Crop Range, Delete Range, same-track Ripple Delete and source-safe Ripple All commands, metadata-only warp markers derived from analyzed audio transients through UI/command/MCP paths, and source-safe audio varispeed rate/pitch-as-speed playback through browser/offline/native runtime-audio regions; remaining work includes full take-lane comping and pitch-preserving time-stretch/pitch-shift playback tools.
4. Media pool and waveform editing: better waveform display, audio analysis cache, project-relative media storage, relink UX, clip analysis commands and per-clip metadata. Source now stores transient markers on media and metadata-only warp marker anchors on clips without changing source media.
5. MIDI sequencing and quantization: controller input, fuller piano roll, velocity/controller/program/pitch-bend/aftertouch lanes, quantize/swing/groove, MIDI transform tools and first-class sampler/instrument tracks. The current foundation can author notes, CC points, program changes, pitch bends and aftertouch through undoable piano-roll controls, persist them through save/reopen, re-export them as MIDI, summarize imported tempo/meter maps with bar/beat/tick and seconds positions, use multi-event MIDI tempo maps for MIDI note preview/render timing, explicitly adopt imported MIDI start tempo and supported /4 meter into project globals, explicitly convert imported MIDI tempo events into project tempo automation and imported time-signature events into first-class editable project meter-map points, display effective meter-map meters in the timeline ruler/readout, drive browser/native metronome beat counts, accents and active bar-length timing from project meter-map points, use effective meter-map numerators for Beat snap placement, apply project tempo automation and active project meter-map bar lengths to generated/MIDI event placement, audio-region start/duration placement, generated native render-cache stem region timing, WebAudio/native loop and seek bounds, timeline ruler bar/beat time labels, WebAudio/native metronome click timing and full-song WAV duration, write project meter-map points as MIDI time-signature meta events during MIDI export, and map selected General MIDI drum clips plus low-bass, simultaneous chord groups and melodic non-drum MIDI notes into generated Drums/Bass/Chords/Melody overlays without mutating the source clip or Chordsmith grids. Deeper generated-section grid interpretation and source-audio warp behavior over variable meters remain future work.
6. Mixer/routing dock: Mixer/Inserts/Sends/Automation tabs, full send/return processing, bus folders, meters, pre/post-fader choices, latency calibration and routing-aware exports.
7. Deep automation: drawn and recorded automation for volume, pan, clip gain, clip fades, clip source offsets, sends, FX, tempo and instrument parameters, with curves and reliable export playback. Source now has a first project-tempo automation lane contract with clamped BPM points, lower-dock UI, undoable commands and MCP access; automation point rows expose Linear, Hold, Ease in and Ease out curves through the shared UI/command/MCP update path for track, send, clip control and project-tempo lanes; active lanes render click-or-drag curve surfaces for visual point placement as one undoable drawn gesture; live mixer volume/pan, send-level, prepared audio clip gain/fade/source-offset and numeric FX parameter moves can record into existing automation lanes during playback; built-in numeric FX parameters can create/add automation from insert UI controls and MCP commands, with evaluated start-bar values feeding native payloads and supported WebAudio/offline built-in FX parameters scheduled onto real `AudioParam`s; the shared timeline clock applies tempo automation to generated/MIDI event placement, audio-region start/duration placement, WebAudio/native loop and seek bounds, timeline ruler bar/beat time labels, WebAudio/native metronome click timing, MIDI export placement, browser offline track/pan/send automation sampling and full-song WAV render duration. Recorded automation for instrument parameters, native continuous FX scheduling and source-audio warp/time-stretch behavior over tempo ramps still need deeper timing-model work.
8. Export and bounce expansion: MP3/FLAC, richer bounce profiles, freeze/print tracks, routing-aware stems, batch exports and release-grade package verification. The current WAV profile foundation now supports sample-rate, mono/stereo, peak normalization, Off/TPDF fixed-point dithering, 16/24-bit PCM rendering and 32-bit float rendering for full-song, stem and section-loop WAV paths, and ZIP package builders self-check manifest/entry/artifact consistency before reporting success.
9. Stereo and simultaneous multitrack recording: explicit input assignment, stereo tracks, monitoring controls, low-latency device paths, take lanes, punch recording and comping.
10. Audio quantization and pitch tools: transient detection, warp markers, first source-safe varispeed rate/pitch-as-speed playback, then pitch-preserving time-stretch, pitch-shift, groove matching and vocal pitch correction/autotune after preservation and latency are dependable.
11. Plugin hosting or bridge: evaluate CLAP/VST3/LV2 and related open-source host code only after the native mixer, automation, preset, render and crash-boundary contracts are ready.

Every feature in this list should become part of the project schema, command model, undo/redo stack, UI, playback engine, save/open path, render/export path and smoke tests. Pocket Chordsmith, Pocket DJ and Godot integrations should use those same primitives rather than separate add-on flows.

## Current v0 boundary

The current v0 is an expanding alpha slice. Treat `docs/CURRENT_RELEASE_STATUS.md` as the exact public version/status anchor. Published/smoked v0 has proved the basics below; newer source-only foundations must be called out as source/current-build capability until exact-installer or target-workflow smoke is recorded:

- Native Windows packaging.
- Future-ready schema.
- Chordsmith import.
- Generated-section timeline clips.
- Playback.
- Simple mixer.
- `.pocketdaw` save/open.
- WAV/MIDI export.
- Audio and MIDI clip foundations, including direct empty MIDI track/clip creation, undoable MIDI clip bar-length editing, and raw MIDI import placement as one clip, per-source-track clips, per-channel clips, or raw channel-10 drum-note clips.
- First timeline edit-range foundation for source-preserving range split/crop/delete/ripple workflows, including selected MIDI split/crop/delete/ripple that trims/retimes note and expression events, plus meter-map-aware imported-audio placement, overwrite, trim/extend, crossfade and range-edit source-window offsets.
- Basic track automation, clip-gain automation, send-level automation, bus routing, first organizational folder tracks with child-lane collapse and group Mute/Solo, and the first Mixer/Inserts/Sends/Automation/Piano Roll/Audio Editor/Export lower dock. Stem WAV ZIP and Section Loop ZIP are manifest-backed current-source/current-build foundations until exact-installer smoke proves them for a public checkpoint.
- Meter-map-aware section-loop and game-pack manifest timing exists in current source/current build; target-import reliability remains pending until installed app plus Godot/web smoke is recorded.
- Basic PocketHandoff ingestion into Pocket DAW.
- Installed-app-only one-track live recording alpha with source-level mono/stereo mode support and source-only grouped-take activation/archive/restore/comp-from-playhead foundations.
- Collected standalone stem, standalone section-loop and Godot/web game-pack ZIP export builders exist in current source/current build; public workflow proof remains pending.
- Native playback/cache and updater/bootstrapper release infrastructure.

It does not yet prove:

- Full Chordsmith editing parity.
- Polished sender-side push from Pocket Chordsmith to Pocket DAW.
- Push to Godot.
- Simultaneous multitrack recording and installed-hardware proof for stereo recording.
- Deep waveform/audio editing.
- Deep MIDI clip editor behavior beyond the compact piano-roll foundation.
- Audio transient quantization beyond metadata-only warp marker anchors.
- Pitch-preserving time-stretch, independent pitch-shift and vocal pitch correction/autotune.
- Plugin hosting or a plugin-host bridge.
- Full drawn automation editing, beat-grid snap/edit and source-audio warp tempo-ramp behavior, FX automation, deeper send/pre-post automation and hosted-parameter automation.
- Full insert/send processing and third-party plugin latency/compensation handling.
- Installed-app proof for project-relative media relink/reload workflow. Source now has native relink/reload, decoded-cache recovery, quiet hydration metadata repair, and project-relative path hardening.
- Full punch-in/out, take-lane organization and comp editing. Source now has grouped-take activation/archive/restore and first comp-from-playhead split helpers, but no installed punch workflow or full take-lane release claim.

Those missing pieces are not optional product ideas. They are part of the long-term Pocket DAW destination.

## Current next milestone

The next milestone should deepen media/export/native reliability from the current release-status baseline:

- Manually verify native Open, Save, Save As, audio import and MIDI import in `npm run tauri:dev` and a packaged Windows build.
- Manually smoke project-relative media path handling and the real relink/reload workflow for missing or external audio in packaged builds, including decoded-cache recovery and source-switch metadata cleanup.
- Manually smoke standalone Stem WAV ZIP and Section Loop ZIP exports, including manifest, deterministic paths, byte-size summaries and playable WAV contents.
- Verify the Godot/Web game-pack ZIP exports, including manifest, source project, full mix, stems and section loops, in real target import workflows.
- Add push-to-Godot or native pack destination selection after the ZIP pack smoke is solid.
- Keep extending PocketHandoff into sender-side buttons and hosted smoke tests across Pocket Chordsmith, Pocket DJ and Pocket DAW.
- Larger Chordsmith editor coverage and source-roundtrip confidence beyond the current compact parity controls.
- Drum branching: double-click generated drums to explode them into separate kick, snare, hat and future kit-piece tracks with independent mixer, pan, gate, FX and routing control.
- Serious MIDI import: unlike Pocket Chordsmith's deliberately limited sketchpad import, Pocket DAW should keep raw multi-track MIDI, channels, tempo maps, controllers, drums and editable clip data intact for finished-project work. Source now has a first raw-placement pass for single-clip, per-source-track, per-channel and channel-10 drum-note split imports while sharing one source media item, imported tempo/meter summaries with bar/beat/tick and seconds positions, first multi-event tempo-map MIDI note timing, optional conversion of imported tempo maps into project tempo automation and imported meter events into editable project meter-map points, meter-map-aware timeline display, metronome beat counts/accents, Beat snap placement, active bar-length timing and meter-map-aware MIDI export meta events, plus optional selected-clip commands that map MIDI drums, bass, chord groups and melodic notes into generated overlays without replacing the preserving raw-MIDI import path. Chordsmith's smarter musical import remains a useful source for deeper optional DAW commands that interpret MIDI into sections and progressions.
- Desktop-grade generated playback: Pocket DAW may use a future Pocket Audio Core, cached samples, rendered voice assets or hybrid sample/synth playback when that gives more reliable performance.
- Fold Greysound-derived non-AI ergonomics into the native shell: first left studio rail and first organizational Folder track source with child assignment/collapse and group Mute/Solo are present; keep deepening lower dock tabs, Add Track dialog, visible transport/project truth and deterministic context menus for clip/audio edit actions.
- Keep open-source acceleration license-reviewed before embedding code. Prefer compatible focused libraries or native-service boundaries for decoding/encoding, waveform analysis, pitch detection, time-stretching, MIDI parsing and plugin-format experiments.

Expanded recording should wait until native file/audio persistence, meters, timeline seek/scrub, media pool relink and packaged-build QA are stronger.
