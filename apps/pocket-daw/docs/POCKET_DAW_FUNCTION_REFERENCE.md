# Pocket DAW Function Reference

Last updated: 2026-07-02

This document explains Pocket DAW's user-facing functions in plain language for a human user and their AI counterpart. It describes what each function does, when to use it, and what an AI helper should be careful about.

This is a product/help reference, not the public release truth. Current release truth remains `release-status.json` and `docs/CURRENT_RELEASE_STATUS.md`.

For button-level and selector-level detail, use `docs/POCKET_DAW_ACTION_CATALOG.md`. That catalog is generated from the same source as the in-app Function Guide and lists `data-action` IDs, dense selectors, shortcuts, side effects, and AI-helper cautions.

## How To Use This Reference

- Human user: find the surface you are using, read what the function does, and follow the "Use when" guidance.
- AI counterpart: read the "AI counterpart notes" before acting. Prefer reversible edits, preserve user work, and verify results through tests, diagnostics, MCP tools, or installed-app smoke as appropriate.
- AI/browser automation: use `docs/POCKET_DAW_ACTION_CATALOG.md` when you need an exact button action, selector, shortcut, or per-control side-effect note.
- Both: Pocket DAW is alpha software. If a feature is described as future, guarded, or smoke-required, do not claim it as production-ready.

## Project And File

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| New Project | Starts a fresh unsaved Pocket DAW project and resets the working arrangement. | Starting a new composition or import test. | Warn before replacing unsaved work. Prefer Save or Save As first when user edits may matter. |
| Open `.pocketdaw` | Loads an existing Pocket DAW session and restores project data, media references, cache metadata and selections where possible. | Continuing or inspecting a saved session. | Use file MCP tools for closed-project inspection when visual smoke is not needed. |
| Save `.pocketdaw` | Writes the current project to its known file path. | After meaningful edits, before recording, and before installed-app smoke. | If there is no file path, the UI must use Save As. MCP v1 does not trigger Save As for unsaved projects. |
| Save As | Prompts for a destination, saves the project, and can adopt the filename as project title. | Creating a durable project path, duplicating a session, or preparing recording/project-relative media. | Saved path is required for reliable project-media recordings and portable cache collection. |
| Recent Files | Keeps quick access to recently opened/saved projects. | Returning to the last tested project. | Recent entries are local runtime state and may differ between dev, installed app and browser preview. |
| Recovery And Autosave | Keeps recovery snapshots around risky imports and remembers editable demo/autosave state. | Imports, file loads, and crash/reopen recovery. | Autosave is not a substitute for explicit Save before release or recording smoke. |
| Action Catalog | Documents every visible command button and dense generated selector with action IDs, shortcuts and AI cautions. | A human or AI counterpart needs exact control behavior rather than a workflow overview. | Maintain `src/app/functionGuide.ts`, regenerate `docs/POCKET_DAW_ACTION_CATALOG.md`, and update tests when controls change. |

## Import

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Import Paste | Parses pasted `PCS1:` share codes, Pocket Chordsmith JSON, Pocket DJ source sessions, PocketHandoff payloads, or raw `.pocketdaw` JSON. | Fast Chordsmith/DJ/project handoff without a file picker. | Confirm resulting track, clip, section and media counts. |
| Open File | Lets the file picker route supported project, audio, or MIDI files into the correct import path. | The user wants one entry point for local files. | Inspect status text and media pool after import. |
| Import Audio | Imports an audio file, decodes it for runtime playback, stores metadata, and makes it timeline-placeable. | Loops, vocals, instrument takes, references and stems. | Check source format, duration, sample rate, channels, cache path and missing/unloaded state. |
| Import MIDI | Parses `.mid`/`.midi` files, adds media metadata, and creates editable MIDI clips according to the placement mode. | External melodies, drums, chord ideas or conversion material. | Check tempo/meter maps before adopting them into project timing. |
| MIDI Placement Mode | Chooses single clip, per-source-track, per-channel, or drum-channel split placement for imported MIDI. | Multi-track/channel MIDI files. | Per-channel or drum split can be easier for AI analysis. |
| Chordsmith Handoff | Converts Chordsmith material into DAW tracks, clips, sections and generated roles. | Moving from Pocket Chordsmith composition into DAW arrangement/export. | Keep Chordsmith as musical source of truth; do not duplicate whole Chordsmith UI logic inside the DAW. |

## Transport

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Play / Pause | Starts or pauses playback from the current playhead. | Auditioning arrangement, mix, MIDI, generated roles or cached playback. | Remote agents should use MCP transport status if they cannot hear audio. |
| Stop | Stops playback and live metronome activity. | Before export, recording setup changes, or playback mode changes. | If notes remain audible, use MIDI Panic. |
| Restart | Restarts playback from the beginning. | Full-arrangement listening passes. | Native restart coalescing should avoid excessive rebuilds during live edits. |
| Bar 1 | Moves the playhead to the first bar. | Resetting audition position without changing loop state. | Useful before deterministic render/listen smoke. |
| Metronome | Toggles metronome playback and count-in behavior for recording. | Live recording and timing checks. | Check count-in settings before judging recording timing. |
| MIDI Panic | Stops preview playback and clears active/stuck MIDI notes. | Interrupted playback or stuck synth notes. | Safety command only; should not mutate project data. |

## Timeline And Clips

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Select Clip / Track | Chooses what the inspector and lower dock edit. | Before changing clip transforms, routing, automation, MIDI, audio or Chordsmith section data. | MCP live tools can select tracks/clips when visual control is unavailable. |
| Move Left / Move Right | Moves the selected clip earlier/later by the current snap step. | Arrangement timing changes. | Check snap mode first. Bar and beat moves intentionally differ. |
| Cut / Copy / Paste / Duplicate | Moves or repeats clips without altering source media. Cut removes the timeline clip and keeps a clipboard copy as one undoable edit. | Moving material, repeating sections, building form, or trying alternate placements. | Duplicate places a related copy; Paste depends on clipboard state. |
| Split Clip | Splits selected clip at the playhead. | Preparing a section for mute, move, trim or export. | Prefer split/range edits over destructive source edits. |
| Trim Start / Trim End | Adjusts clip boundaries by snap steps without modifying source media. | Tightening timing or loop edges. | For audio clips, check source offset/duration for exact source alignment. |
| Mute Clip / Delete Clip | Mute silences nondestructively; Delete removes from timeline. | Mute for auditioning alternatives; Delete for removal. | Prefer Mute when the user may want to recover an idea. |
| Edit Range | Defines a bar range for copy range, cut range, split, crop, delete, ripple delete, ripple all, range loop and clear range. Copy/Cut Range place only the selected clip's ranged material on the normal clip clipboard. | Section-level edits across clips/tracks, or moving only part of a selected clip. | Ripple edits change later timeline positions. Confirm broad intent. |
| Loop Region | Auditions a repeating bar range or selected clip range. | Mix checking, section editing, recording practice or loop export prep. | Loop state affects auditioning, not source data. |
| Markers And Game Cues | Adds timeline labels and game-state markers. | Navigation, arrangement notes and adaptive game export planning. | Game cues are visible in Game music focus and hidden in Music focus. |
| Zoom And Timeline Size | Changes pixels-per-bar and timeline height. | Inspecting detail or seeing more tracks. | UI-only view setting. |

## Inspector

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Clip Mix | Adjusts selected-clip gain and transpose where supported. | Per-clip balance or MIDI/generated pitch changes. | Audio pitch shifting is not fully available; audio clips expose audio-specific controls. |
| Track Source Editor | Labels generated-role sequencer controls as Chordsmith source edits, separate from selected-clip mix controls. | Editing drums, bass, chords, melody or guitar from the inspector when the user needs source/clip context. | Clip mix controls affect the selected timeline clip; Track source editor controls affect the generated source section. |
| Section Stem Mutes | Mutes Drums, Bass, Chords, Melody or Guitar only in the selected generated-section clip. | Clip-level variations from one Chordsmith section. | Checked means muted for that clip only. Original Chordsmith source remains unchanged. |
| Clip Edit Palette | Provides local quick actions for cut/copy/paste/duplicate/split/range/trim/mute/delete. | Editing from the inspector instead of the toolbar. | Routes to the same command layer as menu/toolbar/keyboard edits. |
| Freeze Selected Clip | Renders selected clip into reusable audio/cache artifact. | Testing cached playback or preserving generated material as audio. | Check render cache and media pool after freezing. |
| Export Clip MIDI / Track MIDI | Exports MIDI-capable clip or track material. | Interchange with Chordsmith, another DAW, notation or game tools. | Audio clips do not contain MIDI events. |
| Collapsible Inspector Sections | Hides/shows selected clip and track sections independently. | Reducing inspector clutter. | UI-only state; should not affect project saves or exports. |

## Chordsmith Editing

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Song Globals | Edits BPM, key, scale, time signature, resolution and swing. | Broad musical identity changes. | Globals can affect timing, render and generated-role interpretation. |
| Section Add And Length | Adds Chordsmith sections and changes bar length. | Extending arrangement vocabulary. | Recheck arrangement clips after section length changes. |
| Chord Grid | Chooses chord symbols per section bar. | Harmonic changes that drive generated roles. | Keep bass/melody/guitar coherent with chords. |
| Drum Steps And Presets | Edits drum steps, tuplets, presets and branch drum rows. | Beat programming, groove variation and kit export control. | Branch drums when separate lane mixing/export control is needed. |
| Bass Steps And Presets | Edits bass mode, notes, visible accents, presets and selected-step H/S/T hold, slide and tuplet metadata. | Bassline design or MIDI-to-bass conversion cleanup. | Select the step before using H, S or T articulation shortcuts; auto bass and manual notes can differ. |
| Melody Steps | Edits melody notes, holds, slides, tuplets, instrument and octave. | Lead motif and melodic variation. | Use page controls for long sections. |
| Guitar Steps And Presets | Edits guitar enable state, tone, register, strum mode, volume and rhythm steps. | Rhythm-guitar arrangement and game-loop energy changes. | Guitar can be reactivated through Add Track if inactive. |

## MIDI Editing

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Piano Roll | Edits selected MIDI clip notes, clip length, pitch, tick, duration, velocity and channel. | Precise note editing after import or manual creation. | Read MIDI metadata and tempo map summaries before timing assumptions. |
| Quantize | Moves MIDI notes to a selected rhythmic grid. | Tightening timing. | Changes note timing in project state but is undoable. |
| Swing And Groove | Applies swing percentages or named groove templates. | Adding feel after basic timing is correct. | Record chosen groove/swing in metadata where possible. |
| Velocity And Pitch Transforms | Applies bulk velocity shaping or pitch shifts. | Humanization, leveling, octave/semitone shifts. | Check pitch range after transforms, especially drums/bass. |
| Controllers, Program, Bend, Aftertouch | Adds/edits/duplicates/deletes expressive MIDI events. MIDI preview/render interprets channel-matched CC7 volume, CC10 pan, CC11 expression, CC64 sustain and pitch-bend detune. | MIDI expression and interchange. | Imported controller data may be dense; keep edits bounded. |
| MIDI To Chordsmith Mapping | Maps MIDI into generated drum/bass/chord/melody overlays one role at a time or as one source-preserving Map Arrangement pass, and can adopt tempo/meter. | Turning a MIDI file into editable Chordsmith-style source material without replacing the raw MIDI import. | Conversion is an aid, not proof of musical correctness. Keep the raw MIDI clip and listen/inspect each generated role. |

## Audio Clip Editing

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Audio Clip Properties | Controls gain, fades, source offset, duration, playback rate and pitch metadata. | Fitting audio into the arrangement without editing source files. | Some metadata may be preparatory until full DSP support exists; verify playback/render. |
| Short Fades / Reset Fades | Adds quick fades or clears fade settings. | Removing clicks or restoring raw clip edges. | Source-safe metadata. |
| Normalize | Sets clip gain from analyzed peak level. | Bringing quiet audio closer to working level. | Changes gain metadata, not source samples. |
| Transient Analysis And Warp Markers | Finds likely transients, creates/clears metadata warp markers, and can quantize warp marker targets to the project 1/16 grid without changing source anchors. | Timing/warp prep or rhythmic audio inspection. | Do not claim full elastic audio until playback/export smoke proves it. |
| Crossfade / Overlap Fade | Creates fade transitions between clips or at a clip edge. | Smoothing edits and comps. | Inspect neighboring clips after crossfade operations. |
| Invert Phase / Reverse | Applies phase inversion or reverse playback metadata. | Phase correction checks or creative effects. | Verify export/render output. |

## Recording And Takes

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Add Live Vocals / Live Instrument | Creates a record-capable live audio track scaffold; input and mono/stereo channel mode are set on the mixer strip. | Preparing vocals/instruments for capture. | Installed-app-only; smoke against packaged app. |
| Arm / Monitor | Arms a record-capable track and optionally monitors input. | Preparing one live track for capture/input metering. | Only one armed recording target is expected currently. |
| Record | Captures audio to project-relative WAV media and places the take on timeline. | After saving the project and arming the intended track. | Confirm saved path, count-in, take placement, media pool item and reopen persistence. |
| Take Lanes | Groups alternate takes, activates one, archives/restores takes and comps from playhead. | Managing repeated passes without deleting source media. | Archive is not delete. Preserve source media unless cleanup is explicit. |

## Mixer, Routing And FX

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Mixer Strips | Provides volume, pan, mute, solo, arm, monitor, output and FX access. | Everyday mix balancing and routing checks. | Meters are live readouts, not final loudness proof. |
| Inserts | Shows selected-track FX chain and add/bypass/remove/automation controls. | Track-level sound shaping. | Third-party plugin hosting is future work. |
| Pocket Pro EQ | Provides EQ presets and band controls. | Corrective or tonal EQ. | Check automation/parameter state after presets. |
| Bus And Return Tracks | Adds grouped routing and send-effect returns. | Organizing submixes or shared effects. | Full send/return processing remains guarded; check routing summaries. |
| Folder Tracks | Adds visible timeline organizer tracks that save/reopen, can be renamed, can hold child lanes, collapse or expand, and Mute/Solo their assigned children without processing audio. | Structuring and auditioning larger arrangements before folder-bus routing exists. | Group Mute/Solo is present; audio routing, sends, FX inheritance and export grouping remain future work. |
| Sends | Sets source-track send levels and pre/post-fader mode. | Shared ambience/effects and routing tests. | Verify routing warnings. |
| Drum Kit Lanes | Mixes drum lanes separately, adds lane FX, gates lanes and manages branch rows. | Kit-piece balance/export control. | Branching creates additional tracks; keep manifests clear. |

## Automation

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Track Automation | Creates/edits track volume and pan lanes. | Fades, dynamic rides and spatial movement. | Points are project data; preserve sorted order. |
| Send Automation | Creates/edits send level automation. | Timed effects throws or section ambience. | Confirm target return track. |
| Clip Gain Automation | Creates/edits gain automation tied to a clip. | Local clip rides without track-volume changes. | Useful for vocal/instrument leveling. |
| FX Automation | Creates/edits automation for numeric FX parameters. | Sweeps, EQ moves and parameter motion. | Not every parameter is exposed. |
| Tempo And Meter Maps | Represents project tempo and time-signature changes. | Imported MIDI or adaptive timing tests. | Affects rendering and bar/beat interpretation. |

## Media, Cache And Portability

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Media Pool | Lists imported media, paths, duration, format metadata, runtime/cache status and placement actions. | Confirming imports, reload/relink and audio placement. | Inspect missing/unresolved/cache-only states before claiming portability. |
| Reload / Relink | Reloads known source media or chooses replacement files. | Reopening projects with external references. | Relink changes project references; preserve user intent. |
| Collect Media Plan | Exports a JSON plan for copying external media beside a saved project. | Sharing projects or embedding source project in game packs. | Plan is advisory unless another operation copies files. |
| Build Native Cache | Renders generated/runtime audio into project-cache/native-audio WAV assets. | Reliable native playback/reopen/export smoke. | Check stale, invalidated or fallback diagnostics. |
| Render Cache Summary | Shows freeze, native stem, runtime audio and invalidated cache entries. | Understanding playback/export reuse. | Cache metadata can exist when runtime cache is inactive; confirm diagnostics. |

## Export And Game Packs

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Full WAV | Renders full mix to WAV. | Song previews, masters, smoke tests and interchange. | Unsupported codecs must fail clearly, not produce mislabeled WAVs. |
| Full MIDI | Exports full project MIDI arrangement. | Notation, external DAW, Chordsmith/DJ workflows. | Audio-only clips do not become MIDI. |
| Stem WAV ZIP | Exports one WAV per planned stem plus manifest. | Mixing, game implementation and stem review. | Check stem count and manifest paths. |
| Section Loop ZIP | Exports generated section loops plus manifest. | Game loops and adaptive section testing. | Loop smoke matters before compressed-format claims. |
| Godot Game Pack | Exports WAV-based adaptive pack with source `.pocketdaw`, full mix, stems, loops, manifest, warnings and size summaries. | Bringing rendered DAW audio into Godot without addon edits. | Import smoke belongs in separate Godot worktree. |
| Push Godot Pack | Tries local Godot receiver, then saves ZIP if unavailable. | Faster Godot handoff when receiver is running. | Do not modify Godot addon from DAW work unless asked. |
| Web Game Pack | Exports WAV-based web-game audio pack with manifest and deterministic paths. | Browser/game runtime integration testing. | WAV remains trusted baseline. Browser compressed support varies. |
| Future Codecs | Shows guarded future FLAC, Ogg Vorbis, MP3 and AIFF profile direction. | Planning and validation work. | Do not add `.mpg`; treat MPEG audio requests as `.mp3` after dependency/license review. |
| Export Profile Controls | Sets WAV/stem/loop sample rate, tail, channels, normalization, dither and bit depth. | Preparing export quality or game-pack asset settings before rendering. | These settings are project export metadata. Unsupported codec profiles must still fail clearly. |

## View, Focus And Help

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| Studio Rail | Provides persistent left-side navigation for Library, Project, Clips, Media, Mixer, MIDI, Audio, Export, Godot, Pocket handoff, Diagnostics and Help. | The DAW surface feels busy or a human/AI helper needs to jump to a major work area quickly. | Rail buttons reuse the normal command layer; they focus work areas rather than adding parallel workflows. |
| Music Focus | Shows composition/edit/mix controls and hides game cue/export clutter. | Writing or mixing music. | UI-only view filter. |
| Game Music Focus | Shows game cues/game-pack exports and hides live-recording take tools. | Preparing adaptive music and packs. | WAV game packs remain baseline. |
| Collapsible UI Sections | Minimizes timeline tools, inspector sections, lower dock and media pool. | Reducing visual density. | UI-only; should not affect save/export. |
| Tooltips | Adds hover explanations to buttons and dense controls. | Quick reminders without opening this guide. | Update tooltip map when adding buttons. |
| Function Guide | Opens the in-app summary of functions. | Human or AI needs purpose/use/caution quickly. | Keep this guide and in-app catalog aligned. |
| Button And Action Catalog | Shows command IDs, selectors, shortcuts, what each control does, when to use it and AI notes. | The UI feels busy or an AI helper needs precise control semantics. | This panel mirrors `docs/POCKET_DAW_ACTION_CATALOG.md`; update both from the shared catalog source. |

## Diagnostics, Updates And MCP

| Function | What it does | Use when | AI counterpart notes |
| --- | --- | --- | --- |
| About / Diagnostics | Shows version, runtime, project path, audio, updater, handoff, routing, media, cache and caveats. | Bug reports, smoke tests and exact-runtime checks. | Release truth remains `release-status.json` and `CURRENT_RELEASE_STATUS.md`. |
| Copy / Export Diagnostics | Copies/downloads structured diagnostic data. | Support, bug reports and smoke evidence. | Prefer exported JSON for durable evidence. |
| Check For Updates | Checks updater manifest and downloads/installs verified artifacts. | Installed-app alpha testing. | Do not claim update success until exact artifact/version/hash smoke is recorded. |
| AI / MCP Bridge | Shows MCP command/config snippets and live bridge controls. | AI counterpart should inspect, validate, edit or observe/control the app. | File MCP works with app closed; live MCP needs running app and bearer token. |
| File MCP Recording Input Channel | Stores explicit live-track Mono Ch N or Stereo Ch N-N+1 input assignments through the file-first command path. | Preparing recording smoke or multi-input projects without visual mixer driving. | Native-alpha preflight can still block non-default channel maps until native channel routing lands. |
| File MCP Punch Recording Placement | Places an explicit punch-window clip from an existing raw recording media item through the undoable file-first command path. | Punch/take-lane smoke before a full installed punch recording UI exists. | Metadata/placement foundation only; it does not start native recording or prove user-facing punch recording. |
| Live MCP Recording Input Channel | Stores explicit live-track Mono Ch N or Stereo Ch N-N+1 input assignments in the running app through `pocket_daw_live_apply_commands`. | MCP-observed installed-app smoke when recording setup needs to happen without visual UI driving. | Requires the live bridge token; uses the same undoable command path and native-alpha preflight boundaries as the mixer UI. |
| Live MCP Arm And Monitor | Arms/disarms live audio tracks and toggles monitoring in the running app through `pocket_daw_live_apply_commands`. | MCP-observed recording setup. | Desired-state commands are idempotent; still confirm real input/audio behavior in the installed app. |
| Live MCP Track Input | Sets a live track's visible input device in the running app through `pocket_daw_live_apply_commands`. | MCP-observed recording setup for known hardware inputs. | Device IDs are runtime-specific; confirm via live status and actual installed-app input smoke. |
| Live MCP Track Setup Status | Reports per-track arm, monitor, input device, recording mode, recording input assignment, folder and output routing setup in `pocket_daw_live_status.tracks`. | MCP-observed recording or routing smoke. | Read-only; compare against the visible mixer and still verify actual audio in the installed app. |
| Live MCP Media And Takes | Reports media-pool counts and grouped audio-take state in `pocket_daw_live_status.media`. | MCP-observed audio import or recording smoke. | Read-only; confirms project state, not recorded audio quality. |
| Live MCP Export Readiness | Reports compact Godot/Web export readiness in `pocket_daw_live_status.export`. | MCP-observed installed-app smoke before exporting or importing a game pack. | Read-only; still verify the generated ZIP and manually smoke Godot/Web target import before release claims. |
| Send Feedback | Drafts feedback email with notes and diagnostics when possible. | Tester reports and confusing behavior. | Review diagnostics for privacy before external sharing. |

## Current Non-Claims

- No third-party VST/AU/AAX plugin hosting is claimed.
- No ASIO or low-latency backend is claimed as shipped.
- No simultaneous multitrack recording is claimed as shipped.
- No full elastic audio/autotune/vocal correction is claimed as shipped.
- No FLAC/Ogg/MP3/AIFF export is claimed until encoder dependencies, manifests, UI and target-runtime smoke are proven.
- No `.mpg` audio export should be added; if MPEG audio is requested, treat intent as `.mp3`.
